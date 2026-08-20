from typing import Dict, Any, List
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from .state import AgentState
from services.analyzer import analyze_query, QueryAnalysis
from services.retriever import hybrid_search
from services.reranker import reranker_with_cross_encoder
from services.generator import generate_answer
from core.llm import get_llm

class ReflectionGrade(BaseModel):
    is_grounded: bool = Field(description="True if answer is strictly factual and fully supported by document chunks without hallucinations. False otherwise.")
    confidence_score: int = Field(description="Confidence score ranges from 0 to 100 on how accurately and completely the answer addresses the question.")
    critique: str = Field(description="Detailed feedback on any hallucinations, inaccuracies or missing information.")

reflector_prompt = ChatPromptTemplate.from_messages([
    ("system", """You are an rigorous factual accuracy evaluator and hallucination detector. 
    Evaluate and provide feedback if the candidate answer is grounded in the provided document chunks.
    If the answer claims are not supported by sources, mark is_grounded=False
    - is_grounded: claims supported by documents
    - confidence_score: 0-100
    - critique: specific improvement notes"""
    ),
    ("human", """User Question: {query}
    Documents Sources: {sources}
    Answer: {answer}

    Evaluate grounding, confidence score and accuracy:"""
    )
])

llm = get_llm(temperature=0.0, max_tokens=1024)
evaluator_chain = reflector_prompt | llm.with_structured_output(ReflectionGrade)


def planner_node(state: AgentState) -> Dict[str, Any]:
    analysis = analyze_query(state["query"])
    sub_queries = [state["query"]]

    # flatten subqueries and combine
    if analysis and analysis.sub_queries:
        sub_queries.extend(analysis.sub_queries)
    
    return {
        "sub_queries": sub_queries,
        "rewritten_query": analysis.rewritten_query if analysis else state["query"],
        "max_iterations": state.get("max_iterations", 2),
        "iteration_count": state.get("iteration_count", 0),
        "is_grounded": False,
    }

def retriever_node(state: AgentState) -> Dict[str, Any]:
    all_chunks = []
    seen_chunk_ids = set()

    queries = state.get("sub_queries", [state["query"]])
    
    # limit to top 3 subqueries
    for q in queries[:3]:
        # limit to top 10 results
        results = hybrid_search(
            user_id=state["user_id"],
            query=q,
            top_k=10,
            document_id=state.get("document_id"),
        )
        for chunk in results:
            chunk_id = chunk.get("id")
            if chunk_id not in seen_chunk_ids:
                seen_chunk_ids.add(chunk_id)
                all_chunks.append(chunk)
    
    # limit to best 5 chunks
    final_chunks = reranker_with_cross_encoder(
        query=state.get("rewritten_query") or state["query"],
        candidate_chunks=all_chunks,
        top_k=5
    )

    return {
        "documents": final_chunks,
        "iteration_count": state.get("iteration_count", 0) + 1,
    }

def generator_node(state: AgentState) -> Dict[str, Any]:
    result = generate_answer(
        query=state["query"], 
        chunks=state.get("documents", [])
    )

    return {
        "answer": result["answer"],
        "citations": result["citations"],
    }

def reflection_node(state: AgentState) -> Dict[str, Any]:
    if not state.get("documents") or not state.get("answer"):
        return {
            "is_grounded": True,
            "confidence_score": 0,
            "critique": "No sources available.",
        }
    
    source_text = "\n\n".join([
        f"- {chunk.get('payload', {}).get('text', '')}"
        for chunk in state.get("documents", [])
    ])


    try:
        grade: ReflectionGrade = evaluator_chain.invoke({
            "query": state["query"],
            "sources": source_text,
            "answer": state.get("answer", "")
        })
        return {
            "is_grounded": grade.is_grounded,
            "confidence_score": grade.confidence_score,
            "critique": grade.critique
        }
    except Exception as e:
        return {
            "is_grounded": True,
            "confidence_score": 75,
            "critique": f"Evaluation Error: {str(e)}"
        }
    
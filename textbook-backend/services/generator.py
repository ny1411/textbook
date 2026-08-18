from typing import List, Dict, Tuple, Any
import logging
from langchain_core.prompts import ChatPromptTemplate
from core.llm import get_llm

logger = logging.getLogger(__name__)

# System prompt with strict guidelines
RAG_SYSTEM_PROMPT = """You are Textbook, an advanced AI research assistant.
Your role is to provide accurate, comprehensive, and grounded answers strictly based on the provided sources.

Rules:
1. Answer the question using ONLY the information provided in the context sources. Do not make assumptions or extrapolate beyond the text.
2. If the answer cannot be found in the provided sources, state: "I cannot find the answer to your question in the provided documents."
3. Every factual claim, summary point, or excerpt MUST be followed immediately by its corresponding source citation tag, such as [Source 1] or [Source 2].
4. Format citations clearly in your response (e.g. "According to the documentation, dense embeddings capture semantic meaning [Source 1], while sparse vectors handle exact keyword matches [Source 2].").
5. Maintain a professional, clear, and objective tone.
"""

RAG_USER_PROMPT = """Context Sources:
{context}

Question: {query}

Please provide a detailed, accurate response with inline source citations:"""

rag_prompt = ChatPromptTemplate.from_messages([
    ("system", RAG_SYSTEM_PROMPT),
    ("human", RAG_USER_PROMPT),
])


def order_context_nodes(chunks: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not chunks or len(chunks) <= 2:
        return chunks

    # the lost-in-the-middle issue fix
    n = len(chunks)
    indices = list(range(0, n, 2)) + list(range(n - 1 if n % 2 == 0 else n - 2, 0, -2))

    return [chunks[i] for i in indices]


def format_context_with_citations(chunks: List[Dict[str, Any]]) -> Tuple[str, List[Dict[str, Any]]]:
    citations = []
    context_parts = []

    for i, chunk in enumerate(chunks, start=1):
        # if avail, get payload else use metadata
        payload = chunk.get("payload") if isinstance(chunk.get("payload"), dict) else chunk.get("metadata", {})

        doc_id = payload.get("document_id") or chunk.get("document_id") or "unknown_doc"
        page_num = payload.get("page_number") if payload.get("page_number") is not None else chunk.get("page_number")
        chunk_id = chunk.get("id") or payload.get("chunk_id") or f"chunk_{i}"
        text = payload.get("text") or chunk.get("text") or ""

        # append more data to inject in the LLM context prompt
        page_str = f"Page {page_num}" if page_num is not None else "Page N/A"
        context_parts.append(
            f"[Source {i}] (Document: {doc_id}, {page_str}):\n{text.strip()}"
        )

        # citation metadata to return
        citations.append({
            "source_id": i,
            "document_id": doc_id,
            "page_number": page_num,
            "chunk_id": str(chunk_id),
            "text": text.strip(),
            "rerank_score": chunk.get("rerank_score"),
            "rrf_score": chunk.get("rrf_score"),
        })

    full_context_str = "\n\n".join(context_parts)
    return full_context_str, citations


def generate_answer(
    query: str, 
    chunks: List[Dict[str, Any]], 
    temperature: float = 0.2
) -> Dict[str, Any]:
    if not chunks:
        return {
            "answer": "No relevant documents found to answer your question.",
            "citations": [],
            "query": query,
        }

    # combat lost-in-the-middle effect
    reordered_chunks = order_context_nodes(chunks)

    # format context string and structured citation metadata
    context_str, citations = format_context_with_citations(reordered_chunks)

    # load LLM with lower temperature for factual precision
    llm = get_llm(temperature=temperature, max_tokens=2048)

    # invoke LLM chain
    chain = rag_prompt | llm
    try:
        response = chain.invoke({
            "context": context_str,
            "query": query,
        })
        answer_text = response.content if hasattr(response, "content") else str(response)
    except Exception as e:
        logger.error(f"Error generating answer: {str(e)}")
        answer_text = f"An error occurred while generating the answer: {str(e)}"

    return {
        "answer": answer_text,
        "citations": citations,
        "query": query,
    }

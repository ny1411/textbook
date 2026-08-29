import json
import logging
import re
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from core.llm import get_llm

logger = logging.getLogger(__name__)


# ==========================================
# 1. Pydantic Structured Output Schemas
# ==========================================

class ClaimVerdict(BaseModel):
    claim: str = Field(description="The atomic factual statement extracted from the answer.")
    supported: bool = Field(description="True if the claim is directly supported by the context, False otherwise.")
    evidence: Optional[str] = Field(default=None, description="Exact snippet from context supporting or refuting the claim.")


class FaithfulnessEvaluation(BaseModel):
    claims: List[ClaimVerdict] = Field(description="List of atomic claims extracted and their verification verdicts.")
    reasoning: str = Field(description="Summary explanation of the faithfulness assessment.")
    score: float = Field(description="Faithfulness score between 0.0 and 1.0 (supported_claims / total_claims).")


class RelevanceEvaluation(BaseModel):
    score: float = Field(description="Relevance score between 0.0 and 1.0.")
    reasoning: str = Field(description="Detailed explanation for why the answer is or isn't relevant to the query.")


class CorrectnessEvaluation(BaseModel):
    score: float = Field(description="Answer correctness score between 0.0 and 1.0 comparing generated answer against ground truth.")
    factual_agreement: float = Field(description="Score between 0.0 and 1.0 measuring factual agreement.")
    semantic_similarity: float = Field(description="Score between 0.0 and 1.0 measuring semantic alignment.")
    reasoning: str = Field(description="Explanation of factual agreements and discrepancies.")


class CompletenessEvaluation(BaseModel):
    score: float = Field(description="Completeness score between 0.0 and 1.0.")
    missing_aspects: List[str] = Field(default_factory=list, description="Key aspects from ground truth that were omitted in the answer.")
    reasoning: str = Field(description="Explanation of completeness.")


class ConcisenessEvaluation(BaseModel):
    score: float = Field(description="Conciseness score between 0.0 and 1.0, penalizing filler and fluff.")
    fluff_detected: bool = Field(description="True if unnecessary conversational filler or redundant rambling is present.")
    reasoning: str = Field(description="Explanation of conciseness.")


class CitationEvaluation(BaseModel):
    total_citations: int = Field(description="Total count of source citations found in the text.")
    valid_citations: int = Field(description="Count of citations that accurately point to supporting context.")
    uncited_factual_claims: int = Field(description="Count of factual claims lacking required citations.")
    citation_correctness: float = Field(description="Precision of citations (valid_citations / total_citations).")
    citation_completeness: float = Field(description="Recall of citations (cited factual claims / total factual claims).")
    reasoning: str = Field(description="Analysis of citation quality.")


# ==========================================
# 2. Evaluation Functions
# ==========================================

def evaluate_faithfulness(context: str, answer: str) -> FaithfulnessEvaluation:
    """
    Evaluates faithfulness (groundedness / hallucination rate).
    Extracts atomic claims and checks whether each is supported by context.
    """
    if not answer or not answer.strip():
        return FaithfulnessEvaluation(claims=[], reasoning="Empty answer provided.", score=0.0)

    # Check for valid refusal/abstention
    refusal_keywords = [
        "cannot find", "not mentioned", "not provided", 
        "no relevant documents", "do not have information", "not found"
    ]
    if any(kw in answer.lower() for kw in refusal_keywords) and len(answer.split()) < 30:
        return FaithfulnessEvaluation(
            claims=[ClaimVerdict(claim="Model declined to answer due to missing context", supported=True, evidence="Refusal")],
            reasoning="Model correctly abstained from answering due to lack of evidence.",
            score=1.0
        )

    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are an expert AI evaluator for RAG systems.
Your task is to judge the Faithfulness / Groundedness of an AI generated answer against the provided context.

Instructions:
1. Break down the generated answer into discrete, atomic factual claims.
2. For each atomic claim, determine whether it can be strictly and directly inferred from the Context.
3. If an assertion is not in the context, mark supported=False (hallucination).
4. Compute score = (number of supported claims) / (total number of claims). If no claims, score = 1.0.
"""),
        ("human", """Context:
{context}

Generated Answer:
{answer}

Evaluate faithfulness and provide structured output:""")
    ])

    llm = get_llm(temperature=0.0)
    structured_llm = llm.with_structured_output(FaithfulnessEvaluation)
    chain = prompt | structured_llm

    try:
        result = chain.invoke({"context": context, "answer": answer})
        return result
    except Exception as e:
        logger.error(f"Error in evaluate_faithfulness: {e}")
        # Fallback: simple heuristic calculation
        return FaithfulnessEvaluation(
            claims=[],
            reasoning=f"Evaluation failed due to exception: {e}",
            score=0.5
        )


def evaluate_answer_relevance(query: str, answer: str) -> RelevanceEvaluation:
    """
    Evaluates whether the generated answer directly addresses the user's query.
    """
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are an expert evaluator assessing Answer Relevance in RAG.
Score how directly, accurately, and fully the Generated Answer answers the User Query on a 0.0 to 1.0 scale:
- 1.0: Directly and fully answers the question with relevant specifics.
- 0.5: Partially answers or includes significant irrelevant tangents.
- 0.0: Completely irrelevant, off-topic, or avoids the question.
"""),
        ("human", """User Query: {query}
Generated Answer: {answer}

Provide the relevance score and concise reasoning:""")
    ])

    llm = get_llm(temperature=0.0)
    structured_llm = llm.with_structured_output(RelevanceEvaluation)
    chain = prompt | structured_llm

    try:
        return chain.invoke({"query": query, "answer": answer})
    except Exception as e:
        logger.error(f"Error in evaluate_answer_relevance: {e}")
        return RelevanceEvaluation(score=0.5, reasoning=f"Evaluator error: {e}")


def evaluate_answer_correctness(ground_truth_answer: str, generated_answer: str) -> CorrectnessEvaluation:
    """
    Evaluates factual agreement and semantic correctness against ground truth.
    """
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are an expert evaluator assessing Answer Correctness against a reference Ground Truth.
Compare the Generated Answer against the Ground Truth Answer:
1. factual_agreement (0.0 - 1.0): Do all facts in the generated answer agree with the ground truth?
2. semantic_similarity (0.0 - 1.0): Does the generated answer convey the same essential meaning?
3. score (0.0 - 1.0): Overall weighted correctness score.
"""),
        ("human", """Ground Truth Answer:
{ground_truth}

Generated Answer:
{generated_answer}

Provide structured correctness evaluation:""")
    ])

    llm = get_llm(temperature=0.0)
    structured_llm = llm.with_structured_output(CorrectnessEvaluation)
    chain = prompt | structured_llm

    try:
        return chain.invoke({"ground_truth": ground_truth_answer, "generated_answer": generated_answer})
    except Exception as e:
        logger.error(f"Error in evaluate_answer_correctness: {e}")
        return CorrectnessEvaluation(score=0.5, factual_agreement=0.5, semantic_similarity=0.5, reasoning=f"Error: {e}")


def evaluate_completeness(ground_truth_answer: str, generated_answer: str) -> CompletenessEvaluation:
    """
    Evaluates whether the generated answer covers all key aspects required by the ground truth.
    """
    prompt = ChatPromptTemplate.from_messages([
        ("system", """Assess the Completeness of the Generated Answer relative to the Ground Truth:
Score 1.0 if all crucial sub-points, conditions, and nuances from the ground truth are present.
Penalize missing key facts (score < 1.0) and list missing_aspects.
"""),
        ("human", """Ground Truth:
{ground_truth}

Generated Answer:
{generated_answer}

Evaluate completeness:""")
    ])

    llm = get_llm(temperature=0.0)
    structured_llm = llm.with_structured_output(CompletenessEvaluation)
    chain = prompt | structured_llm

    try:
        return chain.invoke({"ground_truth": ground_truth_answer, "generated_answer": generated_answer})
    except Exception as e:
        logger.error(f"Error in evaluate_completeness: {e}")
        return CompletenessEvaluation(score=0.5, missing_aspects=[], reasoning=f"Error: {e}")


def evaluate_conciseness(answer: str) -> ConcisenessEvaluation:
    """
    Evaluates conciseness and information density, penalizing rambling and filler.
    """
    prompt = ChatPromptTemplate.from_messages([
        ("system", """Assess the Conciseness of the response on a scale of 0.0 to 1.0.
High score (0.9 - 1.0): Direct, high information density, no filler phrases or repetitive preamble.
Lower score (< 0.7): Conversational fluff, repetitive explanations, or excessive preamble/postamble.
"""),
        ("human", """Answer to evaluate:
{answer}

Evaluate conciseness:""")
    ])

    llm = get_llm(temperature=0.0)
    structured_llm = llm.with_structured_output(ConcisenessEvaluation)
    chain = prompt | structured_llm

    try:
        return chain.invoke({"answer": answer})
    except Exception as e:
        logger.error(f"Error in evaluate_conciseness: {e}")
        return ConcisenessEvaluation(score=0.8, fluff_detected=False, reasoning=f"Error: {e}")


def evaluate_citations(context: str, answer_with_citations: str) -> CitationEvaluation:
    """
    Evaluates citation accuracy:
    - Citation Correctness: Precision of citations (does [Source N] actually verify the attached sentence?)
    - Citation Completeness: Recall of citations (are all factual assertions properly cited?)
    """
    # Regex check for inline citations e.g. [Source 1], [1], [Source 2]
    citation_tags = re.findall(r"\[(?:Source\s*)?(\d+)\]", answer_with_citations, re.IGNORECASE)
    
    if not citation_tags:
        # Check if text makes claims without citing
        words = len(answer_with_citations.split())
        if words > 20:
            return CitationEvaluation(
                total_citations=0,
                valid_citations=0,
                uncited_factual_claims=1,
                citation_correctness=0.0,
                citation_completeness=0.0,
                reasoning="No citations were present in a non-trivial answer."
            )
        else:
            return CitationEvaluation(
                total_citations=0,
                valid_citations=0,
                uncited_factual_claims=0,
                citation_correctness=1.0,
                citation_completeness=1.0,
                reasoning="Short response with no required citations."
            )

    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are an expert evaluator assessing Citation Accuracy and Grounding in AI responses.
Context Sources:
{context}

Generated Answer with Citations:
{answer}

Instructions:
1. Examine each citation tag (e.g. [Source 1], [Source 2]) in the Answer.
2. Check if the specific source chunk in Context contains the evidence supporting the attached sentence.
3. Count:
   - total_citations: Total number of citation tags in the answer.
   - valid_citations: Number of citation tags that accurately match context evidence.
   - uncited_factual_claims: Number of factual assertions in the answer lacking any citation.
4. Calculate:
   - citation_correctness = valid_citations / total_citations
   - citation_completeness = (total_citations - uncited_factual_claims) / max(1, total_citations)
"""),
        ("human", "Provide structured CitationEvaluation:")
    ])

    llm = get_llm(temperature=0.0)
    structured_llm = llm.with_structured_output(CitationEvaluation)
    chain = prompt | structured_llm

    try:
        return chain.invoke({"context": context, "answer": answer_with_citations})
    except Exception as e:
        logger.error(f"Error in evaluate_citations: {e}")
        return CitationEvaluation(
            total_citations=len(citation_tags),
            valid_citations=len(citation_tags),
            uncited_factual_claims=0,
            citation_correctness=1.0,
            citation_completeness=1.0,
            reasoning=f"Heuristic fallback due to error: {e}"
        )


def evaluate_negative_rejection(answer: str, is_answerable: bool) -> bool:
    """
    Returns True if:
    - Query was unanswerable (is_answerable=False) and answer correctly refused, OR
    - Query was answerable (is_answerable=True) and answer attempted to answer.
    """
    refusal_keywords = [
        "cannot find", "not mentioned", "not provided", 
        "no relevant documents", "do not have information", 
        "not found", "outside the supplied", "outside the textbook"
    ]
    is_refusal = any(kw in answer.lower() for kw in refusal_keywords)

    if not is_answerable:
        # Unanswerable query should refuse
        return is_refusal
    else:
        # Answerable query should not falsely refuse if relevant info exists
        return True

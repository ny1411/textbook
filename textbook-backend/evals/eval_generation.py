import json
import logging
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional

# Ensure backend root is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from services.generator import generate_answer
from services.retriever import hybrid_search, reciprocal_rank_fusion
from services.reranker import reranker_with_cross_encoder
from services.embedder import get_vectors
from db.qdrant import client
from evals.metrics.generation import (
    evaluate_faithfulness,
    evaluate_answer_relevance,
    evaluate_answer_correctness,
    evaluate_completeness,
    evaluate_conciseness,
    evaluate_citations,
    evaluate_negative_rejection,
)

logger = logging.getLogger(__name__)
DATASET_PATH = Path(__file__).resolve().parent / "datasets" / "golden_qa.json"
COLLECTION_NAME = "textbook_chunks"


def _extract_chunk_payload(point: Any) -> Dict[str, Any]:
    """Helper to ensure chunk dictionary structure with payload text."""
    if isinstance(point, dict):
        return point
    payload = getattr(point, "payload", {}) or {}
    return {
        "id": str(getattr(point, "id", "")),
        "payload": payload,
        "text": payload.get("text", "") or payload.get("page_content", ""),
        "document_id": payload.get("document_id", ""),
        "page_number": payload.get("page_number", 0),
    }


def retrieve_chunks_for_eval(query: str, top_k: int = 5, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieves top-k candidate chunks using Hybrid + Reranker pipeline."""
    dense_vec, sparse_vec = get_vectors(query, is_query=True)

    query_filter = None
    if user_id:
        from qdrant_client import models
        query_filter = models.Filter(
            must=[models.FieldCondition(key="user_id", match=models.MatchValue(value=str(user_id)))]
        )

    dense_res = client.query_points(
        collection_name=COLLECTION_NAME,
        query=dense_vec,
        using="dense-text",
        query_filter=query_filter,
        limit=top_k * 4,
        with_payload=True,
    )
    sparse_res = client.query_points(
        collection_name=COLLECTION_NAME,
        query=sparse_vec,
        using="sparse-text",
        query_filter=query_filter,
        limit=top_k * 4,
        with_payload=True,
    )

    fused = reciprocal_rank_fusion(
        dense_results=dense_res.points,
        sparse_results=sparse_res.points,
        k=60,
    )
    reranked = reranker_with_cross_encoder(query=query, candidate_chunks=fused, top_k=top_k)
    return [_extract_chunk_payload(p) for p in reranked[:top_k]]


def evaluate_generation(
    dataset_path: Optional[Path] = None,
    user_id: Optional[str] = None,
    sample_limit: Optional[int] = None
) -> Dict[str, Any]:
    """
    Runs end-to-end generation on the evaluation dataset and judges:
    - Faithfulness (Anti-Hallucination)
    - Answer Relevance
    - Answer Correctness
    - Completeness
    - Conciseness
    - Citation Accuracy & Completeness
    - Negative Query Rejection Accuracy
    """
    path = dataset_path or DATASET_PATH
    with open(path, "r", encoding="utf-8") as f:
        samples = json.load(f)

    if sample_limit:
        samples = samples[:sample_limit]

    faithfulness_scores = []
    relevance_scores = []
    correctness_scores = []
    completeness_scores = []
    conciseness_scores = []
    citation_acc_scores = []
    citation_comp_scores = []
    rejection_verdicts = []
    detailed_results = []

    for i, sample in enumerate(samples, start=1):
        query = sample["query"]
        ground_truth_answer = sample.get("ground_truth_answer", "")
        is_answerable = sample.get("is_answerable", True)

        logger.info(f"[{i}/{len(samples)}] Evaluating generation for query: {query[:60]}...")

        # 1. Retrieve chunks
        try:
            chunks = retrieve_chunks_for_eval(query, top_k=5, user_id=user_id)
        except Exception as e:
            logger.error(f"Retrieval error for query '{query}': {e}")
            chunks = []

        # 2. Generate answer
        try:
            gen_result = generate_answer(query=query, chunks=chunks)
            answer = gen_result.get("answer", "")
        except Exception as e:
            logger.error(f"Generation error for query '{query}': {e}")
            answer = f"Error generating answer: {e}"

        # Build context string for judges
        context_str = "\n\n".join([
            f"[Source {idx+1}]: {c.get('payload', {}).get('text', '') or c.get('text', '')}"
            for idx, c in enumerate(chunks)
        ])

        # 3. Compute LLM-as-a-Judge metrics
        faith_eval = evaluate_faithfulness(context=context_str, answer=answer)
        rel_eval = evaluate_answer_relevance(query=query, answer=answer)
        corr_eval = evaluate_answer_correctness(ground_truth_answer=ground_truth_answer, generated_answer=answer)
        comp_eval = evaluate_completeness(ground_truth_answer=ground_truth_answer, generated_answer=answer)
        conc_eval = evaluate_conciseness(answer=answer)
        cite_eval = evaluate_citations(context=context_str, answer_with_citations=answer)
        rejection_passed = evaluate_negative_rejection(answer=answer, is_answerable=is_answerable)

        faithfulness_scores.append(faith_eval.score)
        relevance_scores.append(rel_eval.score)
        correctness_scores.append(corr_eval.score)
        completeness_scores.append(comp_eval.score)
        conciseness_scores.append(conc_eval.score)
        citation_acc_scores.append(cite_eval.citation_correctness)
        citation_comp_scores.append(cite_eval.citation_completeness)
        rejection_verdicts.append(1.0 if rejection_passed else 0.0)

        detailed_results.append({
            "id": sample.get("id", f"sample_{i}"),
            "query": query,
            "is_answerable": is_answerable,
            "generated_answer": answer,
            "ground_truth_answer": ground_truth_answer,
            "faithfulness": faith_eval.score,
            "relevance": rel_eval.score,
            "correctness": corr_eval.score,
            "completeness": comp_eval.score,
            "conciseness": conc_eval.score,
            "citation_correctness": cite_eval.citation_correctness,
            "citation_completeness": cite_eval.citation_completeness,
            "rejection_passed": rejection_passed,
        })

    n = len(samples)
    return {
        "Mean_Faithfulness": sum(faithfulness_scores) / n if n else 0.0,
        "Mean_Answer_Relevance": sum(relevance_scores) / n if n else 0.0,
        "Mean_Answer_Correctness": sum(correctness_scores) / n if n else 0.0,
        "Mean_Completeness": sum(completeness_scores) / n if n else 0.0,
        "Mean_Conciseness": sum(conciseness_scores) / n if n else 0.0,
        "Mean_Citation_Accuracy": sum(citation_acc_scores) / n if n else 0.0,
        "Mean_Citation_Completeness": sum(citation_comp_scores) / n if n else 0.0,
        "Rejection_Accuracy": sum(rejection_verdicts) / n if n else 0.0,
        "Detailed_Sample_Results": detailed_results,
    }


if __name__ == "__main__":
    print("--- Running Generation & Citations Evaluation Benchmark ---")
    scorecard = evaluate_generation(sample_limit=5)
    summary = {k: v for k, v in scorecard.items() if k != "Detailed_Sample_Results"}
    print(json.dumps(summary, indent=2))


import json
import logging
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional

# Ensure backend root is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from db.qdrant import client
from services.embedder import get_vectors
from services.retriever import reciprocal_rank_fusion
from services.reranker import reranker_with_cross_encoder
from evals.metrics.retrieval import (
    recall_k,
    precision_k,
    hitrate_k,
    mrr_k,
    ndcg_k,
    map_k,
    r_precision,
)

logger = logging.getLogger(__name__)
DATASET_PATH = Path(__file__).resolve().parent / "datasets" / "golden_qa.json"
COLLECTION_NAME = "textbook_chunks"


def _extract_chunk_text(point: Any) -> str:
    """Extracts text from a Qdrant point or result dict."""
    if isinstance(point, dict):
        payload = point.get("payload", {})
        return payload.get("text", "") or payload.get("page_content", "") or str(point)
    if hasattr(point, "payload") and point.payload:
        return point.payload.get("text", "") or point.payload.get("page_content", "")
    return str(point)


def search_dense(query: str, top_k: int = 5, user_id: Optional[str] = None) -> List[str]:
    """Retrieves chunks using Dense Vector search only."""
    dense_vec, _ = get_vectors(query, is_query=True)
    
    query_filter = None
    if user_id:
        from qdrant_client import models
        query_filter = models.Filter(
            must=[models.FieldCondition(key="user_id", match=models.MatchValue(value=str(user_id)))]
        )

    res = client.query_points(
        collection_name=COLLECTION_NAME,
        query=dense_vec,
        using="dense-text",
        query_filter=query_filter,
        limit=top_k,
        with_payload=True,
    )
    return [_extract_chunk_text(p) for p in res.points]


def search_sparse(query: str, top_k: int = 5, user_id: Optional[str] = None) -> List[str]:
    """Retrieves chunks using Sparse BM25 search only."""
    _, sparse_vec = get_vectors(query, is_query=True)

    query_filter = None
    if user_id:
        from qdrant_client import models
        query_filter = models.Filter(
            must=[models.FieldCondition(key="user_id", match=models.MatchValue(value=str(user_id)))]
        )

    res = client.query_points(
        collection_name=COLLECTION_NAME,
        query=sparse_vec,
        using="sparse-text",
        query_filter=query_filter,
        limit=top_k,
        with_payload=True,
    )
    return [_extract_chunk_text(p) for p in res.points]


def search_hybrid(query: str, top_k: int = 5, user_id: Optional[str] = None) -> List[str]:
    """Retrieves chunks using Hybrid Search with Reciprocal Rank Fusion (RRF)."""
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
        limit=top_k * 2,
        with_payload=True,
    )
    sparse_res = client.query_points(
        collection_name=COLLECTION_NAME,
        query=sparse_vec,
        using="sparse-text",
        query_filter=query_filter,
        limit=top_k * 2,
        with_payload=True,
    )

    fused = reciprocal_rank_fusion(
        dense_results=dense_res.points,
        sparse_results=sparse_res.points,
        k=60,
    )
    return [_extract_chunk_text(p) for p in fused[:top_k]]


def search_hybrid_rerank(query: str, top_k: int = 5, user_id: Optional[str] = None) -> List[str]:
    """Retrieves chunks using Hybrid Search followed by Cross-Encoder Reranking."""
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
    return [_extract_chunk_text(p) for p in reranked[:top_k]]


def evaluate_retrieval(
    dataset_path: Optional[Path] = None,
    user_id: Optional[str] = None,
    top_k: int = 5
) -> Dict[str, Dict[str, float]]:
    """
    Evaluates all retrieval strategies across the golden QA dataset.
    Returns scorecard containing Recall, Precision, MRR, HitRate, NDCG, MAP, and R-Precision.
    """
    path = dataset_path or DATASET_PATH
    with open(path, "r", encoding="utf-8") as f:
        samples = json.load(f)

    # Filter out unanswerable/negative test cases that have no ground truth context
    eval_samples = [
        s for s in samples 
        if s.get("is_answerable", True) and s.get("ground_truth_contexts")
    ]

    if not eval_samples:
        logger.warning("No answerable samples with ground_truth_contexts found for retrieval evaluation.")
        return {}

    strategies = {
        "Dense Only": search_dense,
        "Sparse (BM25)": search_sparse,
        "Hybrid (RRF)": search_hybrid,
        "Hybrid + Reranker": search_hybrid_rerank,
    }

    results: Dict[str, Dict[str, float]] = {}

    for strat_name, search_fn in strategies.items():
        recalls_1 = []
        recalls_3 = []
        recalls_5 = []
        precisions_5 = []
        mrr_scores = []
        hitrate_scores = []
        ndcg_scores = []
        map_scores = []
        r_prec_scores = []

        for sample in eval_samples:
            query = sample["query"]
            ground_truth_contexts = sample["ground_truth_contexts"]

            try:
                retrieved_chunks = search_fn(query, top_k=max(5, top_k), user_id=user_id)
            except Exception as e:
                logger.error(f"Error during {strat_name} search for query '{query}': {e}")
                retrieved_chunks = []

            recalls_1.append(recall_k(ground_truth_contexts, retrieved_chunks, k=1))
            recalls_3.append(recall_k(ground_truth_contexts, retrieved_chunks, k=3))
            recalls_5.append(recall_k(ground_truth_contexts, retrieved_chunks, k=5))
            precisions_5.append(precision_k(ground_truth_contexts, retrieved_chunks, k=5))
            mrr_scores.append(mrr_k(ground_truth_contexts, retrieved_chunks, k=5))
            hitrate_scores.append(hitrate_k(ground_truth_contexts, retrieved_chunks, k=5))
            ndcg_scores.append(ndcg_k(ground_truth_contexts, retrieved_chunks, k=5))
            map_scores.append(map_k(ground_truth_contexts, retrieved_chunks, k=5))
            r_prec_scores.append(r_precision(ground_truth_contexts, retrieved_chunks))

        n = len(eval_samples)
        results[strat_name] = {
            "Recall@1": sum(recalls_1) / n if n else 0.0,
            "Recall@3": sum(recalls_3) / n if n else 0.0,
            "Recall@5": sum(recalls_5) / n if n else 0.0,
            "Precision@5": sum(precisions_5) / n if n else 0.0,
            "MRR@5": sum(mrr_scores) / n if n else 0.0,
            "HitRate@5": sum(hitrate_scores) / n if n else 0.0,
            "NDCG@5": sum(ndcg_scores) / n if n else 0.0,
            "MAP@5": sum(map_scores) / n if n else 0.0,
            "R-Precision": sum(r_prec_scores) / n if n else 0.0,
        }

    return results


if __name__ == "__main__":
    print("--- Running Retrieval Evaluation Benchmark ---")
    scorecard = evaluate_retrieval()
    print(json.dumps(scorecard, indent=2))


import math
from typing import Any, List, Sequence


def _extract_text(chunk: Any) -> str:
    """extracts text content from string, document object, or dict."""

    if isinstance(chunk, str):
        return chunk

    if hasattr(chunk, "page_content"):
        return str(chunk.page_content)

    if hasattr(chunk, "text"):
        return str(chunk.text)

    if isinstance(chunk, dict):
        return chunk.get("page_content") or chunk.get("text") or chunk.get("content") or str(chunk)

    return str(chunk)


def _is_relevant(chunk: Any, ground_truths: Sequence[Any]) -> bool:
    """chunk matches any of the ground truth strings or id"""
    if not ground_truths:
        return False
    if chunk in ground_truths:
        return True
    text = _extract_text(chunk).lower()
    for gt in ground_truths:
        gt_str = _extract_text(gt).strip().lower()
        if gt_str and (gt_str in text or text in gt_str):
            return True
    return False


def get_relevance_vector(retrieved_chunks: Sequence[Any], ground_truths: Sequence[Any]) -> List[int]:
    """binary relevance vector [r_1, r_2, ..., r_k]"""

    if not ground_truths or not retrieved_chunks:
        return [0] * len(retrieved_chunks)

    return [1 if _is_relevant(chunk, ground_truths) else 0 for chunk in retrieved_chunks]


def recall_k(relevant_documents: Sequence[Any], retrieved_documents: Sequence[Any], k: int = 5) -> float:
    """(Number of ground truth contexts matched in top-K) / (Total ground truth contexts)"""
    if not relevant_documents:
        return 0.0

    top_k = retrieved_documents[:k]
    if not top_k:
        return 0.0

    matched_ground_truths = 0
    for gt in relevant_documents:
        gt_str = _extract_text(gt).strip().lower()
        matched = False
        for chunk in top_k:
            if chunk == gt or (gt_str and gt_str in _extract_text(chunk).lower()):
                matched = True
                break
        if matched:
            matched_ground_truths += 1

    return matched_ground_truths / len(relevant_documents)


def precision_k(relevant_documents: Sequence[Any], retrieved_documents: Sequence[Any], k: int = 5) -> float:
    """(Number of relevant chunks in top-K) / K"""

    if not relevant_documents or k <= 0:
        return 0.0

    top_k = retrieved_documents[:k]
    if not top_k:
        return 0.0

    rel_vec = [1 if _is_relevant(c, relevant_documents) else 0 for c in top_k]
    return sum(rel_vec) / k


def hitrate_k(relevant_documents: Sequence[Any], retrieved_documents: Sequence[Any], k: int = 5) -> float:
    """1.0 if at least one relevant document appears in top-K, else 0.0"""

    if not relevant_documents or not retrieved_documents or k <= 0:
        return 0.0

    top_k = retrieved_documents[:k]
    for chunk in top_k:
        if _is_relevant(chunk, relevant_documents):
            return 1.0

    return 0.0


def mrr_k(relevant_documents: Sequence[Any], retrieved_documents: Sequence[Any], k: int = 5) -> float:
    """1 / rank of the first relevant document in top-K, else 0.0"""
    if not relevant_documents or not retrieved_documents or k <= 0:
        return 0.0

    top_k = retrieved_documents[:k]
    for rank, chunk in enumerate(top_k, start=1):
        if _is_relevant(chunk, relevant_documents):
            return 1.0 / rank

    return 0.0


def ndcg_k(relevant_documents: Sequence[Any], retrieved_documents: Sequence[Any], k: int = 5) -> float:
    """NDCG@K = DCG@K / IDCG@K"""

    if not relevant_documents or not retrieved_documents or k <= 0:
        return 0.0

    top_k = retrieved_documents[:k]
    rel_vec = [1 if _is_relevant(c, relevant_documents) else 0 for c in top_k]

    dcg = sum(r / math.log2(i + 2) for i, r in enumerate(rel_vec))

    # perfect ranking where all relevant items come first up to min(k, |G|)
    ideal_hits = min(k, len(relevant_documents))
    idcg = sum(1.0 / math.log2(i + 2) for i in range(ideal_hits))

    if idcg == 0.0:
        return 0.0

    return dcg / idcg


def map_k(relevant_documents: Sequence[Any], retrieved_documents: Sequence[Any], k: int = 5) -> float:
    """calculate running precision at each rank where a relevant item is found."""

    if not relevant_documents or not retrieved_documents or k <= 0:
        return 0.0

    top_k = retrieved_documents[:k]
    rel_vec = [1 if _is_relevant(c, relevant_documents) else 0 for c in top_k]

    if sum(rel_vec) == 0:
        return 0.0

    running_hits = 0
    precision_sum = 0.0
    for i, r in enumerate(rel_vec, start=1):
        if r == 1:
            running_hits += 1
            precision_sum += running_hits / i

    return precision_sum / min(k, len(relevant_documents))


def r_precision(relevant_documents: Sequence[Any], retrieved_documents: Sequence[Any]) -> float:
    """check precision at rank R, R = len(relevant_documents)"""
    
    if not relevant_documents or not retrieved_documents:
        return 0.0

    r = len(relevant_documents)

    return precision_k(relevant_documents, retrieved_documents, k=r)


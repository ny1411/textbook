from functools import lru_cache
from langchain_community.cross_encoders import HuggingFaceCrossEncoder
from typing import List, Dict, Any
import logging
import math
from services.relevance import normalize_relevance

logger = logging.getLogger(__name__)

@lru_cache(maxsize=1)
def get_cross_encoder(model_name: str = "BAAI/bge-reranker-base") -> HuggingFaceCrossEncoder:
    cross_encoder_model = HuggingFaceCrossEncoder(
        model_name=model_name,
        model_kwargs={"device": "cpu"}      # 'cuda' if available
    )

    return cross_encoder_model

def reranker_with_cross_encoder(
    query: str,
    candidate_chunks: List[Dict[str, Any]],
    top_k: int = 5
) -> List[Dict[str, Any]]:
    if not candidate_chunks:
        return []

    reranker = get_cross_encoder()

    # build (query, text) pairs
    pairs = [
        [query, chunk.get("payload", {}).get("text", "")]
        for chunk in candidate_chunks
    ]

    # compute reranking scores
    scores = reranker.score(pairs)

    # attach scores to items
    scored_candidates = []
    for chunk, score in zip(candidate_chunks, scores):
        logit = float(score)
        if not math.isfinite(logit):
            logger.warning("Discarding candidate with a non-finite cross-encoder score")
            continue
        chunk_copy = dict(chunk)
        chunk_copy["rerank_logit"] = logit
        chunk_copy["rerank_score"] = normalize_relevance(logit)

        scored_candidates.append(chunk_copy)
    
    # sort in descending order
    # Sort logits so sigmoid saturation cannot change the ranking.
    scored_candidates.sort(key=lambda x: x["rerank_logit"], reverse=True)

    return scored_candidates[:top_k]

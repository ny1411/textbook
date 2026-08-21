from functools import lru_cache
from langchain_community.cross_encoders import HuggingFaceCrossEncoder
from typing import List, Dict, Any

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

    # build (query, text) pairs safely from payload, metadata, or top-level text
    pairs = []
    for chunk in candidate_chunks:
        payload = chunk.get("payload") if isinstance(chunk.get("payload"), dict) else chunk.get("metadata", {})
        text = (payload.get("text") if isinstance(payload, dict) else None) or chunk.get("text") or ""
        pairs.append([query, text])

    # compute reranking scores
    scores = reranker.score(pairs)

    # attach scores to items
    scored_candidates = []
    for chunk, score in zip(candidate_chunks, scores):
        chunk_copy = dict(chunk)
        chunk_copy["rerank_score"] = float(score) 

        scored_candidates.append(chunk_copy)
    
    # sort in descending order
    scored_candidates.sort(key=lambda x: x["rerank_score"], reverse=True)

    return scored_candidates[:top_k]
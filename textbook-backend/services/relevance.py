"""Normalized relevance for display, with raw logits retained for chat policy."""
import math
import os


def normalize_relevance(logit: float) -> float:
    """Stable sigmoid; the result is a relevance score, not a probability."""
    if not math.isfinite(logit):
        raise ValueError("Cross-encoder logits must be finite")
    if logit >= 0:
        return 1.0 / (1.0 + math.exp(-logit))
    exp_logit = math.exp(logit)
    return exp_logit / (1.0 + exp_logit)


def relevant_chunks(chunks):
    # Keep CHAT_MIN_RERANK_SCORE in its existing raw-logit units.
    threshold = float(os.getenv("CHAT_MIN_RERANK_SCORE", "0.0"))
    normalized_threshold = normalize_relevance(threshold)
    relevant = []
    for chunk in chunks:
        logit = chunk.get("rerank_logit")
        if logit is not None:
            accepted = math.isfinite(logit) and logit >= threshold
        else:
            score = chunk.get("rerank_score")
            accepted = (
                isinstance(score, (int, float)) and math.isfinite(score)
                and 0 <= score <= 1 and score >= normalized_threshold
            )
        if accepted:
            relevant.append(chunk)
    return relevant

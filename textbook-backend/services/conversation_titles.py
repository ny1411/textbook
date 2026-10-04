"""Cheap, deterministic titles for the first completed turn (no extra LLM call)."""
def conversation_title(query: str) -> str:
    text = " ".join(query.split())
    return text[:77] + "…" if len(text) > 80 else text or "New chat"

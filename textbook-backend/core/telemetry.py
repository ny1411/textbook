import os
import logging
from typing import Optional, List, Dict, Any
from langfuse.langchain import CallbackHandler
from langfuse import observe

logger = logging.getLogger(__name__)

def is_langfuse_configured() -> bool:
    """Check if the required Langfuse environment variables are set."""
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY")
    return bool(public_key and secret_key)


def get_langfuse_callback() -> Optional[CallbackHandler]:
    """
    Returns an instance of Langfuse's CallbackHandler for LangChain and LangGraph.
    Langfuse reads LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_HOST / LANGFUSE_BASE_URL.
    """
    if not is_langfuse_configured():
        logger.debug("Langfuse API keys are not configured. Running without remote telemetry.")
    return CallbackHandler()


def create_langfuse_config(
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    trace_name: Optional[str] = None,
    tags: Optional[List[str]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Generates a standard LangChain/LangGraph config dict with Langfuse callback,
    session tracking, user ID, trace name, tags, and custom metadata attributes.
    """
    handler = get_langfuse_callback()
    callbacks = [handler] if handler is not None else []
    
    meta = metadata.copy() if metadata else {}
    if user_id:
        meta["langfuse_user_id"] = user_id
    if session_id:
        meta["langfuse_session_id"] = session_id
    if trace_name:
        meta["langfuse_trace_name"] = trace_name
        
    config: Dict[str, Any] = {
        "callbacks": callbacks,
        "metadata": meta,
        "tags": tags or [],
    }
    if trace_name:
        config["run_name"] = trace_name
        
    return config


__all__ = [
    "is_langfuse_configured",
    "get_langfuse_callback",
    "create_langfuse_config",
    "observe",
]
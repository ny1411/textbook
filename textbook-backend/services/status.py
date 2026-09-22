import time
import logging
from typing import Optional, Dict, Any
from services.caching import redis

logger = logging.getLogger(__name__)

STATUS_PROCESSING = "processing"
STATUS_READY = "ready"
STATUS_FAILED = "failed"

def set_document_status(
    document_id: str,
    user_id: str,
    status: str,
    filename: Optional[str] = None,
    error: Optional[str] = None,
) -> None:
    if not redis:
        return

    doc_key = f"doc:status:{document_id}"
    user_set_key = f"user:{user_id}:processing_docs"

    data = {
        "document_id": document_id,
        "user_id": user_id,
        "status": status,
        "updated_at": str(time.time()),
    }

    if filename:
        data["filename"] = filename
    if error:
        data["error"] = error
    
    try:
        # expire document state after 2 hours
        redis.hset(doc_key, values=data)
        redis.expire(doc_key, 7200)

        # user's active processing documents set
        if status == STATUS_PROCESSING:
            redis.sadd(user_set_key, document_id)
            redis.expire(user_set_key, 7200)
        
        else:
            redis.srem(user_set_key, document_id)
        
    except Exception as e:
        logger.error(f"Failed to set document status for {document_id}: {e}")

def get_document_status(document_id: str) -> Optional[Dict[str, Any]]:
    if not redis:
        return None

    try:
        return redis.hgetall(f"doc:status:{document_id}")

    except Exception as e:
        logger.error(f"Failed to get document status for {document_id}: {e}")
        return None

def is_user_ingesting(
    user_id: str, 
    document_id: Optional[str] = None
) -> bool:
    if not redis:
        return False

    try:
        if document_id:
            status = redis.hget(f"doc:status:{document_id}", "status")
            return status == STATUS_PROCESSING
        
        active_count = redis.scard(f"user:{user_id}:processing_docs")
        return active_count > 0
    
    except Exception as e:
        logger.error(f"Failed to check ingestion state for user {user_id}: {e}")
        return False
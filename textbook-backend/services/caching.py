import os
import json
import logging
import hashlib
from typing import Optional, Dict, Any, List
from dotenv import load_dotenv
from upstash_redis import Redis

load_dotenv()
logger = logging.getLogger(__name__)

url: str = os.environ.get("UPSTASH_REDIS_REST_URL")
token: str = os.environ.get("UPSTASH_REDIS_REST_TOKEN")

redis: Redis | None = Redis(url=url, token=token) if url and token else None

def _make_key(
    user_id: str,
    query: str,
    document_id: Optional[str] = None,
    document_ids: Optional[List[str]] = None,
    notebook_id: Optional[str] = None,
    pipeline: str = "linear",
    top_k: int = 5,
    use_analysis: bool = False,
) -> str:
    scoped_document_ids = sorted(set(document_ids or []))
    if document_id:
        scoped_document_ids = sorted(set([*scoped_document_ids, document_id]))

    scope = json.dumps(
        {
            "query": query.strip().lower(),
            "notebook_id": notebook_id,
            "document_ids": scoped_document_ids if document_ids is not None or document_id else None,
            "pipeline": pipeline,
            "top_k": top_k,
            "use_analysis": use_analysis,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    digest = hashlib.sha256(scope.encode("utf-8")).hexdigest()
    return f"cache:{user_id}:{digest}"

def get_cached_response(
    user_id: str,
    query: str,
    document_id: Optional[str] = None,
    document_ids: Optional[List[str]] = None,
    notebook_id: Optional[str] = None,
    pipeline: str = "linear",
    top_k: int = 5,
    use_analysis: bool = False,
) -> Optional[Dict[str, Any]]:    
    if not redis:
        return None

    try:
        key = _make_key(
            user_id=user_id,
            query=query,
            document_id=document_id,
            document_ids=document_ids,
            notebook_id=notebook_id,
            pipeline=pipeline,
            top_k=top_k,
            use_analysis=use_analysis,
        )
        cached_data = redis.json.get(key)
        if cached_data:
            if isinstance(cached_data, list) and len(cached_data) > 0:
                return cached_data[0]
            elif isinstance(cached_data, dict):
                return cached_data
            elif isinstance(cached_data, str):
                return json.loads(cached_data)
    
    except Exception as e:
        logger.warning(f"Cache lookup failed: {e}")
    
    return None

def set_cached_response(
    user_id: str,
    query: str,
    response: Any,
    document_id: Optional[str] = None,
    document_ids: Optional[List[str]] = None,
    notebook_id: Optional[str] = None,
    pipeline: str = "linear",
    top_k: int = 5,
    use_analysis: bool = False,
    ttl_seconds: int = 86400
) -> None:
    if not redis:
        return None

    try:
        key = _make_key(
            user_id=user_id,
            query=query,
            document_id=document_id,
            document_ids=document_ids,
            notebook_id=notebook_id,
            pipeline=pipeline,
            top_k=top_k,
            use_analysis=use_analysis,
        )

        if hasattr(response, "model_dump"):
            data = response.model_dump()
        elif hasattr(response, "dict"):
            data = response.dict()
        elif isinstance(response, dict):
            data = response
        elif isinstance(response, str):
            data = json.loads(response)
        else:
            data = {"value": str(response)}

        redis.json.set(key, "$", data)
        redis.expire(key, ttl_seconds)
        logger.info(f"Response cached with ttl: {ttl_seconds} seconds.")
   
    except Exception as e:
        logger.warning(f"Cache write failed: {e}")

def invalidate_user_cache(user_id: str, *, strict: bool = False) -> int:
    """Safely purge all cached query responses for given user using non-blocking scan"""
    if not redis:
        return 0

    pattern = f"cache:{user_id}:*"
    cursor=0
    total_deleted=0

    try:
        while True:
            cursor, keys = redis.scan(cursor, match=pattern, count=100)

            if keys:
                redis.delete(*keys)
                total_deleted += len(keys)
            
            if cursor == 0:
                break

        logger.info(f"Invalidated {total_deleted} cache entries for user: {user_id}")
        return total_deleted
    
    except Exception as e:
        logger.error(f"Failed to invalidate cache for user {user_id}: {e}")
        if strict:
            raise RuntimeError("Cache invalidation unavailable") from None
        return 0

import os
import json
import logging
from typing import Optional, Dict, Any
from dotenv import load_dotenv
from upstash_redis import Redis

load_dotenv()
logger = logging.getLogger(__name__)

url: str = os.environ.get("UPSTASH_REDIS_REST_URL")
token: str = os.environ.get("UPSTASH_REDIS_REST_TOKEN")

redis: Redis | None = Redis(url=url, token=token) if url and token else None

def _make_key(user_id: str, document_id: Optional[str], query: str) -> str:
    doc = document_id if document_id else "all"
    clean_query = query.strip().lower()
    return f"cache:{user_id}:{doc}:{clean_query}"

def get_cached_response(
    user_id: str, 
    document_id: Optional[str], 
    query: str
) -> Optional[Dict[str, Any]]:    
    if not redis:
        return None

    try:
        key = _make_key(user_id, document_id, query)
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
    document_id: Optional[str], 
    query: str, 
    response: Any,
    ttl_seconds: int = 86400
) -> None:
    if not redis:
        return None

    try:
        key = _make_key(user_id, document_id, query)

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

def invalidate_user_cache(user_id: str) -> int:
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
        return 0
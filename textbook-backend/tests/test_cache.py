import time
import requests
import sys
import os

# Add parent directory to sys.path so we can import modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.caching import redis

# ==============================================================================
# Upstash Redis Data Type Unit Tests
# ==============================================================================

def test_redis_string():
    """1. String: Key-Value, counters, and TTL expiration."""
    print("\n[TEST 1] Testing Redis Strings (Key-Value & Counters)...")
    key = "test:datatype:string"
    counter_key = "test:datatype:counter"
    
    try:
        # Basic Set / Get
        redis.set(key, "hello_upstash", ex=60)
        val = redis.get(key)
        assert val == "hello_upstash", f"Expected 'hello_upstash', got {val}"
        
        # Increment Counter
        redis.set(counter_key, 0, ex=60)
        redis.incr(counter_key)
        redis.incrby(counter_key, 5)
        count = int(redis.get(counter_key))
        assert count == 6, f"Expected counter to be 6, got {count}"
        
        print("  [PASS] String set/get and counter increment")
    finally:
        redis.delete(key, counter_key)


def test_redis_json():
    """2. JSON: Native JSON documents, subpath queries, and array appends."""
    print("\n[TEST 2] Testing Redis Native JSON Documents...")
    key = "test:datatype:json"
    
    try:
        data = {
            "query": "What is hybrid search?",
            "is_grounded": True,
            "confidence_score": 85,
            "citations": [{"source_id": 1, "doc_id": "doc_abc"}]
        }
        
        # Set full JSON at root '$'
        redis.json.set(key, "$", data)
        redis.expire(key, 60)
        
        # Retrieve JSON
        retrieved = redis.json.get(key)
        root = retrieved[0] if isinstance(retrieved, list) else retrieved
        assert root["query"] == "What is hybrid search?", f"Unexpected query: {root.get('query')}"
        assert root["confidence_score"] == 85, f"Unexpected score: {root.get('confidence_score')}"
        
        # Update a specific subpath inside the JSON directly
        redis.json.set(key, "$.confidence_score", 98)
        updated = redis.json.get(key)
        updated_root = updated[0] if isinstance(updated, list) else updated
        assert updated_root["confidence_score"] == 98, f"Expected 98, got {updated_root.get('confidence_score')}"
        
        # Append a new item to an array inside the JSON
        redis.json.arrappend(key, "$.citations", {"source_id": 2, "doc_id": "doc_xyz"})
        final = redis.json.get(key)
        final_root = final[0] if isinstance(final, list) else final
        assert len(final_root["citations"]) == 2, f"Expected 2 citations, got {len(final_root['citations'])}"
        
        print("  [PASS] JSON set/get, subpath updates, and array append")
    finally:
        redis.delete(key)


def test_redis_hash():
    """3. Hash: Field-value pairs (ideal for document/user metadata objects)."""
    print("\n[TEST 3] Testing Redis Hashes (Object Metadata)...")
    key = "test:datatype:hash:doc_101"
    
    try:
        # Set multiple fields
        redis.hset(key, values={
            "filename": "textbook_chapter1.pdf",
            "page_count": "42",
            "status": "indexed",
            "author": "DeepMind"
        })
        redis.expire(key, 60)
        
        # Get individual field
        filename = redis.hget(key, "filename")
        assert filename == "textbook_chapter1.pdf", f"Expected 'textbook_chapter1.pdf', got {filename}"
        
        # Get all fields
        all_fields = redis.hgetall(key)
        assert all_fields["status"] == "indexed", f"Expected status 'indexed', got {all_fields.get('status')}"
        assert all_fields["author"] == "DeepMind", f"Expected author 'DeepMind', got {all_fields.get('author')}"
        
        print("  [PASS] Hash hset, hget, and hgetall")
    finally:
        redis.delete(key)


def test_redis_list():
    """4. List: Ordered queues and message histories."""
    print("\n[TEST 4] Testing Redis Lists (Chat History & Queues)...")
    key = "test:datatype:list:chat_history"
    
    try:
        redis.delete(key)
        # Push messages
        redis.rpush(key, "User: What is RAG?", "AI: RAG stands for Retrieval-Augmented Generation.")
        redis.rpush(key, "User: How does it work?")
        redis.expire(key, 60)
        
        # Read range (all messages)
        history = redis.lrange(key, 0, -1)
        assert len(history) == 3, f"Expected 3 messages, got {len(history)}"
        assert history[0] == "User: What is RAG?", f"Unexpected message: {history[0]}"
        
        # Pop from left
        first_msg = redis.lpop(key)
        assert first_msg == "User: What is RAG?", f"Expected 'User: What is RAG?', got {first_msg}"
        
        print("  [PASS] List rpush, lrange, and lpop")
    finally:
        redis.delete(key)


def test_redis_set():
    """5. Set: Unordered collections of unique elements (tags, active users)."""
    print("\n[TEST 5] Testing Redis Sets (Unique Collections)...")
    key = "test:datatype:set:tags"
    
    try:
        redis.delete(key)
        # Add tags (with duplicates to test uniqueness)
        redis.sadd(key, "rag", "dense_retrieval", "reranking", "rag")
        redis.expire(key, 60)
        
        members = redis.smembers(key)
        # Should only contain 3 unique items
        assert len(members) == 3, f"Expected 3 unique tags, got {len(members)}"
        assert "dense_retrieval" in members
        assert redis.sismember(key, "rag") == 1, "Expected 'rag' to be in set"
        assert redis.sismember(key, "unrelated_tag") == 0, "Did not expect 'unrelated_tag'"
        
        print("  [PASS] Set uniqueness, smembers, and sismember")
    finally:
        redis.delete(key)


def test_redis_sorted_set():
    """6. Sorted Set (ZSet): Ranked elements with scores (query popularity/leaderboard)."""
    print("\n[TEST 6] Testing Redis Sorted Sets (Leaderboards & Ranked Queries)...")
    key = "test:datatype:zset:popular_queries"
    
    try:
        redis.delete(key)
        # Add queries with frequency scores
        redis.zadd(key, scores={
            "what is rag": 150.0,
            "how to chunk pdfs": 42.0,
            "difference between dense and sparse": 230.0,
            "qdrant vector search": 95.0
        })
        redis.expire(key, 60)
        
        # Get top 2 queries (highest score descending)
        top_queries = redis.zrange(key, 0, 1, rev=True, withscores=True)
        assert len(top_queries) == 2, f"Expected top 2, got {len(top_queries)}"
        assert top_queries[0][0] == "difference between dense and sparse", f"Expected highest score, got {top_queries[0]}"
        assert top_queries[0][1] == 230.0
        
        print("  [PASS] Sorted Set zadd and zrange (ranked order)")
    finally:
        redis.delete(key)


# ==============================================================================
# End-to-End Chat API Response Cache Benchmark
# ==============================================================================

def run_api_benchmark():
    """7. API Benchmark: Measures performance difference between Cache Miss and Cache Hit."""
    print("\n" + "=" * 55)
    print("  FASTAPI /api/chat END-TO-END CACHE BENCHMARK")
    print("=" * 55)

    URL = "http://127.0.0.1:8000/api/chat"
    payload = {
        "user_id": "test_benchmark_user",
        "query": f"What is dense retrieval? (Benchmark {int(time.time())})",
        "document_id": None
    }

    use_live_server = False
    try:
        r = requests.get("http://127.0.0.1:8000/docs", timeout=1)
        if r.status_code == 200:
            use_live_server = True
    except Exception:
        use_live_server = False

    if use_live_server:
        print("Connected to live server at http://127.0.0.1:8000")
        post_func = lambda p: requests.post(URL, json=p)
    else:
        print("Live server not running. Running benchmark in-memory with FastAPI TestClient...")
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        post_func = lambda p: client.post("/api/chat", json=p)

    # Call #1: Cache Miss
    print("\nSending Request 1 (Expecting Cache MISS)...")
    start = time.perf_counter()
    res1 = post_func(payload)
    miss_duration = (time.perf_counter() - start) * 1000

    # Call #2: Cache Hit
    print("Sending Request 2 (Expecting Cache HIT)...")
    start = time.perf_counter()
    res2 = post_func(payload)
    hit_duration = (time.perf_counter() - start) * 1000

    # Print results
    print("\n" + "-" * 55)
    print(f"  1st Request (Cache MISS) : {miss_duration:.2f} ms")
    print(f"  2nd Request (Cache HIT)  : {hit_duration:.2f} ms")
    if hit_duration > 0:
        speedup = miss_duration / hit_duration
        print(f"  Speedup                  : {speedup:.1f}x faster! (Saved ~{miss_duration - hit_duration:.0f}ms)")
    print("-" * 55)


def main():
    if not redis:
        print("[ERROR] Upstash Redis is not configured. Please set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in .env")
        sys.exit(1)

    print("=======================================================")
    print("  RUNNING UPSTASH REDIS DATA TYPE TEST SUITE")
    print("=======================================================")
    
    test_redis_string()
    test_redis_json()
    test_redis_hash()
    test_redis_list()
    test_redis_set()
    test_redis_sorted_set()
    
    print("\n>>> ALL 6 UPSTASH REDIS DATA TYPE TESTS PASSED SUCCESSFULLY! <<<")
    
    run_api_benchmark()


if __name__ == "__main__":
    main()

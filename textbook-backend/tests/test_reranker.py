import sys
from pathlib import Path

# Ensure backend root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.reranker import reranker_with_cross_encoder

def test_reranker():
    query = "What is the capital of France?"
    candidate_chunks = [
        {
            "id": 1,
            "text": "Paris is the city of love and one of the most romantic cities in the world.",
            "payload": {"text": "Paris is the city of love and one of the most romantic cities in the world.", "document_id": "file1.pdf"},
        },
        {
            "id": 2,
            "text": "USA has the most businesses.",
            "payload": {"text": "USA has the most businesses.", "document_id": "file2.pdf"},
        },
        {
            "id": 3,
            "text": "The capital of India is Delhi.",
            "payload": {"text": "The capital of India is Delhi.", "document_id": "file3.pdf"},
        },
        {
            "id": 4,
            "text": "China has the cheapest raw materials.",
            "payload": {"text": "China has the cheapest raw materials.", "document_id": "file4.pdf"},
        },
        {
            "id": 5,
            "text": "The capital of France is Paris.",
            "payload": {"text": "The capital of France is Paris.", "document_id": "file5.pdf"},
        },
        {
            "id": 6,
            "text": "Japan is the most productive country.",
            "payload": {"text": "Japan is the most productive country.", "document_id": "file6.pdf"},
        },
        {
            "id": 7,
            "text": "The capital of Germany is Berlin.",
            "payload": {"text": "The capital of Germany is Berlin.", "document_id": "file7.pdf"},
        },
    ]
    
    top_k = 3
    scored_data = reranker_with_cross_encoder(query=query, candidate_chunks=candidate_chunks, top_k=top_k)
    
    assert len(scored_data) == top_k, f"Expected {top_k} results, got {len(scored_data)}"
    assert all("rerank_score" in chunk for chunk in scored_data), "Every chunk must have a rerank_score"
    
    # Assert descending order
    for i in range(len(scored_data) - 1):
        assert scored_data[i]["rerank_score"] >= scored_data[i + 1]["rerank_score"], "Results must be sorted descending by rerank_score"
    
    # Top chunk should be chunk #5 ("The capital of France is Paris")
    assert scored_data[0]["id"] == 5 or "Paris" in scored_data[0]["text"], "Top chunk should mention Paris"
    
    print(f"Top {top_k} Reranked Results:")
    for idx, item in enumerate(scored_data, 1):
        print(f"  {idx}. [Score: {item['rerank_score']:.4f}] ID {item['id']}: {item['text']}")

def test_reranker_empty_candidates():
    scored_data = reranker_with_cross_encoder(query="Test query", candidate_chunks=[])
    assert scored_data == [], "Empty candidates must return an empty list"

if __name__ == "__main__":
    test_reranker()
    test_reranker_empty_candidates()
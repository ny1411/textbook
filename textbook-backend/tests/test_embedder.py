import sys
from pathlib import Path

# Ensure backend root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.embedder import get_vectors

def test_embedder():
    sample_texts = [
        "My name is John and I am a software engineer.",
        "Software Engineering is a trending field since 2020.", 
        "I am a great software engineer.", 
        "I also am a great cook."
    ]
    
    # 1. Test batch document embedding
    dense_vecs, sparse_vecs = get_vectors(texts=sample_texts, is_query=False)
    assert len(dense_vecs) == len(sample_texts), "Should return dense vector for each text"
    assert len(dense_vecs[0]) == 1024, f"BGE-large should produce 1024-dim vectors, got {len(dense_vecs[0])}"
    assert len(sparse_vecs) == len(sample_texts), "Should return sparse vector for each text"
    assert len(sparse_vecs[0].indices) == len(sparse_vecs[0].values) > 0, "Sparse vector should have non-empty indices and values"
    
    print(f"Batch Dense Vectors count: {len(dense_vecs)} (Dim: {len(dense_vecs[0])})")
    print(f"Batch Sparse Vectors count: {len(sparse_vecs)} (Sample non-zero terms: {len(sparse_vecs[0].indices)})")

    # 2. Test single query embedding
    query_text = "What is software engineering?"
    single_dense, single_sparse = get_vectors(texts=query_text, is_query=True)
    assert isinstance(single_dense, list) and len(single_dense) == 1024, "Query dense vector should be 1024-dim list"
    assert hasattr(single_sparse, "indices") and len(single_sparse.indices) > 0, "Query sparse vector should have indices"
    print("Single query dense and sparse vectors generated successfully.")

if __name__ == "__main__":
    test_embedder()
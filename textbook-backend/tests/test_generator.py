import sys
from pathlib import Path

# Ensure backend root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.generator import generate_answer, order_context_nodes, format_context_with_citations

chunks = [
    {"id": 1, "text": "Paris is the capital of France.", "metadata": {"source": "file1.pdf", "page_number": 1, "document_id": "doc1"}},
    {"id": 2, "text": "France is a country in Western Europe with Paris as its capital.", "metadata": {"source": "file2.pdf", "page_number": 3, "document_id": "doc2"}},
    {"id": 3, "text": "The Eiffel Tower is located in Paris, France.", "metadata": {"source": "file3.pdf", "page_number": 2, "document_id": "doc3"}},
    {"id": 4, "text": "Chunk 4: General information about European geography.", "metadata": {"source": "file4.pdf", "page_number": 5, "document_id": "doc4"}},
    {"id": 5, "text": "Chunk 5: French culture and cuisine.", "metadata": {"source": "file5.pdf", "page_number": 7, "document_id": "doc5"}},
    {"id": 6, "text": "Chunk 6: Historical landmarks in Europe.", "metadata": {"source": "file6.pdf", "page_number": 8, "document_id": "doc6"}},
    {"id": 7, "text": "Chunk 7: Miscellaneous notes on global tourism.", "metadata": {"source": "file7.pdf", "page_number": 10, "document_id": "doc7"}},
]

def test_lost_in_the_middle():
    ordered_chunks = order_context_nodes(chunks)
    assert len(ordered_chunks) == len(chunks), "Reordered list should have same length as input"
    
    # In Lost-in-the-Middle reordering:
    # Rank 1 (chunks[0]) stays at the start (index 0)
    # Rank 2 (chunks[1]) moves to the end (index -1)
    assert ordered_chunks[0]["id"] == 1, "Top chunk (Rank 1) should be at the very start"
    assert ordered_chunks[-1]["id"] == 2, "Second chunk (Rank 2) should be at the very end"
    
    print("Lost-in-the-middle reordered IDs:", [c["id"] for c in ordered_chunks])

def test_format_context_with_citations():
    ordered_chunks = order_context_nodes(chunks)
    context_str, citations = format_context_with_citations(ordered_chunks)
    
    assert isinstance(context_str, str) and len(context_str) > 0, "Context string must not be empty"
    assert "[Source 1]" in context_str, "Context string must contain source markers"
    assert len(citations) == len(ordered_chunks), "Citations count must match chunks count"
    assert citations[0]["source_id"] == 1
    
    print(f"Context formatted with {len(citations)} citation sources.")

def test_generate_answer():
    result = generate_answer(query="What is the capital of France?", chunks=chunks[:3], temperature=0.0)
    
    assert "answer" in result, "Result must contain 'answer'"
    assert "citations" in result, "Result must contain 'citations'"
    assert len(result["citations"]) > 0, "Citations should be returned"
    
    print("Generated Answer:\n", result["answer"])
    print(f"Citations count: {len(result['citations'])}")

def test_generate_answer_empty_chunks():
    result = generate_answer(query="What is the capital of France?", chunks=[], temperature=0.0)
    assert "No relevant documents found" in result["answer"], "Empty chunks should return fallback message"
    assert result["citations"] == [], "Empty chunks should return empty citations"
    print("Empty chunks fallback test passed.")

if __name__ == "__main__":
    test_lost_in_the_middle()
    test_format_context_with_citations()
    test_generate_answer_empty_chunks()
    test_generate_answer()
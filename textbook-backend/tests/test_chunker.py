import sys
from pathlib import Path

# Ensure backend root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.chunker import semantic_chunking, create_parent_child_chunks, code_chunking
from services.text_splitter import Language

def test_semantic_chunking():
    chunks = semantic_chunking(document="""
        My name is John and I am a software engineer. 
        Software Engineering is a trending field since 2020. 
        I am a great software engineer. 
        I also am a great cook.
    """)
    assert len(chunks) > 0, "Semantic chunking should produce at least 1 chunk"
    for chunk in chunks:
        assert hasattr(chunk, "page_content") and len(chunk.page_content) > 0
    print(f"Semantic Chunks count: {len(chunks)}")
    print(f"Sample chunk: {chunks[0].page_content}")

def test_parent_child_chunking():
    parent_chunks, child_chunks = create_parent_child_chunks(document="""
        My name is John and I am a software engineer. 
        Software Engineering is a trending field since 2020. 
        I am a great software engineer. 
        I also am a great cook.
    """)
    assert len(parent_chunks) > 0, "Parent chunking should produce parent chunks"
    assert len(child_chunks) > 0, "Parent chunking should produce child chunks"
    for child in child_chunks:
        assert "parent_id" in child.metadata, "Child chunk must have parent_id in metadata"
    print(f"Parent chunks count: {len(parent_chunks)}")
    print(f"Child chunks count: {len(child_chunks)}")

def test_code_chunking():
    code_text = """
import pymupdf

def extract_text(pdf_bytes: bytes) -> str:
    doc = pymupdf.open("ai-engineer.pdf", mode='rb')
    output = ""
    for page in doc:
        text = page.get_text()
        output += text
    return output
"""
    chunks = code_chunking(document=code_text, language=Language.PYTHON)
    assert len(chunks) > 0, "Code chunking should produce chunks"
    print(f"Code Chunks count: {len(chunks)}")
    print(f"Sample code chunk: {chunks[0].page_content}")

if __name__ == "__main__":
    test_semantic_chunking()
    test_parent_child_chunking()
    test_code_chunking()
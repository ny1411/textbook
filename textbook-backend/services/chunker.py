import uuid
from text_splitter import recursive_char_text_split
from langchain_experimental.text_splitter import SemanticChunker
from embedder import bge_large_embedder

def semantic_chunking(document: str):
    engine = bge_large_embedder()
    splitter = SemanticChunker(engine)
    documents = splitter.create_documents([document])
    
    return documents

def create_parent_child_chunks(document: str, metadata: dict=None):
    parent_chunks = recursive_char_text_split(
        [document], 
        chunk_size=2000, 
        chunk_overlap=200,
        metadatas=[metadata or {}]
    )

    all_children = []

    for parent in parent_chunks:
        parent_id = str(uuid.uuid4())
        parent.metadata["parent_id"] = parent_id

        child_chunks = recursive_char_text_split(
            [parent.page_content], 
            chunk_size=400, 
            chunk_overlap=50,
            metadatas=[parent.metadata]
        )

        all_children.extend(child_chunks)

    return parent_chunks, all_children

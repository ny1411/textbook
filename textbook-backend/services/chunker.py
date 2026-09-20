import uuid
from services.text_splitter import recursive_char_text_split, Language
from langchain_experimental.text_splitter import SemanticChunker
from services.embedder import bge_large_embedder

def code_chunking(document: str, language: Language=None, metadata: dict=None):
    chunks = recursive_char_text_split(
        document=[document], 
        chunk_size=400, 
        chunk_overlap=50, 
        language=language, 
        metadatas=[metadata or {}]
    )
    
    return chunks

def semantic_chunking(document: str, metadata: dict = None):
    engine = bge_large_embedder()
    splitter = SemanticChunker(engine)
    documents = splitter.create_documents([document], metadatas=[metadata or {}])

    return documents

def create_parent_child_chunks(document: str, metadata: dict=None):
    parent_chunks = recursive_char_text_split(
        [document], 
        chunk_size=2000, 
        chunk_overlap=200,
        metadatas=[metadata or {}]
    )

    all_children = []

    # split parent into child chunks
    for parent in parent_chunks:
        parent_id = str(uuid.uuid4())
        parent.metadata["parent_id"] = parent_id

        child_chunks = recursive_char_text_split(
            [parent.page_content], 
            chunk_size=400, 
            chunk_overlap=50,
        )

        # embed parent metadata and parent texts in child metadata
        for child in child_chunks:
            child.metadata = {
                **(metadata or {}),
                "parent_id": parent_id,
                "parent_text": parent.page_content,
            }
            all_children.append(child)

    return all_children

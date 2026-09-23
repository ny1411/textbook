import uuid
import logging
from typing import Optional
from qdrant_client import models
from db.qdrant import client
from langchain_text_splitters import Language
from services.parser import extract_text_with_pymupdf
from services.caching import invalidate_user_cache
from services.chunker import code_chunking, semantic_chunking, create_parent_child_chunks
from services.embedder import get_vectors
from services.status import set_document_status

logger = logging.getLogger(__name__)

CODE_LANGUAGE_EXTENSIONS = {
    "html": Language.HTML,
    "py": Language.PYTHON,
    "js": Language.JS,
    "jsx": Language.JS,
    "ts": Language.TS,
    "tsx": Language.TS,
    "c": Language.C,
    "cs": Language.CSHARP,
    "cpp": Language.CPP,
    "java": Language.JAVA,
    "go": Language.GO,
    "rs": Language.RUST,
    "md": Language.MARKDOWN,
    "php": Language.PHP,
    "swift": Language.SWIFT,
}

def code_chunker(raw_text: str, filename: str, metadata: dict):
    extension = filename.split(".")[-1].lower() if "." in filename else ""

    # code chunking
    if extension in CODE_LANGUAGE_EXTENSIONS:
        language = CODE_LANGUAGE_EXTENSIONS[extension]
        logger.info(f"Routing {filename} to code chunking for language: {language}.")
        return code_chunking(raw_text, language=language, metadata=metadata)

    # parent-child chunking for longer documents and pdfs
    if extension == "pdf" or len(raw_text) > 3000:
        logger.info(f"Routing {filename} to Parent-child chunking.")
        return create_parent_child_chunks(raw_text, metadata=metadata)

    # semantic chunking for short files
    logger.info(f"Routing {filename} to Semantic Chunking.")
    return semantic_chunking(raw_text, metadata)

def ingest_chunks(
    chunks: list,
    user_id: str,
    document_id: str = None,
    notebook_id: Optional[str] = None
):
    if not chunks:
        return

    # collect all chunks in a batch
    texts = [chunk.page_content for chunk in chunks]

    # batch generate dense and sparse vectors
    dense_vectors, sparse_vectors = get_vectors(texts, is_query=False)

    all_points = []
    for chunk, dense_vec, sparse_vec in zip(chunks, dense_vectors, sparse_vectors):
        doc_id = document_id or chunk.metadata.get("source") or chunk.metadata.get("document_id") or "unknown"
        page = chunk.metadata.get("page") or chunk.metadata.get("page_number") or 0
        doc_notebook_id = chunk.metadata.get("notebook_id") or notebook_id

        payload = {
            **chunk.metadata,
            "user_id": str(user_id),
            "notebook_id":str(doc_notebook_id) if doc_notebook_id else None,
            "document_id": str(doc_id),
            "page_number": int(page),
            "text": chunk.page_content,
        }

        all_points.append(
            models.PointStruct(
                id=str(uuid.uuid4()),
                payload=payload,
                vector={
                    "dense-text": dense_vec,
                    "sparse-text": sparse_vec
                },
            )
        )

    # batch upload to Qdrant
    batch_size = 100
    for i in range(0, len(all_points), batch_size):
        client.upsert(
            collection_name="textbook_chunks",
            points=all_points[i:i + batch_size]
        )

    # purge cache for user
    invalidate_user_cache(user_id=user_id)


def process_and_ingest(
    file_bytes: bytes, 
    filename: str, 
    content_type: str, 
    user_id: str, 
    document_id: str,
    notebook_id: Optional[str] = None,
):
    try:
        text = extract_text_with_pymupdf(file_bytes, filename, content_type)
        if not text.strip():
            logger.warning(f"No extractable text found in {filename}.")
            set_document_status(
                document_id=document_id, 
                user_id=user_id, 
                status="failed", 
                error="No extractable text found"
            )
            return

        metadata = {
            "source": document_id,
            "document_id": document_id,
            "filename": filename,
            "user_id": user_id,
            "notebook_id": notebook_id,
        }

        chunks = code_chunker(raw_text=text, filename=filename, metadata=metadata)
        logger.info(f"Generated {len(chunks)} chunks from {filename}.")

        ingest_chunks(
            chunks=chunks,
            user_id=user_id,
            document_id=document_id,
            notebook_id=notebook_id
        )

        logger.info(f"Ingestion complete for {filename}.")
        set_document_status(
            document_id=document_id, 
            user_id=user_id, 
            status="ready"
        )
        
    except Exception as e:
        logger.error(f"Error ingesting document {filename}: {str(e)}", exc_info=True)
        set_document_status(
            document_id=document_id, 
            user_id=user_id, 
            status="failed", 
            error=str(e)
        )
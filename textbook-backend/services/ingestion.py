from qdrant_client import models
from db.qdrant import client
from services.embedder import get_vectors
import uuid


def ingest_chunks(chunks: list, user_id: str):
    if not chunks:
        return

    # collect all chunks in a batch
    texts = [chunk.page_content for chunk in chunks]

    # batch generate dense and sparse vectors
    dense_vectors, sparse_vectors = get_vectors(texts, is_query=False)

    all_points = []
    for chunk, dense_vec, sparse_vec in zip(chunks, dense_vectors, sparse_vectors):
        doc_id = chunk.metadata.get("source", "unknown")
        page = chunk.metadata.get("page") or 0

        payload = {
            **chunk.metadata,           # preserve original metadata
            "user_id": str(user_id),
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

    client.upload_points(
        collection_name="textbook_chunks",
        points=all_points
    )
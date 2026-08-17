from qdrant_client import models
from db.qdrant import client
from services.embedder import bge_large_embedder
from services.indexing import bm25_model
import uuid


def ingest_chunks(chunks: list, user_id: str):
    if not chunks:
        return
    
    all_points = []
    dense_embedder = bge_large_embedder()

    # collect all chunks in a batch
    texts = [chunk.page_content for chunk in chunks]

    # batch generate dense and sparse vectors
    dense_vectors = dense_embedder.embed_documents(texts)
    sparse_vectors_result = list(bm25_model.embed(texts))

    for chunk, dense_vec, sparse_res in zip(chunks, dense_vectors, sparse_vectors_result):
        doc_id = chunk.metadata.get("source", "unknown")
        page = chunk.metadata.get("page") or 0

        payload = {
            **chunk.metadata,           # preserve original metadata
            "user_id": str(user_id),
            "document_id": str(doc_id),
            "page_number": int(page),
            "text": chunk.page_content,
        }

        sparse_vec = models.SparseVector(
            indices=sparse_res.indices.tolist(),
            values=sparse_res.values.tolist()
        )

        point_id = str(uuid.uuid4())

        all_points.append(
            models.PointStruct(
                id=point_id,
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
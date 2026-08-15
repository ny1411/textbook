from qdrant_client import models
from db.qdrant import client
from services.embedder import bge_large_embedder
from services.indexing import bm25_model
import uuid


def ingest_chunks(chunks: list, user_id: str):
    dense_embedder = bge_large_embedder()
    
    all_points = []

    for chunk in chunks:
        doc_id = chunk.metadata.get("source", "unknown")
        page = chunk.metadata.get("page", 0)

        payload = {
            "user_id": str(user_id),
            "document_id": str(doc_id),
            "page_number": int(page),
            "text": chunk.page_content,
        }

        dense_vectors = dense_embedder.embed_documents([chunk.page_content])[0]

        # fastembed returns a generator, so we have to use list()[0] to get the result
        sparse_vector_result = list(bm25_model.embed([chunk.page_content]))[0]
        sparse_vectors = models.SparseVector(
            indices=sparse_vector_result.indices.tolist(),
            values=sparse_vector_result.values.tolist()
        )

        point_id = str(uuid.uuid4())

        all_points.append(
            models.PointStruct(
                id=point_id,
                payload=payload,
                vector={
                    "dense-text": dense_vectors,
                    "sparse-text": sparse_vectors
                },
            )
        )

    client.upload_points(
        collection_name="textbook_chunks",
        points=all_points
    )
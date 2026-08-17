from typing import Optional, Dict, List, Any
from qdrant_client import models
import logging
from db.qdrant import client
from services.embedder import bge_large_embedder
from services.indexing import bm25_model


logger = logging.getLogger(__name__)


def get_query_vectors(query_text: str) -> Dict[str, Any]:
    dense_embedder = bge_large_embedder()
    dense_vector = dense_embedder.embed_query(query_text)

    sparse_results = list(bm25_model.embed([query_text]))[0]
    sparse_vector = models.SparseVector(
        indices=sparse_results.indices.tolist(),
        values=sparse_results.values.tolist(),
    )

    return {
        "dense_vector": dense_vector,
        "sparse_vector": sparse_vector,
    }


def reciprocal_rank_fusion(
    dense_results: List[models.ScoredPoint], 
    sparse_results: List[models.ScoredPoint], 
    k: int = 60,
) -> List[Dict[str, Any]]:
    rrf_scores: Dict[str, float] = {}
    doc_details: Dict[str, Dict[str, Any]] = {}

    # process dense results 
    for rank, point in enumerate(dense_results, start=1):
        point_id = str(point.id)
        rrf_scores[point_id] = rrf_scores.get(point_id, 0.0) + (1.0/(k+rank))
        if point_id not in doc_details:
            doc_details[point_id] = {
                "id": point_id,
                "payload": point.payload or {},
                "dense_score": point.score,
                "sparse_score": None,
            }
        else:
            doc_details[point_id]["dense_score"] = point.score
    
    # process sparse results
    for rank, point in enumerate(sparse_results, start=1):
        point_id = str(point.id)
        rrf_scores[point_id] = rrf_scores.get(point_id, 0.0) + (1.0/(k+rank))
        if point_id not in doc_details:
            doc_details[point_id] = {
                "id": point_id,
                "payload": point.payload or {},
                "dense_score": None,
                "sparse_score": point.score,
            }
        else:
            doc_details[point_id]["sparse_score"] = point.score
    
    # sort points by RRF score in descending order
    sorted_doc_ids = sorted(rrf_scores.keys(), key=lambda pid: rrf_scores[pid], reverse=True)

    fused_results = []
    for pid in sorted_doc_ids:
        item = doc_details[pid]
        item["rrf_score"] = rrf_scores[pid]
        fused_results.append(item)
    
    return fused_results

def hybrid_search(
    user_id: str, 
    query: str, 
    top_k: int = 20, 
    document_id: Optional[str] = None,
    collection_name: str = "textbook_chunks"
) -> List[Dict[str, Any]]:

    # generate query from above function
    query_vectors = get_query_vectors(query)

    # multi-tenant payload filter
    filter_conditions = [
        models.FieldCondition(
            key="user_id",
            match=models.MatchValue(value=str(user_id)),
        )
    ]

    if document_id:
        filter_conditions.append(
            models.FieldCondition(
                key="document_id",
                match=models.MatchValue(value=str(document_id)),
            )
        )

    query_filter = models.Filter(must=filter_conditions)

    # dense search using Qdrant
    dense_response = client.query_points(
        collection_name=collection_name,
        query=query_vectors["dense_vector"],
        using="dense-text",
        query_filter=query_filter,
        limit=top_k,
        with_payload=True,
    )

    # sparse search using Qdrant
    sparse_response = client.query_points(
        collection_name=collection_name,
        query=query_vectors["sparse_vector"],
        using="sparse-text",
        query_filter=query_filter,
        limit=top_k,
        with_payload=True,
    )

    # perform hybrid search using RRF fusion and return top k
    fused_results = reciprocal_rank_fusion(
        dense_results=dense_response.points,
        sparse_results=sparse_response.points,
        k=60
    )

    return fused_results[:top_k]

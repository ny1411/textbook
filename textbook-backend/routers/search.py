from fastapi import APIRouter, HTTPException, Depends
from uuid import UUID
from core.auth import AuthUser, require_user, check_user_id
from db.postgres import get_db
from services.chat_history import own_notebook, resolve_documents
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import logging
from services.retriever import hybrid_search
from services.analyzer import analyze_query
from services.reranker import reranker_with_cross_encoder
from services.storage import download_file_from_supabase

logger = logging.getLogger(__name__)

router = APIRouter()

class SearchRequest(BaseModel):
    user_id: str = Field(..., description="Unique ID of the user for multi-tenant data isolation")
    query: str = Field(..., min_length=1, description="Search query string.")
    document_id: Optional[str] = Field(None, description="Optional document ID for document filtering.")
    document_ids: Optional[List[str]] = Field(None, description="Optional document IDs for document filtering.")
    notebook_id: Optional[str] = Field(None, description="Optional notebook ID for notebook filtering.")
    top_k: int = Field(20, ge=1, le=100, description="Number of results to retrieve.")
    use_analysis: bool = Field(False, description="Whether to apply Query Rewriting or HyDE before search.")

class SearchResultItem(BaseModel):
    id: str
    rrf_score: float
    text: str
    document_id: Optional[str] = None
    page_number: Optional[int] = None
    dense_score: Optional[float] = None
    sparse_score: Optional[float] = None
    rerank_score: Optional[float] = None
    payload: Dict[str, Any] = {}

class SearchResponse(BaseModel):
    query: str
    applied_query: str
    total_results: int
    results: List[SearchResultItem]

@router.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest, user: AuthUser = Depends(require_user), db=Depends(get_db)):
    check_user_id(request.user_id, user)
    try:
        request.notebook_id = str(UUID(request.notebook_id or ""))
        if request.document_id:
            request.document_id = str(UUID(request.document_id))
        if request.document_ids is not None:
            request.document_ids = [str(UUID(value)) for value in request.document_ids]
    except ValueError:
        raise HTTPException(422, "Choose valid notebook and source IDs") from None
    await own_notebook(db, user.id, request.notebook_id)
    requested = request.document_ids if request.document_ids is not None else ([request.document_id] if request.document_id else None)
    request.document_ids = await resolve_documents(db, user.id, request.notebook_id, requested)
    if request.document_id:
        await resolve_documents(db, user.id, request.notebook_id, [request.document_id])
    try:
        search_query = request.query

        if request.use_analysis:
            analysis = analyze_query(request.query)
            if analysis and analysis.rewritten_query:
                search_query = analysis.rewritten_query

        raw_results = hybrid_search(
            user_id=request.user_id,
            query=search_query,
            top_k=max(request.top_k, 20),
            document_id=request.document_id,
            document_ids=request.document_ids,
            notebook_id=request.notebook_id,
        )

        final_results = reranker_with_cross_encoder(
            query=search_query,
            candidate_chunks=raw_results,
            top_k=request.top_k,
        )

        formatted_results = [
            SearchResultItem(
                id=item["id"],
                rrf_score=item["rrf_score"],
                rerank_score=item["rerank_score"],
                text=item["payload"].get("text", ""),
                document_id=item["payload"].get("document_id"),
                page_number=item["payload"].get("page_number"),
                dense_score=item.get("dense_score"),
                sparse_score=item.get("sparse_score"),
                payload=item["payload"],
            )
            for item in final_results
        ]

        return SearchResponse(
            query=request.query,
            applied_query=search_query,
            total_results=len(formatted_results),
            results=formatted_results,
        )

    except Exception as e:
        logger.error(f"Search failed for user {request.user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")

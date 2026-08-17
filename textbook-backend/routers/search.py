from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import logging
from services.retriever import hybrid_search
from services.analyzer import analyze_query
from services.storage import download_file_from_supabase

logger = logging.getLogger(__name__)

router = APIRouter()

class SearchRequest(BaseModel):
    user_id: str = Field(..., description="Unique ID of the user for multi-tenant data isolation")
    query: str = Field(..., min_length=1, description="Search query string.")
    document_id: Optional[str] = Field(None, description="Optional document ID for document filtering.")
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
    payload: Dict[str, Any] = {}

class SearchResponse(BaseModel):
    query: str
    applied_query: str
    total_results: int
    results: List[SearchResultItem]

@router.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest):
    try:
        search_query = request.query

        if request.use_analysis:
            analysis = analyze_query(request.query)
            if analysis and analysis.rewritten_query:
                search_query = analysis.rewritten_query

        raw_results = hybrid_search(
            user_id=request.user_id,
            query=search_query,
            top_k=request.top_k,
            document_id=request.document_id,
        )

        formatted_results = [
            SearchResultItem(
                id=item["id"],
                rrf_score=item["rrf_score"],
                text=item["payload"].get("text", ""),
                document_id=item["payload"].get("document_id"),
                page_number=item["payload"].get("page_number"),
                dense_score=item.get("dense_score"),
                sparse_score=item.get("sparse_score"),
                payload=item["payload"],
            )
            for item in raw_results
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

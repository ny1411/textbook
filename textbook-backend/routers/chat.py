from services.status import is_user_ingesting
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Union, Literal
import logging
from services.analyzer import analyze_query
from services.retriever import hybrid_search
from services.reranker import reranker_with_cross_encoder
from services.generator import generate_answer
from services.conversation import generate_conversational_answer, relevant_chunks
from agents.graph import graph
from agents.state import AgentState
from core.telemetry import create_langfuse_config
from services.caching import get_cached_response, set_cached_response

logger = logging.getLogger(__name__)

router = APIRouter()

class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    user_id: str
    query: str = Field(..., min_length=1, max_length=8000)
    history: List[HistoryMessage] = Field(default_factory=list, max_length=20)
    conversation_id: Optional[str] = Field(None, description="Optional conversation/session ID to group messages in telemetry.")
    document_id: Optional[str] = None
    document_ids: Optional[List[str]] = None
    notebook_id: Optional[str] = None
    top_k: int = Field(5, ge=1, le=100)
    use_analysis: bool = False

class CitationItem(BaseModel):
    source_id: Union[int, str] = Field(..., description="This is the source ID of the citation.")
    document_id: Optional[str] = Field(None, description="This is the document ID of the citation.")
    page_number: Optional[int] = Field(None, description="This is the page number from the document where citation exist.")
    text: str = Field(..., description="This is the text inside the referenced citation.")
    chunk_id: str = Field(..., description="This is the chunk ID where citation must be referred to.")
    rerank_score: Optional[float] = Field(None, description="This is the rerank score of the citation.")

class ChatResponse(BaseModel):
    query: str
    answer: str
    applied_query: str
    citations: List[CitationItem]
    intent: Literal["casual_chat", "general_knowledge", "textbook_rag"] = "textbook_rag"
    is_grounded: Optional[bool] = None
    warning: Optional[str] = None

class AgentChatResponse(ChatResponse):
    confidence_score: Optional[int] = None
    critique: Optional[str] = None
    iteration_count: Optional[int] = None


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:    
    cached_response = None if request.history else get_cached_response(
        user_id=request.user_id,
        document_id=request.document_id,
        document_ids=request.document_ids,
        notebook_id=request.notebook_id,
        query=request.query,
        pipeline="linear-intent-v2-normalized",
        top_k=request.top_k,
        use_analysis=request.use_analysis,
    )
    if cached_response:
        logger.info(f"Cache hit for /chat")
        return ChatResponse(**cached_response)

    logger.info(f"Cache miss for /chat")
    
    """Linear RAG pipeline endpoint with telemetry tracing."""
    telemetry_config = create_langfuse_config(
        user_id=request.user_id,
        session_id=request.conversation_id,
        trace_name="linear-rag-chat",
        tags=["pipeline:linear-rag"],
        metadata={
            "document_id": request.document_id,
            "document_ids": request.document_ids,
            "notebook_id": request.notebook_id,
            "top_k": request.top_k,
            "use_analysis": request.use_analysis,
        },
        cache_hit=bool(cached_response)
    )

    try:
        query_to_use = request.query
        history = [message.model_dump() for message in request.history]
        analysis = analyze_query(request.query, config=telemetry_config, history=history)
        if analysis and analysis.rewritten_query:
            query_to_use = analysis.rewritten_query
        if analysis and analysis.intent in ("casual_chat", "general_knowledge"):
            return ChatResponse(query=request.query, applied_query=query_to_use,
                **generate_conversational_answer(query_to_use, analysis.intent, history, telemetry_config))
        
        # Run hybrid search (dense + sparse)
        search_response = hybrid_search(
            user_id=request.user_id,
            query=query_to_use,
            top_k=max(request.top_k, 20),
            document_id=request.document_id,
            document_ids=request.document_ids,
            notebook_id=request.notebook_id,
        )

        # Rerank chunks using Cross-Encoder
        reranked_chunks = reranker_with_cross_encoder(
            query=query_to_use,
            candidate_chunks=search_response,
            top_k=request.top_k
        )

        reranked_chunks = relevant_chunks(reranked_chunks)
        ingestion_active = is_user_ingesting(user_id=request.user_id, document_id=request.document_id)
        if len(reranked_chunks) == 0 and ingestion_active:
            return ChatResponse(
                query=request.query,
                applied_query=query_to_use,
                answer="One or more documents are still being processed and indexed. Please wait a moment and try again.",
                citations=[],
                is_grounded=False,
            )

        if not reranked_chunks:
            return ChatResponse(query=request.query, applied_query=query_to_use,
                **generate_conversational_answer(query_to_use, "general_knowledge", history, telemetry_config))

        # Generate grounded answer with citations
        generation_result = generate_answer(
            query=query_to_use,
            chunks=reranked_chunks,
            config=telemetry_config
        )

        result = ChatResponse(
            query=request.query,
            applied_query=query_to_use,
            answer=generation_result["answer"],
            citations=generation_result["citations"],
            is_grounded=True,
        )

        if len(reranked_chunks) > 0 and not ingestion_active and not request.history:
            set_cached_response(
                user_id=request.user_id,
                document_id=request.document_id,
                document_ids=request.document_ids,
                notebook_id=request.notebook_id,
                query=request.query,
                response=result,
                pipeline="linear-intent-v2-normalized",
                top_k=request.top_k,
                use_analysis=request.use_analysis,
            )
        else:
            logger.info("Skipping cache write: Ingestion in progress or no chunks found.")

        return result

    except Exception as e:
        logger.error(f"Search failed for user {request.user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.post("/agent/chat", response_model=AgentChatResponse)
async def agent_chat(request: ChatRequest) -> AgentChatResponse:
    cached_response = None if request.history else get_cached_response(
        user_id=request.user_id,
        document_id=request.document_id,
        document_ids=request.document_ids,
        notebook_id=request.notebook_id,
        query=request.query,
        pipeline="agent-intent-v2-normalized",
        top_k=request.top_k,
        use_analysis=request.use_analysis,
    )
    if cached_response:
        logger.info(f"Cache hit for /agent/chat")
        return AgentChatResponse(**cached_response)

    logger.info(f"Cache miss for /agent/chat")

    """Agentic LangGraph workflow endpoint with telemetry tracing."""
    telemetry_config = create_langfuse_config(
        user_id=request.user_id,
        session_id=request.conversation_id,
        trace_name="agentic-rag-chat",
        tags=["pipeline:agentic-rag", "langgraph"],
        metadata={
            "document_id": request.document_id,
            "document_ids": request.document_ids,
            "notebook_id": request.notebook_id,
            "top_k": request.top_k,
            "max_iterations": 2,
        },
        cache_hit=bool(cached_response)
    )

    try:
        history = [message.model_dump() for message in request.history]
        analysis = analyze_query(request.query, config=telemetry_config, history=history)
        query_to_use = analysis.rewritten_query if analysis and analysis.rewritten_query else request.query
        if analysis and analysis.intent in ("casual_chat", "general_knowledge"):
            return AgentChatResponse(query=request.query, applied_query=query_to_use, iteration_count=0,
                **generate_conversational_answer(query_to_use, analysis.intent, history, telemetry_config))
        initial_state: AgentState = {
            "user_id": request.user_id,
            "query": request.query,
            "document_id": request.document_id,
            "document_ids": request.document_ids,
            "notebook_id": request.notebook_id,
            "max_iterations": 2,
            "rewritten_query": query_to_use,
            "sub_queries": [query_to_use, *(analysis.sub_queries if analysis else [])],
            "history": history,
            "top_k": request.top_k,
        }

        result: AgentState = graph.invoke(initial_state, config=telemetry_config)

        result = AgentChatResponse(
            query=request.query,
            applied_query=result.get("rewritten_query") or request.query,
            answer=result.get("answer", "No answer could be generated."),
            citations=result.get("citations", []),
            confidence_score=result.get("confidence_score"),
            is_grounded=result.get("is_grounded"),
            critique=result.get("critique"),
            iteration_count=result.get("iteration_count"),
            intent=result.get("intent", "textbook_rag"),
            warning=result.get("warning"),
        )

        ingestion_active = is_user_ingesting(user_id=request.user_id, document_id=request.document_id)
        if len(result.citations) > 0 and not ingestion_active and not request.history:
            set_cached_response(
                user_id=request.user_id,
                document_id=request.document_id,
                document_ids=request.document_ids,
                notebook_id=request.notebook_id,
                query=request.query,
                response=result,
                pipeline="agent-intent-v2-normalized",
                top_k=request.top_k,
                use_analysis=request.use_analysis,
            )
        else:
            logger.info("Skipping agent cache write: Ingestion in progress or no citations found.")

        return result

    except Exception as e:
        logger.error(f"Agentic chat failed for user {request.user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Agentic chat failed: {str(e)}")

from services.status import is_user_ingesting
from fastapi import APIRouter, HTTPException, Depends, Request
from services.chat_stream import chat_stream
from pydantic import BaseModel, Field, PrivateAttr, field_validator, model_validator
from uuid import UUID, uuid4
from core.auth import AuthUser, require_user, check_user_id
from db.postgres import get_db
from services import chat_history as history_store
from typing import Optional, List, Union, Literal
import logging
import asyncio
from services.analyzer import analyze_query
from services.retriever import hybrid_search
from services.reranker import reranker_with_cross_encoder
from services.generator import generate_answer
from services.conversation import generate_conversational_answer, relevant_chunks
from agents.graph import graph
from agents.state import AgentState
from core.telemetry import create_langfuse_config
from services.caching import get_cached_response, set_cached_response
from services import chat_attachments as attachment_store
from services.vision import observe_images, generate_visual_answer

logger = logging.getLogger(__name__)

router = APIRouter()

class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    user_id: Optional[str] = None
    query: str = Field("", max_length=8000)
    attachment_ids: List[str] = Field(default_factory=list, max_length=4)
    history: List[HistoryMessage] = Field(default_factory=list, max_length=20)
    conversation_id: str = Field(..., description="Owned conversation ID returned by POST /api/conversations.")
    request_id: str = Field(default_factory=lambda: str(uuid4()))
    document_id: Optional[str] = None
    document_ids: Optional[List[str]] = None
    notebook_id: Optional[str] = None
    top_k: int = Field(5, ge=1, le=100)
    use_analysis: bool = False
    _images: list = PrivateAttr(default_factory=list)
    _image_observations: list = PrivateAttr(default_factory=list)
    _current_observations: list = PrivateAttr(default_factory=list)
    _attachment_items: list = PrivateAttr(default_factory=list)
    _image_query: str = PrivateAttr(default="")

    @field_validator("attachment_ids")
    @classmethod
    def uuid_attachments(cls, value):
        normalized = [str(UUID(item)) for item in value]
        if len(set(normalized)) != len(normalized):
            raise ValueError("An image can only be attached once per message")
        return normalized

    @model_validator(mode="after")
    def text_or_images(self):
        if not self.query.strip() and not self.attachment_ids:
            raise ValueError("A message requires text or an image attachment")
        return self

    @field_validator("conversation_id", "request_id", "notebook_id", "document_id")
    @classmethod
    def uuid_fields(cls, value):
        return str(UUID(value)) if value is not None else None

    @field_validator("document_ids")
    @classmethod
    def uuid_documents(cls, value):
        return [str(UUID(item)) for item in value] if value is not None else None

class CitationItem(BaseModel):
    source_id: Union[int, str] = Field(..., description="This is the source ID of the citation.")
    document_id: Optional[str] = Field(None, description="This is the document ID of the citation.")
    page_number: Optional[int] = Field(None, description="This is the page number from the document where citation exist.")
    text: str = Field(..., description="This is the text inside the referenced citation.")
    chunk_id: str = Field(..., description="This is the chunk ID where citation must be referred to.")
    rerank_score: Optional[float] = Field(None, description="This is the rerank score of the citation.")

class ImageAttachment(BaseModel):
    id: str
    name: str
    media_type: Literal["image/png", "image/jpeg", "image/webp"]
    size: int
    url: str
    created_at: str


class ChatResponse(BaseModel):
    query: str
    answer: str
    applied_query: str
    citations: List[CitationItem]
    intent: Literal["casual_chat", "general_knowledge", "textbook_rag"] = "textbook_rag"
    is_grounded: Optional[bool] = None
    warning: Optional[str] = None
    conversation_id: Optional[str] = None
    conversation_title: Optional[str] = None
    request_id: Optional[str] = None
    message_id: Optional[str] = None
    user_message_id: Optional[str] = None
    attachments: List[ImageAttachment] = Field(default_factory=list)
    image_observations: List[str] = Field(default_factory=list)

class AgentChatResponse(ChatResponse):
    confidence_score: Optional[int] = None
    critique: Optional[str] = None
    iteration_count: Optional[int] = None


def _linear_answer_sync(request: ChatRequest, emit=None) -> ChatResponse:
    generation_options = {"emit": emit} if emit else {}
    if emit:
        emit("status", {"stage": "analyzing"})
    cached_response = None if request.history or request._images or request.attachment_ids else get_cached_response(
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
        query_to_use = request._image_query or request.query
        history = [message.model_dump() for message in request.history]
        analysis = analyze_query(query_to_use, config=telemetry_config, history=history)
        if analysis and analysis.rewritten_query:
            query_to_use = analysis.rewritten_query
        if analysis and analysis.intent in ("casual_chat", "general_knowledge"):
            if request._images and (analysis.intent != "casual_chat" or request.attachment_ids):
                return ChatResponse(query=request.query, applied_query=query_to_use,
                    **generate_visual_answer(query_to_use, request._images, request._image_observations, history, telemetry_config, **generation_options))
            return ChatResponse(query=request.query, applied_query=query_to_use,
                **generate_conversational_answer(query_to_use, analysis.intent, history, telemetry_config, **generation_options))
        
        if emit:
            emit("status", {"stage": "retrieving"})
        # Run hybrid search (dense + sparse)
        search_response = hybrid_search(
            user_id=request.user_id,
            query=query_to_use,
            top_k=max(request.top_k, 20),
            document_id=request.document_id,
            document_ids=request.document_ids,
            notebook_id=request.notebook_id,
        )

        if emit:
            emit("status", {"stage": "reranking"})
        # Rerank chunks using Cross-Encoder
        reranked_chunks = reranker_with_cross_encoder(
            query=query_to_use,
            candidate_chunks=search_response,
            top_k=request.top_k
        )

        reranked_chunks = relevant_chunks(reranked_chunks)
        ingestion_active = is_user_ingesting(user_id=request.user_id, document_id=request.document_id)
        if len(reranked_chunks) == 0 and ingestion_active and not request._images:
            return ChatResponse(
                query=request.query,
                applied_query=query_to_use,
                answer="One or more documents are still being processed and indexed. Please wait a moment and try again.",
                citations=[],
                is_grounded=False,
            )

        if request._images:
            return ChatResponse(query=request.query, applied_query=query_to_use,
                **generate_visual_answer(query_to_use, request._images, request._image_observations,
                    history, telemetry_config, chunks=reranked_chunks, **generation_options))

        if not reranked_chunks:
            return ChatResponse(query=request.query, applied_query=query_to_use,
                **generate_conversational_answer(query_to_use, "general_knowledge", history, telemetry_config, **generation_options))

        # Generate grounded answer with citations
        generation_result = generate_answer(
            query=query_to_use,
            chunks=reranked_chunks,
            config=telemetry_config,
            **generation_options,
        )

        result = ChatResponse(
            query=request.query,
            applied_query=query_to_use,
            answer=generation_result["answer"],
            citations=generation_result["citations"],
            is_grounded=True,
        )

        if emit:
            emit("status", {"stage": "saving"})
        if len(reranked_chunks) > 0 and not ingestion_active and not request.history and not request._images:
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
        logger.error("Chat generation failed (%s)", type(e).__name__)
        raise HTTPException(status_code=500, detail="Could not generate an answer; retry your message") from None


def _agent_answer_sync(request: ChatRequest, emit=None) -> AgentChatResponse:
    generation_options = {"emit": emit} if emit else {}
    if emit:
        emit("status", {"stage": "analyzing"})
    cached_response = None if request.history or request._images or request.attachment_ids else get_cached_response(
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
        analysis = analyze_query(request._image_query or request.query, config=telemetry_config, history=history)
        query_to_use = analysis.rewritten_query if analysis and analysis.rewritten_query else request._image_query or request.query
        if analysis and analysis.intent in ("casual_chat", "general_knowledge"):
            if request._images and (analysis.intent != "casual_chat" or request.attachment_ids):
                return AgentChatResponse(query=request.query, applied_query=query_to_use, iteration_count=0,
                    **generate_visual_answer(query_to_use, request._images, request._image_observations, history, telemetry_config, **generation_options))
            return AgentChatResponse(query=request.query, applied_query=query_to_use, iteration_count=0,
                **generate_conversational_answer(query_to_use, analysis.intent, history, telemetry_config, **generation_options))
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
            "images": request._images,
            "image_observations": request._image_observations,
        }

        if emit:
            # Drafts and rejected attempts remain private. Stream only the final
            # composition from the evidence selected by the existing graph.
            emit("status", {"stage": "reviewing_sources"})
            result = dict(initial_state)
            for update in graph.stream(initial_state, config=telemetry_config, stream_mode="updates"):
                for node, values in update.items():
                    result.update(values)
                    emit("status", {"stage": {
                        "planner_node": "retrieving", "retriever_node": "drafting",
                        "generator_node": "reflecting", "reflection_node": "reviewing_sources",
                    }.get(node, "reviewing_sources")})
            selected = result.get("documents", [])
            query_to_use = result.get("rewritten_query") or query_to_use
            def final_emit(name, data):
                # Source metadata can render with tokens; the grounding grade
                # remains unknown until this exact answer passes reflection.
                emit(name, {**data, "is_grounded": None} if name == "citations" and selected and not request._images else data)
            if request._images:
                final_answer = generate_visual_answer(query_to_use, request._images,
                    request._image_observations, history, telemetry_config, chunks=selected, emit=final_emit)
            elif selected:
                final_answer = generate_answer(query_to_use, selected, config=telemetry_config, emit=final_emit)
            elif result.get("intent") == "general_knowledge":
                final_answer = generate_conversational_answer(query_to_use, "general_knowledge",
                    history, telemetry_config, emit=emit)
            else:
                # Deterministic ingestion notices don't invoke another model.
                final_answer = {"answer": result.get("answer", "No answer could be generated."),
                    "citations": result.get("citations", [])}
            result.update(final_answer)
            if selected or request._images:
                from agents.nodes import reflection_node
                emit("status", {"stage": "reflecting"})
                final_config = {**(telemetry_config or {}), "configurable": {
                    **(telemetry_config or {}).get("configurable", {}), "strict_reflection": True}}
                # This grade describes exactly the visible, persisted answer.
                # Never retry generation after exposing that answer to a client.
                result.update(reflection_node(result, final_config))
        else:
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
        if emit:
            emit("status", {"stage": "saving"})
        if len(result.citations) > 0 and not ingestion_active and not request.history and not request._images:
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
        logger.error("Agent generation failed (%s)", type(e).__name__)
        raise HTTPException(status_code=500, detail="Could not generate an answer; retry your message") from None


async def _linear_answer(request: ChatRequest, emit=None) -> ChatResponse:
    return await asyncio.to_thread(_linear_answer_sync, request, emit)


async def _agent_answer(request: ChatRequest, emit=None) -> AgentChatResponse:
    return await asyncio.to_thread(_agent_answer_sync, request, emit)


async def _prepare_chat(request, user, db, pipeline):
    check_user_id(request.user_id, user)
    request.user_id = user.id
    conversation = await history_store.own_conversation(db, user.id, request.conversation_id, request.notebook_id)
    request.notebook_id = str(conversation["notebookId"])
    fingerprint = history_store.request_hash(request, pipeline)
    previous = await history_store.replay(db, request.conversation_id, request.request_id, fingerprint)
    if previous:
        return conversation, fingerprint, previous
    selected = request.document_ids if request.document_ids is not None else (
        [request.document_id] if request.document_id else None)
    documents = await history_store.resolve_documents(db, user.id, request.notebook_id, selected)
    if request.document_id:
        await history_store.resolve_documents(db, user.id, request.notebook_id, [request.document_id])
    for attachment_id in request.attachment_ids:
        row = await attachment_store.owned_attachment(db, user.id, attachment_id)
        if str(row["conversationId"]) != str(conversation["id"]) or str(row["notebookId"]) != request.notebook_id:
            raise HTTPException(404, "Image attachment not found in this conversation")
        if row["state"] != "pending":
            raise HTTPException(409, "This image is already attached to a saved message")
    request.document_ids = documents
    return conversation, fingerprint, None


async def _persistent_chat(request, user, db, pipeline, emit=None, prepared=None):
    conversation, fingerprint, previous = prepared or await _prepare_chat(request, user, db, pipeline)
    if previous:
        return previous
    if emit:
        emit("status", {"stage": "loading_history"})
    # Database history is authoritative, even if a caller forges request.history.
    request.history = [HistoryMessage(**item) for item in await history_store.canonical_history(db, request.conversation_id)]
    request._attachment_items, request._images = await attachment_store.resolve(db, user.id, conversation, request.attachment_ids)
    if request._images:
        if emit:
            emit("status", {"stage": "observing_images"})
        try:
            observation = await asyncio.to_thread(observe_images, request.query, request._images,
                [item.model_dump() for item in request.history])
        except Exception:
            raise HTTPException(502, "The image could not be understood; retry your message") from None
        request._image_query = observation.search_query
        request._image_observations = observation.observations
        request._current_observations = observation.observations
    else:
        request._images, request._image_observations = await attachment_store.previous_images(db, user.id, conversation)
    answer = await (_agent_answer(request, emit) if pipeline == "agent" else _linear_answer(request, emit))
    if emit:
        emit("status", {"stage": "saving"})
    payload = {**answer.model_dump(), "attachments": request._attachment_items,
               "image_observations": request._image_observations if request._images else []}
    return await history_store.save_turn(db, user.id, conversation, request, payload, pipeline, fingerprint)


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, http_request: Request, user: AuthUser = Depends(require_user), db=Depends(get_db)):
    return await _chat_response(request, http_request, user, db, "linear")


@router.post("/agent/chat", response_model=AgentChatResponse)
async def agent_chat(request: ChatRequest, http_request: Request, user: AuthUser = Depends(require_user), db=Depends(get_db)):
    return await _chat_response(request, http_request, user, db, "agent")


async def _chat_response(request, http_request, user, db, pipeline):
    # Reject unauthenticated, foreign scopes and fingerprint conflicts with the
    # usual HTTP status before any progress events or provider calls.
    prepared = await _prepare_chat(request, user, db, pipeline)
    if "text/event-stream" in http_request.headers.get("accept", "").lower():
        return chat_stream(http_request, lambda emit:
            _persistent_chat(request, user, db, pipeline, emit, prepared))
    return await _persistent_chat(request, user, db, pipeline, prepared=prepared)

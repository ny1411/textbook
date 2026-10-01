import asyncio
import os
import sys
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from routers import chat as chat_router
from agents import nodes
from services.conversation import GENERAL_KNOWLEDGE_WARNING, relevant_chunks


@pytest.fixture
def pipeline(monkeypatch):
    monkeypatch.setattr(chat_router, "get_cached_response", lambda **kwargs: None)
    monkeypatch.setattr(chat_router, "set_cached_response", lambda **kwargs: None)
    monkeypatch.setattr(chat_router, "create_langfuse_config", lambda **kwargs: {})
    monkeypatch.setattr(chat_router, "is_user_ingesting", lambda **kwargs: False)
    monkeypatch.setattr(nodes, "is_user_ingesting", lambda **kwargs: False)
    monkeypatch.setattr(chat_router, "analyze_query", lambda *args, **kwargs: SimpleNamespace(
        intent="textbook_rag", rewritten_query="Explain backpropagation with an example", sub_queries=[]))
    monkeypatch.setattr(chat_router, "hybrid_search", lambda **kwargs: [])
    monkeypatch.setattr(chat_router, "reranker_with_cross_encoder", lambda **kwargs: kwargs["candidate_chunks"])
    monkeypatch.setattr(nodes, "hybrid_search", lambda **kwargs: [])
    monkeypatch.setattr(nodes, "reranker_with_cross_encoder", lambda **kwargs: kwargs["candidate_chunks"])

    def conversational(query, intent, history=None, config=None):
        return {"answer": "Example answer", "citations": [], "intent": intent,
                "is_grounded": False,
                "warning": GENERAL_KNOWLEDGE_WARNING if intent == "general_knowledge" else None}

    monkeypatch.setattr(chat_router, "generate_conversational_answer", conversational)
    monkeypatch.setattr(nodes, "generate_conversational_answer", conversational)
    return monkeypatch


@pytest.mark.parametrize("endpoint", [chat_router.chat, chat_router.agent_chat])
@pytest.mark.parametrize("intent", ["casual_chat", "general_knowledge"])
def test_non_rag_intents_bypass_retrieval(pipeline, endpoint, intent):
    pipeline.setattr(chat_router, "analyze_query", lambda *args, **kwargs: SimpleNamespace(
        intent=intent, rewritten_query="hello", sub_queries=[]))

    def forbidden(**kwargs):
        raise AssertionError("Retrieval must be bypassed")

    pipeline.setattr(chat_router, "hybrid_search", forbidden)
    pipeline.setattr(chat_router.graph, "invoke", forbidden)
    result = asyncio.run(endpoint(chat_router.ChatRequest(user_id="user", query="hello")))
    assert result.intent == intent
    assert result.citations == []
    assert result.is_grounded is False
    assert bool(result.warning) == (intent == "general_knowledge")


@pytest.mark.parametrize("endpoint", [chat_router.chat, chat_router.agent_chat])
def test_empty_retrieval_falls_back_without_false_grounding(pipeline, endpoint):
    result = asyncio.run(endpoint(chat_router.ChatRequest(user_id="user", query="explain this")))
    assert result.intent == "general_knowledge"
    assert result.warning == GENERAL_KNOWLEDGE_WARNING
    assert result.is_grounded is False
    assert result.citations == []
    if endpoint is chat_router.agent_chat:
        assert result.iteration_count == 1


@pytest.mark.parametrize("endpoint", [chat_router.chat, chat_router.agent_chat])
def test_followup_uses_history_and_preserves_retrieval_scope(pipeline, endpoint):
    calls = []
    history = [{"role": "user", "content": "What is backpropagation?"}]

    def analyze(query, config=None, history=None):
        assert history == [{"role": "user", "content": "What is backpropagation?"}]
        return SimpleNamespace(intent="textbook_rag", rewritten_query="backpropagation example", sub_queries=[])

    def retrieve(**kwargs):
        calls.append(kwargs)
        return []

    def forbidden(**kwargs):
        raise AssertionError("History requests must bypass cache reads and writes")

    pipeline.setattr(chat_router, "analyze_query", analyze)
    pipeline.setattr(chat_router, "get_cached_response", forbidden)
    pipeline.setattr(chat_router, "set_cached_response", forbidden)
    pipeline.setattr(chat_router, "hybrid_search", retrieve)
    pipeline.setattr(nodes, "hybrid_search", retrieve)
    result = asyncio.run(endpoint(chat_router.ChatRequest(
        user_id="user", query="give an example of that", history=history,
        notebook_id="notebook", document_ids=["doc"])))
    assert result.applied_query == "backpropagation example"
    assert calls
    assert all(call["query"] == "backpropagation example" and
               call["notebook_id"] == "notebook" and call["document_ids"] == ["doc"] for call in calls)


def test_relevance_threshold_rejects_low_scores(monkeypatch):
    monkeypatch.setenv("CHAT_MIN_RERANK_SCORE", "0")
    chunks = [{"rerank_score": -3}, {"rerank_score": 2}, {}]
    assert relevant_chunks(chunks) == [chunks[1]]


def test_low_relevance_results_trigger_general_fallback(pipeline):
    pipeline.setattr(chat_router, "hybrid_search", lambda **kwargs: [{"rerank_score": -10}])
    result = asyncio.run(chat_router.chat(chat_router.ChatRequest(user_id="user", query="question")))
    assert result.intent == "general_knowledge"
    assert result.citations == []


@pytest.mark.parametrize("endpoint", [chat_router.chat, chat_router.agent_chat])
def test_ingestion_notice_is_preserved(pipeline, endpoint):
    pipeline.setattr(chat_router, "is_user_ingesting", lambda **kwargs: True)
    pipeline.setattr(nodes, "is_user_ingesting", lambda **kwargs: True)
    result = asyncio.run(endpoint(chat_router.ChatRequest(user_id="user", query="question")))
    assert "still being processed" in result.answer
    assert result.warning is None
    assert result.is_grounded is False


@pytest.mark.parametrize("endpoint", [chat_router.chat, chat_router.agent_chat])
def test_relevant_sources_keep_grounded_generation(pipeline, endpoint):
    chunk = {"id": "chunk", "rerank_score": 4, "payload": {"text": "Backpropagation example"}}
    citation = {"source_id": 1, "chunk_id": "chunk", "text": "Backpropagation example"}
    pipeline.setattr(chat_router, "hybrid_search", lambda **kwargs: [chunk])
    pipeline.setattr(nodes, "hybrid_search", lambda **kwargs: [chunk])

    def grounded(query, chunks, config=None):
        assert query == "Explain backpropagation with an example"
        assert chunks == [chunk]
        return {"answer": "Example [Source 1]", "citations": [citation]}

    pipeline.setattr(chat_router, "generate_answer", grounded)
    pipeline.setattr(nodes, "generate_answer", grounded)
    pipeline.setattr(nodes, "evaluator_chain", SimpleNamespace(invoke=lambda *args, **kwargs: SimpleNamespace(
        is_grounded=True, confidence_score=95, critique="Supported")))
    result = asyncio.run(endpoint(chat_router.ChatRequest(user_id="user", query="give an example")))
    assert result.intent == "textbook_rag"
    assert result.is_grounded is True
    assert result.warning is None
    assert result.citations[0].chunk_id == "chunk"

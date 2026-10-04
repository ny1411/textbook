import asyncio
import os
import sys
from types import SimpleNamespace, ModuleType
from pathlib import Path
from unittest.mock import patch
import importlib

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
# Run the real routing policy and LangGraph nodes without initializing remote
# clients, downloading retrieval models, or requiring provider credentials.
from langchain_core.runnables import RunnableLambda

def isolated_pipeline():
    def stub(name, **values):
        module = ModuleType(name)
        module.__dict__.update(values)
        return module
    root = Path(__file__).resolve().parents[1]
    routers = stub("routers", __path__=[str(root / "routers")])
    external = {
        "routers": routers,
        "db.supabase": stub("db.supabase", supabase_client=SimpleNamespace()),
        "core.llm": stub("core.llm", get_llm=lambda **kwargs: SimpleNamespace(with_structured_output=lambda schema: RunnableLambda(lambda data: None))),
        "core.telemetry": stub("core.telemetry", create_langfuse_config=lambda **kwargs: {}),
        "services.analyzer": stub("services.analyzer", analyze_query=lambda *args, **kwargs: None, QueryAnalysis=SimpleNamespace),
        "services.retriever": stub("services.retriever", hybrid_search=lambda **kwargs: []),
        "services.reranker": stub("services.reranker", reranker_with_cross_encoder=lambda **kwargs: []),
        "services.generator": stub("services.generator", generate_answer=lambda **kwargs: {}),
        "services.status": stub("services.status", is_user_ingesting=lambda **kwargs: False),
        "services.caching": stub("services.caching", get_cached_response=lambda **kwargs: None, set_cached_response=lambda **kwargs: None),
    }
    with patch.dict(sys.modules, external):
        chat = importlib.import_module("routers.chat")
        nodes = importlib.import_module("agents.nodes")
        conversation = importlib.import_module("services.conversation")
    return chat, nodes, conversation

chat_router, nodes, conversation = isolated_pipeline()
GENERAL_KNOWLEDGE_WARNING, relevant_chunks = conversation.GENERAL_KNOWLEDGE_WARNING, conversation.relevant_chunks
CONVERSATION_ID = "11111111-1111-4111-8111-111111111111"
NOTEBOOK_ID = "22222222-2222-4222-8222-222222222222"
DOCUMENT_ID = "33333333-3333-4333-8333-333333333333"

def request(**kwargs):
    return chat_router.ChatRequest(conversation_id=CONVERSATION_ID, **kwargs)


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


@pytest.mark.parametrize("endpoint", [chat_router._linear_answer, chat_router._agent_answer])
@pytest.mark.parametrize("intent", ["casual_chat", "general_knowledge"])
def test_non_rag_intents_bypass_retrieval(pipeline, endpoint, intent):
    pipeline.setattr(chat_router, "analyze_query", lambda *args, **kwargs: SimpleNamespace(
        intent=intent, rewritten_query="hello", sub_queries=[]))

    def forbidden(**kwargs):
        raise AssertionError("Retrieval must be bypassed")

    pipeline.setattr(chat_router, "hybrid_search", forbidden)
    pipeline.setattr(chat_router.graph, "invoke", forbidden)
    result = asyncio.run(endpoint(request(user_id="user", query="hello")))
    assert result.intent == intent
    assert result.citations == []
    assert result.is_grounded is False
    assert bool(result.warning) == (intent == "general_knowledge")


@pytest.mark.parametrize("endpoint", [chat_router._linear_answer, chat_router._agent_answer])
def test_empty_retrieval_falls_back_without_false_grounding(pipeline, endpoint):
    result = asyncio.run(endpoint(request(user_id="user", query="explain this")))
    assert result.intent == "general_knowledge"
    assert result.warning == GENERAL_KNOWLEDGE_WARNING
    assert result.is_grounded is False
    assert result.citations == []
    if endpoint is chat_router._agent_answer:
        assert result.iteration_count == 1


@pytest.mark.parametrize("endpoint", [chat_router._linear_answer, chat_router._agent_answer])
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
    result = asyncio.run(endpoint(request(
        user_id="user", query="give an example of that", history=history,
        notebook_id=NOTEBOOK_ID, document_ids=[DOCUMENT_ID])))
    assert result.applied_query == "backpropagation example"
    assert calls
    assert all(call["query"] == "backpropagation example" and
               call["notebook_id"] == NOTEBOOK_ID and call["document_ids"] == [DOCUMENT_ID] for call in calls)


def test_relevance_threshold_rejects_low_scores(monkeypatch):
    monkeypatch.setenv("CHAT_MIN_RERANK_SCORE", "0")
    chunks = [{"rerank_score": 0.05, "rerank_logit": -3},
              {"rerank_score": 0.88, "rerank_logit": 2}, {}]
    assert relevant_chunks(chunks) == [chunks[1]]


def test_low_relevance_results_trigger_general_fallback(pipeline):
    pipeline.setattr(chat_router, "hybrid_search", lambda **kwargs: [{"rerank_score": 0.00005, "rerank_logit": -10}])
    result = asyncio.run(chat_router._linear_answer(request(user_id="user", query="question")))
    assert result.intent == "general_knowledge"
    assert result.citations == []


@pytest.mark.parametrize("endpoint", [chat_router._linear_answer, chat_router._agent_answer])
def test_ingestion_notice_is_preserved(pipeline, endpoint):
    pipeline.setattr(chat_router, "is_user_ingesting", lambda **kwargs: True)
    pipeline.setattr(nodes, "is_user_ingesting", lambda **kwargs: True)
    result = asyncio.run(endpoint(request(user_id="user", query="question")))
    assert "still being processed" in result.answer
    assert result.warning is None
    assert result.is_grounded is False


@pytest.mark.parametrize("endpoint", [chat_router._linear_answer, chat_router._agent_answer])
def test_relevant_sources_keep_grounded_generation(pipeline, endpoint):
    chunk = {"id": "chunk", "rerank_score": 0.98, "rerank_logit": 4,
             "payload": {"text": "Backpropagation example"}}
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
    result = asyncio.run(endpoint(request(user_id="user", query="give an example")))
    assert result.intent == "textbook_rag"
    assert result.is_grounded is True
    assert result.warning is None
    assert result.citations[0].chunk_id == "chunk"

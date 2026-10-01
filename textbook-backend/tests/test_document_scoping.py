import os
import sys
from types import SimpleNamespace

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.caching import _make_key
from services import indexing
from services import retriever
from services.retriever import _resolve_target_documents


def test_explicit_empty_document_selection_stays_empty():
    assert _resolve_target_documents(document_id=None, document_ids=[]) == []


def test_explicit_empty_document_selection_skips_vector_search(monkeypatch):
    def fail_if_called(*args, **kwargs):
        raise AssertionError("Vector generation must not run without selected documents")

    monkeypatch.setattr(retriever, "get_vectors", fail_if_called)

    assert retriever.hybrid_search(
        user_id="user-1",
        query="What is RAG?",
        document_ids=[],
    ) == []


def test_document_scope_is_deduplicated_and_preserves_order():
    assert _resolve_target_documents(
        document_id="doc-b",
        document_ids=["doc-a", "doc-b", "doc-a"],
    ) == ["doc-a", "doc-b"]


def test_hybrid_search_applies_notebook_and_multi_document_filters(monkeypatch):
    query_calls = []

    monkeypatch.setattr(retriever, "get_vectors", lambda *args, **kwargs: ([0.1], {"indices": [1], "values": [1.0]}))
    monkeypatch.setattr(
        retriever.client,
        "query_points",
        lambda **kwargs: query_calls.append(kwargs) or SimpleNamespace(points=[]),
    )

    retriever.hybrid_search(
        user_id="user-1",
        query="What is RAG?",
        notebook_id="notebook-1",
        document_ids=["doc-a", "doc-b"],
    )

    assert len(query_calls) == 2
    for call in query_calls:
        conditions = {condition.key: condition.match for condition in call["query_filter"].must}
        assert conditions["user_id"].value == "user-1"
        assert conditions["notebook_id"].value == "notebook-1"
        assert conditions["document_id"].any == ["doc-a", "doc-b"]


def test_cache_key_is_stable_for_document_order():
    first = _make_key(
        user_id="user-1",
        query="What is RAG?",
        notebook_id="notebook-1",
        document_ids=["doc-b", "doc-a"],
    )
    second = _make_key(
        user_id="user-1",
        query=" what is rag? ",
        notebook_id="notebook-1",
        document_ids=["doc-a", "doc-b"],
    )

    assert first == second


def test_cache_key_changes_with_retrieval_scope_and_pipeline():
    base = {
        "user_id": "user-1",
        "query": "What is RAG?",
        "notebook_id": "notebook-1",
        "document_ids": ["doc-a"],
    }

    assert _make_key(**base) != _make_key(**{**base, "notebook_id": "notebook-2"})
    assert _make_key(**base) != _make_key(**{**base, "document_ids": ["doc-b"]})
    assert _make_key(**base) != _make_key(**base, pipeline="agent")
    assert _make_key(**base) != _make_key(**base, top_k=10)
    assert _make_key(**base) != _make_key(**base, use_analysis=True)


def test_payload_index_migration_creates_only_missing_indexes(monkeypatch):
    existing_schema = {
        "user_id": SimpleNamespace(
            data_type=indexing.models.PayloadSchemaType.KEYWORD,
            params=None,
        ),
    }
    created_indexes = []

    monkeypatch.setattr(
        indexing.client,
        "get_collection",
        lambda collection_name: SimpleNamespace(payload_schema=existing_schema),
    )
    monkeypatch.setattr(
        indexing.client,
        "create_payload_index",
        lambda **kwargs: created_indexes.append(kwargs),
    )

    indexing.ensure_payload_indexes(
        payload_indexes=[
            {"field_name": "user_id", "field_schema": "keyword"},
            {"field_name": "notebook_id", "field_schema": "keyword", "is_tenant": True},
        ]
    )

    assert len(created_indexes) == 1
    assert created_indexes[0]["field_name"] == "notebook_id"
    assert created_indexes[0]["field_schema"].is_tenant is True
    assert created_indexes[0]["wait"] is True

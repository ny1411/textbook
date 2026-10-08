"""Two-account route verification with disposable SQL and real vector/cache scoping.

Only provider seams (Auth service, Storage, embeddings, LLM, speech) are synthetic;
this suite never uses production credentials or contacts external services.
"""
import asyncio
import copy
import fnmatch
import importlib.util
import io
import sys
from types import ModuleType, SimpleNamespace
from uuid import uuid4

import httpx
import pytest
from PIL import Image
from qdrant_client import QdrantClient, models

import history_fixture as fixture
from history_fixture import database, token, USER_A, USER_B


def source_module(name, filename):
    spec = importlib.util.spec_from_file_location(name, fixture.BACKEND / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class LocalRedis:
    def __init__(self):
        self.data = {}
        self.json = SimpleNamespace(get=lambda key: copy.deepcopy(self.data.get(key)),
            set=lambda key, path, value: self.data.__setitem__(key, copy.deepcopy(value)))
    def expire(self, key, seconds):
        return True
    def scan(self, cursor, match, count):
        return 0, [key for key in self.data if fnmatch.fnmatchcase(key, match)]
    def delete(self, *keys):
        for key in keys:
            self.data.pop(key, None)


def tenant_app(db, monkeypatch):
    fixture.EVENTS.clear(); fixture.CACHE.clear(); fixture.OBJECTS.clear(); fixture.POINTS.clear()
    app = fixture.build_app(db)
    vectors = QdrantClient(location=":memory:", force_disable_check_same_thread=True)
    vectors.create_collection("textbook_chunks", vectors_config={"dense-text": models.VectorParams(size=2, distance=models.Distance.COSINE)},
        sparse_vectors_config={"sparse-text": models.SparseVectorParams()})
    embeddings = ModuleType("services.embedder")
    embeddings.get_vectors = lambda *args, **kwargs: ([1., 0.], models.SparseVector(indices=[1], values=[1.]))
    monkeypatch.setitem(sys.modules, "services.embedder", embeddings)
    retrieval = source_module("tenant_retriever", "services/retriever.py")
    retrieval.client = vectors
    caching = source_module("tenant_cache", "services/caching.py")
    caching.redis = LocalRedis()
    calls = {"retrieval": [], "speech": [], "ingestion": []}
    def retrieve(**kwargs):
        scope = {key: kwargs.get(key) for key in ("user_id", "query", "top_k", "document_id", "document_ids", "notebook_id")}
        if scope["top_k"] is None:
            scope["top_k"] = 20
        calls["retrieval"].append(scope)
        return retrieval.hybrid_search(**scope)
    def ingest(**kwargs):
        calls["ingestion"].append(kwargs)
        payload = {key: kwargs[key] for key in ("user_id", "notebook_id", "document_id")}
        payload["text"] = f'{kwargs["user_id"]}:{kwargs["notebook_id"]}:{kwargs["filename"]} private evidence'
        payload["page_number"] = 1
        vectors.upsert("textbook_chunks", points=[models.PointStruct(id=str(uuid4()), vector={
            "dense-text": [1., 0.], "sparse-text": models.SparseVector(indices=[1], values=[1.])}, payload=payload)])
        return True
    rerank = lambda query, candidate_chunks, top_k: [{**item, "rerank_score": .9} for item in candidate_chunks[:top_k]]
    from routers import chat, search, upload
    for router in (chat, search):
        monkeypatch.setattr(router, "hybrid_search", retrieve)
        monkeypatch.setattr(router, "reranker_with_cross_encoder", rerank)
    # Exercise the actual LangGraph planner/retriever/generator/reflection
    # nodes, retaining only deterministic model/provider seams.
    from langchain_core.runnables import RunnableLambda
    structured = lambda schema: RunnableLambda(lambda prompt: schema(is_grounded=True,
        confidence_score=90, critique="Supported by the selected tenant's sources"))
    monkeypatch.setattr(sys.modules["core.llm"], "get_llm",
        lambda **kwargs: SimpleNamespace(with_structured_output=structured))
    monkeypatch.setattr(sys.modules["services.analyzer"], "QueryAnalysis", SimpleNamespace, raising=False)
    monkeypatch.setitem(sys.modules, "agents.state", source_module("agents.state", "agents/state.py"))
    nodes = source_module("agents.nodes", "agents/nodes.py")
    nodes.hybrid_search, nodes.reranker_with_cross_encoder = retrieve, rerank
    monkeypatch.setitem(sys.modules, "agents.nodes", nodes)
    graph = source_module("agents.graph", "agents/graph.py").graph
    monkeypatch.setattr(chat, "graph", graph)
    monkeypatch.setattr(fixture, "retrieve", retrieve)
    monkeypatch.setattr(upload, "process_and_ingest", ingest)
    monkeypatch.setattr(sys.modules["services.ingestion"], "process_and_ingest", ingest)
    monkeypatch.setattr(sys.modules["db.qdrant"], "client", vectors)
    monkeypatch.setattr(chat, "get_cached_response", caching.get_cached_response)
    monkeypatch.setattr(chat, "set_cached_response", caching.set_cached_response)
    monkeypatch.setattr(sys.modules["services.caching"], "invalidate_user_cache", caching.invalidate_user_cache)
    from routers import voice
    from services import speech
    async def say(text):
        calls["speech"].append(text)
        return speech.SpeechAudio(b"RIFF local fixture", .1)
    monkeypatch.setattr(speech, "synthesize", say)
    monkeypatch.setattr(speech, "limiter", speech.SpeechLimiter())
    app.include_router(voice.router, prefix="/api")
    return app, vectors, caching.redis, calls


def client(app, user_id):
    return httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test",
        headers={"Authorization": "Bearer " + token(user_id)})


async def workspace(api, user_id, second=False):
    notebook = (await api.post("/fixture/notebooks")).json()["id"] if second else (await api.get("/api/notebooks")).json()[0]["id"]
    conversation = (await api.post("/api/conversations", json={"notebook_id": notebook})).json()["id"]
    uploaded = await api.post("/api/upload", params={"userId": user_id, "notebookId": notebook},
        files={"file": ("private-chapter.txt", b"Private chapter", "text/plain")})
    assert uploaded.status_code == 200, uploaded.text
    return notebook, conversation, uploaded.json()["document_id"], uploaded.json()["filepath"]


def chat_body(notebook, conversation, **extra):
    return {"notebook_id": notebook, "conversation_id": conversation, "query": "same question",
        "request_id": str(uuid4()), **extra}


def png():
    output = io.BytesIO()
    Image.new("RGB", (2, 2)).save(output, "PNG")
    return output.getvalue()


async def snapshot(db, vectors, redis, calls):
    rows = {table: (await db.query(f'SELECT COUNT(*) AS count FROM {table}'))[0]["count"]
        for table in ("users", "notebooks", "uploaded_documents", "conversations", "conversation_messages", "chat_attachments", "document_deletions")}
    return rows, sorted(fixture.OBJECTS), vectors.count("textbook_chunks").count, copy.deepcopy(redis.data), copy.deepcopy(calls), len(fixture.EVENTS)


def test_every_research_route_requires_verified_auth_before_side_effects(monkeypatch):
    async def check():
        async with database() as db:
            app, vectors, redis, calls = tenant_app(db, monkeypatch)
            nid, cid, did, aid = [str(uuid4()) for _ in range(4)]
            requests = [
                ("GET", "/api/notebooks", {}),
                ("GET", "/api/conversations", {"params": {"notebook_id": nid}}),
                ("POST", "/api/conversations", {"json": {"notebook_id": nid}}),
                ("GET", f"/api/conversations/{cid}/messages", {}),
                ("GET", "/api/documents", {"params": {"notebook_id": nid}}),
                ("GET", f"/api/documents/{did}/status", {}),
                ("DELETE", "/api/documents", {"params": {"notebook_id": nid, "document_id": did}}),
                ("POST", "/api/documents/sample", {"json": {"notebook_id": nid}}),
                ("POST", "/api/upload", {"params": {"userId": USER_A, "notebookId": nid}, "files": {"file": ("test.txt", b"test", "text/plain")}}),
                ("POST", "/api/search", {"json": {"user_id": USER_A, "query": "test", "notebook_id": nid}}),
                ("POST", "/api/chat", {"json": chat_body(nid, cid)}),
                ("POST", "/api/agent/chat", {"json": chat_body(nid, cid)}),
                ("POST", "/api/chat/attachments", {"data": {"conversation_id": cid, "upload_id": aid}, "files": {"file": ("test.png", png(), "image/png")}}),
                ("GET", f"/api/chat/attachments/{aid}/content", {}),
                ("DELETE", f"/api/chat/attachments/{aid}", {}),
                ("POST", "/api/voice/synthesize", {"json": {"notebook_id": nid, "text": "test"}}),
            ]
            before = await snapshot(db, vectors, redis, calls)
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as api:
                for headers in ({}, {"Authorization": "Bearer forged"}):
                    for method, path, kwargs in requests:
                        response = await api.request(method, path, headers=headers, **kwargs)
                        assert response.status_code == 401, (path, response.text)
            assert await snapshot(db, vectors, redis, calls) == before
            vectors.close()
    asyncio.run(check())


def test_cross_account_and_cross_notebook_denials_do_not_read_providers_or_mutate_state(monkeypatch):
    async def check():
        async with database() as db:
            app, vectors, redis, calls = tenant_app(db, monkeypatch)
            async with client(app, USER_A) as a, client(app, USER_B) as b:
                na, ca, da, _ = await workspace(a, USER_A)
                nb, cb, dbid, _ = await workspace(b, USER_B)
                na2, ca2, da2, _ = await workspace(a, USER_A, second=True)
                aid = str(uuid4())
                image = await a.post("/api/chat/attachments", data={"conversation_id": ca, "upload_id": aid}, files={"file": ("a.png", png(), "image/png")})
                assert image.status_code == 201, image.text
                before = await snapshot(db, vectors, redis, calls)
                denied = [
                    (b, "GET", "/api/documents", {"params": {"notebook_id": na}}, 404),
                    (b, "GET", f"/api/documents/{da}/status", {}, 404),
                    (b, "GET", "/api/conversations", {"params": {"notebook_id": na}}, 404),
                    (b, "GET", f"/api/conversations/{ca}/messages", {}, 404),
                    (b, "POST", "/api/conversations", {"json": {"notebook_id": na}}, 404),
                    (b, "POST", "/api/conversations", {"json": {"notebook_id": nb, "id": ca}}, 404),
                    (b, "POST", "/api/upload", {"params": {"userId": USER_A, "notebookId": nb}, "files": {"file": ("x.txt", b"x", "text/plain")}}, 403),
                    (b, "POST", "/api/upload", {"params": {"userId": USER_B, "notebookId": na}, "files": {"file": ("x.txt", b"x", "text/plain")}}, 404),
                    (b, "POST", "/api/search", {"json": {"user_id": USER_A, "notebook_id": nb, "query": "test"}}, 403),
                    (b, "POST", "/api/search", {"json": {"user_id": USER_B, "notebook_id": na, "query": "test"}}, 404),
                    (b, "POST", "/api/search", {"json": {"user_id": USER_B, "notebook_id": nb, "query": "test", "document_ids": [da]}}, 404),
                    (a, "POST", "/api/search", {"json": {"user_id": USER_A, "notebook_id": na, "query": "test", "document_id": da2}}, 404),
                    (b, "DELETE", "/api/documents", {"params": {"notebook_id": nb, "document_id": da}}, 404),
                    (a, "DELETE", "/api/documents", {"params": {"notebook_id": na2, "document_id": da}}, 404),
                    (b, "POST", "/api/documents/sample", {"json": {"notebook_id": na}}, 404),
                    (b, "POST", "/api/voice/synthesize", {"json": {"notebook_id": na, "text": "Private note"}}, 404),
                    (b, "GET", f"/api/chat/attachments/{aid}/content", {}, 404),
                    (b, "DELETE", f"/api/chat/attachments/{aid}", {}, 204),
                    (b, "POST", "/api/chat/attachments", {"data": {"conversation_id": ca, "upload_id": str(uuid4())}, "files": {"file": ("x.png", png(), "image/png")}}, 404),
                    (b, "POST", "/api/chat/attachments", {"data": {"conversation_id": cb, "upload_id": aid}, "files": {"file": ("a.png", png(), "image/png")}}, 404),
                ]
                for route in ("/api/chat", "/api/agent/chat"):
                    for api, body, status in ((b, chat_body(nb, cb, user_id=USER_A), 403),
                        (b, chat_body(nb, ca), 404), (b, chat_body(nb, cb, document_ids=[da]), 404),
                        (a, chat_body(na2, ca), 404), (a, chat_body(na, ca, document_ids=[da2]), 404),
                        (b, chat_body(nb, cb, attachment_ids=[aid]), 404), (a, chat_body(na2, ca2, attachment_ids=[aid]), 404)):
                        denied.append((api, "POST", route, {"json": body}, status))
                for api, method, path, kwargs, status in denied:
                    response = await api.request(method, path, **kwargs)
                    assert response.status_code == status, (path, response.text)
                assert await snapshot(db, vectors, redis, calls) == before
                assert (await a.get(f"/api/chat/attachments/{aid}/content")).content == png()
                assert (await b.get("/api/notebooks")).json()[0]["id"] == nb
                assert len((await a.get("/api/notebooks")).json()) == 2
            vectors.close()
    asyncio.run(check())


def test_owned_retrieval_chat_cache_history_sample_voice_and_cleanup_stay_in_tenant(monkeypatch):
    async def check():
        async with database() as db:
            app, vectors, redis, calls = tenant_app(db, monkeypatch)
            async with client(app, USER_A) as a, client(app, USER_B) as b:
                na, ca, da, pa = await workspace(a, USER_A)
                nb, cb, dbid, pb = await workspace(b, USER_B)
                na2, ca2, da2, _ = await workspace(a, USER_A, second=True)
                for api, uid, nid, cid, did in ((a, USER_A, na, ca, da), (b, USER_B, nb, cb, dbid), (a, USER_A, na2, ca2, da2)):
                    results = await api.post("/api/search", json={"user_id": uid, "notebook_id": nid, "query": "same question"})
                    assert results.status_code == 200, results.text
                    assert {item["document_id"] for item in results.json()["results"]} == {did}
                    assert all(item["text"].startswith(f"{uid}:{nid}:") for item in results.json()["results"])
                    for route in ("/api/chat", "/api/agent/chat"):
                        saved = await api.post(route, json=chat_body(nid, cid))
                        assert saved.status_code == 200, saved.text
                        assert {item["document_id"] for item in saved.json()["citations"]} == {did}
                    restored = (await api.get(f"/api/conversations/{cid}/messages")).json()["items"]
                    assert len(restored) == 4
                    assert all(item["document_id"] == did for row in restored if row["role"] == "assistant" for item in row["response"]["citations"])
                    assert all(scope["user_id"] in (USER_A, USER_B) for scope in calls["retrieval"])
                assert any(key.startswith(f"cache:{USER_A}:") for key in redis.data)
                assert any(key.startswith(f"cache:{USER_B}:") for key in redis.data)
                # An empty selection never retrieves another tenant as a fallback.
                empty = await a.post("/api/search", json={"user_id": USER_A, "notebook_id": na, "document_ids": [], "query": "same question"})
                assert empty.json()["results"] == []
                for api, uid, nid in ((a, USER_A, na), (b, USER_B, nb)):
                    sample = await api.post("/api/documents/sample", json={"notebook_id": nid})
                    assert sample.status_code == 200, sample.text
                    source = sample.json()["source"]
                    assert source["userId"] == uid and source["notebookId"] == nid
                    assert source["filepath"].startswith(uid + "/")
                    assert (await api.get(f'/api/documents/{source["documentId"]}/status')).json()["status"] == "ready"
                    spoken = await api.post("/api/voice/synthesize", json={"notebook_id": nid, "text": f"{uid} summary"})
                    assert spoken.status_code == 200 and spoken.headers["cache-control"] == "private, no-store"
                # Deleting A's source must leave B's SQL, object, vector and cache intact.
                b_cache = {key: value for key, value in redis.data.items() if key.startswith(f"cache:{USER_B}:")}
                deleted = await a.delete("/api/documents", params={"notebook_id": na, "document_id": da})
                assert deleted.status_code == 200, deleted.text
                assert pa not in fixture.OBJECTS and pb in fixture.OBJECTS
                points = vectors.scroll("textbook_chunks", limit=100)[0]
                assert not any(point.payload["document_id"] == da for point in points)
                assert any(point.payload["document_id"] == dbid for point in points)
                assert (await b.get(f"/api/documents/{dbid}/status")).status_code == 200
                assert {key: value for key, value in redis.data.items() if key.startswith(f"cache:{USER_B}:")} == b_cache
                assert not any(key.startswith(f"cache:{USER_A}:") for key in redis.data)
                assert (await b.get(f"/api/conversations/{cb}/messages")).json()["items"][-1]["response"]["citations"][0]["document_id"] == dbid
            vectors.close()
    asyncio.run(check())

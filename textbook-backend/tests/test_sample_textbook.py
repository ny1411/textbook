"""Real sample SQL/API lifecycle; provider calls remain synthetic."""
import asyncio
import sys
import importlib.util
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import uuid4
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

import httpx
import psycopg
import pytest
from fastapi import HTTPException

import history_fixture
from history_fixture import build_app, database, token, USER_A, USER_B, OBJECTS, POINTS, Storage
from services import sample_textbook as sample
from services.chat_history import resolve_documents


@pytest.fixture(autouse=True)
def sample_database(monkeypatch):
    # Dedicated local fixture only; never read DATABASE_URL or production data.
    monkeypatch.setattr(history_fixture, "DSN", "host=127.0.0.1 port=55422 dbname=postgres user=postgres sslmode=disable connect_timeout=5")


@asynccontextmanager
async def client(db, user_id=USER_A):
    api = httpx.AsyncClient(transport=httpx.ASGITransport(build_app(db)), base_url="http://test",
        headers={"Authorization": "Bearer " + token(user_id)})
    try:
        yield api
    finally:
        await api.aclose()


async def notebook(api):
    return (await api.get("/api/notebooks")).json()[0]["id"]


def load(api, notebook_id):
    return api.post("/api/documents/sample", json={"notebook_id": notebook_id})


def test_sample_is_an_owned_real_document_and_successful_replay_is_free():
    async def check():
        async with database() as db, client(db) as api:
            scope = await notebook(api)
            first = await load(api, scope)
            assert first.status_code == 200
            source = first.json()["source"]
            assert source["sampleKey"] == sample.SAMPLE_KEY and source["status"] == "processing"
            assert source["userId"] == USER_A and source["notebookId"] == scope
            assert OBJECTS[source["filepath"]] == sample.SAMPLE_PATH.read_bytes()
            assert len([point for point in POINTS if point.get("document_id") == source["documentId"]]) == 1
            replay = (await load(api, scope)).json()["source"]
            assert replay["documentId"] == source["documentId"] and replay["status"] == "ready"
            assert len([point for point in POINTS if point.get("document_id") == source["documentId"]]) == 1
            assert (await api.get(f'/api/documents/{source["documentId"]}/status')).json()["status"] == "ready"
            listed = (await api.get(f"/api/documents?notebook_id={scope}")).json()["items"]
            assert len(listed) == 1 and listed[0]["sampleKey"] == sample.SAMPLE_KEY
            assert await resolve_documents(db, USER_A, scope, None) == [source["documentId"]]
            with pytest.raises(psycopg.errors.UniqueViolation):
                async with db.transaction() as tx:
                    await tx.execute('INSERT INTO uploaded_documents (id,"userId","notebookId","sampleKey","updatedAt") '
                        'VALUES (%s::uuid,%s::uuid,%s::uuid,%s,NOW())', str(uuid4()), USER_A, scope, sample.SAMPLE_KEY)
    asyncio.run(check())


def test_loading_is_isolated_by_user_and_notebook():
    async def check():
        async with database() as db, client(db) as api:
            scope = await notebook(api)
            async with client(db, USER_B) as other:
                foreign_scope = await notebook(other)
                before = dict(OBJECTS)
                assert (await load(other, scope)).status_code == 404
                assert (await api.post("/api/documents/sample", json={"notebook_id": scope},
                    headers={"Authorization": "Bearer forged"})).status_code == 401
                assert (await load(api, "invalid")).status_code == 422
                assert OBJECTS == before and not await db.query('SELECT id FROM uploaded_documents')
                mine = (await load(api, scope)).json()["source"]
                theirs = (await load(other, foreign_scope)).json()["source"]
                second_scope = str(uuid4())
                await db.execute('INSERT INTO notebooks (id,"userId","updatedAt") VALUES (%s::uuid,%s::uuid,NOW())', second_scope, USER_A)
                second = (await load(api, second_scope)).json()["source"]
                assert len({mine["documentId"], theirs["documentId"], second["documentId"]}) == 3
                assert theirs["filepath"].startswith(USER_B + "/")
    asyncio.run(check())


def test_loaded_sample_supports_both_chat_citations_and_search():
    async def check():
        async with database() as db, client(db) as api:
            scope = await notebook(api)
            source = (await load(api, scope)).json()["source"]
            conversation = (await api.post("/api/conversations", json={"notebook_id": scope})).json()["id"]
            for endpoint in ("/api/chat", "/api/agent/chat"):
                answer = await api.post(endpoint, json={"user_id": USER_A, "notebook_id": scope, "conversation_id": conversation,
                    "document_ids": [source["documentId"]], "query": "How do dense and sparse retrieval complement each other?"})
                assert answer.status_code == 200
                citations = answer.json()["citations"]
                assert len(citations) == 2 and all(item["document_id"] == source["documentId"] for item in citations)
                assert "Dense retrieval represents" in citations[0]["text"]
            search = await api.post("/api/search", json={"user_id": USER_A, "notebook_id": scope,
                "document_ids": [source["documentId"]], "query": "Dense and sparse retrieval"})
            assert search.status_code == 200 and search.json()["total_results"] == 2
            assert "Dense retrieval represents" in search.json()["results"][0]["text"]
    asyncio.run(check())


@pytest.mark.parametrize("failure", ["storage", "vectors", "ingestion", "metadata_completion"])
def test_retries_reuse_bytes_and_document_and_replace_partial_vectors(monkeypatch, failure):
    async def check():
        async with database() as db, client(db) as api:
            scope = await notebook(api)
            if failure == "storage":
                original = Storage.upload
                def broken(self, path, data, options):
                    original(self, path, data, options)  # Simulate a lost successful provider response.
                    raise ConnectionError("Synthetic upload outage")
                monkeypatch.setattr(Storage, "upload", broken)
            elif failure == "vectors":
                target = sys.modules["db.qdrant"].client
                original = target.delete
                monkeypatch.setattr(target, "delete", lambda **kwargs: (_ for _ in ()).throw(ConnectionError()))
            elif failure == "ingestion":
                target = sys.modules["services.ingestion"]
                original = target.process_and_ingest
                def partial(**kwargs):
                    POINTS.append({key: kwargs[key] for key in ("user_id", "notebook_id", "document_id")})
                    return False
                monkeypatch.setattr(target, "process_and_ingest", partial)
            else:
                original = db.execute
                async def unavailable(sql, *params):
                    if sql.startswith("UPDATE uploaded_documents SET status"):
                        raise RuntimeError("Synthetic completion failure")
                    return await original(sql, *params)
                monkeypatch.setattr(db, "execute", unavailable)
            if failure == "metadata_completion":
                with pytest.raises(RuntimeError):
                    await load(api, scope)
            else:
                assert (await load(api, scope)).status_code == 200
            row = (await db.query('SELECT * FROM uploaded_documents'))[0]
            document = str(row["id"])
            assert row["status"] == ("PROCESSING" if failure == "metadata_completion" else "FAILED")
            assert await resolve_documents(db, USER_A, scope, None) == []
            with pytest.raises(HTTPException):
                await resolve_documents(db, USER_A, scope, [document])
            foreign_point = {"user_id": USER_B, "document_id": document}
            POINTS.append(foreign_point)
            if failure == "storage": monkeypatch.setattr(Storage, "upload", original)
            elif failure == "vectors": monkeypatch.setattr(target, "delete", original)
            elif failure == "ingestion": monkeypatch.setattr(target, "process_and_ingest", original)
            else: monkeypatch.setattr(db, "execute", original)
            # Rebuilding app dependencies models a process restart; SQL alone
            # remembers the reservation, with no local idempotency registry.
            build_app(db)
            retry = (await load(api, scope)).json()["source"]
            assert retry["documentId"] == document and retry["filepath"] == row["storageUrl"]
            assert len(await db.query('SELECT id FROM uploaded_documents')) == 1
            assert OBJECTS[row["storageUrl"]] == sample.SAMPLE_PATH.read_bytes()
            assert foreign_point in POINTS
            assert len([point for point in POINTS if point.get("document_id") == document and point.get("user_id") == USER_A]) == 1
            assert (await api.get(f"/api/documents/{document}/status")).json()["status"] == "ready"
    asyncio.run(check())


def test_sample_delete_then_reload_has_a_new_owned_identity():
    async def check():
        async with database() as db, client(db) as api:
            scope = await notebook(api)
            first = (await load(api, scope)).json()["source"]
            deleted = await api.delete(f'/api/documents?document_id={first["documentId"]}&notebook_id={scope}')
            assert deleted.status_code == 200 and first["filepath"] not in OBJECTS
            second = (await load(api, scope)).json()["source"]
            assert first["documentId"] != second["documentId"]
            assert len(await db.query('SELECT id FROM uploaded_documents')) == 1
    asyncio.run(check())


def test_pending_sample_deletion_blocks_reloading_and_background_indexing(monkeypatch):
    async def check():
        async with database() as db, client(db) as api:
            scope = await notebook(api)
            source, data = await sample.reserve_sample(db, USER_A, scope)
            await db.execute('INSERT INTO document_deletions ("documentId","userId","notebookId","storagePath") '
                'VALUES (%s::uuid,%s::uuid,%s::uuid,%s)', source["documentId"], USER_A, scope, source["filepath"])
            monkeypatch.setattr(sample, "index_sample", lambda **kwargs: pytest.fail("Deleted sample must not index"))
            assert (await load(api, scope)).status_code == 409
            await sample.persist_sample_ingestion(db, USER_A, scope, source["documentId"], data)
    asyncio.run(check())


def test_sample_never_overwrites_a_foreign_or_unexpected_storage_path(monkeypatch):
    async def check():
        async with database() as db, client(db) as api:
            scope = await notebook(api)
            source, data = await sample.reserve_sample(db, USER_A, scope)
            await db.execute('UPDATE uploaded_documents SET "storageUrl" = %s WHERE id = %s::uuid',
                USER_B + "/another-document.txt", source["documentId"])
            monkeypatch.setattr(sample, "index_sample", lambda **kwargs: pytest.fail("Unexpected storage path reached indexing"))
            assert (await load(api, scope)).status_code == 409
            await sample.persist_sample_ingestion(db, USER_A, scope, source["documentId"], data)
            assert (await api.get(f'/api/documents/{source["documentId"]}/status')).json()["status"] == "failed"
    asyncio.run(check())


def test_bundled_text_is_original_licensed_and_supports_the_prompts():
    text = sample.SAMPLE_PATH.read_text()
    assert 5000 < len(text) < 15000 and "SPDX-License-Identifier: CC0-1.0" in text
    for concept in ("Reciprocal rank fusion", "Recall@5 is 3/4 = 0.75", "Precision@5 of 3/5 = 0.60", "prompt injection", "Citation quality"):
        assert concept in " ".join(text.split())


def test_actual_sample_parser_chunker_and_ingestion_payloads_without_model_downloads():
    from pathlib import Path
    from qdrant_client import models
    root = Path(__file__).resolve().parents[1]
    points, invalidated, statuses = [], [], []
    def module(name, **values):
        value = ModuleType(name)
        value.__dict__.update(values)
        return value
    def vectors(texts, is_query):
        assert is_query is False
        return [[0.25] for _ in texts], [models.SparseVector(indices=[1], values=[1.0]) for _ in texts]
    fake = {
        "services.embedder": module("services.embedder", get_vectors=vectors, bge_large_embedder=lambda: pytest.fail("Sample uses parent-child chunking")),
        "langchain_experimental.text_splitter": module("langchain_experimental.text_splitter", SemanticChunker=object),
        "db.qdrant": module("db.qdrant", client=SimpleNamespace(upsert=lambda collection_name, points: globals_point_extend(collection_name, points))),
        "services.caching": module("services.caching", invalidate_user_cache=lambda user_id: invalidated.append(user_id)),
        "services.status": module("services.status", set_document_status=lambda **kwargs: statuses.append(kwargs)),
    }
    def globals_point_extend(collection_name, batch):
        assert collection_name == "textbook_chunks"
        points.extend(batch)
    def load_actual(name, path):
        spec = importlib.util.spec_from_file_location(name, path)
        actual = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(actual)
        return actual
    with patch.dict(sys.modules, fake):
        chunker = load_actual("sample_actual_chunker", root / "services/chunker.py")
        with patch.dict(sys.modules, {"services.chunker": chunker}):
            ingestion = load_actual("sample_actual_ingestion", root / "services/ingestion.py")
            success = ingestion.process_and_ingest(file_bytes=sample.SAMPLE_PATH.read_bytes(), filename=sample.SAMPLE_FILENAME,
                content_type=sample.SAMPLE_TYPE, user_id=USER_A, notebook_id="fixture-notebook", document_id="fixture-document")
    assert success is True and len(points) > 15 and invalidated == [USER_A]
    assert statuses[-1]["status"] == "ready"
    for point in points:
        assert point.payload["user_id"] == USER_A and point.payload["notebook_id"] == "fixture-notebook"
        assert point.payload["document_id"] == "fixture-document"
        assert 0 < len(point.payload["text"]) <= 400 and point.payload["parent_text"]
        assert set(point.vector) == {"dense-text", "sparse-text"}
    assert any("Reciprocal rank fusion" in point.payload["text"] for point in points)


def test_concurrent_reservations_share_one_document_under_the_actual_advisory_call():
    async def check():
        notebook_id = str(uuid4())
        lock = asyncio.Lock()
        rows = []
        now = datetime.now(timezone.utc)
        class Database:
            @asynccontextmanager
            async def transaction(self):
                acquired = []
                class Session:
                    async def query(self, sql, *params):
                        if "FROM notebooks" in sql: return [{"id": notebook_id}]
                        if "pg_advisory_xact_lock" in sql:
                            assert params == (f"sample:{USER_A}:{notebook_id}:{sample.SAMPLE_KEY}",)
                            await lock.acquire()
                            acquired.append(True)
                            return []
                        if sql.startswith("SELECT d.*"):
                            await asyncio.sleep(0)  # Expose overlapping independent sessions.
                            return rows.copy()
                        if sql.startswith("INSERT INTO uploaded_documents"):
                            row = dict(zip(("id", "userId", "notebookId", "name", "fileSize", "fileType", "storageUrl", "sampleKey"), params))
                            row.update(status="PROCESSING", deletionPending=False, createdAt=now, pageCount=None)
                            rows.append(row)
                            return [row]
                        if sql.startswith("UPDATE uploaded_documents"): return rows.copy()
                        raise AssertionError(sql)
                try: yield Session()
                finally:
                    if acquired: lock.release()
        results = await asyncio.gather(*(sample.reserve_sample(Database(), USER_A, notebook_id) for _ in range(4)))
        assert len(rows) == 1 and len({result[0]["documentId"] for result in results}) == 1
    asyncio.run(check())

"""Owned API + real SQL/cascades, with synthetic external stores only."""
import asyncio
import sys
from contextlib import asynccontextmanager
import threading
from uuid import uuid4

import httpx
import pytest
from fastapi import HTTPException

from history_fixture import build_app, database, USER_A, USER_B, token, CACHE, OBJECTS, POINTS, Storage
from services import chat_history
from services import document_deletion


@asynccontextmanager
async def closing(client):
    try:
        yield client
    finally:
        await client.aclose()


async def setup(db, user_id=USER_A):
    app = build_app(db)
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test",
        headers={"Authorization": "Bearer " + token(user_id)})
    notebook = (await client.get("/api/notebooks")).json()[0]["id"]
    uploaded = await client.post(f"/api/upload?userId={user_id}&notebookId={notebook}",
        files={"file": ("fixture.txt", b"Only synthetic document bytes", "text/plain")})
    assert uploaded.status_code == 200
    return client, notebook, uploaded.json()["document_id"], uploaded.json()["filepath"]


def endpoint(notebook, document):
    return f"/api/documents?notebook_id={notebook}&document_id={document}"


def test_full_cycle_cascades_and_owned_replay():
    async def check():
        async with database() as db:
            client, notebook, document, path = await setup(db)
            async with closing(client):
                journal_table = (await db.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'document_deletions'::regclass"))[0]
                assert journal_table["relrowsecurity"] is True
                conversation = str(uuid4())
                message = str(uuid4())
                await db.execute('INSERT INTO conversations (id,"userId","notebookId","updatedAt") VALUES (%s::uuid,%s::uuid,%s::uuid,NOW())',
                    conversation, USER_A, notebook)
                await db.execute('INSERT INTO conversation_messages (id,"conversationId",role,message,sequence) '
                    'VALUES (%s::uuid,%s::uuid,\'LLM\',\'Historical answer\',0)', message, conversation)
                await db.execute('INSERT INTO conversation_documents ("conversationId","documentId","updatedAt") VALUES (%s::uuid,%s::uuid,NOW())',
                    conversation, document)
                await db.execute('INSERT INTO message_sources (id,"messageId","documentId","sourceId") VALUES (%s::uuid,%s::uuid,%s::uuid,\'1\')',
                    str(uuid4()), message, document)
                # A matching document ID from another tenant must never match
                # the vector selector. Unrelated cache/object/vector survive.
                other_point = {"document_id": document, "user_id": USER_B}
                POINTS.append(other_point)
                CACHE['{"user_id":"' + USER_A + '"}'] = {"answer": "Stale"}
                CACHE['{"user_id":"' + USER_B + '"}'] = {"answer": "Keep"}
                OBJECTS[USER_B + "/keep.txt"] = b"Keep"
                response = await client.delete(endpoint(notebook, document))
                assert response.status_code == 200 and response.json()["deleted"] is True
                assert path not in OBJECTS and OBJECTS[USER_B + "/keep.txt"] == b"Keep"
                assert other_point in POINTS
                assert not any(point.get("document_id") == document and point.get("user_id") == USER_A for point in POINTS)
                assert not await db.query('SELECT id FROM uploaded_documents WHERE id = %s::uuid', document)
                assert not await db.query('SELECT * FROM conversation_documents')
                assert not await db.query('SELECT * FROM message_sources')
                assert await db.query('SELECT id FROM conversation_messages WHERE id = %s::uuid', message)
                assert all(USER_A not in key for key in CACHE) and any(USER_B in key for key in CACHE)
                tombstone = (await db.query('SELECT * FROM document_deletions WHERE "documentId" = %s::uuid', document))[0]
                assert tombstone["completedAt"] is not None and tombstone["storagePath"] is None
                repeated = await client.delete(endpoint(notebook, document))
                assert repeated.status_code == 200 and repeated.json() == response.json()
                assert (await client.get(f"/api/documents?notebook_id={notebook}")).json()["items"] == []
    asyncio.run(check())


@pytest.mark.parametrize("stage", ["storage", "vectors", "cache", "database", "completion"])
def test_partial_failures_retain_durable_intent_and_retry(monkeypatch, stage):
    async def check():
        async with database() as db:
            client, notebook, document, path = await setup(db)
            async with closing(client):
                calls = []
                if stage in {"database", "completion"}:
                    original = db.execute
                    async def fail(sql, *params):
                        if sql.startswith("DELETE FROM uploaded_documents" if stage == "database" else "UPDATE document_deletions"):
                            calls.append(stage)
                            raise RuntimeError("Synthetic SQL failure")
                        return await original(sql, *params)
                    monkeypatch.setattr(db, "execute", fail)
                else:
                    target, method = {"storage": (Storage, "remove"),
                        "vectors": (sys.modules["db.qdrant"].client, "delete"),
                        "cache": (sys.modules["services.caching"], "invalidate_user_cache")}[stage]
                    original = getattr(target, method)
                    def fail(*args, **kwargs):
                        calls.append(stage)
                        raise ConnectionError("Synthetic provider outage; sensitive details")
                    monkeypatch.setattr(target, method, fail)
                failed = await client.delete(endpoint(notebook, document))
                assert failed.status_code == 503 and failed.headers["Retry-After"] == "2"
                assert "sensitive" not in failed.text and calls == [stage]
                assert await db.query('SELECT id FROM uploaded_documents WHERE id = %s::uuid', document)
                journal = (await db.query('SELECT * FROM document_deletions WHERE "documentId" = %s::uuid', document))[0]
                assert journal["completedAt"] is None and journal["storagePath"] == path
                listed = (await client.get(f"/api/documents?notebook_id={notebook}")).json()["items"][0]
                assert listed["deletionPending"] is True and listed["status"] == "failed"
                assert await chat_history.resolve_documents(db, USER_A, notebook, None) == []
                with pytest.raises(HTTPException) as error:
                    await chat_history.resolve_documents(db, USER_A, notebook, [document])
                assert error.value.status_code == 404
                assert path in OBJECTS if stage == "storage" else path not in OBJECTS
                if stage in {"database", "completion"}:
                    monkeypatch.setattr(db, "execute", original)
                else:
                    monkeypatch.setattr(target, method, original)
                # Rebuild dependencies to model an independent process/restart;
                # ownership/path recovery comes only from the SQL journal.
                build_app(db)
                assert (await client.delete(endpoint(notebook, document))).status_code == 200
                assert not await db.query('SELECT id FROM uploaded_documents WHERE id = %s::uuid', document)
                assert path not in OBJECTS
    asyncio.run(check())


def test_unauthorized_and_wrong_notebook_deletes_never_reach_stores(monkeypatch):
    async def check():
        async with database() as db:
            client, notebook, document, path = await setup(db)
            other, other_notebook, other_document, other_path = await setup(db, USER_B)
            async with closing(client), closing(other):
                def forbidden(*args):
                    raise AssertionError("Unauthorized request must not reach cleanup")
                monkeypatch.setattr(document_deletion, "cleanup_external_stores", forbidden)
                wrong_notebook = str(uuid4())
                await db.execute('INSERT INTO notebooks (id,"userId","updatedAt") VALUES (%s::uuid,%s::uuid,NOW())', wrong_notebook, USER_A)
                for caller, scope, source in ((other, notebook, document), (other, other_notebook, document),
                        (client, wrong_notebook, document), (client, notebook, other_document), (client, notebook, str(uuid4()))):
                    assert (await caller.delete(endpoint(scope, source))).status_code == 404
                assert (await client.delete(endpoint(notebook, document), headers={"Authorization": "Bearer forged"})).status_code == 401
                assert (await client.delete(endpoint(notebook, "not-a-uuid"))).status_code == 422
                assert not await db.query('SELECT * FROM document_deletions')
                assert path in OBJECTS and other_path in OBJECTS
    asyncio.run(check())


def test_foreign_and_wrong_notebook_replay_stays_unauthorized():
    async def check():
        async with database() as db:
            client, notebook, document, path = await setup(db)
            other, other_notebook, _, _ = await setup(db, USER_B)
            async with closing(client), closing(other):
                assert (await client.delete(endpoint(notebook, document))).status_code == 200
                assert (await other.delete(endpoint(other_notebook, document))).status_code == 404
                wrong_notebook = str(uuid4())
                await db.execute('INSERT INTO notebooks (id,"userId","updatedAt") VALUES (%s::uuid,%s::uuid,NOW())', wrong_notebook, USER_A)
                assert (await client.delete(endpoint(wrong_notebook, document))).status_code == 404
    asyncio.run(check())


@pytest.mark.parametrize("path", [USER_B + "/foreign.txt", USER_A + "/../unsafe.txt", "https://example.invalid/file"])
def test_unowned_or_unsafe_storage_path_blocks_deletion(monkeypatch, path):
    async def check():
        async with database() as db:
            client, notebook, document, _ = await setup(db)
            async with closing(client):
                await db.execute('UPDATE uploaded_documents SET "storageUrl" = %s WHERE id = %s::uuid', path, document)
                monkeypatch.setattr(document_deletion, "cleanup_external_stores", lambda *args: pytest.fail("unsafe path reached cleanup"))
                assert (await client.delete(endpoint(notebook, document))).status_code == 409
                assert not await db.query('SELECT * FROM document_deletions')
    asyncio.run(check())


def test_pending_deletion_blocks_background_ingestion(monkeypatch):
    async def check():
        async with database() as db:
            client, notebook, document, _ = await setup(db)
            async with closing(client):
                monkeypatch.setattr(document_deletion, "cleanup_external_stores", lambda *args: (_ for _ in ()).throw(ConnectionError()))
                assert (await client.delete(endpoint(notebook, document))).status_code == 503
                from routers import upload
                monkeypatch.setattr(upload, "process_and_ingest", lambda **kwargs: pytest.fail("Pending source ingested"))
                await upload.persist_ingestion(db, user_id=USER_A, notebook_id=notebook, document_id=document)
    asyncio.run(check())


def test_already_missing_storage_object_is_success(monkeypatch):
    from storage3.exceptions import StorageApiError
    async def check():
        async with database() as db:
            client, notebook, document, path = await setup(db)
            async with closing(client):
                OBJECTS.pop(path)
                def missing(*args):
                    raise StorageApiError("Already absent", "NoSuchKey", 404)
                monkeypatch.setattr(Storage, "remove", missing)
                assert (await client.delete(endpoint(notebook, document))).status_code == 200
                assert not await db.query('SELECT id FROM uploaded_documents WHERE id = %s::uuid', document)
    asyncio.run(check())


class CoordinatedDatabase:
    """Independent sessions enforcing the advisory lock SQL, without PGlite's
    single-connection serialization. Real cascade/rollback checks are above.
    """
    def __init__(self, notebook, document):
        self.notebook = notebook
        self.document_id = document
        self.document = {"id": document, "notebookId": notebook, "storageUrl": USER_A + "/fixture.txt"}
        self.journal = None
        self.locks = {}
        self.waiting = asyncio.Event()

    @asynccontextmanager
    async def transaction(self):
        owner = self
        acquired = []
        class Session:
            async def query(self, sql, *params):
                if "pg_advisory_xact_lock" in sql:
                    assert params == ("document:" + owner.document_id,)
                    lock = owner.locks.setdefault(params[0], asyncio.Lock())
                    if lock.locked():
                        owner.waiting.set()
                    await lock.acquire()
                    acquired.append(lock)
                    return []
                if "FROM notebooks" in sql:
                    return [{"id": owner.notebook}]
                if "SELECT * FROM document_deletions" in sql:
                    return [owner.journal.copy()] if owner.journal else []
                if "SELECT d.*" in sql:
                    return [owner.document.copy()] if owner.document else []
                if "SELECT id FROM uploaded_documents" in sql:
                    return [{"id": owner.document_id}] if owner.document and not owner.journal else []
                raise AssertionError(sql)

            async def execute(self, sql, *params):
                if sql.startswith("INSERT INTO document_deletions"):
                    owner.journal = {"storagePath": params[3], "completedAt": None}
                elif sql.startswith("DELETE FROM uploaded_documents"):
                    owner.document = None
                elif sql.startswith("UPDATE document_deletions"):
                    owner.journal.update(completedAt=True, storagePath=None)
                else:
                    assert sql.startswith("UPDATE uploaded_documents SET status")
                return 1
        try:
            yield Session()
        finally:
            for lock in reversed(acquired):
                lock.release()


@pytest.mark.parametrize("first", ["ingestion", "deletion", "concurrent_delete"])
def test_advisory_lock_prevents_vector_resurrection_and_duplicate_cleanup(monkeypatch, first):
    async def check():
        notebook, document = str(uuid4()), str(uuid4())
        db = CoordinatedDatabase(notebook, document)
        build_app(db)
        from routers import upload
        vectors = []
        calls = []
        entered = asyncio.Event()
        release = threading.Event()
        loop = asyncio.get_running_loop()

        def gate():
            loop.call_soon_threadsafe(entered.set)
            assert release.wait(5), "Second independent session did not reach the lock"

        def ingest(**kwargs):
            if first == "ingestion":
                gate()
            vectors.append(document)
            return True

        def cleanup(*args):
            calls.append("cleanup")
            if first != "ingestion":
                gate()
            vectors.clear()

        monkeypatch.setattr(upload, "process_and_ingest", ingest)
        monkeypatch.setattr(document_deletion, "cleanup_external_stores", cleanup)
        ingestion = lambda: upload.persist_ingestion(db, user_id=USER_A, notebook_id=notebook, document_id=document)
        deletion = lambda: document_deletion.delete_document(db, USER_A, notebook, document)
        leading = asyncio.create_task(ingestion() if first == "ingestion" else deletion())
        await asyncio.wait_for(entered.wait(), 2)
        following = asyncio.create_task(deletion() if first != "deletion" else ingestion())
        await asyncio.wait_for(db.waiting.wait(), 2)
        assert not following.done()
        if first == "ingestion":
            assert db.journal is None  # Intent waits for the running writer.
        release.set()
        await asyncio.wait_for(asyncio.gather(leading, following), 3)
        assert db.document is None and db.journal["completedAt"] is True
        assert vectors == [] and calls == ["cleanup"]
    asyncio.run(check())

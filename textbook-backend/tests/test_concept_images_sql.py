"""Disposable local PostgreSQL proves ownership, persistence and cleanup.

Requires TEST_DATABASE_URL pointing to local fixture PostgreSQL/PGlite, never
reads the production DATABASE_URL. Provider and Storage alone are synthetic.
"""
import asyncio
import importlib
import io
import json
import os
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
import psycopg
import pytest
from fastapi import HTTPException
from PIL import Image

from history_fixture import build_app, database, USER_A, USER_B, token, OBJECTS, Storage
import history_fixture
from services import concept_images as figures

BACKEND = Path(__file__).resolve().parents[1]


def png_bytes():
    output = io.BytesIO()
    Image.new("RGB", (80, 60), "#123456").save(output, format="PNG")
    return output.getvalue()


@asynccontextmanager
async def closing(client):
    try:
        yield client
    finally:
        await client.aclose()


@asynccontextmanager
async def fixture_db():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set local TEST_DATABASE_URL to run SQL integration checks")
    if urlsplit(url).hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise RuntimeError("Concept figure integration checks require disposable local SQL")
    history_fixture.DSN = url
    async with database() as db:
        db.connection.prepare_threshold = None
        await db.connection.execute((BACKEND / "prisma/changes/issue-25-concept-figures.sql").read_text())
        yield db


def image_app(db):
    app = build_app(db)
    app.include_router(importlib.import_module("routers.image").router, prefix="/api")
    return app


async def client_for(db, user=USER_A):
    app = image_app(db)
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test",
        headers={"Authorization": "Bearer " + token(user)})
    notebook = (await client.get("/api/notebooks")).json()[0]["id"]
    return client, notebook


async def seed_source(db, notebook, user=USER_A):
    document, conversation, message = [str(uuid4()) for _ in range(3)]
    await db.execute('INSERT INTO uploaded_documents (id, "userId", "notebookId", name, status, "pageCount", "updatedAt") '
        'VALUES (%s::uuid,%s::uuid,%s::uuid,\'Owned textbook\',\'COMPLETED\',10,NOW())', document, user, notebook)
    await db.execute('INSERT INTO conversations (id,"userId","notebookId","updatedAt") VALUES (%s::uuid,%s::uuid,%s::uuid,NOW())', conversation, user, notebook)
    await db.execute('INSERT INTO conversation_messages (id,"conversationId",role,message,sequence) VALUES (%s::uuid,%s::uuid,\'LLM\',\'Answer\',0)', message, conversation)
    await db.execute('INSERT INTO message_sources (id,"messageId","documentId","sourceId","pageNumber","citationText") '
        'VALUES (%s::uuid,%s::uuid,%s::uuid,\'1\',2,\'Verified owned textbook passage about a water cycle\')', str(uuid4()), message, document)
    return {"document_id": document, "source_id": 1, "page_number": 2, "excerpt": "Verified owned textbook passage"}


def events(response):
    return [(part.splitlines()[0].removeprefix("event: "), json.loads(part.splitlines()[1].removeprefix("data: ")))
        for part in response.text.strip().split("\n\n")]


async def generate(client, notebook, source=None):
    return await client.post("/api/image/generate", json={"notebook_id": notebook, "prompt": "Explain the water cycle", **({"source": source} if source else {})})


@pytest.fixture
def provider(monkeypatch):
    calls = []
    async def predict(prompt, model):
        calls.append((prompt, model))
        return png_bytes()
    monkeypatch.setattr(figures, "predict_image", predict)
    return calls


def test_generate_save_reload_private_content_and_source_snapshot_survives_delete(provider):
    async def check():
        async with fixture_db() as db:
            client, notebook = await client_for(db)
            async with closing(client):
                source = await seed_source(db, notebook)
                response = await generate(client, notebook, source)
                assert response.status_code == 200 and response.headers["content-type"].startswith("text/event-stream")
                sequence = events(response)
                assert sequence[:3] == [("phase", {"phase": phase}) for phase in ("analyzing", "synthesizing", "rendering")]
                assert sequence[3][0] == "complete"
                item = sequence[3][1]["figure"]
                assert item["width"] == 80 and item["height"] == 60 and item["media_type"] == "image/png"
                assert item["source"]["document_name"] == "Owned textbook" and item["source"]["context_type"] == "saved_citation"
                assert source["excerpt"] in provider[0][0]
                figure_id = item["id"]
                content_url = f"/api/image/{figure_id}?notebook_id={notebook}"
                assert (await client.get("/api/image/figures", params={"notebook_id": notebook})).json() == {"figures": []}
                saved = await client.post(f"/api/image/{figure_id}/save", json={"notebook_id": notebook, "caption": "Water cycle"})
                assert saved.status_code == 200 and saved.json()["figure"]["caption"] == "Water cycle"
                assert saved.headers["cache-control"] == "private, no-store"
                downloaded = await client.get(content_url)
                assert downloaded.content == png_bytes() and downloaded.headers["cache-control"] == "private, no-store"
                assert downloaded.headers["x-content-type-options"] == "nosniff"
                row = (await db.query('SELECT * FROM concept_figures WHERE id=%s::uuid', figure_id))[0]
                assert row["state"] == "saved" and row["expiresAt"] is None
                assert (await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='concept_figures'::regclass"))[0]["relrowsecurity"]
                # Metadata/content access remains notebook-owned after source removal.
                await db.execute('DELETE FROM uploaded_documents WHERE id=%s::uuid', source["document_id"])
                restarted, _ = await client_for(db)
                async with closing(restarted):
                    listing = await restarted.get("/api/image/figures", params={"notebook_id": notebook})
                    assert listing.json()["figures"][0]["source"] == item["source"]
                    assert (await restarted.get(content_url)).content == png_bytes()
                    assert (await restarted.post(f"/api/image/{figure_id}/save", json={"notebook_id": notebook, "caption": "Edited after deletion"})).status_code == 200
                    assert (await restarted.delete(content_url)).status_code == 204
                    assert (await restarted.delete(content_url)).status_code == 204
                assert row["storagePath"] not in OBJECTS
                assert not await db.query('SELECT * FROM concept_figures')
    asyncio.run(check())


def test_unauthorized_scope_and_deleted_failed_source_never_call_provider(provider):
    async def check():
        async with fixture_db() as db:
            client, notebook = await client_for(db)
            other, other_notebook = await client_for(db, USER_B)
            async with closing(client), closing(other):
                source = await seed_source(db, notebook)
                for caller, scope, selected in ((other, notebook, None), (other, other_notebook, source), (client, notebook, {**source, "document_id": str(uuid4())})):
                    result = events(await generate(caller, scope, selected))
                    assert result[0] == ("phase", {"phase": "analyzing"}) and result[-1][0] == "error"
                    assert result[-1][1]["retryable"] is False
                await db.execute('UPDATE uploaded_documents SET status=\'FAILED\' WHERE id=%s::uuid', source["document_id"])
                assert events(await generate(client, notebook, source))[-1][0] == "error"
                await db.execute('UPDATE uploaded_documents SET status=\'COMPLETED\' WHERE id=%s::uuid', source["document_id"])
                await db.execute('INSERT INTO document_deletions ("documentId","userId","notebookId") VALUES (%s::uuid,%s::uuid,%s::uuid)', source["document_id"], USER_A, notebook)
                assert events(await generate(client, notebook, source))[-1][0] == "error"
                assert not provider and not await db.query('SELECT * FROM concept_figures')
                assert (await client.post("/api/image/generate", json={"notebook_id": notebook, "prompt": "concept"}, headers={"Authorization": "Bearer forged"})).status_code == 401
    asyncio.run(check())


def test_foreign_figure_and_wrong_notebook_get_save_delete_never_reach_storage(provider, monkeypatch):
    async def check():
        async with fixture_db() as db:
            client, notebook = await client_for(db)
            other, other_notebook = await client_for(db, USER_B)
            async with closing(client), closing(other):
                figure_id = events(await generate(client, notebook))[-1][1]["figure"]["id"]
                wrong = (await client.post("/fixture/notebooks")).json()["id"]
                monkeypatch.setattr(figures, "private_storage", lambda: pytest.fail("Foreign request reached private bytes"))
                for caller, scope in ((other, notebook), (other, other_notebook), (client, wrong)):
                    url = f"/api/image/{figure_id}?notebook_id={scope}"
                    assert (await caller.get(url)).status_code == 404
                    assert (await caller.post(f"/api/image/{figure_id}/save", json={"notebook_id": scope, "caption": "Caption"})).status_code == 404
                    assert (await caller.delete(url)).status_code in {204, 404}
                assert (await db.query('SELECT state FROM concept_figures WHERE id=%s::uuid', figure_id))[0]["state"] == "pending"
    asyncio.run(check())


def test_client_excerpt_is_only_trusted_when_owned_saved_citation_matches(provider):
    async def check():
        async with fixture_db() as db:
            client, notebook = await client_for(db)
            async with closing(client):
                source = await seed_source(db, notebook)
                forged = {**source, "excerpt": "Injected private fake source text"}
                item = events(await generate(client, notebook, forged))[-1][1]["figure"]
                assert "Injected" not in provider[0][0] and "excerpt" not in item["source"]
                assert item["source"]["context_type"] == "document"
                assert events(await generate(client, notebook, {**source, "page_number": 11}))[-1][0] == "error"
                assert len(provider) == 1
    asyncio.run(check())


def test_source_deleted_during_provider_aborts_completion_and_pending_save(provider, monkeypatch):
    async def check():
        async with fixture_db() as db:
            client, notebook = await client_for(db)
            async with closing(client):
                source = await seed_source(db, notebook)
                async def delete_source(prompt, model):
                    await db.execute('DELETE FROM uploaded_documents WHERE id=%s::uuid', source["document_id"])
                    return png_bytes()
                monkeypatch.setattr(figures, "predict_image", delete_source)
                result = events(await generate(client, notebook, source))
                assert result[-1][0] == "error" and "complete" not in [kind for kind, data in result]
                assert not await db.query('SELECT * FROM concept_figures')
                assert not any(path.startswith(USER_A + "/" + notebook) for path in OBJECTS)
    asyncio.run(check())


def test_rate_limit_survives_delete_and_workspace_bytes_are_reserved(provider, monkeypatch):
    async def check():
        async with fixture_db() as db:
            client, notebook = await client_for(db)
            async with closing(client):
                for _ in range(3):
                    item = events(await generate(client, notebook))[-1][1]["figure"]
                    assert (await client.delete(f'/api/image/{item["id"]}?notebook_id={notebook}')).status_code == 204
                result = events(await generate(client, notebook))[-1]
                assert result[0] == "error" and result[1]["retryable"] is True
                assert len(provider) == 3 and len(await db.query('SELECT * FROM concept_figure_attempts')) == 3
                await db.execute('DELETE FROM concept_figure_attempts')
                monkeypatch.setattr(figures, "MAX_WORKSPACE_BYTES", figures.MAX_IMAGE_BYTES - 1)
                result = events(await generate(client, notebook))[-1]
                assert result[0] == "error" and len(provider) == 3
    asyncio.run(check())


def test_durable_storage_failure_cleanup_ttl_and_saved_survival(provider, monkeypatch):
    async def check():
        async with fixture_db() as db:
            client, notebook = await client_for(db)
            async with closing(client):
                first = events(await generate(client, notebook))[-1][1]["figure"]
                second = events(await generate(client, notebook))[-1][1]["figure"]
                await client.post(f'/api/image/{second["id"]}/save', json={"notebook_id": notebook, "caption": "Keep"})
                original_remove = Storage.remove
                def failed_remove(*args):
                    raise ConnectionError("PRIVATE provider account details")
                monkeypatch.setattr(Storage, "remove", failed_remove)
                deleted = await client.delete(f'/api/image/{first["id"]}?notebook_id={notebook}')
                assert deleted.status_code == 503 and "PRIVATE" not in deleted.text
                row = (await db.query('SELECT * FROM concept_figures WHERE id=%s::uuid', first["id"]))[0]
                assert row["state"] == "deleting" and row["storagePath"] in OBJECTS
                assert await figures.cleanup_expired(db) == 0
                monkeypatch.setattr(Storage, "remove", original_remove)
                assert await figures.cleanup_expired(db) == 1
                assert row["storagePath"] not in OBJECTS
                third = events(await generate(client, notebook))[-1][1]["figure"]
                await db.execute('UPDATE concept_figures SET "expiresAt"=NOW()-INTERVAL \'1 second\' WHERE id=%s::uuid', third["id"])
                assert await figures.cleanup_expired(db) == 1
                assert (await db.query('SELECT state FROM concept_figures WHERE id=%s::uuid', second["id"]))[0]["state"] == "saved"
    asyncio.run(check())


def test_cancel_during_late_upload_waits_then_removes_object_and_row(monkeypatch):
    async def check():
        async with fixture_db() as db:
            client, notebook = await client_for(db)
            await client.aclose()
            entered = threading.Event()
            release = threading.Event()
            writes = []
            original = Storage.upload
            def late_upload(self, path, data, options):
                entered.set()
                assert release.wait(5)
                writes.append(path)
                return original(self, path, data, options)
            monkeypatch.setattr(Storage, "upload", late_upload)
            async def predict(prompt, model):
                return png_bytes()
            monkeypatch.setattr(figures, "predict_image", predict)
            class Request:
                async def is_disconnected(self):
                    return False
            stream = figures.generate_events(db, USER_A, notebook, "concept", None, Request())
            for phase in ("analyzing", "synthesizing", "rendering"):
                assert json.loads((await anext(stream)).splitlines()[1][6:])["phase"] == phase
            task = asyncio.create_task(anext(stream))
            assert await asyncio.to_thread(entered.wait, 2)
            task.cancel()
            await asyncio.sleep(0)
            assert not task.done()
            release.set()
            with pytest.raises(asyncio.CancelledError):
                await asyncio.wait_for(task, 4)
            assert writes and writes[0] not in OBJECTS
            assert not await db.query('SELECT * FROM concept_figures')
    asyncio.run(check())


def test_complete_client_closes_stream_without_deleting_result(provider):
    async def check():
        async with fixture_db() as db:
            client, notebook = await client_for(db)
            await client.aclose()
            class Request:
                async def is_disconnected(self):
                    return False
            stream = figures.generate_events(db, USER_A, notebook, "concept", None, Request())
            received = [await anext(stream) for _ in range(4)]
            figure = json.loads(received[-1].splitlines()[1][6:])["figure"]
            await stream.aclose()
            assert await figures.owned_figure(db, USER_A, notebook, figure["id"])
    asyncio.run(check())


def test_database_constraint_rejects_cross_owner_notebook(provider):
    async def check():
        async with fixture_db() as db:
            client, notebook = await client_for(db)
            other, other_notebook = await client_for(db, USER_B)
            await client.aclose(); await other.aclose()
            figure_id = str(uuid4())
            with pytest.raises(psycopg.errors.ForeignKeyViolation):
                async with db.transaction() as tx:
                    await tx.execute('INSERT INTO concept_figures (id,"userId","notebookId",prompt,caption,model,"storagePath",state,"expiresAt") '
                    'VALUES (%s::uuid,%s::uuid,%s::uuid,\'concept\',\'caption\',\'imagen-test\',%s,\'pending\',NOW()+INTERVAL \'24 hours\')',
                    figure_id, USER_A, other_notebook, f"{USER_A}/{other_notebook}/{figure_id}.png")
    asyncio.run(check())


def test_pending_only_disposal_preserves_figure_after_uncertain_save(provider):
    async def check():
        async with fixture_db() as db:
            client, notebook = await client_for(db)
            async with closing(client):
                item = events(await generate(client, notebook))[-1][1]["figure"]
                figure_id = item["id"]
                saved = await client.post(f"/api/image/{figure_id}/save", json={"notebook_id": notebook, "caption": "Saved before disposal"})
                assert saved.status_code == 200
                url = f"/api/image/{figure_id}?notebook_id={notebook}"
                assert (await client.delete(url + "&pending_only=true")).status_code == 204
                assert (await client.get(url)).content == png_bytes()
                assert (await db.query('SELECT state FROM concept_figures WHERE id=%s::uuid', figure_id))[0]["state"] == "saved"
                assert (await client.delete(url)).status_code == 204
    asyncio.run(check())


def test_citation_context_matches_after_more_than_100_reused_source_labels(provider):
    async def check():
        async with fixture_db() as db:
            client, notebook = await client_for(db)
            async with closing(client):
                source = await seed_source(db, notebook)
                original = (await db.query('SELECT * FROM message_sources WHERE "documentId"=%s::uuid', source["document_id"]))[0]
                conversation = str((await db.query('SELECT "conversationId" FROM conversation_messages WHERE id=%s::uuid', str(original["messageId"])))[0]["conversationId"])
                await db.execute('DELETE FROM message_sources WHERE id=%s::uuid', str(original["id"]))
                await db.execute('INSERT INTO conversation_messages (id,"conversationId",role,message,sequence) '
                    'SELECT gen_random_uuid(),%s::uuid,\'LLM\',\'Unrelated answer\',n FROM generate_series(1,105) n', conversation)
                await db.execute('INSERT INTO message_sources (id,"messageId","documentId","sourceId","pageNumber","citationText") '
                    'SELECT gen_random_uuid(),m.id,%s::uuid,\'1\',2,\'Other textbook passage\' FROM conversation_messages m '
                    'WHERE m."conversationId"=%s::uuid AND m.sequence>0', source["document_id"], conversation)
                await db.execute('INSERT INTO message_sources (id,"messageId","documentId","sourceId","pageNumber","citationText") '
                    'VALUES (%s::uuid,%s::uuid,%s::uuid,\'1\',2,\'Verified owned textbook passage about a water cycle\')',
                    str(original["id"]), str(original["messageId"]), source["document_id"])
                item = events(await generate(client, notebook, source))[-1][1]["figure"]
                assert item["source"]["context_type"] == "saved_citation"
                assert source["excerpt"] in provider[0][0]
    asyncio.run(check())


@pytest.mark.parametrize("stage", ["upload", "metadata"])
def test_uploaded_bytes_are_removed_after_provider_or_sql_completion_failure(monkeypatch, stage):
    async def check():
        async with fixture_db() as db:
            client, notebook = await client_for(db)
            async with closing(client):
                async def predict(prompt, model):
                    return png_bytes()
                monkeypatch.setattr(figures, "predict_image", predict)
                uploaded = []
                original_upload = Storage.upload
                def upload(self, path, data, options):
                    original_upload(self, path, data, options)
                    uploaded.append(path)
                    if stage == "upload":
                        raise ConnectionError("SECRET after successful remote write")
                monkeypatch.setattr(Storage, "upload", upload)
                if stage == "metadata":
                    original_query = db.query
                    async def query(sql, *params):
                        if sql.startswith("UPDATE concept_figures SET size"):
                            raise RuntimeError("SECRET SQL commit details")
                        return await original_query(sql, *params)
                    monkeypatch.setattr(db, "query", query)
                response = await generate(client, notebook)
                result = events(response)[-1]
                assert result[0] == "error" and result[1]["retryable"] is True
                assert "SECRET" not in response.text
                assert uploaded and uploaded[0] not in OBJECTS
                assert not await db.query('SELECT * FROM concept_figures')
                assert len(await db.query('SELECT * FROM concept_figure_attempts')) == 1
    asyncio.run(check())

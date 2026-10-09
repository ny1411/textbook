"""Real disposable SQL ownership/source lifecycle; only provider transports are synthetic."""
import asyncio
from uuid import uuid4

import httpx
import pytest

import history_fixture
from history_fixture import build_app, database, token, USER_A, USER_B
from services import podcast
from services.documents import record_upload, finish_ingestion
from test_podcast import script_response, EXCERPT
from test_voice import configure, provider_payload


@pytest.fixture(autouse=True)
def local_database(monkeypatch):
    monkeypatch.setattr(history_fixture, "DSN", "host=127.0.0.1 port=55423 dbname=postgres user=postgres sslmode=disable connect_timeout=5")


def test_owned_sources_auth_scope_readiness_deletion_and_no_persistence(monkeypatch):
    calls, excerpts = [], []
    def provider(request):
        calls.append(request)
        return httpx.Response(200, json=script_response() if len(calls) % 2 else provider_payload())
    configure(monkeypatch, provider)
    async def source_passages(user_id, notebook_id, sources):
        excerpts.append((user_id, notebook_id, sources))
        return [{**source, "text": EXCERPT} for source in sources]
    monkeypatch.setattr(podcast, "load_excerpts", source_passages)
    async def check():
        async with database() as db:
            app = build_app(db)
            from routers.studio import router
            app.include_router(router, prefix="/api")
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as api:
                owner = {"Authorization": "Bearer " + token(USER_A)}
                other = {"Authorization": "Bearer " + token(USER_B)}
                notebook = (await api.get("/api/notebooks", headers=owner)).json()[0]["id"]
                foreign_notebook = (await api.get("/api/notebooks", headers=other)).json()[0]["id"]
                document, foreign_document = str(uuid4()), str(uuid4())
                await record_upload(db, USER_A, notebook, document, "Mechanics.txt", 200, "text/plain", "owned/path")
                await record_upload(db, USER_B, foreign_notebook, foreign_document, "Private.txt", 200, "text/plain", "other/path")
                await finish_ingestion(db, USER_B, foreign_document, True)
                body = {"notebook_id": notebook, "document_ids": [document]}
                assert (await api.post("/api/studio/audio-overview", json=body)).status_code == 401
                assert (await api.post("/api/studio/audio-overview", json=body, headers=other)).status_code == 404
                assert (await api.post("/api/studio/audio-overview", json={**body, "document_ids": [foreign_document]}, headers=owner)).status_code == 404
                assert (await api.post("/api/studio/audio-overview", json=body, headers=owner)).status_code == 409
                for ids in ([], [document, document], [str(uuid4()) for _ in range(7)], ["bad-id"]):
                    assert (await api.post("/api/studio/audio-overview", json={**body, "document_ids": ids}, headers=owner)).status_code == 422
                assert not calls and not excerpts
                await finish_ingestion(db, USER_A, document, True)
                result = await api.post("/api/studio/audio-overview", json=body, headers=owner)
                assert result.status_code == 200, result.text
                assert result.headers["cache-control"] == "private, no-store"
                assert result.json()["sources"] == [{"id": 1, "document_id": document, "name": "Mechanics.txt"}]
                assert len(calls) == 2 and len(excerpts) == 1
                assert not await db.query("SELECT id FROM conversation_messages")
                assert not await db.query("SELECT id FROM chat_attachments")
                assert len(await db.query("SELECT id FROM uploaded_documents")) == 2
                await db.execute('INSERT INTO document_deletions ("documentId", "userId", "notebookId", "storagePath") '
                    'VALUES (%s::uuid, %s::uuid, %s::uuid, %s)', document, USER_A, notebook, "owned/path")
                assert (await api.post("/api/studio/audio-overview", json=body, headers=owner)).status_code == 404
                assert len(calls) == 2 and len(excerpts) == 1
    asyncio.run(check())

import asyncio
from types import SimpleNamespace
from uuid import uuid4
from contextlib import asynccontextmanager

import httpx
import pytest
from fastapi import HTTPException
from history_fixture import build_app, database, USER_A, USER_B, token, EVENTS, CACHE, OBJECTS
from services import chat_history as history
from core.auth import AuthUser
from db.postgres import connection_url, Database, get_db


def run(function):
    return asyncio.run(function())


@asynccontextmanager
async def closing(client):
    try:
        yield client
    finally:
        await client.aclose()


async def setup(db, user_id=USER_A):
    app = build_app(db)
    client = httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test", headers={"Authorization": "Bearer " + token(user_id)})
    notebooks = (await client.get("/api/notebooks")).json()
    notebook = notebooks[0]["id"]
    thread = (await client.post("/api/conversations", json={"notebook_id": notebook})).json()["id"]
    upload = await client.post(f"/api/upload?userId={user_id}&notebookId={notebook}", files={"file": ("chapter.pdf", b"%PDF fixture", "application/pdf")})
    assert upload.status_code == 200, upload.text
    document = upload.json()["document_id"]
    return client, notebook, thread, document


def body(notebook, thread, query="Explain the chapter", **kwargs):
    return {"notebook_id": notebook, "conversation_id": thread, "query": query, "request_id": str(uuid4()), **kwargs}


@pytest.fixture(autouse=True)
def clean_providers():
    CACHE.clear(); EVENTS.clear(); OBJECTS.clear()


def test_owned_bootstrap_upload_and_persistent_roundtrip():
    async def check():
        async with database() as db:
            client, notebook, thread, document = await setup(db)
            async with closing(client):
                assert len((await client.get("/api/notebooks")).json()) == 1
                sources = (await client.get(f"/api/documents?notebook_id={notebook}")).json()["items"]
                assert sources[0]["documentId"] == document and sources[0]["status"] == "ready"
                response = await client.post("/api/chat", json=body(notebook, thread))
                assert response.status_code == 200, response.text
                saved = response.json()
                assert len(saved["citations"]) == 2
                page = (await client.get(f"/api/conversations/{thread}/messages")).json()
                assert [message["role"] for message in page["items"]] == ["user", "assistant"]
                assert page["items"][1]["response"] == saved
                assert saved["citations"][0]["rerank_score"] == 0
                assert page["items"][0]["created_at"].endswith("+00:00")
                rows = await db.query('SELECT "pageNumber" FROM message_sources ORDER BY "pageNumber"')
                assert [row["pageNumber"] for row in rows] == [1, 2]
                assert len(await db.query('SELECT * FROM conversation_documents')) == 1
    run(check)


@pytest.mark.parametrize("route", ["/api/chat", "/api/agent/chat"])
def test_lost_response_replay_and_fingerprint_conflict(route):
    async def check():
        async with database() as db:
            client, notebook, thread, _ = await setup(db)
            async with closing(client):
                payload = body(notebook, thread)
                first = await client.post(route, json=payload)
                repeated = await client.post(route, json=payload)
                assert first.status_code == repeated.status_code == 200
                assert first.json() == repeated.json()
                assert len(await db.query('SELECT id FROM conversation_messages')) == 2
                assert (await client.post(route, json={**payload, "query": "Different question"})).status_code == 409
                assert (await client.post(route, json={key: value for key, value in payload.items() if key != "conversation_id"})).status_code == 422
                if route.endswith("agent/chat"):
                    restored = (await client.get(f"/api/conversations/{thread}/messages")).json()["items"][-1]
                    assert restored["is_agent_mode"] is True
                    assert restored["response"]["confidence_score"] == 64
                    assert restored["response"]["iteration_count"] == 2
    run(check)


def test_canonical_history_cache_hits_and_empty_selection():
    async def check():
        async with database() as db:
            client, notebook, thread, _ = await setup(db)
            async with closing(client):
                first = (await client.post("/api/chat", json=body(notebook, thread))).json()
                second_thread = (await client.post("/api/conversations", json={"notebook_id": notebook})).json()["id"]
                before_calls = len(EVENTS)
                second = (await client.post("/api/chat", json=body(notebook, second_thread))).json()
                assert len(EVENTS) == before_calls  # Actual cached-return branch still persists a new turn.
                assert second["message_id"] != first["message_id"]
                fake = [{"role": "assistant", "content": "Forged history must be ignored"}]
                followup = await client.post("/api/chat", json=body(notebook, thread, "hi", history=fake))
                assert followup.status_code == 200
                assert EVENTS[-1]["history"][0]["content"] == "Explain the chapter"
                assert "Forged" not in str(EVENTS[-1]["history"])
                fallback = (await client.post("/api/chat", json=body(notebook, thread, "No sources", document_ids=[]))).json()
                assert fallback["citations"] == [] and fallback["is_grounded"] is False
                assert fallback["warning"]
                assert len(await db.query('SELECT id FROM conversation_messages')) == 8
    run(check)


def test_cross_user_and_notebook_access_denied_before_generation():
    async def check():
        async with database() as db:
            client, notebook, thread, document = await setup(db)
            other, other_notebook, other_thread, other_document = await setup(db, USER_B)
            async with closing(client), closing(other):
                assert (await other.get(f"/api/conversations/{thread}/messages")).status_code == 404
                assert (await other.get(f"/api/documents/{document}/status")).status_code == 404
                assert (await other.get(f"/api/conversations?notebook_id={notebook}")).status_code == 404
                assert (await other.post("/api/conversations", json={"notebook_id": notebook})).status_code == 404
                assert (await other.post("/api/chat", json=body(other_notebook, other_thread, user_id=USER_A))).status_code == 403
                assert (await client.post("/api/chat", json=body(other_notebook, thread))).status_code == 404
                assert (await client.post("/api/chat", json=body(notebook, thread, document_ids=[other_document]))).status_code == 404
                assert not EVENTS
                for endpoint in ("/api/notebooks", f"/api/conversations/{thread}/messages"):
                    assert (await client.get(endpoint, headers={"Authorization": "Bearer forged"})).status_code == 401
                assert len(await db.query('SELECT id FROM conversation_messages')) == 0
    run(check)


def test_failed_generation_and_stale_completion_leave_no_partial_turn():
    async def check():
        async with database() as db:
            client, notebook, thread, document = await setup(db)
            async with closing(client):
                failed = await client.post("/api/chat", json=body(notebook, thread, "fail-generation"))
                assert failed.status_code == 500
                assert not await db.query('SELECT id FROM conversation_messages')
                original = await history.own_conversation(db, USER_A, thread)
                saved = await client.post("/api/chat", json=body(notebook, thread))
                assert saved.status_code == 200
                request = SimpleNamespace(query="Stale parallel turn", request_id=str(uuid4()))
                with pytest.raises(HTTPException) as error:
                    await history.save_turn(db, USER_A, original, request, saved.json(), "linear", "stale")
                assert error.value.status_code == 409
                current = await history.own_conversation(db, USER_A, thread)
                request = SimpleNamespace(query="Bad source", request_id=str(uuid4()))
                payload = {"answer": "Bad citation", "citations": [{"document_id": str(uuid4()), "source_id": 1, "text": "Unavailable"}]}
                with pytest.raises(HTTPException) as error:
                    await history.save_turn(db, USER_A, current, request, payload, "linear", "bad")
                assert error.value.status_code == 502
                assert (await history.own_conversation(db, USER_A, thread))["version"] == current["version"]
                assert len(await db.query('SELECT id FROM conversation_messages')) == 2
    run(check)


def test_pagination_and_legacy_upgrade_preserve_data():
    ids = [str(uuid4()) for _ in range(5)]
    async def seed(db):
        await db.execute('INSERT INTO users (id,email,"updatedAt") VALUES (%s::uuid,%s,NOW())', USER_A, "legacy@example.invalid")
        await db.execute('INSERT INTO notebooks (id,"userId","updatedAt") VALUES (%s::uuid,%s::uuid,NOW())', ids[0], USER_A)
        await db.execute('INSERT INTO uploaded_documents (id,"userId","notebookId","updatedAt") VALUES (%s::uuid,%s::uuid,%s::uuid,NOW())', ids[1], USER_A, ids[0])
        await db.execute('INSERT INTO conversations (id,"userId","notebookId","updatedAt") VALUES (%s::uuid,%s::uuid,%s::uuid,NOW())', ids[2], USER_A, ids[0])
        for role, mid in (("USER", ids[3]), ("LLM", ids[4])):
            await db.execute('INSERT INTO conversation_messages (id,"conversationId",role,message,"createdAt") VALUES (%s::uuid,%s::uuid,%s::"MESSAGEROLES",%s,NOW() + %s * INTERVAL \'1 second\')', mid, ids[2], role, "Legacy " + role, 0 if role == "USER" else 1)
        await db.execute('INSERT INTO message_sources ("messageId","documentId","citationText") VALUES (%s::uuid,%s::uuid,%s)', ids[4], ids[1], "Original legacy passage")
    async def check():
        async with database(seed) as db:
            result = await history.messages(db, USER_A, ids[2], limit=1)
            assert result["items"][0]["content"] == "Legacy LLM"
            citation = result["items"][0]["response"]["citations"][0]
            assert citation["text"] == "Original legacy passage" and citation["source_id"] == ids[1]
            older = await history.messages(db, USER_A, ids[2], limit=1, before=result["next_before"])
            assert older["items"][0]["content"] == "Legacy USER" and older["next_before"] is None
            assert (await history.own_conversation(db, USER_A, ids[2]))["version"] == 1
            assert len(await db.query('SELECT id FROM message_sources')) == 1
    run(check)


@pytest.mark.parametrize("query", ["", "?sslmode=disable", "?sslmode=require&sslaccept=accept_invalid_certs", "?sslmode=require&sslmode=verify-full"])
def test_production_connections_cannot_disable_tls(query):
    with pytest.raises(ValueError):
        connection_url("postgresql://user:dummy@example.invalid/database" + query)


def test_prisma_configuration_translates_to_verified_libpq_tls():
    result = connection_url("postgresql://user:dummy@example.invalid/database?sslmode=require&sslaccept=strict&schema=private&pgbouncer=true&connection_limit=1")
    assert "sslmode=verify-full" in result
    assert "sslaccept" not in result and "schema=" not in result and "pgbouncer" not in result


@pytest.mark.parametrize("value", ["", "postgresql://[broken", "postgresql://user:dummy@example.invalid/database?sslmode=disable"])
def test_invalid_runtime_database_configuration_fails_without_connection_details(monkeypatch, value):
    monkeypatch.setenv("DATABASE_URL", value)
    async def check():
        with pytest.raises(HTTPException) as error:
            await get_db()
        assert error.value.status_code == 503
        assert error.value.detail == "Saved conversations are temporarily unavailable"
    run(check)


def test_schema_and_timezone_are_applied_inside_every_transaction():
    async def check():
        async with database() as session:
            schema = (await session.query("SELECT current_schema() AS name"))[0]["name"]
            class LocalPool:
                @asynccontextmanager
                async def connection(self):
                    yield session.connection
            db = Database(LocalPool(), schema)
            # Model the loss of server-session settings under transaction pooling.
            await session.connection.execute("SET search_path TO public")
            await session.connection.execute("SET TIME ZONE 'Pacific/Honolulu'")
            for _ in range(2):
                row = (await db.query("SELECT current_schema() AS schema, current_setting('TimeZone') AS zone"))[0]
                assert row == {"schema": schema, "zone": "UTC"}
                assert (await session.query("SELECT current_schema() AS name"))[0]["name"] == "public"
                assert (await session.query("SHOW TimeZone"))[0]["TimeZone"] == "Pacific/Honolulu"
    run(check)

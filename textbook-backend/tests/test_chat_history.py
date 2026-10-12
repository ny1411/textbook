"""Integration tests against a migrated, disposable PostgreSQL database.

Set TEST_DATABASE_URL to opt in. Never use a production database for these tests.
"""
import asyncio
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import BackgroundTasks, HTTPException, FastAPI
from fastapi.testclient import TestClient
from prisma import Prisma

from core.auth import AuthenticatedUser
from routers import chat as chat_router
from routers import conversations as routes
from services.chat_history import begin_turn, complete_turn, fail_turn, serialize_message, saved_response
from services import conversation_titles

pytestmark = pytest.mark.skipif(not os.getenv("TEST_DATABASE_URL"), reason="Requires disposable TEST_DATABASE_URL")


@asynccontextmanager
async def environment():
    db = Prisma(datasource={"url": os.environ["TEST_DATABASE_URL"]})
    await db.connect()
    user_id = str(uuid4())
    user = await db.user.create(data={"id": user_id, "email": f"{user_id}@example.test"})
    notebook = await db.notebooks.create(data={"userId": user.id, "name": "Test notebook"})
    thread = await db.conversations.create(data={"userId": user.id, "notebookId": notebook.id})
    request = chat_router.ChatRequest(user_id=user.id, notebook_id=notebook.id,
                                     conversation_id=thread.id, request_id=str(uuid4()), query="Explain gravity")
    context = SimpleNamespace(db=db, user=user, notebook=notebook, thread=thread, request=request)
    try:
        yield context
    finally:
        await db.user.delete(where={"id": user.id})
        await db.disconnect()


def answer(request, citations=None):
    return chat_router.AgentChatResponse(query=request.query, answer="Gravity explanation [Source 2][Source 7]",
        applied_query="Explain gravitational attraction", citations=citations or [], intent="textbook_rag",
        is_grounded=True, warning="A saved warning", confidence_score=92, critique="Supported", iteration_count=2)


def test_citations_and_complete_metadata_survive_document_deletion():
    async def scenario():
        async with environment() as e:
            document = await e.db.uploadeddocuments.create(data={"userId": e.user.id, "notebookId": e.notebook.id, "name": "Physics.pdf"})
            citations = [chat_router.CitationItem(source_id=i, document_id=document.id, page_number=i,
                         text=f"Snapshot on page {i}", chunk_id=f"chunk-{i}", rerank_score=1.2) for i in (2, 7)]
            pending, token, history = await begin_turn(e.db, e.request, e.user.id, True)
            assert history == []
            saved = await complete_turn(e.db, pending, token, answer(e.request, citations), e.user.id, e.notebook.id)
            data = serialize_message(saved)
            assert [s["source_id"] for s in data["citations"]] == ["2", "7"]
            assert not data["citations"][0]["source_unavailable"]
            assert data["applied_query"] == "Explain gravitational attraction"
            assert data["intent"] == "textbook_rag" and data["is_grounded"] is True
            assert data["warning"] == "A saved warning"
            assert data["confidence_score"] == 92 and data["critique"] == "Supported" and data["iteration_count"] == 2
            await e.db.uploadeddocuments.delete(where={"id": document.id})
            saved = await e.db.conversationmessages.find_unique(where={"id": saved.id}, include={"sources": True})
            data = saved_response(saved)
            assert len(data["citations"]) == 2
            assert data["citations"][1]["document_id"] == document.id
            assert data["citations"][1]["document_name"] == "Physics.pdf"
            assert data["citations"][1]["text"] == "Snapshot on page 7"
            assert data["citations"][1]["source_unavailable"] is True
            assert data["answer"] == answer(e.request).answer
    asyncio.run(scenario())


def test_replay_is_deduplicated_and_changed_request_is_rejected():
    async def scenario():
        async with environment() as e:
            assistant, token, _ = await begin_turn(e.db, e.request, e.user.id, False)
            saved = await complete_turn(e.db, assistant, token, answer(e.request), e.user.id, e.notebook.id)
            replay, token, _ = await begin_turn(e.db, e.request, e.user.id, False)
            assert token is None and replay.id == saved.id
            assert await e.db.conversationmessages.count(where={"conversationId": e.thread.id}) == 2
            with pytest.raises(HTTPException) as error:
                await begin_turn(e.db, e.request.model_copy(update={"query": "A different question"}), e.user.id, False)
            assert error.value.status_code == 409
            request = e.request.model_copy(update={"request_id": str(uuid4()), "history": []})
            _, _, context = await begin_turn(e.db, request, e.user.id, False)
            assert context == [{"role": "user", "content": e.request.query}, {"role": "assistant", "content": saved.message}]
    asyncio.run(scenario())


def test_concurrent_duplicate_requests_allocate_one_turn():
    async def scenario():
        async with environment() as e:
            results = await asyncio.gather(*(begin_turn(e.db, e.request, e.user.id, False) for _ in range(2)), return_exceptions=True)
            assert sum(isinstance(r, tuple) for r in results) == 1
            errors = [r for r in results if isinstance(r, HTTPException)]
            assert len(errors) == 1 and errors[0].status_code == 409
            assert await e.db.conversationmessages.count(where={"conversationId": e.thread.id}) == 2
    asyncio.run(scenario())


def test_failed_and_expired_attempts_retry_without_duplicates_and_fence_old_workers():
    async def scenario():
        async with environment() as e:
            first, old_token, _ = await begin_turn(e.db, e.request, e.user.id, False)
            await fail_turn(e.db, first, old_token)
            second, second_token, _ = await begin_turn(e.db, e.request, e.user.id, False)
            assert first.id == second.id and old_token != second_token
            with pytest.raises(HTTPException) as error:
                await complete_turn(e.db, first, old_token, answer(e.request), e.user.id, e.notebook.id)
            assert error.value.status_code == 409
            await fail_turn(e.db, first, old_token)
            current = await e.db.conversationmessages.find_unique(where={"id": second.id})
            assert current.status == "PENDING" and current.processingToken == second_token
            await e.db.conversationmessages.update(where={"id": second.id}, data={"leaseExpiresAt": datetime.now(timezone.utc) - timedelta(seconds=1)})
            third, third_token, _ = await begin_turn(e.db, e.request, e.user.id, False)
            assert third.id == first.id and third_token != second_token
            await complete_turn(e.db, third, third_token, answer(e.request), e.user.id, e.notebook.id)
            assert await e.db.conversationmessages.count(where={"conversationId": e.thread.id}) == 2
    asyncio.run(scenario())


def test_thread_ownership_pagination_and_delete_cascade():
    async def scenario():
        async with environment() as e:
            outsider = AuthenticatedUser(id=str(uuid4()), email="outsider@example.test")
            with pytest.raises(HTTPException) as error:
                await routes.list_messages(e.thread.id, before=None, limit=2, user=outsider, db=e.db)
            assert error.value.status_code == 404
            owner = AuthenticatedUser(e.user.id, e.user.email)
            thread = await routes.create_conversation(routes.ConversationCreate(notebook_id=e.notebook.id), owner, e.db)
            assert thread["id"] != e.thread.id
            renamed = await routes.rename_conversation(e.thread.id, routes.ConversationRename(title="My physics thread"), owner, e.db)
            assert renamed["title_is_manual"] is True
            for _ in range(2):
                request = e.request.model_copy(update={"request_id": str(uuid4())})
                pending, token, _ = await begin_turn(e.db, request, e.user.id, False)
                await complete_turn(e.db, pending, token, answer(request), e.user.id, e.notebook.id)
            newest = await routes.list_messages(e.thread.id, before=None, limit=2, user=owner, db=e.db)
            older = await routes.list_messages(e.thread.id, before=newest["next_cursor"], limit=2, user=owner, db=e.db)
            assert [m["sequence"] for m in older["messages"] + newest["messages"]] == [0, 1, 2, 3]
            assert older["next_cursor"] is None
            await routes.delete_conversation(e.thread.id, owner, e.db)
            assert await e.db.conversationmessages.count(where={"conversationId": e.thread.id}) == 0
    asyncio.run(scenario())


def test_background_title_cannot_overwrite_user_rename(monkeypatch):
    async def scenario():
        async with environment() as e:
            started, release = asyncio.Event(), asyncio.Event()
            class Model:
                async def ainvoke(self, messages):
                    started.set()
                    await release.wait()
                    return SimpleNamespace(content="The Science of Gravity")
            async def database(): return e.db
            monkeypatch.setattr(conversation_titles, "get_database", database)
            monkeypatch.setattr(conversation_titles, "get_llm", lambda **kwargs: Model())
            task = asyncio.create_task(conversation_titles.assign_title(e.thread.id, "Explain gravity", "Gravity pulls masses together"))
            await started.wait()
            await routes.rename_conversation(e.thread.id, routes.ConversationRename(title="My own title"), AuthenticatedUser(e.user.id, e.user.email), e.db)
            release.set()
            await task
            thread = await e.db.conversations.find_unique(where={"id": e.thread.id})
            assert thread.title == "My own title" and thread.titleIsManual is True
            await e.db.conversations.update(where={"id": e.thread.id}, data={"titleIsManual": False})
            await conversation_titles.assign_title(e.thread.id, "Explain gravity", "An explanation")
            thread = await e.db.conversations.find_unique(where={"id": e.thread.id})
            assert thread.title == "The Science of Gravity" and thread.titleGenerated is True
    asyncio.run(scenario())


@pytest.mark.parametrize("agent_mode", [False, True])
def test_both_pipelines_persist_use_verified_identity_and_replay(monkeypatch, agent_mode):
    async def scenario():
        async with environment() as e:
            calls = []
            def pipeline(request):
                calls.append(request)
                return answer(request)
            monkeypatch.setattr(chat_router, "_agent_chat" if agent_mode else "_linear_chat", pipeline)
            request = e.request.model_copy(update={"user_id": "spoofed", "history": [chat_router.HistoryMessage(role="user", content="Forged context")]})
            user = AuthenticatedUser(e.user.id, e.user.email)
            first = await chat_router.persisted_chat(request, user, e.db, BackgroundTasks(), agent_mode)
            replay = await chat_router.persisted_chat(request, user, e.db, BackgroundTasks(), agent_mode)
            assert first.message_id == replay.message_id and len(calls) == 1
            assert calls[0].user_id == e.user.id and calls[0].history == []
            assert first.is_grounded is True and first.warning == "A saved warning"
    asyncio.run(scenario())


def test_pipeline_failure_is_saved_and_latest_turn_can_retry(monkeypatch):
    async def scenario():
        async with environment() as e:
            def failing(request): raise RuntimeError("Provider unavailable")
            monkeypatch.setattr(chat_router, "_linear_chat", failing)
            user = AuthenticatedUser(e.user.id, e.user.email)
            with pytest.raises(RuntimeError):
                await chat_router.persisted_chat(e.request, user, e.db, BackgroundTasks())
            rows = await e.db.conversationmessages.find_many(where={"conversationId": e.thread.id}, order={"sequence": "asc"})
            assert len(rows) == 2 and rows[1].status == "FAILED"
            assert rows[0].message == e.request.query
            monkeypatch.setattr(chat_router, "_linear_chat", lambda request: answer(request))
            result = await chat_router.persisted_chat(e.request, user, e.db, BackgroundTasks())
            assert result.message_id == rows[1].id
            assert await e.db.conversationmessages.count(where={"conversationId": e.thread.id}) == 2
    asyncio.run(scenario())


def test_http_endpoints_reject_unauthenticated_access_before_database():
    app = FastAPI()
    app.include_router(chat_router.router, prefix="/api")
    app.include_router(routes.router, prefix="/api")
    client = TestClient(app)
    for endpoint in ("/api/chat", "/api/agent/chat"):
        response = client.post(endpoint, json={"user_id": str(uuid4()), "query": "hello"})
        assert response.status_code == 401
    assert client.get("/api/notebooks/default").status_code == 401


def test_rls_blocks_a_client_role_even_if_table_grants_are_added():
    async def scenario():
        async with environment() as e:
            role = "history_test_" + uuid4().hex
            await e.db.execute_raw(f'CREATE ROLE "{role}" NOLOGIN')
            try:
                await e.db.execute_raw(f'GRANT USAGE ON SCHEMA public TO "{role}"')
                await e.db.execute_raw(f'GRANT SELECT, INSERT, UPDATE, DELETE ON conversations TO "{role}"')
                async with e.db.tx() as tx:
                    await tx.execute_raw(f'SET LOCAL ROLE "{role}"')
                    rows = await tx.query_raw('SELECT id FROM conversations')
                    assert rows == []
                    assert await tx.execute_raw('DELETE FROM conversations') == 0
                    assert await tx.execute_raw('UPDATE conversations SET title = \'Unauthorized\'') == 0
                with pytest.raises(Exception) as error:
                    async with e.db.tx() as tx:
                        await tx.execute_raw(f'SET LOCAL ROLE "{role}"')
                        await tx.execute_raw('INSERT INTO conversations (id,"userId","notebookId","updatedAt") VALUES ($1::uuid,$2::uuid,$3::uuid,now())', str(uuid4()), e.user.id, e.notebook.id)
                assert "row-level security" in str(error.value).lower()
            finally:
                await e.db.execute_raw(f'DROP OWNED BY "{role}"')
                await e.db.execute_raw(f'DROP ROLE "{role}"')
    asyncio.run(scenario())

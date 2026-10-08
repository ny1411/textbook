"""Speech endpoint ownership against real disposable SQL, with synthetic audio only."""
import asyncio

import httpx

from history_fixture import build_app, database, token, USER_A, USER_B
from test_voice import configure, provider_payload


def test_owned_speech_and_cross_account_rejection_do_not_persist_audio_or_messages(monkeypatch):
    requests = []
    configure(monkeypatch, lambda request: requests.append(request) or httpx.Response(200, json=provider_payload()))
    async def check():
        async with database() as db:
            app = build_app(db)
            from routers.voice import router
            app.include_router(router, prefix="/api")
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test",
                    headers={"Authorization": "Bearer " + token(USER_A)}) as owner, \
                    httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test",
                    headers={"Authorization": "Bearer " + token(USER_B)}) as other:
                own_notebook = (await owner.get("/api/notebooks")).json()[0]["id"]
                other_notebook = (await other.get("/api/notebooks")).json()[0]["id"]
                passage = {"notebook_id": own_notebook, "text": "A mechanics summary."}
                denied = await other.post("/api/voice/synthesize", json=passage)
                assert denied.status_code == 404
                assert not requests
                generated = await owner.post("/api/voice/synthesize", json=passage)
                assert generated.status_code == 200 and generated.content.startswith(b"RIFF")
                assert (await other.post("/api/voice/synthesize", json={**passage, "notebook_id": other_notebook})).status_code == 200
                assert len(requests) == 2
                assert not await db.query("SELECT id FROM conversation_messages")
                assert not await db.query("SELECT id FROM chat_attachments")
    asyncio.run(check())

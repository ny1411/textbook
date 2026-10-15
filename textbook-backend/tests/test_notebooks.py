"""Notebook creation, durable chat linkage, and owner isolation against SQL."""
import asyncio
from uuid import uuid4

import httpx
from history_fixture import build_app, database, USER_A, USER_B, token


def test_create_notebook_retry_validation_and_chat_scope():
    async def check():
        async with database() as db:
            app = build_app(db)
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test",
                    headers={"Authorization": "Bearer " + token(USER_A)}) as owner, \
                    httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test",
                    headers={"Authorization": "Bearer " + token(USER_B)}) as other:
                original = (await owner.get("/api/notebooks")).json()[0]["id"]
                notebook_id = str(uuid4())
                payload = {"id": notebook_id, "name": "  Machine learning  "}
                created = await owner.post("/api/notebooks", json=payload)
                assert created.status_code == 201, created.text
                assert created.json() == {"id": notebook_id, "name": "Machine learning"}
                assert (await owner.post("/api/notebooks", json=payload)).json() == created.json()
                assert len((await owner.get("/api/notebooks")).json()) == 2
                for name in ("", "   ", "x" * 101):
                    assert (await owner.post("/api/notebooks", json={"name": name})).status_code == 422
                thread = await owner.post("/api/conversations", json={"notebook_id": notebook_id})
                assert thread.status_code == 201, thread.text
                assert thread.json()["notebook_id"] == notebook_id
                rows = await db.query('SELECT "notebookId", "userId" FROM conversations WHERE id = %s::uuid', thread.json()["id"])
                assert str(rows[0]["notebookId"]) == notebook_id
                assert str(rows[0]["userId"]) == USER_A
                assert (await owner.get(f"/api/conversations?notebook_id={original}")).json()["items"] == []
                assert len((await owner.get(f"/api/conversations?notebook_id={notebook_id}")).json()["items"]) == 1
                assert (await other.post("/api/notebooks", json=payload)).status_code == 404
                assert (await other.post("/api/conversations", json={"notebook_id": notebook_id})).status_code == 404
                assert (await other.get(f"/api/conversations?notebook_id={notebook_id}")).status_code == 404
                assert (await owner.post("/api/notebooks", json={"name": "Unowned"}, headers={"Authorization": "Bearer invalid"})).status_code == 401
                # Verify the actual FK, rather than only trusting the API's returned ID.
                foreign_keys = await db.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = 'conversations'::regclass AND contype = 'f'")
                assert any('FOREIGN KEY ("notebookId") REFERENCES notebooks(id)' in row["definition"] for row in foreign_keys)
    asyncio.run(check())

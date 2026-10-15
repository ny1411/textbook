"""Original-byte previews must remain private and reject unavailable sources."""
import asyncio
from uuid import UUID

import httpx
from history_fixture import build_app, USER_A, USER_B, token, OBJECTS

DOCUMENT = "11111111-1111-4111-8111-111111111111"


class OwnedDocumentFixture:
    deletion_pending = False

    async def query(self, sql, document_id, user_id):
        assert "JOIN notebooks" in sql
        assert 'd."userId" = %s::uuid' in sql
        if document_id != DOCUMENT or user_id != USER_A:
            return []
        return [{"id": UUID(DOCUMENT), "name": "Research résumé.pdf", "storageUrl": USER_A + "/preview.pdf",
                 "deletionPending": self.deletion_pending}]


def test_content_auth_ownership_bytes_and_pending_deletion():
    async def check():
        db = OwnedDocumentFixture()
        app = build_app(db)
        original = b"%PDF-1.7\nOriginal document bytes"
        OBJECTS[USER_A + "/preview.pdf"] = original
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app), base_url="http://test") as client:
            path = f"/api/documents/{DOCUMENT}/content"
            assert (await client.get(path)).status_code == 401
            assert (await client.get(path, headers={"Authorization": "Bearer invalid"})).status_code == 401
            assert (await client.get(path, headers={"Authorization": "Bearer " + token(USER_B)})).status_code == 404
            owner = {"Authorization": "Bearer " + token(USER_A)}
            result = await client.get(path, headers=owner)
            assert result.status_code == 200, result.text
            assert result.content == original
            assert result.headers["cache-control"] == "private, no-store"
            assert result.headers["content-type"] == "application/octet-stream"
            assert result.headers["x-content-type-options"] == "nosniff"
            assert "r%C3%A9sum%C3%A9.pdf" in result.headers["content-disposition"]
            db.deletion_pending = True
            assert (await client.get(path, headers=owner)).status_code == 404
            assert (await client.get("/api/documents/not-a-uuid/content", headers=owner)).status_code == 422
        OBJECTS.pop(USER_A + "/preview.pdf", None)
    asyncio.run(check())

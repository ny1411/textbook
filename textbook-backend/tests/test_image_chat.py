"""Private image attachments, actual SQL persistence, and multimodal chat lifecycle."""
import asyncio
import base64
from io import BytesIO
from uuid import uuid4

import pytest
from PIL import Image

import history_fixture as fixture
from history_fixture import database, USER_B, EVENTS, CACHE, OBJECTS
from test_chat_history import body, closing, setup


def run(function):
    return asyncio.run(function())


def image_bytes(format="PNG", color="white"):
    output = BytesIO()
    Image.new("RGB", (24, 20), color=color).save(output, format=format)
    return output.getvalue()


async def upload_image(client, thread, *, upload_id=None, content=None, name="graph.png", media_type="image/png"):
    return await client.post("/api/chat/attachments", data={"conversation_id": thread, "upload_id": upload_id or str(uuid4())},
        files={"file": (name, image_bytes() if content is None else content, media_type)})


@pytest.fixture(autouse=True)
def clean_providers():
    CACHE.clear()
    EVENTS.clear()
    OBJECTS.clear()
    if hasattr(fixture, "VISION_EVENTS"):
        fixture.VISION_EVENTS.clear()


@pytest.mark.parametrize("format,name,media_type", [
    ("PNG", "graph.png", "image/png"),
    ("JPEG", "page.jpg", "image/jpeg"),
    ("WEBP", "chart.webp", "image/webp"),
], ids=["png", "jpeg", "webp"])
def test_valid_image_upload_is_private_and_abandoned_image_can_be_removed(format, name, media_type):
    async def check():
        async with database() as db:
            client, _, thread, _ = await setup(db)
            other, _, _, _ = await setup(db, USER_B)
            async with closing(client), closing(other):
                content = image_bytes(format)
                response = await upload_image(client, thread, content=content, name=name, media_type=media_type)
                assert response.status_code == 201, response.text
                attachment = response.json()
                assert attachment["name"] == name
                assert attachment["media_type"] == media_type
                assert attachment["size"] == len(content)
                assert attachment["url"] == f'/api/chat/attachments/{attachment["id"]}/content'
                assert attachment["created_at"]
                own_content = await client.get(attachment["url"])
                assert own_content.status_code == 200
                assert own_content.content == content
                assert own_content.headers["content-type"].startswith(media_type)
                assert "private" in own_content.headers.get("cache-control", "")
                assert (await client.get(attachment["url"], headers={"Authorization": ""})).status_code == 401
                assert (await other.get(attachment["url"])).status_code == 404
                assert (await other.delete(f'/api/chat/attachments/{attachment["id"]}')).status_code in (204, 404)
                assert (await client.get(attachment["url"])).content == content
                assert (await other.post("/api/chat/attachments", data={"conversation_id": thread, "upload_id": str(uuid4())},
                    files={"file": (name, content, media_type)})).status_code == 404
                deleted = await client.delete(f'/api/chat/attachments/{attachment["id"]}')
                assert deleted.status_code in (200, 204)
                assert (await client.get(attachment["url"])).status_code == 404
                assert not OBJECTS or all(value != content for value in OBJECTS.values())
                assert not EVENTS
    run(check)


def test_upload_retry_is_idempotent_and_upload_identifier_cannot_change_content():
    async def check():
        async with database() as db:
            client, _, thread, _ = await setup(db)
            async with closing(client):
                upload_id = str(uuid4())
                first = await upload_image(client, thread, upload_id=upload_id)
                repeated = await upload_image(client, thread, upload_id=upload_id)
                assert first.status_code == repeated.status_code == 201
                assert first.json() == repeated.json()
                changed = await upload_image(client, thread, upload_id=upload_id, content=image_bytes(color="red"))
                assert changed.status_code == 409
                assert len(await db.query('SELECT id FROM chat_attachments')) == 1
    run(check)


def test_transient_storage_failure_can_retry_the_reserved_upload_without_duplicates(monkeypatch):
    original_upload = fixture.Storage.upload
    attempts = []

    def flaky_upload(self, path, data, options):
        attempts.append(path)
        if len(attempts) == 1:
            raise RuntimeError("Synthetic storage outage")
        return original_upload(self, path, data, options)

    async def check():
        async with database() as db:
            client, _, thread, _ = await setup(db)
            async with closing(client):
                # The chapter upload must complete before failing image storage.
                monkeypatch.setattr(fixture.Storage, "upload", flaky_upload)
                upload_id = str(uuid4())
                failed = await upload_image(client, thread, upload_id=upload_id)
                assert failed.status_code == 503, failed.text
                recovered = await upload_image(client, thread, upload_id=upload_id)
                assert recovered.status_code == 201, recovered.text
                assert recovered.json()["id"] == upload_id
                assert len(await db.query('SELECT id FROM chat_attachments')) == 1
                assert attempts[0] == attempts[1]
                assert (await client.get(recovered.json()["url"])).status_code == 200
    run(check)


@pytest.mark.parametrize("name,media_type,content", [
    ("unsafe.svg", "image/svg+xml", b'<svg xmlns="http://www.w3.org/2000/svg"/>'),
    ("not-a-photo.png", "image/png", b"not an image"),
    ("document.png", "image/png", b"%PDF-1.7 fake image"),
    ("spoof.jpg", "image/jpeg", image_bytes()),
    ("unsupported.gif", "image/gif", image_bytes("GIF")),
], ids=["svg", "corrupt", "pdf-spoof", "mime-spoof", "gif"])
def test_upload_rejects_unsupported_corrupt_and_spoofed_images(name, media_type, content):
    async def check():
        async with database() as db:
            client, _, thread, _ = await setup(db)
            async with closing(client):
                response = await upload_image(client, thread, name=name, media_type=media_type, content=content)
                assert response.status_code == 415, response.text
                assert not await db.query('SELECT id FROM chat_attachments')
                assert not EVENTS
    run(check)


def test_upload_rejects_over_limit_body_before_persistence():
    async def check():
        async with database() as db:
            client, _, thread, _ = await setup(db)
            async with closing(client):
                response = await upload_image(client, thread, content=image_bytes() + b"x" * (10 * 1024 * 1024))
                assert response.status_code == 413, response.text
                assert not await db.query('SELECT id FROM chat_attachments')
    run(check)


@pytest.mark.parametrize("route", ["/api/chat", "/api/agent/chat"])
def test_image_only_chat_saves_user_attachments_observations_and_exact_retry_response(route):
    async def check():
        async with database() as db:
            client, notebook, thread, _ = await setup(db)
            async with closing(client):
                uploaded = await upload_image(client, thread)
                assert uploaded.status_code == 201, uploaded.text
                attachment = uploaded.json()
                payload = body(notebook, thread, "", attachment_ids=[attachment["id"]], document_ids=[])
                first = await client.post(route, json=payload)
                assert first.status_code == 200, first.text
                saved = first.json()
                assert saved["query"] == ""
                assert saved["answer"]
                assert saved["attachments"] == [attachment]
                assert saved["image_observations"]
                assert saved["citations"] == []
                assert saved["is_grounded"] is False
                assert saved["warning"]
                before_replay = len(fixture.VISION_EVENTS)
                repeated = await client.post(route, json=payload)
                assert repeated.status_code == 200, repeated.text
                assert repeated.json() == saved
                assert len(fixture.VISION_EVENTS) == before_replay
                assert len(await db.query('SELECT id FROM conversation_messages')) == 2
                restored = (await client.get(f"/api/conversations/{thread}/messages")).json()["items"]
                assert restored[0]["role"] == "user"
                assert restored[0]["attachments"] == [attachment]
                assert restored[1]["response"] == saved
                assert (await client.delete(f'/api/chat/attachments/{attachment["id"]}')).status_code == 409
                assert (await client.get(attachment["url"])).status_code == 200
                followup = await client.post(route, json=body(notebook, thread, "Explain the visible graph", document_ids=[]))
                assert followup.status_code == 200, followup.text
                assert EVENTS[-1]["history"]
                assert "visible fixture graph" in str(EVENTS[-1]["history"])
                followup_images = fixture.VISION_EVENTS[-1]["images"]
                assert len(followup_images) == 1
                _, encoded = followup_images[0]["image_url"]["url"].split(",", 1)
                assert base64.b64decode(encoded, validate=True) == image_bytes()
                assert not CACHE
    run(check)


def test_attachment_ids_are_part_of_chat_request_fingerprint():
    async def check():
        async with database() as db:
            client, notebook, thread, _ = await setup(db)
            async with closing(client):
                first = (await upload_image(client, thread)).json()
                second = (await upload_image(client, thread, content=image_bytes(color="red"))).json()
                payload = body(notebook, thread, "Read this plot", attachment_ids=[first["id"]])
                assert (await client.post("/api/chat", json=payload)).status_code == 200
                altered = await client.post("/api/chat", json={**payload, "attachment_ids": [second["id"]]})
                assert altered.status_code == 409
                assert len(await db.query('SELECT id FROM conversation_messages')) == 2
                assert (await client.delete(f'/api/chat/attachments/{second["id"]}')).status_code in (200, 204)
    run(check)


def test_attachment_ownership_and_notebook_thread_scope_checked_before_inference():
    async def check():
        async with database() as db:
            client, notebook, thread, _ = await setup(db)
            other, other_notebook, other_thread, _ = await setup(db, USER_B)
            async with closing(client), closing(other):
                attachment = (await upload_image(client, thread)).json()
                same_notebook_thread = (await client.post("/api/conversations", json={"notebook_id": notebook})).json()["id"]
                another_notebook = (await client.post("/fixture/notebooks")).json()["id"]
                another_thread = (await client.post("/api/conversations", json={"notebook_id": another_notebook})).json()["id"]
                for current_client, nb, target in [(other, other_notebook, other_thread),
                        (client, notebook, same_notebook_thread), (client, another_notebook, another_thread)]:
                    response = await current_client.post("/api/chat", json=body(nb, target, "Inspect this", attachment_ids=[attachment["id"]]))
                    assert response.status_code == 404, response.text
                missing = await client.post("/api/chat", json=body(notebook, thread, "Inspect this", attachment_ids=[str(uuid4())]))
                assert missing.status_code == 404
                assert not EVENTS
                if hasattr(fixture, "VISION_EVENTS"):
                    assert not fixture.VISION_EVENTS
                assert not await db.query('SELECT id FROM conversation_messages')
    run(check)


def test_empty_message_and_more_than_four_attachments_are_rejected():
    async def check():
        async with database() as db:
            client, notebook, thread, _ = await setup(db)
            async with closing(client):
                for query in ("", "   "):
                    assert (await client.post("/api/chat", json=body(notebook, thread, query))).status_code == 422
                invalid = await client.post("/api/chat", json=body(notebook, thread, "Inspect this", attachment_ids=["not-a-uuid"]))
                assert invalid.status_code == 422
                too_many = await client.post("/api/chat", json=body(notebook, thread, "Inspect these", attachment_ids=[str(uuid4()) for _ in range(5)]))
                assert too_many.status_code == 422
                assert not EVENTS
                assert not await db.query('SELECT id FROM conversation_messages')
    run(check)


def test_four_images_are_accepted_in_one_image_only_message():
    async def check():
        async with database() as db:
            client, notebook, thread, _ = await setup(db)
            async with closing(client):
                attachments = []
                for color in ("white", "red", "green", "blue"):
                    uploaded = await upload_image(client, thread, content=image_bytes(color=color))
                    assert uploaded.status_code == 201, uploaded.text
                    attachments.append(uploaded.json())
                response = await client.post("/api/chat", json=body(notebook, thread, "",
                    attachment_ids=[item["id"] for item in attachments], document_ids=[]))
                assert response.status_code == 200, response.text
                assert response.json()["attachments"] == attachments
                assert response.json()["image_observations"]
                saved = (await client.get(f"/api/conversations/{thread}/messages")).json()["items"]
                assert saved[0]["attachments"] == attachments
    run(check)


def test_failed_generation_preserves_uploaded_attachment_for_successful_retry():
    async def check():
        async with database() as db:
            client, notebook, thread, _ = await setup(db)
            async with closing(client):
                uploaded = (await upload_image(client, thread)).json()
                failed_payload = body(notebook, thread, "fail-generation", attachment_ids=[uploaded["id"]])
                failed = await client.post("/api/chat", json=failed_payload)
                assert failed.status_code == 500, failed.text
                assert not await db.query('SELECT id FROM conversation_messages')
                assert (await client.get(uploaded["url"])).status_code == 200
                recovered = await client.post("/api/chat", json={**failed_payload, "query": "Read the graph"})
                assert recovered.status_code == 200, recovered.text
                assert recovered.json()["attachments"] == [uploaded]
                assert len(await db.query('SELECT id FROM conversation_messages')) == 2
    run(check)


def test_failed_image_observation_can_retry_the_exact_message_without_partial_history(monkeypatch):
    original_invoke = fixture.VisionModel.invoke

    def failed_observation(self, messages, config=None):
        if self.schema and self.schema.__name__ == "ImageAnalysis":
            raise RuntimeError("Synthetic observation failure")
        return original_invoke(self, messages, config=config)

    async def check():
        async with database() as db:
            client, notebook, thread, _ = await setup(db)
            async with closing(client):
                uploaded = (await upload_image(client, thread)).json()
                payload = body(notebook, thread, "Read the graph", attachment_ids=[uploaded["id"]])
                monkeypatch.setattr(fixture.VisionModel, "invoke", failed_observation)
                failed = await client.post("/api/chat", json=payload)
                assert failed.status_code == 502, failed.text
                assert not await db.query('SELECT id FROM conversation_messages')
                assert (await client.get(uploaded["url"])).status_code == 200
                monkeypatch.setattr(fixture.VisionModel, "invoke", original_invoke)
                recovered = await client.post("/api/chat", json=payload)
                assert recovered.status_code == 200, recovered.text
                assert recovered.json()["attachments"] == [uploaded]
                assert len(await db.query('SELECT id FROM conversation_messages')) == 2
    run(check)


def test_expired_abandoned_images_are_removed_without_deleting_saved_message_images():
    async def check():
        async with database() as db:
            client, notebook, thread, _ = await setup(db)
            async with closing(client):
                saved_image = (await upload_image(client, thread)).json()
                answer = await client.post("/api/chat", json=body(notebook, thread, "Read the graph",
                    attachment_ids=[saved_image["id"]], document_ids=[]))
                assert answer.status_code == 200, answer.text
                abandoned = (await upload_image(client, thread, content=image_bytes(color="red"))).json()
                await db.execute('UPDATE chat_attachments SET "expiresAt" = NOW() - INTERVAL \'1 minute\' WHERE id = %s::uuid', abandoned["id"])
                assert (await client.get(abandoned["url"])).status_code == 404
                from services.chat_attachments import cleanup_expired
                assert await cleanup_expired(db) == 1
                assert [str(row["id"]) for row in await db.query('SELECT id FROM chat_attachments')] == [saved_image["id"]]
                assert (await client.get(saved_image["url"])).status_code == 200
                assert (await client.get(abandoned["url"])).status_code == 404
                assert image_bytes(color="red") not in OBJECTS.values()
    run(check)

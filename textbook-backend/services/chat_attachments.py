"""Private, owned image uploads with durable IDs and a bounded abandoned-upload TTL."""
import asyncio
import hashlib
import io
import os
import warnings
from datetime import timezone
from pathlib import PurePosixPath

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from db.supabase import supabase_client
from services.chat_history import own_conversation

MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_IMAGES = 4
MAX_PIXELS = 40_000_000
MAX_DIMENSION = 8192
PENDING_TTL_HOURS = 24
FORMATS = {"PNG": "image/png", "JPEG": "image/jpeg", "WEBP": "image/webp"}
EXTENSIONS = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}


def bucket():
    return os.environ.get("CHAT_IMAGE_BUCKET", "textbook-chat-images")


def private_storage():
    """Refuse configuration that could expose stored images through public URLs."""
    try:
        details = supabase_client.storage.get_bucket(bucket())
        public = details.get("public") if isinstance(details, dict) else details.public
        if public is not False:
            raise ValueError("Images require a private bucket")
        return supabase_client.storage.from_(bucket())
    except Exception:
        raise HTTPException(503, "Private image storage is unavailable") from None


def validate_image(data, declared_type):
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Images must be between 1 byte and 10 MiB")
    if declared_type not in FORMATS.values():
        raise HTTPException(415, "Supported images: PNG, JPEG and WebP")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                actual_type = FORMATS.get(image.format)
                if actual_type != declared_type:
                    raise HTTPException(415, "The image contents do not match its media type")
                if image.width * image.height > MAX_PIXELS or max(image.size) > MAX_DIMENSION:
                    raise HTTPException(413, "Images must be at most 40 megapixels and 8192 pixels per side")
                if getattr(image, "is_animated", False):
                    raise HTTPException(415, "Animated images are not supported")
                image.verify()
            # verify checks file structure; load also catches truncated pixel data.
            with Image.open(io.BytesIO(data)) as image:
                image.load()
    except HTTPException:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(413, "Image dimensions are too large") from None
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        raise HTTPException(415, "The file is not a valid supported image") from None
    return actual_type


def attachment_item(row):
    created = row["createdAt"]
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    return {"id": str(row["id"]), "name": row["name"], "media_type": row["mediaType"],
            "size": row["size"], "url": f'/api/chat/attachments/{row["id"]}/content',
            "created_at": created.isoformat()}


async def upload(db, user_id, conversation_id, upload_id, filename, media_type, data):
    media_type = await asyncio.to_thread(validate_image, data, media_type)
    conversation = await own_conversation(db, user_id, conversation_id)
    notebook_id = str(conversation["notebookId"])
    name = PurePosixPath((filename or "image").replace("\\", "/")).name
    name = "".join(character for character in name if ord(character) >= 32 and ord(character) != 127)[:180] or "image"
    digest = hashlib.sha256(data).hexdigest()
    path = f'{user_id}/{notebook_id}/{conversation_id}/{upload_id}.{EXTENSIONS[media_type]}'
    # Reserve the deterministic storage path before external I/O. A killed worker
    # leaves a discoverable uploading row for a same-ID retry or the TTL sweeper.
    await db.execute('INSERT INTO chat_attachments (id, "userId", "notebookId", "conversationId", '
        'name, "mediaType", size, digest, "storagePath", state, "expiresAt") '
        'VALUES (%s::uuid, %s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, \'uploading\', '
        'NOW() + INTERVAL \'24 hours\') ON CONFLICT (id) DO NOTHING',
        upload_id, user_id, notebook_id, conversation_id, name, media_type, len(data), digest, path)
    async with db.transaction() as tx:
        rows = await tx.query('SELECT *, "expiresAt" > NOW() AS live FROM chat_attachments WHERE id = %s::uuid FOR UPDATE', upload_id)
        if not rows:
            raise HTTPException(410, "This image upload was removed; choose the image again")
        row = rows[0]
        if str(row["userId"]) != user_id or str(row["conversationId"]) != conversation_id or str(row["notebookId"]) != notebook_id:
            raise HTTPException(404, "Image attachment not found")
        if any(row[key] != value for key, value in (("digest", digest), ("name", name), ("mediaType", media_type), ("size", len(data)))):
            raise HTTPException(409, "This upload ID was already used for another image")
        if row["state"] == "deleting" or (row["state"] != "attached" and not row["live"]):
            raise HTTPException(410, "This image upload expired; choose the image again")
        if row["state"] in ("pending", "attached"):
            return attachment_item(row)
        try:
            # The per-image row lock serializes retries and cleanup. No conversation
            # lock is held, and inference never runs inside this transaction.
            storage = await asyncio.to_thread(private_storage)
            await asyncio.to_thread(storage.upload, path, data,
                {"content-type": media_type, "upsert": "true", "cache-control": "0"})
        except Exception:
            raise HTTPException(503, "Could not upload the image; retry with the same upload ID") from None
        await tx.execute('UPDATE chat_attachments SET state = \'pending\' WHERE id = %s::uuid', upload_id)
    return attachment_item(row)


async def owned_attachment(db, user_id, attachment_id):
    rows = await db.query('SELECT a.* FROM chat_attachments a '
        'JOIN conversations c ON c.id = a."conversationId" AND c."userId" = a."userId" AND c."notebookId" = a."notebookId" '
        'JOIN notebooks n ON n.id = a."notebookId" AND n."userId" = a."userId" '
        'WHERE a.id = %s::uuid AND a."userId" = %s::uuid '
        'AND a.state IN (\'pending\', \'attached\') AND (a.state = \'attached\' OR a."expiresAt" > NOW())',
        attachment_id, user_id)
    if not rows:
        raise HTTPException(404, "Image attachment not found")
    return rows[0]


async def download(row):
    try:
        storage = await asyncio.to_thread(private_storage)
        data = await asyncio.to_thread(storage.download, row["storagePath"])
    except Exception:
        raise HTTPException(503, "This image is temporarily unavailable") from None
    if len(data) != row["size"] or hashlib.sha256(data).hexdigest() != row["digest"]:
        raise HTTPException(503, "This image is temporarily unavailable")
    return data


async def resolve(db, user_id, conversation, attachment_ids):
    rows, images = [], []
    for attachment_id in attachment_ids:
        row = await owned_attachment(db, user_id, attachment_id)
        if str(row["conversationId"]) != str(conversation["id"]) or str(row["notebookId"]) != str(conversation["notebookId"]):
            raise HTTPException(404, "Image attachment not found in this conversation")
        if row["state"] != "pending":
            raise HTTPException(409, "This image is already attached to a saved message")
        rows.append(attachment_item(row))
        images.append({"id": str(row["id"]), "media_type": row["mediaType"], "data": await download(row)})
    return rows, images


async def attach_to_message(tx, user_id, conversation, attachment_ids, message_id):
    for attachment_id in attachment_ids:
        updated = await tx.execute('UPDATE chat_attachments SET "messageId" = %s::uuid, state = \'attached\', "expiresAt" = NULL '
            'WHERE id = %s::uuid AND "userId" = %s::uuid AND "notebookId" = %s::uuid '
            'AND "conversationId" = %s::uuid AND state = \'pending\' AND "expiresAt" > NOW()',
            message_id, attachment_id, user_id, str(conversation["notebookId"]), str(conversation["id"]))
        if updated != 1:
            raise HTTPException(409, "An image changed or expired while answering; choose the image again")


async def previous_images(db, user_id, conversation):
    """Keep the latest image turn available to text-only visual follow-ups."""
    rows = await db.query('SELECT a.*, m.metadata FROM chat_attachments a '
        'JOIN conversation_messages m ON m.id = a."messageId" '
        'WHERE a."conversationId" = %s::uuid AND a."userId" = %s::uuid AND a."notebookId" = %s::uuid '
        'AND a.state = \'attached\' AND m.id = (SELECT "messageId" FROM chat_attachments '
        'JOIN conversation_messages latest ON latest.id = "messageId" '
        'WHERE chat_attachments."conversationId" = %s::uuid AND state = \'attached\' '
        'ORDER BY latest.sequence DESC LIMIT 1)',
        str(conversation["id"]), user_id, str(conversation["notebookId"]), str(conversation["id"]))
    if not rows:
        return [], []
    metadata = rows[0]["metadata"] or {}
    order = [item["id"] for item in metadata.get("attachments", [])]
    rows.sort(key=lambda row: order.index(str(row["id"])) if str(row["id"]) in order else len(order))
    images = [{"id": str(row["id"]), "media_type": row["mediaType"], "data": await download(row)} for row in rows[:MAX_IMAGES]]
    return images, metadata.get("image_observations", [])[:MAX_IMAGES]


async def _remove_claimed(db, rows):
    removed = 0
    for row in rows:
        try:
            await asyncio.to_thread(supabase_client.storage.from_(bucket()).remove, [row["storagePath"]])
        except Exception:
            continue  # The deleting row remains durable and is retried by the sweeper.
        removed += await db.execute('DELETE FROM chat_attachments WHERE id = %s::uuid AND state = \'deleting\' AND "messageId" IS NULL', str(row["id"]))
    return removed


async def remove_pending(db, user_id, attachment_id):
    async with db.transaction() as tx:
        rows = await tx.query('SELECT * FROM chat_attachments WHERE id = %s::uuid AND "userId" = %s::uuid FOR UPDATE', attachment_id, user_id)
        if not rows:
            # Repeating an authorized deletion is harmless and reveals no owner.
            return
        row = rows[0]
        await own_conversation(tx, user_id, str(row["conversationId"]), str(row["notebookId"]))
        if row["messageId"] is not None or row["state"] == "attached":
            raise HTTPException(409, "This image belongs to a saved message")
        await tx.execute('UPDATE chat_attachments SET state = \'deleting\', "expiresAt" = NOW() WHERE id = %s::uuid', attachment_id)
    if await _remove_claimed(db, rows) != 1:
        raise HTTPException(503, "Image cleanup is pending; retry later")


async def cleanup_expired(db):
    rows = await db.query('UPDATE chat_attachments SET state = \'deleting\' WHERE id IN ('
        'SELECT id FROM chat_attachments WHERE "messageId" IS NULL AND "expiresAt" <= NOW() '
        'ORDER BY "expiresAt" LIMIT 100 FOR UPDATE SKIP LOCKED) RETURNING *')
    return await _remove_claimed(db, rows)

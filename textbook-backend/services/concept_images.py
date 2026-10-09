"""Private Imagen figures with owned SQL metadata and durable cleanup intents."""
import asyncio
import base64
import binascii
import hashlib
import io
import json
import os
import re
import warnings
from contextlib import asynccontextmanager
from uuid import uuid4

import httpx
from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from psycopg.types.json import Jsonb

from services.chat_history import own_notebook, timestamp
from services.documents import lock_document, own_document

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_DIMENSION = 2048
MAX_RESPONSE_BYTES = 12 * 1024 * 1024
MAX_WORKSPACE_FIGURES = 100
MAX_PENDING_FIGURES = 4
MAX_WORKSPACE_BYTES = 100 * 1024 * 1024
MAX_REQUESTS_TEN_MINUTES = 3
MAX_REQUESTS_DAY = 20
DEFAULT_MODEL = "imagen-4.0-generate-001"


class ProviderLimiter:
    def __init__(self, max_active=4):
        self.max_active = max_active
        self.active = 0
        self.lock = asyncio.Lock()

    @asynccontextmanager
    async def reserve(self):
        async with self.lock:
            if self.active >= self.max_active:
                raise HTTPException(503, "Figure generation is busy. Try again shortly")
            self.active += 1
        try:
            yield
        finally:
            async with self.lock:
                self.active -= 1


provider_limiter = ProviderLimiter()


def bucket():
    return os.environ.get("CONCEPT_IMAGE_BUCKET", "textbook-concept-figures")


def model_name():
    model = os.environ.get("GOOGLE_IMAGE_MODEL", DEFAULT_MODEL)
    if not re.fullmatch(r"imagen-[a-zA-Z0-9.-]{1,80}", model):
        raise HTTPException(503, "Image generation is not configured")
    return model


def private_storage():
    from db.supabase import supabase_client
    try:
        details = supabase_client.storage.get_bucket(bucket())
        public = details.get("public") if isinstance(details, dict) else details.public
        if public is not False:
            raise ValueError("A private bucket is required")
        return supabase_client.storage.from_(bucket())
    except Exception:
        raise HTTPException(503, "Private figure storage is unavailable") from None


async def settled_thread(function, *args):
    """A cancelled request must observe remote I/O finishing before cleanup.

    Cancelling to_thread alone abandons a still-running Storage upload, allowing
    it to write bytes after cleanup has removed its durable journal row.
    """
    task = asyncio.create_task(asyncio.to_thread(function, *args))
    cancelled = False
    while True:
        try:
            result = await asyncio.shield(task)
            break
        except asyncio.CancelledError:
            cancelled = True
            if task.done():
                break
        except Exception:
            if cancelled:
                raise asyncio.CancelledError() from None
            raise
    if cancelled:
        # Retrieve an eventual exception without exposing provider details.
        if task.done() and not task.cancelled():
            task.exception()
        raise asyncio.CancelledError()
    return result


def http_client():
    return httpx.AsyncClient(timeout=httpx.Timeout(85, connect=10), follow_redirects=False)


async def predict_image(prompt, model):
    """One bounded real Imagen :predict call; no retry or fake fallback."""
    key = os.environ.get("GOOGLE_API_KEY")
    if not key:
        raise HTTPException(503, "Image generation is not configured")
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:predict"
    try:
        async with asyncio.timeout(90):
            async with http_client() as client:
                async with client.stream("POST", endpoint, headers={"x-goog-api-key": key}, json={
                    "instances": [{"prompt": prompt}],
                    "parameters": {"sampleCount": 1, "aspectRatio": "4:3", "personGeneration": "dont_allow"},
                }) as response:
                    if response.status_code == 429:
                        raise HTTPException(429, "The image provider is at its quota. Try again later")
                    if response.status_code in {400, 422}:
                        raise HTTPException(422, "The image provider could not generate this concept. Try a different prompt")
                    if response.status_code in {401, 403, 404}:
                        raise HTTPException(503, "Image generation is unavailable for the configured model")
                    if response.status_code != 200:
                        raise HTTPException(503, "The image provider is temporarily unavailable")
                    body = bytearray()
                    async for part in response.aiter_bytes(chunk_size=65536):
                        if len(body) + len(part) > MAX_RESPONSE_BYTES:
                            raise HTTPException(502, "The image provider returned an oversized response")
                        body.extend(part)
        payload = json.loads(body)
        if not isinstance(payload, dict):
            raise HTTPException(502, "The image provider returned an invalid response")
        predictions = payload.get("predictions")
        if not isinstance(predictions, list) or len(predictions) != 1 or not isinstance(predictions[0], dict):
            raise HTTPException(422, "The image provider could not generate this concept. Try a different prompt")
        encoded = predictions[0].get("bytesBase64Encoded")
        if not isinstance(encoded, str) or len(encoded) > 4 * ((MAX_IMAGE_BYTES + 2) // 3):
            raise HTTPException(502, "The image provider returned an invalid image")
        raw = base64.b64decode(encoded, validate=True)
        if not raw or len(raw) > MAX_IMAGE_BYTES:
            raise HTTPException(502, "The image provider returned an invalid image")
        return raw
    except HTTPException:
        raise
    except (TimeoutError, httpx.TimeoutException):
        raise HTTPException(504, "Image generation timed out. Try again later") from None
    except (httpx.HTTPError, ValueError, TypeError, binascii.Error):
        raise HTTPException(502, "The image provider returned an invalid response") from None


def normalize_image(raw):
    """Decode bounded pixels, discard metadata, and store one nonanimated PNG."""
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(502, "The image provider returned an invalid image")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as image:
                if image.format not in {"PNG", "JPEG", "WEBP"} or getattr(image, "is_animated", False):
                    raise ValueError("Unsupported image")
                if min(image.size) < 1 or max(image.size) > MAX_DIMENSION:
                    raise ValueError("Oversized image")
                image.verify()
            with Image.open(io.BytesIO(raw)) as image:
                image.load()
                width, height = image.size
                # New image drops EXIF, text chunks, profiles, and provider metadata.
                pixels = image.convert("RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB")
                clean = Image.new(pixels.mode, pixels.size)
                clean.paste(pixels)
                output = io.BytesIO()
                clean.save(output, format="PNG")
        png = output.getvalue()
        if len(png) > MAX_IMAGE_BYTES:
            raise ValueError("Oversized image")
        return png, width, height
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(502, "The image provider returned an invalid image") from None


def figure_item(row):
    result = {"id": str(row["id"]), "notebook_id": str(row["notebookId"]),
        "caption": row["caption"], "prompt": row["prompt"], "media_type": "image/png",
        "width": row["width"], "height": row["height"], "model": row["model"],
        "created_at": timestamp(row["createdAt"])}
    if row.get("source") is not None:
        result["source"] = row["source"]
    return result


async def validate_scope(db, user_id, notebook_id, source, *, lock=False):
    await own_notebook(db, user_id, notebook_id)
    if source is None:
        return None
    document_id = str(source["document_id"])
    if lock:
        await lock_document(db, document_id)
    document = await own_document(db, user_id, document_id)
    if str(document["notebookId"]) != notebook_id:
        raise HTTPException(404, "Source not found in this notebook")
    if document["deletionPending"] or document["status"] != "COMPLETED":
        raise HTTPException(409, "This source is no longer ready. Choose another source")
    page = source.get("page_number")
    if page is not None and document.get("pageCount") and page > document["pageCount"]:
        raise HTTPException(422, "The selected source page is out of range")
    # Citation labels are local to an answer. Trust excerpt context only when a
    # durable, owned citation contains that exact bounded prefix. Fresh/unknown
    # citations may still select the document, but cannot inject source text.
    provenance = {key: value for key, value in source.items() if key in {"document_id", "source_id", "page_number"}}
    provenance.update(document_id=document_id, document_name=(document.get("name") or "Document")[:200], context_type="document")
    excerpt = source.get("excerpt")
    if source.get("source_id") is not None and excerpt:
        citations = await db.query('SELECT s."pageNumber" FROM message_sources s '
            'JOIN conversation_messages m ON m.id = s."messageId" '
            'JOIN conversations c ON c.id = m."conversationId" '
            'WHERE c."userId" = %s::uuid AND c."notebookId" = %s::uuid '
            'AND s."documentId" = %s::uuid AND s."sourceId" = %s '
            'AND left(s."citationText", char_length(%s)) = %s '
            'AND (%s::integer IS NULL OR s."pageNumber" = %s::integer) LIMIT 1',
            user_id, notebook_id, document_id, str(source["source_id"]), excerpt, excerpt, page, page)
        if citations:
            provenance.update(excerpt=excerpt, context_type="saved_citation")
            if citations[0]["pageNumber"] is not None:
                provenance["page_number"] = citations[0]["pageNumber"]
    return provenance


async def reserve(db, user_id, notebook_id, prompt, source, model, figure_id):
    async with db.transaction() as tx:
        await tx.query("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", "concept-figures:" + user_id)
        provenance = await validate_scope(tx, user_id, notebook_id, source, lock=True)
        usage = (await tx.query('SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE state = \'pending\') AS pending, '
            'COALESCE(SUM(CASE WHEN size > 0 THEN size ELSE %s END), 0) AS bytes FROM concept_figures '
            'WHERE "userId" = %s::uuid', MAX_IMAGE_BYTES, user_id))[0]
        if usage["total"] >= MAX_WORKSPACE_FIGURES or usage["pending"] >= MAX_PENDING_FIGURES or usage["bytes"] + MAX_IMAGE_BYTES > MAX_WORKSPACE_BYTES:
            raise HTTPException(409, "Figure workspace limit reached. Remove figures or wait for pending cleanup before generating another")
        attempts = (await tx.query('SELECT COUNT(*) FILTER (WHERE "createdAt" > NOW() - INTERVAL \'10 minutes\') AS recent, '
            'COUNT(*) AS daily FROM concept_figure_attempts WHERE "userId" = %s::uuid '
            'AND "createdAt" > NOW() - INTERVAL \'1 day\'', user_id))[0]
        if attempts["recent"] >= MAX_REQUESTS_TEN_MINUTES or attempts["daily"] >= MAX_REQUESTS_DAY:
            raise HTTPException(429, "Figure generation limit reached. Try again later")
        await tx.execute('INSERT INTO concept_figure_attempts (id, "userId") VALUES (%s::uuid, %s::uuid)', figure_id, user_id)
        await tx.execute('INSERT INTO concept_figures (id, "userId", "notebookId", prompt, caption, model, source, '
            '"storagePath", state, "expiresAt") VALUES (%s::uuid, %s::uuid, %s::uuid, %s, %s, %s, %s, %s, '
            '\'pending\', NOW() + INTERVAL \'24 hours\')', figure_id, user_id, notebook_id, prompt, prompt, model,
            Jsonb(provenance) if provenance else None, f"{user_id}/{notebook_id}/{figure_id}.png")
    return provenance


def provider_prompt(prompt, source):
    text = "Create a clear educational concept illustration or diagram. Use simple legible labels, an uncluttered layout, and accurate relationships. Concept: " + prompt
    if source:
        text += "\nUser-selected textbook context (use only relevant concepts): " + (source.get("excerpt") or source.get("document_name") or "")
    return text


async def store_generated(db, user_id, notebook_id, figure_id, source, png, width, height):
    async with db.transaction() as tx:
        rows = await tx.query('SELECT *, "expiresAt" > NOW() AS live FROM concept_figures '
            'WHERE id = %s::uuid AND "userId" = %s::uuid AND "notebookId" = %s::uuid FOR UPDATE', figure_id, user_id, notebook_id)
        if not rows or rows[0]["state"] != "pending" or not rows[0]["live"]:
            raise HTTPException(409, "This figure request expired or was removed")
        row = rows[0]
        await validate_scope(tx, user_id, notebook_id, source, lock=True)
        storage = await settled_thread(private_storage)
        try:
            await settled_thread(storage.upload, row["storagePath"], png,
                {"content-type": "image/png", "upsert": "false", "cache-control": "0"})
        except Exception:
            raise HTTPException(503, "Could not store the generated figure. Try again later") from None
        rows = await tx.query('UPDATE concept_figures SET size = %s, digest = %s, width = %s, height = %s, '
            '"uploadedAt" = NOW() WHERE id = %s::uuid RETURNING *',
            len(png), hashlib.sha256(png).hexdigest(), width, height, figure_id)
    return figure_item(rows[0])


async def owned_figure(db, user_id, notebook_id, figure_id):
    await own_notebook(db, user_id, notebook_id)
    rows = await db.query('SELECT f.* FROM concept_figures f JOIN notebooks n ON n.id = f."notebookId" '
        'AND n."userId" = f."userId" WHERE f.id = %s::uuid AND f."userId" = %s::uuid '
        'AND f."notebookId" = %s::uuid AND f."uploadedAt" IS NOT NULL '
        'AND (f.state = \'saved\' OR (f.state = \'pending\' AND f."expiresAt" > NOW()))', figure_id, user_id, notebook_id)
    if not rows:
        raise HTTPException(404, "Figure not found")
    return rows[0]


async def list_figures(db, user_id, notebook_id):
    await own_notebook(db, user_id, notebook_id)
    rows = await db.query('SELECT * FROM concept_figures WHERE "userId" = %s::uuid AND "notebookId" = %s::uuid '
        'AND state = \'saved\' ORDER BY "createdAt" DESC, id DESC LIMIT 100', user_id, notebook_id)
    return {"figures": [figure_item(row) for row in rows]}


async def download(row):
    try:
        storage = await settled_thread(private_storage)
        data = await settled_thread(storage.download, checked_path(row))
        if len(data) != row["size"] or hashlib.sha256(data).hexdigest() != row["digest"]:
            raise ValueError("Unexpected image bytes")
        return data
    except Exception:
        raise HTTPException(503, "This figure is temporarily unavailable") from None


async def save(db, user_id, notebook_id, figure_id, caption):
    async with db.transaction() as tx:
        await own_notebook(tx, user_id, notebook_id)
        rows = await tx.query('SELECT *, "expiresAt" > NOW() AS live FROM concept_figures WHERE id = %s::uuid '
            'AND "userId" = %s::uuid AND "notebookId" = %s::uuid FOR UPDATE', figure_id, user_id, notebook_id)
        if not rows or rows[0]["uploadedAt"] is None or rows[0]["state"] == "deleting" or (rows[0]["state"] == "pending" and not rows[0]["live"]):
            raise HTTPException(404, "Figure not found")
        row = rows[0]
        # Saved snapshots remain accessible after their original source is removed.
        if row["state"] == "pending":
            await validate_scope(tx, user_id, notebook_id, row.get("source"), lock=True)
        rows = await tx.query('UPDATE concept_figures SET state = \'saved\', "expiresAt" = NULL, caption = %s '
            'WHERE id = %s::uuid RETURNING *', caption, figure_id)
    return {"figure": figure_item(rows[0])}


def checked_path(row):
    expected = f'{row["userId"]}/{row["notebookId"]}/{row["id"]}.png'
    if row["storagePath"] != expected:
        raise HTTPException(409, "Figure storage metadata requires repair")
    return expected


async def _remove_claimed(db, figure_id):
    # Keep the row lock through remove. Concurrent cleanup workers cannot delete
    # the journal while another worker is still uploading/removing its object.
    async with db.transaction() as tx:
        rows = await tx.query('SELECT * FROM concept_figures WHERE id = %s::uuid AND state = \'deleting\' FOR UPDATE', figure_id)
        if not rows:
            return True
        row = rows[0]
        path = checked_path(row)
        try:
            storage = await settled_thread(private_storage)
            await settled_thread(storage.remove, [path])
        except Exception as error:
            if str(getattr(error, "status", "")) != "404":
                return False
        await tx.execute('DELETE FROM concept_figures WHERE id = %s::uuid AND state = \'deleting\'', figure_id)
    return True


async def remove(db, user_id, notebook_id, figure_id, pending_only=False):
    async with db.transaction() as tx:
        await own_notebook(tx, user_id, notebook_id)
        rows = await tx.query('SELECT * FROM concept_figures WHERE id = %s::uuid AND "userId" = %s::uuid '
            'AND "notebookId" = %s::uuid FOR UPDATE', figure_id, user_id, notebook_id)
        if not rows:
            return
        if pending_only and rows[0]["state"] == "saved":
            return
        checked_path(rows[0])
        await tx.execute('UPDATE concept_figures SET state = \'deleting\', "expiresAt" = NOW() WHERE id = %s::uuid', figure_id)
    if not await _remove_claimed(db, figure_id):
        raise HTTPException(503, "Figure cleanup is pending. Retry removal later")


async def cleanup_expired(db):
    rows = await db.query('UPDATE concept_figures SET state = \'deleting\', "expiresAt" = NOW() WHERE id IN ('
        'SELECT id FROM concept_figures WHERE state = \'deleting\' OR (state = \'pending\' AND "expiresAt" <= NOW()) '
        'ORDER BY "createdAt" LIMIT 100 FOR UPDATE SKIP LOCKED) RETURNING id')
    removed = 0
    for row in rows:
        try:
            removed += bool(await _remove_claimed(db, str(row["id"])))
        except Exception:
            # Durable deleting metadata survives a storage or SQL failure.
            continue
    await db.execute('DELETE FROM concept_figure_attempts WHERE "createdAt" <= NOW() - INTERVAL \'1 day\'')
    return removed


def safe_error(error):
    if isinstance(error, HTTPException):
        return {"message": str(error.detail), "retryable": error.status_code in {429, 502, 503, 504}}
    return {"message": "Figure generation is temporarily unavailable. Try again later", "retryable": True}


def event(name, data):
    return f"event: {name}\ndata: {json.dumps(data, separators=(',', ':'))}\n\n"


async def generate_events(db, user_id, notebook_id, prompt, source, request):
    figure_id = str(uuid4())
    reserved = completed = False
    try:
        yield event("phase", {"phase": "analyzing"})
        model = model_name()
        reserved = True
        source = await reserve(db, user_id, notebook_id, prompt, source, model, figure_id)
        if await request.is_disconnected():
            return
        yield event("phase", {"phase": "synthesizing"})
        async with provider_limiter.reserve():
            raw = await predict_image(provider_prompt(prompt, source), model)
        if await request.is_disconnected():
            return
        yield event("phase", {"phase": "rendering"})
        png, width, height = await settled_thread(normalize_image, raw)
        figure = await store_generated(db, user_id, notebook_id, figure_id, source, png, width, height)
        if await request.is_disconnected():
            return
        completed = True
        yield event("complete", {"figure": figure})
    except asyncio.CancelledError:
        raise
    except Exception as error:
        yield event("error", safe_error(error))
    finally:
        if reserved and not completed:
            # Shield the whole cleanup, not only upload/remove. This records the
            # deleting state even when the stream's cancellation scope is active.
            task = asyncio.create_task(remove(db, user_id, notebook_id, figure_id, pending_only=True))
            while not task.done():
                try:
                    await asyncio.shield(task)
                except asyncio.CancelledError:
                    continue
                except Exception:
                    break
            if task.done() and not task.cancelled():
                task.exception()  # failures remain journalled for the sweeper

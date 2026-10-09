"""Provider token extraction and the negotiated chat SSE transport."""
import asyncio
import json
import threading
from contextlib import suppress

from fastapi import HTTPException
from fastapi.responses import StreamingResponse

HEARTBEAT_SECONDS = 10


class GenerationCancelled(Exception):
    """Cooperative cancellation at a blocking provider/retrieval boundary."""


def content_text(response):
    content = getattr(response, "content", response)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        # Reasoning/tool blocks are never answer text.
        return "".join(part.get("text", "") for part in content
                       if isinstance(part, dict) and part.get("type", "text") == "text")
    return str(content) if content is not None else ""


def model_answer(model, inputs, config=None, emit=None):
    if emit is None:
        answer = content_text(model.invoke(inputs, config=config))
        if not answer.strip():
            raise ValueError("The model returned no answer text")
        return answer
    emit("status", {"stage": "generating"})
    chunks = model.stream(inputs, config=config)
    parts = []
    try:
        for chunk in chunks:
            # An empty chunk still checks cancellation before the next read.
            delta = content_text(chunk)
            emit("token", {"delta": delta})
            parts.append(delta)
    finally:
        close = getattr(chunks, "close", None)
        if close:
            close()
    answer = "".join(parts)
    if not answer.strip():
        raise ValueError("The model returned no answer text")
    return answer


def sse_event(name, data):
    return f"event: {name}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def chat_stream(http_request, operation):
    """Run the persistent operation while flushing early status and idle bytes.

    Blocking model calls live in worker threads. Disconnect cancels the async
    persistence task and cooperatively closes provider iterators at their next
    chunk; a currently blocked SDK call remains subject to its SDK timeout.
    """
    async def events():
        queue = asyncio.Queue()
        loop = asyncio.get_running_loop()
        stopped = threading.Event()
        sent_tokens = False

        def emit(name, data):
            nonlocal sent_tokens
            if stopped.is_set():
                raise GenerationCancelled()
            if name == "token" and data.get("delta"):
                sent_tokens = True
            loop.call_soon_threadsafe(queue.put_nowait, (name, data))

        async def produce():
            try:
                result = await operation(emit)
                if stopped.is_set():
                    return
                # Cache hits, ingestion notices and idempotent replays already
                # have a completed answer. Send it once, without fake slicing.
                if not sent_tokens:
                    emit("citations", {key: result.get(key) for key in
                        ("citations", "intent", "is_grounded", "warning")})
                    emit("token", {"delta": result["answer"]})
                emit("done", result)
            except asyncio.CancelledError:
                raise
            except HTTPException as error:
                emit("error", {"message": error.detail, "status": error.status_code})
            except Exception:
                emit("error", {"message": "Could not generate an answer; retry your message", "status": 500})

        task = None
        try:
            # Flush before DB history, image observation, cold model loads or
            # retrieval. This is progress, not an invented answer token.
            yield sse_event("status", {"stage": "accepted"})
            task = asyncio.create_task(produce())
            while True:
                if await http_request.is_disconnected():
                    break
                try:
                    name, data = await asyncio.wait_for(queue.get(), HEARTBEAT_SECONDS)
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
                    continue
                yield sse_event(name, data)
                if name in ("done", "error"):
                    break
        finally:
            stopped.set()
            if task:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task

    return StreamingResponse(events(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no",
    })

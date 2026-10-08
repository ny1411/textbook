"""Browser-only synthetic provider fixture; real owned API and seekable WAV output."""
import base64
import math
import struct
from contextlib import asynccontextmanager

import httpx
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from history_fixture import build_app, database
from services import speech


def provider(request):
    # Four seconds of actual audible PCM lets browser checks observe currentTime,
    # seek into decoded audio and compare playbackRate without a fake timer.
    rate = 24000
    pcm = b"".join(struct.pack("<h", int(1600 * math.sin(2 * math.pi * 220 * index / rate)))
        for index in range(rate * 4))
    return httpx.Response(200, json={"candidates": [{"finishReason": "STOP", "content": {"parts": [{
        "inlineData": {"mimeType": "audio/L16;codec=pcm;rate=24000", "data": base64.b64encode(pcm).decode()}}]}}]})


def create_app():
    # Keep real injected credentials intact. Only transport is replaced, and it
    # cannot contact a remote destination. Production never imports this module.
    speech.http_client = lambda: httpx.AsyncClient(transport=httpx.MockTransport(provider))
    app = build_app()
    from routers.voice import router
    app.include_router(router, prefix="/api")
    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3124", "http://127.0.0.1:3124"],
        allow_methods=["*"], allow_headers=["*"])
    @asynccontextmanager
    async def lifespan(application):
        async with database() as db:
            application.state.db = db
            yield
    app.router.lifespan_context = lifespan
    return app


if __name__ == "__main__":
    uvicorn.run(create_app(), host="127.0.0.1", port=8194, log_level="warning")

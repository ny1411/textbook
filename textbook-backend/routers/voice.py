import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field, field_validator

from core.auth import AuthUser, require_user
from db.postgres import get_db
from services.chat_history import own_notebook
from services import speech

router = APIRouter()


class SpeechRequest(BaseModel):
    notebook_id: UUID
    text: str = Field(min_length=1, max_length=speech.MAX_TEXT_LENGTH)

    @field_validator("text")
    @classmethod
    def meaningful_text(cls, value):
        if not value.strip() or "\x00" in value:
            raise ValueError("Provide a nonempty passage to read aloud")
        return value


async def _while_connected(request, passage):
    stopped = asyncio.Event()
    async def disconnect():
        while not stopped.is_set():
            if await request.is_disconnected():
                return
            try:
                await asyncio.wait_for(stopped.wait(), timeout=.1)
            except TimeoutError:
                pass

    generation = asyncio.create_task(speech.synthesize(passage))
    watcher = asyncio.create_task(disconnect())
    try:
        done, _ = await asyncio.wait((generation, watcher), return_when=asyncio.FIRST_COMPLETED)
        if watcher in done:
            raise HTTPException(499, "Speech request cancelled")
        return generation.result()
    finally:
        # Starlette's disconnect poll uses an AnyIO cancellation scope, which
        # can consume a concurrent Task.cancel(). A stop event lets the watcher
        # finish reliably without preventing the generated response from returning.
        stopped.set()
        if not generation.done():
            generation.cancel()
        await asyncio.gather(generation, watcher, return_exceptions=True)


@router.post("/voice/synthesize")
async def synthesize(body: SpeechRequest, request: Request, user: AuthUser = Depends(require_user), db=Depends(get_db)):
    await own_notebook(db, user.id, str(body.notebook_id))
    async with speech.limiter.reserve(user.id):
        audio = await _while_connected(request, body.text)
    return Response(audio.data, media_type="audio/wav", headers={
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
        "Content-Disposition": 'inline; filename="speech.wav"', "X-Audio-Duration": f"{audio.duration:.3f}",
    })

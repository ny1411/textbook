import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from core.auth import AuthUser, require_user
from db.postgres import get_db
from services import podcast, speech

router = APIRouter()


class OverviewRequest(BaseModel):
    notebook_id: UUID
    document_ids: list[UUID] = Field(min_length=1, max_length=podcast.MAX_DOCUMENTS)

    @field_validator("document_ids")
    @classmethod
    def distinct_sources(cls, values):
        if len(set(values)) != len(values):
            raise ValueError("Select each source only once")
        return values


async def _while_connected(request, user_id, notebook_id, sources):
    stopped = asyncio.Event()
    async def disconnect():
        while not stopped.is_set():
            if await request.is_disconnected():
                return
            try:
                await asyncio.wait_for(stopped.wait(), timeout=.1)
            except TimeoutError:
                pass

    generation = asyncio.create_task(podcast.generate_overview(user_id, notebook_id, sources))
    watcher = asyncio.create_task(disconnect())
    try:
        done, _ = await asyncio.wait((generation, watcher), return_when=asyncio.FIRST_COMPLETED)
        if watcher in done:
            raise HTTPException(499, "Audio Overview request cancelled")
        return generation.result()
    finally:
        stopped.set()
        if not generation.done():
            generation.cancel()
        await asyncio.gather(generation, watcher, return_exceptions=True)


@router.post("/studio/audio-overview")
async def audio_overview(body: OverviewRequest, request: Request,
        user: AuthUser = Depends(require_user), db=Depends(get_db)):
    notebook_id = str(body.notebook_id)
    sources = await podcast.owned_sources(db, user.id, notebook_id, [str(value) for value in body.document_ids])
    async with speech.limiter.reserve(user.id):
        result = await _while_connected(request, user.id, notebook_id, sources)
    from fastapi.responses import JSONResponse
    return JSONResponse(result, headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})

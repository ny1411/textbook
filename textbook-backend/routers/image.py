from uuid import UUID
from typing import Union

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, StrictFloat, StrictInt, StrictStr, field_validator

from core.auth import AuthUser, require_user
from db.postgres import get_db
from services import concept_images as figures

router = APIRouter()


class FigureSource(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_id: UUID
    source_id: Union[StrictStr, StrictInt, StrictFloat, None] = None
    page_number: int | None = Field(default=None, strict=True, ge=1, le=100000)
    excerpt: str | None = Field(default=None, max_length=2400, strict=True)

    @field_validator("excerpt")
    @classmethod
    def valid_excerpt(cls, value):
        if value is not None and ("\x00" in value or not value.strip()):
            raise ValueError("Excerpt must contain source text")
        return value

    @field_validator("source_id")
    @classmethod
    def bounded_source_id(cls, value):
        import math
        if isinstance(value, str) and (not value.strip() or len(value) > 160 or "\x00" in value):
            raise ValueError("Source labels must be between 1 and 160 characters")
        if isinstance(value, int) and len(str(value)) > 160:
            raise ValueError("Source labels must be bounded numbers")
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError("Source labels must be finite numbers")
        return value


class GenerateFigure(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notebook_id: UUID
    prompt: str = Field(min_length=1, max_length=1200, strict=True)
    source: FigureSource | None = None

    @field_validator("prompt")
    @classmethod
    def nonempty_prompt(cls, value):
        value = value.strip()
        if not value or "\x00" in value:
            raise ValueError("Describe a concept to illustrate")
        return value


class SaveFigure(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notebook_id: UUID
    caption: str = Field(min_length=1, max_length=1200, strict=True)

    @field_validator("caption")
    @classmethod
    def valid_caption(cls, value):
        value = value.strip()
        if not value or "\x00" in value:
            raise ValueError("Caption must contain text")
        return value


@router.post("/image/generate")
async def generate_image(body: GenerateFigure, request: Request,
        user: AuthUser = Depends(require_user), db=Depends(get_db)):
    source = body.source.model_dump(mode="json", exclude_none=True) if body.source else None
    return StreamingResponse(figures.generate_events(db, user.id, str(body.notebook_id), body.prompt, source, request),
        media_type="text/event-stream", headers={"Cache-Control": "private, no-store, no-transform", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff"})


@router.get("/image/figures")
async def list_images(response: Response, notebook_id: UUID, user: AuthUser = Depends(require_user), db=Depends(get_db)):
    response.headers.update({"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})
    return await figures.list_figures(db, user.id, str(notebook_id))


@router.get("/image/{figure_id}")
async def image_content(figure_id: UUID, notebook_id: UUID,
        user: AuthUser = Depends(require_user), db=Depends(get_db)):
    row = await figures.owned_figure(db, user.id, str(notebook_id), str(figure_id))
    return Response(await figures.download(row), media_type="image/png",
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline"})


@router.post("/image/{figure_id}/save")
async def save_image(figure_id: UUID, body: SaveFigure, response: Response,
        user: AuthUser = Depends(require_user), db=Depends(get_db)):
    response.headers.update({"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})
    return await figures.save(db, user.id, str(body.notebook_id), str(figure_id), body.caption)


@router.delete("/image/{figure_id}", status_code=204)
async def remove_image(figure_id: UUID, notebook_id: UUID, pending_only: bool = False,
        user: AuthUser = Depends(require_user), db=Depends(get_db)):
    await figures.remove(db, user.id, str(notebook_id), str(figure_id), pending_only=pending_only)

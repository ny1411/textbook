from uuid import UUID
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from core.auth import AuthUser, require_user
from db.postgres import get_db
from services import chat_history as history

router = APIRouter()


class CreateConversation(BaseModel):
    notebook_id: UUID
    id: UUID | None = None


@router.get("/notebooks")
async def notebooks(user: AuthUser = Depends(require_user), db=Depends(get_db)):
    return await history.notebooks(db, user)


@router.get("/conversations")
async def conversations(notebook_id: UUID, limit: int = Query(50, ge=1, le=100),
        offset: int = Query(0, ge=0), user: AuthUser = Depends(require_user), db=Depends(get_db)):
    return await history.list_conversations(db, user.id, str(notebook_id), limit, offset)


@router.post("/conversations", status_code=201)
async def create_conversation(body: CreateConversation, user: AuthUser = Depends(require_user), db=Depends(get_db)):
    row = await history.create_conversation(db, user.id, str(body.notebook_id), str(body.id) if body.id else None)
    return history.thread_item(row)


@router.get("/conversations/{conversation_id}/messages")
async def messages(conversation_id: UUID, limit: int = Query(100, ge=1, le=200),
        before: int | None = Query(None, ge=0), user: AuthUser = Depends(require_user), db=Depends(get_db)):
    return await history.messages(db, user.id, str(conversation_id), limit, before)

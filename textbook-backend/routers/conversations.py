from uuid import UUID, uuid5, NAMESPACE_URL
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from core.auth import AuthenticatedUser, require_user
from db.prisma_client import get_database
from services.chat_history import owned_notebook, owned_conversation, serialize_message

router = APIRouter()


class ConversationCreate(BaseModel):
    notebook_id: UUID
    title: str | None = Field(None, min_length=1, max_length=80)


class ConversationRename(BaseModel):
    title: str = Field(..., min_length=1, max_length=80)


def thread_json(thread):
    return {"id": thread.id, "notebook_id": thread.notebookId,
            "title": thread.title or "New conversation", "title_generated": thread.titleGenerated,
            "title_is_manual": thread.titleIsManual,
            "created_at": thread.createdAt.isoformat(), "updated_at": thread.updatedAt.isoformat()}


@router.get("/notebooks/default")
async def default_notebook(user: AuthenticatedUser = Depends(require_user), db=Depends(get_database)):
    # Deterministic per-user ID makes concurrent bootstrap calls idempotent.
    notebook_id = str(uuid5(NAMESPACE_URL, f"textbook:default-notebook:{user.id}"))
    async with db.tx() as tx:
        await tx.user.upsert(where={"id": user.id}, data={
            "create": {"id": user.id, "email": user.email}, "update": {"email": user.email},
        })
        notebook = await tx.notebooks.upsert(where={"id": notebook_id}, data={
            "create": {"id": notebook_id, "userId": user.id, "name": "My notebook"}, "update": {},
        })
    return {"id": notebook.id, "name": notebook.name}


@router.get("/conversations")
async def list_conversations(notebook_id: UUID, before: UUID | None = None,
                             limit: int = Query(30, ge=1, le=100),
                             user: AuthenticatedUser = Depends(require_user), db=Depends(get_database)):
    await owned_notebook(db, str(notebook_id), user.id)
    where = {"notebookId": str(notebook_id), "userId": user.id}
    if before:
        cursor = await owned_conversation(db, str(before), user.id, str(notebook_id))
        where["OR"] = [{"updatedAt": {"lt": cursor.updatedAt}},
                       {"updatedAt": cursor.updatedAt, "id": {"lt": cursor.id}}]
    threads = await db.conversations.find_many(where=where, take=limit + 1,
                                               order=[{"updatedAt": "desc"}, {"id": "desc"}])
    return {"conversations": [thread_json(t) for t in threads[:limit]],
            "next_cursor": threads[limit - 1].id if len(threads) > limit else None}


@router.post("/conversations", status_code=201)
async def create_conversation(request: ConversationCreate,
                              user: AuthenticatedUser = Depends(require_user), db=Depends(get_database)):
    await owned_notebook(db, str(request.notebook_id), user.id)
    title = request.title.strip() if request.title else None
    if request.title is not None and not title:
        raise HTTPException(422, "A title cannot be blank.")
    thread = await db.conversations.create(data={"userId": user.id, "notebookId": str(request.notebook_id),
                                                "title": title, "titleIsManual": bool(title)})
    return thread_json(thread)


@router.patch("/conversations/{conversation_id}")
async def rename_conversation(conversation_id: UUID, request: ConversationRename,
                              user: AuthenticatedUser = Depends(require_user), db=Depends(get_database)):
    title = request.title.strip()
    if not title:
        raise HTTPException(422, "A title cannot be blank.")
    await owned_conversation(db, str(conversation_id), user.id)
    thread = await db.conversations.update(where={"id": str(conversation_id)},
                                           data={"title": title, "titleIsManual": True})
    return thread_json(thread)


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(conversation_id: UUID, user: AuthenticatedUser = Depends(require_user),
                              db=Depends(get_database)):
    await owned_conversation(db, str(conversation_id), user.id)
    # Messages and their citation snapshots cascade with an explicitly deleted thread.
    await db.conversations.delete(where={"id": str(conversation_id)})


@router.get("/conversations/{conversation_id}/messages")
async def list_messages(conversation_id: UUID, before: int | None = Query(None, ge=0),
                        limit: int = Query(50, ge=1, le=100),
                        user: AuthenticatedUser = Depends(require_user), db=Depends(get_database)):
    await owned_conversation(db, str(conversation_id), user.id)
    where = {"conversationId": str(conversation_id)}
    if before is not None:
        where["sequence"] = {"lt": before}
    messages = await db.conversationmessages.find_many(where=where, take=limit + 1,
                                                       order={"sequence": "desc"}, include={"sources": True})
    page = messages[:limit]
    return {"messages": [serialize_message(m) for m in reversed(page)],
            "next_cursor": page[-1].sequence if len(messages) > limit else None}

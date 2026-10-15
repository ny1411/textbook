import logging
from fastapi import APIRouter, Depends, Query, BackgroundTasks, HTTPException, Response
from starlette.concurrency import run_in_threadpool
from urllib.parse import quote
from services.storage import download_file_from_supabase
from pydantic import BaseModel
from uuid import UUID
from core.auth import require_user, AuthUser
from db.postgres import get_db
from services.documents import own_document, list_documents, STATUS
from services.document_deletion import delete_document
from services.sample_textbook import reserve_sample, persist_sample_ingestion

logger = logging.getLogger(__name__)

router = APIRouter()


class SampleRequest(BaseModel):
    notebook_id: UUID


@router.post("/documents/sample")
async def sample_document(request: SampleRequest, background_tasks: BackgroundTasks,
        user: AuthUser = Depends(require_user), db=Depends(get_db)):
    source, data = await reserve_sample(db, user.id, str(request.notebook_id))
    if source["status"] != "ready":
        background_tasks.add_task(persist_sample_ingestion, db, user.id, str(request.notebook_id), source["documentId"], data)
    return {"source": source}

@router.get("/documents/{document_id}/status")
async def document_status(document_id: UUID, user: AuthUser = Depends(require_user), db=Depends(get_db)):
    row = await own_document(db, user.id, str(document_id))
    return {"document_id": str(document_id), "status": "failed" if row["deletionPending"] else STATUS[row["status"]],
        "deletion_pending": row["deletionPending"]}


@router.get("/documents/{document_id}/content")
async def document_content(document_id: UUID, user: AuthUser = Depends(require_user), db=Depends(get_db)):
    row = await own_document(db, user.id, str(document_id))
    if row["deletionPending"]:
        raise HTTPException(404, "Source is being removed")
    data = await run_in_threadpool(download_file_from_supabase, "textbook-documents", row["storageUrl"])
    return Response(data, media_type="application/octet-stream", headers={
        "Content-Disposition": "attachment; filename*=UTF-8''" + quote(row["name"] or "Document", safe=""),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    })


@router.get("/documents")
async def documents(notebook_id: UUID, limit: int = Query(100, ge=1, le=200), offset: int = Query(0, ge=0),
        user: AuthUser = Depends(require_user), db=Depends(get_db)):
    return await list_documents(db, user.id, str(notebook_id), limit, offset)


@router.delete("/documents")
async def remove_document(document_id: UUID, notebook_id: UUID,
        user: AuthUser = Depends(require_user), db=Depends(get_db)):
    return await delete_document(db, user.id, str(notebook_id), str(document_id))

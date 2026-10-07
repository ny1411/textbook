from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, UploadFile, Response
from core.auth import AuthUser, require_user
from db.postgres import get_db
from services import chat_attachments as attachments

router = APIRouter()


@router.post("/chat/attachments", status_code=201)
async def upload_image(conversation_id: UUID = Form(...), upload_id: UUID = Form(...),
        file: UploadFile = File(...), user: AuthUser = Depends(require_user), db=Depends(get_db)):
    try:
        data = await file.read(attachments.MAX_IMAGE_BYTES + 1)
        return await attachments.upload(db, user.id, str(conversation_id), str(upload_id),
            file.filename, file.content_type, data)
    finally:
        await file.close()


@router.get("/chat/attachments/{attachment_id}/content")
async def image_content(attachment_id: UUID, user: AuthUser = Depends(require_user), db=Depends(get_db)):
    row = await attachments.owned_attachment(db, user.id, str(attachment_id))
    return Response(await attachments.download(row), media_type=row["mediaType"],
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
                 "Content-Disposition": "inline"})


@router.delete("/chat/attachments/{attachment_id}", status_code=204)
async def remove_image(attachment_id: UUID, user: AuthUser = Depends(require_user), db=Depends(get_db)):
    await attachments.remove_pending(db, user.id, str(attachment_id))

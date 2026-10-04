import os
import uuid
import logging
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Depends
from starlette.concurrency import run_in_threadpool
from core.auth import require_user, AuthUser, check_user_id
from db.postgres import get_db
from services.chat_history import own_notebook
from services.documents import record_upload, finish_ingestion
from services.ingestion import process_and_ingest
from services.storage import upload_file_to_supabase
from services.status import set_document_status

# setup a logger
logger = logging.getLogger(__name__)

# create a Router
router = APIRouter()

# Exact MIME types we allow
ALLOWED_CONTENT_TYPES = {
    "text/plain", 
    "text/csv", 
    "text/markdown", 
    "application/pdf", 
    "application/msword", 
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", 
}

ALLOWED_FILE_EXTENSIONS = {
    ".txt", ".csv", ".md", ".pdf",
    ".doc", ".docx", ".xlsx", ".ppt", ".pptx",
    ".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".json",
    ".c", ".cpp", ".cs", ".java", ".rs", ".go", ".swift", ".php",
}

# Prefixes for categories we allow entirely
ALLOWED_PREFIXES = ("image/", "audio/")

# define the Endpoint
@router.post("/upload")
async def upload_document(
    userId: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    notebookId: Optional[str] = None,
    user: AuthUser = Depends(require_user),
    db=Depends(get_db),
):
    """
    `file: UploadFile` tells FastAPI that we expect a file to be sent in the request.
    """

    check_user_id(userId, user)
    try:
        notebookId = str(uuid.UUID(notebookId or ""))
    except ValueError:
        raise HTTPException(422, "Choose a notebook before uploading") from None
    await own_notebook(db, user.id, notebookId)
    extension = os.path.splitext(file.filename or "")[1].lower()

    # Check if the content type starts with an allowed prefix OR is exactly in the allowed set
    is_valid_type = (
        extension in ALLOWED_FILE_EXTENSIONS or
        file.content_type in ALLOWED_CONTENT_TYPES or 
        (file.content_type or "").startswith(ALLOWED_PREFIXES)
    )
    
    if not is_valid_type:
        raise HTTPException(status_code=400, detail="Unsupported file type.")

    try:
        # read file content
        file_content = await file.read()
        if len(file_content) > 50 * 1024 * 1024:
            raise HTTPException(413, "Files must be smaller than 50 MB")
        
        # set file config
        file_name = str(uuid.uuid4()) + os.path.splitext(file.filename)[1]
        file_options = {"content-type": file.content_type}
        file_path = f"{userId}/{file_name}"
        document_id = str(uuid.uuid4())
        
        # upload file to Supabase Storage
        await run_in_threadpool(upload_file_to_supabase,
            bucket_name='textbook-documents',
            file_path=file_path, 
            file=file_content, 
            file_options=file_options
        )

        try:
            await record_upload(db, user.id, notebookId, document_id, file.filename, len(file_content), file.content_type, file_path)
        except Exception:
            from db.supabase import supabase_client
            await run_in_threadpool(supabase_client.storage.from_("textbook-documents").remove, [file_path])
            raise

        set_document_status(
            document_id=document_id,
            user_id=userId,
            status="processing",
            filename=file.filename,
        )
        
        background_tasks.add_task(
            persist_ingestion,
            db=db,
            file_bytes=file_content,
            filename=file.filename,
            content_type=file.content_type,
            user_id=userId,
            document_id=document_id,
            notebook_id=notebookId,
        )

        # return response
        return {
                "message": "File uploaded successfully",
                "filename": file.filename,
                "filepath": f"{userId}/{file_name}",
                "document_id": document_id,
                "status": "processing",
        }
        
    except HTTPException:
        raise
    except Exception:
        logger.error("Document upload or metadata persistence failed")
        raise HTTPException(status_code=500, detail=f"Could not save file")


async def persist_ingestion(db, **kwargs):
    success = await run_in_threadpool(process_and_ingest, **kwargs)
    await finish_ingestion(db, kwargs["user_id"], kwargs["document_id"], success)

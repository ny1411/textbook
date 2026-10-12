import os
import uuid
import logging
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Depends
from services.ingestion import process_and_ingest
from services.storage import upload_file_to_supabase
from services.status import set_document_status
from core.auth import require_user, AuthenticatedUser
from db.prisma_client import get_database
from services.chat_history import owned_notebook
from starlette.concurrency import run_in_threadpool

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


async def ingest_uploaded_document(**kwargs):
    success = await run_in_threadpool(process_and_ingest, **kwargs)
    db = await get_database()
    await db.uploadeddocuments.update_many(where={"id": kwargs["document_id"], "userId": kwargs["user_id"]},
                                           data={"status": "COMPLETED" if success else "FAILED"})

# define the Endpoint
@router.post("/upload")
async def upload_document(
    userId: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    notebookId: Optional[str] = None,
    user: AuthenticatedUser = Depends(require_user),
    db=Depends(get_database),
):
    """
    `file: UploadFile` tells FastAPI that we expect a file to be sent in the request.
    """

    userId = user.id
    if not notebookId:
        raise HTTPException(422, "A notebook is required for uploads.")
    try:
        notebookId = str(uuid.UUID(notebookId))
    except ValueError:
        raise HTTPException(422, "Notebook ID must be a UUID.")
    await owned_notebook(db, notebookId, userId)
    extension = os.path.splitext(file.filename or "")[1].lower()

    # Check if the content type starts with an allowed prefix OR is exactly in the allowed set
    is_valid_type = (
        extension in ALLOWED_FILE_EXTENSIONS or
        file.content_type in ALLOWED_CONTENT_TYPES or 
        (file.content_type or "").startswith(ALLOWED_PREFIXES)
    )
    
    if not is_valid_type:
        raise HTTPException(status_code=400, detail="Unsupported file type.")

    document_id = str(uuid.uuid4())
    metadata_created = False
    try:
        # read file content
        file_content = await file.read()
        
        # set file config
        file_name = str(uuid.uuid4()) + os.path.splitext(file.filename)[1]
        file_options = {"content-type": file.content_type}
        file_path = f"{userId}/{file_name}"
        await db.uploadeddocuments.create(data={
            "id": document_id, "userId": userId, "notebookId": notebookId,
            "name": file.filename, "fileType": file.content_type, "fileSize": str(len(file_content)),
            "storageUrl": file_path, "status": "PROCESSING",
        })
        metadata_created = True
        
        # upload file to Supabase Storage
        upload_file_to_supabase(
            bucket_name='textbook-documents',
            file_path=file_path, 
            file=file_content, 
            file_options=file_options
        )

        set_document_status(
            document_id=document_id,
            user_id=userId,
            status="processing",
            filename=file.filename,
        )
        
        background_tasks.add_task(
            ingest_uploaded_document,
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
        
    except Exception as e:
        if metadata_created:
            await db.uploadeddocuments.update(where={"id": document_id}, data={"status": "FAILED"})
        logger.error(f"Supabase upload error for user {userId}: {str(e)}")
        set_document_status(
            document_id=document_id,
            user_id=userId,
            status="failed",
            error=str(e),
        )
        raise HTTPException(status_code=500, detail=f"Could not save file")

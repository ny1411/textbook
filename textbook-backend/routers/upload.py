from fastapi import APIRouter, UploadFile, File, HTTPException
import os
import uuid
from supabase import Client, create_client
from dotenv import load_dotenv
import logging

# setup a logger
logger = logging.getLogger(__name__)

# create a Router
router = APIRouter()

# load .env
load_dotenv()
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_SECRET_KEY")

if not url or not key:
    raise ValueError("Missing supabase credentials in .env")

# create client
supabase: Client = create_client(url, key)

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

# Prefixes for categories we allow entirely
ALLOWED_PREFIXES = ("image/", "audio/")

# define the Endpoint
@router.post("/upload")
async def upload_document(userId: str, file: UploadFile = File(...)):
    """
    `file: UploadFile` tells FastAPI that we expect a file to be sent in the request.
    """
    # Check if the content type starts with an allowed prefix OR is exactly in the allowed set
    is_valid_type = (
        file.content_type in ALLOWED_CONTENT_TYPES or 
        file.content_type.startswith(ALLOWED_PREFIXES)
    )
    
    if not is_valid_type:
        raise HTTPException(status_code=400, detail="Unsupported file type.")

    try:
        # read file content
        file_content = await file.read()
        
        # set file config
        file_name = str(uuid.uuid4()) + os.path.splitext(file.filename)[1]
        file_options = {"content-type": file.content_type}
        
        # upload file to Supabase Storage
        supabase.storage.from_('textbook-documents').upload(
            path=f'{userId}/{file_name}', 
            file=file_content, 
            file_options=file_options
        )
        
        # return response
        return {
                "message": "File uploaded successfully",
                "filename": file.filename,
                "filepath": f"{userId}/{file_name}"
        }
        
    except Exception as e:
        logger.error(f"Supabase upload error for user {userId}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Could not save file")
    
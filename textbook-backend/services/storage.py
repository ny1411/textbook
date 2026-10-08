import logging
from fastapi import HTTPException
from db.supabase import supabase_client

# setup a logger
logger = logging.getLogger(__name__)


def delete_file_from_supabase(bucket_name: str, file_path: str):
    """Storage remove is idempotent; an already missing object is also success."""
    try:
        return supabase_client.storage.from_(bucket_name).remove([file_path])
    except Exception as exc:
        if str(getattr(exc, "status", "")) == "404":
            return
        logger.warning("Supabase document removal failed")
        raise HTTPException(503, "Could not remove source bytes") from None

"""
Example parameters:
bucket_name='textbook-documents'
file_path='sample.pdf'
"""

# upload file to supabase bucket
def upload_file_to_supabase(bucket_name: str, file: bytes, file_path: str, file_options: dict):
    try:
        response = supabase_client.storage.from_(bucket_name).upload(
            file_path, 
            file,
            file_options
        )
        return response
    except Exception as e:
        logger.error(f"Supabase upload error for path {file_path}: {str(e)}")
        raise HTTPException(status_code=500, detail="Could not save file")

# import file from supabase bucket
def download_file_from_supabase(bucket_name: str, file_path: str):
    try:
        file_bytes = supabase_client.storage.from_(bucket_name).download(file_path)
        return file_bytes
    except Exception as e:
        logger.error(f"Supabase download error for path {file_path}: {str(e)}")
        raise HTTPException(status_code=500, detail="Could not download file")

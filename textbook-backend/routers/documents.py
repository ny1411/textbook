import logging
from fastapi import APIRouter
from services.status import get_document_status

logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/documents/{document_id}/status")
async def document_status(document_id: str):
    status_data = get_document_status(document_id)
    
    if not status_data:
        return {"document_id": document_id, "status": "not_found"}

    return status_data
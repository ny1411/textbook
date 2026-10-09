from fastapi import APIRouter
from .voice import router as voice_router
from .studio import router as studio_router
from .upload import router as upload_router
from .search import router as search_router
from .chat import router as chat_router
from .documents import router as document_router
from .conversations import router as conversation_router
from .chat_attachments import router as attachment_router
from .image import router as image_router

# create a new router
api_router = APIRouter()

# include all routers
api_router.include_router(voice_router)
api_router.include_router(studio_router)
api_router.include_router(upload_router)
api_router.include_router(search_router)
api_router.include_router(chat_router)
api_router.include_router(document_router)
api_router.include_router(conversation_router)
api_router.include_router(attachment_router)
api_router.include_router(image_router)

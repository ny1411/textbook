from fastapi import APIRouter
from .upload import router as upload_router
from .search import router as search_router

# create a new router
api_router = APIRouter()

# include all routers
api_router.include_router(upload_router)
api_router.include_router(search_router)
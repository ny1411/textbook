from fastapi import FastAPI
from routers.upload import router as upload_router

app = FastAPI()

# connects the endpoints defined in routers/
app.include_router(upload_router, tags=["Documents"])
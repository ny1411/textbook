from fastapi import FastAPI
from routers import api_router
import logging

app = FastAPI()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

# connects the endpoints defined in routers/
app.include_router(api_router, prefix="/api")
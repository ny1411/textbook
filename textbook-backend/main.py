from fastapi import FastAPI
from routers import api_router
from contextlib import asynccontextmanager
import logging
from services.indexing import init_connection

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_connection()
    logger.info("Qdrant collection and payload indexes are ready.")
    yield

app = FastAPI(lifespan=lifespan)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

# connects the endpoints defined in routers/
app.include_router(api_router, prefix="/api")

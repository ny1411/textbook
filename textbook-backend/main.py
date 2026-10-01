from fastapi import FastAPI, HTTPException
from routers import api_router
from contextlib import asynccontextmanager
import logging
from services.indexing import init_connection

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.ready = False
    init_connection()
    logger.info("Qdrant collection and payload indexes are ready.")
    app.state.ready = True
    try:
        yield
    finally:
        app.state.ready = False

app = FastAPI(lifespan=lifespan)
app.state.ready = False

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

# connects the endpoints defined in routers/
app.include_router(api_router, prefix="/api")


@app.get("/healthz", include_in_schema=False)
async def healthcheck():
    """Report completion of startup, without making external calls per probe."""
    if not app.state.ready:
        raise HTTPException(status_code=503, detail="Backend is not ready")
    return {"status": "ready"}

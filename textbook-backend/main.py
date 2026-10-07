from fastapi import FastAPI, HTTPException
from routers import api_router
from contextlib import asynccontextmanager
import logging
import asyncio
from contextlib import suppress
from services.indexing import init_connection
from db.postgres import disconnect_db
from psycopg import Error as DatabaseError
from fastapi.responses import JSONResponse
from db.postgres import get_db
from services.chat_attachments import cleanup_expired

logger = logging.getLogger(__name__)


async def image_cleanup_loop():
    while True:
        try:
            await cleanup_expired(await get_db())
        except Exception:
            logger.warning("Abandoned image cleanup will retry")
        await asyncio.sleep(300)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.ready = False
    init_connection()
    logger.info("Qdrant collection and payload indexes are ready.")
    app.state.ready = True
    image_cleanup = asyncio.create_task(image_cleanup_loop())
    try:
        yield
    finally:
        app.state.ready = False
        image_cleanup.cancel()
        with suppress(asyncio.CancelledError):
            await image_cleanup
        await disconnect_db()

app = FastAPI(lifespan=lifespan)
app.state.ready = False


@app.exception_handler(DatabaseError)
async def database_unavailable(request, error):
    # Missing migrations/connectivity must never leak SQL or connection secrets.
    return JSONResponse(status_code=503, content={"detail": "Saved conversations are temporarily unavailable"})

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

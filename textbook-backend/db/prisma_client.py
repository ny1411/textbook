"""One async Prisma connection per application process."""
from prisma import Prisma
from prisma.errors import TableNotFoundError, FieldNotFoundError
import asyncio
import logging
import os
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()
logger = logging.getLogger(__name__)


def runtime_database_url(url):
    """Supabase transaction pooling requires Prisma to disable prepared statement reuse."""
    parsed = urlsplit(url)
    if (parsed.hostname or "").endswith(".pooler.supabase.com") and parsed.port == 6543:
        parameters = dict(parse_qsl(parsed.query, keep_blank_values=True))
        parameters["pgbouncer"] = "true"
        return urlunsplit(parsed._replace(query=urlencode(parameters)))
    return url


database_url = os.getenv("DATABASE_URL")
database = Prisma(datasource={"url": runtime_database_url(database_url)}) if database_url else Prisma()
connection_lock = asyncio.Lock()


async def get_database():
    # Hold the lock until schema validation finishes, including for concurrent bootstrap calls.
    async with connection_lock:
        if not database.is_connected():
            try:
                await database.connect()
                await database.conversations.find_first()
            except (TableNotFoundError, FieldNotFoundError):
                if database.is_connected():
                    await database.disconnect()
                logger.error("Conversation schema is missing or outdated. Apply Prisma migrations using a direct or session-pooler connection.")
                raise HTTPException(503, "Conversation storage is unavailable. You can keep drafting and retry loading history shortly.")
            except Exception:
                if database.is_connected():
                    await database.disconnect()
                raise HTTPException(503, "Conversation storage is unavailable. Please try again shortly.")
    return database

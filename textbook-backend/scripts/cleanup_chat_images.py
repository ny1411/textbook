"""Run one bounded abandoned-image cleanup pass using configured backend credentials."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from db.postgres import get_db, disconnect_db
from services.chat_attachments import cleanup_expired


async def main():
    try:
        count = await cleanup_expired(await get_db())
        print(f"Removed {count} abandoned image uploads")
    finally:
        await disconnect_db()


if __name__ == "__main__":
    asyncio.run(main())

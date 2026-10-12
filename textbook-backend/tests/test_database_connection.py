import asyncio
from types import SimpleNamespace
from urllib.parse import urlsplit, parse_qs

import pytest
from fastapi import HTTPException
from prisma.errors import TableNotFoundError
from db import prisma_client


def test_supabase_transaction_pooler_keeps_credentials_and_disables_statement_reuse():
    original = "postgresql://postgres.project:encoded%40password@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require&connection_limit=5"
    converted = prisma_client.runtime_database_url(original)
    assert urlsplit(converted).netloc == urlsplit(original).netloc
    assert parse_qs(urlsplit(converted).query) == {
        "sslmode": ["require"], "connection_limit": ["5"], "pgbouncer": ["true"],
    }
    session = original.replace(":6543/", ":5432/")
    assert prisma_client.runtime_database_url(session) == session
    direct = "postgresql://postgres:password@db.project.supabase.co:5432/postgres"
    assert prisma_client.runtime_database_url(direct) == direct


def test_missing_schema_disconnects_and_allows_later_retry(monkeypatch):
    async def scenario():
        class Database:
            connected = False
            ready = False
            checks = 0
            def is_connected(self): return self.connected
            async def connect(self): self.connected = True
            async def disconnect(self): self.connected = False
            async def find_first(self):
                self.checks += 1
                if not self.ready:
                    raise TableNotFoundError({"user_facing_error": {"meta": {"table": "public.conversations"}}})
                return None
        db = Database()
        db.conversations = SimpleNamespace(find_first=db.find_first)
        monkeypatch.setattr(prisma_client, "database", db)
        monkeypatch.setattr(prisma_client, "connection_lock", asyncio.Lock())
        with pytest.raises(HTTPException) as failure:
            await prisma_client.get_database()
        assert failure.value.status_code == 503 and "keep drafting" in failure.value.detail
        assert not db.connected
        db.ready = True
        assert await prisma_client.get_database() is db
        assert await prisma_client.get_database() is db
        assert db.checks == 2
    asyncio.run(scenario())


def test_concurrent_bootstrap_waits_for_schema_validation(monkeypatch):
    async def scenario():
        started, release = asyncio.Event(), asyncio.Event()
        class Database:
            connected = False
            checks = 0
            def is_connected(self): return self.connected
            async def connect(self): self.connected = True
            async def find_first(self):
                self.checks += 1
                started.set()
                await release.wait()
        db = Database()
        db.conversations = SimpleNamespace(find_first=db.find_first)
        monkeypatch.setattr(prisma_client, "database", db)
        monkeypatch.setattr(prisma_client, "connection_lock", asyncio.Lock())
        first = asyncio.create_task(prisma_client.get_database())
        await started.wait()
        second = asyncio.create_task(prisma_client.get_database())
        await asyncio.sleep(0)
        assert not second.done()
        release.set()
        assert await asyncio.gather(first, second) == [db, db]
        assert db.checks == 1
    asyncio.run(scenario())

"""Bound SQL against the existing Prisma-defined tables, with a bounded async pool."""
import asyncio
import logging
import os
import ssl
from contextlib import asynccontextmanager
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

from fastapi import HTTPException
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

_pool = None
_pool_schema = "public"
_lock = asyncio.Lock()


def connection_url(value: str) -> str:
    parts = urlsplit(value)
    options = parse_qs(parts.query, keep_blank_values=True)
    if parts.scheme not in {"postgres", "postgresql"} or not parts.hostname:
        raise ValueError("PostgreSQL configuration is missing")
    if options.get("sslmode") not in (["require"], ["verify-full"]):
        raise ValueError("PostgreSQL requires strict TLS")
    if options.get("sslaccept", ["strict"]) != ["strict"]:
        raise ValueError("PostgreSQL requires certificate verification")
    # sslaccept is a Prisma connector option; libpq's equivalent verifies both
    # the CA and hostname. Never downgrade the supplied connection's TLS.
    options.pop("sslaccept", None)
    for option in ("schema", "pgbouncer", "connection_limit", "pool_timeout"):
        if option in options and len(options[option]) != 1:
            raise ValueError("Ambiguous PostgreSQL configuration")
        options.pop(option, None)
    options["sslmode"] = ["verify-full"]
    return urlunsplit(parts._replace(query=urlencode(options, doseq=True)))


class Session:
    def __init__(self, connection):
        self.connection = connection

    async def query(self, sql, *params):
        async with self.connection.cursor(row_factory=dict_row) as cursor:
            await cursor.execute(sql, params)
            return await cursor.fetchall()

    async def execute(self, sql, *params):
        async with self.connection.cursor() as cursor:
            await cursor.execute(sql, params)
            return cursor.rowcount

    @asynccontextmanager
    async def transaction(self):
        async with self.connection.transaction():
            yield self


class Database:
    def __init__(self, pool, schema="public"):
        self.pool = pool
        self.schema = schema

    @asynccontextmanager
    async def transaction(self):
        async with self.pool.connection() as connection:
            async with connection.transaction():
                # Transaction poolers can assign a different server connection
                # on every BEGIN. Apply these settings inside each transaction.
                await connection.execute("SET LOCAL TIME ZONE 'UTC'")
                await connection.execute("SELECT set_config('search_path', quote_ident(%s) || ', pg_catalog', true)", [self.schema])
                yield Session(connection)

    async def query(self, sql, *params):
        async with self.transaction() as session:
            return await session.query(sql, *params)

    async def execute(self, sql, *params):
        async with self.transaction() as session:
            return await session.execute(sql, *params)


async def get_db():
    global _pool, _pool_schema
    async with _lock:
        if _pool is None:
            try:
                url = connection_url(os.environ.get("DATABASE_URL", ""))
                schema = parse_qs(urlsplit(os.environ["DATABASE_URL"]).query).get("schema", ["public"])[0]
                ca_file = os.environ.get("PGSSLROOTCERT") or ssl.get_default_verify_paths().cafile
                if not ca_file:
                    raise ValueError("PostgreSQL CA trust is missing")
                # Pool warnings can include connection details. API failures are
                # reported generically; deployment diagnostics live separately.
                logging.getLogger("psycopg.pool").setLevel(logging.CRITICAL)
                pool = AsyncConnectionPool(url, min_size=1, max_size=4, open=False,
                    timeout=8,
                    kwargs={"sslrootcert": ca_file, "connect_timeout": 8, "prepare_threshold": None})
                try:
                    await pool.open()
                    await pool.wait(timeout=8)
                except Exception:
                    await pool.close()
                    raise
                _pool = pool
                _pool_schema = schema
            except Exception:
                raise HTTPException(503, "Saved conversations are temporarily unavailable") from None
    return Database(_pool, _pool_schema)


async def disconnect_db():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None

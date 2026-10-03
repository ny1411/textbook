"""Read-only production Supabase checks; never print credentials or row data."""

import argparse
import asyncio
import json
import logging
import os
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Mapping
from urllib.parse import parse_qs, urlsplit


# Include both mapped and unmapped Prisma table names. Selecting zero rows checks
# table/column availability without downloading users or document metadata. REST
# access is diagnostic: backend-only tables may deliberately be unexposed.
TABLE_COLUMNS = {
    "users": "id,email",
    "notebooks": "id,userId",
    "uploaded_documents": "id,userId,notebookId,storageUrl,status",
    "conversations": "id,userId,notebookId",
    "conversation_documents": "conversationId,documentId",
    "conversation_messages": "id,conversationId,role,message",
    "message_sources": "messageId,documentId",
    "generated_artifacts": "id,userId,notebookId,conversationId",
    "UserMemory": "id,userId",
    "UserPreferences": "id,userId",
}


@dataclass(frozen=True)
class Check:
    name: str
    status: str
    detail: str
    required: bool = True


def check_configuration(env: Mapping[str, str]) -> list[Check]:
    checks = []
    try:
        url = urlsplit(env.get("SUPABASE_URL", ""))
        valid_url = (
            url.scheme == "https"
            and bool(url.hostname)
            and not url.username
            and not url.password
            and url.port != 0
            and url.path in ("", "/")
            and not url.query
            and not url.fragment
        )
    except ValueError:
        valid_url = False
    checks.append(Check(
        "SUPABASE_URL", "pass" if valid_url else "fail",
        "HTTPS project URL configured" if valid_url else "Set a valid HTTPS project URL without credentials, query, or path",
    ))
    has_key = bool(env.get("SUPABASE_SECRET_KEY", "").strip())
    checks.append(Check(
        "SUPABASE_SECRET_KEY", "pass" if has_key else "fail",
        "Server credential present; authorization must be checked remotely" if has_key else "Set the backend-only Supabase secret/service-role key",
    ))
    try:
        database = urlsplit(env.get("DATABASE_URL", ""))
        valid_database = (
            database.scheme in ("postgres", "postgresql")
            and bool(database.hostname)
            and bool(database.path.strip("/"))
            and database.port != 0
        )
        parameters = parse_qs(database.query, keep_blank_values=True)
        # Prisma uses sslmode=require plus sslaccept=strict, rather than libpq's
        # verify-full spelling. Reject duplicate or permissive TLS parameters.
        valid_tls = (
            parameters.get("sslmode") == ["require"]
            and parameters.get("sslaccept") == ["strict"]
        )
    except ValueError:
        valid_database = valid_tls = False
    checks.append(Check(
        "DATABASE_URL", "pass" if valid_database else "fail",
        "PostgreSQL connection URL configured" if valid_database else "Set a valid PostgreSQL URL including database name",
    ))
    checks.append(Check(
        "database_tls_configuration", "pass" if valid_database and valid_tls else "fail",
        "Prisma TLS and certificate verification required" if valid_database and valid_tls else "Require sslmode=require and sslaccept=strict in DATABASE_URL",
    ))
    return checks


def safe_failure(exc: Exception) -> str:
    """Provider exceptions may contain credentials, request URLs, or row data."""
    code = str(getattr(exc, "code", ""))
    if re.fullmatch(r"(?:[0-9]{3}|PGRST[0-9]{3}|[0-9A-Z]{5})", code):
        return f"Read-only request failed (provider code {code}); inspect project status, credentials, and schema privately"
    return "Read-only request failed; inspect network access, project status, credentials, and schema privately"


def check_rest_tables(client) -> list[Check]:
    checks = []
    for table, columns in TABLE_COLUMNS.items():
        try:
            client.table(table).select(columns).limit(0).execute()
        except Exception as exc:
            checks.append(Check(f"rest:{table}", "fail", safe_failure(exc), required=False))
        else:
            checks.append(Check(f"rest:{table}", "pass", "Table and required columns reachable with a zero-row request", required=False))
    return checks


async def check_database(database_url: str, *, client_factory=None) -> list[Check]:
    """Explicit opt-in for environments authorized to reach PostgreSQL over TCP."""
    try:
        if client_factory is None:
            from prisma import Prisma
            client_factory = Prisma
        database = client_factory(use_dotenv=False, datasource={"url": database_url}, connect_timeout=10)
    except (ImportError, RuntimeError):
        return [Check("database_connection", "blocked", "Install existing backend dependencies and run prisma generate first")]
    except Exception as exc:
        return [Check("database_connection", "fail", safe_failure(exc))]
    checks = []
    try:
        await database.connect()
        checks.append(Check("database_connection", "pass", "Prisma connected to configured PostgreSQL database"))
        rows = await database.query_raw("SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()")
        tls_enabled = len(rows) == 1 and rows[0].get("ssl") is True
        checks.append(Check("database_tls_live", "pass" if tls_enabled else "fail", "PostgreSQL reports TLS" if tls_enabled else "Could not confirm TLS on this connection"))
        for table, columns in TABLE_COLUMNS.items():
            # Identifiers come only from the constant above, never user input.
            selection = ", ".join(f'"{column}"' for column in columns.split(","))
            try:
                await database.query_raw(f'SELECT {selection} FROM "{table}" WHERE FALSE')
            except Exception as exc:
                checks.append(Check(f"database:{table}", "fail", safe_failure(exc)))
            else:
                checks.append(Check(f"database:{table}", "pass", "Table and required columns exist; no rows read"))
    except Exception as exc:
        name = "database_verification" if checks else "database_connection"
        checks.append(Check(name, "fail", safe_failure(exc)))
    finally:
        try:
            if database.is_connected():
                await database.disconnect()
        except Exception:
            checks.append(Check("database_disconnect", "fail", "Could not confirm database disconnect"))
    return checks


def run_checks(env: Mapping[str, str], *, database: bool = False, client_factory=None) -> list[Check]:
    checks = check_configuration(env)
    if all(check.status == "pass" for check in checks[:2]):
        try:
            if client_factory is None:
                from supabase import ClientOptions, create_client
                client_factory = lambda url, key: create_client(url, key, options=ClientOptions(
                    auto_refresh_token=False, persist_session=False, postgrest_client_timeout=10,
                ))
            client = client_factory(env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"])
            checks.extend(check_rest_tables(client))
        except Exception as exc:
            checks.append(Check("supabase_client", "fail", safe_failure(exc)))
    else:
        checks.append(Check("rest_schema", "blocked", "Correct the HTTPS project URL and server credential first", required=False))
    if database and all(check.status == "pass" for check in checks[2:4]):
        checks.extend(asyncio.run(check_database(env["DATABASE_URL"])))
    else:
        checks.append(Check("database_connection", "blocked", "TCP verification requires valid TLS configuration, generated Prisma client, and explicit --database in an authorized environment"))
    return checks


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", action="store_true", help="Also run SELECT-only Prisma checks; requires authorized PostgreSQL TCP access")
    args = parser.parse_args(argv)
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
    # SDK/engine error logging can include connection URLs. Emit only our report.
    previous_logging_level = logging.root.manager.disable
    logging.disable(logging.CRITICAL)
    try:
        checks = run_checks(os.environ, database=args.database)
    finally:
        logging.disable(previous_logging_level)
    verified = all(check.status == "pass" for check in checks if check.required)
    print(json.dumps({"verified": verified, "checks": [asdict(check) for check in checks]}, indent=2))
    return 0 if verified else 1


if __name__ == "__main__":
    raise SystemExit(main())

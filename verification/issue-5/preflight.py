"""Read-only workflow prerequisites. Never print credentials or provider bodies."""
import importlib.util
import json
import os
from pathlib import Path
import urllib.error
import urllib.request
from urllib.parse import urlsplit


def probe(name, url, headers):
    try:
        parts = urlsplit(url)
        if parts.scheme not in {"http", "https"} or not parts.hostname or parts.username or parts.password:
            return {"check": name, "status": "blocked", "detail": "Service URL missing or invalid"}
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=15) as response:
            code = response.status
    except urllib.error.HTTPError as error:
        code = error.code
    except Exception:
        return {"check": name, "status": "fail", "detail": "Request failed; inspect network and service configuration privately"}
    return {"check": name, "status": "pass" if code == 200 else "fail",
            "detail": f"HTTP {code}; reachability only, not a pipeline acceptance result"}


def main():
    checks = []
    for module in ("fastapi", "psycopg", "qdrant_client", "sentence_transformers", "fastembed", "langchain_google_genai", "supabase"):
        present = importlib.util.find_spec(module) is not None
        checks.append({"check": f"dependency:{module}", "status": "pass" if present else "blocked",
                       "detail": "Installed" if present else "Install textbook-backend/requirements.txt in the backend runtime"})
    try:
        policy = json.loads(Path("/etc/codex/network-policy.json").read_text())
        grants = policy.get("tcp_network_access", {})
        configured = bool(grants.get("domains") or grants.get("ip_ranges"))
        database_host = urlsplit(os.environ.get("DATABASE_URL", "")).hostname
        local_database = database_host in {"localhost", "127.0.0.1", "::1"}
        blocked_database = bool(database_host and not local_database and not configured)
        checks.append({"check": "postgresql-network", "status": "blocked" if blocked_database else "unverified",
                       "detail": "No TCP access grants for configured remote PostgreSQL; connectivity cannot be verified in this managed environment" if blocked_database else "Local database or TCP grants may be available; database connectivity still requires a live check"})
        rules = policy.get("http_network_policy", {})
        allowed = {rule.get("host") for rule in rules.get("egress_rules", [])}
        hub_allowed = rules.get("type") != "restricted" or "huggingface.co" in allowed
        checks.append({"check": "model-download-policy", "status": "unverified",
                       "detail": "Verify both model loading and artifact download hosts" if hub_allowed else "HuggingFace download host excluded; verify preloaded model loading or configure approved download access for BAAI/bge-large-en-v1.5 and BAAI/bge-reranker-base"})
    except Exception:
        checks.append({"check": "managed-network-policy", "status": "unverified", "detail": "Policy snapshot unavailable; inspect environment access configuration"})
    state = os.environ.get("E2E_STORAGE_STATE")
    has_state = bool(state and Path(state).is_file())
    checks.append({"check": "authenticated-browser-fixture", "status": "unverified" if has_state else "blocked",
                   "detail": "State file exists; the browser run must verify session validity" if has_state else "Set E2E_STORAGE_STATE to a private Playwright state file from a real signed-in test account"})
    checks.append({"check": "owned-test-notebook", "status": "unverified" if os.environ.get("E2E_NOTEBOOK_ID") else "blocked",
                   "detail": "The browser run must verify notebook ownership" if os.environ.get("E2E_NOTEBOOK_ID") else "Set E2E_NOTEBOOK_ID to a dedicated notebook owned by the test account"})
    services = [
        ("qdrant-http", os.environ.get("QDRANT_URL", "").rstrip("/") + "/collections", {"api-key": os.environ.get("QDRANT_API_KEY", "")}),
        ("supabase-auth-http", os.environ.get("SUPABASE_URL", "").rstrip("/") + "/auth/v1/settings", {"apikey": os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")}),
        ("supabase-storage-http", os.environ.get("SUPABASE_URL", "").rstrip("/") + "/storage/v1/bucket", {"apikey": os.environ.get("SUPABASE_SECRET_KEY", ""), "Authorization": "Bearer " + os.environ.get("SUPABASE_SECRET_KEY", "")}),
    ]
    for name, url, headers in services:
        checks.append(probe(name, url, headers))
    checks.append({"check": "live-roundtrip", "status": "unverified", "detail": "Run roundtrip.cjs; preflight never marks issue #5 complete"})
    print(json.dumps({"checks": checks, "live_roundtrip": False}, indent=2))
    return int(any(check["status"] in {"blocked", "fail"} for check in checks))


if __name__ == "__main__":
    raise SystemExit(main())

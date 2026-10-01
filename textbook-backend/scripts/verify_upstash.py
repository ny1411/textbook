"""Verify the configured Upstash cache using one disposable, randomly scoped key."""

import logging
import os
from pathlib import Path
import sys
from urllib.parse import urlsplit
from uuid import uuid4

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
SMOKE_TTL_SECONDS = 60


class SmokeCheckError(RuntimeError):
    """A safe-to-print smoke verification failure."""


def validate_configuration(environ):
    """Require a private token and the provider's HTTPS REST endpoint."""
    url = environ.get("UPSTASH_REDIS_REST_URL", "")
    token = environ.get("UPSTASH_REDIS_REST_TOKEN", "")
    if not url.strip() or not token.strip():
        raise SmokeCheckError(
            "Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in the backend runtime."
        )
    try:
        endpoint = urlsplit(url)
        valid = (
            endpoint.scheme == "https"
            and (endpoint.hostname or "").endswith(".upstash.io")
            and endpoint.port in (None, 443)
            and endpoint.username is None
            and endpoint.password is None
            and endpoint.path in ("", "/")
            and not endpoint.query
            and not endpoint.fragment
        )
    except ValueError:
        valid = False
    if not valid:
        raise SmokeCheckError("Use the HTTPS Upstash Redis REST endpoint from the console.")


def run_smoke_check(cache_service):
    """Exercise the application's cache functions without touching existing users."""
    client = cache_service.redis
    if client is None:
        raise SmokeCheckError("The backend cache client is not configured.")

    nonce = uuid4().hex
    scope = {
        "user_id": f"upstash-smoke-{nonce}",
        "query": "Upstash production cache smoke verification",
        "notebook_id": f"smoke-notebook-{nonce}",
        "document_ids": [f"smoke-document-{nonce}"],
    }
    key = cache_service._make_key(**scope)
    payload = {
        "answer": "Production cache verification",
        "is_grounded": True,
        "confidence_score": 0.9,
        "citations": [],
        "smoke_id": nonce,
    }
    stage = "cache miss"
    owns_key = False
    # SDK exception text can contain endpoint or authorization details.
    cache_logger = logging.getLogger(cache_service.__name__)
    previous_disabled = cache_logger.disabled
    cache_logger.disabled = True
    try:
        try:
            if client.exists(key):
                raise SmokeCheckError("The random smoke key already exists; retry the check.")
            owns_key = True
            if cache_service.get_cached_response(**scope) is not None:
                raise SmokeCheckError("The initial cache miss check failed.")

            stage = "cache write/read"
            cache_service.set_cached_response(
                **scope, response=payload, ttl_seconds=SMOKE_TTL_SECONDS
            )
            if cache_service.get_cached_response(**scope) != payload:
                raise SmokeCheckError("The application cache write/read check failed.")

            stage = "TTL"
            ttl = client.ttl(key)
            if not isinstance(ttl, int) or not 0 < ttl <= SMOKE_TTL_SECONDS:
                raise SmokeCheckError("The application cache did not receive a bounded TTL.")

            stage = "scope isolation"
            isolated_scopes = [
                {**scope, "user_id": f"upstash-smoke-other-{nonce}"},
                {**scope, "document_ids": []},
            ]
            for isolated_scope in isolated_scopes:
                if cache_service.get_cached_response(**isolated_scope) is not None:
                    raise SmokeCheckError("The application cache scope isolation check failed.")
        except SmokeCheckError:
            raise
        except Exception:
            raise SmokeCheckError(f"Upstash verification failed during {stage}.") from None
        finally:
            if owns_key:
                try:
                    client.delete(key)
                    if client.exists(key):
                        raise RuntimeError("Cleanup did not remove the temporary key")
                except Exception:
                    raise SmokeCheckError(
                        "Temporary smoke-key cleanup failed; check backend connectivity and permissions."
                    ) from None
    finally:
        cache_logger.disabled = previous_disabled


def main():
    load_dotenv(BACKEND_ROOT / ".env")
    try:
        validate_configuration(os.environ)
        from services import caching

        run_smoke_check(caching)
    except SmokeCheckError as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    except Exception:
        print("FAIL: Could not initialize the backend Upstash cache client.", file=sys.stderr)
        return 1
    print("PASS: Upstash cache write/read, TTL, scope isolation, and temporary-key cleanup.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

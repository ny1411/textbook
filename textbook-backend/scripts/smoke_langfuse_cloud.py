"""Write one synthetic LangChain trace and verify it in managed Langfuse Cloud.

Run from textbook-backend with the deployment's environment already injected:
    python scripts/smoke_langfuse_cloud.py
No documents, real conversations, LLM calls, or other providers are accessed.
"""

import argparse
import json
import logging
import os
import sys
import time
from importlib.metadata import version
from pathlib import Path
from uuid import uuid4

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

CLOUD_BASE_URLS = {
    "https://cloud.langfuse.com",
    "https://us.cloud.langfuse.com",
}
TRACE_NAME = "textbook-production-smoke"
SMOKE_INPUT = {"message": "Synthetic telemetry verification; no user data."}
SMOKE_OUTPUT = {"status": "ok"}
SMOKE_USER = "textbook-synthetic-smoke"
SMOKE_TAG = "deployment-smoke"


class SmokeFailure(Exception):
    """A failure message safe to display without remote response bodies or keys."""


def cloud_settings() -> tuple[str, str, str]:
    """Require an explicit managed endpoint instead of relying on SDK defaults."""
    base_url = (os.getenv("LANGFUSE_BASE_URL") or os.getenv("LANGFUSE_HOST") or "").rstrip("/")
    if base_url not in CLOUD_BASE_URLS:
        raise SmokeFailure("Set LANGFUSE_BASE_URL to an explicit supported EU or US Langfuse Cloud endpoint.")
    public_key = os.getenv("LANGFUSE_PUBLIC_KEY", "")
    secret_key = os.getenv("LANGFUSE_SECRET_KEY", "")
    if not public_key or not secret_key:
        raise SmokeFailure("Both Langfuse project API key variables must be configured.")
    if os.getenv("LANGFUSE_TRACING_ENABLED", "true").lower() == "false":
        raise SmokeFailure("LANGFUSE_TRACING_ENABLED disables tracing.")
    try:
        sample_rate = float(os.getenv("LANGFUSE_SAMPLE_RATE", "1"))
    except ValueError:
        raise SmokeFailure("LANGFUSE_SAMPLE_RATE must be 1 for smoke verification.") from None
    if sample_rate != 1:
        raise SmokeFailure("LANGFUSE_SAMPLE_RATE must be 1 for smoke verification.")
    return base_url, public_key, secret_key


def verify_trace(
    client: httpx.Client, trace_id: str, session_id: str, readback_timeout: float
) -> None:
    """Retry asynchronous ingestion; a successful flush alone is insufficient."""
    deadline = time.monotonic() + readback_timeout
    while True:
        response = client.get(f"/api/public/traces/{trace_id}")
        if response.status_code == 200:
            trace = response.json()
            observations = trace.get("observations") or []
            if (
                trace.get("id") == trace_id
                and trace.get("name") == TRACE_NAME
                and trace.get("userId") == SMOKE_USER
                and trace.get("sessionId") == session_id
                and SMOKE_TAG in (trace.get("tags") or [])
                and trace.get("input") == SMOKE_INPUT
                and trace.get("output") == SMOKE_OUTPUT
                and any(
                    observation.get("endTime")
                    and observation.get("type") in {"CHAIN", "SPAN"}
                    for observation in observations
                )
            ):
                return
        elif response.status_code not in {404, 429}:
            raise SmokeFailure(f"Trace readback failed with HTTP {response.status_code}.")
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            if response.status_code == 429:
                raise SmokeFailure("Trace readback remained rate limited (HTTP 429).")
            raise SmokeFailure("Trace readback timed out or stored callback attributes did not match.")
        try:
            delay = max(2, float(response.headers.get("retry-after", "2")))
        except ValueError:
            delay = 2
        time.sleep(min(delay, remaining))


def run_smoke(readback_timeout: float = 45) -> dict:
    base_url, public_key, secret_key = cloud_settings()
    # Import only after configuration checks; never initialize a client with
    # absent keys or send credentials to a non-Cloud endpoint.
    from langchain_core.runnables import RunnableLambda
    from langfuse import get_client
    from core.telemetry import create_langfuse_config

    session_id = f"textbook-smoke-{uuid4().hex}"
    config = create_langfuse_config(
        user_id=SMOKE_USER,
        session_id=session_id,
        trace_name=TRACE_NAME,
        tags=[SMOKE_TAG],
        metadata={"synthetic": "true", "purpose": "production-cloud-verification"},
    )
    if len(config["callbacks"]) != 1:
        raise SmokeFailure("Application telemetry did not attach a Langfuse callback.")
    handler = config["callbacks"][0]
    langfuse = get_client()
    try:
        if not langfuse.auth_check():
            raise SmokeFailure("Langfuse Cloud rejected project authentication.")
        RunnableLambda(lambda _: SMOKE_OUTPUT).invoke(SMOKE_INPUT, config=config)
        trace_id = handler.last_trace_id
        if not trace_id:
            raise SmokeFailure("The application callback did not create a trace ID.")
        langfuse.flush()
        with httpx.Client(
            base_url=base_url,
            auth=(public_key, secret_key),
            timeout=10,
            follow_redirects=False,
        ) as client:
            try:
                verify_trace(client, trace_id, session_id, readback_timeout)
            except SmokeFailure as exc:
                raise SmokeFailure(f"{exc} Synthetic trace ID: {trace_id}") from None
        return {
            "result": "verified",
            "base_url": base_url,
            "sdk_version": version("langfuse"),
            "trace_id": trace_id,
            "trace_name": TRACE_NAME,
            "synthetic": True,
            "checks": ["cloud-auth", "callback", "input-output", "user-session", "tags", "completed-observation"],
        }
    finally:
        langfuse.shutdown()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--readback-timeout", type=float, default=45, help="Seconds to retry Cloud ingestion (default: 45).")
    args = parser.parse_args()
    if not 0 < args.readback_timeout <= 60:
        parser.error("--readback-timeout must be greater than 0 and at most 60 seconds")
    # SDK exceptions/logs can include remote response bodies. Only emit the
    # controlled summary below; never print injected credentials or trace data.
    logging.disable(logging.CRITICAL)
    try:
        print(json.dumps(run_smoke(args.readback_timeout), sort_keys=True))
        return 0
    except SmokeFailure as exc:
        print(f"Langfuse smoke failed: {exc}", file=sys.stderr)
    except Exception as exc:
        print(f"Langfuse smoke failed ({type(exc).__name__}); check deployment connectivity, keys, and SDK compatibility.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

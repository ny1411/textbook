"""Offline regression checks for optional telemetry and Cloud smoke verification."""

import sys
from pathlib import Path

import httpx
import pytest
import requests
import urllib3
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.trace import ReadableSpan
from opentelemetry.sdk.trace.export import SpanExportResult
from opentelemetry.trace import SpanContext

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from core import telemetry
from scripts import smoke_langfuse_cloud as smoke


@pytest.fixture(autouse=True)
def isolated_keys(monkeypatch):
    for name in (
        "LANGFUSE_BASE_URL", "LANGFUSE_HOST", "LANGFUSE_PUBLIC_KEY",
        "LANGFUSE_SECRET_KEY", "LANGFUSE_TRACING_ENABLED", "LANGFUSE_SAMPLE_RATE",
    ):
        monkeypatch.delenv(name, raising=False)


@pytest.mark.parametrize("present_key", [None, "LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"])
def test_incomplete_keys_do_not_initialize_callback(monkeypatch, present_key):
    if present_key:
        monkeypatch.setenv(present_key, "test-value")

    def unexpected_callback():
        pytest.fail("An optional telemetry callback must not be initialized without both keys")

    monkeypatch.setattr(telemetry, "CallbackHandler", unexpected_callback)
    assert telemetry.create_langfuse_config()["callbacks"] == []


def test_disabled_telemetry_does_not_initialize_callback(monkeypatch):
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "test-public")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "test-secret")
    monkeypatch.setenv("LANGFUSE_TRACING_ENABLED", "False")
    monkeypatch.setattr(telemetry, "CallbackHandler", lambda: pytest.fail("Tracing is disabled"))
    assert telemetry.get_langfuse_callback() is None


def test_config_preserves_trace_attributes_and_caller_metadata(monkeypatch):
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "test-public")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "test-secret")
    handler = object()
    monkeypatch.setattr(telemetry, "CallbackHandler", lambda: handler)
    original = {"synthetic": "true"}
    config = telemetry.create_langfuse_config(
        user_id="synthetic-user", session_id="synthetic-session",
        trace_name="synthetic-trace", tags=["smoke"], metadata=original,
    )
    assert config["callbacks"] == [handler]
    assert config["run_name"] == "synthetic-trace"
    assert config["tags"] == ["smoke"]
    assert config["metadata"] == {
        "synthetic": "true", "langfuse_user_id": "synthetic-user",
        "langfuse_session_id": "synthetic-session", "langfuse_trace_name": "synthetic-trace",
    }
    assert original == {"synthetic": "true"}


def test_otlp_export_preserves_inherited_proxy_and_ca(monkeypatch):
    """Regression: upgrading the exporter must not silently use direct egress."""
    monkeypatch.setenv("HTTPS_PROXY", "http://test-proxy.invalid:8080")
    monkeypatch.delenv("https_proxy", raising=False)
    monkeypatch.setenv("NO_PROXY", "")
    monkeypatch.setenv("no_proxy", "")
    monkeypatch.setenv("REQUESTS_CA_BUNDLE", "/synthetic/session-ca.pem")
    for name in ("OTEL_EXPORTER_OTLP_TRACES_CERTIFICATE", "OTEL_EXPORTER_OTLP_CERTIFICATE"):
        monkeypatch.delenv(name, raising=False)
    sent = []

    def fake_send(session, request, **kwargs):
        sent.append((request.url, kwargs))
        response = requests.Response()
        response.status_code = 200
        response._content = b""
        return response

    monkeypatch.setattr(requests.Session, "send", fake_send)
    monkeypatch.setattr(urllib3.PoolManager, "request", lambda *args, **kwargs: pytest.fail("Exporter attempted direct egress"))
    exporter = OTLPSpanExporter(endpoint="https://us.cloud.langfuse.com/api/public/otel/v1/traces")
    try:
        span = ReadableSpan(
            name="synthetic", context=SpanContext(trace_id=1, span_id=1, is_remote=False),
            start_time=1, end_time=2,
        )
        assert exporter.export([span]) == SpanExportResult.SUCCESS
        assert len(sent) == 1
        assert sent[0][1]["proxies"]["https"] == "http://test-proxy.invalid:8080"
        assert sent[0][1]["verify"] == "/synthetic/session-ca.pem"
    finally:
        exporter.shutdown()


@pytest.mark.parametrize("url", [
    "", "http://us.cloud.langfuse.com", "https://langfuse.example",
    "https://us.cloud.langfuse.com/api", "https://us.cloud.langfuse.com?token=test",
    "https://test@us.cloud.langfuse.com",
])
def test_smoke_rejects_missing_or_non_cloud_endpoints(monkeypatch, url):
    monkeypatch.setenv("LANGFUSE_BASE_URL", url)
    with pytest.raises(smoke.SmokeFailure, match="explicit supported"):
        smoke.cloud_settings()


def test_explicit_base_url_takes_precedence_over_legacy_host(monkeypatch):
    monkeypatch.setenv("LANGFUSE_BASE_URL", "https://us.cloud.langfuse.com/")
    monkeypatch.setenv("LANGFUSE_HOST", "https://cloud.langfuse.com")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "test-public")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "test-secret")
    assert smoke.cloud_settings() == ("https://us.cloud.langfuse.com", "test-public", "test-secret")


@pytest.mark.parametrize("setting,value", [
    ("LANGFUSE_SECRET_KEY", ""), ("LANGFUSE_TRACING_ENABLED", "FALSE"),
    ("LANGFUSE_SAMPLE_RATE", "0.5"), ("LANGFUSE_SAMPLE_RATE", "invalid"),
])
def test_smoke_requires_keys_and_unsampled_tracing(monkeypatch, setting, value):
    monkeypatch.setenv("LANGFUSE_BASE_URL", "https://us.cloud.langfuse.com")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "test-public")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "test-secret")
    monkeypatch.setenv(setting, value)
    with pytest.raises(smoke.SmokeFailure):
        smoke.cloud_settings()


def stored_trace(**overrides):
    return {
        "id": "synthetic-id", "name": smoke.TRACE_NAME, "userId": smoke.SMOKE_USER,
        "sessionId": "synthetic-session", "tags": [smoke.SMOKE_TAG],
        "input": smoke.SMOKE_INPUT, "output": smoke.SMOKE_OUTPUT,
        "observations": [{"type": "CHAIN", "endTime": "2026-10-02T00:00:00Z"}],
        **overrides,
    }


def test_readback_waits_for_ingestion_and_completed_callback(monkeypatch):
    responses = iter([
        httpx.Response(429, headers={"retry-after": "3"}), httpx.Response(404),
        httpx.Response(200, json=stored_trace(observations=[])),
        httpx.Response(200, json=stored_trace()),
    ])
    monkeypatch.setattr(smoke.time, "sleep", lambda _: None)
    with httpx.Client(
        base_url="https://us.cloud.langfuse.com",
        transport=httpx.MockTransport(lambda request: next(responses)),
    ) as client:
        smoke.verify_trace(client, "synthetic-id", "synthetic-session", 45)


def test_readback_auth_failure_is_immediate_and_does_not_expose_response():
    with httpx.Client(
        base_url="https://us.cloud.langfuse.com",
        transport=httpx.MockTransport(lambda request: httpx.Response(403, text="sensitive response")),
    ) as client:
        with pytest.raises(smoke.SmokeFailure, match="HTTP 403") as failure:
            smoke.verify_trace(client, "synthetic-id", "synthetic-session", 45)
    assert "sensitive response" not in str(failure.value)


@pytest.mark.parametrize("trace", [stored_trace(userId="wrong-user"), stored_trace(output={"status": "wrong"})])
def test_readback_does_not_accept_incomplete_or_wrong_trace(trace):
    with httpx.Client(
        base_url="https://us.cloud.langfuse.com",
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json=trace)),
    ) as client:
        with pytest.raises(smoke.SmokeFailure, match="did not match"):
            smoke.verify_trace(client, "synthetic-id", "synthetic-session", 0)

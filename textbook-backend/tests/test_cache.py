"""Offline cache and smoke-check tests; never contact a configured Redis instance."""

import logging
from pathlib import Path
import sys
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services import caching
from scripts import verify_upstash


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.expirations = {}
        self.deleted = []
        self.json = SimpleNamespace(get=self.values.get, set=self.json_set)

    def json_set(self, key, path, data):
        assert path == "$"
        self.values[key] = data

    def expire(self, key, ttl):
        self.expirations[key] = ttl
        return True

    def ttl(self, key):
        return self.expirations.get(key, -1)

    def exists(self, key):
        return int(key in self.values)

    def delete(self, key):
        self.deleted.append(key)
        self.values.pop(key, None)
        self.expirations.pop(key, None)
        return 1


@pytest.fixture
def cache_client(monkeypatch):
    client = FakeRedis()
    monkeypatch.setattr(caching, "redis", client)
    return client


def test_application_cache_roundtrip_preserves_payload_and_ttl(cache_client):
    scope = {"user_id": "unit-user", "query": "What is RAG?", "document_ids": ["doc-1"]}
    payload = {"answer": "RAG uses retrieved context.", "citations": [{"source_id": 1}]}

    assert caching.get_cached_response(**scope) is None
    caching.set_cached_response(**scope, response=payload, ttl_seconds=180)

    assert caching.get_cached_response(**scope) == payload
    assert cache_client.ttl(caching._make_key(**scope)) == 180
    assert caching.get_cached_response(**{**scope, "user_id": "other-user"}) is None
    assert caching.get_cached_response(**{**scope, "document_ids": []}) is None


def test_cache_is_optional_without_configuration(monkeypatch):
    monkeypatch.setattr(caching, "redis", None)
    assert caching.get_cached_response("unit-user", "query") is None
    assert caching.set_cached_response("unit-user", "query", {"answer": "value"}) is None


def test_provider_failure_remains_a_cache_miss(cache_client, monkeypatch):
    def unavailable(*args):
        raise ConnectionError("Redis unavailable")

    monkeypatch.setattr(cache_client.json, "get", unavailable)
    assert caching.get_cached_response("unit-user", "query") is None


def test_smoke_check_uses_new_scope_and_cleans_up_only_its_key(cache_client):
    existing_key = "cache:existing-user:existing-response"
    cache_client.values[existing_key] = {"answer": "Keep this response"}

    verify_upstash.run_smoke_check(caching)
    verify_upstash.run_smoke_check(caching)

    assert cache_client.values == {existing_key: {"answer": "Keep this response"}}
    assert len(set(cache_client.deleted)) == 2
    assert all(key.startswith("cache:upstash-smoke-") for key in cache_client.deleted)
    assert not logging.getLogger(caching.__name__).disabled


def test_smoke_check_fails_if_application_write_is_swallowed(cache_client, monkeypatch):
    monkeypatch.setattr(caching, "set_cached_response", lambda **kwargs: None)

    with pytest.raises(verify_upstash.SmokeCheckError, match="write/read"):
        verify_upstash.run_smoke_check(caching)

    assert len(cache_client.deleted) == 1
    assert cache_client.values == {}


def test_smoke_check_detects_missing_ttl_and_still_cleans_up(cache_client, monkeypatch):
    monkeypatch.setattr(cache_client, "expire", lambda *args: False)

    with pytest.raises(verify_upstash.SmokeCheckError, match="bounded TTL"):
        verify_upstash.run_smoke_check(caching)

    assert cache_client.values == {}
    assert len(cache_client.deleted) == 1


def test_smoke_check_reports_cleanup_failure(cache_client, monkeypatch):
    def unavailable(*args):
        raise ConnectionError("sensitive-token-do-not-print")

    monkeypatch.setattr(cache_client, "delete", unavailable)
    with pytest.raises(verify_upstash.SmokeCheckError, match="cleanup failed") as error:
        verify_upstash.run_smoke_check(caching)

    assert "sensitive-token" not in str(error.value)
    assert not logging.getLogger(caching.__name__).disabled


def test_smoke_check_does_not_delete_a_key_it_did_not_create(cache_client, monkeypatch):
    monkeypatch.setattr(cache_client, "exists", lambda *args: 1)
    with pytest.raises(verify_upstash.SmokeCheckError, match="already exists"):
        verify_upstash.run_smoke_check(caching)
    assert cache_client.deleted == []


@pytest.mark.parametrize("url", [
    "http://example.upstash.io",
    "https://example.invalid",
    "https://example.upstash.io.attacker.invalid",
    "https://user:secret@example.upstash.io",
    "https://example.upstash.io?token=secret",
    "https://example.upstash.io/bad-path",
    "https://example.upstash.io:bad-port",
])
def test_production_preflight_rejects_invalid_endpoints(url):
    with pytest.raises(verify_upstash.SmokeCheckError, match="HTTPS Upstash"):
        verify_upstash.validate_configuration({
            "UPSTASH_REDIS_REST_URL": url,
            "UPSTASH_REDIS_REST_TOKEN": "unit-token",
        })


def test_production_preflight_requires_both_variables():
    with pytest.raises(verify_upstash.SmokeCheckError, match="Set UPSTASH"):
        verify_upstash.validate_configuration({"UPSTASH_REDIS_REST_URL": "https://example.upstash.io"})


def test_production_preflight_accepts_provider_endpoint():
    verify_upstash.validate_configuration({
        "UPSTASH_REDIS_REST_URL": "https://example.upstash.io",
        "UPSTASH_REDIS_REST_TOKEN": "unit-token",
    })


def test_smoke_cli_sanitizes_unexpected_errors(monkeypatch, capsys):
    monkeypatch.setattr(verify_upstash, "validate_configuration", lambda *args: None)

    def unavailable(*args):
        raise ConnectionError("sensitive-token-do-not-print")

    monkeypatch.setattr(verify_upstash, "run_smoke_check", unavailable)

    assert verify_upstash.main() == 1
    output = capsys.readouterr()
    assert "FAIL:" in output.err
    assert "sensitive-token" not in output.err

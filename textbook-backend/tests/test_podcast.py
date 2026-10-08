"""Two distinct provider voices, source-bound transcript and failure/cancellation limits."""
import asyncio
import io
import json
import wave
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException

from history_fixture import build_app, USER_A
from services import podcast, speech
from test_voice import configure, provider_payload

SOURCES = [{"id": 1, "document_id": "11111111-1111-4111-8111-111111111111", "name": "Mechanics.txt"}]
EXCERPT = "Force equals mass times acceleration. Acceleration is a change in velocity."


def transcript(turns=None):
    return {"turns": turns or [{"speaker": speaker, "text": text, "source_ids": [1]} for speaker, text in (
        ("Host", "What does Mechanics say about force in these selected passages?"),
        ("Guest", "Force equals mass times acceleration."),
        ("Host", "How does the source describe acceleration?"),
        ("Guest", "It describes acceleration as a change in velocity."))]}


def script_response(value=None):
    return {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": json.dumps(value or transcript())}]}}]}


def test_real_protocol_uses_source_passages_and_two_distinct_speaker_voices(monkeypatch):
    calls = []
    def provider(request):
        calls.append(json.loads(request.content))
        return httpx.Response(200, json=script_response() if len(calls) == 1 else provider_payload())
    configure(monkeypatch, provider)
    async def excerpts(*args):
        return [{**SOURCES[0], "text": EXCERPT}]
    monkeypatch.setattr(podcast, "load_excerpts", excerpts)
    result = asyncio.run(podcast.generate_overview(USER_A, "notebook", SOURCES))
    import base64
    with wave.open(io.BytesIO(base64.b64decode(result["audio_base64"]))) as audio:
        assert audio.getnframes() == 24000 and audio.getframerate() == 24000
    assert result["turns"] == transcript()["turns"] and result["sources"] == SOURCES
    assert result["media_type"] == "audio/wav" and result["duration_seconds"] == 1
    assert EXCERPT in calls[0]["contents"][0]["parts"][0]["text"]
    assert "untrusted data" in calls[0]["systemInstruction"]["parts"][0]["text"]
    config = calls[1]["generationConfig"]["speechConfig"]
    assert "voiceConfig" not in config
    speakers = config["multiSpeakerVoiceConfig"]["speakerVoiceConfigs"]
    assert [(item["speaker"], item["voiceConfig"]["prebuiltVoiceConfig"]["voiceName"]) for item in speakers] == [("Host", "Kore"), ("Guest", "Puck")]
    assert "Host:" in calls[1]["contents"][0]["parts"][0]["text"] and "Guest:" in calls[1]["contents"][0]["parts"][0]["text"]


@pytest.mark.parametrize("mutate", [
    lambda value: value["turns"][0].update(source_ids=[2]),
    lambda value: value["turns"][1].update(speaker="Host"),
    lambda value: value["turns"][0].update(text="   "),
    lambda value: value["turns"][0].update(text="x" * 601),
    lambda value: value.update(turns=value["turns"][:2]),
])
def test_invented_sources_invalid_turns_and_excessive_scripts_fail_before_tts(monkeypatch, mutate):
    value = transcript()
    mutate(value)
    calls = []
    configure(monkeypatch, lambda request: calls.append(request) or httpx.Response(200, json=script_response(value)))
    async def check():
        with pytest.raises(HTTPException) as invalid:
            await podcast.generate_script("fixture", "gemini-fixture", [{**SOURCES[0], "text": EXCERPT}])
        assert invalid.value.status_code == 502 and len(calls) == 1
    asyncio.run(check())


def test_uncovered_source_is_rejected(monkeypatch):
    configure(monkeypatch, lambda request: httpx.Response(200, json=script_response()))
    async def check():
        with pytest.raises(HTTPException) as invalid:
            await podcast.generate_script("fixture", "gemini-fixture", [*SOURCES, {"id": 2, "text": "Other passage"}])
        assert invalid.value.status_code == 502
    asyncio.run(check())


@pytest.mark.parametrize("status, expected", [(400, 502), (403, 503), (404, 503), (429, 503), (500, 503)])
def test_provider_failures_are_private_and_quota_retry_is_explicit(monkeypatch, status, expected):
    configure(monkeypatch, lambda request: httpx.Response(status, text="fixture-key private excerpt"))
    async def check():
        with pytest.raises(HTTPException) as failure:
            await podcast.generate_script("fixture", "gemini-fixture", [{**SOURCES[0], "text": EXCERPT}])
        assert failure.value.status_code == expected
        assert "fixture-key" not in failure.value.detail and "private excerpt" not in failure.value.detail
        if status == 429:
            assert failure.value.headers["Retry-After"] == "60"
    asyncio.run(check())


def test_fixed_source_filters_and_excerpt_limits(monkeypatch):
    build_app()
    import importlib
    vectors = importlib.import_module("db.qdrant")
    requests = []
    def scroll(**kwargs):
        requests.append(kwargs)
        correct = {"user_id": USER_A, "notebook_id": "notebook", "document_id": SOURCES[0]["document_id"]}
        return [SimpleNamespace(payload={**correct, "text": "x" * 5000}),
            SimpleNamespace(payload={**correct, "user_id": "foreign", "text": "PRIVATE FOREIGN PASSAGE"})], None
    monkeypatch.setattr(vectors.client, "scroll", scroll, raising=False)
    excerpt = podcast._source_excerpt(USER_A, "notebook", SOURCES[0]["document_id"])
    assert len(excerpt) == podcast.MAX_SOURCE_CHARS and "PRIVATE" not in excerpt
    filters = requests[0]["scroll_filter"].must
    assert {condition.key: condition.match.value for condition in filters} == {
        "user_id": USER_A, "notebook_id": "notebook", "document_id": SOURCES[0]["document_id"]}
    assert requests[0]["limit"] == 4 and requests[0]["with_vectors"] is False


def test_empty_passages_and_same_voice_settings_fail_before_provider(monkeypatch):
    configure(monkeypatch, lambda request: pytest.fail("provider must not run"))
    monkeypatch.setattr(podcast, "_source_excerpt", lambda *args: "")
    async def check():
        with pytest.raises(HTTPException) as empty:
            await podcast.load_excerpts(USER_A, "notebook", SOURCES)
        assert empty.value.status_code == 409
    asyncio.run(check())
    monkeypatch.setenv("AUDIO_OVERVIEW_GUEST_VOICE", "Kore")
    with pytest.raises(HTTPException) as invalid:
        podcast._settings()
    assert invalid.value.status_code == 503


def test_total_timeout_and_disconnect_cancel_provider_work(monkeypatch):
    build_app()
    from routers.studio import _while_connected
    configure(monkeypatch, lambda request: pytest.fail("provider must not run"))
    async def slow(*args):
        await asyncio.Event().wait()
    monkeypatch.setattr(podcast, "load_excerpts", slow)
    monkeypatch.setattr(podcast, "GENERATION_TIMEOUT", .01)
    async def check():
        with pytest.raises(HTTPException) as timed_out:
            await podcast.generate_overview(USER_A, "notebook", SOURCES)
        assert timed_out.value.status_code == 504
        started, cancelled, disconnected = asyncio.Event(), asyncio.Event(), asyncio.Event()
        async def generation(*args):
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        monkeypatch.setattr(podcast, "generate_overview", generation)
        class Request:
            async def is_disconnected(self):
                return disconnected.is_set()
        async def pending():
            async with speech.limiter.reserve(USER_A):
                return await _while_connected(Request(), USER_A, "notebook", SOURCES)
        task = asyncio.create_task(pending())
        await started.wait()
        disconnected.set()
        with pytest.raises(HTTPException) as aborted:
            await task
        assert aborted.value.status_code == 499 and cancelled.is_set() and not speech.limiter.active
    asyncio.run(check())

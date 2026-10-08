"""Real synthesis protocol, WAV output, ownership, retry and disconnect handling."""
import asyncio
import base64
import io
import json
import math
import struct
import wave

import httpx
import pytest
from fastapi import HTTPException

from history_fixture import build_app, token, USER_A, USER_B
from db.postgres import get_db
from services import speech

NOTEBOOK_A = "11111111-1111-4111-8111-111111111111"
NOTEBOOK_B = "22222222-2222-4222-8222-222222222222"


def run(function):
    return asyncio.run(function())


def pcm_bytes(seconds=1, rate=24000):
    # A genuine audible PCM fixture, rather than a fabricated audio duration.
    return b"".join(struct.pack("<h", int(2000 * math.sin(2 * math.pi * 220 * index / rate)))
        for index in range(round(seconds * rate)))


def provider_payload(pcm=None, mime="audio/L16;codec=pcm;rate=24000"):
    return {"candidates": [{"finishReason": "STOP", "content": {"role": "model", "parts": [{
        "inlineData": {"mimeType": mime, "data": base64.b64encode(pcm_bytes() if pcm is None else pcm).decode()}}]}}]}


def configure(monkeypatch, handler):
    monkeypatch.setenv("GOOGLE_API_KEY", "fixture-key")
    monkeypatch.delenv("VOICE_TTS_MODEL", raising=False)
    monkeypatch.delenv("VOICE_TTS_VOICE", raising=False)
    monkeypatch.setattr(speech, "http_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(speech, "limiter", speech.SpeechLimiter())


class OwnedNotebooks:
    async def query(self, sql, *params):
        assert sql == 'SELECT id FROM notebooks WHERE id = %s::uuid AND "userId" = %s::uuid'
        notebook, user = params
        return [{"id": notebook}] if (notebook, user) in ((NOTEBOOK_A, USER_A), (NOTEBOOK_B, USER_B)) else []


def voice_app():
    db = OwnedNotebooks()
    app = build_app(db)
    from routers.voice import router
    app.include_router(router, prefix="/api")
    async def owned_db():
        return db
    app.dependency_overrides[get_db] = owned_db
    return app


def test_authenticated_owned_speech_returns_real_private_seekable_wav(monkeypatch):
    requests = []
    def provider(request):
        requests.append(request)
        return httpx.Response(200, json=provider_payload())
    configure(monkeypatch, provider)
    async def check():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(voice_app()), base_url="http://test",
                headers={"Authorization": "Bearer " + token(USER_A)}) as client:
            response = await client.post("/api/voice/synthesize", json={"notebook_id": NOTEBOOK_A, "text": "Read this mechanics summary."})
            assert response.status_code == 200, response.text
            assert response.headers["content-type"] == "audio/wav"
            assert response.headers["cache-control"] == "private, no-store"
            assert response.headers["x-content-type-options"] == "nosniff"
            assert float(response.headers["x-audio-duration"]) == 1
            with wave.open(io.BytesIO(response.content)) as audio:
                assert (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getnframes()) == (1, 2, 24000, 24000)
                assert audio.readframes(audio.getnframes()) == pcm_bytes()
        assert len(requests) == 1
        request = requests[0]
        assert str(request.url) == "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent"
        assert request.headers["x-goog-api-key"] == "fixture-key"
        assert "key=" not in str(request.url)
        payload = json.loads(request.content)
        assert payload["generationConfig"]["responseModalities"] == ["AUDIO"]
        assert payload["generationConfig"]["speechConfig"]["voiceConfig"]["prebuiltVoiceConfig"]["voiceName"] == "Kore"
        assert "Read this mechanics summary." in payload["contents"][0]["parts"][0]["text"]
    run(check)


def test_auth_foreign_notebook_and_invalid_text_fail_before_provider(monkeypatch):
    calls = []
    configure(monkeypatch, lambda request: calls.append(request) or httpx.Response(200, json=provider_payload()))
    async def check():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(voice_app()), base_url="http://test") as client:
            body = {"notebook_id": NOTEBOOK_A, "text": "A private summary"}
            assert (await client.post("/api/voice/synthesize", json=body)).status_code == 401
            assert (await client.post("/api/voice/synthesize", json=body, headers={"Authorization": "Bearer forged"})).status_code == 401
            headers = {"Authorization": "Bearer " + token(USER_A)}
            assert (await client.post("/api/voice/synthesize", json={**body, "notebook_id": NOTEBOOK_B}, headers=headers)).status_code == 404
            for text in ("", "   ", "\x00hidden", "x" * 4001):
                assert (await client.post("/api/voice/synthesize", json={**body, "text": text}, headers=headers)).status_code == 422
            assert (await client.post("/api/voice/synthesize", json={**body, "notebook_id": "malformed"}, headers=headers)).status_code == 422
        assert not calls
    run(check)


@pytest.mark.parametrize("upstream_status, expected", [(400, 502), (401, 503), (403, 503), (404, 503), (429, 503), (503, 503)])
def test_upstream_failure_is_private_and_explicit_retry_can_recover(monkeypatch, upstream_status, expected):
    attempts = []
    def provider(request):
        attempts.append(request)
        return httpx.Response(upstream_status, text="fixture-key private-passage upstream details") if len(attempts) == 1 else httpx.Response(200, json=provider_payload())
    configure(monkeypatch, provider)
    async def check():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(voice_app()), base_url="http://test",
                headers={"Authorization": "Bearer " + token(USER_A)}) as client:
            body = {"notebook_id": NOTEBOOK_A, "text": "private-passage"}
            failed = await client.post("/api/voice/synthesize", json=body)
            assert failed.status_code == expected
            assert "fixture-key" not in failed.text and "private-passage" not in failed.text and "upstream details" not in failed.text
            if upstream_status == 429:
                assert failed.headers["retry-after"] == "60"
            assert not speech.limiter.active
            recovered = await client.post("/api/voice/synthesize", json=body)
            assert recovered.status_code == 200
            assert len(attempts) == 2  # Exactly one provider call per explicit attempt.
    run(check)


@pytest.mark.parametrize("mime", ["audio/mp3", "image/png", "audio/L16;codec=mp3;rate=24000", "audio/L16;rate=8000", "audio/L16;rate=24000;channels=2", "audio/L16;rate=24000;rate=48000"])
def test_pcm_format_and_channel_mismatches_cannot_get_a_false_wav_header(mime):
    with pytest.raises(HTTPException) as invalid:
        speech._audio_from_response(provider_payload(mime=mime))
    assert invalid.value.status_code == 502


@pytest.mark.parametrize("mutation", [
    lambda payload: payload["candidates"][0]["content"]["parts"][0]["inlineData"].update(data="not-base64!"),
    lambda payload: payload["candidates"][0]["content"]["parts"][0]["inlineData"].update(data=""),
    lambda payload: payload["candidates"][0]["content"]["parts"][0]["inlineData"].update(data=base64.b64encode(b"odd").decode()),
    lambda payload: payload["candidates"][0]["content"]["parts"].append({"text": "This is not just audio"}),
    lambda payload: payload["candidates"][0].update(finishReason="MAX_TOKENS"),
    lambda payload: payload.update(candidates=[]),
])
def test_malformed_truncated_or_wrong_modality_audio_is_rejected(mutation):
    payload = provider_payload()
    mutation(payload)
    with pytest.raises(HTTPException) as invalid:
        speech._audio_from_response(payload)
    assert invalid.value.status_code == 502


def test_audio_byte_duration_and_provider_response_limits(monkeypatch):
    monkeypatch.setattr(speech, "MAX_AUDIO_BYTES", 4)
    with pytest.raises(HTTPException):
        speech._audio_from_response(provider_payload(pcm=b"\x00" * 6))
    monkeypatch.setattr(speech, "MAX_AUDIO_BYTES", 100000)
    monkeypatch.setattr(speech, "MAX_DURATION_SECONDS", .5)
    with pytest.raises(HTTPException):
        speech._audio_from_response(provider_payload())
    configure(monkeypatch, lambda request: httpx.Response(200, content=b"x" * 100))
    monkeypatch.setattr(speech, "MAX_RESPONSE_BYTES", 16)
    async def check():
        with pytest.raises(HTTPException) as oversized:
            await speech.synthesize("A short passage")
        assert oversized.value.status_code == 502
    run(check)


def test_provider_timeout_and_invalid_json_fail_without_retaining_audio(monkeypatch):
    async def slow_provider(request):
        await asyncio.sleep(1)
        return httpx.Response(200, json=provider_payload())
    configure(monkeypatch, slow_provider)
    monkeypatch.setattr(speech, "PROVIDER_TIMEOUT_SECONDS", .02)
    async def check():
        with pytest.raises(HTTPException) as timeout:
            await speech.synthesize("A short passage")
        assert timeout.value.status_code == 504
        monkeypatch.setattr(speech, "http_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(
            lambda request: httpx.Response(200, content=b"invalid json"))))
        with pytest.raises(HTTPException) as invalid:
            await speech.synthesize("A short passage")
        assert invalid.value.status_code == 502
    run(check)


def test_missing_configuration_never_contacts_provider(monkeypatch):
    calls = []
    configure(monkeypatch, lambda request: calls.append(request))
    monkeypatch.delenv("GOOGLE_API_KEY")
    async def check():
        with pytest.raises(HTTPException) as unavailable:
            await speech.synthesize("A short passage")
        assert unavailable.value.status_code == 503
        assert not calls
    run(check)


def test_account_global_and_minute_limits_release_after_failure(monkeypatch):
    async def check():
        clock = [0]
        monkeypatch.setattr(speech.time, "monotonic", lambda: clock[0])
        limiter = speech.SpeechLimiter(max_active=2, per_minute=2)
        async with limiter.reserve(USER_A):
            with pytest.raises(HTTPException) as same_account:
                async with limiter.reserve(USER_A):
                    pass
            assert same_account.value.status_code == 429
            async with limiter.reserve(USER_B):
                with pytest.raises(HTTPException) as global_limit:
                    async with limiter.reserve("third-account"):
                        pass
                assert global_limit.value.status_code == 503
        with pytest.raises(RuntimeError):
            async with limiter.reserve(USER_A):
                raise RuntimeError("Synthetic provider failure")
        assert not limiter.active
        with pytest.raises(HTTPException) as minute_limit:
            async with limiter.reserve(USER_A):
                pass
        assert minute_limit.value.status_code == 429
        clock[0] = 61
        async with limiter.reserve(USER_A):
            assert limiter.active == {USER_A}
        assert not limiter.active
    run(check)


def test_disconnect_cancels_generation_and_releases_the_active_account(monkeypatch):
    build_app()
    from routers.voice import _while_connected
    async def check():
        disconnected, started, cancelled = asyncio.Event(), asyncio.Event(), asyncio.Event()
        class Request:
            async def is_disconnected(self):
                return disconnected.is_set()
        async def generate(text):
            started.set()
            try:
                await asyncio.Event().wait()
            finally:
                cancelled.set()
        monkeypatch.setattr(speech, "synthesize", generate)
        limiter = speech.SpeechLimiter()
        async def pending():
            async with limiter.reserve(USER_A):
                return await _while_connected(Request(), "A short passage")
        task = asyncio.create_task(pending())
        await started.wait()
        disconnected.set()
        with pytest.raises(HTTPException) as aborted:
            await task
        assert aborted.value.status_code == 499
        assert cancelled.is_set()
        assert not limiter.active
    run(check)

"""Provider protocol, hostile output, bounded inputs, and cancellation checks."""
import asyncio
import base64
import io
import json
import sys
import threading
from pathlib import Path

import httpx
import pytest
from fastapi import HTTPException
from PIL import Image, PngImagePlugin
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from services import concept_images as figures


def image_bytes(size=(32, 24), format="PNG", metadata=False):
    output = io.BytesIO()
    info = PngImagePlugin.PngInfo()
    info.add_text("provider-secret", "unwanted metadata")
    Image.new("RGB", size, "#234567").save(output, format=format, **({"pnginfo": info} if metadata else {}))
    return output.getvalue()


def test_real_predict_protocol_and_key_never_in_url(monkeypatch):
    seen = []
    def provider(request):
        seen.append(request)
        assert request.method == "POST"
        assert str(request.url) == "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict"
        assert request.headers["x-goog-api-key"] == "synthetic-private-key"
        body = json.loads(request.content)
        assert body["instances"] == [{"prompt": "Educational context"}]
        assert body["parameters"]["sampleCount"] == 1
        return httpx.Response(200, json={"predictions": [{"bytesBase64Encoded": base64.b64encode(image_bytes()).decode()}]})
    monkeypatch.setenv("GOOGLE_API_KEY", "synthetic-private-key")
    monkeypatch.setattr(figures, "http_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(provider)))
    assert asyncio.run(figures.predict_image("Educational context", figures.DEFAULT_MODEL)) == image_bytes()
    assert len(seen) == 1


@pytest.mark.parametrize("status,retryable", [(429, True), (403, True), (404, True), (500, True), (400, False)])
def test_provider_errors_are_safe_without_retry(monkeypatch, status, retryable):
    calls = []
    def provider(request):
        calls.append(request)
        return httpx.Response(status, json={"error": {"message": "SECRET KEY PROMPT ACCOUNT"}})
    monkeypatch.setenv("GOOGLE_API_KEY", "synthetic")
    monkeypatch.setattr(figures, "http_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(provider)))
    with pytest.raises(HTTPException) as error:
        asyncio.run(figures.predict_image("private prompt", figures.DEFAULT_MODEL))
    result = figures.safe_error(error.value)
    assert result["retryable"] is retryable and "SECRET" not in result["message"]
    assert len(calls) == 1


@pytest.mark.parametrize("payload", [[], "wrong JSON shape", {}, {"predictions": []}, {"predictions": [{}, {}]},
    {"predictions": [{"bytesBase64Encoded": "invalid$"}]}, {"predictions": [{"bytesBase64Encoded": ""}]}])
def test_provider_rejects_missing_filtered_multiple_and_invalid_images(monkeypatch, payload):
    monkeypatch.setenv("GOOGLE_API_KEY", "synthetic")
    monkeypatch.setattr(figures, "http_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=payload))))
    with pytest.raises(HTTPException):
        asyncio.run(figures.predict_image("concept", figures.DEFAULT_MODEL))


def test_response_size_bound_and_timeout(monkeypatch):
    monkeypatch.setenv("GOOGLE_API_KEY", "synthetic")
    monkeypatch.setattr(figures, "MAX_RESPONSE_BYTES", 32)
    monkeypatch.setattr(figures, "http_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b"x" * 33))))
    with pytest.raises(HTTPException) as error:
        asyncio.run(figures.predict_image("concept", figures.DEFAULT_MODEL))
    assert error.value.status_code == 502
    def timed_out(request):
        raise httpx.ReadTimeout("SECRET", request=request)
    monkeypatch.setattr(figures, "http_client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(timed_out)))
    with pytest.raises(HTTPException) as error:
        asyncio.run(figures.predict_image("concept", figures.DEFAULT_MODEL))
    assert error.value.status_code == 504 and "SECRET" not in error.value.detail


def test_normalizes_png_and_discards_provider_metadata():
    png, width, height = figures.normalize_image(image_bytes(metadata=True))
    with Image.open(io.BytesIO(png)) as decoded:
        assert decoded.format == "PNG" and decoded.info == {}
    assert (width, height) == (32, 24)
    jpeg, width, height = figures.normalize_image(image_bytes(format="JPEG"))
    assert jpeg.startswith(b"\x89PNG\r\n\x1a\n")


@pytest.mark.parametrize("raw", [b"", b"not an image", image_bytes((2049, 1)), image_bytes()[:40]])
def test_normalization_rejects_invalid_truncated_and_oversized_images(raw):
    with pytest.raises(HTTPException) as error:
        figures.normalize_image(raw)
    assert error.value.status_code == 502


def test_byte_ceiling_and_animation(monkeypatch):
    monkeypatch.setattr(figures, "MAX_IMAGE_BYTES", 16)
    with pytest.raises(HTTPException):
        figures.normalize_image(b"x" * 17)
    monkeypatch.setattr(figures, "MAX_IMAGE_BYTES", 8 * 1024 * 1024)
    output = io.BytesIO()
    Image.new("RGB", (5, 5), "red").save(output, format="PNG", save_all=True,
        append_images=[Image.new("RGB", (5, 5), "blue")], duration=50, loop=0)
    with pytest.raises(HTTPException):
        figures.normalize_image(output.getvalue())


def test_settled_thread_waits_for_late_upload_before_cancelling():
    async def check():
        entered = threading.Event()
        release = threading.Event()
        writes = []
        def upload():
            entered.set()
            assert release.wait(5)
            writes.append("uploaded")
        task = asyncio.create_task(figures.settled_thread(upload))
        await asyncio.to_thread(entered.wait, 2)
        task.cancel()
        await asyncio.sleep(0)
        assert not task.done() and not writes
        release.set()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert writes == ["uploaded"]
    asyncio.run(check())


def test_process_provider_slots_are_bounded_and_released_after_cancel():
    async def check():
        limiter = figures.ProviderLimiter(1)
        async with limiter.reserve():
            with pytest.raises(HTTPException) as error:
                async with limiter.reserve():
                    pytest.fail("Second provider acquired a full slot")
            assert error.value.status_code == 503
        assert limiter.active == 0
    asyncio.run(check())


def test_schema_bounds_and_nul_rejection(monkeypatch):
    # Import only this router without loading the model-heavy routers package.
    import importlib.util
    spec = importlib.util.spec_from_file_location("concept_image_router_test", Path(__file__).resolve().parents[1] / "routers/image.py")
    router = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(router)
    notebook = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    for prompt in ("", " " * 5, "x" * 1201, "a\x00b", 12):
        with pytest.raises(ValidationError):
            router.GenerateFigure(notebook_id=notebook, prompt=prompt)
    for caption in ("", " ", "a\x00b", "x" * 1201):
        with pytest.raises(ValidationError):
            router.SaveFigure(notebook_id=notebook, caption=caption)
    for source in ({"page_number": 0}, {"excerpt": "x" * 2401}, {"excerpt": "a\x00b"}, {"source_id": True}, {"source_id": "x" * 161}):
        with pytest.raises(ValidationError):
            router.FigureSource(document_id=notebook, **source)
    assert router.GenerateFigure(notebook_id=notebook, prompt="  concept  ").prompt == "concept"


def test_public_bucket_is_rejected_before_private_bytes(monkeypatch):
    from types import ModuleType, SimpleNamespace
    module = ModuleType("db.supabase")
    module.supabase_client = SimpleNamespace(storage=SimpleNamespace(
        get_bucket=lambda name: {"public": True}, from_=lambda name: pytest.fail("Public bucket reached bytes")))
    monkeypatch.setitem(sys.modules, "db.supabase", module)
    with pytest.raises(HTTPException) as error:
        figures.private_storage()
    assert error.value.status_code == 503

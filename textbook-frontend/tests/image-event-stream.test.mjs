import assert from "node:assert/strict";
import { test } from "node:test";
import { consumeImageEventStream, ImageGenerationError, validateFigure } from "../lib/api/image-event-stream.mjs";

const figure = {
    id: "figure-1", notebook_id: "notebook-a", caption: "Attention connects tokens 🌍 नमस्ते",
    prompt: "Illustrate attention", media_type: "image/png", width: 1024, height: 1024,
    model: "imagen-test", created_at: "2026-10-09T12:00:00.000Z",
    source: { document_id: "document-a", source_id: 1, page_number: 2, excerpt: "Queries and keys",
        document_name: "Attention textbook", context_type: "saved_citation" },
};
const encoder = new TextEncoder();
const frame = (event, data, newline = "\n") => `event: ${event}${newline}data: ${JSON.stringify(data)}${newline}${newline}`;
const complete = frame("complete", { figure });
function stream(value, chunkSize = Infinity) {
    const bytes = encoder.encode(value);
    return new ReadableStream({ start(controller) {
        for (let index = 0; index < bytes.length; index += chunkSize) controller.enqueue(bytes.slice(index, index + chunkSize));
        controller.close();
    } });
}

test("phase and completion events survive byte-split UTF-8 and CRLF, preserving provenance", async () => {
    const seen = [];
    const source = stream(": heartbeat\r\n\r\n" + frame("phase", { phase: "analyzing" }, "\r\n")
        + frame("phase", { phase: "synthesizing" }, "\r\n") + frame("phase", { phase: "rendering" }, "\r\n")
        + frame("complete", { figure }, "\r\n"), 1);
    assert.deepEqual(await consumeImageEventStream(source, (event) => seen.push(event), undefined, "notebook-a"), figure);
    assert.deepEqual(seen.map((event) => event.event === "phase" ? event.data.phase : event.event),
        ["analyzing", "synthesizing", "rendering", "complete"]);
    assert.equal(source.locked, false);
});

test("completion stops without waiting for stream closure and exposes the pending figure ID once", async () => {
    let cancelled = false;
    const seen = [];
    const source = new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(complete)); },
        cancel() { cancelled = true; } });
    assert.deepEqual(await consumeImageEventStream(source, (event) => seen.push(event)), figure);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].data.figure.id, figure.id);
    assert.equal(cancelled, true);
    assert.equal(source.locked, false);
});

test("supports bare CR, multi-line JSON data, comments, and ignored extension events", async () => {
    const seen = [];
    const source = stream('event: future\rdata: non-JSON\r\revent: phase\rdata: {"phase":\rdata: "analyzing"}\r\r' + complete, 2);
    await consumeImageEventStream(source, (event) => seen.push(event));
    assert.equal(seen[0].data.phase, "analyzing");
    assert.equal(seen.length, 2);
});

test("safe service errors preserve retryability and release the reader", async () => {
    const source = stream(frame("error", { message: "Diagram generation is not configured.", retryable: false }));
    await assert.rejects(consumeImageEventStream(source, () => {}), (error) =>
        error instanceof ImageGenerationError && error.retryable === false && error.message === "Diagram generation is not configured.");
    assert.equal(source.locked, false);
});

test("rejects invalid metadata, foreign notebooks, image dimensions, and oversized fields", () => {
    for (const change of [{ notebook_id: "notebook-b" }, { id: "../../private" }, { media_type: "image/svg+xml" },
        { width: 2049 }, { height: 0 }, { caption: "x".repeat(1201) }, { prompt: "x".repeat(1201) },
        { created_at: "invalid" }, { source: { ...figure.source, excerpt: "x".repeat(2401) } },
        { source: { ...figure.source, context_type: "unverified" } }, { source: { ...figure.source, source_id: NaN } }]) {
        assert.throws(() => validateFigure({ ...figure, ...change }, "notebook-a"), ImageGenerationError);
    }
    assert.deepEqual(validateFigure({ ...figure, url: "blob:expired", image_base64: "private-bytes" }), figure);
});

test("rejects invalid events and bounded frames without promoting partial progress", async () => {
    for (const value of ['event: phase\ndata: invalid\n\n', frame("phase", { phase: "invented" }),
        frame("complete", { figure: { ...figure, width: 9999 } }), `event: phase\ndata: ${"x".repeat(32769)}\n\n`]) {
        const source = stream(value + complete);
        await assert.rejects(consumeImageEventStream(source, () => {}), ImageGenerationError);
        assert.equal(source.locked, false);
    }
    for (const value of ["", frame("phase", { phase: "analyzing" }), complete.trimEnd()]) {
        await assert.rejects(consumeImageEventStream(stream(value), () => {}), /ended before an image was ready/);
    }
});

test("abort cancels a pending read and completion-time abort still exposes the ID for cleanup", async () => {
    let cancelled = false;
    const controller = new AbortController();
    const source = new ReadableStream({ cancel() { cancelled = true; } });
    const promise = consumeImageEventStream(source, () => assert.fail("Unexpected event"), controller.signal);
    controller.abort();
    await assert.rejects(promise, { name: "AbortError" });
    assert.equal(cancelled, true);
    assert.equal(source.locked, false);

    const afterComplete = new AbortController();
    let receivedId;
    await assert.rejects(consumeImageEventStream(stream(complete), (event) => {
        receivedId = event.data.figure.id;
        afterComplete.abort();
    }, afterComplete.signal), { name: "AbortError" });
    assert.equal(receivedId, figure.id);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { ChatStreamError, consumeChatEventStream } from "../lib/api/event-stream.mjs";

const saved = { answer: "Saved answer 🌍", citations: [], message_id: "assistant-1", user_message_id: "user-1" };
const encoder = new TextEncoder();
const frame = (event, data, newline = "\n") => `event: ${event}${newline}data: ${JSON.stringify(data)}${newline}${newline}`;
const finalFrame = frame("done", saved);

function stream(text, chunkSize = Infinity) {
    const bytes = encoder.encode(text);
    return new ReadableStream({
        start(controller) {
            for (let index = 0; index < bytes.length; index += chunkSize) controller.enqueue(bytes.slice(index, index + chunkSize));
            controller.close();
        },
    });
}

test("dispatches incremental events across every byte boundary, CRLF, and split UTF-8 characters", async () => {
    const seen = [];
    const source = stream(": heartbeat\r\n\r\n"
        + frame("status", { stage: "generating" }, "\r\n")
        + frame("token", { delta: "Hello 🌍" }, "\r\n")
        + frame("token", { delta: " नमस्ते" }, "\r\n")
        + frame("citations", { citations: [{ source_id: 1 }] }, "\r\n")
        + frame("done", saved, "\r\n"), 1);
    assert.deepEqual(await consumeChatEventStream(source, (event) => seen.push(event)), saved);
    assert.deepEqual(seen.map((item) => item.event), ["status", "token", "token", "citations", "done"]);
    assert.equal(seen.filter((item) => item.event === "token").map((item) => item.data.delta).join(""), "Hello 🌍 नमस्ते");
    assert.equal(source.locked, false);
});

test("handles multi-line data, bare CR, comments, extension fields, and unknown events", async () => {
    const seen = [];
    const source = stream("retry: 1000\rid: 12\r: keepalive\r\r"
        + "event: future-event\ndata: ignored non-JSON\n\n"
        + 'event: token\rdata: {"delta":\rdata: "Multiline"}\r\r'
        + finalFrame, 3);
    await consumeChatEventStream(source, (event) => seen.push(event));
    assert.deepEqual(seen.map((item) => item.event), ["token", "done"]);
    assert.equal(seen[0].data.delta, "Multiline");
});

test("passes resets and returns the canonical saved response rather than provisional text", async () => {
    const seen = [];
    const result = await consumeChatEventStream(stream(frame("token", { delta: "Draft" })
        + frame("reset", { reason: "revised" }) + frame("token", { delta: "Approved" }) + finalFrame),
    (event) => seen.push(event));
    assert.deepEqual(seen.map((item) => item.event), ["token", "reset", "token", "done"]);
    assert.deepEqual(result, saved);
});

test("propagates stream error status after partial output and releases the reader", async () => {
    const seen = [];
    const source = stream(frame("token", { delta: "Partial" }) + frame("error", { message: "History changed", status: 409 }));
    await assert.rejects(consumeChatEventStream(source, (event) => seen.push(event)), (error) =>
        error instanceof ChatStreamError && error.status === 409 && error.message === "History changed");
    assert.equal(seen.length, 1);
    assert.equal(source.locked, false);
});

test("rejects malformed JSON and malformed known event payloads", async () => {
    for (const malformed of [
        "event: token\ndata: broken\n\n", frame("token", { delta: 3 }), frame("status", {}),
        frame("citations", { citations: null }), frame("done", { answer: "incomplete" }), frame("reset", []),
        frame("done", { answer: "Unsaved reply", citations: [] }),
    ]) {
        await assert.rejects(consumeChatEventStream(stream(malformed + finalFrame), () => {}), ChatStreamError);
    }
});

test("rejects interrupted streams without promoting a partial answer to completion", async () => {
    for (const text of ["", frame("token", { delta: "Partial" }), finalFrame.trimEnd()]) {
        await assert.rejects(consumeChatEventStream(stream(text), () => {}), /ended before the reply was saved/);
    }
    await assert.rejects(consumeChatEventStream(null, () => {}), /unavailable/);
});

test("finishes on done and cancels a connection that remains open", async () => {
    let cancelled = false;
    const source = new ReadableStream({
        start(controller) { controller.enqueue(encoder.encode(finalFrame)); },
        cancel() { cancelled = true; },
    });
    assert.deepEqual(await consumeChatEventStream(source, () => {}), saved);
    assert.equal(cancelled, true);
    assert.equal(source.locked, false);
});

test("cancels a pending read on abort and releases the reader", async () => {
    let cancelled = false;
    const controller = new AbortController();
    const source = new ReadableStream({ cancel() { cancelled = true; } });
    const result = consumeChatEventStream(source, () => assert.fail("Unexpected event"), controller.signal);
    controller.abort();
    await assert.rejects(result, { name: "AbortError" });
    assert.equal(cancelled, true);
    assert.equal(source.locked, false);
});

test("a pre-aborted request never starts reading", async () => {
    const controller = new AbortController();
    controller.abort();
    const source = stream(finalFrame);
    await assert.rejects(consumeChatEventStream(source, () => {}, controller.signal), { name: "AbortError" });
    assert.equal(source.locked, false);
});

test("abort during an event does not emit subsequent events from the same chunk", async () => {
    const seen = [];
    const controller = new AbortController();
    const source = stream(frame("token", { delta: "First" }) + frame("token", { delta: "Second" }) + finalFrame);
    await assert.rejects(consumeChatEventStream(source, (event) => { seen.push(event); controller.abort(); }, controller.signal),
        { name: "AbortError" });
    assert.equal(seen.length, 1);
    assert.equal(source.locked, false);
});

test("propagates a transport failure and releases the reader", async () => {
    const source = new ReadableStream({ start(controller) { controller.error(new Error("Connection lost")); } });
    await assert.rejects(consumeChatEventStream(source, () => {}), /Connection lost/);
    assert.equal(source.locked, false);
});

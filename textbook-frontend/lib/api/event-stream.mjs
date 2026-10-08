export class ChatStreamError extends Error {
    constructor(message, status = 502) {
        super(message);
        this.name = "ChatStreamError";
        this.status = status;
    }
}

const eventNames = new Set(["status", "token", "citations", "reset", "done", "error"]);

function decodeEvent(event, rawData) {
    let data;
    try {
        data = JSON.parse(rawData);
    } catch {
        throw new ChatStreamError("The reply stream contained invalid JSON. Please retry.");
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new ChatStreamError("The reply stream contained an invalid event. Please retry.");
    }
    if (event === "error") {
        throw new ChatStreamError(typeof data.message === "string" ? data.message : "Could not finish the reply.",
            Number.isInteger(data.status) ? data.status : 500);
    }
    if ((event === "token" && typeof data.delta !== "string")
        || (event === "status" && typeof data.stage !== "string")
        || (event === "citations" && !Array.isArray(data.citations))
        || (event === "done" && (typeof data.answer !== "string" || !Array.isArray(data.citations)
            || typeof data.message_id !== "string" || typeof data.user_message_id !== "string"))) {
        throw new ChatStreamError("The reply stream contained an invalid event. Please retry.");
    }
    return { event, data };
}

/** Consume SSE without depending on fetch chunk or UTF-8 character boundaries. */
export async function consumeChatEventStream(body, onEvent, signal) {
    signal?.throwIfAborted();
    if (!body) throw new ChatStreamError("The reply stream is unavailable. Please retry.");
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let line = "";
    let event = "message";
    let dataLines = [];
    let afterCarriageReturn = false;
    let finalResponse;
    let ended = false;
    const cancel = () => { void reader.cancel().catch(() => undefined); };
    signal?.addEventListener("abort", cancel, { once: true });

    function processLine() {
        if (line === "") {
            if (dataLines.length && eventNames.has(event)) {
                const parsed = decodeEvent(event, dataLines.join("\n"));
                signal?.throwIfAborted();
                onEvent(parsed);
                signal?.throwIfAborted();
                if (event === "done") finalResponse = parsed.data;
            }
            event = "message";
            dataLines = [];
        } else if (!line.startsWith(":")) {
            const colon = line.indexOf(":");
            const field = colon < 0 ? line : line.slice(0, colon);
            let value = colon < 0 ? "" : line.slice(colon + 1);
            if (value.startsWith(" ")) value = value.slice(1);
            if (field === "event") event = value;
            if (field === "data") dataLines.push(value);
        }
        line = "";
    }

    function processText(text) {
        for (const character of text) {
            if (afterCarriageReturn && character === "\n") {
                afterCarriageReturn = false;
                continue;
            }
            afterCarriageReturn = character === "\r";
            if (character === "\n" || character === "\r") processLine();
            else line += character;
            // The done event is authoritative; do not wait for the connection to close.
            if (finalResponse !== undefined) break;
        }
    }

    try {
        while (finalResponse === undefined) {
            const { value, done } = await reader.read();
            signal?.throwIfAborted();
            if (done) {
                ended = true;
                processText(decoder.decode());
                break;
            }
            processText(decoder.decode(value, { stream: true }));
        }
        signal?.throwIfAborted();
        if (finalResponse === undefined) {
            throw new ChatStreamError("The reply stream ended before the reply was saved. Retry to recover it.");
        }
        return finalResponse;
    } finally {
        signal?.removeEventListener("abort", cancel);
        if (!ended) await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}

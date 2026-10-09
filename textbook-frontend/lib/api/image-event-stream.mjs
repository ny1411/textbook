export class ImageGenerationError extends Error {
    constructor(message, retryable = true) {
        super(message);
        this.name = "ImageGenerationError";
        this.retryable = retryable;
    }
}

const phases = new Set(["analyzing", "synthesizing", "rendering"]);
const invalid = () => new ImageGenerationError("The diagram response was unusable. Please retry.");
const text = (value, limit) => typeof value === "string" && value.trim().length > 0 && value.length <= limit;

/** Validate metadata before using it in a note, a URL, or a clipboard action. */
export function validateFigure(value, notebookId) {
    if (!value || typeof value !== "object" || Array.isArray(value)
        || !text(value.id, 128) || !/^[a-zA-Z0-9_-]+$/.test(value.id)
        || !text(value.notebook_id, 128) || (notebookId && value.notebook_id !== notebookId)
        || !text(value.caption, 1200) || !text(value.prompt, 1200)
        || value.media_type !== "image/png" || !text(value.model, 128)
        || !Number.isInteger(value.width) || value.width < 1 || value.width > 2048
        || !Number.isInteger(value.height) || value.height < 1 || value.height > 2048
        || !text(value.created_at, 64) || !Number.isFinite(Date.parse(value.created_at))) throw invalid();
    const source = value.source;
    if (source != null && (!text(source.document_id, 128)
        || (source.source_id != null && typeof source.source_id !== "number" && !text(source.source_id, 160))
        || (typeof source.source_id === "number" && !Number.isFinite(source.source_id))
        || (source.page_number != null && (!Number.isInteger(source.page_number) || source.page_number < 1 || source.page_number > 100000))
        || (source.document_name != null && !text(source.document_name, 4096))
        || (source.context_type != null && !["document", "saved_citation"].includes(source.context_type))
        || (source.excerpt != null && (typeof source.excerpt !== "string" || source.excerpt.length > 2400)))) throw invalid();
    return {
        id: value.id, notebook_id: value.notebook_id, caption: value.caption, prompt: value.prompt,
        media_type: value.media_type, width: value.width, height: value.height,
        model: value.model, created_at: value.created_at,
        ...(source ? { source: { document_id: source.document_id,
            ...(source.source_id != null ? { source_id: source.source_id } : {}),
            ...(source.page_number != null ? { page_number: source.page_number } : {}),
            ...(source.document_name != null ? { document_name: source.document_name } : {}),
            ...(source.context_type != null ? { context_type: source.context_type } : {}),
            ...(source.excerpt != null ? { excerpt: source.excerpt } : {}) } } : {}),
    };
}

/** Consume SSE across arbitrary fetch chunks, UTF-8 boundaries, and CR/LF delimiters. */
export async function consumeImageEventStream(body, onEvent, signal, notebookId) {
    signal?.throwIfAborted();
    if (!body) throw new ImageGenerationError("The diagram stream is unavailable. Please retry.");
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let line = "";
    let event = "message";
    let dataLines = [];
    let frameLength = 0;
    let afterCarriageReturn = false;
    let result;
    let ended = false;
    const cancel = () => { void reader.cancel().catch(() => undefined); };
    signal?.addEventListener("abort", cancel, { once: true });

    function processLine() {
        if (line === "") {
            if (dataLines.length && ["phase", "complete", "error"].includes(event)) {
                let data;
                try { data = JSON.parse(dataLines.join("\n")); } catch { throw invalid(); }
                if (!data || typeof data !== "object" || Array.isArray(data)) throw invalid();
                signal?.throwIfAborted();
                if (event === "error") throw new ImageGenerationError(
                    text(data.message, 500) ? data.message : "Could not generate the diagram. Please retry.",
                    data.retryable !== false,
                );
                if (event === "phase") {
                    if (!phases.has(data.phase)) throw invalid();
                    onEvent({ event: "phase", data: { phase: data.phase } });
                } else {
                    result = validateFigure(data.figure, notebookId);
                    // Deliver the ID immediately so a cancelled image fetch can dispose it.
                    onEvent({ event: "complete", data: { figure: result } });
                }
                signal?.throwIfAborted();
            }
            event = "message";
            dataLines = [];
            frameLength = 0;
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

    function processText(value) {
        for (const character of value) {
            if (++frameLength > 32_768) throw invalid();
            if (afterCarriageReturn && character === "\n") { afterCarriageReturn = false; continue; }
            afterCarriageReturn = character === "\r";
            if (character === "\r" || character === "\n") processLine();
            else line += character;
            if (result !== undefined) break;
        }
    }

    try {
        while (result === undefined) {
            const { value, done } = await reader.read();
            signal?.throwIfAborted();
            if (done) { ended = true; processText(decoder.decode()); break; }
            processText(decoder.decode(value, { stream: true }));
        }
        signal?.throwIfAborted();
        if (!result) throw new ImageGenerationError("The diagram stream ended before an image was ready. Please retry.");
        return result;
    } finally {
        signal?.removeEventListener("abort", cancel);
        if (!ended) await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}

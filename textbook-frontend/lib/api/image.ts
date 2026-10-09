import { apiClient, apiFetch, ApiError } from "./client";
import {
    consumeImageEventStream, ImageGenerationError, validateFigure,
    type ConceptFigure, type FigureSource, type ImageStreamEvent,
} from "./image-event-stream.mjs";
import type { StudioNote } from "@/stores/useTextbookStore";

export { ImageGenerationError };
export type { ConceptFigure, FigureSource, GenerationPhase } from "./image-event-stream.mjs";

export async function generateConceptDiagram(
    notebookId: string, prompt: string, source: FigureSource | undefined,
    onEvent: (event: ImageStreamEvent) => void, signal: AbortSignal,
): Promise<ConceptFigure> {
    if (!notebookId || !prompt.trim() || prompt.length > 1200 || (source?.excerpt?.length ?? 0) > 2400) {
        throw new ImageGenerationError("Enter a concept with at most 1,200 characters.", false);
    }
    let response: Response;
    try {
        response = await apiFetch("/api/image/generate", {
            method: "POST", headers: { Accept: "text/event-stream" }, signal,
            body: JSON.stringify({ notebook_id: notebookId, prompt: prompt.trim(), ...(source ? { source } : {}) }),
        });
    } catch (error) {
        if (error instanceof ApiError) throw new ImageGenerationError(
            error.status === 401 ? "Sign in again to generate a diagram."
                : error.status === 403 || error.status === 404 ? "This notebook or source is no longer available."
                    : error.status === 429 ? "Diagram generation is busy. Please try again shortly."
                        : error.status === 503 ? "Diagram generation is not configured. Please contact your administrator."
                            : "Could not start diagram generation. Please retry.",
            ![401, 403, 404, 503].includes(error.status),
        );
        throw error;
    }
    if (!response.headers.get("content-type")?.includes("text/event-stream")) {
        await response.body?.cancel();
        throw new ImageGenerationError("The diagram stream is unavailable. Please retry.");
    }
    return consumeImageEventStream(response.body, onEvent, signal, notebookId);
}

export async function listFigures(notebookId: string, signal?: AbortSignal): Promise<ConceptFigure[]> {
    const result = await apiClient<{ figures: unknown[] }>(`/api/image/figures?notebook_id=${encodeURIComponent(notebookId)}`, { signal });
    if (!Array.isArray(result.figures) || result.figures.length > 100) throw new Error("Saved figures could not be loaded. Please retry.");
    return result.figures.map((figure) => validateFigure(figure, notebookId));
}

export async function loadFigureImage(figure: ConceptFigure, signal?: AbortSignal): Promise<Blob> {
    const response = await apiFetch(`/api/image/${encodeURIComponent(figure.id)}?notebook_id=${encodeURIComponent(figure.notebook_id)}`, { signal });
    if (!response.headers.get("content-type")?.startsWith("image/png")) throw new Error("The figure image could not be loaded. Please retry.");
    const blob = await response.blob();
    if (!blob.size || blob.size > 8 * 1024 * 1024) throw new Error("The figure image could not be loaded. Please retry.");
    const signature = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
    if ([137, 80, 78, 71, 13, 10, 26, 10].some((byte, index) => signature[index] !== byte)) {
        throw new Error("The figure image could not be loaded. Please retry.");
    }
    return blob.slice(0, blob.size, "image/png");
}

export async function saveFigure(figure: ConceptFigure, caption: string, signal?: AbortSignal): Promise<ConceptFigure> {
    if (!caption.trim() || caption.length > 1200) throw new Error("Enter a caption with at most 1,200 characters.");
    const result = await apiClient<{ figure: unknown }>(`/api/image/${encodeURIComponent(figure.id)}/save`, {
        method: "POST", body: JSON.stringify({ notebook_id: figure.notebook_id, caption: caption.trim() }), signal,
    });
    return validateFigure(result.figure, figure.notebook_id);
}

export async function deleteFigure(figure: ConceptFigure, pendingOnly = false): Promise<void> {
    await apiFetch(`/api/image/${encodeURIComponent(figure.id)}?notebook_id=${encodeURIComponent(figure.notebook_id)}${pendingOnly ? "&pending_only=true" : ""}`, { method: "DELETE" });
}

/** Export durable figure metadata; authenticated image URLs are never stored in notes. */
export function figureAsNote(figure: ConceptFigure): StudioNote {
    return {
        id: `figure-${figure.id}`, title: "Concept diagram", content: figure.caption,
        createdAt: figure.created_at, updatedAt: figure.created_at,
        figure: { id: figure.id, model: figure.model, width: figure.width, height: figure.height,
            mediaType: figure.media_type, prompt: figure.prompt },
        ...(figure.source ? { sourceRef: { documentId: figure.source.document_id,
            sourceId: figure.source.source_id, pageNumber: figure.source.page_number,
            excerpt: figure.source.excerpt, documentName: figure.source.document_name,
            contextType: figure.source.context_type } } : {}),
    };
}

export type GenerationPhase = "analyzing" | "synthesizing" | "rendering";
export interface FigureSource {
    document_id: string;
    source_id?: string | number;
    page_number?: number;
    excerpt?: string;
    document_name?: string;
    context_type?: "document" | "saved_citation";
}
export interface ConceptFigure {
    id: string;
    notebook_id: string;
    caption: string;
    prompt: string;
    media_type: "image/png";
    width: number;
    height: number;
    model: string;
    created_at: string;
    source?: FigureSource;
}
export type ImageStreamEvent =
    | { event: "phase"; data: { phase: GenerationPhase } }
    | { event: "complete"; data: { figure: ConceptFigure } };
export class ImageGenerationError extends Error {
    constructor(message: string, retryable?: boolean);
    retryable: boolean;
}
export function validateFigure(value: unknown, notebookId?: string): ConceptFigure;
export function consumeImageEventStream(
    body: ReadableStream<Uint8Array> | null,
    onEvent: (event: ImageStreamEvent) => void,
    signal?: AbortSignal,
    notebookId?: string,
): Promise<ConceptFigure>;

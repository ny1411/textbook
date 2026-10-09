import type { AgentChatResponse, ChatIntent, CitationItem } from "@/types/api";

export type ChatStreamEvent =
    | { event: "status"; data: { stage: string } }
    | { event: "token"; data: { delta: string } }
    | { event: "citations"; data: { citations: CitationItem[]; intent?: ChatIntent; is_grounded?: boolean | null; warning?: string | null } }
    | { event: "reset"; data: { reason?: string } }
    | { event: "done"; data: AgentChatResponse };

export class ChatStreamError extends Error {
    constructor(message: string, status?: number);
    status: number;
}

export function consumeChatEventStream(
    body: ReadableStream<Uint8Array> | null,
    onEvent: (event: ChatStreamEvent) => void,
    signal?: AbortSignal,
): Promise<AgentChatResponse>;

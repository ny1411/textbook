import { ApiError, apiClient, apiFetch } from "./client";
import { ChatRequest, ChatResponse, AgentChatResponse } from "@/types/api";
import { ChatStreamError, consumeChatEventStream, type ChatStreamEvent } from "./event-stream.mjs";

export type { ChatStreamEvent } from "./event-stream.mjs";

async function sendStreamingMessage(
    endpoint: string,
    payload: ChatRequest,
    signal: AbortSignal | undefined,
    onEvent: (event: ChatStreamEvent) => void,
): Promise<AgentChatResponse> {
    const response = await apiFetch(endpoint, {
        method: "POST",
        headers: { Accept: "text/event-stream" },
        body: JSON.stringify(payload),
        signal,
    });
    // Retain compatibility with servers returning a saved response as JSON.
    if (response.headers.get("Content-Type")?.includes("application/json")) return response.json();
    if (!response.headers.get("Content-Type")?.includes("text/event-stream")) {
        throw new ApiError(502, "The server did not return a reply stream. Please retry.");
    }
    try {
        return await consumeChatEventStream(response.body, onEvent, signal);
    } catch (error) {
        if (error instanceof ChatStreamError) throw new ApiError(error.status, error.message);
        throw error;
    }
}

export async function sendChatMessage(
    payload: ChatRequest,
    signal?: AbortSignal,
    onEvent?: (event: ChatStreamEvent) => void,
): Promise<ChatResponse> {
    if (onEvent) return sendStreamingMessage("/api/chat", payload, signal, onEvent);
    return apiClient<ChatResponse>("/api/chat", {
        method: "POST",
        body: JSON.stringify(payload),
        signal,
    });
}

export async function sendAgentChatMessage(
    payload: ChatRequest,
    signal?: AbortSignal,
    onEvent?: (event: ChatStreamEvent) => void,
): Promise<AgentChatResponse> {
    if (onEvent) return sendStreamingMessage("/api/agent/chat", payload, signal, onEvent);
    return apiClient<AgentChatResponse>("/api/agent/chat", {
        method: "POST",
        body: JSON.stringify(payload),
        signal,
    });
}

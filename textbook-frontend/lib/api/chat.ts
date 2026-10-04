import { apiClient } from "./client";
import { ChatRequest, ChatResponse, AgentChatResponse } from "@/types/api";

export async function sendChatMessage(
    payload: ChatRequest,
    signal?: AbortSignal,
): Promise<ChatResponse> {
    return apiClient<ChatResponse>("/api/chat", {
        method: "POST",
        body: JSON.stringify(payload),
        signal,
    });
}

export async function sendAgentChatMessage(
    payload: ChatRequest,
    signal?: AbortSignal,
): Promise<AgentChatResponse> {
    return apiClient<AgentChatResponse>("/api/agent/chat", {
        method: "POST",
        body: JSON.stringify(payload),
        signal,
    });
}

import { apiClient } from "./client";
import type { AgentChatResponse, ChatAttachment } from "@/types/api";
import type { ChatMessageItem } from "@/types/chat";
import type { SourceDocument } from "@/types/source";

export interface Notebook { id: string; name: string }
export interface Conversation { id: string; notebook_id: string; title: string; updated_at: string }
export interface Page<T> { items: T[]; next_offset: number | null }
interface SavedMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    attachments?: ChatAttachment[];
    created_at: string;
    response?: AgentChatResponse | null;
    is_agent_mode: boolean;
}

export function getNotebooks(signal?: AbortSignal) {
    return apiClient<Notebook[]>("/api/notebooks", { signal });
}

export function getConversations(notebookId: string, signal?: AbortSignal, offset = 0) {
    return apiClient<Page<Conversation>>(`/api/conversations?notebook_id=${encodeURIComponent(notebookId)}&offset=${offset}`, { signal });
}

export function createConversation(notebookId: string, signal?: AbortSignal, id = crypto.randomUUID()) {
    return apiClient<Conversation>("/api/conversations", {
        method: "POST", body: JSON.stringify({ notebook_id: notebookId, id }), signal,
    });
}

export async function getMessages(id: string, signal?: AbortSignal, before?: number) {
    const query = before === undefined ? "" : `?before=${before}`;
    const page = await apiClient<{ items: SavedMessage[]; next_before: number | null }>(
        `/api/conversations/${encodeURIComponent(id)}/messages${query}`, { signal });
    return { items: page.items.map((message): ChatMessageItem => ({
        id: message.id, role: message.role, content: message.content, createdAt: new Date(message.created_at),
        attachments: message.attachments,
        appliedQuery: message.response?.applied_query, intent: message.response?.intent,
        warning: message.response?.warning, citations: message.response?.citations,
        isAgentMode: message.is_agent_mode,
        agentMetadata: message.is_agent_mode ? {
            confidence_score: message.response?.confidence_score, is_grounded: message.response?.is_grounded,
            critique: message.response?.critique, iterationCount: message.response?.iteration_count,
        } : undefined,
    })), next_before: page.next_before,
        completedRequestIds: page.items.flatMap((message) => message.role === "assistant" && message.response?.request_id
            ? [message.response.request_id] : []),
    };
}

export async function getSources(notebookId: string, signal?: AbortSignal) {
    const sources: SourceDocument[] = [];
    let offset: number | null = 0;
    do {
        const page: Page<Omit<SourceDocument, "uploadedAt"> & { uploadedAt?: string }> = await apiClient(`/api/documents?notebook_id=${encodeURIComponent(notebookId)}&offset=${offset}`, { signal });
        sources.push(...page.items.map((source) => ({ ...source, uploadedAt: source.uploadedAt ? new Date(source.uploadedAt) : undefined })));
        offset = page.next_offset;
    } while (offset !== null);
    return sources;
}

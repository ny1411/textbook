import { apiClient } from "./client";
import { ConversationThread, StoredMessage } from "@/types/chat";

export const getDefaultNotebook = () => apiClient<{ id: string; name: string }>("/api/notebooks/default");

export const listConversations = (notebookId: string, before?: string) =>
    apiClient<{ conversations: ConversationThread[]; next_cursor: string | null }>(
        `/api/conversations?notebook_id=${encodeURIComponent(notebookId)}${before ? `&before=${before}` : ""}`);

export const createConversation = (notebookId: string) =>
    apiClient<ConversationThread>("/api/conversations", {
        method: "POST", body: JSON.stringify({ notebook_id: notebookId }),
    });

export const renameConversation = (id: string, title: string) =>
    apiClient<ConversationThread>(`/api/conversations/${id}`, {
        method: "PATCH", body: JSON.stringify({ title }),
    });

export const deleteConversation = (id: string) =>
    apiClient<void>(`/api/conversations/${id}`, { method: "DELETE" });

export const listMessages = (id: string, before?: number) =>
    apiClient<{ messages: StoredMessage[]; next_cursor: number | null }>(
        `/api/conversations/${id}/messages${before !== undefined ? `?before=${before}` : ""}`);

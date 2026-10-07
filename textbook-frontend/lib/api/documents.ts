import { apiClient } from "./client";

export function deleteDocument(documentId: string, notebookId: string) {
    const query = new URLSearchParams({ document_id: documentId, notebook_id: notebookId });
    return apiClient<{ document_id: string; notebook_id: string; deleted: boolean }>(`/api/documents?${query}`, {
        method: "DELETE",
    });
}

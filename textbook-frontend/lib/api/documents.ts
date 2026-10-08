import { apiClient } from "./client";
import type { SourceDocument } from "@/types/source";

export async function loadSampleTextbook(notebookId: string, signal?: AbortSignal): Promise<SourceDocument> {
    const result = await apiClient<{ source: Omit<SourceDocument, "uploadedAt"> & { uploadedAt?: string } }>("/api/documents/sample", {
        method: "POST", body: JSON.stringify({ notebook_id: notebookId }), signal,
    });
    return { ...result.source, uploadedAt: result.source.uploadedAt ? new Date(result.source.uploadedAt) : undefined };
}

export function deleteDocument(documentId: string, notebookId: string) {
    const query = new URLSearchParams({ document_id: documentId, notebook_id: notebookId });
    return apiClient<{ document_id: string; notebook_id: string; deleted: boolean }>(`/api/documents?${query}`, {
        method: "DELETE",
    });
}

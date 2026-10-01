import { apiClient } from "./client";
import { UploadResponse } from "@/types/api";

export async function uploadDocument(
    userId: string,
    file: File,
    notebookId?: string,
): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append("file", file);

    const query = new URLSearchParams({ userId });
    if (notebookId) query.set("notebookId", notebookId);

    return apiClient<UploadResponse>(`/api/upload?${query.toString()}`, {
        method: "POST",
        body: formData,
    });
}

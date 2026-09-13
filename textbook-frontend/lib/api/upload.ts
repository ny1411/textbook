import { apiClient } from "./client";
import { UploadResponse } from "@/types/api";

export async function uploadDocument(
    userId: string,
    file: File,
): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append("file", file);

    const query = new URLSearchParams({ userId }).toString();

    return apiClient<UploadResponse>(`/api/upload/?${query}`, {
        method: "POST",
        body: formData,
    });
}
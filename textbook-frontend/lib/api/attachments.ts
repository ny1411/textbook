import { createClient } from "@/lib/supabase/client";
import type { ChatAttachment } from "@/types/api";
import { ApiError, apiFetch } from "./client";

export const MAX_CHAT_IMAGES = 4;
export const MAX_CHAT_IMAGE_BYTES = 10 * 1024 * 1024;
export const CHAT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const CHAT_IMAGE_ACCEPT = {
    "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/webp": [".webp"],
};

export async function uploadChatImage(file: File, conversationId: string, uploadId: string,
    onProgress: (progress: number) => void, signal: AbortSignal): Promise<ChatAttachment> {
    const { data, error } = await createClient().auth.getSession();
    if (error || !data.session) throw new ApiError(401, "Your session has expired; sign in again.");
    if (signal.aborted) throw new DOMException("Upload cancelled", "AbortError");
    const form = new FormData();
    form.append("file", file);
    form.append("conversation_id", conversationId);
    form.append("upload_id", uploadId);
    return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        const abort = () => request.abort();
        const finish = () => signal.removeEventListener("abort", abort);
        request.open("POST", "/api/chat/attachments");
        request.setRequestHeader("Authorization", `Bearer ${data.session!.access_token}`);
        request.responseType = "json";
        request.timeout = 120_000;
        request.upload.onprogress = (event) => {
            if (event.lengthComputable) onProgress(Math.min(99, Math.round(event.loaded / event.total * 100)));
        };
        request.onload = () => {
            finish();
            if (request.status >= 200 && request.status < 300) {
                onProgress(100);
                resolve(request.response as ChatAttachment);
            } else {
                const detail = request.response?.detail;
                reject(new ApiError(request.status, typeof detail === "string" ? detail : "Could not upload this image."));
            }
        };
        request.onerror = () => { finish(); reject(new Error("Connection lost. Retry the image upload.")); };
        request.ontimeout = () => { finish(); reject(new Error("Image upload timed out. Please retry.")); };
        request.onabort = () => { finish(); reject(new DOMException("Upload cancelled", "AbortError")); };
        signal.addEventListener("abort", abort, { once: true });
        request.send(form);
    });
}

export async function deleteChatImage(id: string) {
    await apiFetch(`/api/chat/attachments/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getChatImage(id: string, signal: AbortSignal) {
    const response = await apiFetch(`/api/chat/attachments/${encodeURIComponent(id)}/content`, { signal });
    return response.blob();
}

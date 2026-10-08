import { apiFetch } from "./client";

export async function synthesizeSpeech(notebookId: string, text: string, signal: AbortSignal) {
    const response = await apiFetch("/api/voice/synthesize", {
        method: "POST", body: JSON.stringify({ notebook_id: notebookId, text }), signal,
    });
    const blob = await response.blob();
    if (!blob.size || !blob.type.startsWith("audio/")) throw new Error("The voice service returned unusable audio. Please retry.");
    return blob;
}


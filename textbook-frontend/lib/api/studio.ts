import { apiClient } from "./client";

export interface AudioOverviewResult {
    turns: { speaker: "Host" | "Guest"; text: string; source_ids: number[] }[];
    sources: { id: number; document_id: string; name: string }[];
    audio_base64: string;
    media_type: string;
    duration_seconds: number;
    voices: { Host: string; Guest: string };
}

export async function generateAudioOverview(notebookId: string, documentIds: string[], signal: AbortSignal) {
    const result = await apiClient<AudioOverviewResult>("/api/studio/audio-overview", {
        method: "POST", body: JSON.stringify({ notebook_id: notebookId, document_ids: documentIds }), signal,
    });
    if (result.media_type !== "audio/wav" || !result.audio_base64 || result.audio_base64.length > 28_000_000
        || !Number.isFinite(result.duration_seconds) || result.duration_seconds <= 0) {
        throw new Error("Audio Overview returned unusable audio. Please retry.");
    }
    const binary = atob(result.audio_base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF") throw new Error("Audio Overview returned unusable audio. Please retry.");
    const { audio_base64: discardedAudio, ...overview } = result;
    void discardedAudio;
    return { ...overview, blob: new Blob([bytes], { type: "audio/wav" }) };
}

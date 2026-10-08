"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useTextbookStore } from "@/stores/useTextbookStore";
import { useUserStore } from "@/stores/useUserStore";

export interface PlaybackSource { id: string; title: string; text?: string; recording?: Blob }
interface PlaybackContext {
    source: PlaybackSource | null;
    start: (source: PlaybackSource) => void;
    stop: () => void;
}
const Context = createContext<PlaybackContext | null>(null);

export function VoicePlaybackProvider({ children }: { children: ReactNode }) {
    const userId = useUserStore((state) => state.userId);
    const notebookId = useTextbookStore((state) => state.activeNotebookId);
    return <PlaybackSession key={`${userId}:${notebookId}`}>{children}</PlaybackSession>;
}

function PlaybackSession({ children }: { children: ReactNode }) {
    const [source, setSource] = useState<PlaybackSource | null>(null);
    const start = useCallback((next: PlaybackSource) => setSource(next), []);
    const stop = useCallback(() => setSource(null), []);
    const value = useMemo(() => ({ source, start, stop }), [source, start, stop]);
    return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useVoicePlayback() {
    const context = useContext(Context);
    if (!context) throw new Error("Voice playback requires VoicePlaybackProvider");
    return context;
}

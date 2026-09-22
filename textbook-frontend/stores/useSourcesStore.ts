import { create } from "zustand";
import type { IngestionStatus, SourceDocument } from "@/types/source";

interface SourceState {
    source: SourceDocument[];
    addSource: (source: SourceDocument) => void;
    removeSource: (filepath: string) => void;
    updateSourceStatus: (documentId: string, status: IngestionStatus, error?: string) => void;
}

export const useSourceStore = create<SourceState>((set) => ({
    source: [],
    addSource: (newSource) =>
        set((state) => ({ source: [newSource, ...state.source] })),
    removeSource: (filepath: string) =>
        set((state) => ({ source: state.source.filter((s) => s.filepath !== filepath) })),
    updateSourceStatus: ((documentId, status, error) => {
        set((state) => ({
            source: state.source.map((s) => s.documentId === documentId ? { ...s, status, error } : s)
        }))
    })
}));
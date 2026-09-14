import { create } from "zustand";
import type { SourceDocument } from "@/types/source";

interface SourceState {
    source: SourceDocument[];
    addSource: (source: SourceDocument) => void;
    removeSource: (filepath: string) => void;
}

export const useSourceStore = create<SourceState>((set) => ({
    source: [],
    addSource: (newSource) =>
        set((state) => ({ source: [newSource, ...state.source] })),
    removeSource: (filepath: string) =>
        set((state) => ({ source: state.source.filter((s) => s.filepath !== filepath) }))
}));
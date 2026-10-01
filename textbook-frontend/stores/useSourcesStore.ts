import { create } from "zustand";
import type { IngestionStatus, SourceDocument } from "@/types/source";

const getSelectableDocumentIds = (sources: SourceDocument[]) =>
    sources.flatMap((source) =>
        source.documentId && source.status !== "failed" ? [source.documentId] : []
    );

interface SourceState {
    source: SourceDocument[];
    selectedDocumentIds: string[] | null;
    addSource: (source: SourceDocument) => void;
    removeSource: (filepath: string) => void;
    updateSourceStatus: (documentId: string, status: IngestionStatus, error?: string) => void;
    toggleSourceSelection: (documentId: string) => void;
    selectAllSources: () => void;
    deselectAllSources: () => void;
}

export const useSourceStore = create<SourceState>((set) => ({
    source: [],
    selectedDocumentIds: null,
    addSource: (newSource) =>
        set((state) => ({
            source: [newSource, ...state.source],
            selectedDocumentIds:
                state.selectedDocumentIds !== null && newSource.documentId
                    ? [...state.selectedDocumentIds, newSource.documentId]
                    : state.selectedDocumentIds,
        })),
    removeSource: (filepath: string) =>
        set((state) => {
            const removedSource = state.source.find((s) => s.filepath === filepath);
            const remainingSources = state.source.filter((s) => s.filepath !== filepath);
            const remainingDocumentIds = getSelectableDocumentIds(remainingSources);
            const selectedDocumentIds = state.selectedDocumentIds?.filter(
                (documentId) => documentId !== removedSource?.documentId
            ) ?? null;

            return {
                source: remainingSources,
                selectedDocumentIds:
                    selectedDocumentIds?.length === remainingDocumentIds.length
                        ? null
                        : selectedDocumentIds,
            };
        }),
    updateSourceStatus: ((documentId, status, error) => {
        set((state) => {
            const source = state.source.map((item) =>
                item.documentId === documentId ? { ...item, status, error } : item
            );
            const selectedDocumentIds = status === "failed" && state.selectedDocumentIds !== null
                ? state.selectedDocumentIds.filter((id) => id !== documentId)
                : state.selectedDocumentIds;

            return {
                source,
                selectedDocumentIds:
                    selectedDocumentIds?.length === getSelectableDocumentIds(source).length
                        ? null
                        : selectedDocumentIds,
            };
        })
    }),
    toggleSourceSelection: (documentId) =>
        set((state) => {
            const allDocumentIds = getSelectableDocumentIds(state.source);
            const currentSelection = state.selectedDocumentIds ?? allDocumentIds;
            const nextSelection = currentSelection.includes(documentId)
                ? currentSelection.filter((id) => id !== documentId)
                : [...currentSelection, documentId];

            return {
                selectedDocumentIds:
                    nextSelection.length === allDocumentIds.length ? null : nextSelection,
            };
        }),
    selectAllSources: () => set({ selectedDocumentIds: null }),
    deselectAllSources: () => set({ selectedDocumentIds: [] }),
}));

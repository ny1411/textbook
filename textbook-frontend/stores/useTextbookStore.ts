import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware"
import { CitationItem } from "@/types/api";

export interface StudioNote {
    id: string;
    title?: string;
    content: string;
    sourceRef?: {
        sourceId?: string | number;
        documentId?: string | null;
        pageNumber?: number | null;
        excerpt?: string | null;
        url?: string | null;
    };
    createdAt: string;
    updatedAt: string;
}

interface TextbookStore {
    activeCitation: CitationItem | null;
    setActiveCitation: (citation: CitationItem | null) => void;

    activeStudioTab: "citation" | "notes" | "metrics";
    setActiveStudioTab: (tab: "citation" | "notes" | "metrics") => void;

    isInspectorOpen: boolean;
    setInspectorOpen: (open: boolean) => void;

    notes: StudioNote[];
    addNote: (content: string, sourceRef?: StudioNote["sourceRef"], title?: string) => void;
    updateNote: (id: string, content: string, title?: string) => void;
    deleteNote: (id: string) => void;
    clearNotes: () => void;
}

export const useTextbookStore = create<TextbookStore>()(
    // create persistent storage
    persist(
        (set) => ({
            activeCitation: null,
            setActiveCitation: (citation) => set({
                activeCitation: citation,
                activeStudioTab: citation ? "citation" : "notes",
            }),
            activeStudioTab: "notes",
            setActiveStudioTab: (tab) => set({ activeStudioTab: tab }),

            isInspectorOpen: false,
            setInspectorOpen: (open) => set({ isInspectorOpen: open }),

            notes: [],
            addNote: (content, sourceRef, title) => set((state) => ({
                notes: [
                    {
                        id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                        title: title || (sourceRef ? `Note on source [${sourceRef.sourceId}]` : `Scratch Note`),
                        content,
                        sourceRef,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    },
                    ...state.notes,
                ]
            })),

            updateNote: (id, content, title) => set((state) => ({
                notes: state.notes.map((note) => note.id === id ? {
                    ...note,
                    content,
                    ...(title !== undefined ? { title } : {}),
                    updatedAt: new Date().toISOString(),
                }
                    : note
                ),
            })),

            deleteNote: (id) => set((state) => ({
                notes: state.notes.filter((note) => note.id !== id),
            })),

            clearNotes: () => set({ notes: [] }),
        }),
        {
            name: "textbook-notebook-storage",
            storage: createJSONStorage(() => localStorage),

            // store persist notes and studio tab in local storage, not citation selections
            partialize: (state) => ({
                notes: state.notes,
                activeStudioTab: state.activeStudioTab,
            }),
        }
    )
);
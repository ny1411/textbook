import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware"
import type { CitationItem } from "@/types/api";

export interface StudioNote {
    id: string;
    title?: string;
    content: string;
    // Server-loaded figures are combined with private text notes for display/export.
    // Image bytes and ephemeral URLs must never enter persisted note storage.
    figure?: {
        id: string;
        model: string;
        mediaType: "image/png";
        width: number;
        height: number;
        prompt: string;
    };
    sourceRef?: {
        sourceId?: string | number;
        documentId?: string | null;
        documentName?: string;
        contextType?: "document" | "saved_citation";
        pageNumber?: number | null;
        excerpt?: string | null;
        url?: string | null;
    };
    createdAt: string;
    updatedAt: string;
}

interface TextbookStore {
    workspaceUserId: string | null;
    setWorkspaceUserId: (userId: string | null) => void;
    activeNotebookId: string;
    setActiveNotebookId: (notebookId: string) => void;

    activeCitation: CitationItem | null;
    setActiveCitation: (citation: CitationItem | null) => void;

    activeStudioTab: "citation" | "notes" | "metrics";
    setActiveStudioTab: (tab: "citation" | "notes" | "metrics") => void;

    isInspectorOpen: boolean;
    setInspectorOpen: (open: boolean) => void;

    notes: StudioNote[];
    notesByWorkspace: Record<string, StudioNote[]>;
    activeNotebookByUser: Record<string, string>;
    // Old global notes have no reliable owner; preserve them without displaying
    // them in an authenticated workspace or assigning them to another account.
    legacyNotes: StudioNote[];
    addNote: (content: string, sourceRef?: StudioNote["sourceRef"], title?: string) => void;
    updateNote: (id: string, content: string, title?: string) => void;
    deleteNote: (id: string) => void;
    clearNotes: () => void;
}

const workspaceKey = (userId: string, notebookId: string) => JSON.stringify([userId, notebookId]);

function updateNotes(state: TextbookStore, update: (notes: StudioNote[]) => StudioNote[]) {
    if (!state.workspaceUserId || !state.activeNotebookId) return {};
    const notes = update(state.notes);
    return { notes, notesByWorkspace: {
        ...state.notesByWorkspace,
        [workspaceKey(state.workspaceUserId, state.activeNotebookId)]: notes,
    } };
}

type SavedWorkspace = Pick<TextbookStore, "notesByWorkspace" | "activeNotebookByUser" | "legacyNotes">;

export const useTextbookStore = create<TextbookStore>()(
    // create persistent storage
    persist(
        (set) => ({
            workspaceUserId: null,
            setWorkspaceUserId: (workspaceUserId) => set((state) => {
                if (workspaceUserId === state.workspaceUserId) return {};
                const activeNotebookId = workspaceUserId ? state.activeNotebookByUser[workspaceUserId] ?? "" : "";
                return { workspaceUserId, activeNotebookId,
                    notes: workspaceUserId && activeNotebookId ? state.notesByWorkspace[workspaceKey(workspaceUserId, activeNotebookId)] ?? [] : [],
                    activeCitation: null, isInspectorOpen: false, activeStudioTab: "notes" };
            }),
            activeNotebookId: "",
            setActiveNotebookId: (activeNotebookId) => set((state) => {
                if (!state.workspaceUserId || activeNotebookId === state.activeNotebookId) return {};
                return { activeNotebookId,
                    activeNotebookByUser: { ...state.activeNotebookByUser, [state.workspaceUserId]: activeNotebookId },
                    notes: activeNotebookId ? state.notesByWorkspace[workspaceKey(state.workspaceUserId, activeNotebookId)] ?? [] : [],
                    activeCitation: null, isInspectorOpen: false, activeStudioTab: "notes" };
            }),
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
            notesByWorkspace: {},
            activeNotebookByUser: {},
            legacyNotes: [],
            addNote: (content, sourceRef, title) => set((state) => updateNotes(state, (notes) => [
                    {
                        id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                        title: title || (sourceRef ? `Note on source [${sourceRef.sourceId}]` : `Scratch Note`),
                        content,
                        sourceRef,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    },
                    ...notes,
                ])),

            updateNote: (id, content, title) => set((state) => updateNotes(state, (notes) =>
                notes.map((note) => note.id === id ? {
                    ...note,
                    content,
                    ...(title !== undefined ? { title } : {}),
                    updatedAt: new Date().toISOString(),
                }
                    : note
                )
            )),

            deleteNote: (id) => set((state) => updateNotes(state, (notes) => notes.filter((note) => note.id !== id))),

            clearNotes: () => set((state) => updateNotes(state, () => [])),
        }),
        {
            name: "textbook-notebook-storage",
            storage: createJSONStorage(() => localStorage),

            version: 1,
            // Identity and visible notes are derived only after verified sign-in.
            partialize: (state): SavedWorkspace => ({
                notesByWorkspace: state.notesByWorkspace,
                activeNotebookByUser: state.activeNotebookByUser,
                legacyNotes: state.legacyNotes,
            }),
            migrate: (saved): SavedWorkspace => ({
                notesByWorkspace: {}, activeNotebookByUser: {},
                legacyNotes: Array.isArray((saved as { notes?: unknown })?.notes)
                    ? (saved as { notes: StudioNote[] }).notes : [],
            }),
            merge: (saved, state) => {
                const persisted = saved as Partial<SavedWorkspace> | undefined;
                const notesByWorkspace = { ...persisted?.notesByWorkspace, ...state.notesByWorkspace };
                const activeNotebookByUser = { ...persisted?.activeNotebookByUser, ...state.activeNotebookByUser };
                const activeNotebookId = state.workspaceUserId
                    ? state.activeNotebookId || activeNotebookByUser[state.workspaceUserId] || "" : "";
                return { ...state, notesByWorkspace, activeNotebookByUser,
                    legacyNotes: persisted?.legacyNotes ?? state.legacyNotes, activeNotebookId,
                    notes: state.workspaceUserId && activeNotebookId
                        ? notesByWorkspace[workspaceKey(state.workspaceUserId, activeNotebookId)] ?? [] : [] };
            },
        }
    )
);

"use client";
import { useEffect, useState } from "react";
import { getNotebooks, getSources, type Notebook } from "@/lib/api/conversations";
import { useUserStore } from "@/stores/useUserStore";
import { useTextbookStore } from "@/stores/useTextbookStore";
import { useSourceStore } from "@/stores/useSourcesStore";

export function useOwnedWorkspace() {
    const userId = useUserStore((state) => state.userId);
    const authenticated = useUserStore((state) => state.isAuthenticated);
    const notebookId = useTextbookStore((state) => state.activeNotebookId);
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState<{ owner: string; notebooks: Notebook[]; error?: string }>({ owner: "", notebooks: [] });
    const [sourceState, setSourceState] = useState<{ scope: string; error?: string }>({ scope: "" });
    const scope = `${userId}:${notebookId}:${attempt}`;

    useEffect(() => {
        if (!authenticated) return;
        const controller = new AbortController();
        getNotebooks(controller.signal).then((notebooks) => {
            if (controller.signal.aborted) return;
            const current = useTextbookStore.getState().activeNotebookId;
            useTextbookStore.getState().setActiveNotebookId(notebooks.find((item) => item.id === current)?.id ?? notebooks[0]?.id ?? "");
            setState({ owner: userId, notebooks });
        }).catch(() => {
            if (!controller.signal.aborted) setState({ owner: userId, notebooks: [], error: "Could not load your notebooks." });
        });
        return () => controller.abort();
    }, [userId, authenticated, attempt]);

    const notebooks = state.owner === userId ? state.notebooks : [];
    const ownedNotebook = notebooks.some((item) => item.id === notebookId);
    useEffect(() => {
        if (!authenticated || !ownedNotebook) return;
        const controller = new AbortController();
        useSourceStore.getState().replaceSources([]);
        useTextbookStore.getState().setActiveCitation(null);
        getSources(notebookId, controller.signal).then((sources) => {
            if (controller.signal.aborted) return;
            useSourceStore.getState().replaceSources(sources);
            setSourceState({ scope });
        }).catch(() => {
            if (!controller.signal.aborted) setSourceState({ scope, error: "Could not restore your sources." });
        });
        return () => controller.abort();
    }, [authenticated, ownedNotebook, notebookId, scope]);

    const error = state.owner === userId ? state.error : undefined;
    const sourceError = sourceState.scope === scope ? sourceState.error : undefined;
    return { userId, authenticated, notebookId, notebooks, error: error ?? sourceError,
        ready: authenticated && ownedNotebook && sourceState.scope === scope && !sourceError,
        retry: () => setAttempt((value) => value + 1) };
}

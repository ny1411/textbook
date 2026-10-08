"use client";

import { BookOpen, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { loadSampleTextbook } from "@/lib/api/documents";
import { useSourceStore } from "@/stores/useSourcesStore";
import { useTextbookStore } from "@/stores/useTextbookStore";
import { useUserStore } from "@/stores/useUserStore";

export const SAMPLE_KEY = "ai-engineering-v1";

export function SampleTextbookLoader({ userId, notebookId }: { userId: string; notebookId: string }) {
    const sources = useSourceStore((state) => state.source);
    const scoped = sources.filter((source) => source.userId === userId && source.notebookId === notebookId);
    const sample = scoped.find((source) => source.sampleKey === SAMPLE_KEY);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const controller = useRef<AbortController | null>(null);
    const busy = useRef(false);
    const isCurrent = () => useUserStore.getState().userId === userId && useTextbookStore.getState().activeNotebookId === notebookId;

    useEffect(() => () => controller.current?.abort(), []);

    useEffect(() => {
        if (!sample?.documentId || sample.status !== "processing" || sample.deletionPending) return;
        const documentId = sample.documentId;
        const abort = new AbortController();
        let timer: ReturnType<typeof setTimeout>;
        const check = async () => {
            try {
                const data = await apiClient<{ status: "processing" | "ready" | "failed"; deletion_pending?: boolean }>(
                    `/api/documents/${documentId}/status`, { signal: abort.signal });
                if (abort.signal.aborted || useUserStore.getState().userId !== userId ||
                    useTextbookStore.getState().activeNotebookId !== notebookId) return;
                if (data.deletion_pending) useSourceStore.getState().markDeletionPending(documentId);
                else {
                    useSourceStore.getState().updateSourceStatus(documentId, data.status);
                    if (data.status === "ready") useSourceStore.getState().selectSource(documentId);
                }
                setError(null);
            } catch {
                if (!abort.signal.aborted) setError("Could not check sample progress. Retry sample loading.");
            } finally {
                if (!abort.signal.aborted) timer = setTimeout(check, 2000);
            }
        };
        timer = setTimeout(check, 1000);
        return () => { abort.abort(); clearTimeout(timer); };
    }, [sample?.documentId, sample?.status, sample?.deletionPending, userId, notebookId]);

    const load = async () => {
        if (busy.current) return;
        busy.current = true;
        const abort = new AbortController();
        controller.current = abort;
        setLoading(true);
        setError(null);
        try {
            const source = await loadSampleTextbook(notebookId, abort.signal);
            if (abort.signal.aborted || !isCurrent()) return;
            useSourceStore.getState().upsertSource(source);
            if (source.status === "ready" && source.documentId) useSourceStore.getState().selectSource(source.documentId);
        } catch (cause) {
            if (!abort.signal.aborted && isCurrent()) setError(cause instanceof Error ? cause.message : "Could not load the sample. Please retry.");
        } finally {
            if (!abort.signal.aborted) {
                busy.current = false;
                setLoading(false);
            }
        }
    };

    if ((scoped.length > 0 && !sample) || sample?.status === "ready" || sample?.deletionPending) return null;
    return (
        <div className="mx-auto mb-6 max-w-2xl rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-left">
            <BookOpen size={20} className="mb-2 text-indigo-400" />
            <p className="text-sm font-medium text-zinc-200">Start with a sample textbook</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">Explore RAG, hybrid search, and evaluation. Ask a question, inspect its citations, then save an answer to Studio.</p>
            {sample?.status === "processing" ? <p role="status" className="mt-3 flex items-center gap-2 text-xs text-indigo-300"><LoaderCircle size={14} className="animate-spin" />Indexing the sample…</p> : null}
            {sample?.status === "failed" ? <p role="alert" className="mt-3 text-xs text-amber-300">Sample indexing failed. Retry to finish loading it.</p> : null}
            {error ? <p role="alert" className="mt-3 text-xs text-amber-300">{error}</p> : null}
            <button type="button" onClick={() => void load()} disabled={loading}
                className="mt-3 w-full rounded-xl bg-indigo-500 px-3 py-2.5 text-xs font-medium text-white transition-colors hover:bg-indigo-400 disabled:cursor-wait disabled:opacity-60">
                {loading ? "Loading sample textbook…" : sample || error ? "Retry sample loading" : "Load Sample AI Engineering Textbook"}
            </button>
            <p className="mt-2 text-[11px] text-zinc-500">Original CC0 sample · No file needed · Remove it anytime</p>
        </div>
    );
}

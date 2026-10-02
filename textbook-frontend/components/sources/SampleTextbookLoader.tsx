"use client";

import { BookOpen, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { uploadDocument } from "@/lib/api/upload";
import { useSourceStore } from "@/stores/useSourcesStore";
import { useTextbookStore } from "@/stores/useTextbookStore";
import { useUserStore } from "@/stores/useUserStore";
import type { SourceDocument } from "@/types/source";

const SAMPLE_FILENAME = "ai-engineer.pdf";

export function SampleTextbookLoader({ userId, notebookId }: { userId: string; notebookId: string }) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestRef = useRef<AbortController | null>(null);

    useEffect(() => () => {
        requestRef.current?.abort();
        requestRef.current = null;
    }, []);

    const loadSample = async () => {
        if (requestRef.current || useSourceStore.getState().source.length > 0) return;
        const request = new AbortController();
        requestRef.current = request;
        setIsLoading(true);
        setError(null);

        const isCurrent = () => requestRef.current === request
            && !request.signal.aborted
            && useUserStore.getState().userId === userId
            && useTextbookStore.getState().activeNotebookId === notebookId;

        try {
            const response = await fetch(`/samples/${SAMPLE_FILENAME}`, { signal: request.signal });
            if (!response.ok) throw new Error("Sample download failed");
            const blob = await response.blob();
            if (!blob.size) throw new Error("Sample is empty");
            if (!isCurrent()) return;

            const file = new File([blob], SAMPLE_FILENAME, { type: "application/pdf" });
            const uploaded = await uploadDocument(userId, file, notebookId);
            // The shared uploader has no abort parameter. A completed upload
            // belongs to its original scope and must not enter a new notebook.
            if (!isCurrent()) return;
            useSourceStore.getState().addSource({
                userId,
                notebookId,
                filename: uploaded.filename,
                filepath: uploaded.filepath,
                documentId: uploaded.document_id,
                status: "processing",
                size: file.size,
                type: file.type,
                uploadedAt: new Date(),
            });
        } catch {
            if (isCurrent()) setError("Couldn’t load the sample. Please try again.");
        } finally {
            if (isCurrent()) {
                requestRef.current = null;
                setIsLoading(false);
            }
        }
    };

    return (
        <div className="mt-4 w-full space-y-2">
            <p className="text-xs text-zinc-500">Explore answers, citations, and notes with a sample.</p>
            <button
                type="button"
                disabled={isLoading}
                onClick={loadSample}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2.5 text-xs font-medium text-indigo-300 transition-colors hover:bg-indigo-500/20 disabled:cursor-wait disabled:opacity-60"
            >
                {isLoading ? <LoaderCircle size={16} className="shrink-0 animate-spin" /> : <BookOpen size={16} className="shrink-0" />}
                {isLoading ? "Loading sample textbook…" : "Load Sample AI Engineering Textbook"}
            </button>
            {isLoading && <p role="status" className="text-xs text-zinc-400">Uploading the sample textbook…</p>}
            {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
        </div>
    );
}

export function SampleTextbookStatus({ source }: { source: SourceDocument }) {
    if (source.filename !== SAMPLE_FILENAME) return null;
    return (
        <p role={source.status === "failed" ? "alert" : "status"} className={`px-3 pt-1 text-xs ${source.status === "failed" ? "text-red-400" : "text-zinc-400"}`}>
            {source.status === "processing" && "Indexing sample textbook…"}
            {source.status === "ready" && "Sample ready. Ask a question or create a note."}
            {source.status === "failed" && "The sample could not be indexed. Remove it to load it again."}
        </p>
    );
}

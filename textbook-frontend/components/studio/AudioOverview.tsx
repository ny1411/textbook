"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Headphones, LoaderCircle, RotateCcw, X } from "lucide-react";
import { generateAudioOverview } from "@/lib/api/studio";
import { useTextbookStore } from "@/stores/useTextbookStore";
import { useSourceStore } from "@/stores/useSourcesStore";
import { useUserStore } from "@/stores/useUserStore";

type PreparedOverview = Omit<Awaited<ReturnType<typeof generateAudioOverview>>, "blob"> & { url: string };

export function AudioOverview() {
    const notebookId = useTextbookStore((state) => state.activeNotebookId);
    const userId = useUserStore((state) => state.userId);
    const authenticated = useUserStore((state) => state.isAuthenticated);
    const sources = useSourceStore((state) => state.source);
    const selected = useSourceStore((state) => state.selectedDocumentIds);
    const chosen = sources.filter((source) => source.userId === userId && source.notebookId === notebookId
        && source.documentId && !source.deletionPending && (selected === null || selected.includes(source.documentId)))
        .sort((a, b) => a.documentId!.localeCompare(b.documentId!));
    const ready = chosen.length > 0 && chosen.length <= 6 && chosen.every((source) => source.status === "ready");
    // Remount on account, notebook, source selection or ingestion/deletion changes.
    // Old requests and audio must never survive a workspace change.
    const scope = `${authenticated}:${userId}:${notebookId}:${chosen.map((source) => `${source.documentId}:${source.status}`).join(",")}`;
    return <OverviewSession key={scope} notebookId={notebookId}
        documentIds={chosen.map((source) => source.documentId!)} names={chosen.map((source) => source.filename)}
        available={authenticated && ready} hint={!authenticated ? "Sign in to create an Audio Overview."
            : !chosen.length ? "Select uploaded sources to create an overview."
                : chosen.length > 6 ? "Select up to 6 sources in the Sources panel."
                    : !ready ? "Wait for your selected sources to finish processing." : undefined} />;
}

function OverviewSession({ notebookId, documentIds, names, available, hint }: {
    notebookId: string; documentIds: string[]; names: string[]; available: boolean; hint?: string;
}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [overview, setOverview] = useState<PreparedOverview | null>(null);
    const request = useRef<AbortController | null>(null);
    const asset = useRef<string | null>(null);
    const audio = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        return () => {
            request.current?.abort();
            request.current = null;
            if (asset.current) URL.revokeObjectURL(asset.current);
        };
    }, []);

    const audioUrl = overview?.url;
    useEffect(() => {
        const player = audio.current;
        return () => {
            player?.pause();
            player?.removeAttribute("src");
            player?.load();
        };
    }, [audioUrl]);

    async function generate() {
        if (!available || request.current) return;
        const controller = new AbortController();
        request.current = controller;
        audio.current?.pause();
        if (asset.current) URL.revokeObjectURL(asset.current);
        asset.current = null;
        setOverview(null);
        setError(null);
        setLoading(true);
        try {
            const result = await generateAudioOverview(notebookId, documentIds, controller.signal);
            if (controller.signal.aborted) return;
            const url = URL.createObjectURL(result.blob);
            asset.current = url;
            const { blob: discardedBlob, ...metadata } = result;
            void discardedBlob;
            setOverview({ ...metadata, url });
        } catch (cause) {
            if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Audio Overview could not be generated. Please retry.");
        } finally {
            if (request.current === controller) { request.current = null; setLoading(false); }
        }
    }

    function cancel() {
        request.current?.abort();
        request.current = null;
        setLoading(false);
        setError(null);
    }

    return <section aria-label="Audio Overview" className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground"><Headphones size={15} className="text-accent" /> Audio Overview</div>
        <p className="text-xs leading-relaxed text-muted">A two-speaker conversation about selected passages from your sources.</p>
        {names.length > 0 && <p className="break-words text-xs text-muted" title={names.join(", ")}>{names.length} selected {names.length === 1 ? "source" : "sources"}: {names.join(", ")}</p>}
        {hint && <p className="text-xs leading-relaxed text-muted">{hint}</p>}
        <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!available || loading} onClick={() => void generate()}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-background transition-colors hover:bg-accent/85 disabled:opacity-40">
                {loading ? <LoaderCircle size={13} className="animate-spin" /> : error || overview ? <RotateCcw size={13} /> : <Headphones size={13} />}
                {loading ? "Generating overview…" : error ? "Retry overview" : overview ? "Regenerate overview" : "Generate overview"}
            </button>
            {loading && <button type="button" onClick={cancel} className="flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-muted hover:bg-accent/10"><X size={13} /> Cancel</button>}
        </div>
        {loading && <p role="status" className="text-xs leading-relaxed text-muted">Preparing the discussion and two voices. This may take a minute.</p>}
        {error && <p role="alert" className="text-xs leading-relaxed text-accent">{error}</p>}
        {overview && <div className="space-y-3">
            <audio ref={audio} aria-label="Audio Overview playback" src={overview.url} controls preload="metadata"
                className="h-10 w-full min-w-0" onError={() => setError("The overview audio could not be played. Regenerate it to try again.")} />
            <a href={overview.url} download="audio-overview.wav" className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-foreground"><Download size={13} /> Download audio</a>
            <details className="text-xs">
                <summary className="cursor-pointer text-foreground">Discussion transcript</summary>
                <div className="mt-3 space-y-3">
                    <p className="text-[11px] leading-relaxed text-muted">Host: {overview.voices.Host} · Guest: {overview.voices.Guest}. AI generated from selected passages; check the original sources.</p>
                    {overview.turns.map((turn, index) => <div key={index} className="space-y-1">
                        <p className="font-medium text-accent">{turn.speaker}</p>
                        <p className="font-display text-sm leading-relaxed text-foreground">{turn.text}</p>
                        <p className="text-[11px] text-muted">{turn.source_ids.map((id) => overview.sources.find((source) => source.id === id)?.name).filter(Boolean).join(" · ")}</p>
                    </div>)}
                </div>
            </details>
        </div>}
    </section>;
}

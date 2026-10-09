"use client";

/* eslint-disable @next/next/no-img-element -- Private PNGs use authenticated fetches and ephemeral blob URLs. */
import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Copy, Download, Expand, LoaderCircle, RotateCcw, Trash2, X } from "lucide-react";
import { loadFigureImage, type ConceptFigure } from "@/lib/api/image";
import { useUserStore } from "@/stores/useUserStore";
import { cn } from "@/lib/utils";
import { ReadAloud } from "@/components/voice/ReadAloud";

export function FigureMedia({ figure, url, blob, caption = figure.caption, onLoad, onError }: {
    figure: ConceptFigure; url: string; blob: Blob; caption?: string;
    onLoad?: () => void; onError?: () => void;
}) {
    const [ready, setReady] = useState(false);
    const [copyStatus, setCopyStatus] = useState<string | null>(null);
    const mounted = useRef(false);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

    async function copyImage() {
        if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined"
            || (ClipboardItem.supports && !ClipboardItem.supports("image/png"))) {
            setCopyStatus("Copy PNG is unavailable in this browser. Use Download PNG instead.");
            return;
        }
        try {
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            if (mounted.current) setCopyStatus("PNG copied to clipboard.");
        } catch {
            if (mounted.current) setCopyStatus("The browser could not copy the PNG. Use Download PNG instead.");
        }
    }

    return <div className="space-y-2">
        <Dialog.Root>
            <Dialog.Trigger asChild>
                <button type="button" aria-label="Expand figure" disabled={!ready}
                    className="group relative block w-full overflow-hidden rounded-lg bg-zinc-950 focus-visible:outline-2 focus-visible:outline-indigo-400">
                    <img src={url} alt={caption} width={figure.width} height={figure.height}
                        className={cn("w-full object-contain transition-opacity duration-700 motion-reduce:transition-none", ready ? "opacity-100" : "opacity-0")}
                        onLoad={() => { setReady(true); onLoad?.(); }} onError={onError} />
                    <span className="absolute right-2 top-2 rounded bg-zinc-950/80 p-1.5 text-zinc-100 opacity-70 group-hover:opacity-100" aria-hidden="true"><Expand size={14} /></span>
                </button>
            </Dialog.Trigger>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/90" />
                <Dialog.Content className="fixed inset-2 z-50 flex flex-col gap-3 rounded-xl border border-zinc-700 bg-zinc-950 p-4 text-zinc-100 focus:outline-none sm:inset-5">
                    <div className="flex items-center justify-between gap-4">
                        <Dialog.Title className="text-sm font-semibold">Concept diagram</Dialog.Title>
                        <Dialog.Close aria-label="Close figure" className="rounded-md p-2 text-zinc-300 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-indigo-400"><X size={20} /></Dialog.Close>
                    </div>
                    <img src={url} alt={caption} className="min-h-0 flex-1 object-contain" />
                    <Dialog.Description className="max-h-28 overflow-y-auto text-xs leading-relaxed text-zinc-300">{caption}</Dialog.Description>
                    <p className="text-[11px] text-zinc-500">AI-generated · {figure.model}. Check labels and relationships against your sources.</p>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <a href={url} download={`concept-diagram-${figure.id}.png`} className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200"><Download size={13} /> Download PNG</a>
            <button type="button" onClick={() => void copyImage()} disabled={!ready}
                className="inline-flex items-center gap-1 text-zinc-300 hover:text-zinc-100 disabled:opacity-40"><Copy size={13} /> Copy PNG</button>
        </div>
        {copyStatus && <p role="status" className="text-[11px] text-zinc-400">{copyStatus}</p>}
    </div>;
}

export function FigureNote({ figure, onDelete }: { figure: ConceptFigure; onDelete: (figure: ConceptFigure) => Promise<void> }) {
    const userId = useUserStore((state) => state.userId);
    return <FigureNoteSession key={`${userId}:${figure.notebook_id}:${figure.id}`} figure={figure} onDelete={onDelete} />;
}

function FigureNoteSession({ figure, onDelete }: { figure: ConceptFigure; onDelete: (figure: ConceptFigure) => Promise<void> }) {
    const [asset, setAsset] = useState<{ blob: Blob; url: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const live = useRef(false);
    useEffect(() => {
        live.current = true;
        const controller = new AbortController();
        let url: string | undefined;
        void loadFigureImage(figure, controller.signal).then((blob) => {
            if (controller.signal.aborted) return;
            url = URL.createObjectURL(blob);
            setAsset({ blob, url });
        }).catch(() => {
            if (!controller.signal.aborted) setError("This figure could not be loaded. Retry or delete the saved figure.");
        });
        return () => {
            live.current = false;
            controller.abort();
            if (url) URL.revokeObjectURL(url);
        };
    }, [figure, attempt]);

    async function remove() {
        if (deleting) return;
        setDeleting(true);
        setDeleteError(null);
        try { await onDelete(figure); }
        catch { if (live.current) setDeleteError("The figure could not be deleted. Please retry."); }
        finally { if (live.current) setDeleting(false); }
    }

    return <figure className="rounded-xl border border-zinc-800/80 bg-zinc-950 p-3 space-y-2.5" aria-label="Saved concept diagram">
        <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-indigo-200">Concept diagram</span>
            <button type="button" aria-label="Delete figure" onClick={() => void remove()} disabled={deleting}
                className="rounded p-1 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-400 disabled:opacity-40">
                {deleting ? <LoaderCircle size={13} className="animate-spin" /> : <Trash2 size={13} />}
            </button>
        </div>
        {asset && !error ? <FigureMedia key={asset.url} figure={figure} url={asset.url} blob={asset.blob}
            onError={() => setError("The figure image could not be displayed. Please retry.")} />
            : error ? <div className="space-y-2"><p role="alert" className="text-xs text-amber-300">{error}</p>
                <button type="button" onClick={() => { setAsset(null); setError(null); setAttempt((value) => value + 1); }}
                    className="inline-flex items-center gap-1 text-xs text-indigo-300"><RotateCcw size={13} /> Retry figure</button></div>
                : <p role="status" className="flex items-center gap-2 py-6 text-xs text-zinc-400"><LoaderCircle size={14} className="animate-spin" /> Loading saved figure…</p>}
        <figcaption className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">{figure.caption}</figcaption>
        <ReadAloud id={`figure-${figure.id}`} text={figure.caption} title="Concept diagram caption" />
        <p className="text-[10px] text-zinc-500">AI-generated · {figure.model} · {figure.width} × {figure.height}</p>
        {figure.source && <div className="space-y-1 border-t border-zinc-800 pt-2 text-[10px] text-zinc-400">
            <p className="break-words">{figure.source.source_id != null ? `Source [${figure.source.source_id}] · ` : ""}{figure.source.page_number != null ? `Page ${figure.source.page_number} · ` : ""}{figure.source.document_name || `Document ${figure.source.document_id}`}</p>
            {figure.source.context_type && <p>{figure.source.context_type === "saved_citation" ? "Verified saved citation" : "Document context"}</p>}
            {figure.source.excerpt && <details><summary className="cursor-pointer text-indigo-300">Source passage</summary><p className="mt-2 whitespace-pre-wrap leading-relaxed">{figure.source.excerpt}</p></details>}
        </div>}
        {deleteError && <p role="alert" className="text-xs text-amber-300">{deleteError}</p>}
    </figure>;
}

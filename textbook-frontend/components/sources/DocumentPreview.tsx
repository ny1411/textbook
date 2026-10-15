"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState, type ReactNode } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import type { SourceDocument } from "@/types/source";

function LoadingPreview() {
    return <p role="status" className="flex h-full items-center justify-center gap-2 text-sm text-muted"><LoaderCircle className="size-4 animate-spin" /> Loading document…</p>;
}

const PDFViewer = dynamic(() => import("@/components/extend/pdf-viewer").then((m) => m.PDFViewer), { ssr: false, loading: LoadingPreview });
const DocxViewer = dynamic(() => import("@/components/extend/docx-viewer").then((m) => m.DocxViewerPreview), { ssr: false, loading: LoadingPreview });
const XlsxViewer = dynamic(() => import("@/components/extend/xlsx-viewer").then((m) => m.XlsxViewerPreview), { ssr: false, loading: LoadingPreview });
const PptxViewer = dynamic(() => import("@/components/extend/pptx-viewer").then((m) => m.PptxViewerPreview), { ssr: false, loading: LoadingPreview });
const CsvViewer = dynamic(() => import("@/components/extend/csv-viewer").then((m) => m.CsvViewer), { ssr: false, loading: LoadingPreview });

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    render() {
        return this.state.failed ? <p role="alert" className="p-6 text-sm text-muted">This file could not be rendered. Download it to view in its original application.</p> : this.props.children;
    }
}

type LoadedDocument = { url: string; text?: string };
const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "tsv", "py", "js", "ts", "jsx", "tsx", "html", "css", "json", "c", "cpp", "cs", "java", "rs", "go", "swift", "php"]);

export function DocumentPreview({ source, details }: { source: SourceDocument; details?: ReactNode }) {
    const [loaded, setLoaded] = useState<LoadedDocument>();
    const [error, setError] = useState<string>();
    const [attempt, setAttempt] = useState(0);
    const [isDark, setIsDark] = useState(true);
    const extension = source.filename.split(".").pop()?.toLowerCase() ?? "";
    const mediaType = source.type ?? "";
    const isText = TEXT_EXTENSIONS.has(extension) || mediaType.startsWith("text/") || mediaType === "application/json";

    useEffect(() => {
        const controller = new AbortController();
        let url: string | undefined;
        async function load() {
            setLoaded(undefined);
            setError(undefined);
            try {
                if (!source.documentId) throw new Error("This source has no saved file. Upload it again to preview it.");
                const response = await apiFetch(`/api/documents/${encodeURIComponent(source.documentId)}/content`, { signal: controller.signal });
                const bytes = await response.blob();
                const text = isText ? await bytes.text() : undefined;
                if (controller.signal.aborted) return;
                // The API serves bytes as an attachment; only trusted renderers receive a local URL.
                url = URL.createObjectURL(new Blob([bytes], { type: extension === "pdf" ? "application/pdf" : mediaType || "application/octet-stream" }));
                setLoaded({ url, text });
            } catch (cause) {
                if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load this document.");
            }
        }
        void load();
        return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
    }, [source.documentId, extension, mediaType, isText, attempt]);

    let content: ReactNode;
    if (error) content = <div role="alert" className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center text-sm text-muted"><p>{error}</p><button type="button" className="rounded-lg border border-border px-4 py-2 text-foreground" onClick={() => setAttempt((n) => n + 1)}>Retry preview</button></div>;
    else if (!loaded) content = <LoadingPreview />;
    else if (extension === "pdf" || mediaType === "application/pdf") content = <PDFViewer src={loaded.url} className="h-full" defaultZoom="fit-width" showUpload={false} showDownload={false} />;
    else if (["doc", "docx"].includes(extension)) content = <DocxViewer src={loaded.url} fileName={source.filename} className="h-full" defaultZoom="fit-width" isDark={isDark} onIsDarkChange={setIsDark} showUpload={false} showDownload={false} />;
    else if (extension === "xlsx") content = <XlsxViewer src={loaded.url} fileName={source.filename} className="h-full" isDark={isDark} onIsDarkChange={setIsDark} showUpload={false} showDownload={false} />;
    else if (["ppt", "pptx"].includes(extension)) content = <PptxViewer src={loaded.url} fileName={source.filename} className="h-full" defaultZoom="fit-width" showUpload={false} showDownload={false} />;
    else if (["csv", "tsv"].includes(extension) || mediaType === "text/csv") content = <CsvViewer data={loaded.text ?? ""} className="h-full" search />;
    else if (isText) content = <pre className="h-full overflow-auto whitespace-pre-wrap break-words p-6 font-mono text-sm leading-6 text-foreground">{loaded.text}</pre>;
    // Native media elements need object URLs and support a wider set of formats than next/image.
    // eslint-disable-next-line @next/next/no-img-element
    else if (mediaType.startsWith("image/")) content = <div className="flex h-full items-center justify-center overflow-auto p-4"><img src={loaded.url} alt={source.filename} className="max-h-full max-w-full object-contain" /></div>;
    else if (mediaType.startsWith("audio/")) content = <div className="flex h-full items-center justify-center p-4"><audio src={loaded.url} controls className="w-full max-w-xl" /></div>;
    else content = <p className="p-6 text-sm text-muted">Preview is unavailable for this file format. Download the original to open it.</p>;

    return <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border pb-3 text-xs text-muted">
            {details}
            {loaded ? <a href={loaded.url} download={source.filename} className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-2 text-accent transition-colors hover:bg-surface-raised">
                <Download className="size-3.5" aria-hidden="true" /> Download
            </a> : <button type="button" disabled className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-2 text-muted opacity-50">
                <Download className="size-3.5" aria-hidden="true" /> Download
            </button>}
        </div>
        <div className="min-h-0 flex-1"><PreviewBoundary key={`${source.documentId}:${attempt}`}>{content}</PreviewBoundary></div>
        <div id="portal" />
    </div>;
}

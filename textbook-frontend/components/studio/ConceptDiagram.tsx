"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ImagePlus, LoaderCircle, RotateCcw, Save, X } from "lucide-react";
import { FigureMedia } from "./FigureNote";
import {
    deleteFigure, generateConceptDiagram, ImageGenerationError, loadFigureImage, saveFigure,
    type ConceptFigure, type FigureSource, type GenerationPhase,
} from "@/lib/api/image";
import type { CitationItem } from "@/types/api";
import { useTextbookStore } from "@/stores/useTextbookStore";
import { useUserStore } from "@/stores/useUserStore";
import { cn } from "@/lib/utils";
import { boundedCitationExcerpt, figureCitationKey } from "@/lib/figure-scope";

const Heatmap = dynamic(() => import("@paper-design/shaders-react").then((module) => module.Heatmap), { ssr: false });
const shaderColors = ["#16152f", "#4338ca", "#818cf8", "#c4b5fd", "#e0f2fe"];
const phaseLabels: Record<GenerationPhase, string> = {
    analyzing: "Analyzing concept…", synthesizing: "Synthesizing diagram…", rendering: "Rendering image…",
};
const stages: GenerationPhase[] = ["analyzing", "synthesizing", "rendering"];
type Props = { citation?: CitationItem | null; onSaved: (figure: ConceptFigure) => void };

export function ConceptDiagram({ citation, onSaved }: Props) {
    const userId = useUserStore((state) => state.userId);
    const authenticated = useUserStore((state) => state.isAuthenticated);
    const notebookId = useTextbookStore((state) => state.activeNotebookId);
    const scopeCitation = useTextbookStore((state) => state.activeCitation);
    const citationKey = figureCitationKey(citation);
    const activeCitationKey = figureCitationKey(scopeCitation);
    const missingDocument = !!citation && !citation.document_id?.trim();
    const hint = !authenticated ? "Sign in to generate diagrams."
        : !notebookId ? "Select a notebook to generate diagrams."
            : missingDocument ? "This citation has no document reference. Choose a citation from an uploaded document to illustrate its passage." : undefined;
    return <DiagramSession key={`${authenticated}:${userId}:${notebookId}:${citationKey}:${activeCitationKey}`}
        userId={userId} notebookId={notebookId} available={authenticated && !!notebookId && !missingDocument} hint={hint}
        scopeCitationKey={activeCitationKey} citation={citation} onSaved={onSaved} />;
}

function DiagramSession({ userId, notebookId, available, hint, citation, scopeCitationKey, onSaved }: Props & {
    userId: string; notebookId: string; available: boolean; hint?: string; scopeCitationKey: string;
}) {
    const [prompt, setPrompt] = useState(citation ? "Illustrate the key concept in this passage as a clear educational diagram." : "");
    const [phase, setPhase] = useState<GenerationPhase | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
    const [result, setResult] = useState<{ figure: ConceptFigure; blob: Blob; url: string } | null>(null);
    const [imageReady, setImageReady] = useState(false);
    const [caption, setCaption] = useState("");
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const mounted = useRef(false);
    const request = useRef<AbortController | null>(null);
    const assetUrl = useRef<string | null>(null);
    const pending = useRef<{ figure: ConceptFigure; controller: AbortController } | null>(null);
    const savingRequest = useRef(false);

    function currentScope() {
        return mounted.current && useUserStore.getState().isAuthenticated
            && useUserStore.getState().userId === userId
            && useTextbookStore.getState().activeNotebookId === notebookId
            && figureCitationKey(useTextbookStore.getState().activeCitation) === scopeCitationKey;
    }

    function disposePending(controller?: AbortController) {
        if (controller && pending.current?.controller !== controller) return;
        const figure = pending.current?.figure;
        pending.current = null;
        // A switched account may no longer authorize deletion; server TTL is the fallback.
        if (figure) void deleteFigure(figure, true).catch(() => undefined);
    }

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            request.current?.abort();
            request.current = null;
            if (assetUrl.current) URL.revokeObjectURL(assetUrl.current);
            assetUrl.current = null;
            // Let an initiated save settle before deciding whether its figure is pending.
            if (!savingRequest.current) disposePending();
        };
    }, []);

    function reset() {
        request.current?.abort();
        request.current = null;
        disposePending();
        if (assetUrl.current) URL.revokeObjectURL(assetUrl.current);
        assetUrl.current = null;
        setResult(null);
        setLoading(false);
        setPhase(null);
        setImageReady(false);
        setError(null);
        setSaved(false);
    }

    async function generate() {
        if (!available || !currentScope() || request.current || savingRequest.current || !prompt.trim()) return;
        reset();
        const controller = new AbortController();
        request.current = controller;
        setLoading(true);
        const source: FigureSource | undefined = citation?.document_id ? {
            document_id: citation.document_id, source_id: citation.source_id,
            ...(citation.page_number != null ? { page_number: citation.page_number } : {}),
            excerpt: boundedCitationExcerpt(citation.text),
        } : undefined;
        try {
            const figure = await generateConceptDiagram(notebookId, prompt, source, (event) => {
                if (event.event === "complete") {
                    if (request.current === controller && currentScope() && !controller.signal.aborted) {
                        pending.current = { figure: event.data.figure, controller };
                    } else void deleteFigure(event.data.figure, true).catch(() => undefined);
                } else if (currentScope() && !controller.signal.aborted) setPhase(event.data.phase);
            }, controller.signal);
            if (!currentScope() || controller.signal.aborted) { disposePending(controller); return; }
            const blob = await loadFigureImage(figure, controller.signal);
            if (!currentScope() || controller.signal.aborted) { disposePending(controller); return; }
            const url = URL.createObjectURL(blob);
            assetUrl.current = url;
            setCaption(figure.caption);
            setResult({ figure, blob, url });
        } catch (cause) {
            disposePending(controller);
            if (currentScope() && !controller.signal.aborted) setError({
                message: cause instanceof ImageGenerationError ? cause.message : "The diagram could not be generated. Please retry.",
                retryable: cause instanceof ImageGenerationError ? cause.retryable : true,
            });
        } finally {
            if (request.current === controller) {
                request.current = null;
                if (currentScope()) setLoading(false);
            }
        }
    }

    async function save() {
        if (!result || !imageReady || !currentScope() || savingRequest.current || saved || !caption.trim()) return;
        savingRequest.current = true;
        setSaving(true);
        setError(null);
        try {
            const figure = await saveFigure(result.figure, caption);
            if (pending.current?.figure.id === result.figure.id) pending.current = null;
            if (currentScope()) { setSaved(true); onSaved(figure); }
        } catch {
            if (currentScope()) setError({ message: "Could not confirm save. Try Save Figure again or reload Studio Notes.", retryable: false });
            else disposePending();
        } finally {
            savingRequest.current = false;
            if (currentScope()) setSaving(false);
        }
    }

    return <section aria-label={citation ? "Illustrate citation" : "Concept diagram generator"}
        className="space-y-3 rounded-xl border border-indigo-500/25 bg-indigo-500/5 p-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-indigo-200"><ImagePlus size={15} />{citation ? "Illustrate Concept" : "Concept Diagram"}</div>
        <p className="text-[11px] leading-relaxed text-zinc-400">Turn a concept into an educational illustration. AI-generated labels and relationships may need correction.</p>
        {hint && <p className="text-[11px] text-zinc-400">{hint}</p>}
        <label className="block space-y-1.5 text-[11px] text-zinc-300">
            <span>{citation ? "What should the passage illustrate?" : "Describe a concept"}</span>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={1200}
                disabled={loading || saving} rows={3} placeholder="e.g. Show how a transformer attention layer connects tokens"
                className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-60" />
        </label>
        <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void generate()} disabled={!available || !prompt.trim() || loading || saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
                {loading ? <LoaderCircle size={13} className="animate-spin" /> : error || result ? <RotateCcw size={13} /> : <ImagePlus size={13} />}
                {loading ? "Generating diagram…" : error?.retryable ? "Retry diagram" : result ? "Generate another diagram" : citation ? "Illustrate Concept" : "Generate diagram"}
            </button>
            {(loading || result) && !saving && <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800"><X size={13} />{loading ? "Cancel diagram" : "Clear diagram"}</button>}
        </div>
        {(loading || result) && <div className="relative overflow-hidden rounded-lg bg-zinc-950">
            <div aria-hidden="true" className={cn("overflow-hidden transition-opacity duration-700 motion-reduce:transition-none", result ? "absolute inset-x-0 top-0 z-10 pointer-events-none" : "relative", imageReady ? "opacity-0" : "opacity-100")}>
                <Heatmap image="/globe.svg" width="100%" height={200} colors={shaderColors} colorBack="#09090b"
                    speed={imageReady ? 0 : 0.35} scale={0.6} noise={0.15} contour={0.6} innerGlow={0.7} outerGlow={0.8} />
            </div>
            {result && <div className="p-2"><FigureMedia figure={result.figure} url={result.url} blob={result.blob} caption={caption}
                onLoad={() => setImageReady(true)} onError={() => { setImageReady(false); setError({ message: "The generated image could not be displayed. Please retry.", retryable: true }); }} /></div>}
        </div>}
        {loading && <div role="status" aria-live="polite" className="space-y-2 text-[11px]">
            <p className="text-indigo-200">{phase ? phaseLabels[phase] : "Connecting to the diagram service…"}</p>
            <ol className="flex gap-3 text-zinc-500">{stages.map((stage, index) => <li key={stage}
                className={cn(phase === stage ? "text-indigo-300" : phase && stages.indexOf(phase) > index ? "text-zinc-300" : "")}>{index + 1}. {stage === "analyzing" ? "Analyze" : stage === "synthesizing" ? "Synthesize" : "Render"}</li>)}</ol>
        </div>}
        {error && <p role="alert" className="text-xs leading-relaxed text-amber-300">{error.message}</p>}
        {result && <div className="space-y-2">
            <label className="block space-y-1 text-[11px] text-zinc-300"><span>Figure caption</span>
                <textarea value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={1200} rows={3} disabled={saving || saved}
                    className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-xs leading-relaxed focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-70" /></label>
            <p className="text-[10px] text-zinc-500">AI-generated · {result.figure.model}{result.figure.source?.source_id != null ? ` · Source [${result.figure.source.source_id}]` : ""}{result.figure.source?.page_number != null ? ` · Page ${result.figure.source.page_number}` : ""}</p>
            <button type="button" onClick={() => void save()} disabled={!imageReady || !caption.trim() || saving || saved}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
                {saving ? <LoaderCircle size={13} className="animate-spin" /> : <Save size={13} />}
                {saved ? "Figure saved to Studio Notes" : saving ? "Saving figure…" : "Save Figure to Studio Notes"}
            </button>
        </div>}
    </section>;
}

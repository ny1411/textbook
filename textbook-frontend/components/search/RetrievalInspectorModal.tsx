import { toast } from "sonner";
import { relevancePercentage } from "@/lib/relevance";
import { useEffect, useRef, useState } from "react";
import {
    SlidersHorizontal,
    Search,
    X,
    Layers,
    Sparkles,
    Filter,
    Loader2,
    Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/stores/useUserStore";
import { performSearch } from "@/lib/api/search";
import { useSourceStore } from "@/stores/useSourcesStore";
import type { SearchResultItem } from "@/types/api";
import * as Dialog from "@radix-ui/react-dialog";
import { useTextbookStore } from "@/stores/useTextbookStore";
import { SelectMenu } from "@/components/ui/select-menu";
import { SmoothInput } from "@/components/ui/smooth-input";

interface RetrievalInspectorModal {
    isOpen: boolean;
    onClose: () => void;
}

export function RetrievalInspectorModal({ isOpen, onClose }: RetrievalInspectorModal) {
    const userId = useUserStore((s) => s.userId);
    const sources = useSourceStore((s) => s.source);
    const activeNotebookId = useTextbookStore((s) => s.activeNotebookId);

    const [query, setQuery] = useState("");
    const [selectedDocId, setSelectedDocId] = useState<string>("");
    const [topK, setTopK] = useState<number>(5);
    const [useAnalysis, setUseAnalysis] = useState<boolean>(true);

    const controller = useRef<AbortController | null>(null);
    useEffect(() => () => controller.current?.abort(), []);

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [results, setResults] = useState<SearchResultItem[]>([]);
    const [appliedQuery, setAppliedQuery] = useState<string>("");
    const [latency, setLatency] = useState<number | null>(null);

    const handleRunDiagnostics = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim() || isLoading) return;

        const abort = new AbortController();
        controller.current = abort;
        setIsLoading(true);
        const startTime = performance.now();

        try {
            const response = await performSearch({
                user_id: userId,
                query: query.trim(),
                document_id: selectedDocId || undefined,
                notebook_id: activeNotebookId,
                top_k: topK,
                use_analysis: useAnalysis,
            }, abort.signal);
            if (abort.signal.aborted || useUserStore.getState().userId !== userId ||
                useTextbookStore.getState().activeNotebookId !== activeNotebookId) return;

            const elapsed = Math.round(performance.now() - startTime);
            setLatency(elapsed);
            setResults(response.results || []);
            setAppliedQuery(query.trim());
            toast.success(`Retrived ${response.results.length} chunks in ${elapsed}ms.`);
        } catch (e: unknown) {
            if (abort.signal.aborted) return;
            console.log("Retrieval diagonistic error:", e);
            toast.error(e instanceof Error ? e.message : "Failed to run retrieval test.");
        } finally {
            if (!abort.signal.aborted) setIsLoading(false);
        }
    };

    return (
        <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 animate-in fade-in duration-200" />
                <Dialog.Content
                    data-lenis-prevent
                    className="fixed top-1/2 left-1/2 z-50 flex max-h-[88dvh] w-[92vw] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-2xl focus:outline-none"
                >
                    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border bg-surface px-4 py-4 sm:items-center sm:px-6">
                        <div className="flex items-start gap-3 sm:items-center">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border text-accent">
                                <SlidersHorizontal size={18} />
                            </div>
                            <div>
                                <Dialog.Title className="text-base font-medium text-foreground">
                                    Retrieval diagnostics
                                </Dialog.Title>
                                <Dialog.Description className="mt-1 text-xs leading-relaxed text-muted">
                                    Compare hybrid retrieval with reranked source passages.
                                </Dialog.Description>
                            </div>
                        </div>
                        <Dialog.Close asChild>
                            <button type="button" aria-label="Close retrieval diagnostics" className="shrink-0 cursor-pointer rounded-lg p-1.5 text-muted transition-colors hover:bg-accent/10 hover:text-foreground">
                                <X size={18} />
                            </button>
                        </Dialog.Close>
                    </div>
                    <div className="shrink-0 space-y-4 border-b border-border p-4 sm:p-6">
                        <form onSubmit={handleRunDiagnostics} className="space-y-3">
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <div className="relative flex-1">
                                    <SmoothInput
                                        type="text"
                                        aria-label="Retrieval query"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Enter diagnostic query (e.g. 'What is gradient descent and backpropagation?')..."
                                        className="w-full rounded-xl border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-foreground transition-colors placeholder:text-muted focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30"
                                    />
                                    <Search
                                        size={16}
                                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={!query.trim() || isLoading}
                                    className="flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-accent/85 disabled:opacity-50"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            <span>Testing...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Activity size={16} />
                                            <span>Run Diagnostic</span>
                                        </>
                                    )}
                                </button>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pt-2 text-xs text-muted">
                                <div className="flex items-center gap-1.5">
                                    <Filter size={13} className="text-muted" />
                                    <span>Document:</span>
                                    <SelectMenu
                                        label="Document to inspect"
                                        value={selectedDocId}
                                        onChange={setSelectedDocId}
                                        className="min-w-0 max-w-48"
                                        options={[
                                            { value: "", label: "All Uploaded Documents" },
                                            ...sources.filter((src) => src.userId === userId && src.notebookId === activeNotebookId).map((src) => ({
                                                value: src.documentId ?? `unavailable:${src.filepath}`,
                                                label: src.filename,
                                                disabled: !src.documentId || src.status !== "ready" || src.deletionPending,
                                            })),
                                        ]}
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span>Top K:</span>
                                    <input
                                        type="range"
                                        aria-label="Number of candidate chunks"
                                        min="3"
                                        max="25"
                                        value={topK}
                                        onChange={(e) => setTopK(Number(e.target.value))}
                                        className="w-20 cursor-pointer accent-accent"
                                    />
                                    <span className="font-mono text-foreground">{topK}</span>
                                </div>
                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={useAnalysis}
                                        onChange={(e) => setUseAnalysis(e.target.checked)}
                                        className="rounded border-border bg-surface accent-accent focus:ring-accent/40"
                                    />
                                    <span>Enable Query Rewriting / HyDE</span>
                                </label>
                                {latency !== null && (
                                    <div className="ml-auto rounded border border-border bg-surface px-2 py-1 font-mono text-[11px] text-muted">
                                        Latency: <span className="text-accent">{latency}ms</span>
                                    </div>
                                )}
                            </div>
                        </form>
                        {appliedQuery && appliedQuery !== query && (
                            <div className="flex items-center gap-2 rounded-lg border border-accent/20 bg-accent/5 p-3 text-xs text-accent">
                                <Sparkles size={14} className="shrink-0" />
                                <span>
                                    <strong>Rewritten Applied Query:</strong> &ldquo;{appliedQuery}&rdquo;
                                </span>
                            </div>
                        )}
                    </div>
                    <div data-lenis-prevent className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-6">
                        {results.length === 0 ? (
                            <div className="flex h-56 flex-col items-center justify-center text-center text-muted">
                                <Layers size={30} strokeWidth={1.25} className="mb-3 text-muted" />
                                <p className="text-sm font-medium text-foreground">No inspection results yet</p>
                                <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted">
                                    Type a test query above to see how Stage 1 Hybrid retrieval candidates are scored and reprioritized by the Stage 2 Cross-Encoder.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted">
                                    <span>Candidate Chunks ({results.length})</span>
                                    <span>Ranked by Stage 2 Rerank Score</span>
                                </div>
                                {results.map((item, index) => {
                                    const rerankPct = relevancePercentage(item.rerank_score);
                                    return (
                                        <div
                                            key={item.id || index}
                                            className="space-y-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-accent/30"
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="flex size-5 items-center justify-center rounded-full border border-border font-mono text-[11px] font-medium text-accent">
                                                        {index + 1}
                                                    </span>
                                                    <span className="font-mono text-xs text-muted">
                                                        Chunk: {item.id.slice(0, 14)}...
                                                    </span>
                                                    {item.page_number !== null && item.page_number !== undefined && (
                                                        <span className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted">
                                                            Page {item.page_number}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <div className="flex items-center gap-1 rounded border border-border bg-background px-2 py-0.5 font-mono text-[11px] text-muted">
                                                        <span className="text-muted">Stage 1 (RRF):</span>
                                                        <span className="text-foreground">
                                                            {item.rrf_score ? item.rrf_score.toFixed(4) : "N/A"}
                                                        </span>
                                                    </div>
                                                    <div
                                                        className={cn(
                                                            "flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-mono font-semibold",
                                                            rerankPct !== null && rerankPct >= 70
                                                                ? "bg-accent/15 border-accent/30 text-accent"
                                                                : rerankPct !== null && rerankPct >= 40
                                                                    ? "bg-accent/5 border-accent/20 text-accent"
                                                                    : "bg-background border-border text-muted"
                                                        )}
                                                    >
                                                        <span className="opacity-70">Stage 2 (Rerank):</span>
                                                        <span>{rerankPct !== null ? `${rerankPct}%` : "N/A"}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="font-display text-sm leading-relaxed text-foreground">
                                                &ldquo;{item.text}&rdquo;
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

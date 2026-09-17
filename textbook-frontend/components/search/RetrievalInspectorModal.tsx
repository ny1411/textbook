import { toast } from "sonner";
import { useState } from "react";
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
import { SearchResultItem } from "@/types/api";
import * as Dialog from "@radix-ui/react-dialog";

interface RetrievalInspectorModal {
    isOpen: boolean;
    onClose: () => void;
}

export function RetrievalInspectorModal({ isOpen, onClose }: RetrievalInspectorModal) {
    const userId = useUserStore((s) => s.userId);
    const sources = useSourceStore((s) => s.source);

    const [query, setQuery] = useState("");
    const [selectedDocId, setSelectedDocId] = useState<string>("");
    const [topK, setTopK] = useState<number>(5);
    const [useAnalysis, setUseAnalysis] = useState<boolean>(true);

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [results, setResults] = useState<SearchResultItem[]>([]);
    const [appliedQuery, setAppliedQuery] = useState<string>("");
    const [latency, setLatency] = useState<number | null>(null);

    const handleRunDiagnostics = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim() || isLoading) return;

        setIsLoading(true);
        const startTime = performance.now();

        try {
            const response = await performSearch({
                user_id: userId,
                query: query.trim(),
                document_id: selectedDocId || undefined,
                top_k: topK,
                use_analysis: useAnalysis,
            });

            const elapsed = Math.round(performance.now() - startTime);
            setLatency(elapsed);
            setResults(response.results || []);
            setAppliedQuery(query.trim());
            toast.success(`Retrived ${response.results.length} chunks in ${elapsed}ms.`);
        } catch (e: any) {
            console.log("Retrieval diagonistic error:", e);
            toast.error(e.message || "Failed to run retrieval test.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 animate-in fade-in duration-200" />
                <Dialog.Content
                    className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] max-w-4xl max-h-[88vh] flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl z-50 shadow-2xl overflow-hidden focus:outline-none"
                >
                    <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/90 shrink-0">
                        <div className="flex items-center gap-2.5">
                            <div className="size-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                                <SlidersHorizontal size={18} />
                            </div>
                            <div>
                                <Dialog.Title className="text-base font-semibold text-zinc-100">
                                    Retrieval Diagnostic Inspector
                                </Dialog.Title>
                                <Dialog.Description className="text-xs text-zinc-400">
                                    Test and inspect Stage 1 (Dense + Sparse RRF) vs Stage 2 (Cross-Encoder Reranker)
                                </Dialog.Description>
                            </div>
                        </div>
                        <Dialog.Close asChild>
                            <button className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer">
                                <X size={18} />
                            </button>
                        </Dialog.Close>
                    </div>
                    <div className="p-6 border-b border-zinc-800 bg-zinc-950/60 shrink-0 space-y-4">
                        <form onSubmit={handleRunDiagnostics} className="space-y-3">
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search
                                        size={16}
                                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500"
                                    />
                                    <input
                                        type="text"
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Enter diagnostic query (e.g. 'What is gradient descent and backpropagation?')..."
                                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={!query.trim() || isLoading}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold transition-all cursor-pointer"
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
                            <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400 pt-1">
                                <div className="flex items-center gap-1.5">
                                    <Filter size={13} className="text-zinc-500" />
                                    <span>Document:</span>
                                    <select
                                        value={selectedDocId}
                                        onChange={(e) => setSelectedDocId(e.target.value)}
                                        className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500/60"
                                    >
                                        <option value="">All Uploaded Documents</option>
                                        {sources.map((src) => (
                                            <option key={src.filepath} value={src.filepath}>
                                                {src.filename}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span>Top K:</span>
                                    <input
                                        type="range"
                                        min="3"
                                        max="25"
                                        value={topK}
                                        onChange={(e) => setTopK(Number(e.target.value))}
                                        className="accent-indigo-500 cursor-pointer w-20"
                                    />
                                    <span className="font-mono text-zinc-200">{topK}</span>
                                </div>
                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={useAnalysis}
                                        onChange={(e) => setUseAnalysis(e.target.checked)}
                                        className="rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500/40"
                                    />
                                    <span>Enable Query Rewriting / HyDE</span>
                                </label>
                                {latency !== null && (
                                    <div className="ml-auto font-mono text-[11px] text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                                        Latency: <span className="text-indigo-400">{latency}ms</span>
                                    </div>
                                )}
                            </div>
                        </form>
                        {appliedQuery && appliedQuery !== query && (
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300">
                                <Sparkles size={14} className="shrink-0" />
                                <span>
                                    <strong>Rewritten Applied Query:</strong> &ldquo;{appliedQuery}&rdquo;
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-3">
                        {results.length === 0 ? (
                            <div className="h-64 flex flex-col items-center justify-center text-center text-zinc-500">
                                <Layers size={36} className="mb-2 text-zinc-600" />
                                <p className="text-sm font-medium text-zinc-400">No Inspection Results</p>
                                <p className="text-xs text-zinc-500 max-w-sm mt-1">
                                    Type a test query above to see how Stage 1 Hybrid retrieval candidates are scored and reprioritized by the Stage 2 Cross-Encoder.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
                                    <span>Candidate Chunks ({results.length})</span>
                                    <span>Ranked by Stage 2 Rerank Score</span>
                                </div>
                                {results.map((item, index) => {
                                    const rerankPct =
                                        item.rerank_score !== null && item.rerank_score !== undefined
                                            ? Math.round(item.rerank_score * 100)
                                            : null;
                                    return (
                                        <div
                                            key={item.id || index}
                                            className="p-4 rounded-xl bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700/80 transition-all space-y-2.5"
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-850">
                                                <div className="flex items-center gap-2">
                                                    <span className="size-5 rounded-full bg-zinc-800 text-zinc-300 text-[11px] font-mono font-bold flex items-center justify-center">
                                                        {index + 1}
                                                    </span>
                                                    <span className="text-xs font-mono text-zinc-400">
                                                        Chunk: {item.id.slice(0, 14)}...
                                                    </span>
                                                    {item.page_number !== null && item.page_number !== undefined && (
                                                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] font-mono">
                                                            Page {item.page_number}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-400">
                                                        <span className="text-zinc-500">Stage 1 (RRF):</span>
                                                        <span className="text-zinc-200">
                                                            {item.rrf_score ? item.rrf_score.toFixed(4) : "N/A"}
                                                        </span>
                                                    </div>
                                                    <div
                                                        className={cn(
                                                            "flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-mono font-semibold",
                                                            rerankPct !== null && rerankPct >= 70
                                                                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
                                                                : rerankPct !== null && rerankPct >= 40
                                                                    ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
                                                                    : "bg-zinc-800 border-zinc-700 text-zinc-300"
                                                        )}
                                                    >
                                                        <span className="opacity-70">Stage 2 (Rerank):</span>
                                                        <span>{rerankPct !== null ? `${rerankPct}%` : "N/A"}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-xs text-zinc-300 leading-relaxed font-serif bg-zinc-900/50 p-2.5 rounded-lg border border-zinc-850">
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
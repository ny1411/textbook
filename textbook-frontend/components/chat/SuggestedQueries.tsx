"use client";

import { BookOpen, CircleAlert, GitCompare, Sparkles } from "lucide-react";
import { HeroMeshGradient } from "./HeroMeshGradient";
import { useSourceStore } from "@/stores/useSourcesStore";
import { useUserStore } from "@/stores/useUserStore";
import { useTextbookStore } from "@/stores/useTextbookStore";

interface SuggestedQueriesProps {
    onSelectQuery: (query: string) => void;
}

const SUGGESTED_QUERIES = [
    {
        icon: BookOpen,
        label: "Summarize Concepts",
        query: "Summarize the concepts and takeaways from uploaded documents.",
    }, {
        icon: GitCompare,
        label: "Compare Findings",
        query: "Compare the arguments and findings discussed across the sources.",
    }, {
        icon: CircleAlert,
        label: "Explain Methodology",
        query: "Explain the core methodology and architectural decisions presented in texts.",
    },
];

export function SuggestedQueries({ onSelectQuery }: SuggestedQueriesProps) {
    const userId = useUserStore((state) => state.userId);
    const notebookId = useTextbookStore((state) => state.activeNotebookId);
    const sampleReady = useSourceStore((state) => state.source.some((source) => source.userId === userId &&
        source.notebookId === notebookId && source.sampleKey === "ai-engineering-v1" && source.status === "ready" && !source.deletionPending));
    const queries = sampleReady ? [
        { icon: BookOpen, label: "Explore hybrid search", query: "How do dense and sparse retrieval complement each other in hybrid search?" },
        { icon: GitCompare, label: "Calculate retrieval quality", query: "If three of four relevant passages appear in five results, what are Recall@5 and Precision@5?" },
        { icon: CircleAlert, label: "Check citation support", query: "Why does a citation badge alone not prove that an answer is grounded?" },
    ] : SUGGESTED_QUERIES;
    return (
        <div className="relative isolate w-full max-w-2xl mx-auto flex flex-col items-center justify-center overflow-hidden rounded-3xl p-6 text-center animate-in fade-in duration-300">
            <HeroMeshGradient />
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 text-indigo-400 shadow-inner">
                <Sparkles size={20} />
            </div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
                Want to explore further?
            </h2>
            <p className="text-sm text-zinc-400 mt-1.5 max-w-md">
                {sampleReady ? "Your sample is ready. Try a question, inspect a citation, and save a Studio note." : "Ask questions from your uploaded documents."}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-8 w-full">
                {queries.map((chip, idx) => {
                    const Icon = chip.icon;
                    return (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => onSelectQuery(chip.query)}
                            className="flex flex-col items-start text-left p-3 rounded-xl border border-zinc-800 bg-zinc-950/70
                         hover:bg-zinc-800/80 hover:border-zinc-700 transition-all cursor-pointer group"
                        >
                            <div className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-colors mb-2">
                                <Icon size={16} />
                            </div>
                            <span className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                                {chip.label}
                            </span>
                            <span className="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-snug">
                                {chip.query}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );

}

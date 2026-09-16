"use client";

import { BookOpen, CircleAlert, GitCompare, Sparkles } from "lucide-react";

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
    return (
        <div className="w-full max-w-2xl mx-auto flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 text-indigo-400 shadow-inner">
                <Sparkles size={20} />
            </div>
            <h2 className="text-xl font-semibold text-zinc-100 tracking-tight">
                Want to explore further?
            </h2>
            <p className="text-sm text-zinc-400 mt-1.5 max-w-md">
                Ask questions from your uploaded documents.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-8 w-full">
                {SUGGESTED_QUERIES.map((chip, idx) => {
                    const Icon = chip.icon;
                    return (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => onSelectQuery(chip.query)}
                            className="flex flex-col items-start text-left p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 
                         hover:bg-zinc-800/80 hover:border-zinc-700 transition-all cursor-pointer group"
                        >
                            <div className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 group-hover:text-indigo-400 group-hover:bg-indigo-500/10 transition-colors mb-2">
                                <Icon size={16} />
                            </div>
                            <span className="text-xs font-semibold text-zinc-200 group-hover:text-white">
                                {chip.label}
                            </span>
                            <span className="text-[11px] text-zinc-500 mt-1 line-clamp-2 leading-snug">
                                {chip.query}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );

}
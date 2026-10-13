"use client";

import { BookOpen, Lightbulb, PencilLine } from "lucide-react";
import { useSourceStore } from "@/stores/useSourcesStore";
import { useUserStore } from "@/stores/useUserStore";
import { useTextbookStore } from "@/stores/useTextbookStore";

interface SuggestedQueriesProps {
    onSelectQuery: (query: string) => void;
    disabled?: boolean;
}

const SUGGESTED_QUERIES = [
    { icon: Lightbulb, label: "Understand a concept", query: "Explain a key concept from my sources in simple terms, with examples." },
    { icon: PencilLine, label: "Help me write", query: "Help me write a clear summary of the main ideas in my sources." },
    { icon: BookOpen, label: "Explore a topic", query: "What are the most interesting topics to explore across my sources?" },
];

export function WelcomeHeading() {
    return (
        <div className="mb-9 text-center">
            <h1 className="font-[Georgia,serif] text-[36px] leading-[1.15] font-normal tracking-[-0.035em] text-[#eee5d8] sm:text-[46px] lg:text-[52px]">
                How can I help you today?
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-[#b5a79a]">
                A little curiosity. A deeper understanding.
            </p>
        </div>
    );
}

export function SuggestedQueries({ onSelectQuery, disabled = false }: SuggestedQueriesProps) {
    const userId = useUserStore((state) => state.userId);
    const notebookId = useTextbookStore((state) => state.activeNotebookId);
    const sampleReady = useSourceStore((state) => state.source.some((source) => source.userId === userId &&
        source.notebookId === notebookId && source.sampleKey === "ai-engineering-v1" && source.status === "ready" && !source.deletionPending));
    const queries = sampleReady ? [
        { icon: Lightbulb, label: "Understand a concept", query: "How do dense and sparse retrieval complement each other in hybrid search?" },
        { icon: PencilLine, label: "Help me write", query: "Help me write a summary of how retrieval quality is measured, using the sample textbook." },
        { icon: BookOpen, label: "Explore a topic", query: "Why does a citation badge alone not prove that an answer is grounded?" },
    ] : SUGGESTED_QUERIES;

    return (
        <div aria-label="Suggested questions" className="mt-6 grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
            {queries.map((chip) => {
                const Icon = chip.icon;
                return (
                    <button key={chip.label} type="button" disabled={disabled} onClick={() => onSelectQuery(chip.query)}
                        className="flex min-h-[54px] items-center justify-center gap-3 rounded-[10px] border border-[#494036] bg-[#1b1815]/50 px-3 py-3 text-left text-[#ddd1c2] transition-colors hover:border-[#8a7059] hover:bg-[#27211c] disabled:cursor-wait disabled:opacity-50">
                        <Icon size={20} strokeWidth={1.4} className="shrink-0 text-[#c49b75]" />
                        <span className="font-[Georgia,serif] text-[14px] leading-snug">{chip.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

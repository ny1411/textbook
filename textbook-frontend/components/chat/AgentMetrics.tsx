"use client";

import { cn } from "@/lib/utils";
import { Brain, ChevronDown, ChevronUp, RotateCcw, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";

interface AgentMetrics {
    confidenceScore?: number | null;
    isGrounded?: boolean | null;
    critique?: string | null;
    iterationCount?: number | null;
    className?: string;
}

export function AgentMetrics({
    confidenceScore, isGrounded, critique, iterationCount, className
}: AgentMetrics) {
    const [isCritiqueExpanded, setIsCritiqueExpanded] = useState<boolean>(false);

    const normalizedScore =
        confidenceScore !== null && confidenceScore !== undefined
            ? Math.round(
                confidenceScore <= 1
                    ? confidenceScore * 100
                    : confidenceScore)
            : null;

    const getScoreColor = (score: number | null) => {
        if (score === null) return "text-zinc-400 bg-zinc-800 border-zinc-700";
        if (score >= 80) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
        if (score >= 50) return "text-amber-400 bg-amber-500/10 border-amber-500/30";
        return "text-rose-400 bg-rose-500/10 border-rose-500/30";
    };

    const getGaugeStrokeColor = (score: number | null) => {
        if (score === null) return "#71717a";
        if (score >= 80) return "#10b981";
        if (score >= 50) return "#f59e0b";
        return "#f43f5e";
    };

    return (
        <div
            className={cn(
                `rounded-xl border border-zinc-800/80 bg-zinc-950/70 
                p-3 text-xs text-zinc-300 backdrop-blur-xs transition-all`,
                className
            )}>
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-zinc-800/60">
                <div className="flex items-center gap-1.5 font-medium text-zinc-200">
                    <Brain size={14} className="text-purple-400" />
                    <span>Agent Self-Reflection Diagnostics</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-[10px] font-mono text-purple-300">
                        <RotateCcw size={10} />
                        {iterationCount} {iterationCount === 1 ? "cycle" : "cycles"}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mt-2.5">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900/80 border border-zinc-800/70">
                    {isGrounded ? (
                        <div className="size-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                            <ShieldCheck size={16} />
                        </div>
                    ) : (
                        <div className="size-7 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                            <ShieldAlert size={16} />
                        </div>
                    )}
                    <div className="flex flex-col min-w-0">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                            Groundedness
                        </span>
                        <span
                            className={cn(
                                "text-xs font-semibold truncate",
                                isGrounded ? "text-emerald-400" : "text-amber-400"
                            )}
                        >
                            {isGrounded ? "Verified in Sources" : "Partial / Check Sources"}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 p-2 rounded-lg bg-zinc-900/80 border border-zinc-800/70">
                    <div className="relative size-7 shrink-0 flex items-center justify-center">
                        <svg className="size-7 -rotate-90" viewBox="0 0 36 36">
                            <circle
                                cx="18"
                                cy="18"
                                r="14"
                                fill="none"
                                stroke="#27272a"
                                strokeWidth="3.5"
                            />
                            <circle
                                cx="18"
                                cy="18"
                                r="14"
                                fill="none"
                                stroke={getGaugeStrokeColor(normalizedScore)}
                                strokeWidth="3.5"
                                strokeDasharray="88"
                                strokeDashoffset={
                                    normalizedScore !== null ? 88 - (88 * normalizedScore) / 100 : 88
                                }
                                strokeLinecap="round"
                                className="transition-all duration-700 ease-out"
                            />
                        </svg>
                        <Sparkles size={11} className="absolute text-zinc-400" />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                            Confidence
                        </span>
                        <span className="text-xs font-mono font-semibold text-zinc-200">
                            {normalizedScore !== null ? `${normalizedScore}%` : "N/A"}
                        </span>
                    </div>
                </div>
            </div>
            {/* Expandable Critique Accordion */}
            {critique && (
                <div className="mt-2.5 pt-2 border-t border-zinc-800/60">
                    <button
                        type="button"
                        onClick={() => setIsCritiqueExpanded(!isCritiqueExpanded)}
                        className="flex items-center justify-between w-full text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer py-0.5"
                    >
                        <span className="flex items-center gap-1.5 font-medium">
                            <span>Agent Critique & Reasoning</span>
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                            {isCritiqueExpanded ? "Hide" : "Inspect"}
                            {isCritiqueExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </span>
                    </button>
                    {isCritiqueExpanded && (
                        <div className="mt-2 p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 leading-relaxed font-mono whitespace-pre-wrap animate-in fade-in duration-150">
                            {critique}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

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

    const getGaugeStrokeColor = (score: number | null) => {
        if (score === null) return "#8d8073";
        if (score >= 80) return "#a9b49b";
        if (score >= 50) return "#c49b75";
        return "#c28d78";
    };

    return (
        <div
            className={cn(
                `rounded-xl border border-[#38302a]/80 bg-[#141210]/70
                p-3 text-xs text-[#c7b5a3] backdrop-blur-xs transition-all`,
                className
            )}>
            <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[#38302a]/60">
                <div className="flex items-center gap-1.5 font-medium text-[#ddd1c2]">
                    <Brain size={14} className="text-[#c49b75]" />
                    <span>Agent Self-Reflection Diagnostics</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#c49b75]/10 border border-[#584536] text-[10px] font-mono text-[#d5ae88]">
                        <RotateCcw size={10} />
                        {iterationCount} {iterationCount === 1 ? "cycle" : "cycles"}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 mt-2.5">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-[#1d1916]/80 border border-[#38302a]/70">
                    {isGrounded ? (
                        <div className="size-7 rounded-lg bg-[#8b9d76]/10 border border-[#738361]/40 flex items-center justify-center text-[#a9b49b] shrink-0">
                            <ShieldCheck size={16} />
                        </div>
                    ) : (
                        <div className="size-7 rounded-lg bg-[#c49b75]/10 border border-[#705640] flex items-center justify-center text-[#d3ae82] shrink-0">
                            <ShieldAlert size={16} />
                        </div>
                    )}
                    <div className="flex flex-col min-w-0">
                        <span className="text-[10px] text-[#8d8073] uppercase tracking-wider font-semibold">
                            Groundedness
                        </span>
                        <span
                            className={cn(
                                "text-xs font-semibold truncate",
                                isGrounded ? "text-[#a9b49b]" : "text-[#d3ae82]"
                            )}
                        >
                            {isGrounded ? "Verified in Sources" : "Partial / Check Sources"}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 p-2 rounded-lg bg-[#1d1916]/80 border border-[#38302a]/70">
                    <div className="relative size-7 shrink-0 flex items-center justify-center">
                        <svg className="size-7 -rotate-90" viewBox="0 0 36 36">
                            <circle
                                cx="18"
                                cy="18"
                                r="14"
                                fill="none"
                                stroke="#38302a"
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
                        <Sparkles size={11} className="absolute text-[#aa9b8c]" />
                    </div>
                    <div className="flex flex-col min-w-0">
                        <span className="text-[10px] text-[#8d8073] uppercase tracking-wider font-semibold">
                            Confidence
                        </span>
                        <span className="text-xs font-mono font-semibold text-[#ddd1c2]">
                            {normalizedScore !== null ? `${normalizedScore}%` : "N/A"}
                        </span>
                    </div>
                </div>
            </div>
            {/* Expandable Critique Accordion */}
            {critique && (
                <div className="mt-2.5 pt-2 border-t border-[#38302a]/60">
                    <button
                        type="button"
                        onClick={() => setIsCritiqueExpanded(!isCritiqueExpanded)}
                        className="flex items-center justify-between w-full text-[11px] text-[#aa9b8c] hover:text-[#ddd1c2] transition-colors cursor-pointer py-0.5"
                    >
                        <span className="flex items-center gap-1.5 font-medium">
                            <span>Agent Critique & Reasoning</span>
                        </span>
                        <span className="flex items-center gap-1 text-[10px] text-[#8d8073]">
                            {isCritiqueExpanded ? "Hide" : "Inspect"}
                            {isCritiqueExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </span>
                    </button>
                    {isCritiqueExpanded && (
                        <div className="mt-2 p-2.5 rounded-lg bg-[#1d1916] border border-[#38302a] text-[11px] text-[#c7b5a3] leading-relaxed font-mono whitespace-pre-wrap animate-in fade-in duration-150">
                            {critique}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

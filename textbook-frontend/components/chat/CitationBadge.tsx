import * as Popover from "@radix-ui/react-popover";
import { CitationItem } from "@/types/api";
import { ExternalLink, FileText } from "lucide-react";

interface CitationBadgeProps {
    sourceId: string | number;
    citation?: CitationItem;
    onCitationClick?: (citation: CitationItem) => void;
}

export function CitationBadge({
    sourceId, citation, onCitationClick,
}: CitationBadgeProps) {
    if (!citation) {
        return (
            <span
                className="inline-flex items-center
            px-1.5 py-0.2 mx-0.5 text-xs font-medium
            rounded bg-zinc-800 text-zinc-400
            border border-zinc-700 select-none">
                [{sourceId}]
            </span>
        )
    }

    const scorePercentage =
        citation.rerank_score ?
            Math.round(citation.rerank_score * 100)
            : null;

    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 text-xs font-semibold rounded-md 
                    bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/30 hover:text-indigo-300 
                    border border-indigo-500/30 transition-all cursor-pointer select-none align-baseline"
                    title={`Source ${sourceId}: Click to inspect source excerpt`}>
                    <span>[{sourceId}]</span>
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    side="top"
                    align="center"
                    sideOffset={6}
                    className="z-50 w-80 max-w-[90vw] p-3.5 rounded-xl bg-zinc-900/95 backdrop-blur-md 
                    border border-zinc-800 shadow-2xl text-zinc-100 text-xs animate-in fade-in zoom-in-95 duration-150"
                >
                    <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-zinc-800">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <FileText size={20} className="text-indigo-400 shrink-0" />
                            <span className="font-semibold text-zinc-200 truncate">
                                Source {sourceId}
                            </span>
                            {citation.page_number !== null && citation.page_number !== undefined && (
                                <span className="px-1.5 py-0.5 text-[10px] rounded bg-zinc-800 text-zinc-400 font-mono">
                                    p. {citation.page_number}
                                </span>
                            )}
                        </div>
                        {scorePercentage !== null && (
                            <span
                                className="px-1.5 py-0.5 text-[10px] rounded-full font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                                title="Cross-encoder relevance score"
                            >
                                {scorePercentage}% match
                            </span>
                        )}
                    </div>
                    <div className="max-h-40 overflow-y-auto pr-1 text-zinc-300 leading-relaxed text-[11px] bg-zinc-950/60 p-2 rounded-lg border border-zinc-800/80 font-normal">
                        &ldquo;{citation.text}&ldquo;
                    </div>

                    <div className="mt-2.5 pt-2 flex items-center justify-between text-[10px] text-zinc-500 border-t border-zinc-800/60">
                        <span className="truncate max-w-[170px]" title={citation.document_id || ""}>
                            Doc: {citation.document_id || "document"}
                        </span>
                        {onCitationClick && (
                            <button
                                type="button"
                                onClick={() => onCitationClick(citation)} // <-- add onClick
                                className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium cursor-pointer"
                            >
                                <span>View Source</span>
                                <ExternalLink size={12} />
                            </button>
                        )}
                    </div>
                    <Popover.Arrow className="fill-zinc-900" />
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}
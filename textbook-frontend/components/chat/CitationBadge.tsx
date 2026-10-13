import * as Popover from "@radix-ui/react-popover";
import { CitationItem } from "@/types/api";
import { ExternalLink, FileText } from "lucide-react";
import { relevancePercentage } from "@/lib/relevance";
import { useEffect, useRef, useState } from "react";

interface CitationBadgeProps {
    sourceId: string | number;
    citation?: CitationItem;
    onCitationClick?: (citation: CitationItem) => void;
}

export function CitationBadge({
    sourceId, citation, onCitationClick,
}: CitationBadgeProps) {
    const [open, setOpen] = useState(false);
    const pinned = useRef(false);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    function cancelClose() {
        clearTimeout(closeTimer.current);
    }

    function preview() {
        cancelClose();
        setOpen(true);
    }

    function scheduleClose() {
        cancelClose();
        if (!pinned.current) closeTimer.current = setTimeout(() => setOpen(false), 200);
    }

    useEffect(() => () => clearTimeout(closeTimer.current), []);

    if (!citation) {
        return (
            <span
                className="inline-flex items-center
            px-1.5 py-0.2 mx-0.5 text-xs font-medium
            rounded bg-[#2b241e] text-[#aa9b8c]
            border border-[#494036] select-none">
                [{sourceId}]
            </span>
        )
    }

    const scorePercentage = relevancePercentage(citation.rerank_score);

    return (
        <Popover.Root open={open} onOpenChange={(next) => {
            cancelClose();
            pinned.current = next;
            setOpen(next);
        }}>
            <Popover.Trigger asChild>
                <button
                    type="button"
                    onMouseEnter={preview}
                    onMouseLeave={scheduleClose}
                    onFocus={preview}
                    onBlur={scheduleClose}
                    onClick={(event) => {
                        // A hover-open preview should stay open when its trigger is clicked.
                        event.preventDefault();
                        cancelClose();
                        pinned.current = !pinned.current;
                        setOpen(pinned.current);
                    }}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 text-xs font-semibold rounded-md
                    bg-[#c49b75]/10 text-[#c49b75] hover:bg-[#c49b75]/20 hover:text-[#d5ae88]
                    border border-[#705640] transition-all cursor-pointer select-none align-baseline"
                    title={`Source ${sourceId}: Click to inspect source excerpt`}>
                    <span>[{sourceId}]</span>
                </button>
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    aria-label={`Source ${sourceId} preview`}
                    onMouseEnter={preview}
                    onMouseLeave={scheduleClose}
                    onFocusCapture={preview}
                    onBlurCapture={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) scheduleClose();
                    }}
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    onCloseAutoFocus={(event) => event.preventDefault()}
                    data-lenis-prevent
                    side="top"
                    align="center"
                    sideOffset={6}
                    className="z-50 w-80 max-w-[90vw] p-3.5 rounded-xl bg-[#1d1916]/95 backdrop-blur-md
                    border border-[#38302a] shadow-2xl text-[#eee5d8] text-xs animate-in fade-in zoom-in-95 duration-150"
                >
                    <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-[#38302a]">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <FileText size={20} className="text-[#c49b75] shrink-0" />
                            <span className="font-semibold text-[#ddd1c2] truncate">
                                Source {sourceId}
                            </span>
                            {citation.page_number !== null && citation.page_number !== undefined && (
                                <span className="px-1.5 py-0.5 text-[10px] rounded bg-[#2b241e] text-[#aa9b8c] font-mono">
                                    p. {citation.page_number}
                                </span>
                            )}
                        </div>
                        {scorePercentage !== null && (
                            <span
                                className="px-1.5 py-0.5 text-[10px] rounded-full font-medium bg-[#8b9d76]/10 text-[#a9b49b] border border-[#738361]/30"
                                title="Normalized cross-encoder relevance; not a calibrated probability"
                            >
                                {scorePercentage}% match
                            </span>
                        )}
                    </div>
                    <div data-lenis-prevent className="max-h-40 overflow-y-auto pr-1 text-[#c7b5a3] leading-relaxed text-[11px] bg-[#141210]/60 p-2 rounded-lg border border-[#38302a]/80 font-normal">
                        &ldquo;{citation.text}&ldquo;
                    </div>

                    <div className="mt-2.5 pt-2 flex items-center justify-between text-[10px] text-[#8d8073] border-t border-[#38302a]/60">
                        <span className="truncate max-w-[170px]" title={citation.document_id || ""}>
                            Doc: {citation.document_id || "document"}
                        </span>
                        {onCitationClick && (
                            <button
                                type="button"
                                onClick={() => {
                                    pinned.current = false;
                                    setOpen(false);
                                    onCitationClick(citation);
                                }}
                                className="flex items-center gap-1 text-[#c49b75] hover:text-[#d5ae88] font-medium cursor-pointer"
                            >
                                <span>View Source</span>
                                <ExternalLink size={12} />
                            </button>
                        )}
                    </div>
                    <Popover.Arrow className="fill-[#1d1916]" />
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}

import { LoaderCircle, Sparkles } from "lucide-react";

export function ChatLoadingIndicator({ isAgentMode }: { isAgentMode: boolean }) {
    return (
        <div role="status" className="mx-auto mb-6 flex max-w-[820px] items-center gap-3">
            <div aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#584536] text-[#c49b75]">
                <Sparkles size={16} strokeWidth={1.5} />
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-[#38302a] bg-[#1b1815] px-4 py-3 text-xs text-[#b5a79a]">
                <LoaderCircle aria-hidden="true" size={14} className="shrink-0 animate-spin text-[#c49b75] motion-reduce:animate-none" />
                <span>{isAgentMode ? "Reflecting and checking your sources…" : "Finding an answer in your sources…"}</span>
            </div>
        </div>
    );
}

"use client";

import { useSourceStore } from "@/stores/useSourcesStore";
import { SourceDocument } from "@/types/source";
import { Files, Upload } from "lucide-react";
import { useState } from "react";
import { SourceCard } from "./SourceCard";
import { SourceViewerModel } from "./SourceViewerModel";

export function SidebarSources() {
    const sources = useSourceStore((s) => s.source);
    const removeSource = useSourceStore((s) => s.removeSource);
    const [inspectedSource, setInspectSource] = useState<SourceDocument | null>(null);

    return (
        <div className="h-full flex flex-col p-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                    <Files size={20} className="text-indigo-400" />
                    <h2 className="text-sm font-semibold text-zinc-200">Sources</h2>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium">
                    {sources.length}
                </span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {sources.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center p-4 border border-dashed border-zinc-800 rounded-2xl text-zinc-500"><Upload size={20} className="mb-2 text-zinc-600" />
                        <p className="flex text-xs font-medium text-zinc-400">Add sources by dropping files <br /> in chat or clicking + icon</p>

                    </div>
                ) : (
                    sources.map((source) => (
                        <SourceCard
                            key={source.filepath}
                            source={source}
                            onDelete={removeSource}
                            onInspect={setInspectSource}
                        />
                    ))
                )}
            </div>
            <SourceViewerModel
                source={inspectedSource}
                isOpen={!!inspectedSource}
                onClose={() => setInspectSource(null)}
            />
        </div>
    )
}
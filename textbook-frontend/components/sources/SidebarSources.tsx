"use client";

import { Files, Upload } from "lucide-react";
import { useState } from "react";
import { SourceCard } from "./SourceCard";
import { SourceViewerModel } from "./SourceViewerModel";
import { useSourceStore } from "@/stores/useSourcesStore";
import { SourceDocument } from "@/types/source";
import { useDocumentPoller } from "@/hooks/useDocumentStatusPoller";

export function SidebarSources() {
    useDocumentPoller();

    const sources = useSourceStore((s) => s.source);
    const selectedDocumentIds = useSourceStore((s) => s.selectedDocumentIds);
    const removeSource = useSourceStore((s) => s.removeSource);
    const toggleSourceSelection = useSourceStore((s) => s.toggleSourceSelection);
    const selectAllSources = useSourceStore((s) => s.selectAllSources);
    const deselectAllSources = useSourceStore((s) => s.deselectAllSources);
    const [inspectedSource, setInspectSource] = useState<SourceDocument | null>(null);

    const selectableSources = sources.filter((source) => source.documentId && source.status !== "failed");
    const selectedCount = selectedDocumentIds === null
        ? selectableSources.length
        : selectableSources.filter((source) => selectedDocumentIds.includes(source.documentId!)).length;
    const allSelected = selectableSources.length > 0 && selectedCount === selectableSources.length;

    return (
        <div className="h-full flex flex-col p-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                    <Files size={20} className="text-indigo-400" />
                    <h2 className="text-sm font-semibold text-zinc-200">Sources</h2>
                </div>
                <label className="flex items-center gap-2 text-xs text-zinc-400" title="Select all sources">
                    <span>{selectedCount}/{selectableSources.length}</span>
                    <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={selectableSources.length === 0}
                        onChange={(event) => event.target.checked ? selectAllSources() : deselectAllSources()}
                        aria-label="Select all sources"
                        className="size-4 accent-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                    />
                </label>
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
                            isSelected={
                                source.status !== "failed" && (
                                    selectedDocumentIds === null ||
                                    (!!source.documentId && selectedDocumentIds.includes(source.documentId))
                                )
                            }
                            onToggle={toggleSourceSelection}
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

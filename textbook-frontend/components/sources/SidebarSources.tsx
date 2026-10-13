"use client";

import { BookOpen, File, Files } from "lucide-react";
import { useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { deleteDocument } from "@/lib/api/documents";
import { SourceCard } from "./SourceCard";
import { SourceViewerModel } from "./SourceViewerModel";
import { useSourceStore } from "@/stores/useSourcesStore";
import { SourceDocument } from "@/types/source";
import { useDocumentPoller } from "@/hooks/useDocumentStatusPoller";
import { useUserStore } from "@/stores/useUserStore";
import { useTextbookStore } from "@/stores/useTextbookStore";

export function SidebarSources() {
    useDocumentPoller();

    const allSources = useSourceStore((s) => s.source);
    const userId = useUserStore((s) => s.userId);
    const notebookId = useTextbookStore((s) => s.activeNotebookId);
    const sources = allSources.filter((source) => source.userId === userId && source.notebookId === notebookId);
    const selectedDocumentIds = useSourceStore((s) => s.selectedDocumentIds);
    const removeSource = useSourceStore((s) => s.removeSource);
    const toggleSourceSelection = useSourceStore((s) => s.toggleSourceSelection);
    const selectAllSources = useSourceStore((s) => s.selectAllSources);
    const deselectAllSources = useSourceStore((s) => s.deselectAllSources);
    const [inspectedSource, setInspectSource] = useState<SourceDocument | null>(null);
    const activeDeletions = useRef(new Set<string>());
    const [deletingIds, setDeletingIds] = useState<string[]>([]);
    const [deletionErrors, setDeletionErrors] = useState<Record<string, string>>({});
    const visibleInspection = inspectedSource?.userId === userId && inspectedSource.notebookId === notebookId
        ? inspectedSource : null;

    const selectableSources = sources.filter((source) => source.documentId && source.status !== "failed" && !source.deletionPending &&
        (!source.sampleKey || source.status === "ready"));
    const selectedCount = selectedDocumentIds === null
        ? selectableSources.length
        : selectableSources.filter((source) => selectedDocumentIds.includes(source.documentId!)).length;
    const allSelected = selectableSources.length > 0 && selectedCount === selectableSources.length;

    const removeDocument = async (source: SourceDocument) => {
        if (!source.documentId || !source.notebookId || activeDeletions.current.has(source.documentId)) return;
        const documentId = source.documentId;
        activeDeletions.current.add(documentId);
        setDeletingIds((ids) => [...ids, documentId]);
        setDeletionErrors((errors) => ({ ...errors, [documentId]: "" }));
        try {
            await deleteDocument(documentId, source.notebookId);
            if (useUserStore.getState().userId !== source.userId ||
                useTextbookStore.getState().activeNotebookId !== source.notebookId) return;
            removeSource(source.filepath);
            setInspectSource((current) => current?.documentId === documentId ? null : current);
        } catch (error) {
            if (useUserStore.getState().userId !== source.userId ||
                useTextbookStore.getState().activeNotebookId !== source.notebookId) return;
            // A lost response can follow a committed intent. Keep the source
            // available to retry, but prevent selecting potentially deleted data.
            if (!(error instanceof ApiError) || error.status === 503) {
                useSourceStore.getState().markDeletionPending(documentId);
            }
            setDeletionErrors((errors) => ({ ...errors, [documentId]: error instanceof Error
                ? error.message : "Could not remove source. Retry removal." }));
        } finally {
            activeDeletions.current.delete(documentId);
            setDeletingIds((ids) => ids.filter((id) => id !== documentId));
        }
    };

    return (
        <div className="h-full min-h-0 flex flex-col px-5 pt-5">
            {/* Header */}
            <div className="flex items-center justify-between pb-5">
                <div className="flex items-center gap-2">
                    <Files size={18} strokeWidth={1.5} className="text-accent" aria-hidden="true" />
                    <h2 className="text-[14px] font-medium text-foreground">Sources</h2>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted" title="Select all sources">
                    <span>{selectedCount}/{selectableSources.length}</span>
                    <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={selectableSources.length === 0}
                        onChange={(event) => event.target.checked ? selectAllSources() : deselectAllSources()}
                        aria-label="Select all sources"
                        className={`size-3.5 accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 ${selectableSources.length === 0 ? "sr-only" : ""}`}
                    />
                </label>
            </div>
            <div data-lenis-prevent className="flex-1 min-h-0 overflow-y-auto space-y-2 pb-5">
                {sources.length === 0 ? (
                    <div className="flex min-h-[190px] flex-col items-center justify-center rounded-[10px] border border-dashed border-border px-4 py-7 text-center">
                        <File size={28} strokeWidth={1.2} className="mb-4 text-muted" aria-hidden="true" />
                        <p className="font-serif text-[17px] text-foreground">Your research starts here</p>
                        <p className="mt-2 max-w-[185px] text-[12px] leading-5 text-muted">Add PDFs or notes with the <span className="text-foreground">+</span> in chat.</p>
                    </div>
                ) : (
                    sources.map((source) => (
                        <SourceCard
                            key={source.filepath}
                            source={source}
                            isSelected={
                                source.status !== "failed" && !source.deletionPending && (!source.sampleKey || source.status === "ready") && (
                                    selectedDocumentIds === null ||
                                    (!!source.documentId && selectedDocumentIds.includes(source.documentId))
                                )
                            }
                            onToggle={toggleSourceSelection}
                            onDelete={removeDocument}
                            isDeleting={!!source.documentId && deletingIds.includes(source.documentId)}
                            deletionError={source.documentId ? deletionErrors[source.documentId] : undefined}
                            onInspect={setInspectSource}
                        />
                    ))
                )}
            </div>
            <div className="flex shrink-0 items-center gap-3 border-t border-border py-5 text-[11px] text-muted">
                <BookOpen size={22} strokeWidth={1.25} className="shrink-0 text-accent" aria-hidden="true" />
                <span>Your personal research space</span>
            </div>
            <SourceViewerModel
                source={visibleInspection}
                isOpen={!!visibleInspection}
                onClose={() => setInspectSource(null)}
            />
        </div>
    )
}

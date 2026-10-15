"use client";

import { cn } from "@/lib/utils";
import { StudioNote, useTextbookStore } from "@/stores/useTextbookStore";
import { useState } from "react";
import { toast } from "sonner";
import { relevancePercentage } from "@/lib/relevance";
import { ReadAloud } from "@/components/voice/ReadAloud";
import { AudioOverview } from "@/components/studio/AudioOverview";
import { NotesExport } from "@/components/studio/NotesExport";
import { useUserStore } from "@/stores/useUserStore";
import {
    BookOpen,
    FileText,
    StickyNote,
    Plus,
    Trash2,
    Copy,
    Check,
    Quote,
    SlidersHorizontal,
} from "lucide-react";

export function StudioPanel() {
    const {
        activeCitation,
        setActiveCitation,
        activeStudioTab,
        setActiveStudioTab,
        notes,
        addNote,
        deleteNote,
        setInspectorOpen,
        activeNotebookId,
    } = useTextbookStore();
    const userId = useUserStore((state) => state.userId);

    const [newNoteContent, setNewNoteContent] = useState<string>("");
    const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
    const scorePercentage = relevancePercentage(activeCitation?.rerank_score);

    const handleCreateNote = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newNoteContent.trim()) return;
        addNote(newNoteContent.trim());
        setNewNoteContent("");
        toast.success("Note added.");
    }

    const handleCopyNote = async (note: StudioNote) => {
        await navigator.clipboard.writeText(note.content);
        setCopiedNoteId(note.id);
        toast.success("Note copied to clipboard");
        setTimeout(() => setCopiedNoteId(null), 2000);
    }

    const handleInsertCitationToNotes = () => {
        if (!activeCitation) return;
        const quoteText = `"${activeCitation.text}"\n\n-Source[${activeCitation.source_id}]
        (Page ${activeCitation.page_number ?? "N/A"})`;

        addNote(
            quoteText,
            {
                sourceId: activeCitation.source_id,
                documentId: activeCitation.document_id,
                pageNumber: activeCitation.page_number,
                excerpt: activeCitation.text,
            },
            `Quote from source [${activeCitation.source_id}]`
        );
        setActiveStudioTab("notes");
        toast.success("Quotation saved into Studio Notes.");
    };

    return (
        <div className="h-full flex flex-col bg-background text-foreground select-none">

            <div className="p-5 border-b border-border shrink-0">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <BookOpen size={18} strokeWidth={1.5} className="text-accent" aria-hidden="true" />
                        <span className="font-serif text-xl text-foreground">
                            Studio
                        </span>
                    </div>
                    <button
                        onClick={() => setInspectorOpen(true)}
                        title="Open Retrieval Inspector"
                        aria-label="Open Retrieval Inspector from Studio"
                        aria-haspopup="dialog"
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-surface/80 hover:bg-surface text-foreground/85 border border-border/60 transition-colors cursor-pointer"
                    >
                        <SlidersHorizontal size={11} className="text-accent" />
                        <span>Diagnostics</span>
                    </button>
                </div>
                {/* Tab Switcher */}
                <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-background border border-border">
                    <button
                        onClick={() => setActiveStudioTab("citation")}
                        className={cn(
                            "flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer",
                            activeStudioTab === "citation"
                                ? "bg-surface text-foreground shadow-xs"
                                : "text-muted hover:text-foreground"
                        )}
                    >
                        <FileText size={13} />
                        <span>Active Citation</span>
                        {activeCitation && (
                            <span className="size-1.5 rounded-full bg-accent" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveStudioTab("notes")}
                        className={cn(
                            "flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-md transition-colors cursor-pointer",
                            activeStudioTab === "notes"
                                ? "bg-surface text-foreground shadow-xs"
                                : "text-muted hover:text-foreground"
                        )}
                    >
                        <StickyNote size={13} />
                        <span>Notes ({notes.length})</span>
                    </button>
                </div>
            </div>

            <div data-lenis-prevent className="flex-1 overflow-y-auto p-4 space-y-4 select-text">
                {/* TAB 1: ACTIVE CITATION */}
                {activeStudioTab === "citation" && (
                    <div>
                        {activeCitation ? (
                            <div className="space-y-3.5 animate-in fade-in duration-200">
                                {/* Source Badge & Rerank Score */}
                                <div className="flex items-center justify-between pb-2 border-b border-border">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/30 text-xs font-semibold font-mono">
                                            Source [{activeCitation.source_id}]
                                        </span>
                                        {activeCitation.page_number !== null &&
                                            activeCitation.page_number !== undefined && (
                                                <span className="px-1.5 py-0.5 rounded bg-surface text-muted text-[11px] font-mono">
                                                    Page {activeCitation.page_number}
                                                </span>
                                            )}
                                    </div>
                                    {scorePercentage !== null && (
                                        <span title="Normalized cross-encoder relevance; not a calibrated probability" className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-mono">
                                            {scorePercentage}% match
                                        </span>
                                    )}
                                </div>

                                <div className="p-3.5 rounded-xl bg-background border border-border/80 text-xs text-foreground leading-relaxed font-serif">
                                    &ldquo;{activeCitation.text}&rdquo;
                                </div>

                                <div className="space-y-1.5 text-[11px] text-muted bg-surface/50 p-2.5 rounded-lg border border-border">
                                    <div className="flex justify-between">
                                        <span className="text-muted/80">Document ID:</span>
                                        <span className="font-mono text-foreground/85 truncate max-w-[200px]" title={activeCitation.document_id || "default"}>
                                            {activeCitation.document_id || "default"}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted/80">Chunk ID:</span>
                                        <span className="font-mono text-foreground/85 truncate max-w-[200px]" title={activeCitation.chunk_id}>
                                            {activeCitation.chunk_id}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-1">
                                    <button
                                        onClick={handleInsertCitationToNotes}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-accent hover:bg-accent/90 text-background text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                                    >
                                        <Quote size={13} />
                                        <span>Save to Notes</span>
                                    </button>
                                    <button
                                        onClick={() => setActiveCitation(null)}
                                        className="px-3 py-2 rounded-lg bg-surface hover:bg-surface text-foreground/85 text-xs font-medium transition-colors cursor-pointer"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="h-64 flex flex-col items-center justify-center text-center p-4 rounded-xl border border-dashed border-border text-muted/80">
                                <FileText size={28} className="mb-2 text-muted/65" />
                                <p className="text-xs font-medium text-muted">No Citation Selected</p>
                                <p className="text-[11px] mt-1 text-muted/80 max-w-[220px]">
                                    Click on any <span className="text-accent font-mono">[1]</span> citation pill in the chat to inspect its full passage here.
                                </p>
                            </div>
                        )}
                    </div>
                )}
                {/* TAB 2: STUDIO NOTES */}
                {activeStudioTab === "notes" && (
                    <div className="space-y-4">
                        <AudioOverview />
                        <NotesExport key={`${userId}:${activeNotebookId}`} notes={notes} />
                        <form onSubmit={handleCreateNote} className="space-y-2">
                            <textarea
                                aria-label="New research note"
                                value={newNoteContent}
                                data-lenis-prevent
                                onChange={(e) => setNewNoteContent(e.target.value)}
                                placeholder="Take a note, summarize findings, or jot down thoughts..."
                                rows={3}
                                className="w-full rounded-xl bg-background border border-border p-2.5 text-xs text-foreground placeholder:text-muted/65 focus:outline-none focus:border-accent/60 focus:ring-1 focus:ring-accent/30 transition-all resize-none"
                            />
                            <div className="flex justify-end">
                                <button
                                    type="submit"
                                    disabled={!newNoteContent.trim()}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent hover:bg-accent/90 disabled:opacity-40 disabled:hover:bg-accent text-background text-xs font-medium transition-all cursor-pointer"
                                >
                                    <Plus size={13} />
                                    <span>Add Note</span>
                                </button>
                            </div>
                        </form>

                        <div className="space-y-2.5">
                            {notes.length === 0 ? (
                                <div className="h-44 flex flex-col items-center justify-center text-center p-4 rounded-xl border border-dashed border-border text-muted/80">
                                    <StickyNote size={24} className="mb-2 text-muted/65" />
                                    <p className="text-xs font-medium text-muted">Your notes are empty</p>
                                </div>
                            ) : (
                                notes.map((note) => (
                                    <div
                                        key={note.id}
                                        className="group relative p-3 rounded-xl bg-background border border-border/80 hover:border-border/80 transition-all space-y-2"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-semibold text-foreground/85 truncate max-w-[180px]">
                                                {note.title || "Note"}
                                            </span>
                                            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleCopyNote(note)}
                                                    title="Copy note text"
                                                    aria-label={`Copy ${note.title || "note"}`}
                                                    className="p-1 rounded text-muted hover:text-foreground hover:bg-surface cursor-pointer"
                                                >
                                                    {copiedNoteId === note.id ? (
                                                        <Check size={12} className="text-emerald-400" />
                                                    ) : (
                                                        <Copy size={12} />
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        deleteNote(note.id);
                                                        toast.info("Note deleted");
                                                    }}
                                                    title="Delete note"
                                                    aria-label={`Delete ${note.title || "note"}`}
                                                    className="p-1 rounded text-muted/80 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-xs text-foreground/85 whitespace-pre-wrap leading-relaxed">
                                            {note.content}
                                        </p>
                                        <ReadAloud id={`note-${note.id}`} text={note.content} title={note.title || "Studio note"} />
                                        <div className="flex items-center justify-between pt-1 border-t border-border text-[10px] text-muted/80">
                                            <span>{new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            {note.sourceRef && (
                                                <span className="text-accent/80 font-mono">
                                                    Source [{note.sourceRef.sourceId}]
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

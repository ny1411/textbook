"use client";

import { cn } from "@/lib/utils";
import { StudioNote, useTextbookStore } from "@/stores/useTextbookStore";
import { useState } from "react";
import { toast } from "sonner";
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
    } = useTextbookStore();

    const [newNoteContent, setNewNoteContent] = useState<string>("");
    const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);

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
        <div className="h-full flex flex-col bg-zinc-900 text-zinc-100 select-none">

            <div className="p-3 border-b border-zinc-800 shrink-0">
                <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                        <BookOpen size={16} className="text-indigo-400" />
                        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                            Studio & Notes
                        </span>
                    </div>
                    <button
                        onClick={() => setInspectorOpen(true)}
                        title="Open Retrieval Inspector"
                        className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/60 transition-colors cursor-pointer"
                    >
                        <SlidersHorizontal size={11} className="text-indigo-400" />
                        <span>Diagnostics</span>
                    </button>
                </div>
                {/* Tab Switcher */}
                <div className="grid grid-cols-2 gap-1 p-0.5 rounded-lg bg-zinc-950 border border-zinc-800">
                    <button
                        onClick={() => setActiveStudioTab("citation")}
                        className={cn(
                            "flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer",
                            activeStudioTab === "citation"
                                ? "bg-zinc-800 text-zinc-100 shadow-xs"
                                : "text-zinc-400 hover:text-zinc-200"
                        )}
                    >
                        <FileText size={13} />
                        <span>Active Citation</span>
                        {activeCitation && (
                            <span className="size-1.5 rounded-full bg-indigo-400 animate-pulse" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveStudioTab("notes")}
                        className={cn(
                            "flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer",
                            activeStudioTab === "notes"
                                ? "bg-zinc-800 text-zinc-100 shadow-xs"
                                : "text-zinc-400 hover:text-zinc-200"
                        )}
                    >
                        <StickyNote size={13} />
                        <span>Notes ({notes.length})</span>
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 select-text">
                {/* TAB 1: ACTIVE CITATION */}
                {activeStudioTab === "citation" && (
                    <div>
                        {activeCitation ? (
                            <div className="space-y-3.5 animate-in fade-in duration-200">
                                {/* Source Badge & Rerank Score */}
                                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                                    <div className="flex items-center gap-2">
                                        <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-semibold font-mono">
                                            Source [{activeCitation.source_id}]
                                        </span>
                                        {activeCitation.page_number !== null &&
                                            activeCitation.page_number !== undefined && (
                                                <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[11px] font-mono">
                                                    Page {activeCitation.page_number}
                                                </span>
                                            )}
                                    </div>
                                    {activeCitation.rerank_score !== null &&
                                        activeCitation.rerank_score !== undefined && (
                                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[11px] font-mono">
                                                {Math.round(activeCitation.rerank_score * 100)}% match
                                            </span>
                                        )}
                                </div>

                                <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800/80 text-xs text-zinc-200 leading-relaxed font-serif">
                                    &ldquo;{activeCitation.text}&rdquo;
                                </div>

                                <div className="space-y-1.5 text-[11px] text-zinc-400 bg-zinc-850/50 p-2.5 rounded-lg border border-zinc-800">
                                    <div className="flex justify-between">
                                        <span className="text-zinc-500">Document ID:</span>
                                        <span className="font-mono text-zinc-300 truncate max-w-[200px]" title={activeCitation.document_id || "default"}>
                                            {activeCitation.document_id || "default"}
                                        </span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-zinc-500">Chunk ID:</span>
                                        <span className="font-mono text-zinc-300 truncate max-w-[200px]" title={activeCitation.chunk_id}>
                                            {activeCitation.chunk_id}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex gap-2 pt-1">
                                    <button
                                        onClick={handleInsertCitationToNotes}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                                    >
                                        <Quote size={13} />
                                        <span>Save to Notes</span>
                                    </button>
                                    <button
                                        onClick={() => setActiveCitation(null)}
                                        className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="h-64 flex flex-col items-center justify-center text-center p-4 rounded-xl border border-dashed border-zinc-800 text-zinc-500">
                                <FileText size={28} className="mb-2 text-zinc-600" />
                                <p className="text-xs font-medium text-zinc-400">No Citation Selected</p>
                                <p className="text-[11px] mt-1 text-zinc-500 max-w-[220px]">
                                    Click on any <span className="text-indigo-400 font-mono">[1]</span> citation pill in the chat to inspect its full passage here.
                                </p>
                            </div>
                        )}
                    </div>
                )}
                {/* TAB 2: STUDIO NOTES */}
                {activeStudioTab === "notes" && (
                    <div className="space-y-4">

                        <form onSubmit={handleCreateNote} className="space-y-2">
                            <textarea
                                value={newNoteContent}
                                onChange={(e) => setNewNoteContent(e.target.value)}
                                placeholder="Take a note, summarize findings, or jot down thoughts..."
                                rows={3}
                                className="w-full rounded-xl bg-zinc-950 border border-zinc-800 p-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all resize-none"
                            />
                            <div className="flex justify-end">
                                <button
                                    type="submit"
                                    disabled={!newNoteContent.trim()}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white text-xs font-medium transition-all cursor-pointer"
                                >
                                    <Plus size={13} />
                                    <span>Add Note</span>
                                </button>
                            </div>
                        </form>

                        <div className="space-y-2.5">
                            {notes.length === 0 ? (
                                <div className="h-44 flex flex-col items-center justify-center text-center p-4 rounded-xl border border-dashed border-zinc-800 text-zinc-500">
                                    <StickyNote size={24} className="mb-2 text-zinc-600" />
                                    <p className="text-xs font-medium text-zinc-400">Your notes are empty</p>
                                </div>
                            ) : (
                                notes.map((note) => (
                                    <div
                                        key={note.id}
                                        className="group relative p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 hover:border-zinc-700/80 transition-all space-y-2"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-semibold text-zinc-300 truncate max-w-[180px]">
                                                {note.title || "Note"}
                                            </span>
                                            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleCopyNote(note)}
                                                    title="Copy note text"
                                                    className="p-1 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 cursor-pointer"
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
                                                    className="p-1 rounded text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                                            {note.content}
                                        </p>
                                        <div className="flex items-center justify-between pt-1 border-t border-zinc-850 text-[10px] text-zinc-500">
                                            <span>{new Date(note.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            {note.sourceRef && (
                                                <span className="text-indigo-400/80 font-mono">
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

"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { StudioNote } from "@/stores/useTextbookStore";
import { createNotesPdf, downloadNotesBlob, notesAsMarkdown, notesFilename } from "@/lib/notes-export";

interface NotesExportProps {
    notes: readonly StudioNote[];
    notebookTitle?: string;
}

export function NotesExport({ notes, notebookTitle = "Studio Notes" }: NotesExportProps) {
    const [exporting, setExporting] = useState<"md" | "pdf" | null>(null);
    const mounted = useRef(false);
    const generation = useRef(0);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            generation.current += 1;
        };
    }, [notes, notebookTitle]);

    async function exportNotes(format: "md" | "pdf") {
        if (!notes.length || exporting) return;
        const exportGeneration = generation.current;
        const isCurrent = () => mounted.current && generation.current === exportGeneration;
        setExporting(format);
        try {
            const blob = format === "pdf"
                ? await createNotesPdf(notes, notebookTitle)
                : new Blob([notesAsMarkdown(notes, notebookTitle)], { type: "text/markdown;charset=utf-8" });
            if (!isCurrent()) return;
            downloadNotesBlob(blob, notesFilename(notebookTitle, format));
            toast.success(`Notes exported as ${format === "md" ? "Markdown" : "PDF"}.`);
        } catch (error) {
            if (isCurrent()) toast.error(error instanceof Error ? error.message : "Could not export notes. Please try again.");
        } finally {
            if (mounted.current) setExporting(null);
        }
    }

    return (
        <div className="flex flex-wrap gap-2" aria-label="Export notes" aria-busy={exporting !== null}>
            {(["md", "pdf"] as const).map((format) => (
                <button
                    key={format}
                    type="button"
                    disabled={!notes.length || exporting !== null}
                    onClick={() => void exportNotes(format)}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {exporting === format ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Download size={13} aria-hidden="true" />}
                    {exporting === format ? "Exporting…" : `Export ${format === "md" ? "Markdown" : "PDF"}`}
                </button>
            ))}
        </div>
    );
}

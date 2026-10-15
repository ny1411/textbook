import { SourceDocument } from "@/types/source";
import { Eye, FileText, Loader2, Trash2 } from "lucide-react";

interface SourceCardProps {
    source: SourceDocument;
    isSelected: boolean;
    onToggle: (documentId: string) => void;
    onDelete: (source: SourceDocument) => void;
    isDeleting?: boolean;
    deletionError?: string;
    onInspect: (source: SourceDocument) => void;
}

export function SourceCard({ source, isSelected, onToggle, onDelete, onInspect, isDeleting = false, deletionError }: SourceCardProps) {
    const formattedSize = source.size ?
        `${(source.size / 1024).toFixed(0)}KB` : "Unknown Size";

    return (
        <div className="group flex items-center gap-2.5 rounded-[10px] border border-border bg-surface/50 p-3 transition-colors hover:border-accent/40">
            <input
                type="checkbox"
                checked={isSelected}
                disabled={!source.documentId || source.status === "failed" || source.deletionPending || isDeleting ||
                    (!!source.sampleKey && source.status !== "ready")}
                onChange={() => source.documentId && onToggle(source.documentId)}
                aria-label={`Use ${source.filename} in answers`}
                className="size-3.5 shrink-0 accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
            />
            <FileText size={19} strokeWidth={1.5} className="text-accent shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate"
                    title={source.filename}>
                    {source.filename}
                </p>
                <p className="mt-1 text-[11px] text-muted">{formattedSize}</p>
                {source.deletionPending ? <p className="text-xs text-amber-400">Deletion pending · Retry removal</p> : null}
                {deletionError ? <p role="alert" className="text-xs text-red-400">{deletionError}</p> : null}
            </div>

            {source.status === "processing" ? <Loader2 size={12} className="animate-spin text-muted" aria-label="Processing source" /> : null}
                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                        type="button"
                        onClick={() => onInspect(source)}
                        className="flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-foreground"
                        aria-label={`Inspect ${source.filename}`} title="Inspect source">
                        <Eye size={14} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        className="flex size-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                        title={source.deletionPending ? "Retry removal" : "Remove source"}
                        aria-label={`${source.deletionPending ? "Retry removal of" : "Remove"} ${source.filename}`}
                        disabled={isDeleting || !source.documentId || !source.notebookId}
                        onClick={() => onDelete(source)}>
                        {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} aria-hidden="true" />}
                    </button>
                </div>
        </div>
    )
}

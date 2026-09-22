import { SourceDocument } from "@/types/source";
import { Eye, FileText, Loader2, Trash2 } from "lucide-react";

interface SourceCardProps {
    source: SourceDocument;
    onDelete: (filepath: string) => void;
    onInspect: (source: SourceDocument) => void;
}

export function SourceCard({ source, onDelete, onInspect }: SourceCardProps) {
    const formattedSize = source.size ?
        `${(source.size / 1024).toFixed(0)}KB` : "Unknown Size";

    return (
        <div className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 transition-all group">
            <FileText size={20} className="text-indigo-400 shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate"
                    title={source.filename}>
                    {source.filename}
                </p>
                <p className="text-xs text-zinc-500">{formattedSize}</p>
            </div>

            {source.status === "processing" ?
                (<span className="flex items-center gap-1 text-zinc-500 text-xs">
                    <Loader2 size={12} className="animate-spin" />
                </span>)
                :
                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                    <button
                        onClick={() => onInspect(source)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer transition-colors"
                        title="Inspect source">
                        <Eye size={15} className="text-zinc-500" />
                    </button>
                    <button
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 cursor-pointer transition-colors"
                        title="Remove source"
                        onClick={() => onDelete(source.filepath)}>
                        <Trash2 size={15} className="text-zinc-500" />
                    </button>
                </div>
            }
        </div>
    )
}
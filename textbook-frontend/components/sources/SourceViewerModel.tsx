"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { SourceDocument } from "@/types/source";
import { Calendar, FileText, HardDrive, X } from "lucide-react";

interface SourceViewerModelProps {
    source: SourceDocument | null;
    isOpen: boolean;
    onClose: () => void;
}

export function SourceViewerModel({ source, isOpen, onClose }: SourceViewerModelProps) {
    if (!source) return null;

    return (
        <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 animate-in fade-in duration-200" />
                <Dialog.Content className="fixed top-1/2 left-1/2
                -translate-x-1/2 -translate-y-1/2
                w-full max-w-lg bg-zinc-900 border border-zinc-800
                p-6 rounded-2xl z-50 shadow-2xl"
                    style={{ animationDuration: "200ms" }}
                >
                    <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                        <div className="flex items-center gap-2">
                            <FileText size={20} className="text-indigo-400" />
                            <Dialog.Title className="text-base font-semibold text-zinc-100 truncate max-w-sm">
                                {source.filename}
                            </Dialog.Title>
                        </div>
                        <Dialog.Close asChild>
                            <button className="text-zinc-400 hover:text-zinc-100 p-1 rounded-lg hover:bg-zinc-800 cursor-pointer">
                                <X size={20} />
                            </button>
                        </Dialog.Close>
                    </div>
                    <div className="mt-4 space-y-3 text-xs text-zinc-400">
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/40">
                            <span className="flex items-center gap-2">
                                <HardDrive size={20} /> File Size
                            </span>
                            <span className="font-mono text-zinc-200">
                                {source.uploadedAt ?
                                    new Date(source.uploadedAt).toLocaleTimeString()
                                    : "Just Now"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/40">
                            <span className="flex items-center gap-2">
                                <Calendar size={14} /> Uploaded
                            </span>
                            <span className="font-mono text-zinc-200">
                                {source.uploadedAt ? new Date(source.uploadedAt).toLocaleTimeString() : "Just now"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/40">
                            <span>Path</span>
                            <span className="font-mono text-zinc-400 truncate max-w-[240px]">{source.filepath}</span>
                        </div>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}
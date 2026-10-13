"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { SourceDocument } from "@/types/source";
import { Calendar, FileText, HardDrive, X } from "lucide-react";
import { useRef } from "react";

interface SourceViewerModelProps {
    source: SourceDocument | null;
    isOpen: boolean;
    onClose: () => void;
}

export function SourceViewerModel({ source, isOpen, onClose }: SourceViewerModelProps) {
    const returnFocusRef = useRef<HTMLElement | null>(null);
    if (!source) return null;

    return (
        <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 animate-in fade-in duration-200" />
                <Dialog.Content data-lenis-prevent className="fixed top-1/2 left-1/2
                -translate-x-1/2 -translate-y-1/2
                w-[calc(100%_-_32px)] max-w-lg max-h-[88dvh] overflow-y-auto bg-background border border-border
                p-6 rounded-2xl z-50 shadow-2xl"
                    style={{ animationDuration: "200ms" }}
                    onOpenAutoFocus={() => {
                        if (document.activeElement instanceof HTMLElement) returnFocusRef.current = document.activeElement;
                    }}
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        returnFocusRef.current?.focus();
                    }}
                >
                    <div className="flex items-center justify-between gap-4 pb-4 border-b border-border">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                            <FileText size={20} className="shrink-0 text-accent" aria-hidden="true" />
                            <Dialog.Title className="min-w-0 max-w-sm truncate font-serif text-xl text-foreground">
                                {source.filename}
                            </Dialog.Title>
                        </div>
                        <Dialog.Close asChild>
                            <button type="button" aria-label="Close source details" className="shrink-0 rounded-lg p-1 text-muted hover:bg-surface hover:text-foreground">
                                <X size={20} />
                            </button>
                        </Dialog.Close>
                    </div>
                    <Dialog.Description className="mt-4 text-xs text-muted">Details for this research source.</Dialog.Description>
                    <div className="mt-4 space-y-3 text-xs text-muted">
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface/40">
                            <span className="flex items-center gap-2">
                                <HardDrive size={20} /> File Size
                            </span>
                            <span className="font-mono text-foreground">
                                {source.size ? `${(source.size / 1024).toFixed(0)} KB` : "Unknown size"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface/40">
                            <span className="flex items-center gap-2">
                                <Calendar size={14} /> Uploaded
                            </span>
                            <span className="font-mono text-foreground">
                                {source.uploadedAt ? new Date(source.uploadedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Just now"}
                            </span>
                        </div>
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface/40">
                            <span>Path</span>
                            <span className="max-w-[65%] truncate font-mono text-muted" title={source.filepath}>{source.filepath}</span>
                        </div>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}

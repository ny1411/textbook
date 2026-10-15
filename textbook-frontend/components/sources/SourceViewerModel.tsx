"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { SourceDocument } from "@/types/source";
import { FileText, X } from "lucide-react";
import { useRef } from "react";
import { DocumentPreview } from "./DocumentPreview";

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
                w-[calc(100%_-_32px)] max-w-6xl h-[88dvh] flex flex-col overflow-hidden bg-background border border-border
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
                    <Dialog.Description className="sr-only">Document preview for this research source.</Dialog.Description>
                    <div className="min-h-0 flex-1 overflow-hidden pt-4">
                        {isOpen && <DocumentPreview key={source.documentId ?? source.filepath} source={source} />}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}

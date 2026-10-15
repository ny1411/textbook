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
    const uploadedAt = source.uploadedAt ? new Date(source.uploadedAt) : null;
    const validUploadDate = uploadedAt && !Number.isNaN(uploadedAt.getTime()) ? uploadedAt : null;
    const size = source.size === undefined ? "Unknown" : source.size < 1024
        ? `${source.size} B` : source.size < 1024 * 1024
            ? `${(source.size / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB`
            : `${(source.size / (1024 * 1024)).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`;

    return (
        <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 animate-in fade-in duration-200" />
                <Dialog.Content data-lenis-prevent className="fixed top-1/2 left-1/2
                -translate-x-1/2 -translate-y-1/2
                w-[calc((100%_-_32px)_*_0.6)] max-w-[43.2rem] h-[52.8dvh] flex flex-col overflow-hidden bg-background border border-border
                p-4 sm:p-5 rounded-2xl z-50 shadow-2xl"
                    style={{ animationDuration: "200ms" }}
                    onOpenAutoFocus={() => {
                        if (document.activeElement instanceof HTMLElement) returnFocusRef.current = document.activeElement;
                    }}
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        returnFocusRef.current?.focus();
                    }}
                >
                    <div className="flex shrink-0 items-center justify-between gap-4 pb-3 border-b border-border">
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

                    <div className="min-h-0 flex-1 overflow-hidden pt-2">
                        {isOpen && <DocumentPreview key={source.documentId ?? source.filepath} source={source} details={
                            <dl className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
                                <div className="flex min-w-0 flex-col gap-1">
                                    <dt>Uploaded</dt>
                                    <dd className="text-foreground">{validUploadDate
                                        ? <time dateTime={validUploadDate.toISOString()}>{validUploadDate.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>
                                        : "Unknown"}</dd>
                                </div>
                                <div className="flex min-w-0 flex-col gap-1">
                                    <dt>Document size</dt>
                                    <dd className="text-foreground" title={source.size === undefined ? undefined : `${source.size.toLocaleString()} bytes`}>{size}</dd>
                                </div>
                            </dl>
                        } />}
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    )
}

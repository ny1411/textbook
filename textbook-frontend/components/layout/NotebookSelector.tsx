"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { BookOpen, LoaderCircle, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { SelectMenu } from "@/components/ui/select-menu";
import { useTextbookStore } from "@/stores/useTextbookStore";
import type { Notebook } from "@/lib/api/conversations";

const CREATE_NOTEBOOK = "create-notebook";

export interface NotebookSelectorProps {
    notebooks: Notebook[];
    notebookId: string;
    onCreateNotebook: (name: string, id: string, signal: AbortSignal) => Promise<Notebook>;
}

export function NotebookSelector({ notebooks, notebookId, onCreateNotebook }: NotebookSelectorProps) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const request = useRef<AbortController | null>(null);
    const draftId = useRef<string | null>(null);
    const returnFocus = useRef<HTMLElement | null>(null);
    useEffect(() => () => request.current?.abort(), []);

    const changeOpen = (next: boolean) => {
        if (saving) return;
        setOpen(next);
        if (!next) {
            setName("");
            setError(null);
            draftId.current = null;
        }
    };

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        if (!name.trim() || saving || request.current) return;
        const controller = new AbortController();
        request.current = controller;
        draftId.current ??= crypto.randomUUID();
        setSaving(true);
        setError(null);
        try {
            await onCreateNotebook(name.trim(), draftId.current, controller.signal);
            if (!controller.signal.aborted) {
                setOpen(false);
                setName("");
                draftId.current = null;
            }
        } catch (failure) {
            if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Could not create notebook. Please retry.");
        } finally {
            if (!controller.signal.aborted) {
                request.current = null;
                setSaving(false);
            }
        }
    };

    return <>
        <SelectMenu label="Textbook" value={notebookId}
            onChange={(value) => {
                if (value === CREATE_NOTEBOOK) {
                    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                    setOpen(true);
                } else useTextbookStore.getState().setActiveNotebookId(value);
            }}
            options={[
                ...notebooks.map((item) => ({ value: item.id, label: item.name })),
                { value: CREATE_NOTEBOOK, label: "+ Create notebook" },
            ]} className="min-w-0 w-[100px] sm:w-[180px] lg:w-[260px]" />
        <Dialog.Root open={open} onOpenChange={changeOpen}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/70" />
                <Dialog.Content onEscapeKeyDown={(event) => { if (saving) event.preventDefault(); }}
                    onPointerDownOutside={(event) => { if (saving) event.preventDefault(); }}
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        returnFocus.current?.focus();
                    }}
                    className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%_-_32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-7 text-foreground shadow-2xl">
                    <Dialog.Close asChild><button type="button" aria-label="Close create notebook" disabled={saving}
                        className="absolute right-4 top-4 rounded-md p-1.5 text-muted hover:bg-surface disabled:opacity-40"><X size={17} aria-hidden="true" /></button></Dialog.Close>
                    <BookOpen size={28} strokeWidth={1.3} className="mb-4 text-accent" aria-hidden="true" />
                    <Dialog.Title className="font-serif text-[27px] tracking-tight">Create notebook</Dialog.Title>
                    <Dialog.Description className="mt-2 text-[13px] leading-6 text-muted">Keep a new set of sources and chats together.</Dialog.Description>
                    <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
                        <label className="flex flex-col gap-2 text-xs text-muted">
                            Notebook name
                            <input data-notebook-name value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} disabled={saving}
                                placeholder="e.g. Machine learning" aria-invalid={!!error} aria-describedby={error ? "notebook-create-error" : undefined}
                                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted" />
                        </label>
                        {error && <p id="notebook-create-error" role="alert" className="text-xs leading-5 text-accent">{error}</p>}
                        <button type="submit" disabled={saving || !name.trim()} className="flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-background hover:bg-accent/90 disabled:opacity-40">
                            {saving && <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />}
                            {saving ? "Creating…" : "Create notebook"}
                        </button>
                    </form>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    </>;
}

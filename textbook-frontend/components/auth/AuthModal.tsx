"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { BookOpen, X } from "lucide-react";
import { useRef } from "react";

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSignIn: (provider: "google" | "github") => void;
}

export function AuthModal({ isOpen, onClose, onSignIn }: AuthModalProps) {
    const returnFocusRef = useRef<HTMLElement | null>(null);
    return (
        <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/70" />
                <Dialog.Content
                    onOpenAutoFocus={() => {
                        if (document.activeElement instanceof HTMLElement) returnFocusRef.current = document.activeElement;
                    }}
                    onCloseAutoFocus={(event) => {
                        event.preventDefault();
                        returnFocusRef.current?.focus();
                    }}
                    className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%_-_32px)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-background p-7 shadow-2xl">
                    <Dialog.Close asChild>
                        <button type="button" aria-label="Close sign in" className="absolute right-4 top-4 rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground">
                            <X size={17} aria-hidden="true" />
                        </button>
                    </Dialog.Close>
                    <BookOpen size={30} strokeWidth={1.3} className="mb-5 text-accent" aria-hidden="true" />
                    <Dialog.Title className="font-serif text-[27px] tracking-tight text-foreground">Welcome to Textbook</Dialog.Title>
                    <Dialog.Description className="mt-2 text-[13px] leading-6 text-muted">
                        A space for your sources, questions, and ideas. Sign in to save your research and pick up where you left off.
                    </Dialog.Description>
                    <div className="mt-6 space-y-3">
                        <button type="button" onClick={() => onSignIn("google")}
                            className="flex w-full items-center justify-center gap-3 rounded-[10px] border border-border bg-surface px-4 py-3 text-[13px] text-foreground transition-colors hover:border-accent/60">
                            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                                <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2.1H12v4h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.3 2.9-7.5Z" />
                                <path fill="#34A853" d="M12 22c2.7 0 5-1 6.7-2.5l-3.3-2.6c-.9.6-2 .9-3.4.9a6 6 0 0 1-5.6-4.1H3v2.7A10 10 0 0 0 12 22Z" />
                                <path fill="#FBBC05" d="M6.4 13.7A6.3 6.3 0 0 1 6 12c0-.6.1-1.2.4-1.7V7.6H3a10 10 0 0 0 0 8.8l3.4-2.7Z" />
                                <path fill="#EA4335" d="M12 6.2c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 12 2a10 10 0 0 0-9 5.6l3.4 2.7A6 6 0 0 1 12 6.2Z" />
                            </svg>
                            Continue with Google
                        </button>
                        <button type="button" onClick={() => onSignIn("github")}
                            className="flex w-full items-center justify-center gap-3 rounded-[10px] border border-border bg-surface px-4 py-3 text-[13px] text-foreground transition-colors hover:border-accent/60">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M12 .75a11.25 11.25 0 0 0-3.56 21.92c.56.1.77-.24.77-.54l-.01-2.06c-3.13.68-3.79-1.33-3.79-1.33-.51-1.3-1.25-1.64-1.25-1.64-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.94.1-.73.39-1.23.71-1.51-2.5-.28-5.12-1.25-5.12-5.56 0-1.23.44-2.23 1.16-3.02-.12-.29-.5-1.43.11-2.98 0 0 .94-.3 3.09 1.15A10.8 10.8 0 0 1 12 6.22c.96 0 1.92.13 2.82.38 2.15-1.46 3.09-1.16 3.09-1.16.61 1.55.23 2.69.11 2.98.72.79 1.16 1.79 1.16 3.02 0 4.33-2.63 5.28-5.14 5.56.4.35.76 1.03.76 2.08l-.01 3.05c0 .3.2.65.77.54A11.25 11.25 0 0 0 12 .75Z" />
                            </svg>
                            Continue with GitHub
                        </button>
                    </div>
                    <p className="mt-6 text-center text-[11px] leading-5 text-muted">Your research, ready whenever curiosity strikes.</p>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

"use client";

import { BookOpen, PanelRightClose, PanelRight, PanelLeft, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTextbookStore } from "@/stores/useTextbookStore";
import { AuthModal } from "../auth/AuthModal";
import { UserMenu } from "../auth/UserMenu";
import { NotebookSelector, type NotebookSelectorProps } from "./NotebookSelector";
import { cn } from "@/lib/utils";

interface HeaderProps extends NotebookSelectorProps {
    isStudioOpen?: boolean;
    isSourceOpen?: boolean;
    onToggleStudio?: () => void;
    onToggleSources?: () => void;
}

export function Header({ notebooks, notebookId, onCreateNotebook, isStudioOpen = false, isSourceOpen = false, onToggleStudio, onToggleSources }: HeaderProps) {
    const [isAuthOpen, setIsAuthOpen] = useState(false);
    const { user, isAuthenticated, signInWithProvider, signOut } = useAuth();
    const setInspectorOpen = useTextbookStore((s) => s.setInspectorOpen);

    useEffect(() => {
        const openSignIn = () => setIsAuthOpen(true);
        window.addEventListener("textbook:sign-in", openSignIn);
        return () => window.removeEventListener("textbook:sign-in", openSignIn);
    }, []);

    return (
        <>
            <header className="relative z-50 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-3 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                    <button type="button" onClick={onToggleSources} aria-label={isSourceOpen ? "Close chats and sources" : "Open chats and sources"}
                        aria-expanded={isSourceOpen} aria-controls="workspace-sidebar"
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground lg:hidden">
                        <PanelLeft size={18} aria-hidden="true" />
                    </button>
                    <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
                        <BookOpen className="size-6 text-accent sm:size-7" strokeWidth={1.4} aria-hidden="true" />
                        <span className={cn("font-serif text-[22px] tracking-tight sm:text-[25px]", notebooks.length > 0 && "hidden sm:inline")}>Textbook</span>
                    </div>
                    <span className="mx-2 hidden h-5 w-px bg-border md:block" aria-hidden="true" />
                    {isAuthenticated && notebooks.length > 0 && <NotebookSelector notebooks={notebooks} notebookId={notebookId} onCreateNotebook={onCreateNotebook} />}
                </div>
                <div className="flex shrink-0 items-center gap-1 sm:gap-3">
                    <button type="button" onClick={() => setInspectorOpen(true)} title="Open Retrieval Inspector"
                        aria-label="Open Retrieval Inspector" aria-haspopup="dialog"
                        className="flex h-9 items-center justify-center gap-2 rounded-lg px-2 text-muted transition-colors hover:bg-surface hover:text-foreground sm:px-2.5">
                        <SlidersHorizontal size={17} strokeWidth={1.5} aria-hidden="true" />
                        <span className="hidden text-[13px] md:inline">Diagnostics</span>
                    </button>
                    <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
                    <button type="button" onClick={onToggleStudio} title={isStudioOpen ? "Close Studio" : "Open Studio"}
                        aria-label={isStudioOpen ? "Close Studio" : "Open Studio"} aria-expanded={isStudioOpen} aria-controls="studio-panel"
                        className={`flex h-9 items-center justify-center gap-2 rounded-lg px-2 text-[13px] transition-colors hover:bg-surface hover:text-foreground sm:px-2.5 ${isStudioOpen ? "bg-surface text-foreground" : "text-muted"}`}>
                        {isStudioOpen ? <PanelRightClose size={18} strokeWidth={1.5} aria-hidden="true" /> : <PanelRight size={18} strokeWidth={1.5} aria-hidden="true" />}
                        <span className="hidden sm:inline">Studio</span>
                    </button>
                    <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
                    {!isAuthenticated ? (
                        <button type="button" onClick={() => setIsAuthOpen(true)} aria-haspopup="dialog"
                            className="h-9 rounded-[9px] border border-accent/55 px-3.5 text-xs text-foreground transition-colors hover:border-accent hover:bg-surface sm:px-5 sm:text-[13px]">
                            Sign in
                        </button>
                    ) : <UserMenu user={user} onSignOut={signOut} />}
                </div>
            </header>
            <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onSignIn={(provider) => {
                void signInWithProvider(provider);
                setIsAuthOpen(false);
            }} />
        </>
    );
}

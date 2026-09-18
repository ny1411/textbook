"use client";

import {
    PanelRightClose,
    PanelRight,
    PanelLeft,
    LogIn
} from "lucide-react";
import Image from "next/image";
import logo from "@/public/logo.png"
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AuthModal } from "../auth/AuthModal";
import { UserMenu } from "../auth/UserMenu";

interface HeaderProps {
    textbookTitle: string;
    userAvatar?: any;
    isStudioOpen?: boolean;
    isSourceOpen?: boolean;
    onToggleStudio?: () => void;
    onToggleSources?: () => void;
}

export function Header({
    textbookTitle = "AI Engineering",
    isStudioOpen = true,
    isSourceOpen = false,
    onToggleStudio,
    onToggleSources
}: HeaderProps) {

    const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
    const { user, isAuthenticated, signInWithProvider, signOut } = useAuth();

    const userInitials = user?.name
        ? user?.name.slice(0, 1).toUpperCase()
        : user?.email?.slice(0, 1).toUpperCase();

    return (
        <>
            <header className="relative z-50 h-12 shrink-0 flex items-center justify-between px-4 border-b border-zinc-700 backdrop-blur-md">
                {/* Left Zone: Brand and Title */}
                <div className="flex items-center gap-2">
                    {/* Mobile Toggle Button for Left Sources (hidden on lg and above) */}
                    <button
                        onClick={onToggleSources}
                        className="lg:hidden p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"
                        title="Toggle Sources"
                    >
                        <PanelLeft className="size-4" />
                    </button>

                    {/* App Logo */}
                    <div className="flex items-center gap-2 cursor-pointer">
                        <Image
                            src={logo}
                            alt="logo"
                            width={30}
                            height={30}
                        />
                    </div>
                    <span className="text-zinc-500/60">/</span>
                    {/* Textbook Title */}
                    <div className="flex items-center gap-2 cursor-pointer">
                        <span className="text-sm font-medium text-zinc-300">{textbookTitle}</span>
                    </div>
                </div>

                {/* Right Zone */}
                <div className="flex items-center gap-2">
                    {/* Studio Panel Toggle */}
                    <button
                        onClick={onToggleStudio}
                        title={isStudioOpen ? "Collapse Studio" : "Expand Studio"}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors cursor-pointer"
                    >
                        {isStudioOpen ? (
                            <PanelRightClose className="size-4" />
                        ) : (
                            <PanelRight className="size-4" />
                        )}
                    </button>
                    {/* Subtle Separator */}
                    <div className="h-4 w-[1px] bg-zinc-800 mx-1" />

                    {/* Avatar */}
                    {!isAuthenticated ? (
                        <button onClick={() => setIsAuthOpen(true)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-sm transition-all cursor-pointer"
                        >
                            <span>Sign In</span>
                            <LogIn className="size-3.5" />
                        </button>
                    ) : (
                        <UserMenu user={user} onSignOut={signOut} />
                    )}
                </div>
            </header>
            <AuthModal
                isOpen={isAuthOpen}
                onClose={() => setIsAuthOpen(false)}
                onSignIn={(provider) => {
                    signInWithProvider(provider);
                    setIsAuthOpen(false);
                }}
            />
        </>
    )
}
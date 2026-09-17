"use client";

import {
    SlidersHorizontal,
    PanelRightClose,
    PanelRight,
    PanelLeft
} from "lucide-react";
import Image from "next/image";
import logo from "@/public/logo.png"

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
    userAvatar = "N",
    isStudioOpen = true,
    isSourceOpen = false,
    onToggleStudio,
    onToggleSources
}: HeaderProps) {
    return (
        <header className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-zinc-700 backdrop-blur-md">
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
                {(typeof userAvatar === "string" && userAvatar !== "") ? <button
                    title="Account"
                    className="size-7 rounded-full bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-xs font-semibold text-indigo-400 hover:ring-2 hover:ring-indigo-500/40 transition-all cursor-pointer"
                >
                    {userAvatar}
                </button> :
                    <button className="cursor-pointer">
                        {userAvatar}
                    </button>
                }

            </div>

        </header>
    )
}
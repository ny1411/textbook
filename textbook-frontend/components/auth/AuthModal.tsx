"use client";

import { X } from "lucide-react";
import Image from "next/image";

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSignIn: (provider: "google" | "github") => void;
}

export function AuthModal({ isOpen, onClose, onSignIn }: AuthModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="relative w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-100"
                >
                    <X size={18} />
                </button>
                <div className="text-center mb-6">
                    <h3 className="text-lg font-semibold text-zinc-100">Welcome to NotebookLM</h3>
                    <p className="text-xs text-zinc-400 mt-1">
                        Sign in to persist your notebooks, uploads, and AI discussions
                    </p>
                </div>
                <div className="space-y-3">
                    <button
                        onClick={() => onSignIn("google")}
                        className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-800 text-sm font-medium text-zinc-200 transition-all cursor-pointer"
                    >
                        {/* Google SVG or Lucide Chrome icon */}
                        <Image
                            src="https://thesvg.org/icons/google/default.svg"
                            alt="Google"
                            width={24}
                            height={24}
                        />
                        Continue with Google
                    </button>
                    <button
                        onClick={() => onSignIn("github")}
                        className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-800 text-sm font-medium text-zinc-200 transition-all cursor-pointer"
                    >
                        <Image
                            src="https://thesvg.org/icons/github/default.svg"
                            alt="GitHub"
                            width={24}
                            height={24}
                        />
                        Continue with GitHub
                    </button>
                </div>
                <p className="mt-6 text-[11px] text-center text-zinc-500">
                    Only Google and GitHub OAuth are supported.
                </p>
            </div>
        </div>
    );
}
"use client";

import { useState, useRef, useEffect } from "react";
import { ArrowUp } from "lucide-react";

interface ChatInputProps {
    onSend: (message: string, isAgentMode: boolean) => void;
    isLoading?: boolean;
}

export function ChatInput({ onSend, isLoading = false }: ChatInputProps) {
    const [input, setInput] = useState("");
    const [isAgentMode, setAgentMode] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
        }
    }, [input]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    }

    const handleSubmit = () => {
        if (!input.trim() || isLoading) return;
        onSend(input.trim(), isAgentMode);
        setInput("");
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
    };

    return (
        <div className="p-4 shrink-0 bg-gradient-to-t from-zinc-900 via-zinc-900/50 to-transparent">
            {/* Outer Prompt Container */}
            <div className="max-w-3xl mx-auto rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 shadow-xl focus-within:border-zinc-700 transition-all">
                {/* Text Area */}
                <textarea
                    ref={textareaRef}
                    rows={1}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isAgentMode ? "Ask with Agentic Reasoning" : "Ask any question"}
                    className="w-full resize-none bg-transparent outline-none text-md px-2 text-zinc-100 placeholder:text-zinc-500 leading-relaxed max-h-[180px] overflow-y-auto scrollbar-none selection:bg-indigo-600/10 selection:text-indigo-400"
                />
                {/* Bottom control bar */}
                <div className="flex items-center justify-between pt-2 mt-2">
                    <button
                        type="button"
                        onClick={() => setAgentMode(!isAgentMode)}
                        className={`flex text-sm items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all cursor-pointer ${isAgentMode ? "text-indigo-400 bg-indigo-500/20" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"}`}
                    >
                        {isAgentMode ?
                            <span>Agentic mode</span> :
                            <span>Fast mode</span>}
                    </button>
                    {/* Send button */}
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!input.trim() || isLoading}
                        className={`p-2 rounded-full transition-all 
                        ${input.trim() && !isLoading ?
                                "bg-indigo-500/20 text-indigo-400 cursor-pointer hover:bg-indigo-500/40" :
                                "cursor-not-allowed text-zinc-600"}`}
                    >
                        <ArrowUp size={20} />
                    </button>
                </div>
            </div>
            <p className="text-xs text-center text-zinc-500/50 mt-2">Textbook may generate incorrect information. Always verify with citated sources.</p>
        </div>
    );

}
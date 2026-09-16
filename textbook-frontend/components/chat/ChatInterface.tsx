"use client";

import { useChat } from "@/hooks/useChat";
import { CitationItem } from "@/types/api";
import { useEffect, useRef } from "react";
import { ChatInput } from "./ChatInput";
import { LoaderCircle, Sparkles } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { SuggestedQueries } from "./SuggestedQueries";
import { cn } from "@/lib/utils";

interface ChatInterfaceProps {
    onCitationClick?: (citation: CitationItem) => void;
}

export default function ChatInterface({ onCitationClick }: ChatInterfaceProps) {
    const { messages,
        isLoading,
        isAgentMode,
        sendMessage } = useChat();

    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    return (
        <div className={cn("flex flex-col h-full w-full relative overflow-hidden bg-zinc-900")}>
            {/* Scrollable Message Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth"
            >
                {messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center min-h-[400px]">
                        <SuggestedQueries
                            onSelectQuery={(query) => sendMessage(query, isAgentMode)}
                        />
                    </div>
                ) : (
                    <div className="max-w-3xl mx-auto w-full">
                        {messages.map((msg) => (
                            <ChatMessage
                                key={msg.id}
                                message={msg}
                                onCitationClick={onCitationClick}
                            />
                        ))}
                        {/* Loading Indicator */}
                        {isLoading && (
                            <div className="flex gap-3 max-w-3xl mx-auto mb-6 items-center">
                                <div className="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                    <Sparkles size={16} />
                                </div>
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs shadow-sm">
                                    <LoaderCircle size={14} className="animate-spin text-indigo-400" />
                                    <span>
                                        {isAgentMode
                                            ? "Reflecting, searching, and evaluating ground truth..."
                                            : "Searching document chunks and formulating answer..."}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {/* Sticky Bottom Input Area */}
            <ChatInput
                onSend={(query, isAgent) => sendMessage(query, isAgent)}
                isLoading={isLoading}
            />
        </div>
    );
}
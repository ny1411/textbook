"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CitationItem } from "@/types/api";
import { ChatMessageItem } from "@/types/chat";
import { AlertTriangle, CheckCircle, FileSpreadsheet, Sparkles, UserRound, Zap } from "lucide-react";
import { CitationBadge } from "./CitationBadge";

interface ChatMessageProps {
    message: ChatMessageItem;
    onCitationClick?: (citation: CitationItem) => void;
}

export function ChatMessage({ message, onCitationClick }: ChatMessageProps) {
    const isUser = message.role === "user";

    const processedContent = useMemo(() => {
        if (isUser) return message.content;

        return message.content.replace(
            /\[(?:Source\s*|source_)?(\d+|[a-zA-Z0-9_-]+)\]/gi,
            (match, id) => `[cite:${id}](#citation-${id})`);
    }, [message.content, isUser]);

    return (
        <div
            className={`flex gap-3.5 max-w-3xl mx-auto mb-6 
                ${isUser ? "justify-end" : "justify-start"}`}>

            {!isUser && (
                <div
                    className="w-8 h-8 rounded-xl shrink-0 
                flex items-center justify-center 
                bg-indigo-500/20 text-indigo-400 
                border border-indigo-500/30">
                    <Sparkles size={20} />
                </div>
            )}

            {/* Container */}
            <div
                className={`flex flex-col min-w-0 max-w-[85%] ${isUser ? "items-end" : "items-start"
                    }`}
            >
                {!isUser && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5 text-[11px]">
                        {message.isAgentMode ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30 font-medium">
                                <Sparkles size={11} />
                                Agentic RAG
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 font-medium">
                                <Zap size={11} className="text-amber-400" />
                                Fast RAG
                            </span>
                        )}

                        {message.agentMetadata?.is_grounded !== undefined && (
                            <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${message.agentMetadata.is_grounded
                                    ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                    : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                    }`}
                            >
                                {message.agentMetadata.is_grounded ? (
                                    <>
                                        <CheckCircle size={11} /> Grounded
                                    </>
                                ) : (
                                    <>
                                        <AlertTriangle size={11} /> Partial
                                    </>
                                )}
                            </span>
                        )}

                        {message.agentMetadata?.confidence_score !== undefined &&
                            message.agentMetadata.confidence_score !== null && (
                                <span className="px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-300 font-mono">
                                    {message.agentMetadata.confidence_score}% confidence
                                </span>
                            )}

                        {message.appliedQuery &&
                            message.appliedQuery !== message.content && (
                                <span
                                    className="text-zinc-500 italic max-w-xs truncate"
                                    title={`Applied Query: ${message.appliedQuery}`}
                                >
                                    (Rewritten: &ldquo;{message.appliedQuery}&rdquo;)
                                </span>
                            )}
                    </div>
                )}
                <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${isUser
                        ? "bg-indigo-600 text-white shadow-md rounded-tr-sm"
                        : "bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-sm shadow-sm w-full"
                        }`}
                >
                    {isUser ? (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                    ) : (
                        <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-zinc-950 prose-pre:border prose-pre:border-zinc-800">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{

                                    a({ href, children, ...props }) {
                                        if (href?.startsWith("#citation-")) {
                                            const id = href.replace("#citation-", "");
                                            const citation = message.citations?.find(
                                                (c) => String(c.source_id) === id
                                            );
                                            return (
                                                <CitationBadge
                                                    sourceId={id}
                                                    citation={citation}
                                                    onCitationClick={onCitationClick}
                                                />
                                            );
                                        }
                                        return (
                                            <a
                                                href={href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-indigo-400 underline hover:text-indigo-300"
                                                {...props}
                                            >
                                                {children}
                                            </a>
                                        );
                                    },

                                    p({ children }) {
                                        return <p className="mb-2.5 last:mb-0">{children}</p>;
                                    },
                                }}
                            >
                                {processedContent}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>
                {!isUser && message.citations && message.citations.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-zinc-800/80 w-full">
                        <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium mb-2">
                            <FileSpreadsheet size={13} className="text-indigo-400" />
                            <span>Cited Sources ({message.citations.length})</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {message.citations.map((citation, index) => (
                                <CitationBadge
                                    key={citation.chunk_id || index}
                                    sourceId={citation.source_id}
                                    citation={citation}
                                    onCitationClick={onCitationClick}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
            {isUser && (
                <div className="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center bg-zinc-800 text-zinc-300 border border-zinc-700">
                    <UserRound size={16} />
                </div>
            )}
        </div>
    )
}
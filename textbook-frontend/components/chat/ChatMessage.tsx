"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CitationItem } from "@/types/api";
import { ChatMessageItem } from "@/types/chat";
import { AlertTriangle, CheckCircle, FileSpreadsheet, Sparkles, UserRound, Zap } from "lucide-react";
import { CitationBadge } from "./CitationBadge";
import { ReadAloud } from "@/components/voice/ReadAloud";
import { AgentMetrics } from "./AgentMetrics";
import { ChatImage } from "./ChatImage";
import { remarkCitations } from "@/lib/remark-citations";
import { HoverCardGroup } from "@/components/ui/hover-card";

interface ChatMessageProps {
    message: ChatMessageItem;
    onCitationClick?: (citation: CitationItem) => void;
}

export function ChatMessage({ message, onCitationClick }: ChatMessageProps) {
    const isUser = message.role === "user";

    const citationsById = useMemo(() => new Map(
        message.citations?.map((citation) => [String(citation.source_id), citation])
    ), [message.citations]);
    const citationOptions = useMemo(() => ({ sourceIds: [...citationsById.keys()] }), [citationsById]);

    return (
        <HoverCardGroup>
        <div
            className={`flex gap-3 max-w-[820px] mx-auto mb-7
                ${isUser ? "justify-end" : "justify-start"}`}>

            {!isUser && (
                <div
                    className="w-8 h-8 rounded-full shrink-0
                flex items-center justify-center
                bg-[#211b16] text-[#c49b75]
                border border-[#584536]">
                    <Sparkles size={17} strokeWidth={1.5} />
                </div>
            )}

            {/* Container */}
            <div
                className={`flex flex-col min-w-0 ${isUser ? "max-w-[85%] items-end" : "flex-1 items-start"
                    }`}
            >
                {!isUser && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5 text-[11px]">
                        {message.intent && message.intent !== "textbook_rag" ? (
                            <span className="px-2 py-0.5 rounded-full bg-[#2b241e] text-[#c7b5a3]">
                                {message.intent === "casual_chat" ? "Conversation" : "General knowledge"}
                            </span>
                        ) : message.isAgentMode ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#30251c] text-[#c49b75] border border-[#584536] font-medium">
                                <Sparkles size={11} />
                                Agentic RAG
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#2b241e] text-[#aa9b8c] border border-[#494036] font-medium">
                                <Zap size={11} className="text-[#d3ae82]" />
                                Fast RAG
                            </span>
                        )}

                        {message.intent === "textbook_rag" && message.agentMetadata?.is_grounded !== undefined && (
                            <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${message.agentMetadata.is_grounded
                                    ? "bg-[#8b9d76]/10 text-[#a9b49b] border border-[#738361]/40"
                                    : "bg-[#c49b75]/10 text-[#d3ae82] border border-[#705640]"
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

                        {message.intent === "textbook_rag" && message.agentMetadata?.confidence_score !== undefined &&
                            message.agentMetadata.confidence_score !== null && (
                                <span className="px-2 py-0.5 rounded-full bg-[#2b241e]/80 text-[#c7b5a3] font-mono">
                                    {message.agentMetadata.confidence_score}% confidence
                                </span>
                            )}

                        {message.appliedQuery &&
                            message.appliedQuery !== message.content && (
                                <span
                                    className="text-[#8d8073] italic max-w-xs truncate"
                                    title={`Applied Query: ${message.appliedQuery}`}
                                >
                                    (Rewritten: &ldquo;{message.appliedQuery}&rdquo;)
                                </span>
                            )}
                    </div>
                )}
                <div
                    className={`rounded-2xl border px-4 py-3 font-[Georgia,serif] text-[16px] leading-[1.7] ${isUser
                        ? "border-[#604b3b] bg-[#3a2c22] text-[#eee5d8] rounded-tr-md"
                        : "bg-[#1b1815]/70 border-[#494036] text-[#e5dacc] rounded-tl-md w-full"
                        }`}
                >
                    {message.attachments && message.attachments.length > 0 && (
                        <div className={`flex flex-wrap gap-2 ${message.content ? "mb-3" : ""}`}>
                            {message.attachments.map((attachment) => <ChatImage key={attachment.id} attachment={attachment} />)}
                        </div>
                    )}
                    {isUser ? (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                    ) : (
                        <div className="prose prose-invert max-w-none text-[16px] leading-[1.7] prose-pre:bg-[#141210] prose-pre:border prose-pre:border-[#38302a] [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-3 [&_code]:font-mono [&_code]:text-[13px] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_h1]:mb-3 [&_h1]:text-2xl [&_h2]:mb-2 [&_h2]:text-xl [&_h3]:mb-2 [&_h3]:text-lg [&_table]:w-full [&_td]:border [&_td]:border-[#38302a] [&_td]:p-2 [&_th]:border [&_th]:border-[#38302a] [&_th]:p-2">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm, [remarkCitations, citationOptions]]}
                                components={{

                                    a({ node, href, children, ...props }) {
                                        const id = node?.properties["data-citation-source"];
                                        if (typeof id === "string") {
                                            const citation = citationsById.get(id);
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
                                                className="text-[#d5ae88] underline underline-offset-3 hover:text-[#e8c7a6]"
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
                                {message.content}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>

                {!isUser && <ReadAloud id={`message-${message.id}`} text={message.content} title="Assistant reply" />}

                {!isUser && message.warning && (
                    <div role="note" className="mt-2 flex items-center gap-1.5 text-xs text-[#d3ae82]">
                        <AlertTriangle size={13} className="shrink-0" />
                        {message.warning}
                    </div>
                )}

                {!isUser && message.isAgentMode && message.agentMetadata && message.intent === "textbook_rag" && (
                    <AgentMetrics
                        confidenceScore={message.agentMetadata.confidence_score}
                        isGrounded={message.agentMetadata.is_grounded}
                        critique={message.agentMetadata.critique}
                        iterationCount={message.agentMetadata.iterationCount}
                        className="mt-3"
                    />
                )}

                {!isUser && message.citations && message.citations.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-[#38302a]/80 w-full">
                        <div className="flex items-center gap-1.5 text-xs text-[#aa9b8c] font-medium mb-2">
                            <FileSpreadsheet size={13} className="text-[#c49b75]" />
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
                <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center bg-[#211b16] text-[#c7b5a3] border border-[#494036]">
                    <UserRound size={16} />
                </div>
            )}
        </div>
        </HoverCardGroup>
    )
}

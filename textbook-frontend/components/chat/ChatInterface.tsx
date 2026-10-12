"use client";

import { useChat } from "@/hooks/useChat";
import { CitationItem } from "@/types/api";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ChatInput } from "./ChatInput";
import { LoaderCircle, Sparkles } from "lucide-react";
import { ChatMessage } from "./ChatMessage";
import { SuggestedQueries } from "./SuggestedQueries";
import { cn } from "@/lib/utils";
import { ConversationToolbar } from "./ConversationToolbar";
import { toast } from "sonner";
import { useUserStore } from "@/stores/useUserStore";
import { useTextbookStore } from "@/stores/useTextbookStore";

interface ChatInterfaceProps {
    onCitationClick?: (citation: CitationItem) => void;
}

export default function ChatInterface({ onCitationClick }: ChatInterfaceProps) {
    const userId = useUserStore((s) => s.userId);
    const authenticated = useUserStore((s) => s.isAuthenticated);
    return <UserChat key={`${userId}:${authenticated}`} onCitationClick={onCitationClick} />;
}

function UserChat({ onCitationClick }: ChatInterfaceProps) {
    const notebookId = useTextbookStore((s) => s.activeNotebookId);
    // Notebook initialization can replace the placeholder ID while the user is drafting.
    const [draft, setDraft] = useState("");
    return <ConversationChat key={notebookId} onCitationClick={onCitationClick} draft={draft} setDraft={setDraft} />;
}

function ConversationChat({ onCitationClick, draft, setDraft }: ChatInterfaceProps & {
    draft: string;
    setDraft: Dispatch<SetStateAction<string>>;
}) {
    const chat = useChat();
    const { messages, isLoading, sendMessage } = chat;

    const scrollRef = useRef<HTMLDivElement>(null);
    const lastMessageId = messages.at(-1)?.id;

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [lastMessageId, isLoading]);

    return (
        <div className={cn("flex flex-col h-full w-full relative overflow-hidden bg-zinc-900")}>
            <ConversationToolbar threads={chat.threads} activeId={chat.conversationId}
                disabled={!chat.authenticated || chat.isHistoryLoading}
                hasMore={chat.hasOlderThreads} onSelect={chat.selectConversation} onNew={chat.newConversation}
                onRename={chat.renameThread} onDelete={chat.deleteThread}
                onLoadMore={() => void chat.loadOlderThreads().catch((e) => toast.error(e.message))} />
            {!chat.authenticated && <p className="px-4 py-3 text-sm text-zinc-400">Sign in to save conversations and return to them later.</p>}
            {(chat.error || chat.failed || chat.pending) && <div role="status" className="px-4 py-3 text-sm text-amber-300 flex flex-wrap gap-3 items-center">
                <span>{chat.error ?? (chat.failed ? "This answer failed. You can retry the saved question." : "An answer is still being generated.")}</span>
                {chat.canRetry && <button type="button" disabled={isLoading} onClick={chat.retry} className="text-indigo-300 underline disabled:opacity-40">Retry answer</button>}
                {!chat.canRetry && <button type="button" onClick={chat.reload} className="text-indigo-300 underline">Reload history</button>}
            </div>}
            {/* Scrollable Message Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth"
            >
                {chat.hasOlderMessages && <button type="button" onClick={() => void chat.loadOlderMessages().catch((e) => toast.error(e.message))}
                    className="block mx-auto mb-4 text-xs text-indigo-400">Load older messages</button>}
                {chat.isHistoryLoading ? <div className="flex items-center justify-center p-10 text-zinc-400 gap-2"><LoaderCircle size={16} className="animate-spin" />Loading history...</div> : messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center min-h-[400px]">
                        <SuggestedQueries
                            onSelectQuery={(query) => sendMessage(query)}
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
                                        Generating your answer...
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {/* Sticky Bottom Input Area */}
            <ChatInput
                value={draft}
                onValueChange={setDraft}
                onSend={(query, isAgent) => sendMessage(query, isAgent)}
                isLoading={isLoading}
                isSendDisabled={chat.isHistoryLoading || !chat.authenticated || chat.pending || (!chat.conversationId && !!chat.error)}
            />
        </div>
    );
}

"use client";

import { useChat } from "@/hooks/useChat";
import { CitationItem } from "@/types/api";
import { useEffect, useRef, useState } from "react";
import { ChatInput } from "./ChatInput";
import { LoaderCircle } from "lucide-react";
import { ChatLoadingIndicator } from "./ChatLoadingIndicator";
import { ChatMessage } from "./ChatMessage";
import { SuggestedQueries } from "./SuggestedQueries";
import { SampleTextbookLoader } from "@/components/sources/SampleTextbookLoader";
import { cn } from "@/lib/utils";
import { useOwnedWorkspace } from "@/hooks/useOwnedWorkspace";
import { useTextbookStore } from "@/stores/useTextbookStore";

interface ChatInterfaceProps {
    onCitationClick?: (citation: CitationItem) => void;
}

export default function ChatInterface({ onCitationClick }: ChatInterfaceProps) {
    const workspace = useOwnedWorkspace();
    return (
        <div className="flex flex-col h-full min-h-0">
            {workspace.authenticated && workspace.notebooks.length > 0 && (
                <label className="flex items-center gap-2 px-4 py-2 text-xs text-zinc-400 border-b border-zinc-800">
                    Notebook
                    <select aria-label="Notebook" value={workspace.notebookId}
                        onChange={(event) => useTextbookStore.getState().setActiveNotebookId(event.target.value)}
                        className="min-w-0 max-w-full bg-zinc-800 rounded px-2 py-1 text-zinc-200">
                        {workspace.notebooks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                </label>
            )}
            {!workspace.authenticated ? (
                <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-zinc-400">
                    Sign in using the account button above to save and resume your research chats.
                </div>
            ) : workspace.error ? (
                <div role="alert" className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-zinc-400">
                    <p>{workspace.error}</p>
                    <button type="button" onClick={workspace.retry} className="text-indigo-300">Retry workspace</button>
                </div>
            ) : !workspace.ready ? (
                <div role="status" className="flex-1 flex items-center justify-center gap-2 text-sm text-zinc-400">
                    <LoaderCircle size={16} className="animate-spin" /> Loading your workspace…
                </div>
            ) : (
                <NotebookChat key={`${workspace.userId}:${workspace.notebookId}`} userId={workspace.userId}
                    notebookId={workspace.notebookId} onCitationClick={onCitationClick} />
            )}
        </div>
    );
}

function NotebookChat({ userId, notebookId, onCitationClick }: ChatInterfaceProps & { userId: string; notebookId: string }) {
    const chat = useChat(userId, notebookId);
    const { messages, isLoading, isAgentMode, sendMessage } = chat;
    const [isUploadingImages, setIsUploadingImages] = useState(false);
    const [composerVersion, setComposerVersion] = useState(0);

    const scrollRef = useRef<HTMLDivElement>(null);
    const firstMessage = useRef<string | undefined>(undefined);

    useEffect(() => {
        if (scrollRef.current) {
            const previous = firstMessage.current;
            if (previous === messages[0]?.id || !messages.some((item) => item.id === previous)) {
                scrollRef.current.scrollTop = messages.length === 0 ? 0 : scrollRef.current.scrollHeight;
            }
            firstMessage.current = messages[0]?.id;
        }
    }, [messages, isLoading]);

    return (
        <div className={cn("flex flex-col h-full w-full relative overflow-hidden bg-zinc-900")}>
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-zinc-800 text-xs">
                <label className="flex items-center gap-2 min-w-0 flex-1 text-zinc-400">
                    Chat
                    <select aria-label="Saved chats" value={chat.activeConversationId ?? ""}
                        disabled={isLoading || isUploadingImages || chat.isHistoryLoading}
                        onChange={(event) => {
                            useTextbookStore.getState().setActiveCitation(null);
                            void chat.selectConversation(event.target.value);
                            setComposerVersion((value) => value + 1);
                        }} className="min-w-0 w-full bg-zinc-800 rounded px-2 py-1 text-zinc-200">
                        {!chat.activeConversationId && <option value="">Start a new chat</option>}
                        {chat.conversations.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                    </select>
                </label>
                <button type="button" onClick={() => { useTextbookStore.getState().setActiveCitation(null); void chat.newConversation(); setComposerVersion((value) => value + 1); }}
                    disabled={isLoading || isUploadingImages || chat.isHistoryLoading} className="text-indigo-300 disabled:opacity-40">New chat</button>
                {chat.hasMoreConversations && <button type="button" onClick={chat.loadMoreConversations}
                    disabled={isLoading || isUploadingImages || chat.isHistoryLoading} className="text-indigo-300">More chats</button>}
            </div>
            {chat.historyError && <div role="alert" className="px-4 py-3 text-xs text-amber-300">
                {chat.historyError} <button type="button" onClick={chat.retryHistory} className="underline">Retry history</button>
            </div>}
            {chat.isHistoryLoading && <p role="status" className="px-4 py-2 text-xs text-zinc-400">Loading saved messages…</p>}
            {/* Scrollable Message Area */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-4 py-6 scroll-smooth"
                data-lenis-prevent
            >
                <SampleTextbookLoader userId={userId} notebookId={notebookId} />
                {chat.hasOlder && <button type="button" onClick={chat.loadOlder} disabled={isLoading || isUploadingImages || chat.isHistoryLoading}
                    className="block mx-auto mb-4 text-xs text-indigo-300">Load older messages</button>}
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
                        {isLoading && <ChatLoadingIndicator isAgentMode={isAgentMode} />}
                    </div>
                )}
            </div>
            {chat.canRetryMessage && <button type="button" onClick={chat.retryMessage} disabled={isLoading || chat.isHistoryLoading}
                className="px-4 py-2 text-xs text-amber-300">Retry last message</button>}
            {/* Sticky Bottom Input Area */}
            <ChatInput
                key={composerVersion}
                onSend={(query, isAgent, attachments, conversationId) => sendMessage(query, isAgent, attachments, conversationId)}
                ensureConversation={chat.ensureConversation}
                onBusyChange={setIsUploadingImages}
                isLoading={isLoading}
                disabled={chat.isHistoryLoading || !!chat.historyError || chat.canRetryMessage}
            />
        </div>
    );
}

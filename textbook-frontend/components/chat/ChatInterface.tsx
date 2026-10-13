"use client";

import { useChat } from "@/hooks/useChat";
import { CitationItem } from "@/types/api";
import { useEffect, useRef, useState } from "react";
import { ChatInput } from "./ChatInput";
import { LoaderCircle, Plus } from "lucide-react";
import { ChatLoadingIndicator } from "./ChatLoadingIndicator";
import { ChatMessage } from "./ChatMessage";
import { SuggestedQueries, WelcomeHeading } from "./SuggestedQueries";
import { SampleTextbookLoader } from "@/components/sources/SampleTextbookLoader";
import { cn } from "@/lib/utils";
import { useOwnedWorkspace } from "@/hooks/useOwnedWorkspace";
import { useTextbookStore } from "@/stores/useTextbookStore";
import { useVoicePlayback } from "@/components/voice/VoicePlaybackProvider";

interface ChatInterfaceProps {
    onCitationClick?: (citation: CitationItem) => void;
}

const streamStatusLabels: Record<string, string> = {
    accepted: "Preparing your question…",
    preparing: "Preparing your question…",
    loading_history: "Loading the conversation…",
    observing_images: "Reading your attached images…",
    analyzing: "Understanding your question…",
    classifying: "Understanding your question…",
    retrieving: "Searching your sources…",
    reranking: "Finding the most relevant passages…",
    reviewing_sources: "Reviewing your sources…",
    drafting: "Preparing an answer from your sources…",
    searching: "Searching your sources…",
    generating: "Writing your reply…",
    reflecting: "Checking the answer against your sources…",
    evaluating: "Checking the answer against your sources…",
    saving: "Saving your reply…",
};

function requestSignIn() {
    window.dispatchEvent(new CustomEvent("textbook:sign-in"));
}

function WelcomeFooter({ signedOut = false }: { signedOut?: boolean }) {
    return <p className="shrink-0 px-5 pb-6 pt-4 text-center text-[11px] leading-relaxed text-[#8d8073] sm:text-xs">
        {signedOut ? "Sign in to bring your sources, questions, and ideas together." : "Grounded in your sources. Guided by your curiosity."}
    </p>;
}

function SignedOutWelcome() {
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-10 sm:px-8" data-lenis-prevent>
                <div className="mx-auto my-auto w-full max-w-[820px] py-6">
                    <WelcomeHeading />
                    <ChatInput welcome onRequestSignIn={requestSignIn} onSend={async () => false}
                        ensureConversation={async () => { requestSignIn(); throw new Error("Sign in to start a chat."); }}
                        onBusyChange={() => undefined} />
                    <SuggestedQueries onSelectQuery={requestSignIn} />
                </div>
            </div>
            <WelcomeFooter signedOut />
        </div>
    );
}

export default function ChatInterface({ onCitationClick }: ChatInterfaceProps) {
    const workspace = useOwnedWorkspace();
    return (
        <div className="flex h-full min-h-0 flex-col">
            {workspace.authenticated && workspace.notebooks.length > 0 && (
                <label className="flex min-h-11 items-center gap-3 border-b border-[#38302a] px-5 py-2 text-xs text-[#aa9b8c] sm:px-6">
                    Notebook
                    <select aria-label="Notebook" value={workspace.notebookId}
                        onChange={(event) => useTextbookStore.getState().setActiveNotebookId(event.target.value)}
                        className="min-w-0 max-w-full rounded-md border border-[#494036] bg-[#1d1916] px-2.5 py-1.5 text-[#ddd1c2]">
                        {workspace.notebooks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                </label>
            )}
            {!workspace.authenticated ? <SignedOutWelcome /> : workspace.error ? (
                <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-[#b5a79a]">
                    <p>{workspace.error}</p>
                    <button type="button" onClick={workspace.retry} className="text-[#c49b75] underline underline-offset-4">Retry workspace</button>
                </div>
            ) : !workspace.ready ? (
                <div role="status" className="flex flex-1 items-center justify-center gap-2 text-sm text-[#b5a79a]">
                    <LoaderCircle size={16} className="animate-spin text-[#c49b75]" /> Loading your workspace…
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
    const { stop: stopPlayback } = useVoicePlayback();
    useEffect(() => () => stopPlayback(), [stopPlayback]);

    const scrollRef = useRef<HTMLDivElement>(null);
    const firstMessage = useRef<string | undefined>(undefined);
    const isWelcome = messages.length === 0;
    const navigationBlocked = isLoading || isUploadingImages || chat.isHistoryLoading;
    const inputBlocked = chat.isHistoryLoading || !!chat.historyError || chat.canRetryMessage;

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
        <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-[#38302a] px-5 py-2 text-xs sm:px-6">
                <label className="flex min-w-0 flex-1 items-center gap-3 text-[#aa9b8c]">
                    Chat
                    <select aria-label="Saved chats" value={chat.activeConversationId ?? ""} disabled={navigationBlocked}
                        onChange={(event) => {
                            stopPlayback();
                            useTextbookStore.getState().setActiveCitation(null);
                            void chat.selectConversation(event.target.value);
                            setComposerVersion((value) => value + 1);
                        }} className="min-w-0 w-full max-w-lg rounded-md border border-[#494036] bg-[#1d1916] px-2.5 py-1.5 text-[#ddd1c2]">
                        {!chat.activeConversationId && <option value="">Start a new chat</option>}
                        {chat.conversations.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                    </select>
                </label>
                <button type="button" onClick={() => {
                    stopPlayback();
                    useTextbookStore.getState().setActiveCitation(null);
                    void chat.newConversation();
                    setComposerVersion((value) => value + 1);
                }} disabled={navigationBlocked}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[#c49b75] transition-colors hover:bg-[#2d251e] disabled:opacity-40">
                    <Plus size={14} /> New chat
                </button>
                {chat.hasMoreConversations && <button type="button" onClick={chat.loadMoreConversations}
                    disabled={navigationBlocked} className="text-[#c49b75] disabled:opacity-40">More chats</button>}
            </div>
            {chat.historyError && <div role="alert" className="px-5 py-3 text-xs text-[#d3ae82]">
                {chat.historyError} <button type="button" onClick={chat.retryHistory} className="underline">Retry history</button>
            </div>}
            {chat.isHistoryLoading && <p role="status" className="px-5 py-2 text-xs text-[#aa9b8c]">Loading saved messages…</p>}
            <div className={cn("flex min-h-0 flex-1 flex-col", isWelcome ? "overflow-y-auto px-5 py-8 sm:px-8" : "overflow-hidden")} data-lenis-prevent>
                <div className={cn("flex min-h-0 flex-col", isWelcome ? "mx-auto my-auto w-full max-w-[820px] py-4" : "flex-1 overflow-hidden")}>
                    <div ref={scrollRef} data-lenis-prevent className={cn(isWelcome ? "shrink-0" : "min-h-0 flex-1 overflow-y-auto px-4 py-7 scroll-smooth sm:px-6")}>
                        {chat.hasOlder && <button type="button" onClick={chat.loadOlder} disabled={navigationBlocked}
                            className="mx-auto mb-5 block text-xs text-[#c49b75] disabled:opacity-40">Load older messages</button>}
                        {isWelcome ? <WelcomeHeading /> : (
                            <div className="mx-auto w-full max-w-[820px]">
                                {messages.map((msg) => <ChatMessage key={msg.id} message={msg} onCitationClick={onCitationClick} />)}
                                {isLoading && !messages.some((message) => message.id.startsWith("streaming-")) && <ChatLoadingIndicator isAgentMode={isAgentMode} />}
                                {isLoading && <div className="mb-4 flex items-center justify-between gap-3 text-xs text-[#aa9b8c]">
                                    <p role="status" aria-live="polite">{streamStatusLabels[chat.streamStatus ?? ""] ?? "Preparing your reply…"}</p>
                                    <button type="button" onClick={chat.cancelMessage} className="shrink-0 text-[#c49b75] hover:text-[#dfbb97]">Stop response</button>
                                </div>}
                            </div>
                        )}
                    </div>
                    {chat.canRetryMessage && <button type="button" onClick={chat.retryMessage} disabled={isLoading || chat.isHistoryLoading}
                        className="px-5 py-2 text-xs text-[#d3ae82]">Retry last message</button>}
                    <ChatInput key={composerVersion} welcome={isWelcome}
                        onSend={(query, isAgent, attachments, conversationId) => sendMessage(query, isAgent, attachments, conversationId)}
                        ensureConversation={chat.ensureConversation} onBusyChange={setIsUploadingImages}
                        isLoading={isLoading} disabled={inputBlocked} />
                    {isWelcome && <SuggestedQueries disabled={navigationBlocked || inputBlocked} onSelectQuery={(query) => { void sendMessage(query, isAgentMode); }} />}
                    {isWelcome && <div className="mt-6"><SampleTextbookLoader userId={userId} notebookId={notebookId} /></div>}
                </div>
            </div>
            {isWelcome && <WelcomeFooter />}
        </div>
    );
}

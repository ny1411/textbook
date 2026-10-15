"use client";

import { useChatSession } from "./ChatSessionProvider";
import { CitationItem } from "@/types/api";
import { useEffect, useRef } from "react";
import { ChatInput } from "./ChatInput";
import { ConversationSkeleton, MessageSkeleton } from "@/components/layout/WorkspaceSkeletons";
import { ChatLoadingIndicator } from "./ChatLoadingIndicator";
import { ChatMessage } from "./ChatMessage";
import { SuggestedQueries, WelcomeHeading } from "./SuggestedQueries";
import { SampleTextbookLoader } from "@/components/sources/SampleTextbookLoader";
import { cn } from "@/lib/utils";
import type { useOwnedWorkspace } from "@/hooks/useOwnedWorkspace";

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

export default function ChatInterface({ workspace, onCitationClick }: ChatInterfaceProps & {
    workspace: ReturnType<typeof useOwnedWorkspace>;
}) {
    return (
        <div className="flex h-full min-h-0 flex-col">
            {!workspace.authenticated ? <SignedOutWelcome /> : workspace.error ? (
                <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-[#b5a79a]">
                    <p>{workspace.error}</p>
                    <button type="button" onClick={workspace.retry} className="text-[#c49b75] underline underline-offset-4">Retry workspace</button>
                </div>
            ) : !workspace.ready ? (
                <ConversationSkeleton />
            ) : (
                <NotebookChat key={`${workspace.userId}:${workspace.notebookId}`} userId={workspace.userId}
                    notebookId={workspace.notebookId} onCitationClick={onCitationClick} />
            )}
        </div>
    );
}

function NotebookChat({ userId, notebookId, onCitationClick }: ChatInterfaceProps & { userId: string; notebookId: string }) {
    // This component only mounts inside the ready workspace session.
    const chat = useChatSession()!;
    const { messages, isLoading, isAgentMode, sendMessage } = chat;
    const { composerVersion, navigationBlocked, setIsUploadingImages } = chat;

    const scrollRef = useRef<HTMLDivElement>(null);
    const firstMessage = useRef<string | undefined>(undefined);
    const isWelcome = messages.length === 0;
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

    if (chat.isHistoryLoading && messages.length === 0) return <ConversationSkeleton />;

    return (
        <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
            {chat.historyError && <div role="alert" className="px-5 py-3 text-xs text-[#d3ae82]">
                {chat.historyError} <button type="button" onClick={chat.retryHistory} className="underline">Retry history</button>
            </div>}
            <div className={cn("flex min-h-0 flex-1 flex-col", isWelcome ? "overflow-y-auto px-5 py-8 sm:px-8" : "overflow-hidden")} data-lenis-prevent>
                <div className={cn("flex min-h-0 flex-col", isWelcome ? "mx-auto my-auto w-full max-w-[820px] py-4" : "flex-1 overflow-hidden")}>
                    <div ref={scrollRef} data-lenis-prevent className={cn(isWelcome ? "shrink-0" : "min-h-0 flex-1 overflow-y-auto px-4 py-7 scroll-smooth sm:px-6")}>
                        {chat.isHistoryLoading && !chat.isConversationListLoading && <MessageSkeleton label="Loading saved messages" />}
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

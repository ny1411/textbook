"use client";

import { BookOpen, MessageSquare, Plus } from "lucide-react";
import { useState } from "react";
import { SlidingTabs } from "@/components/ui/sliding-tabs";
import { useChatSession } from "@/components/chat/ChatSessionProvider";
import { SidebarSources } from "@/components/sources/SidebarSources";
import { cn } from "@/lib/utils";
import { SidebarListSkeleton } from "./WorkspaceSkeletons";

type SidebarTab = "chat" | "sources";


export function WorkspaceSidebar({ authenticated, error, sourcesLoading, onRetry, onNavigate }: {
    authenticated: boolean;
    sourcesLoading: boolean;
    error?: string;
    onRetry: () => void;
    onNavigate: () => void;
}) {
    const [activeTab, setActiveTab] = useState<SidebarTab>("chat");
    return <SlidingTabs<SidebarTab>
        label="Workspace navigation" value={activeTab} onChange={setActiveTab}
        tabs={[
            { id: "chat", label: "Chat", content: <SidebarChats authenticated={authenticated}
                error={error} onRetry={onRetry} onNavigate={onNavigate} /> },
            { id: "sources", label: "Sources", content: <SidebarSources isLoading={sourcesLoading} error={error} onRetry={onRetry} /> },
        ]}
    />;
}

function SidebarChats({ authenticated, error, onRetry, onNavigate }: {
    authenticated: boolean;
    error?: string;
    onRetry: () => void;
    onNavigate: () => void;
}) {
    const chat = useChatSession();
    return <div className="flex min-h-0 flex-1 flex-col px-5 pt-5">
        <button type="button" disabled={!chat || chat.navigationBlocked}
            onClick={() => { chat?.startConversation(); onNavigate(); }}
            className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-xs text-accent transition-colors hover:border-accent/50 hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40">
            <Plus size={15} aria-hidden="true" /> New chat
        </button>
        <h2 className="mb-3 mt-6 text-[11px] font-medium uppercase tracking-wider text-muted">Chat history</h2>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-5" data-lenis-prevent>
            {!authenticated ? <p className="py-4 text-xs leading-5 text-muted">Sign in to save and revisit your chats.</p>
                : error ? <div role="alert" className="text-xs leading-5 text-muted">{error} <button type="button" onClick={onRetry} className="text-accent underline">Retry workspace</button></div>
                : !chat ? <SidebarListSkeleton kind="chats" />
                : <>
                    {chat.conversations.map((conversation) => <button key={conversation.id} type="button"
                        aria-current={chat.activeConversationId === conversation.id ? "true" : undefined}
                        disabled={chat.navigationBlocked} title={conversation.title}
                        onClick={() => { chat.openConversation(conversation.id); onNavigate(); }}
                        className={cn("flex w-full shrink-0 items-start gap-2.5 rounded-lg border px-3 py-3 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                            chat.activeConversationId === conversation.id ? "border-accent/35 bg-surface-raised text-foreground" : "border-transparent text-muted hover:bg-surface hover:text-foreground")}>
                        <MessageSquare size={15} strokeWidth={1.5} className="shrink-0 text-accent" aria-hidden="true" />
                        <span className="truncate leading-4">{conversation.title}</span>
                    </button>)}
                    {chat.isConversationListLoading && <SidebarListSkeleton kind="chats" count={chat.conversations.length ? 2 : 5} />}
                    {chat.historyError && <div role="alert" className="text-xs leading-5 text-muted">{chat.historyError} <button type="button" onClick={chat.retryHistory} className="text-accent underline">Retry history</button></div>}
                    {!chat.isHistoryLoading && !chat.historyError && chat.conversations.length === 0 && <p className="py-4 text-xs leading-5 text-muted">No chats yet. Start a new chat to explore your sources.</p>}
                    {chat.hasMoreConversations && <button type="button" onClick={chat.loadMoreConversations} disabled={chat.navigationBlocked}
                        className="rounded-lg py-2 text-xs text-accent hover:bg-surface disabled:opacity-40">More chats</button>}
                </>}
        </div>
        <div className="flex shrink-0 items-center gap-3 border-t border-border py-5 text-[11px] text-muted">
            <BookOpen size={22} strokeWidth={1.25} className="shrink-0 text-accent" aria-hidden="true" />
            <span>Your personal research space</span>
        </div>
    </div>;
}

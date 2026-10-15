"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useChat } from "@/hooks/useChat";
import { useTextbookStore } from "@/stores/useTextbookStore";
import { useVoicePlayback } from "@/components/voice/VoicePlaybackProvider";

type ChatSession = ReturnType<typeof useChat> & {
    composerVersion: number;
    navigationBlocked: boolean;
    setIsUploadingImages: (busy: boolean) => void;
    openConversation: (id: string) => void;
    startConversation: () => void;
};

const ChatSessionContext = createContext<ChatSession | null>(null);

export function useChatSession() {
    return useContext(ChatSessionContext);
}

export function ChatSessionProvider({ userId, notebookId, ready, children }: {
    userId: string;
    notebookId: string;
    ready: boolean;
    children: ReactNode;
}) {
    return ready ? (
        <ActiveChatSession key={`${userId}:${notebookId}`} userId={userId} notebookId={notebookId}>
            {children}
        </ActiveChatSession>
    ) : <ChatSessionContext.Provider value={null}>{children}</ChatSessionContext.Provider>;
}

function ActiveChatSession({ userId, notebookId, children }: {
    userId: string;
    notebookId: string;
    children: ReactNode;
}) {
    const chat = useChat(userId, notebookId);
    const [isUploadingImages, setIsUploadingImages] = useState(false);
    const [composerVersion, setComposerVersion] = useState(0);
    const { stop: stopPlayback } = useVoicePlayback();
    useEffect(() => () => stopPlayback(), [stopPlayback]);
    const navigationBlocked = chat.isLoading || isUploadingImages || chat.isHistoryLoading;

    const navigate = (id?: string) => {
        if (navigationBlocked) return;
        stopPlayback();
        useTextbookStore.getState().setActiveCitation(null);
        if (id) void chat.selectConversation(id);
        else void chat.newConversation();
        setComposerVersion((value) => value + 1);
    };

    return <ChatSessionContext.Provider value={{ ...chat, composerVersion, navigationBlocked,
        setIsUploadingImages, openConversation: (id) => navigate(id), startConversation: () => navigate() }}>
        {children}
    </ChatSessionContext.Provider>;
}

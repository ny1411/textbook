"use client";

import { sendAgentChatMessage, sendChatMessage } from "@/lib/api/chat";
import { useUserStore } from "@/stores/useUserStore";
import { CitationItem } from "@/types/api";
import { ChatMessageItem } from "@/types/chat";
import { useCallback, useState } from "react";
import { toast } from "sonner";

export function useChat() {
    const [messages, setMessages] = useState<ChatMessageItem[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isAgentMode, setIsAgentMode] = useState<boolean>(false);
    const [selectedMessage, setSelectedMessage] = useState<CitationItem | null>(null);

    const userId = useUserStore((s) => s.userId);

    const sendMessage = useCallback(
        async (queryText: string, overrideAgentMode?: boolean) => {
            const trimmedQuery = queryText.trim();
            if (!trimmedQuery || isLoading) return;

            const activeAgentMode = overrideAgentMode ?? isAgentMode;

            const userMessage: ChatMessageItem = {
                id: `user-${Date.now()}`,
                role: "user",
                content: trimmedQuery,
                isAgentMode: activeAgentMode,
                createdAt: new Date(),
            }

            setMessages((prev) => [...prev, userMessage]);
            setIsLoading(true);

            try {
                if (activeAgentMode) {
                    const response = await sendAgentChatMessage({
                        user_id: userId,
                        query: trimmedQuery,
                        top_k: 5,
                    });

                    const assistantMessage: ChatMessageItem = {
                        id: `assistant-${Date.now()}`,
                        role: "assistant",
                        content: response.answer,
                        appliedQuery: response.applied_query,
                        citations: response.citations || [],
                        isAgentMode: true,
                        agentMetadata: {
                            confidence_score: response.confidence_score,
                            is_grounded: response.is_grounded,
                            critique: response.critique,
                            iterationCount: response.iteration_count,
                        },
                        createdAt: new Date(),
                    }
                    setMessages((prev) => [...prev, assistantMessage]);
                } else {
                    const response = await sendChatMessage({
                        user_id: userId,
                        query: trimmedQuery,
                        top_k: 5,
                    });

                    const assistantMessage: ChatMessageItem = {
                        id: `assistant-${Date.now()}`,
                        role: "assistant",
                        content: response.answer,
                        appliedQuery: response.applied_query,
                        citations: response.citations || [],
                        createdAt: new Date(),
                    };
                    setMessages((prev) => [...prev, assistantMessage]);
                }
            } catch (error) {
                console.log("Chat Error:", error);
                toast.error("Failed to get response.");

                const errorMessage: ChatMessageItem = {
                    id: `error-${Date.now()}`,
                    role: "assistant",
                    content: "Sorry, I ran into an error while processing your request. Please try again.",
                    createdAt: new Date(),
                }
                setMessages((prev) => [...prev, errorMessage]);
            } finally {
                setIsLoading(false);
            }
        }, [userId, isLoading, isAgentMode]
    );

    const clearChat = useCallback(() => {
        setMessages([]);
    }, []);

    return {
        messages,
        isLoading,
        isAgentMode,
        setIsAgentMode,
        selectedMessage,
        setSelectedMessage,
        sendMessage,
        clearChat,
    }
}
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { sendAgentChatMessage, sendChatMessage, type ChatStreamEvent } from "@/lib/api/chat";
import { ApiError } from "@/lib/api/client";
import { createConversation, getConversations, getMessages, type Conversation } from "@/lib/api/conversations";
import { useSourceStore } from "@/stores/useSourcesStore";
import type { AgentChatResponse, ChatAttachment } from "@/types/api";
import type { ChatMessageItem } from "@/types/chat";

export function useChat(userId: string, notebookId: string) {
    const [messages, setMessages] = useState<ChatMessageItem[]>([]);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [streamStatus, setStreamStatus] = useState<string | null>(null);
    const [isHistoryLoading, setIsHistoryLoading] = useState(true);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [isAgentMode, setIsAgentMode] = useState(false);
    const [nextBefore, setNextBefore] = useState<number | null>(null);
    const [nextOffset, setNextOffset] = useState<number | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [canRetryMessage, setCanRetryMessage] = useState(false);
    const selectedDocumentIds = useSourceStore((state) => state.selectedDocumentIds);
    const controller = useRef<AbortController | null>(null);
    const requestController = useRef<AbortController | null>(null);
    const busy = useRef(true);
    const navigation = useRef(0);
    const pending = useRef<{ query: string; mode: boolean; requestId: string; conversationId: string; documentIds: string[] | null; attachments: ChatAttachment[]; cancelled?: boolean } | null>(null);
    const draftConversationId = useRef<string | null>(null);

    useEffect(() => {
        const abort = new AbortController();
        controller.current = abort;
        busy.current = true;
        const version = ++navigation.current;
        (async () => {
            try {
                const threads = await getConversations(notebookId, abort.signal);
                const first = threads.items[0];
                const page = first ? await getMessages(first.id, abort.signal) : { items: [], next_before: null };
                if (abort.signal.aborted || navigation.current !== version) return;
                setConversations(threads.items);
                setNextOffset(threads.next_offset);
                setActiveConversationId(first?.id ?? null);
                setMessages(page.items);
                setNextBefore(page.next_before);
                setHistoryError(null);
            } catch {
                if (!abort.signal.aborted) setHistoryError("Could not restore your saved chats.");
            } finally {
                if (!abort.signal.aborted && navigation.current === version) {
                    busy.current = false;
                    setIsHistoryLoading(false);
                }
            }
        })();
        return () => { abort.abort(); requestController.current?.abort(); };
    }, [userId, notebookId, attempt]);

    const selectConversation = useCallback(async (id: string, preservePending = false) => {
        const abort = controller.current;
        if (busy.current || !abort || abort.signal.aborted) return;
        busy.current = true;
        const version = ++navigation.current;
        const draft = preservePending && !pending.current?.cancelled ? pending.current : null;
        if (!preservePending) pending.current = null;
        draftConversationId.current = null;
        setCanRetryMessage(!!draft);
        setActiveConversationId(id);
        setMessages([]);
        setHistoryError(null);
        setIsHistoryLoading(true);
        try {
            const page = await getMessages(id, abort.signal);
            if (abort.signal.aborted || navigation.current !== version) return;
            setMessages(draft ? [...page.items, { id: `pending-${draft.requestId}`, role: "user", content: draft.query,
                attachments: draft.attachments, isAgentMode: draft.mode, createdAt: new Date() }] : page.items);
            setNextBefore(page.next_before);
        } catch {
            if (!abort.signal.aborted) setHistoryError("Could not load this chat.");
        } finally {
            if (!abort.signal.aborted && navigation.current === version) {
                busy.current = false;
                setIsHistoryLoading(false);
            }
        }
    }, []);

    const newConversation = useCallback(async () => {
        const abort = controller.current;
        if (busy.current || !abort || abort.signal.aborted) return;
        busy.current = true;
        setIsHistoryLoading(true);
        try {
            const thread = await createConversation(notebookId, abort.signal);
            if (abort.signal.aborted) return;
            navigation.current++;
            setConversations((items) => [thread, ...items]);
            setActiveConversationId(thread.id);
            setMessages([]);
            setNextBefore(null);
            setHistoryError(null);
            pending.current = null;
            draftConversationId.current = null;
            setCanRetryMessage(false);
        } catch {
            if (!abort.signal.aborted) toast.error("Could not create a chat. Please retry.");
        } finally {
            if (!abort.signal.aborted) { busy.current = false; setIsHistoryLoading(false); }
        }
    }, [notebookId]);

    const ensureConversation = useCallback(async () => {
        if (activeConversationId) return activeConversationId;
        const abort = controller.current;
        if (busy.current || historyError || !abort || abort.signal.aborted) throw new Error("Your chat is not ready. Please retry.");
        busy.current = true;
        draftConversationId.current ??= crypto.randomUUID();
        try {
            const thread = await createConversation(notebookId, abort.signal, draftConversationId.current);
            if (abort.signal.aborted) throw new DOMException("Chat cancelled", "AbortError");
            setActiveConversationId(thread.id);
            setConversations((items) => [thread, ...items.filter((item) => item.id !== thread.id)]);
            return thread.id;
        } finally {
            if (!abort.signal.aborted) busy.current = false;
        }
    }, [activeConversationId, historyError, notebookId]);

    const sendMessage = useCallback(async (queryText: string, overrideMode?: boolean,
        imageAttachments: ChatAttachment[] = [], uploadedConversationId?: string, retryId?: string) => {
        const query = queryText.trim();
        const lifetime = controller.current;
        const attachments = retryId && pending.current?.requestId === retryId ? pending.current.attachments : imageAttachments;
        if ((!query && attachments.length === 0) || busy.current || historyError || (canRetryMessage && !retryId) || !lifetime || lifetime.signal.aborted) return false;
        const mode = overrideMode ?? isAgentMode;
        const selectedIds = selectedDocumentIds?.slice() ?? null;
        const cancelledDraft = pending.current?.cancelled ? pending.current : null;
        // A stopped reply may have been saved just before the connection closed.
        // Reuse its key for an unchanged resend so the server can replay it.
        const resumeDraft = cancelledDraft && cancelledDraft.query === query && cancelledDraft.mode === mode
            && (!activeConversationId || cancelledDraft.conversationId === activeConversationId)
            && (!uploadedConversationId || cancelledDraft.conversationId === uploadedConversationId)
            && JSON.stringify(cancelledDraft.documentIds) === JSON.stringify(selectedIds)
            && JSON.stringify(cancelledDraft.attachments.map((image) => image.id)) === JSON.stringify(attachments.map((image) => image.id))
            ? cancelledDraft : null;
        busy.current = true;
        const abort = new AbortController();
        requestController.current = abort;
        const cancelOnUnmount = () => abort.abort();
        lifetime.signal.addEventListener("abort", cancelOnUnmount, { once: true });
        const requestId = retryId ?? resumeDraft?.requestId ?? crypto.randomUUID();
        const documentIds = retryId && pending.current?.requestId === retryId
            ? pending.current.documentIds : selectedIds;
        let conversationId = uploadedConversationId ?? activeConversationId ?? (retryId ? pending.current?.conversationId : resumeDraft?.conversationId) ?? crypto.randomUUID();
        let conversationReady = !!(activeConversationId || uploadedConversationId);
        let savedAfterCancel = false;
        pending.current = { query, mode, requestId, conversationId, documentIds, attachments };
        setCanRetryMessage(false);
        setIsLoading(true);
        setStreamStatus("preparing");
        setIsAgentMode(mode);
        const localId = `pending-${requestId}`;
        const assistantId = `streaming-${requestId}`;
        setMessages((items) => [...items.filter((item) => item.id !== localId && item.id !== assistantId), {
            id: localId, role: "user", content: query, attachments, isAgentMode: mode, createdAt: new Date(),
        }]);
        let candidate: ChatMessageItem = { id: assistantId, role: "assistant", content: "", isAgentMode: mode, createdAt: new Date() };
        const onEvent = ({ event, data }: ChatStreamEvent) => {
            if (abort.signal.aborted) return;
            if (event === "status") {
                setStreamStatus(data.stage);
            } else if (event === "reset") {
                candidate = { id: assistantId, role: "assistant", content: "", isAgentMode: mode, createdAt: new Date() };
                setMessages((items) => items.filter((item) => item.id !== assistantId));
            } else if (event === "token") {
                if (!data.delta) return;
                candidate = { ...candidate, content: candidate.content + data.delta };
                const updated = candidate;
                setMessages((items) => items.some((item) => item.id === assistantId)
                    ? items.map((item) => item.id === assistantId ? updated : item) : [...items, updated]);
            } else if (event === "citations") {
                candidate = { ...candidate, citations: data.citations, intent: data.intent, warning: data.warning,
                    agentMetadata: mode ? { ...candidate.agentMetadata,
                        is_grounded: typeof data.is_grounded === "boolean" ? data.is_grounded : undefined } : undefined };
                const updated = candidate;
                setMessages((items) => items.map((item) => item.id === assistantId ? updated : item));
            }
        };
        try {
            if (!activeConversationId && !uploadedConversationId) {
                const thread = await createConversation(notebookId, abort.signal, conversationId);
                abort.signal.throwIfAborted();
                conversationId = thread.id;
                conversationReady = true;
                setActiveConversationId(thread.id);
                setConversations((items) => [thread, ...items]);
            }
            const payload = { user_id: userId, notebook_id: notebookId, conversation_id: conversationId,
                request_id: requestId, query, attachment_ids: attachments.map((image) => image.id),
                document_ids: documentIds ?? undefined, top_k: 5 };
            const response: AgentChatResponse = await (mode ? sendAgentChatMessage(payload, abort.signal, onEvent) : sendChatMessage(payload, abort.signal, onEvent));
            abort.signal.throwIfAborted();
            const assistant: ChatMessageItem = {
                id: response.message_id!, role: "assistant", content: response.answer, citations: response.citations,
                appliedQuery: response.applied_query, intent: response.intent, warning: response.warning,
                isAgentMode: mode, createdAt: new Date(),
                agentMetadata: mode ? { confidence_score: response.confidence_score, is_grounded: response.is_grounded,
                    critique: response.critique, iterationCount: response.iteration_count } : undefined,
            };
            setMessages((items) => [...items.filter((item) => item.id !== assistant.id && item.id !== assistantId && item.id !== response.user_message_id).map((item) =>
                item.id === localId ? { ...item, id: response.user_message_id!, attachments: response.attachments ?? attachments } : item), assistant]);
            setConversations((items) => items.map((item) => item.id === conversationId
                ? { ...item, title: response.conversation_title ?? item.title, updated_at: new Date().toISOString() } : item));
            pending.current = null;
        } catch (error) {
            if (!abort.signal.aborted) {
                setMessages((items) => items.filter((item) => item.id !== assistantId));
                if (error instanceof ApiError && error.status === 409 && conversationId) {
                    try {
                        const page = await getMessages(conversationId, abort.signal);
                        abort.signal.throwIfAborted();
                        setMessages([...page.items, { id: localId, role: "user", content: query,
                            attachments, isAgentMode: mode, createdAt: new Date() }]);
                        setNextBefore(page.next_before);
                    } catch {
                        if (!abort.signal.aborted) setHistoryError("Could not restore the updated chat. Retry history before sending.");
                    }
                }
                if (!abort.signal.aborted) {
                    setCanRetryMessage(true);
                    toast.error("Could not save the reply. Retry to recover a completed response.");
                }
            }
        } finally {
            lifetime.signal.removeEventListener("abort", cancelOnUnmount);
            if (requestController.current === abort) requestController.current = null;
            if (!lifetime.signal.aborted) {
                if (abort.signal.aborted) {
                    setMessages((items) => items.filter((item) => item.id !== localId && item.id !== assistantId));
                    if (pending.current?.requestId === requestId) pending.current = { ...pending.current, cancelled: true };
                    setCanRetryMessage(false);
                }
                setIsLoading(false);
                setStreamStatus(null);
                if (abort.signal.aborted && conversationReady) {
                    // Recover a response committed before Stop reached the server.
                    setIsHistoryLoading(true);
                    try {
                        const page = await getMessages(conversationId, lifetime.signal);
                        if (!lifetime.signal.aborted) {
                            savedAfterCancel = page.completedRequestIds.includes(requestId);
                            if (savedAfterCancel) pending.current = null;
                            const savedIds = new Set(page.items.map((item) => item.id));
                            setMessages((items) => [...items.filter((item) => !savedIds.has(item.id)
                                && item.id !== localId && item.id !== assistantId), ...page.items]);
                        }
                    } catch {
                        if (!lifetime.signal.aborted) setHistoryError("Could not restore this chat after stopping. Retry history before sending.");
                    } finally {
                        if (!lifetime.signal.aborted) setIsHistoryLoading(false);
                    }
                }
                if (!lifetime.signal.aborted) busy.current = false;
            }
        }
        return savedAfterCancel || !abort.signal.aborted;
    }, [activeConversationId, historyError, isAgentMode, notebookId, selectedDocumentIds, userId, canRetryMessage]);

    const loadOlder = useCallback(async () => {
        const abort = controller.current;
        if (busy.current || !abort || !activeConversationId || nextBefore === null) return;
        busy.current = true;
        setIsHistoryLoading(true);
        try {
            const page = await getMessages(activeConversationId, abort.signal, nextBefore);
            if (abort.signal.aborted) return;
            setMessages((items) => [...page.items, ...items]);
            setNextBefore(page.next_before);
        } catch {
            if (!abort.signal.aborted) toast.error("Could not load older messages. Please retry.");
        } finally {
            if (!abort.signal.aborted) { busy.current = false; setIsHistoryLoading(false); }
        }
    }, [activeConversationId, nextBefore]);

    const loadMoreConversations = useCallback(async () => {
        const abort = controller.current;
        if (busy.current || !abort || nextOffset === null) return;
        busy.current = true;
        setIsHistoryLoading(true);
        try {
            const page = await getConversations(notebookId, abort.signal, nextOffset);
            if (abort.signal.aborted) return;
            setConversations((items) => [...items, ...page.items.filter((item) => !items.some((old) => old.id === item.id))]);
            setNextOffset(page.next_offset);
        } catch {
            if (!abort.signal.aborted) toast.error("Could not load more chats. Please retry.");
        } finally {
            if (!abort.signal.aborted) { busy.current = false; setIsHistoryLoading(false); }
        }
    }, [notebookId, nextOffset]);

    return { messages, conversations, activeConversationId, isLoading, streamStatus, isHistoryLoading, historyError, isAgentMode,
        sendMessage, ensureConversation, selectConversation, newConversation, loadOlder, loadMoreConversations,
        cancelMessage: () => requestController.current?.abort(),
        hasOlder: nextBefore !== null, hasMoreConversations: nextOffset !== null, canRetryMessage,
        retryHistory: () => {
            if (activeConversationId) void selectConversation(activeConversationId, true);
            else { setIsHistoryLoading(true); setAttempt((value) => value + 1); }
        },
        retryMessage: () => { const draft = pending.current; if (draft) void sendMessage(draft.query, draft.mode, draft.attachments, draft.conversationId, draft.requestId); } };
}

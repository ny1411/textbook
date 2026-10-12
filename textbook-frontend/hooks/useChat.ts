"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { sendAgentChatMessage, sendChatMessage } from "@/lib/api/chat";
import { ApiError } from "@/lib/api/client";
import { createConversation, deleteConversation, getDefaultNotebook, listConversations, listMessages, renameConversation } from "@/lib/api/conversations";
import { useUserStore } from "@/stores/useUserStore";
import { useSourceStore } from "@/stores/useSourcesStore";
import { useTextbookStore } from "@/stores/useTextbookStore";
import { ChatRequest } from "@/types/api";
import { ChatMessageItem, ConversationThread, StoredMessage } from "@/types/chat";

const toMessage = (m: StoredMessage): ChatMessageItem => ({
    id: m.id, role: m.role, content: m.content, requestId: m.request_id, sequence: m.sequence, status: m.status,
    appliedQuery: m.applied_query, intent: m.intent, warning: m.warning, citations: m.citations,
    isAgentMode: m.is_agent_mode, createdAt: new Date(m.created_at),
    agentMetadata: { confidence_score: m.confidence_score, is_grounded: m.is_grounded,
        critique: m.critique, iterationCount: m.iteration_count },
});
const errorText = (error: unknown) => error instanceof Error ? error.message : "Unable to load conversations.";
const currentScope = () => `${useUserStore.getState().userId}:${useTextbookStore.getState().activeNotebookId}`;

export function useChat() {
    const userId = useUserStore((s) => s.userId);
    const authenticated = useUserStore((s) => s.isAuthenticated);
    const notebookId = useTextbookStore((s) => s.activeNotebookId);
    const setNotebookId = useTextbookStore((s) => s.setActiveNotebookId);
    const rememberThread = useTextbookStore((s) => s.setActiveConversationId);
    const selectedDocumentIds = useSourceStore((s) => s.selectedDocumentIds);
    const scope = `${userId}:${notebookId}`;
    const epoch = useRef(0);
    const busy = useRef(false);
    const [threads, setThreads] = useState<ConversationThread[]>([]);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [stored, setStored] = useState<StoredMessage[]>([]);
    const [optimistic, setOptimistic] = useState<ChatMessageItem | null>(null);
    const [isLoading, setLoading] = useState(false);
    const [isHistoryLoading, setHistoryLoading] = useState(authenticated);
    const [error, setError] = useState<string | null>(null);
    const [messageCursor, setMessageCursor] = useState<number | null>(null);
    const [threadCursor, setThreadCursor] = useState<string | null>(null);
    const [retryRequest, setRetryRequest] = useState<{ payload: ChatRequest; agent: boolean } | null>(null);
    const [initializationAttempt, setInitializationAttempt] = useState(0);

    const selectConversation = useCallback(async (id: string) => {
        const version = ++epoch.current;
        const capturedScope = scope;
        busy.current = false;
        setLoading(false);
        setConversationId(id);
        rememberThread(scope, id);
        setStored([]); setOptimistic(null); setRetryRequest(null); setMessageCursor(null); setError(null);
        setHistoryLoading(true);
        useTextbookStore.getState().setActiveCitation(null);
        try {
            const page = await listMessages(id);
            if (version !== epoch.current || capturedScope !== currentScope()) return;
            setStored(page.messages); setMessageCursor(page.next_cursor);
        } catch (error) {
            if (version === epoch.current && capturedScope === currentScope()) setError(errorText(error));
        } finally {
            if (version === epoch.current && capturedScope === currentScope()) setHistoryLoading(false);
        }
    }, [scope, rememberThread]);

    useEffect(() => {
        let alive = true;
        const generation = epoch;
        if (!authenticated) return;
        async function initialize() {
            try {
                const notebook = await getDefaultNotebook();
                if (!alive) return;
                let page;
                if (notebookId !== "00000000-0000-0000-0000-000000000001") {
                    try { page = await listConversations(notebookId); }
                    catch (error) { if (!(error instanceof ApiError) || error.status !== 404) throw error; }
                }
                if (!alive) return;
                if (!page && notebookId !== notebook.id) { setNotebookId(notebook.id); return; }
                page ??= await listConversations(notebook.id);
                if (!alive) return;
                setThreads(page.conversations); setThreadCursor(page.next_cursor);
                const remembered = useTextbookStore.getState().activeConversationIds[scope];
                const selected = page.conversations.find((t) => t.id === remembered) ?? page.conversations[0];
                if (selected) await selectConversation(selected.id);
                else setHistoryLoading(false);
            } catch (error) {
                if (alive) { setError(errorText(error)); setHistoryLoading(false); }
            }
        }
        void initialize();
        return () => { alive = false; ++generation.current; };
    }, [authenticated, userId, notebookId, scope, setNotebookId, selectConversation, initializationAttempt]);

    const refresh = useCallback(async (id: string, version: number, capturedScope: string) => {
        const [page, threadPage] = await Promise.all([listMessages(id), listConversations(notebookId)]);
        if (version !== epoch.current || capturedScope !== currentScope()) return;
        const oldest = page.messages[0]?.sequence ?? Infinity;
        setStored((current) => [...current.filter((m) => m.sequence < oldest), ...page.messages]);
        if (!stored.length || stored[0].sequence >= oldest) setMessageCursor(page.next_cursor);
        setThreads((current) => [...new Map([...current, ...threadPage.conversations].map((t) => [t.id, t])).values()]
            .sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
        if (threads.length <= threadPage.conversations.length) setThreadCursor(threadPage.next_cursor);
        setOptimistic(null);
        const latest = page.messages.at(-1);
        if (latest?.status === "COMPLETED" && (latest.request_id === retryRequest?.payload.request_id ||
            stored.some((m) => m.status === "PENDING" && m.request_id === latest.request_id))) {
            setRetryRequest(null); setError(null);
        }
    }, [notebookId, stored, threads.length, retryRequest]);

    useEffect(() => {
        if (!conversationId || !authenticated || isLoading || isHistoryLoading) return;
        const pending = stored.some((m) => m.status === "PENDING");
        const needsTitle = threads.some((t) => !t.title_generated && !t.title_is_manual && t.title !== "New conversation");
        if (!pending && !needsTitle) return;
        const version = epoch.current;
        const interval = setInterval(() => {
            void refresh(conversationId, version, scope).catch(() => { /* Keep history during transient failures. */ });
        }, 4000);
        return () => clearInterval(interval);
    }, [conversationId, authenticated, isLoading, isHistoryLoading, stored, threads, refresh, scope]);

    const newConversation = useCallback(async () => {
        const capturedScope = scope;
        const version = epoch.current;
        setHistoryLoading(true);
        try {
            const thread = await createConversation(notebookId);
            if (capturedScope !== currentScope() || version !== epoch.current) return;
            setThreads((current) => [thread, ...current]);
            await selectConversation(thread.id);
        } catch (error) { if (capturedScope === currentScope() && version === epoch.current) {
            setHistoryLoading(false); toast.error(errorText(error));
        } }
    }, [notebookId, scope, selectConversation]);

    const execute = useCallback(async (payload: ChatRequest, agent: boolean) => {
        if (busy.current) return;
        busy.current = true;
        const version = epoch.current;
        const capturedScope = scope;
        setLoading(true); setError(null); setRetryRequest({ payload, agent });
        try {
            const response = await (agent ? sendAgentChatMessage(payload) : sendChatMessage(payload));
            if (version !== epoch.current || capturedScope !== currentScope()) return;
            setRetryRequest(null); setOptimistic(null);
            await refresh(response.conversation_id ?? payload.conversation_id!, version, capturedScope);
        } catch (error) {
            if (version !== epoch.current || capturedScope !== currentScope()) return;
            setError(errorText(error));
            try { await refresh(payload.conversation_id!, version, capturedScope); }
            catch { /* Keep the question and request ID for a safe retry. */ }
        } finally {
            if (version === epoch.current && capturedScope === currentScope()) { busy.current = false; setLoading(false); }
        }
    }, [scope, refresh]);

    const sendMessage = useCallback(async (query: string, agent = false) => {
        if (!authenticated) { toast.error("Sign in to save and continue conversations."); return false; }
        if (!query.trim() || busy.current || isHistoryLoading) return false;
        const capturedScope = scope;
        const version = epoch.current;
        let id = conversationId;
        if (!id) {
            busy.current = true; setHistoryLoading(true);
            try {
                const thread = await createConversation(notebookId);
                if (capturedScope !== currentScope() || version !== epoch.current) return false;
                id = thread.id;
                setThreads((current) => [thread, ...current]); setConversationId(id); rememberThread(scope, id);
            } catch (error) {
                if (capturedScope === currentScope()) { setError(errorText(error)); busy.current = false; setHistoryLoading(false); }
                return false;
            }
            busy.current = false;
            setHistoryLoading(false);
        }
        const requestId = crypto.randomUUID();
        setOptimistic({ id: requestId, requestId, role: "user", content: query.trim(), createdAt: new Date() });
        void execute({ user_id: userId, query: query.trim(), conversation_id: id, request_id: requestId,
            notebook_id: notebookId, document_ids: selectedDocumentIds, top_k: 5 }, agent);
        return true;
    }, [authenticated, isHistoryLoading, scope, conversationId, notebookId, rememberThread, execute, userId, selectedDocumentIds]);

    const retry = useCallback(async () => {
        if (retryRequest) { await execute(retryRequest.payload, retryRequest.agent); return; }
        const latest = stored[stored.length - 1];
        if (!latest || latest.role !== "assistant" || latest.status === "COMPLETED") return;
        await execute({ user_id: userId, query: latest.query!, request_id: latest.request_id,
            notebook_id: notebookId, conversation_id: conversationId, document_ids: latest.selected_document_ids,
            top_k: latest.top_k, use_analysis: latest.use_analysis }, latest.is_agent_mode);
    }, [retryRequest, stored, execute, userId, notebookId, conversationId]);

    const loadOlderMessages = useCallback(async () => {
        if (!conversationId || messageCursor === null) return;
        const version = epoch.current;
        const page = await listMessages(conversationId, messageCursor);
        if (version !== epoch.current || scope !== currentScope()) return;
        setStored((current) => [...page.messages.filter((m) => !current.some((c) => c.id === m.id)), ...current]);
        setMessageCursor(page.next_cursor);
    }, [conversationId, messageCursor, scope]);

    const loadOlderThreads = useCallback(async () => {
        if (!threadCursor) return;
        const page = await listConversations(notebookId, threadCursor);
        if (scope !== currentScope()) return;
        setThreads((current) => [...current, ...page.conversations.filter((t) => !current.some((c) => c.id === t.id))]);
        setThreadCursor(page.next_cursor);
    }, [notebookId, threadCursor, scope]);

    const renameThread = useCallback(async (id: string, title: string) => {
        try {
            const thread = await renameConversation(id, title);
            if (scope === currentScope()) setThreads((current) => current.map((t) => t.id === id ? thread : t));
        } catch (error) { if (scope === currentScope()) toast.error(errorText(error)); }
    }, [scope]);

    const deleteThread = useCallback(async (id: string) => {
        try {
            await deleteConversation(id);
            if (scope !== currentScope()) return;
            const remaining = threads.filter((t) => t.id !== id);
            setThreads(remaining);
            if (id === conversationId) {
                if (remaining[0]) await selectConversation(remaining[0].id);
                else { ++epoch.current; busy.current = false; setLoading(false); setConversationId(null); setStored([]);
                    setOptimistic(null); setRetryRequest(null); setError(null); setMessageCursor(null); rememberThread(scope, null); }
            }
        } catch (error) { if (scope === currentScope()) toast.error(errorText(error)); }
    }, [scope, threads, conversationId, selectConversation, rememberThread]);

    const latest = stored[stored.length - 1];
    const pending = latest?.status === "PENDING";
    const failed = latest?.status === "FAILED";
    const messages = stored.filter((m) => m.role === "user" || m.status === "COMPLETED").map(toMessage);
    if (optimistic && !stored.some((m) => m.request_id === optimistic.requestId)) messages.push(optimistic);
    return { messages, threads, conversationId, isLoading, isHistoryLoading, authenticated, error,
        pending, failed, canRetry: !!retryRequest || pending || failed,
        hasOlderMessages: messageCursor !== null, hasOlderThreads: threadCursor !== null,
        sendMessage, retry, newConversation, selectConversation, renameThread, deleteThread,
        loadOlderMessages, loadOlderThreads,
        reload: () => {
            if (conversationId) return selectConversation(conversationId);
            setError(null);
            setHistoryLoading(true);
            setInitializationAttempt((attempt) => attempt + 1);
        } };
}

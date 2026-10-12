import { ChatIntent, CitationItem } from "./api";

export interface ChatMessageItem {
    id: string;
    role: "user" | "assistant";
    content: string;
    appliedQuery?: string;
    intent?: ChatIntent;
    warning?: string | null;
    citations?: CitationItem[];
    isAgentMode?: boolean;
    agentMetadata?: {
        confidence_score?: number | null;
        is_grounded?: boolean | null;
        critique?: string | null;
        iterationCount?: number | null;
    }
    createdAt: Date;
    requestId?: string;
    sequence?: number;
    status?: "PENDING" | "COMPLETED" | "FAILED";
}

export interface ConversationThread {
    id: string;
    notebook_id: string;
    title: string;
    title_generated: boolean;
    title_is_manual: boolean;
    created_at: string;
    updated_at: string;
}

export interface StoredMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    request_id: string;
    sequence: number;
    status: "PENDING" | "COMPLETED" | "FAILED";
    query?: string;
    applied_query?: string;
    intent?: ChatIntent;
    is_grounded?: boolean | null;
    warning?: string | null;
    is_agent_mode: boolean;
    confidence_score?: number | null;
    critique?: string | null;
    iteration_count?: number | null;
    selected_document_ids: string[] | null;
    top_k: number;
    use_analysis: boolean;
    created_at: string;
    citations: CitationItem[];
}

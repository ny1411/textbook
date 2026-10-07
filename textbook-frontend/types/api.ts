export interface UploadResponse {
    message: string;
    filename: string;
    filepath: string;
    document_id: string;
    status: string;
}

export interface SearchRequest {
    user_id: string;
    query: string;
    document_id?: string | null;
    document_ids?: string[] | null;
    notebook_id?: string | null;
    top_k?: number;
    use_analysis?: boolean;
}

export interface SearchResponse {
    query: string;
    applied_query: string;
    total_results: number;
    results: SearchResultItem[];
}

export interface SearchResultItem {
    id: string;
    rrf_score: number;
    text: string;
    document_id?: string | null;
    page_number?: number | null;
    dense_score?: number | null;
    sparse_score?: number | null;
    rerank_score?: number | null;
    payload?: Record<string, unknown>
}

export type ChatIntent = "casual_chat" | "general_knowledge" | "textbook_rag";

export interface ChatAttachment {
    id: string;
    name: string;
    media_type: string;
    size: number;
    url: string;
    created_at: string;
}

export interface ChatRequest{
    history?: { role: "user" | "assistant"; content: string }[];
    user_id: string;
    query: string;
    conversation_id: string;
    request_id?: string;
    attachment_ids?: string[];
    document_id?: string | null;
    document_ids?: string[] | null;
    notebook_id?: string | null;
    top_k?: number;
    use_analysis?: boolean;
}

export interface ChatResponse{
    attachments?: ChatAttachment[];
    conversation_id?: string;
    conversation_title?: string;
    request_id?: string;
    message_id?: string;
    user_message_id?: string;
    intent?: ChatIntent;
    is_grounded?: boolean | null;
    warning?: string | null;
    query: string;
    answer: string;
    applied_query: string;
    citations: CitationItem[];
}

export interface AgentChatResponse extends ChatResponse {
    confidence_score?: number | null;
    is_grounded?: boolean | null;
    critique?: string | null;
    iteration_count?: number | null;
}

export interface CitationItem{
    source_id: number | string;
    document_id?: string | null;
    page_number?: number | null;
    text: string;
    chunk_id: string;
    rerank_score?: number | null;
}

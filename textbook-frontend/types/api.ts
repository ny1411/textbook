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

export interface ChatRequest{
    user_id: string;
    query: string;
    conversation_id?: string | null;
    document_id?: string | null;
    top_k?: number;
    use_analysis?: boolean;
}

export interface ChatResponse{
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

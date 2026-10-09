import { apiClient } from "./client";
import type { SearchRequest, SearchResponse } from "@/types/api";

export async function performSearch(
    payload: SearchRequest,
    signal?: AbortSignal,
): Promise<SearchResponse> {
    return apiClient<SearchResponse>("/api/search", {
        method: "POST",
        signal,
        body: JSON.stringify(payload),
    });
}
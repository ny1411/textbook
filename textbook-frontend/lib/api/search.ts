import { apiClient } from "./client";
import { SearchRequest, SearchResponse } from "@/types/api";

export async function performSearch(
    payload: SearchRequest,
): Promise<SearchResponse> {
    return apiClient<SearchResponse>("/api/search", {
        method: "POST",
        body: JSON.stringify(payload),
    });
}
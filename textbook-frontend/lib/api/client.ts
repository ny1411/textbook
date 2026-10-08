export class ApiError extends Error{
    constructor(
        public status: number,
        message: string,
        public details?: unknown
    ) {
        super(message);
        this.name = "ApiError";
    }
}

export async function apiFetch(
    endpoint: string,
    options: RequestInit = {}
): Promise<Response> {
    const isFormData = options.body instanceof FormData;
    const headers = new Headers(options.headers);
    const { data, error } = await createClient().auth.getSession();
    if (error) throw new ApiError(401, "Your session has expired; sign in again");
    if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);

    if(!isFormData && !headers.has("Content-Type")){
        headers.set("Content-Type", "application/json");
    }

    const response = await fetch(endpoint, {
        ...options,
        headers,
    });

    if(!response.ok) {
        let errorDetail = response.statusText;
        try{
            const errorJson = await response.json();
            errorDetail = errorJson.detail || JSON.stringify(errorJson);
        } catch {
            console.log("Response is not formatted in JSON");
        }
        throw new ApiError(response.status, errorDetail);
    }
    return response;
}

export async function apiClient<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    return (await apiFetch(endpoint, options)).json() as Promise<T>;
}
import { createClient } from "@/lib/supabase/client";

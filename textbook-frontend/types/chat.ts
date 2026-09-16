import { CitationItem } from "./api";

export interface ChatMessageItem {
    id: string;
    role: "user" | "assistant";
    content: string;
    appliedQuery?: string;
    citations?: CitationItem[];
    isAgentMode?: boolean;
    agentMetadata?: {
        confidence_score?: number | null;
        is_grounded?: boolean | null;
        critique?: string | null;
        iterationCount?: number | null;
    }
    createdAt: Date;
}
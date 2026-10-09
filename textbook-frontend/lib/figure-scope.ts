import type { CitationItem } from "@/types/api";

/** A restored citation can be a new object while still naming the same passage. */
export function figureCitationKey(citation: CitationItem | null | undefined): string {
    return citation ? JSON.stringify([
        citation.document_id ?? null, citation.source_id, citation.chunk_id,
        citation.page_number ?? null, citation.text,
    ]) : "none";
}

/** Keep the exact saved-citation prefix without splitting a math/emoji surrogate pair. */
export function boundedCitationExcerpt(text: string): string {
    const excerpt = text.slice(0, 2400);
    const last = excerpt.charCodeAt(excerpt.length - 1);
    return last >= 0xd800 && last <= 0xdbff ? excerpt.slice(0, -1) : excerpt;
}

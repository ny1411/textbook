"use client";

import { CitationItem } from "@/types/api";
import { ExternalLink, FileText } from "lucide-react";
import { relevancePercentage } from "@/lib/relevance";
import { HoverCard } from "@/components/ui/hover-card";
import styles from "@/components/ui/hover-card.module.css";

interface CitationBadgeProps {
    sourceId: string | number;
    citation?: CitationItem;
    onCitationClick?: (citation: CitationItem) => void;
}

export function CitationBadge({ sourceId, citation, onCitationClick }: CitationBadgeProps) {
    if (!citation) {
        return <span className={styles.unknown}>[{sourceId}]</span>;
    }

    const scorePercentage = relevancePercentage(citation.rerank_score);

    return (
        <HoverCard
            trigger={<>[{sourceId}]</>}
            label={`Source ${sourceId} preview`}
            triggerLabel={`Source ${sourceId}: Preview citation`}
        >
            {(close) => (
                <>
                    <span className={styles.header}>
                        <span className={styles.heading}>
                            <FileText aria-hidden="true" />
                            <span>Source {sourceId}</span>
                            {citation.page_number !== null && citation.page_number !== undefined && (
                                <span className={styles.page}>p. {citation.page_number}</span>
                            )}
                        </span>
                        {scorePercentage !== null && (
                            <span className={styles.match} title="Normalized cross-encoder relevance; not a calibrated probability">
                                {scorePercentage}% match
                            </span>
                        )}
                    </span>
                    <span data-lenis-prevent className={styles.excerpt}>
                        &ldquo;{citation.text}&rdquo;
                    </span>
                    <span className={styles.footer}>
                        <span className={styles.document} title={citation.document_id || ""}>
                            Doc: {citation.document_id || "document"}
                        </span>
                        {onCitationClick && (
                            <button type="button" className={styles.sourceAction} onClick={() => {
                                close();
                                onCitationClick(citation);
                            }}>
                                View Source <ExternalLink aria-hidden="true" />
                            </button>
                        )}
                    </span>
                </>
            )}
        </HoverCard>
    );
}

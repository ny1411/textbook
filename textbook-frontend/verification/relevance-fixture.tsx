"use client";

import { CitationBadge } from "@/components/chat/CitationBadge";
import { StudioPanel } from "@/components/layout/StudioPanel";
import { RetrievalInspectorModal } from "@/components/search/RetrievalInspectorModal";
import { useTextbookStore } from "@/stores/useTextbookStore";

export default function RelevanceFixture() {
    const { setActiveCitation, isInspectorOpen, setInspectorOpen } = useTextbookStore();
    const scores = [0, 0.8807970779778823, -1, 2, null, Number.NaN];
    return (
        <main className="flex gap-4 p-4">
            <div>
                {scores.map((score, index) => (
                    <CitationBadge key={index} sourceId={index + 1}
                        citation={{ source_id: index + 1, chunk_id: `chunk-${index}`,
                            text: `Fixture excerpt ${index + 1}`, document_id: "fixture-doc",
                            page_number: index + 1, rerank_score: score }}
                        onCitationClick={setActiveCitation} />
                ))}
            </div>
            <div className="h-[600px] w-96"><StudioPanel /></div>
            <RetrievalInspectorModal isOpen={isInspectorOpen} onClose={() => setInspectorOpen(false)} />
        </main>
    );
}

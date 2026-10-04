import { useEffect } from "react";
import { toast } from "sonner";
import { useSourceStore } from "@/stores/useSourcesStore";
import { apiClient } from "@/lib/api/client";
import { useUserStore } from "@/stores/useUserStore";
import { useTextbookStore } from "@/stores/useTextbookStore";

export function useDocumentPoller() {
    const sources = useSourceStore((s) => s.source);
    const updateSourceStatus = useSourceStore((s) => s.updateSourceStatus);

    useEffect(() => {
        const processingDocs = sources.filter(
            (s) => s.status === "processing" && s.documentId
        );
        if (processingDocs.length === 0) return;

        const interval = setInterval(async () => {
            for (const doc of processingDocs) {
                try {
                    const data = await apiClient<{ status: string; error?: string }>(`/api/documents/${doc.documentId}/status`);
                    if (useUserStore.getState().userId !== doc.userId ||
                        useTextbookStore.getState().activeNotebookId !== doc.notebookId) continue;

                    if (data.status === "ready") {
                        updateSourceStatus(doc.documentId!, "ready");
                        toast.success(`"${doc.filename}" is indexed and ready!`);
                    } else if (data.status === "failed") {
                        updateSourceStatus(doc.documentId!, "failed", data.error);
                        toast.error(`Failed to process "${doc.filename}"`);
                    }
                } catch (e) {
                    console.log("Polling error:", e);
                }
            }
        }, 2000);   // poll every 5s

        return () => clearInterval(interval);
    }, [sources, updateSourceStatus]);
}

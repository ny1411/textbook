export type IngestionStatus = "processing" | "ready" | "failed"

export interface SourceDocument {
    userId: string;
    filename: string;
    filepath: string;
    documentId?: string;
    notebookId?: string;
    status?: IngestionStatus;
    error?: string;
    deletionPending?: boolean;
    sampleKey?: string | null;
    size?: number;
    type?: string;
    uploadedAt?: Date;
    pageCount?: number;
}

export interface UploadProgress {
    file: File;
    progress: number;
    status: "uploading" | "success" | "error";
    error?: string;
}

// Keep the document picker aligned with the upload API's accepted formats.
export const ACCEPTED_TYPES = {
    "application/pdf": [".pdf"],
    "text/plain": [".txt", ".py", ".js", ".ts", ".jsx", ".tsx", ".html", ".css", ".json",
        ".c", ".cpp", ".cs", ".java", ".rs", ".go", ".swift", ".php"],
    "text/csv": [".csv"],
    "text/markdown": [".md"],
    "application/msword": [".doc"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    "application/vnd.ms-powerpoint": [".ppt"],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
    "audio/*": [],
    "image/*": [],
};

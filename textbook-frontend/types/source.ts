export interface SourceDocument {
    userId: string;
    filename: string;
    filepath: string;
    size?: number;
    type?: string;
    uploadedAt?: Date;
    pageCount?: number;
}

export interface UploadProgress{
    file: File;
    progress: number;
    status: "uploading" | "success" | "error";
    error?: string;
}

export const ACCEPTED_TYPES = {
    "application/pdf": [".pdf"],
    "text/plain": [".txt"],
    "text/markdown": [".md"],
    "application/msword": [".doc"],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xls"],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".ppt"],
}
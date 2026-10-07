"use client";

import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import { ArrowUp, ImagePlus, LoaderCircle, Plus, RotateCcw, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useDropzone, type FileRejection } from "react-dropzone";
import { ChatInputBorder } from "./ChatInputBorder";
import { uploadDocument } from "@/lib/api/upload";
import { CHAT_IMAGE_ACCEPT, CHAT_IMAGE_TYPES, MAX_CHAT_IMAGE_BYTES, MAX_CHAT_IMAGES, deleteChatImage, uploadChatImage } from "@/lib/api/attachments";
import { useUserStore } from "@/stores/useUserStore";
import { useSourceStore } from "@/stores/useSourcesStore";
import { ACCEPTED_TYPES } from "@/types/source";
import { useTextbookStore } from "@/stores/useTextbookStore";
import type { ChatAttachment } from "@/types/api";

interface PendingImage {
    id: string;
    file: File;
    preview: string;
    progress: number;
    status: "pending" | "uploading" | "uploaded" | "error";
    attachment?: ChatAttachment;
    error?: string;
}

interface ChatInputProps {
    onSend: (message: string, isAgentMode: boolean, attachments: ChatAttachment[], conversationId?: string) => Promise<boolean | undefined>;
    ensureConversation: () => Promise<string>;
    onBusyChange: (busy: boolean) => void;
    isLoading?: boolean;
    disabled?: boolean;
}

export function ChatInput({ onSend, ensureConversation, onBusyChange, isLoading = false, disabled = false }: ChatInputProps) {
    const [input, setInput] = useState("");
    const [isAgentMode, setAgentMode] = useState(false);
    const [isUploadingSources, setIsUploadingSources] = useState(false);
    const [isUploadingImages, setIsUploadingImages] = useState(false);
    const [images, setImages] = useState<PendingImage[]>([]);
    const [attachmentError, setAttachmentError] = useState<string | null>(null);
    const imagesRef = useRef<PendingImage[]>([]);
    const submittedIds = useRef(new Set<string>());
    const uploadController = useRef<AbortController | null>(null);
    const busy = useRef(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const imagePickerRef = useRef<HTMLInputElement>(null);
    const userId = useUserStore((s) => s.userId);
    const addSource = useSourceStore((s) => s.addSource);
    const activeNotebookId = useTextbookStore((s) => s.activeNotebookId);
    const blocked = disabled || isLoading || isUploadingImages;

    function updateImages(next: PendingImage[]) {
        imagesRef.current = next;
        setImages(next);
    }

    function updateImage(id: string, patch: Partial<PendingImage>) {
        updateImages(imagesRef.current.map((image) => image.id === id ? { ...image, ...patch } : image));
    }

    useEffect(() => () => {
        uploadController.current?.abort();
        for (const image of imagesRef.current) {
            URL.revokeObjectURL(image.preview);
            if (!submittedIds.current.has(image.attachment?.id ?? image.id) && image.status !== "pending") {
                void deleteChatImage(image.attachment?.id ?? image.id).catch(() => undefined);
            }
        }
    }, []);

    function addImages(files: File[]) {
        if (blocked || busy.current) return;
        const next = [...imagesRef.current];
        const errors: string[] = [];
        for (const file of files) {
            if (!CHAT_IMAGE_TYPES.includes(file.type)) {
                errors.push(`"${file.name}" must be a PNG, JPEG, or WebP image.`);
            } else if (file.size === 0 || file.size > MAX_CHAT_IMAGE_BYTES) {
                errors.push(`"${file.name}" must be non-empty and at most 10 MB.`);
            } else if (next.length >= MAX_CHAT_IMAGES) {
                errors.push("Attach up to 4 images per message.");
                break;
            } else {
                next.push({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file), progress: 0, status: "pending" });
            }
        }
        updateImages(next);
        setAttachmentError(errors.length ? errors.join(" ") : null);
    }

    function removeImage(id: string) {
        if (busy.current) return;
        const image = imagesRef.current.find((item) => item.id === id);
        if (!image) return;
        URL.revokeObjectURL(image.preview);
        updateImages(imagesRef.current.filter((item) => item.id !== id));
        setAttachmentError(null);
        if (image.status !== "pending") void deleteChatImage(image.attachment?.id ?? image.id).catch(() => toast.error("Could not remove the uploaded image. Please retry later."));
    }

    const handleUploadFiles = async (files: File[]) => {
        if (!files.length || blocked || isUploadingSources) return;
        setIsUploadingSources(true);
        try {
            for (const file of files) {
                try {
                    const request = await uploadDocument(userId, file, activeNotebookId);
                    if (useUserStore.getState().userId !== userId || useTextbookStore.getState().activeNotebookId !== activeNotebookId) continue;
                    addSource({ userId, filename: request.filename, filepath: request.filepath, documentId: request.document_id,
                        notebookId: activeNotebookId, status: "processing", size: file.size, type: file.type, uploadedAt: new Date() });
                    toast.success(`Uploaded "${file.name}"`);
                } catch {
                    toast.error(`Failed to upload "${file.name}"`);
                }
            }
        } finally { setIsUploadingSources(false); }
    };

    function onDropRejected(rejections: FileRejection[]) {
        setAttachmentError(rejections.map(({ file, errors }) => `"${file.name}": ${errors.map((error) => error.message).join(", ")}`).join(" "));
    }

    const { getRootProps, isDragActive } = useDropzone({
        onDrop: (files) => {
            const imageFiles = files.filter((file) => file.type.startsWith("image/"));
            const sourceFiles = files.filter((file) => !file.type.startsWith("image/"));
            if (imageFiles.length) addImages(imageFiles);
            if (sourceFiles.length) void handleUploadFiles(sourceFiles);
        },
        onDropRejected,
        accept: { ...ACCEPTED_TYPES, ...CHAT_IMAGE_ACCEPT },
        maxSize: 50 * 1024 * 1024, noClick: true, noKeyboard: true, noPaste: true, disabled: blocked || isUploadingSources,
    });
    const sourcePicker = useDropzone({ onDrop: handleUploadFiles, onDropRejected,
        accept: ACCEPTED_TYPES, maxSize: 50 * 1024 * 1024, noClick: true, noKeyboard: true, noPaste: true,
        disabled: blocked || isUploadingSources });

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
        }
    }, [input]);

    function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
        const imageItems = Array.from(event.clipboardData.items).filter((item) => item.kind === "file" && item.type.startsWith("image/"));
        if (!imageItems.length) return;
        const files = imageItems.flatMap((item) => { const file = item.getAsFile(); return file ? [file] : []; });
        addImages(files);
        // Keep the browser's normal text paste behavior for mixed text/image clipboards.
        if (!event.clipboardData.getData("text/plain")) event.preventDefault();
    }

    async function uploadImage(image: PendingImage, conversationId: string, signal: AbortSignal) {
        if (image.attachment) return image.attachment;
        updateImage(image.id, { status: "uploading", progress: 0, error: undefined });
        try {
            const attachment = await uploadChatImage(image.file, conversationId, image.id,
                (progress) => updateImage(image.id, { progress }), signal);
            updateImage(image.id, { status: "uploaded", progress: 100, attachment });
            return attachment;
        } catch (error) {
            if (!signal.aborted) updateImage(image.id, { status: "error", error: error instanceof Error ? error.message : "Could not upload image. Retry." });
            throw error;
        }
    }

    async function handleSubmit(retryImageId?: string) {
        if (busy.current || blocked || (!input.trim() && imagesRef.current.length === 0)) return;
        busy.current = true;
        setIsUploadingImages(true);
        onBusyChange(true);
        const controller = new AbortController();
        uploadController.current = controller;
        setAttachmentError(null);
        try {
            let conversationId: string | undefined;
            const attachments: ChatAttachment[] = [];
            if (imagesRef.current.length) {
                conversationId = await ensureConversation();
                if (controller.signal.aborted) return;
                for (const image of imagesRef.current) {
                    if (retryImageId && image.id !== retryImageId) continue;
                    attachments.push(await uploadImage(image, conversationId, controller.signal));
                }
            }
            if (retryImageId || controller.signal.aborted) return;
            for (const attachment of attachments) submittedIds.current.add(attachment.id);
            const accepted = await onSend(input.trim(), isAgentMode, attachments, conversationId);
            if (accepted) {
                setInput("");
                for (const image of imagesRef.current) URL.revokeObjectURL(image.preview);
                updateImages([]);
            } else {
                for (const attachment of attachments) submittedIds.current.delete(attachment.id);
            }
        } catch (error) {
            if (!controller.signal.aborted) setAttachmentError(error instanceof Error ? error.message : "Could not upload images. Please retry.");
        } finally {
            busy.current = false;
            if (!controller.signal.aborted) { setIsUploadingImages(false); onBusyChange(false); }
        }
    }

    const canSend = (input.trim().length > 0 || images.length > 0) && !blocked;
    return (
        <div className="p-4 shrink-0 bg-gradient-to-t from-zinc-900 via-zinc-900/50 to-transparent">
            <div {...getRootProps()} className="relative max-w-3xl mx-auto rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 shadow-xl focus-within:border-zinc-700 transition-all">
                <ChatInputBorder isActive={isLoading || isUploadingImages} isAgentMode={isAgentMode} />
                <input {...sourcePicker.getInputProps()} />
                <input ref={imagePickerRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden aria-label="Choose chat images"
                    onChange={(event) => { addImages(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
                {isDragActive && <div className="absolute inset-0 z-10 rounded-2xl bg-indigo-900/20 backdrop-blur-xs flex flex-col items-center justify-center gap-2 border-2 border-dashed border-indigo-500/50 pointer-events-none">
                    <Upload className="w-8 h-8 text-indigo-400" /><p className="text-zinc-300 text-sm">Drop images to attach, or documents to add sources</p>
                </div>}
                {images.length > 0 && <div aria-label="Attached images" className="flex gap-2 overflow-x-auto pb-3">
                    {images.map((image) => <div key={image.id} className="relative w-28 shrink-0 rounded-lg border border-zinc-700 bg-zinc-950/40 p-1.5">
                        <div className="relative h-18 w-full">
                            <Image unoptimized fill src={image.preview} alt={`Preview of ${image.file.name}`} sizes="100px" className="rounded object-contain" />
                        </div>
                        <button type="button" aria-label={`Remove ${image.file.name}`} disabled={blocked} onClick={() => removeImage(image.id)}
                            className="absolute right-0 top-0 rounded-full bg-zinc-900 p-1 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"><X size={13} /></button>
                        <p className="truncate pt-1 text-[10px] text-zinc-300" title={image.file.name}>{image.file.name}</p>
                        {image.status === "uploading" ? <div className="text-[10px] text-indigo-300" role="status">
                            <progress aria-label={`Uploading ${image.file.name}`} value={image.progress} max={100} className="h-1 w-full accent-indigo-400" />
                            {image.progress < 99 ? `Uploading ${image.progress}%` : "Finishing upload…"}
                        </div> : image.status === "error" ? <button type="button" disabled={blocked} onClick={() => void handleSubmit(image.id)}
                            className="flex items-center gap-1 text-[10px] text-amber-300" title={image.error}><RotateCcw size={10} /> Retry upload</button>
                            : <p className="text-[10px] text-zinc-500">{image.status === "uploaded" ? "Uploaded" : "Ready to send"}</p>}
                    </div>)}
                </div>}
                {attachmentError && <p role="alert" className="mb-2 px-2 text-xs text-amber-300">{attachmentError}</p>}
                <textarea ref={textareaRef} data-lenis-prevent rows={1} disabled={blocked} value={input}
                    onChange={(event) => setInput(event.target.value)} onPaste={handlePaste}
                    onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void handleSubmit(); } }}
                    placeholder={isAgentMode ? "Ask with Agentic Reasoning" : "Ask any question"}
                    className="relative w-full resize-none bg-transparent outline-none text-md px-2 text-zinc-100 placeholder:text-zinc-500 leading-relaxed max-h-[180px] overflow-y-auto selection:bg-indigo-600/10 selection:text-indigo-400" />
                <div className="flex items-center justify-between pt-2 mt-2">
                    <div className="flex items-center gap-1">
                        <button type="button" onClick={sourcePicker.open} disabled={isUploadingSources || blocked} aria-label="Upload sources"
                            className="p-2 rounded-full transition-all cursor-pointer text-indigo-400 hover:bg-indigo-500/40 hover:text-indigo-300 disabled:opacity-40">
                            {isUploadingSources ? <LoaderCircle size={20} className="animate-spin" /> : <Plus size={20} />}
                        </button>
                        <button type="button" onClick={() => imagePickerRef.current?.click()} disabled={blocked || images.length >= MAX_CHAT_IMAGES}
                            aria-label="Attach images" title="Attach up to 4 images (PNG, JPEG, WebP), 10 MB each"
                            className="p-2 rounded-full text-indigo-400 hover:bg-indigo-500/40 disabled:opacity-40"><ImagePlus size={20} /></button>
                        <button type="button" onClick={() => setAgentMode(!isAgentMode)} disabled={blocked}
                            className={`flex text-sm items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all cursor-pointer ${isAgentMode ? "text-indigo-400 bg-indigo-500/20" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"}`}>
                            <span>{isAgentMode ? "Agentic mode" : "Fast mode"}</span>
                        </button>
                    </div>
                    <button type="button" onClick={() => void handleSubmit()} disabled={!canSend} aria-label="Send message"
                        className={`p-2 rounded-full transition-all ${canSend ? "bg-indigo-500/20 text-indigo-400 cursor-pointer hover:bg-indigo-500/40" : "cursor-not-allowed text-zinc-600"}`}>
                        {isUploadingImages ? <LoaderCircle size={20} className="animate-spin" /> : <ArrowUp size={20} />}
                    </button>
                </div>
            </div>
            <p className="text-xs text-center text-zinc-500/50 mt-2">Textbook may generate incorrect information. Always verify with citated sources.</p>
        </div>
    );
}

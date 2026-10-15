"use client";

import Image from "next/image";
import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, LoaderCircle, RotateCcw, Upload, X } from "lucide-react";
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
import { useVoiceRecording } from "@/hooks/useVoiceRecording";
import { useVoicePlayback } from "@/components/voice/VoicePlaybackProvider";
import { AudioPlaybackCard } from "@/components/voice/AudioPlaybackCard";
import { cn } from "@/lib/utils";
import { UploadButton, type UploadStatus } from "@/components/ui/upload-button";
import { SelectMenu } from "@/components/ui/select-menu";
import { SmoothTextarea } from "@/components/ui/smooth-input";
import { VoiceInput } from "@/components/spectrumui/blocks/ai-assistants/voice-input";

const REASONING_OPTIONS = [
    { value: "fast", label: "Fast mode" },
    { value: "agentic", label: "Agentic mode" },
];

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
    welcome?: boolean;
    onRequestSignIn?: () => void;
}

export function ChatInput({ onSend, ensureConversation, onBusyChange, isLoading = false, disabled = false, welcome = false, onRequestSignIn }: ChatInputProps) {
    const [input, setInput] = useState("");
    const [isAgentMode, setAgentMode] = useState(false);
    const [sourceUploadStatus, setSourceUploadStatus] = useState<UploadStatus>("idle");
    const [sourceUploadProgress, setSourceUploadProgress] = useState<number | undefined>();
    const [isUploadingImages, setIsUploadingImages] = useState(false);
    const [images, setImages] = useState<PendingImage[]>([]);
    const [attachmentError, setAttachmentError] = useState<string | null>(null);
    const [autoSendVoice, setAutoSendVoice] = useState(false);
    const [startingText, setStartingText] = useState("");
    const playback = useVoicePlayback();
    const imagesRef = useRef<PendingImage[]>([]);
    const submittedIds = useRef(new Set<string>());
    const uploadController = useRef<AbortController | null>(null);
    const sourceUploadBusy = useRef(false);
    const failedSourceFiles = useRef<File[]>([]);
    const busy = useRef(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const userId = useUserStore((s) => s.userId);
    const addSource = useSourceStore((s) => s.addSource);
    const activeNotebookId = useTextbookStore((s) => s.activeNotebookId);
    const isUploadingSources = sourceUploadStatus === "uploading";
    const baseBlocked = disabled || isLoading || isUploadingImages || isUploadingSources;
    const blocked = baseBlocked;

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
        if (onRequestSignIn) { onRequestSignIn(); return; }
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
        if (!files.length || blocked || sourceUploadBusy.current) return;
        if (onRequestSignIn) { onRequestSignIn(); return; }
        sourceUploadBusy.current = true;
        onBusyChange(true);
        setSourceUploadStatus("uploading");
        setSourceUploadProgress(files.length > 1 ? 0 : undefined);
        setAttachmentError(null);
        const failed: File[] = [];
        const errors: string[] = [];
        let completed = 0;
        try {
            for (const file of files) {
                try {
                    const request = await uploadDocument(userId, file, activeNotebookId);
                    if (useUserStore.getState().userId !== userId || useTextbookStore.getState().activeNotebookId !== activeNotebookId) continue;
                    addSource({ userId, filename: request.filename, filepath: request.filepath, documentId: request.document_id,
                        notebookId: activeNotebookId, status: "processing", size: file.size, type: file.type, uploadedAt: new Date() });
                    toast.success(`Uploaded "${file.name}"`);
                } catch (error) {
                    failed.push(file);
                    errors.push(`"${file.name}": ${error instanceof Error ? error.message : "Upload failed. Please retry."}`);
                    toast.error(`Failed to upload "${file.name}"`);
                } finally {
                    completed += 1;
                    // Fetch has no upload byte events. Count completed files only.
                    if (files.length > 1) setSourceUploadProgress(completed / files.length);
                }
            }
        } finally {
            sourceUploadBusy.current = false;
            onBusyChange(false);
            failedSourceFiles.current = failed;
            setSourceUploadStatus(failed.length ? "error" : "done");
            if (errors.length) setAttachmentError(errors.join(" "));
        }
    };

    const resetSourceUpload = useCallback(() => setSourceUploadStatus("idle"), []);

    function onDropRejected(rejections: FileRejection[]) {
        setAttachmentError(rejections.map(({ file, errors }) => `"${file.name}": ${errors.map((error) => error.message).join(", ")}`).join(" "));
    }

    const { getRootProps, getInputProps, open: openFilePicker, isDragActive } = useDropzone({
        onDrop: (files) => {
            // Images supported by chat stay attached to the message; other files become sources.
            const imageFiles: File[] = [];
            const sourceFiles: File[] = [];
            for (const file of files) {
                const inferredType = Object.entries(CHAT_IMAGE_ACCEPT).find(([, extensions]) =>
                    extensions.some((extension) => file.name.toLowerCase().endsWith(extension)))?.[0];
                const type = file.type || inferredType;
                if (type && CHAT_IMAGE_TYPES.includes(type)) {
                    imageFiles.push(file.type ? file : new File([file], file.name, { type, lastModified: file.lastModified }));
                } else sourceFiles.push(file);
            }
            if (imageFiles.length) addImages(imageFiles);
            if (sourceFiles.length) void handleUploadFiles(sourceFiles);
        },
        onDropRejected,
        accept: { ...ACCEPTED_TYPES, ...CHAT_IMAGE_ACCEPT },
        maxSize: 50 * 1024 * 1024, noClick: true, noKeyboard: true, noPaste: true,
        disabled: blocked || isUploadingSources,
    });

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

    async function handleSubmit(retryImageId?: string, transcriptOverride?: string) {
        const query = (transcriptOverride ?? input).trim();
        if (busy.current || baseBlocked || (!query && imagesRef.current.length === 0)) return;
        if (onRequestSignIn) { onRequestSignIn(); return; }
        if (query.length > 8000) {
            setAttachmentError("Messages support up to 8,000 characters. Shorten your draft before sending.");
            return;
        }
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
            const accepted = await onSend(query, isAgentMode, attachments, conversationId);
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

    const { status: voiceStatus, elapsed: voiceElapsed, transcript: voiceTranscript, error: voiceError, recording: voiceRecording, waveformRef, start: startVoice, stop: stopVoice, cancel: cancelVoice, active: voiceActive } = useVoiceRecording((transcript, allowAutoSend) => {
        const merged = [startingText.trimEnd(), transcript].filter(Boolean).join("\n");
        setInput(merged);
        if (autoSendVoice && allowAutoSend) void handleSubmit(undefined, merged);
    });
    const voiceBlocked = blocked || voiceActive;
    const recordingId = `recording-${userId}-${activeNotebookId}`;
    const canSend = (input.trim().length > 0 || images.length > 0) && !voiceBlocked;
    return (
        <div className={cn("w-full shrink-0", !welcome && "px-4 pt-3 pb-4 sm:px-6")}>
            <div {...getRootProps()} className={cn("relative mx-auto flex w-full max-w-[820px] flex-col rounded-[20px] border border-[#705640] bg-[#201c18]/70 p-4 transition-colors focus-within:border-[#b08c69] sm:p-5", welcome ? "min-h-[170px]" : "min-h-[124px]")}>
                <ChatInputBorder isActive={isLoading || isUploadingImages} isAgentMode={isAgentMode} />
                <input {...getInputProps({ "aria-label": "Choose files to upload" })} />
                {isDragActive && <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-[#c49b75] bg-[#201c18]/95">
                    <Upload className="size-8 text-[#c49b75]" /><p className="text-sm text-[#ddd1c2]">Drop images to attach, or documents to add sources</p>
                </div>}
                {images.length > 0 && <div aria-label="Attached images" className="flex gap-2 overflow-x-auto pb-3">
                    {images.map((image) => <div key={image.id} className="relative w-28 shrink-0 rounded-lg border border-[#494036] bg-[#141210]/40 p-1.5">
                        <div className="relative h-18 w-full">
                            <Image unoptimized fill src={image.preview} alt={`Preview of ${image.file.name}`} sizes="100px" className="rounded object-contain" />
                        </div>
                        <button type="button" aria-label={`Remove ${image.file.name}`} disabled={voiceBlocked} onClick={() => removeImage(image.id)}
                            className="absolute right-0 top-0 rounded-full bg-[#1d1916] p-1 text-[#ddd1c2] hover:bg-[#494036] disabled:opacity-40"><X size={13} /></button>
                        <p className="truncate pt-1 text-[10px] text-[#c7b5a3]" title={image.file.name}>{image.file.name}</p>
                        {image.status === "uploading" ? <div className="text-[10px] text-[#d5ae88]" role="status">
                            <progress aria-label={`Uploading ${image.file.name}`} value={image.progress} max={100} className="h-1 w-full accent-[#c49b75]" />
                            {image.progress < 99 ? `Uploading ${image.progress}%` : "Finishing uploadâ€¦"}
                        </div> : image.status === "error" ? <button type="button" disabled={voiceBlocked} onClick={() => void handleSubmit(image.id)}
                            className="flex items-center gap-1 text-[10px] text-[#d3ae82]" title={image.error}><RotateCcw size={10} /> Retry upload</button>
                            : <p className="text-[10px] text-[#8d8073]">{image.status === "uploaded" ? "Uploaded" : "Ready to send"}</p>}
                    </div>)}
                </div>}
                {attachmentError && <p role="alert" className="mb-2 px-2 text-xs text-[#d3ae82]">{attachmentError}</p>}
                {voiceActive && <div className="mb-3 rounded-xl border border-[#705640] bg-[#c49b75]/5 px-3 py-2">
                    {voiceTranscript && <p className="mt-2 max-h-16 overflow-y-auto text-xs text-[#c7b5a3]">{voiceTranscript}</p>}
                    <label className="mt-2 flex items-center gap-2 text-xs text-[#aa9b8c]">
                        <input type="checkbox" checked={autoSendVoice} onChange={(event) => setAutoSendVoice(event.target.checked)} className="accent-[#c49b75]" />
                        Send when I stop recording
                    </label>
                </div>}
                {voiceError && <p role="alert" className="mb-2 px-2 text-xs text-[#d3ae82]">{voiceError}</p>}
                <SmoothTextarea ref={textareaRef} data-chat-input data-lenis-prevent rows={1} disabled={voiceBlocked} value={input}
                    onChange={(event) => setInput(event.target.value)} onPaste={handlePaste}
                    onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void handleSubmit(); } }}
                    aria-label="Ask a question"
                    placeholder={isAgentMode ? "Ask with deeper reasoning..." : "Ask anything about your sources..."}
                    className="relative max-h-[180px] w-full resize-none overflow-y-auto bg-transparent px-1 font-[Georgia,serif] text-[18px] leading-relaxed text-[#eee5d8] outline-none placeholder:text-[#b5a79a] selection:bg-[#c49b75]/20 sm:text-[20px]" />
                <div className={cn("flex items-center justify-between gap-2 pt-5", welcome ? "mt-auto" : "mt-1")}>
                    <div className={cn("flex min-w-0 items-center gap-1 sm:gap-2", voiceActive && "flex-1")}>
                        {!voiceActive && <UploadButton status={sourceUploadStatus} progress={sourceUploadProgress}
                            label="Upload" ariaLabel="Upload files" compact="responsive" disabled={voiceBlocked}
                            onStart={() => {
                                if (onRequestSignIn) onRequestSignIn();
                                else if (sourceUploadStatus === "error" && failedSourceFiles.current.length) void handleUploadFiles(failedSourceFiles.current);
                                else openFilePicker();
                            }} onReset={resetSourceUpload} />}
                        <VoiceInput state={voiceStatus === "stopping" ? "processing" : voiceStatus === "error" ? "idle" : voiceStatus}
                            elapsed={voiceElapsed} waveformRef={waveformRef} disabled={baseBlocked}
                            onConfirm={stopVoice} onCancel={cancelVoice}
                            onStart={() => {
                                if (onRequestSignIn) { onRequestSignIn(); return; }
                                setStartingText(input); playback.stop(); void startVoice();
                            }} />
                        {!voiceActive && <SelectMenu label="Reasoning mode" value={isAgentMode ? "agentic" : "fast"}
                            options={REASONING_OPTIONS} onChange={(value) => setAgentMode(value === "agentic")}
                            disabled={voiceBlocked} size="compact" className="w-[88px] sm:w-[140px]" />}
                    </div>
                    <button type="button" onClick={() => void handleSubmit()} disabled={!canSend} aria-label="Send message"
                        className={`flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${canSend ? "cursor-pointer border-[#c49b75] bg-[#c49b75] text-[#21180f] hover:bg-[#d3ae8b]" : "cursor-not-allowed border-[#775c45] bg-[#9b7757] text-[#241b13] opacity-65"}`}>
                        {isUploadingImages ? <LoaderCircle size={21} className="animate-spin" /> : <ArrowUp size={21} strokeWidth={1.6} />}
                    </button>
                </div>
                {voiceRecording && !voiceActive && <button type="button" onClick={() => {
                    if (playback.source?.id === recordingId) playback.stop();
                    else playback.start({ id: recordingId, title: "Your voice recording", recording: voiceRecording! });
                }} className="mt-2 px-2 text-xs text-[#d5ae88] underline">Review voice recording</button>}
                {playback.source?.id === recordingId && <AudioPlaybackCard key={recordingId} source={playback.source} />}
            </div>
            {!welcome && <p className="mt-3 text-center text-[11px] leading-relaxed text-[#8d8073]">Textbook may generate incorrect information. Always verify with cited sources.</p>}
        </div>
    );
}

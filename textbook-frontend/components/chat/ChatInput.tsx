"use client";

import { ChatInputBorder } from "./ChatInputBorder";

import { useState, useRef, useEffect } from "react";
import { ArrowUp, LoaderCircle, Plus, Upload } from "lucide-react";
import { toast } from "sonner";

import { uploadDocument } from "@/lib/api/upload";
import { useUserStore } from "@/stores/useUserStore";
import { useSourceStore } from "@/stores/useSourcesStore";
import { ACCEPTED_TYPES } from "@/types/source";
import { useDropzone } from "react-dropzone";

interface ChatInputProps {
    onSend: (message: string, isAgentMode: boolean) => void;
    isLoading?: boolean;
}

export function ChatInput({ onSend, isLoading = false }: ChatInputProps) {
    const [input, setInput] = useState("");
    const [isAgentMode, setAgentMode] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const userId = useUserStore((s) => s.userId);
    const addSource = useSourceStore((s) => s.addSource);

    const handleUploadFiles = async (files: File[]) => {
        if (!files.length) return
        setIsUploading(true);

        for (const file of files) {
            try {
                const request = await uploadDocument(userId, file);
                addSource({
                    userId: userId,
                    filename: request.filename,
                    filepath: request.filepath,
                    documentId: request.document_id,
                    status: "processing",
                    size: file.size,
                    type: file.type,
                    uploadedAt: new Date(),
                });

                toast.success(`Uploaded "${file.name}"`)
            } catch (error) {
                console.error("Error uploading file:", error);
                toast.error(`Failed to upload "${file.name}"`);
            } finally {
                setIsUploading(false);
            }
        }
    }

    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop: handleUploadFiles,
        accept: ACCEPTED_TYPES,
        maxSize: 50 * 1024 * 1024,
        noClick: true,
        noKeyboard: true,
        disabled: isUploading,
    });

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
        }
    }, [input]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    }

    const handleSubmit = () => {
        if (!input.trim() || isLoading) return;
        onSend(input.trim(), isAgentMode);
        setInput("");
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
        }
    };

    return (
        <div className="p-4 shrink-0 bg-gradient-to-t from-zinc-900 via-zinc-900/50 to-transparent">
            {/* Outer Prompt Container */}
            <div
                {...getRootProps()}
                className="relative max-w-3xl mx-auto rounded-2xl border border-zinc-800 
                bg-zinc-900/70 p-3 shadow-xl focus-within:border-zinc-700 
                transition-all">

                <ChatInputBorder isActive={isLoading} isAgentMode={isAgentMode} />

                <input {...getInputProps()} />

                {isDragActive && (
                    <div className="absolute inset-0 z-10 rounded-2xl bg-indigo-900/20 backdrop-blur-xs flex flex-col items-center justify-center gap-2 border-2 border-dashed border-indigo-500/50">
                        <Upload className="w-8 h-8 text-indigo-400" />
                        <p className="text-zinc-400 text-sm mb-2">
                            Drop your files here
                        </p>
                    </div>
                )}

                {/* Text Area */}
                <textarea
                    ref={textareaRef}
                    rows={1}
                    disabled={isLoading}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isAgentMode ? "Ask with Agentic Reasoning" : "Ask any question"}
                    className="relative w-full resize-none bg-transparent outline-none text-md px-2 text-zinc-100 placeholder:text-zinc-500 leading-relaxed max-h-[180px] overflow-y-auto selection:bg-indigo-600/10 selection:text-indigo-400"
                />
                {/* Bottom control bar */}
                <div className="flex items-center justify-between pt-2 mt-2">
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={open}
                            disabled={isUploading}
                            className="p-2 rounded-full transition-all cursor-pointer text-indigo-400 hover:bg-indigo-500/40 hover:text-indigo-300"
                        >
                            {isUploading ? <LoaderCircle size={20} className="animate-spin" /> : <Plus size={20} />}
                        </button>
                        <button
                            type="button"
                            onClick={() => setAgentMode(!isAgentMode)}
                            className={`flex text-sm items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all cursor-pointer ${isAgentMode ? "text-indigo-400 bg-indigo-500/20" : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60"}`}
                        >
                            {isAgentMode ?
                                <span>Agentic mode</span> :
                                <span>Fast mode</span>}
                        </button>
                    </div>
                    {/* Send button */}
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!input.trim() || isLoading}
                        className={`p-2 rounded-full transition-all 
                        ${input.trim() && !isLoading ?
                                "bg-indigo-500/20 text-indigo-400 cursor-pointer hover:bg-indigo-500/40" :
                                "cursor-not-allowed text-zinc-600"}`}
                    >
                        <ArrowUp size={20} />
                    </button>
                </div>
            </div>
            <p className="text-xs text-center text-zinc-500/50 mt-2">Textbook may generate incorrect information. Always verify with citated sources.</p>
        </div>
    );

}
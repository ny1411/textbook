"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { getChatImage } from "@/lib/api/attachments";
import type { ChatAttachment } from "@/types/api";

export function ChatImage({ attachment }: { attachment: ChatAttachment }) {
    const [source, setSource] = useState<{ id: string; url?: string; failed?: boolean }>({ id: "" });
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        let url: string | undefined;
        getChatImage(attachment.id, controller.signal).then((blob) => {
            if (controller.signal.aborted) return;
            url = URL.createObjectURL(blob);
            setSource({ id: attachment.id, url });
        }).catch(() => {
            if (!controller.signal.aborted) setSource({ id: attachment.id, failed: true });
        });
        return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
    }, [attachment.id, attempt]);

    const current = source.id === attachment.id ? source : undefined;
    return (
        <div className="w-40 max-w-full overflow-hidden rounded-lg border border-white/20 bg-zinc-950/30">
            {current?.url ? (
                <a href={current.url} target="_blank" rel="noopener noreferrer" aria-label={`Open image ${attachment.name}`} className="relative block h-28 w-full">
                    <Image unoptimized fill src={current.url} alt={attachment.name} sizes="160px"
                        className="object-contain" />
                </a>
            ) : current?.failed ? (
                <button type="button" onClick={() => { setSource({ id: "" }); setAttempt((value) => value + 1); }}
                    className="h-28 w-full px-2 text-xs underline">Retry loading image</button>
            ) : <div role="status" className="flex h-28 items-center justify-center text-xs">Loading image…</div>}
            <p className="truncate px-2 py-1 text-xs" title={attachment.name}>{attachment.name}</p>
        </div>
    );
}

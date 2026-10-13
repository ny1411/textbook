"use client";

import { Volume2 } from "lucide-react";
import { AudioPlaybackCard } from "./AudioPlaybackCard";
import { useVoicePlayback } from "./VoicePlaybackProvider";
import { useUserStore } from "@/stores/useUserStore";

export function ReadAloud({ id, text, title = "Read aloud" }: { id: string; text: string; title?: string }) {
    const playback = useVoicePlayback();
    const authenticated = useUserStore((state) => state.isAuthenticated);
    const selected = playback.source?.id === id;
    return <div className="w-full min-w-0">
        <button type="button" disabled={!authenticated || !text.trim()} aria-label={`Read aloud: ${title}`} aria-expanded={selected}
            onClick={() => { if (selected) playback.stop(); else playback.start({ id, text, title }); }}
            className="mt-2 inline-flex items-center gap-2 rounded-md px-1 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10 disabled:opacity-40">
            <Volume2 size={14} /> Read aloud
        </button>
        {selected && playback.source && <AudioPlaybackCard key={id} source={playback.source} />}
    </div>;
}

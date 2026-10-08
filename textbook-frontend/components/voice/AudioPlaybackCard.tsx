"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, Pause, Play, RotateCcw, X } from "lucide-react";
import { synthesizeSpeech } from "@/lib/api/voice";
import { speechParts } from "@/lib/voice-text";
import { useTextbookStore } from "@/stores/useTextbookStore";
import { PlaybackMesh } from "./PlaybackMesh";
import { useVoicePlayback, type PlaybackSource } from "./VoicePlaybackProvider";

function clock(value: number) {
    const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function AudioPlaybackCard({ source }: { source: PlaybackSource }) {
    const { stop } = useVoicePlayback();
    const notebookId = useTextbookStore((state) => state.activeNotebookId);
    const parts = useMemo(() => source.recording ? [""] : speechParts(source.text ?? ""), [source.recording, source.text]);
    const [part, setPart] = useState(0);
    const [attempt, setAttempt] = useState(0);
    const [asset, setAsset] = useState<{ part: number; url: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [playing, setPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [position, setPosition] = useState(0);
    const [speed, setSpeed] = useState(1);
    const audioRef = useRef<HTMLAudioElement>(null);
    const assets = useRef(new Map<number, string>());
    const autoPlay = useRef(true);
    const activeAsset = asset?.part === part ? asset.url : undefined;

    useEffect(() => {
        const controller = new AbortController();
        const cached = assets.current.get(part);
        const load = async () => {
            try {
                if (cached) { setAsset({ part, url: cached }); return; }
                if (!parts.length) throw new Error("There is no readable text in this item.");
                const blob = source.recording ?? await synthesizeSpeech(notebookId, parts[part], controller.signal);
                if (controller.signal.aborted) return;
                const url = URL.createObjectURL(blob);
                assets.current.set(part, url);
                setAsset({ part, url });
            } catch (cause) {
                if (!controller.signal.aborted) {
                    setError(cause instanceof Error ? cause.message : "Audio could not be prepared. Please retry.");
                    setLoading(false);
                }
            }
        };
        void load();
        return () => controller.abort();
    }, [part, attempt, notebookId, parts, source.recording]);

    useEffect(() => {
        const element = audioRef.current;
        const urls = assets.current;
        return () => {
            element?.pause();
            element?.removeAttribute("src");
            element?.load();
            for (const url of urls.values()) URL.revokeObjectURL(url);
            urls.clear();
        };
    }, []);

    function changePart(next: number) {
        audioRef.current?.pause();
        setPlaying(false);
        setPosition(0);
        setDuration(0);
        setLoading(true);
        setError(null);
        autoPlay.current = true;
        setPart(next);
    }

    async function play() {
        const audio = audioRef.current;
        if (!audio) return;
        try { await audio.play(); setError(null); }
        catch { setPlaying(false); setError("Playback could not start. Press Play to try again."); }
    }

    return <section aria-label={`Audio playback: ${source.title}`} className="relative mt-3 w-full min-w-0 overflow-hidden rounded-xl border border-indigo-500/30 bg-zinc-950 p-3 text-zinc-100">
        <PlaybackMesh playing={playing} />
        <div className="relative">
            <div className="mb-2 flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium">{source.title}</p>
                <button type="button" onClick={stop} aria-label="Close audio playback" className="shrink-0 rounded p-1.5 hover:bg-white/10"><X size={15} /></button>
            </div>
            {parts.length > 1 && <div className="mb-2 flex items-center justify-between gap-2 text-xs text-zinc-300">
                <button type="button" disabled={part === 0} onClick={() => changePart(part - 1)} aria-label="Previous audio part" className="rounded p-1.5 hover:bg-white/10 disabled:opacity-30"><ChevronLeft size={16} /></button>
                <span>Part {part + 1} of {parts.length}</span>
                <button type="button" disabled={part === parts.length - 1} onClick={() => changePart(part + 1)} aria-label="Next audio part" className="rounded p-1.5 hover:bg-white/10 disabled:opacity-30"><ChevronRight size={16} /></button>
            </div>}
            <audio ref={audioRef} src={activeAsset} preload="auto"
                onLoadedMetadata={(event) => {
                    const audio = event.currentTarget;
                    if (!Number.isFinite(audio.duration) || audio.duration <= 0) { setError("This recording has no seekable audio duration."); setLoading(false); return; }
                    audio.playbackRate = speed;
                    setDuration(audio.duration);
                }}
                onCanPlay={() => { setLoading(false); if (autoPlay.current) { autoPlay.current = false; void play(); } }}
                onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
                onEnded={() => { setPlaying(false); if (part + 1 < parts.length) changePart(part + 1); }}
                onError={() => { if (activeAsset) { setError("The audio could not be played. Retry to prepare it again."); setLoading(false); setPlaying(false); } }} />
            <div className="flex items-center gap-3">
                <button type="button" aria-label={playing ? "Pause audio" : "Play audio"} disabled={loading || !activeAsset}
                    onClick={() => { if (playing) audioRef.current?.pause(); else void play(); }}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/30 text-indigo-100 hover:bg-indigo-500/50 disabled:opacity-40">
                    {loading ? <LoaderCircle size={18} className="animate-spin" /> : playing ? <Pause size={18} /> : <Play size={18} />}
                </button>
                <div className="min-w-0 flex-1">
                    <input type="range" aria-label={parts.length > 1 ? `Seek audio part ${part + 1}` : "Seek audio"}
                        min={0} max={duration || 1} step={0.1} value={Math.min(position, duration || 1)} disabled={loading || !duration}
                        onChange={(event) => { const next = Number(event.target.value); if (audioRef.current) audioRef.current.currentTime = next; setPosition(next); }}
                        className="block w-full accent-indigo-400" />
                    <div className="mt-1 flex justify-between text-[10px] tabular-nums text-zinc-300"><span>{clock(position)}</span><span>{clock(duration)}</span></div>
                </div>
                <label className="shrink-0 text-xs"><span className="sr-only">Playback speed</span>
                    <select aria-label="Playback speed" value={speed} onChange={(event) => {
                        const rate = Number(event.target.value); setSpeed(rate); if (audioRef.current) audioRef.current.playbackRate = rate;
                    }} className="rounded bg-zinc-900/70 px-1 py-1.5 text-zinc-100">
                        {[1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}×</option>)}
                    </select>
                </label>
            </div>
            {loading && <p role="status" className="mt-2 text-xs text-zinc-300">Preparing audio…</p>}
            {error && <div role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-amber-300">
                <p>{error}</p><button type="button" className="inline-flex items-center gap-1 underline" onClick={() => {
                    audioRef.current?.pause(); const url = assets.current.get(part); if (url) URL.revokeObjectURL(url);
                    assets.current.delete(part); setAsset(null); setError(null); setLoading(true); setPlaying(false);
                    autoPlay.current = true; setAttempt((value) => value + 1);
                }}><RotateCcw size={12} /> Retry audio</button>
            </div>}
        </div>
    </section>;
}

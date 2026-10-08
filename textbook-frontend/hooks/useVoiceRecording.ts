"use client";

import { useEffect, useRef, useState } from "react";

interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface Recognition {
    continuous: boolean; interimResults: boolean; lang: string;
    onresult: ((event: RecognitionEvent) => void) | null;
    onerror: ((event: { error: string }) => void) | null;
    onend: (() => void) | null;
    start: () => void; stop: () => void; abort: () => void;
}
type RecognitionWindow = Window & {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
};
type Status = "idle" | "requesting" | "recording" | "stopping" | "error";
interface Session {
    stream?: MediaStream; recorder?: MediaRecorder; context?: AudioContext; recognition?: Recognition;
    frame?: number; timer?: ReturnType<typeof setInterval>; finishTimer?: ReturnType<typeof setTimeout>;
    started: number; chunks: Blob[]; final: string; interim: string;
    stopped: boolean; cancelled: boolean; recognitionEnded: boolean; recorderEnded: boolean; completed: boolean;
    error?: string;
}

const recognitionErrors: Record<string, string> = {
    "not-allowed": "Microphone or speech recognition permission was denied. Allow access in your browser and retry.",
    "service-not-allowed": "Speech recognition is unavailable in this browser. Try Chrome or Edge, or type your question.",
    "audio-capture": "No microphone is available. Connect one and retry.",
    "network": "Speech recognition could not connect. Check your connection and retry.",
    "no-speech": "No speech was detected. Try recording again.",
    "language-not-supported": "Speech recognition does not support your browser language. Change the browser language or type your question.",
};

function stopCapture(session: Session) {
    if (session.frame !== undefined) cancelAnimationFrame(session.frame);
    if (session.timer !== undefined) clearInterval(session.timer);
    session.stream?.getTracks().forEach((track) => track.stop());
}

function dispose(session: Session) {
    stopCapture(session);
    if (session.finishTimer !== undefined) clearTimeout(session.finishTimer);
    if (session.recognition) {
        session.recognition.onresult = null; session.recognition.onerror = null; session.recognition.onend = null;
        try { session.recognition.abort(); } catch { /* Already stopped. */ }
    }
    if (session.recorder) {
        session.recorder.ondataavailable = null; session.recorder.onstop = null; session.recorder.onerror = null;
        if (session.recorder.state !== "inactive") try { session.recorder.stop(); } catch { /* Already stopped. */ }
    }
    if (session.context?.state !== "closed") void session.context?.close().catch(() => undefined);
}

async function seekableRecording(blob: Blob): Promise<Blob> {
    // MediaRecorder WebM metadata may report Infinity. Encode decoded samples as WAV
    // so recording review uses a genuine, finite duration and audio seeking.
    const context = new AudioContext();
    try {
        const audio = await context.decodeAudioData(await blob.arrayBuffer());
        const channels = audio.numberOfChannels;
        const buffer = new ArrayBuffer(44 + audio.length * channels * 2);
        const view = new DataView(buffer);
        const write = (offset: number, value: string) => { for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index)); };
        write(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); write(8, "WAVE"); write(12, "fmt ");
        view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
        view.setUint32(24, audio.sampleRate, true); view.setUint32(28, audio.sampleRate * channels * 2, true);
        view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, buffer.byteLength - 44, true);
        const samples = Array.from({ length: channels }, (_, index) => audio.getChannelData(index));
        let offset = 44;
        for (let frame = 0; frame < audio.length; frame++) for (let channel = 0; channel < channels; channel++) {
            const sample = Math.max(-1, Math.min(1, samples[channel][frame]));
            view.setInt16(offset, sample < 0 ? sample * 32768 : sample * 32767, true); offset += 2;
        }
        return new Blob([buffer], { type: "audio/wav" });
    } finally { await context.close(); }
}

export function useVoiceRecording(onComplete: (transcript: string, allowAutoSend: boolean) => void) {
    const [status, setStatus] = useState<Status>("idle");
    const [elapsed, setElapsed] = useState(0);
    const [transcript, setTranscript] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [recording, setRecording] = useState<Blob | null>(null);
    const current = useRef<Session | null>(null);
    const callback = useRef(onComplete);
    const waveformRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => { callback.current = onComplete; }, [onComplete]);
    useEffect(() => () => {
        if (current.current) { current.current.cancelled = true; dispose(current.current); }
        current.current = null;
    }, []);

    async function finish(session: Session) {
        if (session.cancelled || session.completed || current.current !== session) return;
        session.completed = true;
        const text = `${session.final} ${session.interim}`.trim();
        const blob = new Blob(session.chunks, { type: session.recorder?.mimeType || "audio/webm" });
        dispose(session);
        try {
            if (blob.size) {
                const audio = await seekableRecording(blob);
                if (session.cancelled || current.current !== session) return;
                setRecording(audio);
            }
        } catch { /* Dictation remains usable if this browser cannot decode its own recording. */ }
        if (session.cancelled || current.current !== session) return;
        current.current = null;
        setTranscript("");
        setStatus(session.error ? "error" : "idle");
        setError(session.error ?? (text ? null : "No speech was detected. Try recording again."));
        if (text) callback.current(text, !session.error);
    }

    function stopSession(session: Session) {
        if (session.stopped || session.cancelled) return;
        session.stopped = true;
        setStatus("stopping");
        if (session.recorder?.state === "recording") session.recorder.stop();
        else session.recorderEnded = true;
        stopCapture(session);
        try { session.recognition?.stop(); } catch { session.recognitionEnded = true; }
        if (session.recognitionEnded && session.recorderEnded) void finish(session);
        else session.finishTimer = setTimeout(() => void finish(session), 2500);
    }

    async function start() {
        if (current.current) return;
        setError(null); setTranscript(""); setElapsed(0); setRecording(null);
        const RecognitionApi = (window as RecognitionWindow).SpeechRecognition ?? (window as RecognitionWindow).webkitSpeechRecognition;
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder || !window.AudioContext || !RecognitionApi) {
            setStatus("error"); setError("Voice input needs a secure page and a browser with speech recognition, such as Chrome or Edge. You can still type your question."); return;
        }
        const session: Session = { started: 0, chunks: [], final: "", interim: "", stopped: false, cancelled: false,
            recognitionEnded: false, recorderEnded: false, completed: false };
        current.current = session; setStatus("requesting");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
            if (session.cancelled || current.current !== session) { stream.getTracks().forEach((track) => track.stop()); return; }
            session.stream = stream;
            const context = new AudioContext(); session.context = context;
            await context.resume();
            if (session.cancelled || current.current !== session) { dispose(session); return; }
            const analyser = context.createAnalyser(); analyser.fftSize = 256;
            context.createMediaStreamSource(stream).connect(analyser);
            const samples = new Uint8Array(analyser.frequencyBinCount);
            const draw = () => {
                if (session.cancelled || session.stopped) return;
                analyser.getByteFrequencyData(samples);
                const canvas = waveformRef.current;
                const drawing = canvas?.getContext("2d");
                if (canvas && drawing) {
                    drawing.clearRect(0, 0, canvas.width, canvas.height); drawing.fillStyle = "#a5b4fc";
                    for (let bar = 0; bar < 28; bar++) {
                        const energy = samples[Math.floor(bar * samples.length / 28)] / 255;
                        const height = Math.max(3, energy * (canvas.height - 4));
                        drawing.fillRect(bar * canvas.width / 28 + 2, (canvas.height - height) / 2, canvas.width / 28 - 4, height);
                    }
                }
                session.frame = requestAnimationFrame(draw);
            };
            const recorder = new MediaRecorder(stream); session.recorder = recorder;
            recorder.ondataavailable = (event) => { if (event.data.size) session.chunks.push(event.data); };
            recorder.onstop = () => {
                session.recorderEnded = true;
                if (session.stopped && session.recognitionEnded) void finish(session);
            };
            recorder.onerror = () => { session.error = "Recording failed. Check your microphone and retry."; stopSession(session); };
            const recognition = new RecognitionApi(); session.recognition = recognition;
            recognition.continuous = true; recognition.interimResults = true; recognition.lang = navigator.language || "en-US";
            recognition.onresult = (event) => {
                if (session.cancelled || session.completed) return;
                let final = "", interim = "";
                for (let index = 0; index < event.results.length; index++) {
                    const result = event.results[index];
                    if (result.isFinal) final += `${result[0].transcript} `; else interim += `${result[0].transcript} `;
                }
                session.final = final.trim(); session.interim = interim.trim();
                setTranscript(`${session.final} ${session.interim}`.trim());
            };
            recognition.onerror = (event) => {
                if (session.cancelled || session.completed || (event.error === "aborted" && session.stopped)) return;
                session.error = recognitionErrors[event.error] ?? "Speech recognition failed. Please retry or type your question.";
                stopSession(session);
            };
            recognition.onend = () => {
                session.recognitionEnded = true;
                if (!session.stopped) stopSession(session);
                else if (session.recorderEnded) void finish(session);
            };
            recorder.start(250); recognition.start(); session.started = Date.now(); setStatus("recording"); draw();
            session.timer = setInterval(() => {
                const seconds = Math.floor((Date.now() - session.started) / 1000); setElapsed(seconds);
                if (seconds >= 120) stopSession(session);
            }, 250);
        } catch (cause) {
            if (session.cancelled || current.current !== session) return;
            dispose(session); current.current = null; setStatus("error");
            setError(cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "SecurityError")
                ? "Microphone permission was denied. Allow access in your browser and retry."
                : "Could not start the microphone. Connect a microphone and try again.");
        }
    }

    function cancel() {
        const session = current.current;
        if (session) { session.cancelled = true; dispose(session); current.current = null; }
        setStatus("idle"); setTranscript(""); setError(null);
    }
    function stop() { if (current.current) stopSession(current.current); }
    return { status, elapsed, transcript, error, recording, waveformRef, start, stop, cancel,
        active: status === "requesting" || status === "recording" || status === "stopping" };
}

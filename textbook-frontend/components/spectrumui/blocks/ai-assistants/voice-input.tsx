"use client";

// Spectrum UI Voice Input, adapted to Textbook's real microphone lifecycle.
// https://ui.spectrumhq.in/blocks/ai-assistants#voice-input
import type { RefObject } from "react";
import { Check, LoaderCircle, Mic, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type VoiceInputState = "idle" | "requesting" | "recording" | "processing";

export interface VoiceInputProps {
  state: VoiceInputState;
  elapsed: number;
  waveformRef: RefObject<HTMLCanvasElement | null>;
  onStart: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
  className?: string;
}

const actionClass = "grid size-8 shrink-0 place-items-center rounded-full transition-[color,background-color,transform] duration-150 active:scale-[0.96] motion-reduce:transform-none focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";

export function VoiceInput({
  state,
  elapsed,
  waveformRef,
  onStart,
  onConfirm,
  onCancel,
  disabled = false,
  className,
}: VoiceInputProps) {
  const clock = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const active = state !== "idle";

  return (
    <div
      data-voice-input
      data-state={state}
      className={cn(
        "flex h-10 min-w-0 items-center gap-2 rounded-full border border-border bg-surface-raised p-1 text-foreground",
        active ? "flex-1 pr-2" : "w-fit shrink-0",
        className,
      )}
    >
      {state === "idle" ? (
        <>
          <button
            type="button"
            aria-label="Start voice input"
            title="Dictate a question (up to 2 minutes)"
            disabled={disabled}
            onClick={onStart}
            className={cn(actionClass, "bg-accent/15 text-accent hover:bg-accent/25")}
          >
            <Mic aria-hidden="true" size={17} strokeWidth={1.6} />
          </button>
          <span className="hidden pr-2 text-xs text-muted sm:inline">Speak</span>
        </>
      ) : (
        <>
          <button
            type="button"
            aria-label="Cancel voice recording"
            onClick={onCancel}
            className={cn(actionClass, "text-muted hover:bg-accent/10 hover:text-foreground")}
          >
            <X aria-hidden="true" size={15} />
          </button>
          {state === "recording" ? (
            <>
              <canvas ref={waveformRef} width={280} height={30} aria-hidden="true" data-live-waveform
                className="h-6 min-w-0 flex-1 text-accent" />
              <span role="timer" aria-label={`Recording ${clock}`}
                className="shrink-0 font-mono text-xs tabular-nums text-muted">{clock}</span>
              <button
                type="button"
                aria-label="Stop voice recording"
                title="Finish recording and transcribe"
                onClick={onConfirm}
                className={cn(actionClass, "bg-accent/20 text-accent hover:bg-accent/30")}
              >
                <Check aria-hidden="true" size={16} />
              </button>
              <span className="sr-only" role="status">Recording</span>
            </>
          ) : (
            <span role="status" className="flex min-w-0 items-center gap-2 pr-1 text-xs text-muted">
              <LoaderCircle aria-hidden="true" size={15} className="shrink-0 animate-spin text-accent motion-reduce:animate-none" />
              {state === "requesting" ? "Allow microphone access…" : "Transcribing…"}
            </span>
          )}
        </>
      )}
    </div>
  );
}

export default VoiceInput;

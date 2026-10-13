"use client";

// Xevrion UI Lab Upload Button: pill-to-ring morph, adapted to real requests.
// https://lab.xevrion.dev/lab/upload-button
import { useEffect, useRef, useState } from "react";
import { motion, useMotionValueEvent, useSpring, useTransform } from "motion/react";
import { Check, RotateCcw, Upload, X } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

export type UploadStatus = "idle" | "uploading" | "done" | "error";

const SIZE = 40;
const RADIUS = 18;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const MORPH = { type: "spring", duration: 0.3, bounce: 0 } as const;
const FILL = { visualDuration: 0.4, bounce: 0 };
const FULL = 0.995;

export interface UploadButtonProps {
  status: UploadStatus;
  /** Actual completed fraction, 0–1. Omit when transport progress is unknown. */
  progress?: number;
  onStart: () => void;
  /** Only supply when the underlying upload really supports cancellation. */
  onCancel?: () => void;
  onReset: () => void;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  compact?: boolean | "responsive";
  resetAfter?: number;
  className?: string;
}

export function UploadButton({
  status,
  progress,
  onStart,
  onCancel,
  onReset,
  label = "Upload",
  ariaLabel = label,
  disabled = false,
  compact = false,
  resetAfter = 1500,
  className,
}: UploadButtonProps) {
  const reduceMotion = useReducedMotion();
  const shown = useSpring(0, FILL);
  const [ringFull, setRingFull] = useState(false);
  const previousStatus = useRef<UploadStatus>(status);

  useEffect(() => {
    const fresh = previousStatus.current !== "uploading" && status === "uploading";
    previousStatus.current = status;
    if (status === "idle" || status === "error") return;
    if (fresh) shown.jump(0);
    const target = status === "done" ? 1 : Math.min(Math.max(progress ?? 0, 0), 1);
    if (reduceMotion) shown.jump(target);
    else shown.set(target);
  }, [status, progress, reduceMotion, shown]);

  useMotionValueEvent(shown, "change", (value) => setRingFull(value >= FULL));
  const checked = status === "done" && ringFull;

  // This only dismisses genuine completion feedback; it never drives progress.
  useEffect(() => {
    if (!checked) return;
    const timer = setTimeout(onReset, resetAfter);
    return () => clearTimeout(timer);
  }, [checked, onReset, resetAfter]);

  const dashOffset = useTransform(shown, (value) => CIRCUMFERENCE * (1 - value));
  const arcOpacity = useTransform(shown, [0, 0.02], [0, 1]);
  const percent = useTransform(shown, (value) => Math.round(value * 100));
  const uploading = status === "uploading";
  const collapsed = uploading || status === "done" || compact === true;
  const indeterminate = uploading && progress === undefined;
  const ringVisible = uploading || (status === "done" && !checked);
  const canCancel = uploading && Boolean(onCancel);
  const name = uploading ? (canCancel ? "Cancel upload" : "Uploading sources")
    : status === "done" ? "Upload complete"
    : status === "error" ? "Retry source upload" : ariaLabel;

  return (
    <span data-upload-button data-state={status} className={cn("relative inline-flex shrink-0", className)}>
      <motion.button
        type="button"
        aria-label={name}
        aria-busy={uploading}
        disabled={disabled || status === "done" || (uploading && !canCancel)}
        onClick={uploading ? onCancel : onStart}
        initial={false}
        animate={{ width: collapsed ? SIZE : "auto" }}
        transition={reduceMotion ? { duration: 0 } : MORPH}
        className={cn(
          "group relative inline-flex h-10 touch-manipulation items-center justify-center overflow-hidden rounded-full border border-border bg-surface-raised text-sm font-medium text-foreground select-none",
          "transition-colors duration-200 hover:border-accent/50 hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default",
          disabled && "opacity-40",
          checked && "border-accent/40 bg-accent/15 text-accent",
          status === "error" && "border-accent/50 text-accent",
        )}
      >
        <span className="grid" aria-hidden="true">
          <Layer visible={!uploading && status !== "done"} className={cn("gap-2 whitespace-nowrap", compact === true ? "px-2" : compact === "responsive" ? "px-2 sm:px-3.5" : "px-3.5")}>
            {status === "error" ? <RotateCcw size={16} /> : <Upload size={16} strokeWidth={1.5} />}
            {compact !== true && <span className={cn(compact === "responsive" && "hidden sm:inline")}>{status === "error" ? "Retry" : label}</span>}
          </Layer>
          <Layer visible={ringVisible} className={cn("text-[11px] tabular-nums", canCancel && "group-hover:opacity-0 group-focus-visible:opacity-0")}>
            {indeterminate ? <Upload size={15} className="text-accent" /> : <motion.span>{percent}</motion.span>}
          </Layer>
          <Layer visible={false} className={cn(canCancel && "group-hover:translate-y-0 group-hover:opacity-100 group-hover:blur-none group-focus-visible:translate-y-0 group-focus-visible:opacity-100 group-focus-visible:blur-none")}>
            <X size={15} />
          </Layer>
          <Layer visible={checked}><Check size={17} strokeWidth={2} /></Layer>
        </span>
      </motion.button>
      <span role="progressbar" aria-label="Source upload progress" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={uploading && progress !== undefined ? Math.round(progress * 100) : undefined}
        aria-valuetext={indeterminate ? "Uploading sources" : undefined}
        aria-hidden={!uploading}
        className={cn("pointer-events-none absolute top-0 left-1/2 size-10 -translate-x-1/2 transition-opacity", ringVisible ? "opacity-100" : "opacity-0")}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} fill="none" strokeWidth={2}
          className={cn("size-full -rotate-90", indeterminate && "animate-spin motion-reduce:animate-none")}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} className="stroke-accent/10" />
          <motion.circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} className="stroke-accent" strokeLinecap="round"
            strokeDasharray={indeterminate ? `${CIRCUMFERENCE * 0.25} ${CIRCUMFERENCE * 0.75}` : CIRCUMFERENCE}
            style={indeterminate ? undefined : { strokeDashoffset: dashOffset, opacity: arcOpacity }} />
        </svg>
      </span>
      <span className="sr-only" aria-live="polite">
        {uploading ? "Uploading sources" : status === "done" ? "Upload complete" : status === "error" ? "Upload failed. Retry available." : ""}
      </span>
    </span>
  );
}

function Layer({ visible, className, children }: { visible: boolean; className?: string; children: React.ReactNode }) {
  return <span className={cn(
    "col-start-1 row-start-1 flex items-center justify-center transition-[opacity,filter,translate] duration-150 ease-out motion-reduce:transition-opacity",
    visible ? "translate-y-0 opacity-100 blur-none" : "translate-y-0.5 opacity-0 blur-[4px] motion-reduce:translate-y-0 motion-reduce:blur-none",
    className,
  )}>{children}</span>;
}

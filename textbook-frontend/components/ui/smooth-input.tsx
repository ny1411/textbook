"use client";

// Adapted from Skiper UI / gxuri: https://skiper-ui.com/v1/skiper106.
// Retains its measured spring caret, extended for Textbook's multiline composer.
// Source attribution and adaptation notes: docs/ui-components.md.
import { motion, useMotionValue, useSpring } from "motion/react";
import { forwardRef, useEffect, useImperativeHandle, useRef, type ComponentPropsWithoutRef } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

type TextControl = HTMLInputElement | HTMLTextAreaElement;
const measuredProperties = [
  "boxSizing", "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight",
  "letterSpacing", "wordSpacing", "textTransform", "textIndent", "tabSize",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "fontFeatureSettings", "fontVariationSettings", "direction",
] as const;

function useSmoothCaret<T extends TextControl>(value: unknown, disabled?: boolean) {
  const inputRef = useRef<T>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLSpanElement>(null);
  const composing = useRef(false);
  const reducedMotion = useReducedMotion();
  const caretX = useMotionValue(0);
  const caretY = useMotionValue(0);
  const opacity = useMotionValue(0);
  const height = useMotionValue(18);
  const springX = useSpring(caretX, { stiffness: 500, damping: 30, mass: 0.5 });
  const springY = useSpring(caretY, { stiffness: 500, damping: 30, mass: 0.5 });

  useEffect(() => {
    const input = inputRef.current;
    const mirror = mirrorRef.current;
    const marker = markerRef.current;
    if (!input || !mirror || !marker) return;

    let frame = 0;
    const update = () => {
      if (document.activeElement !== input || input.disabled || composing.current ||
          input.selectionStart === null || input.selectionStart !== input.selectionEnd || reducedMotion) {
        opacity.set(0);
        return;
      }
      const styles = getComputedStyle(input);
      const nativeCaret = styles.direction === "rtl" || /[\u0590-\u08ff\ufb1d-\ufefc]/u.test(input.value);
      input.dataset.nativeCaret = String(nativeCaret);
      if (nativeCaret) { opacity.set(0); return; }
      const multiline = input instanceof HTMLTextAreaElement;
      for (const property of measuredProperties) mirror.style[property] = styles[property];
      mirror.style.width = `${input.clientWidth}px`;
      mirror.style.borderWidth = "0";
      mirror.style.whiteSpace = multiline ? "pre-wrap" : "pre";
      mirror.style.overflowWrap = multiline ? "break-word" : "normal";
      mirror.style.wordBreak = styles.wordBreak;

      const index = input.selectionStart;
      const password = input instanceof HTMLInputElement && input.type === "password";
      const text = password ? "•".repeat(input.value.length) : input.value;
      mirror.replaceChildren(document.createTextNode(text.slice(0, index)), marker);
      marker.textContent = text.slice(index) || "\u200b";

      const fontSize = parseFloat(styles.fontSize);
      const lineHeight = parseFloat(styles.lineHeight) || fontSize * 1.5;
      const x = marker.offsetLeft - input.scrollLeft + (parseFloat(styles.borderLeftWidth) || 0);
      const y = marker.offsetTop - input.scrollTop + (parseFloat(styles.borderTopWidth) || 0) + Math.max(0, (lineHeight - fontSize) / 2);
      const paddingRight = parseFloat(styles.paddingRight) || 0;
      const isVisible = x >= 0 && x <= input.clientWidth - paddingRight + 1 &&
        y >= 0 && y + fontSize <= input.clientHeight + 2;
      caretX.set(x);
      caretY.set(y);
      height.set(fontSize);
      opacity.set(isVisible ? 1 : 0);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const startComposition = () => { composing.current = true; input.dataset.composing = "true"; opacity.set(0); };
    const endComposition = () => { composing.current = false; delete input.dataset.composing; schedule(); };
    const hide = () => opacity.set(0);
    const events = ["input", "focus", "click", "keyup", "select", "scroll"] as const;
    events.forEach((event) => input.addEventListener(event, schedule));
    input.addEventListener("blur", hide);
    input.addEventListener("compositionstart", startComposition);
    input.addEventListener("compositionend", endComposition);
    document.addEventListener("selectionchange", schedule);
    document.fonts.addEventListener("loadingdone", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(input);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      events.forEach((event) => input.removeEventListener(event, schedule));
      input.removeEventListener("blur", hide);
      input.removeEventListener("compositionstart", startComposition);
      input.removeEventListener("compositionend", endComposition);
      document.removeEventListener("selectionchange", schedule);
      document.fonts.removeEventListener("loadingdone", schedule);
    };
  }, [caretX, caretY, height, opacity, reducedMotion, value, disabled]);

  return { inputRef, mirrorRef, markerRef, reducedMotion, springX, springY, opacity, height };
}

type CaretState = Omit<ReturnType<typeof useSmoothCaret>, "inputRef" | "reducedMotion">;
function Caret({ mirrorRef, markerRef, springX, springY, opacity, height }: CaretState) {
  return <>
    <div ref={mirrorRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 -z-10 h-0 overflow-hidden">
      <span ref={markerRef} />
    </div>
    <motion.span aria-hidden="true" data-smooth-caret
      className="pointer-events-none absolute left-0 top-0 w-[1.5px] rounded-full bg-accent"
      style={{ x: springX, y: springY, opacity, height }} />
  </>;
}

type SmoothTextareaProps = ComponentPropsWithoutRef<"textarea"> & { wrapperClassName?: string };
export const SmoothTextarea = forwardRef<HTMLTextAreaElement, SmoothTextareaProps>(function SmoothTextarea(
  { className, wrapperClassName, style, ...props }, forwardedRef,
) {
  const { inputRef, reducedMotion, ...caret } = useSmoothCaret<HTMLTextAreaElement>(props.value, props.disabled);
  useImperativeHandle(forwardedRef, () => inputRef.current!);
  return <div data-smooth-input className={cn("relative min-w-0", wrapperClassName)}>
    <textarea {...props} ref={inputRef} className={cn("block", className)}
      style={{ ...style, caretColor: reducedMotion ? "var(--accent)" : "transparent" }} />
    <Caret {...caret} />
  </div>;
});

type SmoothInputProps = ComponentPropsWithoutRef<"input"> & { wrapperClassName?: string };
export const SmoothInput = forwardRef<HTMLInputElement, SmoothInputProps>(function SmoothInput(
  { className, wrapperClassName, style, ...props }, forwardedRef,
) {
  const { inputRef, reducedMotion, ...caret } = useSmoothCaret<HTMLInputElement>(props.value, props.disabled);
  useImperativeHandle(forwardedRef, () => inputRef.current!);
  return <div data-smooth-input className={cn("relative min-w-0", wrapperClassName)}>
    <input {...props} ref={inputRef} className={cn("block", className)}
      style={{ ...style, caretColor: reducedMotion ? "var(--accent)" : "transparent" }} />
    <Caret {...caret} />
  </div>;
});

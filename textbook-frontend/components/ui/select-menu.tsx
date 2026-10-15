"use client";

// Adapted from Yash Bavadiya's ui lab Select menu (MIT).
// https://lab.xevrion.dev/lab/select-menu
// See THIRD_PARTY_NOTICES.md for the upstream source and license.
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string; detail?: string; disabled?: boolean };

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const ENTER = { duration: 0.15, ease: EASE_OUT };
// Leaves faster than it arrives, so choosing never waits on the list.
const EXIT = { duration: 0.1, ease: EASE_OUT };
const ICON_SWAP = { type: "spring", duration: 0.3, bounce: 0 } as const;

// Geometry shared by the markup and the placement math below.
const ITEM = 36;
const PAD = 4;
const MAX_ROWS = 8;
// Check column (16) + gap (8) + item padding (8) - trigger padding (12)
// + panel padding (4): shifting the panel left by this lands every
// option's text exactly on the trigger's text.
const TEXT_SHIFT = 24;
// Keeps the panel this far inside the viewport.
const MARGIN = 8;
// Letters typed within this window extend the search instead of restarting.
const TYPEAHEAD_RESET = 500;
// Scroll-button speed while hovered, in px per second.
const SCROLL_SPEED = 280;

type Placement = {
  top: number;
  left: number;
  width: number;
  scroll: number;
  originX: number;
  originY: number;
  maxHeight: number;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi);

// Puts the selected option exactly over the trigger, the way macOS does,
// then trades list position for scroll position if that runs off screen.
function place(trigger: HTMLElement, count: number, selected: number, compact = false): Placement {
  const box = trigger.getBoundingClientRect();
  // The app portals the panel out of scroll containers. Work in viewport
  // pixels while retaining the lab's selected-item-over-trigger alignment.
  const rows = Math.min(count, MAX_ROWS, Math.max(1, Math.floor((window.innerHeight - MARGIN * 2 - PAD * 2) / ITEM)));
  const height = rows * ITEM + PAD * 2;
  const maxScroll = (count - rows) * ITEM;

  let scroll = clamp((selected - Math.floor(rows / 2)) * ITEM, 0, maxScroll);
  let top = (box.height - ITEM) / 2 - (PAD + selected * ITEM - scroll);

  const minTop = MARGIN - box.top;
  const maxBottom = window.innerHeight - MARGIN - box.top;
  if (top < minTop) {
    const d = minTop - top;
    top += d;
    scroll += Math.min(d, maxScroll - scroll);
  }
  if (top + height > maxBottom) {
    const d = top + height - maxBottom;
    top -= d;
    scroll -= Math.min(d, scroll);
  }

  // Compact triggers still open a readable menu with room for full option labels.
  const textShift = compact ? TEXT_SHIFT + 6 : TEXT_SHIFT;
  const width = Math.min(Math.max(box.width + textShift, compact ? 140 : 0), window.innerWidth - MARGIN * 2);
  const minLeft = MARGIN - box.left;
  const maxRight = window.innerWidth - MARGIN - box.left;
  const left = Math.max(minLeft, Math.min(-textShift, maxRight - width));

  return {
    top: box.top + top,
    left: box.left + left,
    width,
    scroll,
    // Grows out of the trigger itself, wherever it ended up in the panel.
    originX: box.width / 2 - left,
    originY: box.height / 2 - top,
    maxHeight: height,
  };
}

export function SelectMenu({
  label,
  options,
  value,
  onChange,
  className,
  disabled = false,
  size = "default",
}: {
  label: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  size?: "default" | "compact";
}) {
  const reduceMotion = useReducedMotion();
  const id = useId();
  const labelId = `${id}-label`;
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-option-${i}`;

  const [placement, setPlacement] = useState<Placement | null>(null);
  const [active, setActive] = useState(0);
  const unavailable = disabled || !options.some((option) => !option.disabled);
  const open = placement !== null && !unavailable;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ query: "", timer: 0 });
  const lastPointer = useRef({ x: -1, y: -1 });

  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  useEffect(() => {
    const state = typeahead.current;
    return () => clearTimeout(state.timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && (triggerRef.current?.contains(target) || scrollerRef.current?.parentElement?.contains(target))) return;
      setPlacement(null);
    };
    const resize = () => setPlacement(null);
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", resize);
    };
  }, [open]);

  const openList = () => {
    if (!triggerRef.current || unavailable) return;
    setActive(options[selected]?.disabled ? options.findIndex((option) => !option.disabled) : selected);
    setPlacement(place(triggerRef.current, options.length, selected, size === "compact"));
  };

  const close = () => setPlacement(null);

  const choose = (index: number) => {
    if (unavailable || !options[index] || options[index].disabled) return;
    onChange(options[index].value);
    close();
  };

  // Keyboard moves keep the highlight in view; pointer moves never scroll.
  const highlight = (index: number) => {
    let next = clamp(index, 0, options.length - 1);
    const direction = index < active ? -1 : 1;
    while (options[next]?.disabled) {
      next += direction;
      if (next < 0 || next >= options.length) return;
    }
    setActive(next);
    const el = scrollerRef.current;
    if (!el) return;
    const top = PAD + next * ITEM;
    if (top < el.scrollTop + PAD) el.scrollTop = top - PAD;
    else if (top + ITEM > el.scrollTop + el.clientHeight - PAD)
      el.scrollTop = top + ITEM - el.clientHeight + PAD;
  };

  const search = (char: string) => {
    const state = typeahead.current;
    clearTimeout(state.timer);
    state.query += char.toLowerCase();
    state.timer = window.setTimeout(() => {
      state.query = "";
    }, TYPEAHEAD_RESET);

    // Pressing the same letter again cycles through its matches.
    const repeated = [...state.query].every((c) => c === state.query[0]);
    const query = repeated ? state.query[0] : state.query;
    const from = open ? active : selected;
    const start = repeated ? from + 1 : from;
    for (let n = 0; n < options.length; n++) {
      const index = (start + n) % options.length;
      if (!options[index].disabled && options[index].label.toLowerCase().startsWith(query)) {
        // Closed, it changes the value directly, like a native select.
        if (open) highlight(index);
        else onChange(options[index].value);
        return;
      }
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (unavailable) return;
    const typing = typeahead.current.query !== "";
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key) && !(e.key === " " && typing)) {
        e.preventDefault();
        openList();
        return;
      }
    } else {
      const page = MAX_ROWS - 1;
      const moves: Record<string, number> = {
        ArrowDown: active + 1,
        ArrowUp: active - 1,
        PageDown: active + page,
        PageUp: active - page,
        Home: 0,
        End: options.length - 1,
      };
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === "ArrowUp" && e.altKey) {
        e.preventDefault();
        choose(active);
        return;
      }
      if (e.key in moves) {
        e.preventDefault();
        highlight(moves[e.key]);
        return;
      }
      if (e.key === "Enter" || (e.key === " " && !typing)) {
        e.preventDefault();
        choose(active);
        return;
      }
      // Tab commits the highlighted option and moves on, per the APG pattern.
      if (e.key === "Tab") {
        choose(active);
        return;
      }
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      search(e.key);
    }
  };

  return (
    <div className={cn("relative w-[min(260px,100%)]", className)}>
      <span id={labelId} className="sr-only">
        {label}
      </span>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        disabled={unavailable}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        onBlur={close}
        className={cn(
          "flex h-10 w-full touch-manipulation items-center rounded-lg border border-border bg-surface text-left text-foreground outline-hidden transition-[background-color,scale] duration-150 ease-out select-none hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
          size === "compact" ? "gap-1 px-1.5 text-[11px]" : "gap-2 pr-2.5 pl-3 text-xs",
        )}
      >
        <span id={`${id}-value`} className="flex-1 truncate">
          {options[selected]?.label}
        </span>
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className={cn("shrink-0 text-muted", size === "compact" ? "size-3.5" : "size-4")}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m5 6.25 3-3 3 3M5 9.75l3 3 3-3" />
        </svg>
      </button>

      {typeof document !== "undefined" && createPortal(<AnimatePresence>
        {open && placement && (
          <Panel
            key="panel"
            placement={placement}
            reduceMotion={!!reduceMotion}
            scrollerRef={scrollerRef}
          >
            <div role="listbox" id={listId} aria-labelledby={labelId}>
              {options.map((option, i) => {
                const isSelected = i === selected;
                return (
                  <div
                    key={option.value}
                    id={optionId(i)}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    onPointerMove={(e) => {
                      if (e.pointerType === "touch" || option.disabled) return;
                      // Scrolling under a still cursor can fire synthetic
                      // moves; only real movement takes the highlight.
                      const last = lastPointer.current;
                      if (last.x === e.clientX && last.y === e.clientY) return;
                      lastPointer.current = { x: e.clientX, y: e.clientY };
                      if (active !== i) setActive(i);
                    }}
                    onClick={() => choose(i)}
                    // No transition on the highlight: it follows every move,
                    // so easing would read as lag.
                    className={cn(
                      "flex h-9 cursor-default items-center gap-2 rounded-lg px-2 text-xs text-foreground select-none",
                      active === i && !option.disabled && "bg-accent/10",
                      option.disabled && "opacity-40",
                    )}
                  >
                    <Check visible={isSelected} reduceMotion={!!reduceMotion} />
                    <span className="flex-1 truncate">{option.label}</span>
                    {option.detail && (
                      <span className="max-w-[40%] truncate text-[10px] text-muted tabular-nums">
                        {option.detail}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>
        )}
      </AnimatePresence>, document.body)}
    </div>
  );
}

function Panel({
  placement,
  reduceMotion,
  scrollerRef,
  children,
}: {
  placement: Placement;
  reduceMotion: boolean;
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  // A closing list stops taking input at once, so it never eats the next click.
  const isPresent = useIsPresent();
  const panelRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // Edge fades and scroll buttons follow the scroll position through the
  // DOM directly, so scrolling never re-renders the list.
  const updateEdges = (el: HTMLDivElement) => {
    const up = el.scrollTop > 1;
    const down = el.scrollTop < el.scrollHeight - el.clientHeight - 1;
    // 24px is about two thirds of a row: enough to say "more this way"
    // without hiding the option underneath.
    el.style.maskImage = `linear-gradient(to bottom, transparent, black ${up ? 24 : 0}px, black calc(100% - ${down ? 24 : 0}px), transparent)`;
    const panel = panelRef.current;
    if (!panel) return;
    panel.toggleAttribute("data-up", up);
    panel.toggleAttribute("data-down", down);
  };

  const startScroll = (direction: 1 | -1, e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    cancelAnimationFrame(frame.current);
    let last = performance.now();
    const tick = (now: number) => {
      const el = scrollerRef.current;
      if (!el) return;
      el.scrollTop += (direction * SCROLL_SPEED * (now - last)) / 1000;
      last = now;
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  };

  const stopScroll = () => cancelAnimationFrame(frame.current);

  const hidden = reduceMotion
    ? { opacity: 0, transform: "scale(1)" }
    : { opacity: 0, transform: "scale(0.96)" };

  return (
    <motion.div
      ref={panelRef}
      initial={hidden}
      animate={{ opacity: 1, transform: "scale(1)" }}
      exit={{ ...hidden, transition: EXIT }}
      transition={ENTER}
      // Keeps focus on the trigger, which owns the keyboard.
      onMouseDown={(e) => e.preventDefault()}
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch") panelRef.current?.setAttribute("data-hover", "");
      }}
      onPointerLeave={() => {
        panelRef.current?.removeAttribute("data-hover");
        stopScroll();
      }}
      style={{
        top: placement.top,
        left: placement.left,
        width: placement.width,
        transformOrigin: `${placement.originX}px ${placement.originY}px`,
        pointerEvents: isPresent ? "auto" : "none",
      }}
      // 12px radius around 4px padding keeps the 8px options concentric.
      className={cn(
        "group fixed z-50 overflow-hidden rounded-xl border border-border bg-surface-raised shadow-xl",
        !isPresent && "pointer-events-none",
      )}
    >
      <div
        ref={(el) => {
          scrollerRef.current = el;
          if (!el || el.dataset.placed) return;
          el.dataset.placed = "true";
          el.scrollTop = placement.scroll;
          updateEdges(el);
        }}
        onScroll={(e) => updateEdges(e.currentTarget)}
        data-lenis-prevent
        className="overscroll-contain overflow-y-auto p-1"
        style={{ maxHeight: placement.maxHeight }}
      >
        {children}
      </div>
      <ScrollButton direction={-1} onEnter={startScroll} onLeave={stopScroll} />
      <ScrollButton direction={1} onEnter={startScroll} onLeave={stopScroll} />
    </motion.div>
  );
}

function ScrollButton({
  direction,
  onEnter,
  onLeave,
}: {
  direction: 1 | -1;
  onEnter: (direction: 1 | -1, e: React.PointerEvent) => void;
  onLeave: () => void;
}) {
  const up = direction === -1;
  return (
    <div
      aria-hidden
      onPointerEnter={(e) => onEnter(direction, e)}
      onPointerLeave={onLeave}
      // Only while hovering a list that can scroll that way; keyboard users
      // scroll with the highlight instead.
      className={cn(
        "pointer-events-none absolute inset-x-0 flex h-6 items-center justify-center text-muted opacity-0 transition-[opacity] duration-150 ease-out",
        up
          ? "top-0 group-data-[hover]:group-data-[up]:pointer-events-auto group-data-[hover]:group-data-[up]:opacity-100"
          : "bottom-0 group-data-[hover]:group-data-[down]:pointer-events-auto group-data-[hover]:group-data-[down]:opacity-100",
      )}
    >
      <svg
        viewBox="0 0 16 16"
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={up ? "m4.5 9.5 3.5-3.5 3.5 3.5" : "m4.5 6.5 3.5 3.5 3.5-3.5"} />
      </svg>
    </div>
  );
}

function Check({
  visible,
  reduceMotion,
}: {
  visible: boolean;
  reduceMotion: boolean;
}) {
  const hidden = reduceMotion
    ? { scale: 1, opacity: 0, filter: "blur(0px)" }
    : { scale: 0.25, opacity: 0, filter: "blur(4px)" };
  return (
    <motion.svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={false}
      animate={visible ? { scale: 1, opacity: 1, filter: "blur(0px)" } : hidden}
      transition={ICON_SWAP}
    >
      <path d="m3.5 8.5 3 3 6-7" />
    </motion.svg>
  );
}

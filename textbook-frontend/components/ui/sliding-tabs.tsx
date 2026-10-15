"use client";

// Adapted from Yash Bavadiya's UI Lab Sliding Tabs (MIT).
// https://lab.xevrion.dev/lab/sliding-tabs
// See /THIRD_PARTY_NOTICES.md and /docs/licenses/xevrion-ui-lab.txt.
// Sidebar adaptation: persistent panels, full-height layout, and Textbook tokens.

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  LayoutGroup,
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

type Tab<T extends string> = { id: T; label: string; content: React.ReactNode };
type Hover = {
  tab: string | null;
  visible: boolean;
  // Every time the pointer comes back into the list the pill gets a fresh
  // layoutId, so it fades in where you are instead of sliding over from
  // wherever it was when you left.
  session: number;
  entering: boolean;
};

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// The underline travels like a stretched band: the edge facing the new tab
// leaves first and fast, the far edge lets go later and catches up, so the
// line reaches toward the tab, then pulls its tail in. No bounce, it answers
// "where am I". The tail settles by ~340ms, over the usual 300ms, because
// the stretch is the part that reads; the lead lands inside 200ms.
const LEAD = { type: "spring", visualDuration: 0.2, bounce: 0 } as const;
const TAIL = { type: "spring", visualDuration: 0.34, bounce: 0 } as const;
// The hover pill only echoes the pointer, so it is quicker still.
const HOVER = { type: "spring", visualDuration: 0.15, bounce: 0 } as const;
const INSTANT = { duration: 0 } as const;

/*
 * The lab's segmented control clips an inverted copy of the whole row, so
 * each label recolors exactly as the pill's edge crosses it. An underline is
 * too thin to cover any text, so there is nothing to recolor here. Instead
 * its two ends move separately, which a shared layoutId can't do: the line
 * stretches toward the new tab and then gathers itself under it.
 */
export function SlidingTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className,
}: {
  tabs: readonly Tab<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  const reduce = useReducedMotion() ?? false;
  const base = useId();
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const [hover, setHover] = useState<Hover>({
    tab: null,
    visible: false,
    session: 0,
    entering: false,
  });

  const index = Math.max(
    tabs.findIndex((t) => t.id === value),
    0,
  );
  const active = tabs[index];

  // The underline's two edges, in px from the list's left, moved on their
  // own springs. It is one full-width line clipped down to the tab, so the
  // stretch costs no layout.
  const listRef = useRef<HTMLDivElement>(null);
  const edgeL = useMotionValue(0);
  const edgeR = useMotionValue(0);
  const runs = useRef<AnimationPlaybackControls[]>([]);
  const activeId = useRef(active.id);
  const clip = useMotionTemplate`inset(0 calc(100% - ${edgeR}px) 0 ${edgeL}px round 1px)`;

  const measure = (id: string) => {
    const el = tabRefs.current.get(id);
    return el ? [el.offsetLeft, el.offsetLeft + el.offsetWidth] : null;
  };

  useLayoutEffect(() => {
    const target = measure(active.id);
    const list = listRef.current;
    if (!target || !list) return;
    const [l, r] = target;
    const first = list.dataset.ready !== "true";
    activeId.current = active.id;
    runs.current.forEach((run) => run.stop());
    if (first || reduce) {
      edgeL.jump(l);
      edgeR.jump(r);
      // Hands over from the server-rendered underline to the clipped one.
      list.dataset.ready = "true";
      return;
    }
    const rightward = r > edgeR.get();
    runs.current = [
      animate(edgeL, l, rightward ? TAIL : LEAD),
      animate(edgeR, r, rightward ? LEAD : TAIL),
    ];
  }, [active.id, reduce, edgeL, edgeR]);

  // Tabs change width with the viewport (padding and text size step at sm),
  // so the underline re-fits without animating.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => {
      const target = measure(activeId.current);
      if (!target) return;
      runs.current.forEach((run) => run.stop());
      edgeL.jump(target[0]);
      edgeR.jump(target[1]);
    });
    observer.observe(list);
    return () => {
      observer.disconnect();
      runs.current.forEach((run) => run.stop());
    };
  }, [edgeL, edgeR]);

  const select = (next: T) => {
    const nextIndex = tabs.findIndex((t) => t.id === next);
    if (nextIndex === index) return;
    onChange(next);
  };

  const enter = (id: string) =>
    setHover((h) =>
      h.visible
        ? h.tab === id
          ? h
          : { ...h, tab: id, entering: false }
        : { tab: id, visible: true, session: h.session + 1, entering: true },
    );

  const tabId = (id: string) => `${base}-tab-${id}`;
  const panelId = (id: string) => `${base}-panel-${id}`;

  return (
    <LayoutGroup id={base}>
      <div className={cn("flex h-full min-h-0 flex-col", className)}>
        <div
          role="tablist"
          aria-label={label}
          ref={listRef}
          className="group/tabs relative mx-3 mt-3 flex shrink-0 gap-0.5 border-b border-border px-0.5"
          onPointerLeave={() =>
            setHover((h) => (h.visible ? { ...h, visible: false } : h))
          }
          onKeyDown={(e) => {
            const target = {
              ArrowRight: index + 1,
              ArrowLeft: index - 1,
              Home: 0,
              End: tabs.length - 1,
            }[e.key];
            if (target === undefined) return;
            e.preventDefault();
            // Automatic activation: arrows select as well as focus, and the
            // underline slides exactly as it does for a click.
            const next = tabs[(target + tabs.length) % tabs.length].id;
            select(next);
            tabRefs.current.get(next)?.focus();
          }}
        >
          {tabs.map((tab) => {
            const selected = tab.id === active.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(tab.id, el);
                  else tabRefs.current.delete(tab.id);
                }}
                type="button"
                role="tab"
                id={tabId(tab.id)}
                aria-selected={selected}
                aria-controls={panelId(tab.id)}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(tab.id)}
                onPointerEnter={(e) => {
                  if (e.pointerType !== "touch") enter(tab.id);
                }}
                className={cn(
                  "group relative flex h-11 min-w-0 flex-1 touch-manipulation items-center justify-center rounded-lg px-2.5 text-sm font-medium sm:px-4 sm:text-[15px] text-muted outline-hidden transition-[color] duration-150 ease-out select-none motion-reduce:transition-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-4 focus-visible:outline-foreground",
                  selected && "text-foreground",
                )}
              >
                {hover.tab === tab.id && (
                  <motion.span
                    key={hover.session}
                    layoutId={`hover-${hover.session}`}
                    aria-hidden
                    // 6px in from top and bottom so the pill floats inside the
                    // 44px tab without touching the underline.
                    className="absolute inset-x-0 inset-y-1.5 rounded-md bg-surface-raised"
                    initial={hover.entering ? { opacity: 0 } : false}
                    animate={{ opacity: hover.visible ? 1 : 0 }}
                    transition={{
                      layout: reduce ? INSTANT : HOVER,
                      opacity: {
                        duration: reduce ? 0 : hover.visible ? 0.15 : 0.1,
                        ease: EASE_OUT,
                      },
                    }}
                  />
                )}
                {/* Only the label presses in. Scaling the whole button would
                    skew the box Motion measures for the underline mid-press. */}
                <span className="relative z-10 transition-[scale] duration-150 ease-out group-active:scale-[0.96] motion-reduce:transition-none">
                  {tab.label}
                </span>
                {selected && (
                  // What the server renders, so the line is there before
                  // hydration; the clipped underline takes over once measured.
                  <span
                    aria-hidden
                    className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground group-data-[ready=true]/tabs:hidden"
                  />
                )}
              </button>
            );
          })}
          <motion.span
            aria-hidden
            style={{ clipPath: clip }}
            // Overlaps the list's 1px border so the two read as one line.
            className="pointer-events-none absolute inset-x-0 -bottom-px hidden h-0.5 bg-foreground group-data-[ready=true]/tabs:block"
          />
        </div>

        {/* Keep both panels mounted to retain scroll, selection, and source state. */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {tabs.map((tab, panelIndex) => {
            const selected = tab.id === active.id;
            return <motion.div key={tab.id}
              role="tabpanel" id={panelId(tab.id)} aria-labelledby={tabId(tab.id)}
              aria-hidden={!selected} inert={!selected} tabIndex={selected ? 0 : -1}
              initial={false}
              animate={{
                opacity: selected ? 1 : 0,
                x: reduce || selected ? 0 : panelIndex < index ? -8 : 8,
                filter: reduce || selected ? "blur(0px)" : "blur(4px)",
              }}
              transition={{ duration: reduce ? 0 : selected ? 0.25 : 0.15, ease: EASE_OUT }}
              style={{ pointerEvents: selected ? "auto" : "none" }}
              className="absolute inset-0 flex min-h-0 flex-col outline-hidden focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground">
              {tab.content}
            </motion.div>;
          })}
        </div>
      </div>
    </LayoutGroup>
  );
}

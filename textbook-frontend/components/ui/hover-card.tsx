"use client";

// Adapted from Xevrion UI Lab's Hover card (Yash Bavadiya, MIT).
// https://lab.xevrion.dev/r/hover-card.json
// Original traveling-card motion and timing are preserved; citation content,
// portal placement, and keyboard/pinned interactions are Textbook adaptations.
// See THIRD_PARTY_NOTICES.md for the full license.

import {
    createContext, useContext, useEffect, useId, useLayoutEffect,
    useRef, useState, type KeyboardEvent, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import styles from "./hover-card.module.css";

const OPEN_DELAY = 500;
const CLOSE_GRACE = 150;
const SKIP_DELAY_FOR = 300;
const CARD_WIDTH = 336;
const CARD_HEIGHT = 248;
const GAP = 8;
const EDGE = 12;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const TRAVEL = { duration: 260, easing: "cubic-bezier(0.32, 0.72, 0, 1)" };
const DEVELOP = { duration: 220, easing: "cubic-bezier(0.23, 1, 0.32, 1)" };

type Place = {
    side: "top" | "bottom";
    left: number;
    top?: number;
    bottom?: number;
    originX: number;
    availableHeight: number;
};
type Custom = { instant: boolean; reduce: boolean };
const CARD = {
    hidden: ({ instant, reduce }: Custom) => ({ opacity: instant ? 1 : 0, scale: instant || reduce ? 1 : 0.96 }),
    shown: ({ instant }: Custom) => ({
        opacity: 1, scale: 1,
        transition: instant ? { duration: 0 } : { duration: 0.15, ease: EASE_OUT },
    }),
    exit: ({ instant, reduce }: Custom) => ({
        opacity: 0, scale: reduce ? 1 : 0.96,
        transition: { duration: instant ? 0 : 0.1, ease: EASE_OUT },
    }),
};

type OpenState = { id: string; place: Place; instant: boolean; pinned: boolean; from?: DOMRect } | null;
type Group = {
    open: OpenState;
    setCard: (element: HTMLElement) => void;
    requestOpen: (id: string, measure: () => Place | null, immediate?: boolean, pinned?: boolean) => void;
    requestClose: (id: string, force?: boolean) => void;
    closeNow: () => void;
};
const GroupContext = createContext<Group | null>(null);

function measurePlace(element: HTMLElement): Place {
    const rect = element.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    const side = below >= CARD_HEIGHT + GAP + EDGE || below >= rect.top ? "bottom" : "top";
    const width = Math.min(CARD_WIDTH, window.innerWidth - EDGE * 2);
    const centred = rect.left + rect.width / 2 - width / 2;
    const left = Math.min(Math.max(centred, EDGE), window.innerWidth - EDGE - width);
    return {
        side, left,
        ...(side === "bottom" ? { top: rect.bottom + GAP } : { bottom: window.innerHeight - rect.top + GAP }),
        originX: rect.left + rect.width / 2 - left,
        availableHeight: Math.max(0, (side === "bottom" ? below : rect.top) - GAP - EDGE),
    };
}

/** Shares one preview between citations and preserves Xevrion's traveling transition. */
export function HoverCardGroup({ children }: { children: ReactNode }) {
    const [open, setOpen] = useState<OpenState>(null);
    const openRef = useRef<OpenState>(null);
    const openTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const closedAt = useRef(-Infinity);
    const card = useRef<HTMLElement | null>(null);
    const lastRect = useRef<DOMRect | null>(null);

    useEffect(() => () => {
        clearTimeout(openTimer.current);
        clearTimeout(closeTimer.current);
    }, []);

    const cardRect = () => card.current?.isConnected ? card.current.getBoundingClientRect() : undefined;
    const commit = (next: OpenState) => {
        if (openRef.current && !next) {
            closedAt.current = performance.now();
            lastRect.current = cardRect() ?? null;
        }
        openRef.current = next;
        setOpen(next);
    };

    const group: Group = {
        open,
        setCard: (element) => { card.current = element; },
        requestOpen: (id, measure, immediate, pinned = false) => {
            clearTimeout(closeTimer.current);
            const current = openRef.current;
            if (current?.id === id) {
                if (pinned && !current.pinned) commit({ ...current, pinned: true });
                return;
            }
            clearTimeout(openTimer.current);
            const recent = performance.now() - closedAt.current < SKIP_DELAY_FOR;
            const show = (instant: boolean, from?: DOMRect) => {
                const place = measure();
                if (place) commit({ id, place, instant, pinned, from });
            };
            if (current) show(true, cardRect());
            else if (recent && lastRect.current) show(true, lastRect.current);
            else if (immediate || recent) show(false);
            else openTimer.current = setTimeout(() => show(false), OPEN_DELAY);
        },
        requestClose: (id, force = false) => {
            clearTimeout(openTimer.current);
            if (openRef.current?.id !== id || (openRef.current.pinned && !force)) return;
            clearTimeout(closeTimer.current);
            closeTimer.current = setTimeout(() => commit(null), CLOSE_GRACE);
        },
        closeNow: () => {
            clearTimeout(openTimer.current);
            clearTimeout(closeTimer.current);
            if (openRef.current) commit(null);
        },
    };

    return <GroupContext value={group}>{children}</GroupContext>;
}

interface HoverCardProps {
    trigger: ReactNode;
    triggerLabel: string;
    label: string;
    children: ReactNode | ((close: () => void) => ReactNode);
}

export function HoverCard(props: HoverCardProps) {
    const group = useContext(GroupContext);
    return group ? <HoverCardItem {...props} /> : <HoverCardGroup><HoverCardItem {...props} /></HoverCardGroup>;
}

function HoverCardItem({ trigger, triggerLabel, label, children }: HoverCardProps) {
    const group = useContext(GroupContext)!;
    const reduceMotion = useReducedMotion();
    const id = useId();
    const cardId = `${id}-preview`;
    const rootRef = useRef<HTMLSpanElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const cardRef = useRef<HTMLSpanElement>(null);
    const contentRef = useRef<HTMLSpanElement>(null);
    const pendingFocus = useRef(false);
    const state = group.open?.id === id ? group.open : null;
    const isOpen = state !== null;
    const from = state?.from;
    const measure = () => buttonRef.current ? measurePlace(buttonRef.current) : null;
    const contains = (node: Node | null) => !!node && (rootRef.current?.contains(node) || cardRef.current?.contains(node));
    const focusContent = () => {
        const first = cardRef.current?.querySelector<HTMLElement>("button, a[href], [tabindex='0']");
        (first ?? cardRef.current)?.focus({ preventScroll: true });
    };

    useLayoutEffect(() => {
        if (isOpen && pendingFocus.current) {
            pendingFocus.current = false;
            const first = cardRef.current?.querySelector<HTMLElement>("button, a[href], [tabindex='0']");
            (first ?? cardRef.current)?.focus({ preventScroll: true });
        }
    }, [isOpen]);

    useLayoutEffect(() => {
        const element = cardRef.current;
        if (!from || !element) return;
        const to = element.getBoundingClientRect();
        const dx = from.left - to.left;
        const dy = from.top - to.top;
        const animations: Animation[] = [];
        if (!reduceMotion && (dx || dy)) {
            animations.push(element.animate({ translate: [`${dx}px ${dy}px`, "0 0"] }, TRAVEL));
        }
        if (contentRef.current) {
            animations.push(contentRef.current.animate(
                reduceMotion ? { opacity: [0, 1] } : { opacity: [0, 1], filter: ["blur(4px)", "blur(0px)"] },
                DEVELOP,
            ));
        }
        return () => animations.forEach((animation) => animation.cancel());
    }, [from, reduceMotion]);

    useEffect(() => {
        if (!isOpen) return;
        const onDown = (event: PointerEvent) => {
            const node = event.target as Node | null;
            if (!rootRef.current?.contains(node) && !cardRef.current?.contains(node)) group.closeNow();
        };
        const onScroll = (event: Event) => {
            if (!(event.target instanceof Node) || !cardRef.current?.contains(event.target)) group.closeNow();
        };
        const onResize = () => group.closeNow();
        document.addEventListener("pointerdown", onDown);
        document.addEventListener("scroll", onScroll, true);
        window.addEventListener("resize", onResize);
        return () => {
            document.removeEventListener("pointerdown", onDown);
            document.removeEventListener("scroll", onScroll, true);
            window.removeEventListener("resize", onResize);
        };
    }, [isOpen, group]);

    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape" && isOpen) {
            event.preventDefault();
            event.stopPropagation();
            // Focus while still open so the focus handler cannot reopen a dismissed preview.
            buttonRef.current?.focus({ preventScroll: true });
            group.closeNow();
        } else if (event.target === buttonRef.current && event.key === "ArrowDown") {
            event.preventDefault();
            if (isOpen) focusContent();
            else { pendingFocus.current = true; group.requestOpen(id, measure, true); }
        } else if (event.target === buttonRef.current && event.key === "Tab" && !event.shiftKey && isOpen) {
            event.preventDefault();
            focusContent();
        } else if (event.key === "Tab" && event.shiftKey && cardRef.current?.contains(event.target as Node)) {
            const first = cardRef.current.querySelector<HTMLElement>("button, a[href], [tabindex='0']");
            if (event.target === first || event.target === cardRef.current) {
                event.preventDefault();
                buttonRef.current?.focus({ preventScroll: true });
            }
        }
    };

    const custom: Custom = { instant: state?.instant ?? false, reduce: reduceMotion };
    return (
        <span
            ref={rootRef}
            className={styles.root}
            onPointerEnter={(event) => { if (event.pointerType !== "touch") group.requestOpen(id, measure); }}
            onPointerLeave={(event) => { if (event.pointerType !== "touch") group.requestClose(id); }}
            onFocus={(event) => {
                if (event.target === buttonRef.current && event.target.matches(":focus-visible")) group.requestOpen(id, measure, true);
            }}
            onBlur={(event) => { if (!contains(event.relatedTarget)) group.requestClose(id, true); }}
            onKeyDown={onKeyDown}
        >
            <button
                ref={buttonRef}
                type="button"
                className={styles.trigger}
                aria-label={triggerLabel}
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                aria-controls={isOpen ? cardId : undefined}
                onClick={() => {
                    if (state?.pinned) group.closeNow();
                    else group.requestOpen(id, measure, true, true);
                }}
            >
                {trigger}
            </button>
            {typeof document !== "undefined" && createPortal(
                <AnimatePresence initial={false} custom={{ instant: group.open !== null, reduce: reduceMotion }}>
                    {state && (
                        <motion.span
                            key="card"
                            ref={(element) => {
                                cardRef.current = element;
                                if (element) group.setCard(element);
                            }}
                            id={cardId}
                            role="dialog"
                            aria-label={label}
                            tabIndex={-1}
                            data-lenis-prevent
                            data-side={state.place.side}
                            data-pinned={state.pinned || undefined}
                            className={styles.card}
                            custom={custom}
                            variants={CARD}
                            initial="hidden"
                            animate="shown"
                            exit="exit"
                            style={{
                                left: state.place.left, top: state.place.top, bottom: state.place.bottom,
                                maxHeight: state.place.availableHeight,
                                transformOrigin: `${state.place.originX}px ${state.place.side === "bottom" ? "0%" : "100%"}`,
                            }}
                            onPointerEnter={() => group.requestOpen(id, measure, true)}
                            onPointerLeave={(event) => { if (event.pointerType !== "touch") group.requestClose(id); }}
                            onFocus={() => group.requestOpen(id, measure, true)}
                            onBlur={(event) => { if (!contains(event.relatedTarget)) group.requestClose(id, true); }}
                        >
                            <span ref={contentRef} className={styles.content}>
                                {typeof children === "function" ? children(group.closeNow) : children}
                            </span>
                        </motion.span>
                    )}
                </AnimatePresence>, document.body,
            )}
        </span>
    );
}

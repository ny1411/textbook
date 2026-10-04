"use client";

import dynamic from "next/dynamic";
import { LoaderCircle, Sparkles } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import styles from "./ChatLoadingIndicator.module.css";

const LiquidMetal = dynamic(
    () => import("@paper-design/shaders-react").then((module) => module.LiquidMetal),
    { ssr: false },
);

const contextOptions: WebGLContextAttributes = { powerPreference: "low-power" };

function subscribeToMotionPreference(onChange: () => void) {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    preference.addEventListener("change", onChange);
    return () => preference.removeEventListener("change", onChange);
}

function canAnimate() {
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function AgentThinkingBlob() {
    const animate = useSyncExternalStore(subscribeToMotionPreference, canAnimate, () => false);
    const [supportsWebGL, setSupportsWebGL] = useState(false);

    useEffect(() => {
        if (!animate) return;
        const frame = requestAnimationFrame(() => {
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("webgl2", contextOptions);
            setSupportsWebGL(Boolean(context));
            context?.getExtension("WEBGL_lose_context")?.loseContext();
        });
        return () => cancelAnimationFrame(frame);
    }, [animate]);

    return (
        <div aria-hidden="true" className={styles.blob} data-agent-thinking-blob>
            {animate && supportsWebGL ? (
                <LiquidMetal
                    shape="circle"
                    colorBack="rgba(0, 0, 0, 0)"
                    colorTint="#a5b4fc"
                    scale={0.85}
                    speed={0.35}
                    distortion={0.2}
                    contour={0.6}
                    repetition={2}
                    softness={0.35}
                    minPixelRatio={1}
                    maxPixelCount={4096}
                    webGlContextAttributes={contextOptions}
                    className={styles.metal}
                    style={{ width: "100%", height: "100%" }}
                />
            ) : <Sparkles size={16} />}
        </div>
    );
}

export function ChatLoadingIndicator({ isAgentMode }: { isAgentMode: boolean }) {
    return (
        <div role="status" className="flex gap-3 max-w-3xl mx-auto mb-6 items-center">
            {isAgentMode ? <AgentThinkingBlob /> : (
                <div aria-hidden="true" className="w-8 h-8 rounded-xl shrink-0 flex items-center justify-center bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    <Sparkles size={16} />
                </div>
            )}
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs shadow-sm">
                {!isAgentMode && <LoaderCircle aria-hidden="true" size={14} className="shrink-0 animate-spin motion-reduce:animate-none text-indigo-400" />}
                <span>{isAgentMode
                    ? "Reflecting, searching, and evaluating ground truth..."
                    : "Searching document chunks and formulating answer..."}</span>
            </div>
        </div>
    );
}

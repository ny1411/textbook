"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";

const MeshGradient = dynamic(
    () => import("@paper-design/shaders-react").then((module) => module.MeshGradient),
    { ssr: false },
);

const contextOptions: WebGLContextAttributes = {
    powerPreference: "low-power",
    failIfMajorPerformanceCaveat: true,
};

function subscribeToMotionPreference(onChange: () => void) {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    preference.addEventListener("change", onChange);
    return () => preference.removeEventListener("change", onChange);
}

function canAnimate() {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches && !connection?.saveData;
}

export function HeroMeshGradient() {
    const prefersAnimation = useSyncExternalStore(subscribeToMotionPreference, canAnimate, () => false);
    const [supportsWebGL, setSupportsWebGL] = useState(false);

    useEffect(() => {
        if (!prefersAnimation) return;
        // Probe before mounting the shader; unsupported or slow contexts keep the CSS backdrop.
        const frame = requestAnimationFrame(() => {
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("webgl2", contextOptions);
            setSupportsWebGL(Boolean(context));
            context?.getExtension("WEBGL_lose_context")?.loseContext();
        });
        return () => cancelAnimationFrame(frame);
    }, [prefersAnimation]);

    return (
        <div
            aria-hidden="true"
            data-hero-backdrop
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl"
            style={{
                backgroundImage: "radial-gradient(ellipse at 20% 20%, #4338ca55, transparent 65%), radial-gradient(ellipse at 85% 40%, #0e749044, transparent 60%), radial-gradient(ellipse at 50% 90%, #6d28d944, transparent 60%)",
            }}
        >
            {prefersAnimation && supportsWebGL && (
                <MeshGradient
                    colors={["#18181b", "#312e81", "#0e7490", "#6d28d9"]}
                    speed={0.16}
                    distortion={0.7}
                    swirl={0.25}
                    grainMixer={0}
                    grainOverlay={0}
                    minPixelRatio={0.5}
                    maxPixelCount={200_000}
                    webGlContextAttributes={contextOptions}
                    className="absolute inset-0 opacity-50"
                    style={{ width: "100%", height: "100%" }}
                />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/20 via-zinc-900/40 to-zinc-900/80" />
        </div>
    );
}

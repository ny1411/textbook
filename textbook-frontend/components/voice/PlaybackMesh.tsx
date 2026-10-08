"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";

const MeshGradient = dynamic(() => import("@paper-design/shaders-react").then((module) => module.MeshGradient), { ssr: false });
const options: WebGLContextAttributes = { powerPreference: "low-power", failIfMajorPerformanceCaveat: true };
function subscribe(callback: () => void) {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    query.addEventListener("change", callback);
    return () => query.removeEventListener("change", callback);
}
function canAnimate() { return !window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

export function PlaybackMesh({ playing }: { playing: boolean }) {
    const animate = useSyncExternalStore(subscribe, canAnimate, () => false);
    const [supported, setSupported] = useState(false);
    useEffect(() => {
        if (!animate) return;
        const frame = requestAnimationFrame(() => {
            const context = document.createElement("canvas").getContext("webgl2", options);
            setSupported(Boolean(context));
            context?.getExtension("WEBGL_lose_context")?.loseContext();
        });
        return () => cancelAnimationFrame(frame);
    }, [animate]);
    return <div aria-hidden="true" data-playback-gradient data-animation-speed={playing ? "0.2" : "0.05"}
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{ background: "radial-gradient(ellipse at 20% 20%, #4338ca66, transparent 70%), radial-gradient(ellipse at 80% 80%, #0e749066, transparent 70%)" }}>
        {animate && supported && <MeshGradient colors={["#18181b", "#4338ca", "#0e7490", "#312e81"]}
            speed={playing ? 0.2 : 0.05} distortion={0.6} swirl={0.2} grainMixer={0} grainOverlay={0}
            maxPixelCount={120_000} minPixelRatio={0.5} webGlContextAttributes={options}
            style={{ width: "100%", height: "100%" }} />}
    </div>;
}

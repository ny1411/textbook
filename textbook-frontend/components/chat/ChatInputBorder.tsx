"use client";

import dynamic from "next/dynamic";
import { shaderContextOptions, useShaderEffects } from "@/hooks/useShaderEffects";

const PulsingBorder = dynamic(() => import("@paper-design/shaders-react").then((module) => module.PulsingBorder), { ssr: false });

interface ChatInputBorderProps {
    isActive: boolean;
    isAgentMode?: boolean;
}
export function ChatInputBorder({ isActive }: ChatInputBorderProps) {
    const enabled = useShaderEffects();
    if (!isActive) return null;
    return <div aria-hidden="true" data-composer-pulse className="pointer-events-none absolute -inset-px overflow-hidden rounded-[20px] border border-accent/45">
        {enabled && <PulsingBorder colors={["#c49b75", "#806248", "#a58b70"]} colorBack="#00000000"
            scale={1} aspectRatio="auto" margin={0}
            roundness={0.3} thickness={0.035} softness={0.7} intensity={0.18} bloom={0.08}
            spots={2} spotSize={0.15} pulse={0.12} smoke={0} speed={0.35}
            minPixelRatio={0.5} maxPixelCount={80_000} webGlContextAttributes={shaderContextOptions}
            className="opacity-55" style={{ width: "100%", height: "100%" }} />}
    </div>;
}

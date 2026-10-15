"use client";

import dynamic from "next/dynamic";
import { shaderContextOptions, useShaderEffects } from "@/hooks/useShaderEffects";

const PulsingBorder = dynamic(() => import("@paper-design/shaders-react").then((module) => module.PulsingBorder), { ssr: false });

interface ChatInputBorderProps {
    isActive: boolean;
    isAgentMode?: boolean;
}
export function ChatInputBorder({ isActive, isAgentMode = false }: ChatInputBorderProps) {
    const enabled = useShaderEffects();
    if (!isActive) return null;
    const colors = isAgentMode
        ? ["#c49b75", "#e1c6ab", "#a77a54", "#eee5d8"]
        : ["#a77a54", "#c49b75", "#dfbb97", "#806248"];
    return <div aria-hidden="true" data-composer-pulse className="pointer-events-none absolute -inset-[2px] overflow-hidden rounded-[21px] border border-accent/60">
        {enabled && <PulsingBorder colors={colors} colorBack="#00000000"
            scale={1} aspectRatio="auto" margin={0}
            roundness={0.35} thickness={0.08} softness={1} intensity={0.5} bloom={0.55}
            spots={3} spotSize={0.2} pulse={0.3} smoke={0.25} smokeSize={0.7} speed={0.9}
            minPixelRatio={0.5} maxPixelCount={160_000} webGlContextAttributes={shaderContextOptions}
            className="opacity-90" style={{ width: "100%", height: "100%" }} />}
    </div>;
}

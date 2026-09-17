"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const PulsingBorder = dynamic(() =>
    import("@paper-design/shaders-react").then((mod) => mod.PulsingBorder),
    { ssr: false }
);

interface ChatInputBorderProps {
    isActive: boolean;
    isAgentMode?: boolean;
}

export function ChatInputBorder({ isActive, isAgentMode = false }: ChatInputBorderProps) {
    const [mounted, setMounted] = useState<boolean>(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted || !isActive) return null;

    const colors = isAgentMode
        ? ["#6366f1", "#a855f7", "#ec4899", "#06b6d4"]
        : ["#4f46e5", "#6366f1", "#38bdf8", "#818cf8"];

    return (
        <div className="absolute -inset-[2px] rounded-2xl overflow-hidden pointer-events-none z-1 transition-opacity backdrop-blur-[1px] duration-500 animate-in fade-in">
            <PulsingBorder
                colors={colors}
                colorBack="rgba(0, 0, 0, 0.2)" // transparent
                scale={1}
                aspectRatio="auto"
                roundness={0.35}
                thickness={0.1}
                softness={1}       // smooth luminous edge
                intensity={0.6}      // spot brightness
                bloom={0.75}          // glow
                spots={3}             // circulating light spots
                spotSize={0.2}
                pulse={0.35}          // breathing pulse effect
                smoke={0.25}          // distortion
                smokeSize={0.7}
                speed={1.2}           // fluid pacing
                className="w-full h-full"
                style={{ width: "100%", height: "100%" }}
            />
        </div>
    );
}
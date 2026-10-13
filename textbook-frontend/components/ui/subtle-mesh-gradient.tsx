"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { shaderContextOptions, useShaderEffects } from "@/hooks/useShaderEffects";

const MeshGradient = dynamic(() => import("@paper-design/shaders-react").then((module) => module.MeshGradient), { ssr: false });
const warmColors = ["#141210", "#262019", "#5a4532", "#393028"];

export function SubtleMeshGradient({ kind = "hero", playing = false, className }: {
  kind?: "hero" | "audio"; playing?: boolean; className?: string;
}) {
  const enabled = useShaderEffects();
  return <div aria-hidden="true" data-mesh-backdrop={kind}
    className={cn("pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]", className)}>
    {enabled && <MeshGradient colors={warmColors} speed={kind === "audio" ? playing ? 0.2 : 0.05 : 0.07}
      distortion={0.45} swirl={0.1} grainMixer={0} grainOverlay={0}
      minPixelRatio={0.5} maxPixelCount={kind === "audio" ? 80_000 : 180_000}
      webGlContextAttributes={shaderContextOptions} className={kind === "audio" ? "opacity-25" : "opacity-20"}
      style={{ width: "100%", height: "100%" }} />}
  </div>;
}

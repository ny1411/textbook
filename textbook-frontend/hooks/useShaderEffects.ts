"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "./use-reduced-motion";

let supportsWebGL: boolean | undefined;
export const shaderContextOptions: WebGLContextAttributes = {
  alpha: true, antialias: false, powerPreference: "low-power", failIfMajorPerformanceCaveat: true,
};

// The CSS treatment remains visible until capability detection and for reduced motion.
export function useShaderEffects() {
  const reducedMotion = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (reducedMotion) return;
    const frame = requestAnimationFrame(() => {
      if (supportsWebGL === undefined) {
        const context = document.createElement("canvas").getContext("webgl2", shaderContextOptions);
        supportsWebGL = Boolean(context);
        context?.getExtension("WEBGL_lose_context")?.loseContext();
      }
      setEnabled(supportsWebGL);
    });
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);
  return enabled && !reducedMotion;
}

/** A display percentage for normalized relevance, never a calibrated probability. */
export function relevancePercentage(score: number | null | undefined): number | null {
    return typeof score === "number" && Number.isFinite(score)
        ? Math.round(Math.min(1, Math.max(0, score)) * 100)
        : null;
}

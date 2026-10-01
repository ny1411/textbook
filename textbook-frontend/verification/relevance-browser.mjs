// Run from textbook-frontend with a dev server at FRONTEND_URL (default port3015).
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const loadPlaywright = createRequire(import.meta.url);
const { chromium } = loadPlaywright(process.env.PLAYWRIGHT_MODULE || "playwright");

async function main() {
    const routeDir = path.resolve("app/verify-relevance-fixture");
    // Refuse to overwrite an existing route. The temporary fixture is removed in finally.
    await fs.mkdir(routeDir);
    let browser;
    try {
        await fs.writeFile(path.join(routeDir, "page.tsx"),
            'export { default } from "@/verification/relevance-fixture";\n');
        browser = await chromium.launch({
            executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
            args: ["--no-sandbox"],
        });
        const page = await browser.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const expected = ["0% match", "88% match", "0% match", "100% match", null, null];
        const scores = [0, 0.8807970779778823, -1, 2, null, null];
        await page.route("**/api/search", (route) => route.fulfill({
            status: 200, contentType: "application/json", body: JSON.stringify({
                query: "fixture", applied_query: "fixture", total_results: scores.length,
                results: scores.map((score, index) => ({ id: `chunk-${index}`, rrf_score: 0.03,
                    text: `Fixture excerpt ${index + 1}`, rerank_score: score })),
            }),
        }));
        const response = await page.goto(`${process.env.FRONTEND_URL || "http://127.0.0.1:3015"}/verify-relevance-fixture`);
        assert.equal(response.status(), 200);
        for (const [index, percentage] of expected.entries()) {
            await page.getByTitle(`Source ${index + 1}: Click to inspect source excerpt`, { exact: true }).click();
            // Radix exposes the popover as a dialog, without a named title.
            const content = page.getByRole("dialog");
            await content.getByText(`Fixture excerpt ${index + 1}`, { exact: false }).waitFor();
            if (percentage) await content.getByText(percentage, { exact: true }).waitFor();
            else assert.ok(!(await content.innerText()).includes("% match"));
            await content.getByRole("button", { name: "View Source" }).click();
            await page.keyboard.press("Escape");
            await page.getByText(`Source [${index + 1}]`, { exact: true }).waitFor();
            if (percentage) await page.getByText(percentage, { exact: true }).waitFor();
            else assert.equal(await page.getByText(/% match/).count(), 0);
        }
        await page.getByRole("button", { name: "Diagnostics", exact: true }).click();
        const inspector = page.getByRole("dialog", { name: "Retrieval Diagnostic Inspector" });
        await inspector.getByPlaceholder("Enter diagnostic query", { exact: false }).fill("fixture");
        await inspector.getByRole("button", { name: "Run Diagnostic" }).click();
        await inspector.getByText("Candidate Chunks (6)", { exact: true }).waitFor();
        const stage2 = inspector.getByText("Stage 2 (Rerank):", { exact: true });
        for (const [index, label] of ["0%", "88%", "0%", "100%", "N/A", "N/A"].entries()) {
            assert.ok((await stage2.nth(index).locator("..").innerText()).includes(label));
        }
        assert.deepEqual(errors, []);
        console.log("PASS citation popover, Studio and inspector: zero, sigmoid score, bounds, absent/nonfinite values");
    } finally {
        if (browser) await browser.close();
        await fs.rm(routeDir, { recursive: true, force: true });
    }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

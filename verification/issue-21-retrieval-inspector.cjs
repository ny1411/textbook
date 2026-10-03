// Run against the frontend dev server. See issue-21-retrieval-inspector.md.
const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const query = "How does gradient descent work?";
const results = [
    { id: "diagnostic-chunk-1", text: "Gradient descent updates model parameters.", page_number: 3, rrf_score: 0.0312, rerank_score: 0.86 },
    { id: "diagnostic-chunk-2", text: "The learning rate controls the step size.", page_number: 4, rrf_score: 0.0275, rerank_score: 0.45 },
    { id: "diagnostic-chunk-3", text: "A candidate without a reranker score.", rrf_score: 0.0138, rerank_score: null },
];

async function main() {
    const browser = await chromium.launch({
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
        args: ["--no-sandbox"],
    });
    try {
        for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
            const context = await browser.newContext({ viewport });
            const page = await context.newPage();
            const errors = [];
            const requests = [];
            page.on("pageerror", (error) => errors.push(error.message));
            await context.route("**/api/search", async (route) => {
                requests.push(route.request().postDataJSON());
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({ query, applied_query: query, total_results: results.length, results }),
                });
            });

            await page.goto(process.env.FRONTEND_URL || "http://127.0.0.1:3021");
            const shortcut = page.locator("header").getByRole("button", { name: "Open Retrieval Inspector", exact: true });
            const dialog = page.getByRole("dialog", { name: "Retrieval Diagnostic Inspector" });
            assert.equal(await shortcut.getAttribute("aria-haspopup"), "dialog");
            await shortcut.click();
            await dialog.waitFor({ state: "visible" });
            assert.equal(await page.getByRole("dialog").count(), 1);
            await dialog.getByText("No Inspection Results", { exact: true }).waitFor();

            const input = dialog.getByPlaceholder("Enter diagnostic query", { exact: false });
            await input.fill(`  ${query}  `);
            const topK = dialog.locator('input[type="range"]');
            await topK.focus();
            await topK.press("Home");
            for (let i = 0; i < 6; i++) await topK.press("ArrowRight");
            await dialog.getByLabel("Enable Query Rewriting / HyDE").uncheck();
            await dialog.getByRole("button", { name: "Run Diagnostic", exact: true }).click();
            await dialog.getByText("Candidate Chunks (3)", { exact: true }).waitFor();
            assert.equal(requests.length, 1);
            assert.equal(requests[0].query, query);
            assert.equal(requests[0].top_k, 9);
            assert.equal(requests[0].use_analysis, false);
            assert.equal(requests[0].notebook_id, "00000000-0000-0000-0000-000000000001");
            assert.equal(requests[0].document_id, undefined);

            const stage1 = dialog.getByText("Stage 1 (RRF):", { exact: true });
            const stage2 = dialog.getByText("Stage 2 (Rerank):", { exact: true });
            assert.equal(await stage1.count(), 3);
            assert.equal(await stage2.count(), 3);
            for (const [index, score] of ["0.0312", "0.0275", "0.0138"].entries()) {
                assert.match(await stage1.nth(index).locator("..").innerText(), new RegExp(score.replace(".", "\\.")));
            }
            for (const [index, score] of ["86%", "45%", "N/A"].entries()) {
                assert.ok((await stage2.nth(index).locator("..").innerText()).includes(score));
                await dialog.getByText(results[index].text, { exact: false }).waitFor();
            }

            // The existing close icon is the first button in the modal header.
            await dialog.locator("button").first().click();
            await dialog.waitFor({ state: "hidden" });
            await page.getByTitle("Expand Studio", { exact: true }).click();
            await page.getByRole("button", { name: "Diagnostics", exact: true }).click();
            await dialog.waitFor({ state: "visible" });
            assert.equal(await page.getByRole("dialog").count(), 1);
            // Both shortcuts reopen the same mounted inspector and retain its query/results.
            assert.equal(await input.inputValue(), `  ${query}  `);
            await dialog.getByText("Candidate Chunks (3)", { exact: true }).waitFor();
            await page.keyboard.press("Escape");
            await dialog.waitFor({ state: "hidden" });
            await page.getByTitle("Collapse Studio", { exact: true }).click();

            await shortcut.focus();
            await page.keyboard.press("Enter");
            await dialog.waitFor({ state: "visible" });
            await page.mouse.click(2, viewport.height - 2);
            await dialog.waitFor({ state: "hidden" });
            assert.deepEqual(errors, []);
            console.log(`PASS ${viewport.width}x${viewport.height}: Header, Studio, keyboard, close button, Escape, backdrop, request options, Stage 1/Stage 2`);
            await context.close();
        }
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

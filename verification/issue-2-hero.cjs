// Run against the frontend dev server. See issue-2-hero.md.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

async function main() {
    const browser = await chromium.launch({
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
        args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
    });
    const scenarios = [
        { name: "desktop", width: 1440, height: 900, animated: true },
        { name: "tablet", width: 1024, height: 768, animated: true },
        { name: "reduced-motion", width: 768, height: 1024, reducedMotion: "reduce" },
        { name: "no-webgl", width: 1440, height: 900, noWebGL: true },
        { name: "data-saver", width: 1440, height: 900, saveData: true },
    ];
    try {
        for (const scenario of scenarios) {
            const context = await browser.newContext({
                viewport: { width: scenario.width, height: scenario.height },
                reducedMotion: scenario.reducedMotion || "no-preference",
            });
            const page = await context.newPage();
            const errors = [];
            page.on("pageerror", (error) => errors.push(error.message));
            if (scenario.noWebGL) {
                await page.addInitScript(() => {
                    const original = HTMLCanvasElement.prototype.getContext;
                    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
                        return type === "webgl2" ? null : original.call(this, type, ...args);
                    };
                });
            }
            if (scenario.saveData) {
                await page.addInitScript(() => {
                    Object.defineProperty(navigator, "connection", { value: { saveData: true } });
                });
            }
            const requests = [];
            await page.route("**/api/chat", async (route) => {
                requests.push(route.request().postDataJSON());
                await route.fulfill({
                    contentType: "application/json",
                    body: JSON.stringify({ answer: "Verified hero interaction.", applied_query: "test", citations: [] }),
                });
            });
            await page.goto(process.env.FRONTEND_URL || "http://127.0.0.1:3022");
            const backdrop = page.locator("[data-hero-backdrop]");
            await page.getByRole("heading", { name: "Want to explore further?" }).waitFor();
            assert.equal(await backdrop.getAttribute("aria-hidden"), "true");
            assert.equal(await backdrop.evaluate((element) => getComputedStyle(element).pointerEvents), "none");
            assert.notEqual(await backdrop.evaluate((element) => getComputedStyle(element).backgroundImage), "none");
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

            for (const name of ["Summarize Concepts", "Compare Findings", "Explain Methodology"]) {
                await page.getByRole("button", { name, exact: false }).click({ trial: true });
            }
            const input = page.getByPlaceholder("Ask any question");
            await input.fill("The backdrop leaves chat input accessible.");
            assert.equal(await input.inputValue(), "The backdrop leaves chat input accessible.");
            await input.fill("");

            if (scenario.animated) {
                const canvas = backdrop.locator("canvas");
                await canvas.waitFor();
                await page.waitForFunction(() => {
                    const canvas = document.querySelector("[data-hero-backdrop] canvas");
                    return canvas?.width > 0 && canvas?.height > 0;
                });
                const size = await canvas.evaluate((element) => ({ width: element.width, height: element.height }));
                assert.ok(size.width * size.height <= 200_000, "Shader resolution stays within the render budget");
                const frame = await canvas.evaluate((element) => element.parentElement.paperShaderMount.getCurrentFrame());
                await page.waitForFunction((initialFrame) => {
                    const canvas = document.querySelector("[data-hero-backdrop] canvas");
                    return canvas?.parentElement.paperShaderMount.getCurrentFrame() > initialFrame;
                }, frame);

                if (process.env.SCREENSHOT_DIR) {
                    fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
                    await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `${scenario.name}.png`) });
                }
                await page.emulateMedia({ reducedMotion: "reduce" });
                await canvas.waitFor({ state: "detached" });
                await page.emulateMedia({ reducedMotion: "no-preference" });
                await canvas.waitFor();
                // A real suggested-query click reaches the existing chat API and removes the hero.
                await page.getByRole("button", { name: "Summarize Concepts", exact: false }).click();
                await backdrop.waitFor({ state: "detached" });
                await page.getByText("Verified hero interaction.", { exact: true }).waitFor();
                assert.equal(requests.length, 1);
                assert.equal(requests[0].query, "Summarize the concepts and takeaways from uploaded documents.");
            } else {
                assert.equal(await backdrop.locator("canvas").count(), 0);
                if (process.env.SCREENSHOT_DIR) {
                    fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
                    await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, `${scenario.name}.png`) });
                }
            }
            assert.deepEqual(errors, []);
            console.log(`PASS ${scenario.name}: backdrop, readable content, interactive controls${scenario.animated ? ", animation, render budget, live motion preference, removal on chat" : ", static fallback without canvas"}`);
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

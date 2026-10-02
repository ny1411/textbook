/* Isolated Next fixture exercises the actual ChatMessage without auth/backend traffic.
 * Run: node tests/citations-browser.cjs
 * Requires the managed Chromium/Playwright runtime; outputs screenshots under /workspace/scratch.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { chromium } = require("/opt/codex/runtimes/cua/lib/node_modules/playwright-core");

const frontend = path.resolve(__dirname, "..");
const output = "/workspace/scratch/issue-16-browser";
const port = 3016;

async function main() {
    fs.mkdirSync(output, { recursive: true });
    const fixture = fs.mkdtempSync(path.join(output, "fixture-"));
    fs.mkdirSync(path.join(fixture, "app"));
    fs.symlinkSync(path.join(frontend, "node_modules"), path.join(fixture, "node_modules"), "dir");
    fs.writeFileSync(path.join(fixture, "package.json"), JSON.stringify({ name: "citation-verification", private: true }));
    fs.writeFileSync(path.join(fixture, "tsconfig.json"), JSON.stringify({
        compilerOptions: { baseUrl: ".", paths: { "@/*": [frontend + "/*"] } },
    }));
    fs.writeFileSync(path.join(fixture, "next.config.mjs"), "export default { experimental: { externalDir: true } };\n");
    fs.copyFileSync(path.join(frontend, "postcss.config.mjs"), path.join(fixture, "postcss.config.mjs"));
    fs.writeFileSync(path.join(fixture, "app/fixture.css"),
        `@import "${frontend}/app/globals.css";\n@source "${frontend}/components/chat";\n`);
    fs.writeFileSync(path.join(fixture, "app/layout.jsx"), `import "./fixture.css";
export default function Layout({children}) { return <html className="dark"><body>{children}</body></html>; }
`);
    const content = [
        "Grouped [Source 1, Source 2, Source 3].",
        "Compact [Source1][Source2]; spaced [Source 1][Source 2].",
        "Other formats [1, source_2, Source doc-a]. Unknown [Source 999]. Unrelated [optional].",
        "Inline code: `[Source 1, Source 2]`.",
        "```text\n[Source1][Source2]\n```",
        "[[Source 1, Source 2]](https://example.test/read)",
        "![Source 1, Source 2](data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E)",
    ].join("\n\n");
    const userText = "Please explain [Source 1, Source 2] and keep `code` unchanged.";
    fs.writeFileSync(path.join(fixture, "app/page.jsx"), `"use client";
import {useState} from "react";
import {ChatMessage} from "${frontend}/components/chat/ChatMessage";
const citations = [1,2,3,"doc-a"].map((id) => ({source_id:id,chunk_id:String(id),document_id:"document-"+id,page_number:7,text:"Verified excerpt for source "+id,rerank_score:0.5}));
export default function Page() {
 const [selected,setSelected]=useState("");
 return <main className="min-h-screen bg-zinc-950 p-8 text-zinc-100">
  <section data-testid="assistant"><ChatMessage message={{id:"assistant",role:"assistant",content:${JSON.stringify(content)},citations,createdAt:new Date(0)}} onCitationClick={c => setSelected(String(c.source_id))}/></section>
  <section data-testid="user"><ChatMessage message={{id:"user",role:"user",content:${JSON.stringify(userText)},createdAt:new Date(0)}}/></section>
  <output data-testid="selected">{selected}</output>
 </main>;
}
`);

    const log = fs.openSync(path.join(output, "next.log"), "w");
    const server = spawn(process.execPath, [path.join(frontend, "node_modules/next/dist/bin/next"),
        "dev", fixture, "--webpack", "--port", String(port)], {
        cwd: fixture, detached: true, stdio: ["ignore", log, log], env: process.env,
    });
    let browser;
    try {
        const deadline = Date.now() + 90000;
        let ready = false;
        while (Date.now() < deadline) {
            if (server.exitCode !== null) throw new Error("Fixture server exited; see " + path.join(output, "next.log"));
            try {
                const response = await fetch(`http://127.0.0.1:${port}`);
                if (response.ok) { ready = true; break; }
            } catch { /* The local server is still starting. */ }
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        assert.ok(ready, "Fixture server must become ready; see " + path.join(output, "next.log"));
        browser = await chromium.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox"] });
        const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "networkidle" });
        const assistant = page.getByTestId("assistant");
        const prose = assistant.locator(".prose");
        assert.equal(await prose.locator("button[title^='Source ']").count(), 10);
        assert.ok((await prose.textContent()).includes("[999]"));
        assert.ok((await prose.textContent()).includes("[optional]"));
        assert.equal(await prose.locator("code").nth(0).textContent(), "[Source 1, Source 2]");
        assert.equal((await prose.locator("code").nth(1).textContent()).trim(), "[Source1][Source2]");
        assert.equal(await prose.locator("a[href='https://example.test/read']").textContent(), "[Source 1, Source 2]");
        assert.equal(await prose.locator("img").getAttribute("alt"), "Source 1, Source 2");
        assert.equal(await page.getByTestId("user").locator("p").textContent(), userText);
        assert.equal(await page.getByTestId("user").locator("button").count(), 0);

        const first = prose.locator("button[title^='Source 1:']").first();
        await first.hover();
        const tooltip = page.getByRole("tooltip");
        await tooltip.waitFor({ state: "visible" });
        assert.ok((await tooltip.textContent()).includes("Verified excerpt for source 1"));
        assert.ok((await tooltip.textContent()).includes("p. 7"));
        await page.screenshot({ path: path.join(output, "grouped-citation-hover.png"), fullPage: true });
        await first.click();
        await page.getByRole("button", { name: "View Source" }).waitFor({ state: "visible" });
        await page.getByRole("button", { name: "View Source" }).click();
        assert.equal(await page.getByTestId("selected").textContent(), "1");
        await page.keyboard.press("Escape");
        const third = prose.locator("button[title^='Source 3:']").first();
        await third.hover();
        await page.getByRole("tooltip").waitFor({ state: "visible" });
        assert.ok((await page.getByRole("tooltip").textContent()).includes("Verified excerpt for source 3"));
        assert.deepEqual(errors, []);
        console.log("Browser checks passed: grouped badges, both single formats, known/unknown IDs, Markdown/user preservation, hover excerpts, and View Source callback.");
        console.log("Screenshot: " + path.join(output, "grouped-citation-hover.png"));
    } finally {
        if (browser) await browser.close();
        try { process.kill(-server.pid, "SIGTERM"); } catch { /* Process has already exited. */ }
        fs.closeSync(log);
    }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

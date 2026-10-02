import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "/opt/codex/runtimes/cua/lib/node_modules/playwright-core");
const baseURL = process.env.SAMPLE_TEST_URL || "http://127.0.0.1:3023";
const label = "Load Sample AI Engineering Textbook";
const notebookA = "11111111-1111-1111-1111-111111111111";
const notebookB = "22222222-2222-2222-2222-222222222222";
const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
});
const checks = [];

// Development-only controls: access existing Zustand exports through webpack's
// runtime so context-change tests need no production test route or global hook.
async function setScope(page, userId, notebookId) {
    await page.evaluate(({ userId, notebookId }) => {
        window.__sampleStores.user.getState().setUser({ id: userId });
        window.__sampleStores.notebook.getState().setActiveNotebookId(notebookId);
    }, { userId, notebookId });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function sources(page) {
    return page.evaluate(() => window.__sampleStores.sources.getState().source);
}

async function openFixture({ failUploads = 0, status = "processing", hold = false } = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    // All remote traffic is blocked; APIs below are browser route fixtures.
    await page.route("https://**/*", route => route.abort());
    const requests = [];
    let ingestionStatus = status;
    let remainingFailures = failUploads;
    let release;
    const gate = hold ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
    await page.route("**/api/upload?**", async route => {
        const request = route.request();
        const body = request.postDataBuffer();
        assert.equal(request.method(), "POST");
        assert.ok(body.includes(Buffer.from('filename="ai-engineer.pdf"')));
        assert.ok(body.includes(Buffer.from("Content-Type: application/pdf")));
        assert.ok(body.includes(Buffer.from("%PDF-")));
        requests.push(new URL(request.url()).searchParams);
        await gate;
        if (remainingFailures-- > 0) {
            await route.fulfill({ status: 503, json: { detail: "Fixture upload unavailable" } });
        } else {
            await route.fulfill({ json: {
                message: "Uploaded", filename: "ai-engineer.pdf",
                filepath: `fixture/sample-${requests.length}.pdf`,
                document_id: `sample-${requests.length}`, status: "processing",
            } });
        }
    });
    await page.route("**/api/documents/*/status", route => route.fulfill({
        json: { status: ingestionStatus, error: ingestionStatus === "failed" ? "Fixture ingestion failure" : undefined },
    }));
    await page.goto(baseURL);
    await page.getByRole("button", { name: label, exact: true }).waitFor();
    await page.evaluate(async () => {
        let runtime;
        window.webpackChunk_N_E.push([[`sample-test-${Date.now()}`], {}, value => { runtime = value; }]);
        const module = name => runtime(Object.keys(runtime.m).find(key => key.endsWith(`/stores/${name}.ts`)));
        window.__sampleStores = {
            user: module("useUserStore").useUserStore,
            notebook: module("useTextbookStore").useTextbookStore,
            sources: module("useSourcesStore").useSourceStore,
        };
        const clientModule = runtime(Object.keys(runtime.m).find(key => key.endsWith("/lib/supabase/client.ts")));
        // Let the existing auth hook finish its initial anonymous-session event
        // before installing a synthetic user. No provider session is created.
        await clientModule.createClient().auth.getUser();
        await clientModule.createClient().auth.getSession();
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await setScope(page, "fixture-user-a", notebookA);
    return {
        page, context, requests, pageErrors,
        release: () => release?.(),
        setStatus: value => { ingestionStatus = value; },
    };
}

async function waitForRequests(fixture, count) {
    await fixture.page.waitForFunction(() => document.querySelector("button:disabled") !== null);
    const deadline = Date.now() + 10000;
    while (fixture.requests.length < count && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(fixture.requests.length, count);
}

async function run(name, fn) {
    await fn();
    checks.push(name);
    console.log(`PASS: ${name}`);
}

try {
    await run("bundled sample PDF is served unchanged", async () => {
        const fixture = await openFixture();
        const response = await fixture.page.request.get(`${baseURL}/samples/ai-engineer.pdf`);
        assert.equal(response.status(), 200);
        const actual = await response.body();
        const original = await readFile(new URL("../../../ai-engineer.pdf", import.meta.url));
        assert.deepEqual(actual, original);
        assert.ok(actual.subarray(0, 5).equals(Buffer.from("%PDF-")));
        assert.equal(fixture.requests.length, 0);
        await fixture.context.close();
    });

    await run("one click uploads once with current user/notebook and polls to ready", async () => {
        const fixture = await openFixture({ hold: true });
        const { page } = fixture;
        await page.getByRole("button", { name: label }).evaluate(button => { button.click(); button.click(); });
        await waitForRequests(fixture, 1);
        assert.equal(await page.getByRole("button", { name: "Loading sample textbook…" }).isDisabled(), true);
        assert.equal(fixture.requests[0].get("userId"), "fixture-user-a");
        assert.equal(fixture.requests[0].get("notebookId"), notebookA);
        fixture.release();
        await page.getByText("Indexing sample textbook…", { exact: true }).waitFor();
        assert.equal(await page.getByRole("button", { name: label }).count(), 0);
        const [source] = await sources(page);
        assert.equal(source.userId, "fixture-user-a");
        assert.equal(source.notebookId, notebookA);
        assert.equal(source.status, "processing");
        assert.equal(await page.getByText("1/1", { exact: true }).count(), 1);
        fixture.setStatus("ready");
        await page.getByText("Sample ready. Ask a question or create a note.", { exact: true }).waitFor();
        assert.equal((await sources(page))[0].status, "ready");
        assert.equal(fixture.requests.length, 1);
        assert.deepEqual(fixture.pageErrors, []);
        await page.screenshot({ path: "/workspace/scratch/issue-22-ready.png" });
        await fixture.context.close();
    });

    await run("upload failure leaves zero-state and permits a successful retry", async () => {
        const fixture = await openFixture({ failUploads: 1, status: "ready" });
        await fixture.page.getByRole("button", { name: label }).click();
        await fixture.page.getByRole("alert").filter({ hasText: "Couldn’t load the sample" }).waitFor();
        assert.equal((await sources(fixture.page)).length, 0);
        assert.equal(await fixture.page.getByRole("button", { name: label }).isEnabled(), true);
        await fixture.page.screenshot({ path: "/workspace/scratch/issue-22-retry.png" });
        await fixture.page.getByRole("button", { name: label }).click();
        await fixture.page.getByText("Sample ready. Ask a question or create a note.", { exact: true }).waitFor();
        assert.equal(fixture.requests.length, 2);
        assert.equal((await sources(fixture.page)).length, 1);
        assert.deepEqual(fixture.pageErrors, []);
        await fixture.context.close();
    });

    await run("sample fetch failure retries without starting an upload", async () => {
        const fixture = await openFixture();
        await fixture.page.route("**/samples/ai-engineer.pdf", route => route.fulfill({ status: 404, body: "Missing fixture" }), { times: 1 });
        await fixture.page.getByRole("button", { name: label }).click();
        await fixture.page.getByRole("alert").filter({ hasText: "Couldn’t load the sample" }).waitFor();
        assert.equal(fixture.requests.length, 0);
        await fixture.page.getByRole("button", { name: label }).click();
        await fixture.page.getByText("Indexing sample textbook…", { exact: true }).waitFor();
        assert.equal(fixture.requests.length, 1);
        await fixture.context.close();
    });

    for (const change of ["user", "notebook"]) {
        await run(`late upload response is discarded after ${change} changes`, async () => {
            const fixture = await openFixture({ hold: true });
            await fixture.page.getByRole("button", { name: label }).click();
            await waitForRequests(fixture, 1);
            await setScope(fixture.page, change === "user" ? "fixture-user-b" : "fixture-user-a", change === "notebook" ? notebookB : notebookA);
            const completed = fixture.page.waitForResponse(response => response.url().includes("/api/upload?"));
            fixture.release();
            await completed;
            await fixture.page.getByRole("button", { name: label }).waitFor();
            await fixture.page.waitForFunction(() => window.__sampleStores.sources.getState().source.length === 0);
            assert.equal((await sources(fixture.page)).length, 0);
            assert.equal(await fixture.page.getByRole("button", { name: label }).isEnabled(), true);
            // A new attempt uses the new context rather than the captured one.
            await fixture.page.getByRole("button", { name: label }).click();
            await fixture.page.getByText("Indexing sample textbook…", { exact: true }).waitFor();
            assert.equal(fixture.requests[1].get("userId"), change === "user" ? "fixture-user-b" : "fixture-user-a");
            assert.equal(fixture.requests[1].get("notebookId"), change === "notebook" ? notebookB : notebookA);
            assert.equal((await sources(fixture.page)).length, 1);
            assert.deepEqual(fixture.pageErrors, []);
            await fixture.context.close();
        });
    }

    await run("late upload response is discarded when zero-state unmounts", async () => {
        const fixture = await openFixture({ hold: true });
        await fixture.page.getByRole("button", { name: label }).click();
        await waitForRequests(fixture, 1);
        await fixture.page.evaluate(() => window.__sampleStores.sources.getState().addSource({
            userId: "fixture-user-a", notebookId: "11111111-1111-1111-1111-111111111111",
            filename: "existing.pdf", filepath: "fixture/existing.pdf", documentId: "existing", status: "ready",
        }));
        const completed = fixture.page.waitForResponse(response => response.url().includes("/api/upload?"));
        fixture.release();
        await completed;
        await fixture.page.getByText("existing.pdf", { exact: true }).waitFor();
        assert.deepEqual((await sources(fixture.page)).map(source => source.filename), ["existing.pdf"]);
        assert.equal(await fixture.page.getByRole("button", { name: label }).count(), 0);
        await fixture.context.close();
    });

    await run("ingestion failure is visible and removal permits loading again", async () => {
        const fixture = await openFixture({ status: "failed" });
        await fixture.page.getByRole("button", { name: label }).click();
        await fixture.page.getByRole("alert").filter({ hasText: "The sample could not be indexed" }).waitFor();
        assert.equal((await sources(fixture.page))[0].status, "failed");
        await fixture.page.getByRole("button", { name: "Remove source" }).click();
        await fixture.page.getByRole("button", { name: label }).waitFor();
        fixture.setStatus("ready");
        await fixture.page.getByRole("button", { name: label }).click();
        await fixture.page.getByText("Sample ready. Ask a question or create a note.", { exact: true }).waitFor();
        assert.equal(fixture.requests.length, 2);
        assert.deepEqual(fixture.pageErrors, []);
        await fixture.context.close();
    });
    console.log(JSON.stringify({ status: "passed", checks }));
} finally {
    await browser.close();
}

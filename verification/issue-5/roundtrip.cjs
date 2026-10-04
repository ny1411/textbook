// Real services only: no route interception, fabricated auth, or store seeding.
const { randomUUID } = require('node:crypto');
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const { VerificationError, requireCheck, makePdf, createApi, waitForIngestion, validateSearch, validateAnswer } = require('./protocol.cjs');

async function main() {
    const origin = process.env.FRONTEND_URL || 'http://127.0.0.1:3025';
    const state = process.env.E2E_STORAGE_STATE;
    const notebook = process.env.E2E_NOTEBOOK_ID;
    requireCheck(state && notebook, 'setup:storage-state-and-owned-test-notebook-required');
    const url = new URL(origin);
    requireCheck(!url.username && !url.password && !url.search && !url.hash && ['http:', 'https:'].includes(url.protocol), 'setup:invalid-frontend-url');
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
    const runId = randomUUID();
    const fixture = makePdf(runId);
    const filename = `roundtrip-${runId}.pdf`;
    const browser = await chromium.launch({
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
        args: ['--no-sandbox'],
    });
    const report = { run_id: runId, stages: [], live_roundtrip: false };
    const mark = (stage) => { report.stages.push(stage); console.log(`PASS ${stage}`); };
    let stage = 'workspace';
    try {
        const context = await browser.newContext({ storageState: state, viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        let browserErrors = 0;
        page.on('pageerror', () => { browserErrors++; });
        await page.goto(origin);
        await page.getByRole('combobox', { name: 'Notebook', exact: true }).selectOption(notebook);
        await page.getByPlaceholder('Ask any question', { exact: true }).waitFor();
        // Explicit fresh saved conversation prevents restored history and response caching.
        const conversationResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/conversations' && response.request().method() === 'POST');
        await page.getByRole('button', { name: 'New chat', exact: true }).click();
        requireCheck((await conversationResponse).status() === 201, 'workspace:conversation-not-created');
        mark('authenticated-owned-workspace');

        stage = 'upload';
        const uploadedResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/upload' && response.request().method() === 'POST');
        await page.locator('input[type=file]').setInputFiles({ name: filename, mimeType: 'application/pdf', buffer: fixture.pdf });
        const uploadResponse = await uploadedResponse;
        requireCheck(uploadResponse.ok(), 'upload:failed');
        const uploaded = await uploadResponse.json();
        requireCheck(uploaded.document_id && uploaded.status === 'processing', 'upload:invalid-response');
        const uploadRequest = uploadResponse.request();
        const authorization = (await uploadRequest.allHeaders()).authorization;
        const params = new URL(uploadRequest.url()).searchParams;
        requireCheck(authorization?.startsWith('Bearer ') && params.get('notebookId') === notebook, 'upload:missing-auth-or-wrong-notebook');
        const api = createApi(origin, authorization);
        report.document_id = uploaded.document_id;
        mark('real-pdf-upload');

        stage = 'ingestion';
        await waitForIngestion(api, uploaded.document_id);
        mark('persisted-ingestion-ready');
        // Ensure UI source selection sends only this new document, even on reruns.
        const sourceCheckboxes = page.getByRole('checkbox', { name: /^Use .+ in answers$/ });
        for (const checkbox of await sourceCheckboxes.all()) await checkbox.uncheck();
        await page.getByRole('checkbox', { name: `Use ${filename} in answers`, exact: true }).check();

        stage = 'search';
        const search = await api('/api/search', {
            user_id: params.get('userId'), notebook_id: notebook, document_ids: [uploaded.document_id],
            query: fixture.query, top_k: 20, use_analysis: false,
        });
        validateSearch(search, uploaded.document_id, fixture.subject);
        report.search_chunks = search.results.length;
        mark('dense-sparse-fusion-and-cross-encoder');

        stage = 'generation';
        const chatResponsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/chat' && response.request().method() === 'POST', { timeout: 180000 });
        await page.getByPlaceholder('Ask any question', { exact: true }).fill(fixture.query);
        await page.getByRole('button', { name: 'Send message', exact: true }).click();
        const chatResponse = await chatResponsePromise;
        requireCheck(chatResponse.ok(), 'generation:request-failed');
        const chatRequest = chatResponse.request().postDataJSON();
        requireCheck(chatRequest.document_ids?.length === 1 && chatRequest.document_ids[0] === uploaded.document_id, 'generation:wrong-ui-source-selection');
        const answer = await chatResponse.json();
        validateAnswer(answer, uploaded.document_id, fixture.subject, search);
        report.citations = answer.citations.length;
        report.conversation_id = answer.conversation_id;
        mark('fresh-generated-cited-and-saved-answer');

        stage = 'render';
        await page.getByText(`Cited Sources (${answer.citations.length})`, { exact: true }).waitFor();
        const citation = answer.citations[0];
        requireCheck(/\b47\s*(?:hours?|hrs?)\b/i.test(await page.locator('.prose').last().innerText()), 'render:answer-fact-missing');
        const badge = page.locator(`.prose button[title="Source ${citation.source_id}: Click to inspect source excerpt"]`).first();
        await badge.click();
        await page.getByText(`Doc: ${uploaded.document_id}`, { exact: true }).waitFor();
        // Match the actual API excerpt, not just a generic citation count.
        await page.getByText(citation.text, { exact: false }).last().waitFor();
        requireCheck(browserErrors === 0, 'render:browser-errors');
        mark('ui-citation-and-live-excerpt');
        const output = path.resolve(process.env.E2E_OUTPUT_DIR || '/tmp/textbook-issue-5', runId);
        await mkdir(output, { recursive: true });
        await page.screenshot({ path: path.join(output, 'cited-answer.png'), fullPage: true });
        report.live_roundtrip = true;
        await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
        console.log(`Evidence saved: ${output}`);
        // No storage state, tokens, network traces, or raw responses are saved.
    } catch (error) {
        console.error(`FAIL ${stage}: ${error instanceof VerificationError ? error.code : 'browser-or-setup-failure'}`);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}
if (require.main === module) main().catch((error) => {
    console.error(error instanceof VerificationError ? error.code : 'setup:failed');
    process.exitCode = 1;
});

// Layout fixtures mock auth/API responses; they do not verify backend behavior.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const user = { id: 'layout-user', email: 'layout@example.com', user_metadata: { name: 'Layout' }, aud: 'authenticated', role: 'authenticated' };
const notebook = { id: 'layout-notebook', name: 'AI Engineering Research Notebook' };
const date = '2026-10-04T10:00:00Z';
const sources = Array.from({ length: 20 }, (_, i) => ({ userId: user.id, notebookId: notebook.id, documentId: `document-${i}`, filename: `Research textbook chapter ${i + 1}.pdf`, filepath: `layout/chapter-${i}.pdf`, status: 'ready', size: 1024, uploadedAt: date }));
const messages = Array.from({ length: 12 }, (_, i) => ({ id: `message-${i}`, role: i % 2 ? 'assistant' : 'user', content: i % 2 ? 'Gradient descent updates model parameters using the derivative of the loss function. '.repeat(6) : 'Explain gradient descent in practical terms.', created_at: date, is_agent_mode: false }));
const results = Array.from({ length: 12 }, (_, i) => ({ id: `chunk-${i}`, text: 'Gradient descent updates model parameters. '.repeat(8), page_number: i + 1, rrf_score: 0.0312, rerank_score: 0.86 }));
const settle = page => page.waitForTimeout(750);
async function fits(locator, viewport, label) {
  const box = await locator.boundingBox();
  assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, `${label} fits viewport: ${JSON.stringify(box)}`);
}
async function noHorizontalOverflow(locator, label) {
  assert.ok(await locator.evaluate(e => e.scrollWidth <= e.clientWidth + 1), `${label} has no horizontal clipping`);
}
async function main() {
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  const output = process.env.SCREENSHOT_DIR || '/tmp/issue-7-responsive';
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const viewport of [{ width: 768, height: 1024 }, { width: 820, height: 1180 }, { width: 1024, height: 768 }, { width: 1180, height: 820 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
      await page.addInitScript(({ user }) => {
        const session = { access_token: 'a.b.c', refresh_token: 'layout', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user };
        document.cookie = `sb-responsive-auth-token=base64-${btoa(JSON.stringify(session))};path=/`;
      }, { user });
      await page.route('**/auth/v1/user', route => route.fulfill({ json: user }));
      await page.route('**/api/**', route => {
        const path = new URL(route.request().url()).pathname;
        const json = path === '/api/notebooks' ? [notebook] : path === '/api/documents' ? { items: sources, next_offset: null } : path.endsWith('/messages') ? { items: messages, next_before: null } : path === '/api/conversations' ? { items: [{ id: 'layout-chat', notebook_id: notebook.id, title: 'Saved research discussion', updated_at: date }], next_offset: null } : path === '/api/search' ? { query: 'gradient descent', applied_query: 'gradient descent', results, total_results: results.length } : {};
        return route.fulfill({ json });
      });
      await page.goto(process.env.FRONTEND_URL || 'http://127.0.0.1:3027');
      assert.match(await page.title(), /Textbook/);
      await page.getByLabel('Saved chats').waitFor();
      await page.getByPlaceholder('Ask any question', { exact: true }).waitFor();
      assert.equal(await page.locator('nextjs-portal').filter({ hasText: 'Runtime Error' }).count(), 0);
      const center = page.locator('main > section');
      const sourcePanel = page.getByRole('complementary', { name: 'Sources', exact: true });
      const studio = page.getByRole('complementary', { name: 'Studio', exact: true });
      await noHorizontalOverflow(center, 'chat');
      await fits(page.getByLabel('Send message', { exact: true }), viewport, 'send control');
      const chatScroll = center.locator('[data-lenis-prevent]').first();
      assert.ok(await chatScroll.evaluate(e => e.scrollHeight > e.clientHeight), 'long chat scrolls independently');
      if (viewport.width < 1024) {
        await page.getByTitle('Toggle Sources').click(); await settle(page);
      }
      await fits(sourcePanel, viewport, 'sources');
      const sourceScroll = sourcePanel.locator('[data-lenis-prevent]').first();
      assert.ok(await sourceScroll.evaluate(e => e.scrollHeight > e.clientHeight), 'long source list scrolls');
      await sourcePanel.getByTitle('Inspect source').first().click();
      const sourceDialog = page.getByRole('dialog', { name: sources[0].filename, exact: true });
      await sourceDialog.waitFor(); await fits(sourceDialog, viewport, 'source detail');
      await page.keyboard.press('Escape'); await sourceDialog.waitFor({ state: 'hidden' });
      await page.getByTitle('Expand Studio', { exact: true }).click(); await settle(page);
      await fits(studio, viewport, 'studio'); await noHorizontalOverflow(studio, 'studio');
      const centerBox = await center.boundingBox();
      assert.ok(centerBox.width >= 560, `usable chat width with studio: ${centerBox.width}`);
      if (viewport.width < 1024) assert.ok((await sourcePanel.boundingBox()).x + 288 <= 1, 'opening studio dismisses sources');
      const note = studio.getByPlaceholder('Take a note', { exact: false });
      await note.fill('Responsive note at ' + viewport.width);
      await studio.getByRole('button', { name: 'Add Note', exact: true }).click();
      await studio.getByText('Responsive note at ' + viewport.width, { exact: true }).waitFor();
      await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-studio.png` });
      if (viewport.width === 1440) {
        await page.setViewportSize({ width: 820, height: 1180 }); await settle(page);
        await fits(studio, { width: 820, height: 1180 }, 'studio after resize to tablet');
        assert.equal(Math.round((await center.boundingBox()).width), 820);
        await studio.getByText('Responsive note at 1440', { exact: true }).waitFor();
        await page.setViewportSize(viewport); await settle(page);
        assert.equal(Math.round((await center.boundingBox()).width), 736);
      }
      await studio.getByRole('button', { name: 'Diagnostics', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Retrieval Diagnostic Inspector' });
      await dialog.waitFor(); await fits(dialog, viewport, 'diagnostics');
      await dialog.getByPlaceholder('Enter diagnostic query', { exact: false }).fill('gradient descent');
      await dialog.getByRole('button', { name: 'Run Diagnostic', exact: true }).click();
      await dialog.getByText('Candidate Chunks (12)', { exact: true }).waitFor();
      await noHorizontalOverflow(dialog, 'diagnostics');
      const resultScroll = dialog.locator('div[data-lenis-prevent]');
      assert.ok(await resultScroll.evaluate(e => e.scrollHeight > e.clientHeight), 'diagnostic results scroll');
      await page.screenshot({ path: `${output}/${viewport.width}x${viewport.height}-diagnostics.png` });
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
      if (viewport.width < 1280) {
        await page.mouse.click(330, viewport.height - 10); await settle(page);
        await studio.waitFor({ state: 'hidden' });
      } else {
        await page.getByTitle('Collapse Studio', { exact: true }).click(); await settle(page);
      }
      if (viewport.width < 1024) {
        await page.getByTitle('Expand Studio', { exact: true }).click(); await settle(page);
        await page.getByTitle('Toggle Sources').click(); await settle(page);
        await studio.waitFor({ state: 'hidden' }); await fits(sourcePanel, viewport, 'switch to sources');
        await page.mouse.click(viewport.width - 10, viewport.height - 10); await settle(page);
      }
      await fits(page.getByLabel('Send message', { exact: true }), viewport, 'send control after closing panels');
      await page.getByPlaceholder('Ask any question', { exact: true }).fill('A multiline draft\nthat stays editable');
      assert.deepEqual(errors, []);
      console.log(`PASS ${viewport.width}x${viewport.height}: restored chat, scroll, sources/detail, studio/note, diagnostics/results, drawer switching/backdrop, input; no runtime/console errors`);
      await context.close();
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

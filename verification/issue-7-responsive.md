# Desktop and tablet layout verification (#7)

The flow under test is: open a restored research chat → inspect sources → open Studio and add a note → run Diagnostics → close/switch panels → keep composing in chat.

## Layout corrections

Opening Studio at 1024 px previously reduced the center column to 320 px (320 px Sources + 384 px Studio). Studio now overlays the workspace below 1280 px, preserving 704 px of underlying chat width at 1024 px. At 1280 px and above, all three columns remain inline; the chat has at least 576 px. Sources remain inline from 1024 px, and opening either tablet drawer dismisses the other. Studio is capped to the viewport width.

## Repeatable check

Start the actual frontend with fixture-only public auth configuration (do not use a production account):

```sh
cd textbook-frontend
NEXT_PUBLIC_SUPABASE_URL=https://responsive.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=responsive-test-key \
npm run dev -- --webpack --hostname 127.0.0.1 --port 3027
```

Then from the repository root, use an existing Playwright installation and Chromium:

```sh
PLAYWRIGHT_MODULE=/opt/codex/runtimes/cua/lib/node_modules/playwright \
CHROMIUM_PATH=/usr/bin/chromium \
node verification/issue-7-responsive.cjs
```

`FRONTEND_URL` and `SCREENSHOT_DIR` can override the URL and screenshot directory (defaults: `http://127.0.0.1:3027`, `/tmp/issue-7-responsive`). When Playwright is available normally, omit `PLAYWRIGHT_MODULE`; omit `CHROMIUM_PATH` when using its bundled browser.

Browser plugin was not available; used Playwright with Chromium. The real page components run with mocked Supabase user/API responses, 20 ready sources, 12 saved messages and 12 diagnostic results. No test account, uploads, or production mutations are involved.

## Verified

- 768×1024, 820×1180, 1024×768, 1180×820, 1280×800, 1440×900.
- Page identity, meaningful authenticated content, no runtime overlay, no browser exceptions or console errors.
- Source drawer, independently scrolling source list and source detail dialog.
- Restored chat, independently scrolling history, visible composer/send control, multiline draft editing.
- Studio width, usable center width, note creation, tablet drawer switching and backdrop dismissal.
- Diagnostics opens from Studio, controls remain inside the viewport, populated results scroll without horizontal clipping, Escape closes the dialog.
- Live 1440 → 820 → 1440 resize with Studio open preserves the created note and changes the center width appropriately.
- Screenshots of Studio and populated Diagnostics at every viewport; inspected desktop and landscape tablet screenshots.
- `npx tsc --noEmit` passes. Focused ESLint has only pre-existing unused state setter warnings, handled separately by issue #8.

## Limits

Chromium only; mocked API/auth responses validate rendered layout rather than real Supabase login or backend behavior. Google Fonts downloads are blocked in this environment; the dev server uses its fallback font. The offline production font/build correction is tracked by issue #8. Mobile layout is outside this issue's acceptance scope.

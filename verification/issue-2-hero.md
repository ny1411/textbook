# Issue 2: Hero MeshGradient verification

Start the frontend with its usual Supabase public configuration:

```sh
cd textbook-frontend
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3022
```

Run the browser check from the repository root using an existing Playwright install:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core \
CHROMIUM_PATH=/absolute/path/to/chromium \
node verification/issue-2-hero.cjs
```

Omit the module/browser overrides when `playwright` and its browser are installed.
`FRONTEND_URL` overrides `http://127.0.0.1:3022`. Optionally set `SCREENSHOT_DIR` to
an absolute ignored directory to keep screenshots for visual review.

The checks cover desktop (1440 × 900), tablet (1024 × 768), reduced motion
(768 × 1024), unavailable WebGL and browser data-saving mode. They verify:

- A decorative backdrop behind the existing hero text and suggestions.
- Accessible chat input and unobstructed suggested-query buttons.
- A rendered animated WebGL canvas capped at 200,000 pixels.
- Removal of the canvas when reduced motion changes, and restoration afterward.
- A static CSS gradient with no shader canvas in fallback scenarios.
- A suggested query reaching `/api/chat`, and removal of the hero after chat starts.
- No horizontal page overflow or uncaught page errors.

Chat responses are mocked. The script enables Chromium's software WebGL rendering
for headless verification; production still requests a low-power context and keeps
the static backdrop when the browser rejects a major performance caveat. Screenshots
should also be reviewed for text contrast and responsive composition.

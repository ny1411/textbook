# Issue 21: Retrieval Inspector verification

Start the frontend using its usual Supabase public configuration:

```sh
cd textbook-frontend
npm ci
npm run dev -- --hostname 127.0.0.1 --port 3021
```

From the repository root, run the script with an existing Playwright installation:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core \
CHROMIUM_PATH=/absolute/path/to/chromium \
node verification/issue-21-retrieval-inspector.cjs
```

Alternatively, omit the module/browser overrides when `playwright` and its browser
are already installed. `FRONTEND_URL` overrides the default `http://127.0.0.1:3021`.
The script uses fresh browser contexts and intercepts only `/api/search`, so it
does not upload documents or call the search backend.

The browser checks run at desktop (1440 × 900) and mobile (390 × 844) sizes:

- Open from Header while Studio is closed, then from Studio Diagnostics.
- Keep one inspector instance with the same query/results across both entries.
- Submit trimmed query, Top K and Query Rewriting options to the existing API.
- Inspect three chunks with Stage 1 scores and Stage 2 percentages, including a
  missing reranker score.
- Close using the icon, Escape and backdrop; reopen with keyboard Enter.
- Fail on uncaught page errors.

These checks validate frontend interaction and rendering with controlled search
fixtures. They do not validate live retrieval, reranker quality or backend score
normalization.

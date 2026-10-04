# PDF to cited answer verification (#5)

`roundtrip.cjs` runs against the real Next.js → FastAPI → Supabase/PostgreSQL →
Qdrant → local BGE embeddings/cross-encoder → Gemini pipeline. It never mocks
routes, injects application stores, bypasses authentication, or substitutes
models. A unique real PDF and query on every run prevent a cached earlier answer
from satisfying the test.

## Run with real services

1. Install the backend's existing `requirements.txt`, apply the existing database
   migrations, and start FastAPI. Configure `DATABASE_URL`, `SUPABASE_URL`,
   `SUPABASE_SECRET_KEY`, `QDRANT_URL`, `QDRANT_API_KEY`, `GOOGLE_API_KEY`, and the
   existing Redis/telemetry variables documented in the backend README. Verify
   real PostgreSQL access, the documents bucket, Qdrant collection/index setup,
   and loading of `BAAI/bge-large-en-v1.5`, `Qdrant/bm25`, and
   `BAAI/bge-reranker-base`. Download access includes artifact hosts as well as
   HuggingFace itself. HTTP Supabase access does not establish PostgreSQL access.
2. Install frontend dependencies and start Next.js with `BACKEND_URL` pointing
   to that FastAPI server and the existing `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Example ports for an isolated run: backend
   `8025`, frontend `3025`.
3. Use a real signed-in test account and a dedicated notebook owned by it.
   Save Playwright browser `storageState` after signing in normally, outside the
   checkout (for example `npx playwright codegen --save-storage=/tmp/textbook-test-session.json http://127.0.0.1:3025`, then sign in and close the browser; set mode `0600`). Do not commit session
   state. The app's Supabase cookies must match the frontend origin.
4. Install Playwright/Chromium in the test runtime, then run:

   ```bash
   FRONTEND_URL=http://127.0.0.1:3025 \
   E2E_STORAGE_STATE=/tmp/textbook-test-session.json \
   E2E_NOTEBOOK_ID=<owned-test-notebook-uuid> \
   node verification/issue-5/roundtrip.cjs
   ```

   `PLAYWRIGHT_MODULE` can select an existing Playwright installation and
   `CHROMIUM_PATH` an installed Chromium executable. `E2E_OUTPUT_DIR` defaults
   to `/tmp/textbook-issue-5`. Use a dedicated notebook: the run creates a fresh
   saved conversation and a stored PDF/document/vector set. No automatic
   deletion is performed because the application currently has no deletion API;
   clean test data using your existing authorized maintenance procedure.

The run requires the upload's authenticated notebook scope, durable ingestion
status `ready`, both dense and sparse retrieval scores, positive RRF scores,
normalized cross-encoder scores, the expected 47-hour calibration fact rather
than the distractor's 19 hours, citation document/chunk provenance, valid inline
citation markers, and a saved turn. In the actual browser it checks the answer
fact, inline citation badge, and API-provided excerpt. It fails on browser errors.
Successful runs write a screenshot and a small stage report, never session state,
headers, raw responses, or network traces. Output may contain test-account UI;
keep it private until reviewed. Page-number accuracy is not asserted: the current
PDF ingestion path flattens pages before chunking.

## Verifier tests and prerequisites

```bash
node --test verification/issue-5/protocol.test.cjs
python verification/issue-5/preflight_test.py
python verification/issue-5/preflight.py
```

The Node tests use local HTTP protocol fixtures. They exercise score/provenance
rejection, ingestion polling/failure/timeouts, invalid JSON, and secret-safe
errors. They are **verifier tests**, not evidence of live model or UI success.
The standard-library Python preflight uses inherited proxy and TLS settings,
checks installed dependencies and the managed policy snapshot, and makes
read-only HTTP probes of Qdrant collections, Supabase Auth settings, and Storage
bucket reachability. It prints no credential values or provider bodies. A
preflight pass is not a full acceptance run. It exits nonzero on blocked/failed
prerequisites; unknown readiness remains explicitly unverified.

## Evidence from the managed environment (2026-10-04)

- 19 Node verifier tests and 4 Python diagnostic tests passed, including local HTTP fixtures. The generated
  one-page PDF was parsed by real PyMuPDF; the unique subject, 47-hour fact,
  12-degree threshold, and 19-hour distractor extracted successfully.
- Real HTTP probes: Qdrant `/collections`, Supabase `/auth/v1/settings`, and
  Supabase `/storage/v1/bucket` each returned HTTP 200. These establish only the
  described HTTP reachability; no live retrieval/generation claim follows.
- Live roundtrip blocked: the current Python runtime lacks required backend
  dependencies (including psycopg, Qdrant client, sentence-transformers and
  fastembed); managed PostgreSQL TCP grants are empty; HuggingFace is excluded
  by the enforced HTTP policy and no BGE model cache was found; no signed-in
  browser state or dedicated test notebook fixture was supplied.
- `roundtrip.cjs` fails safely at setup when those fixture variables are absent.
  No real PDF upload, live embeddings/search/rerank/generation, or authenticated
  UI citation rendering was completed in this environment.

The Phase 15.7 plan item remains unchecked and issue #5 remains open. Run the
live verifier in a ready environment and review its evidence before marking the
work complete.

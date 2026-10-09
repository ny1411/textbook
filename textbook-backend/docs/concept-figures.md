# Concept figures

Concept figures use Google's real Imagen `:predict` API. They are educational illustrations, not verified textbook evidence. No fallback generates placeholder or synthetic images when the provider fails. The backend uses the existing verified Supabase bearer-token dependency; notebook IDs and source document IDs never establish identity.

Set `GOOGLE_API_KEY`, optionally `GOOGLE_IMAGE_MODEL` (default `imagen-4.0-generate-001`), and the existing Supabase service credentials. Create **private** bucket `textbook-concept-figures`, or set `CONCEPT_IMAGE_BUCKET` to a private bucket. Public bucket configuration is rejected. Storage objects use `{verified-user-id}/{owned-notebook-id}/{figure-id}.png`; the API never returns a public or signed Storage URL. The Supabase SDK uses its finite Storage HTTP timeout (20 seconds by default); do not replace its HTTP transport with an unbounded client.

Apply `prisma/changes/issue-25-concept-figures.sql` once, in the intended schema, after the notebook/history and document-deletion changes. The application does not migrate at startup. This creates `concept_figures`, a separate durable `concept_figure_attempts` rate journal, owner/notebook constraints, byte/dimension/state/path checks, indexes, and RLS. Browser roles receive no direct table access. Do not run the fixture migration against production automatically.

`POST /api/image/generate` accepts JSON `{notebook_id, prompt, source?}`. The notebook and optional source document must belong to the authenticated user. Prompts contain 1–1200 characters. Optional `source` accepts `document_id`, `source_id` (bounded string or finite number), `page_number` (positive integer), and `excerpt` (at most 2400 characters). Unknown fields, NUL characters, and blank prompts/excerpts are rejected. Source documents must be completed, not deleting, and in the requested notebook; known page counts bound page selection.

Source labels identify citations within an answer. An excerpt enters the provider prompt only when a durable `message_sources` row, joined through an owned message/conversation/notebook, has the same document, citation label, compatible page, and exact excerpt prefix. Unmatched or fresh citation excerpts are ignored: the snapshot records `context_type: "document"`, rather than claiming verified quotation. Matched excerpts record `context_type: "saved_citation"`. The server supplies `document_name`, bounded to 200 characters. A JSON provenance snapshot survives source removal; saved figures remain listable, viewable, and editable after their source is deleted. Pending generation and first save revalidate current source ownership/readiness.

The response is a POST `text/event-stream` with named events:

```text
event: phase
data: {"phase":"analyzing"}

event: phase
data: {"phase":"synthesizing"}

event: phase
data: {"phase":"rendering"}

event: complete
data: {"figure":{"id":"…","notebook_id":"…","caption":"…","prompt":"…","media_type":"image/png","width":1024,"height":768,"model":"imagen-4.0-generate-001","created_at":"…","source":{"document_id":"…","document_name":"…","context_type":"saved_citation","source_id":1,"page_number":2,"excerpt":"…"}}}
```

`analyzing` covers ownership/source validation and reservation; `synthesizing` starts the actual provider call; `rendering` starts bounded decode, normalization and private storage. The phases do not use timers. `error` contains `{message, retryable}` with safe messages and no raw provider payloads. Quota, temporary provider, and timeout failures are retryable. Authentication and malformed request errors use ordinary 401/422 responses before streaming. A client may close its reader after `complete`; the completed pending image remains available for save or explicit disposal.

Remaining authenticated routes:

- `GET /api/image/figures?notebook_id=…`: returns `{figures: […]}`, only saved rows, at most 100.
- `GET /api/image/{id}?notebook_id=…`: returns owned private PNG bytes with `private, no-store`, `nosniff`, and inline disposition.
- `POST /api/image/{id}/save`: JSON `{notebook_id, caption}` (1–1200 characters) returns `{figure}` and makes the row durable. Repeated saves update the caption.
- `DELETE /api/image/{id}?notebook_id=…`: idempotently removes pending or saved metadata and bytes. `pending_only=true` is for automatic draft disposal: it atomically preserves already saved figures, including after a save response was lost. Explicit figure removal uses the default.

Provider requests produce exactly one image with no automatic retries, fixed Google endpoint, credential header, redirects disabled, a 90-second total deadline, and a 12 MiB response ceiling. Base64 and decoded bytes are bounded to 8 MiB. Pillow verifies and loads PNG/JPEG/WebP, rejects animation and sides over 2048 pixels, discards provider metadata, and emits one normalized PNG. Four provider requests may run per backend process; persistent per-account limits allow three attempts per ten minutes and twenty per day. Attempts survive draft deletion and failed requests. A workspace allows at most 100 figures, four pending figures, and 100 MiB; incomplete reservations count as 8 MiB. Deleting rows continue counting until external cleanup succeeds.

A pending row reserves its deterministic object path before external I/O and expires after 24 hours. A cancelled Storage operation is shielded and allowed to finish before marking/removing its row, so a late upload cannot recreate an object after cleanup. Remove calls also settle before cancellation completes. Durable `deleting` rows survive storage/SQL failures and retry. The startup cleanup loop sweeps at most 100 expired/deleting rows every five minutes, preserves saved figures, and prunes old rate attempts. Object-path checks and per-row SQL locks protect upload/remove races. No prompt, credential, provider response, or storage path is written to application logs by this feature.

Run the focused tests in a backend environment containing the normal dependencies and pytest:

```bash
python -m pytest tests/test_concept_images.py -q
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55426/postgres \
  python -m pytest tests/test_concept_images_sql.py -q
```

The SQL suite refuses nonlocal hosts, creates/drops a unique schema, applies the existing baseline/changes plus issue 25, runs actual auth/API/SQL, and replaces only external image generation and Storage. It does not use `DATABASE_URL`. For PGlite, copy `verification/issue-19/postgres.mjs`, change its port, install its local package dependencies, and run it as a disposable fixture. Use a separate PGlite process from browser fixtures: PGlite sockets share one SQL session and cannot isolate simultaneous suites.

Verification on 2026-10-09: 38 focused tests passed (24 provider/input/cancellation tests and 14 disposable SQL/API tests); Prisma 6.19 WASM schema validation passed. Google model discovery returned 200 and exposed 62 models, with no Imagen models listed. One bounded real `imagen-4.0-generate-001:predict` request returned 429 quota. Synthetic provider tests prove the request/response contract, but a successful live image remains unverified until the account's Imagen quota is available. No production migration or bucket creation was performed.

## Studio behavior and browser verification

Studio Notes includes a concept prompt; an owned document citation adds **Illustrate Concept**. Citations without a document reference show a hint and disable this action. A bounded citation prefix preserves complete Unicode symbols. The actual `@paper-design/shaders-react` Heatmap runs during generation. Its progress labels follow server phase events; they do not advance on a timer. The PNG crossfades after the browser decodes it, and the Heatmap pauses once the figure is ready. The SSE response includes `no-transform` so the Next.js proxy does not gzip-buffer small progress events.

Generated cards provide caption editing, a focus-managed full-screen lightbox, PNG download, PNG clipboard copy with an explicit unsupported-browser message, and **Save Figure to Studio Notes**. Closing, cancelling, clearing, changing a citation, or switching accounts/notebooks aborts the old work and disposes only pending figures. Automatic deletion uses `pending_only=true`, preserving a saved figure even when a save response was lost. Overlapping cancelled requests cannot dispose a newer request's result. An equivalent restored citation keeps its in-flight session; a changed passage or page invalidates it.

Saved figure notes load from the authenticated metadata API after reload. Image bytes are fetched privately into short-lived object URLs and released on replacement, unmount, or scope changes. Image bytes, base64, and blob URLs are never persisted in localStorage or text notes. Existing private text-note partitions remain intact. Saved captions have Read Aloud, source names/pages/context labels, and expandable verified citation passages.

Markdown and PDF exports include figure captions, durable figure IDs, model, dimensions, prompt, and source/provenance details. They **do not embed PNG bytes**; use each figure's Download PNG control separately. The Studio export UI states this limitation. Exporting captured notes survives unrelated draft typing; actual note, figure, or workspace changes invalidate an obsolete export.

Chromium verification on 2026-10-09 used the real homepage at `http://127.0.0.1:3125/`, the actual owned API/router/auth boundaries at `127.0.0.1:8195`, and disposable SQL on port 55425. The Browser plugin was unavailable, so installed Playwright and system Chromium were used. Only external Auth responses, Imagen transport, and private Storage were local fixtures; PNGs visibly say **LOCAL PROVIDER FIXTURE**. No test route or fixture provider is included in production source.

Desktop 1440 × 1050 and mobile 390 × 844 checks passed: Studio toggle; saved-chat citation → View Source → Illustrate Concept; provider-held real synthesis phase with a rendered Heatmap canvas; generated PNG controls; saved provenance; private note and figure restoration after reload; notebook/account isolation; real homepage sign-out; responsive full-screen lightbox; no blank page, framework overlay, horizontal overflow, relevant console error, or page error. Final saved screenshots waited for image and panel opacity to reach 1. A separate Studio control run verified PNG clipboard contents/download bytes, cancellation and stale-result cleanup, quota errors without substituted images, retry, and an equivalent citation selected again during synthesis. A PDF export with a held Devanagari-font fetch still downloaded after typing an unrelated unsaved note draft.

The final combined tree passed 43 frontend native tests, TypeScript, ESLint, production build/rewrite checks, and voice-text extraction. Feature tests passed 24 backend unit checks and 14 disposable SQL checks; the combined backend regression groups passed 131 checks, including the new image tests, tenant isolation, SSE, history/deletion/chat images, voice, citation, and intent behavior. SQL and browser fixtures use separate PGlite processes because its socket sessions cannot isolate simultaneous suites. Successful live Imagen quality remains unverified because the single real request returned quota 429.

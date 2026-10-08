# One-click sample textbook (#22)

An empty, authenticated notebook offers **Load Sample AI Engineering Textbook**
in the chat viewport, including on mobile. The bundled 7 KB UTF-8 primer is
original Textbook content dedicated to the public domain under CC0 1.0; its text
and license live in `samples/ai-engineering.txt` and `samples/LICENSE.txt`.
The repository's existing commercial PDF is not redistributed as a sample.

The sample covers RAG, chunking, dense/sparse retrieval, reciprocal rank fusion,
cross-encoder scores, retrieval evaluation, citation support, caching, ingestion
recovery and prompt injection. Once indexed, three relevant suggested questions
replace the generic prompts. Users can ask either chat pipeline, inspect a real
source citation, open it in Studio, save a quote as a note, and run diagnostic
search. Empty-chat scrolling stays at the top so the action remains discoverable.
Studio notes retain the existing localStorage behavior; this feature does not
change their account isolation or persistence contract.

## Deployment

Before deploying, apply the reviewed `prisma/changes/issue-22-sample-textbook.sql`
once in the intended schema, after the existing history/deletion/image upgrades.
Test it in staging and back up the database first. It adds nullable `sampleKey`
and a unique `(userId, notebookId, sampleKey)` index on `uploaded_documents`.
Ordinary uploads leave sampleKey NULL and remain unrestricted. New databases
should use a reviewed baseline from the full Prisma schema instead. Startup
never migrates.

The backend image already copies the complete backend directory, including the
sample and license. No remote sample URL or new credentials are needed. The
normal private `textbook-documents` bucket, embeddings, Qdrant, cache and model
configuration are used. Cold model loading still affects indexing time; the UI
reports indexing rather than claiming the document is ready immediately.

## API and recovery

`POST /api/documents/sample` accepts `{ "notebook_id": "<owned UUID>" }` and the
existing Supabase Bearer session. It returns `{ "source": <source document> }`
using the normal source-list fields plus `sampleKey: "ai-engineering-v1"`.
Status is `processing`, `ready`, or `failed`. A foreign notebook returns 404;
invalid UUIDs return 422 and invalid sessions return 401. The caller cannot choose
the document ID, owner, sample content or Storage path.

The server commits a durable metadata reservation before any provider writes.
A notebook/account/sample advisory lock and the database unique index prevent
concurrent requests from creating multiple samples. The first request reserves
one random document UUID and its exact owned `<user>/<document>.txt` path.
Subsequent requests reuse that row. The worker shares the existing document lock
with deletion, upserts bytes into the same path, removes vectors matching both
user_id and document_id with `wait=True`, and runs the existing parser, chunker,
embeddings, indexing and cache invalidation pipeline. Its completion status is
persisted in PostgreSQL. Completed reservations skip indexing altogether.

A lost HTTP/Storage response, partial ingestion, or a backend restart leaves the
same reservation available to retry. The next POST reruns incomplete indexing
and replaces partial vectors rather than appending duplicates. An interrupted
completion transaction can leave PROCESSING metadata; **Retry sample loading**
recovers that case too. There is no automatic durable ingestion queue in this
change. Multiple explicit retries can queue workers, but the document lock and
completed-row check prevent duplicate successful indexing. Provider errors are
reported through persistent FAILED status and a visible retry action.

Processing/failed samples are excluded from source selection and backend
retrieval until COMPLETED. Pending-deletion sources cannot be loaded or indexed;
finish removal first. After successful full-cycle deletion, a new sample load
creates a fresh identity and leaves the old deletion tombstone intact. Unexpected
or foreign Storage paths fail closed before writing bytes.

The UI disables the action during its request, shows indexing/failure/progress
errors, polls persistent status, and selects the sample when ready. Reloading
restores its reservation from the ordinary source list. Source upserts deduplicate
lost-response retries. Account/notebook changes remount the loader and abort its
requests/polling, while scoped result guards prevent late updates to the next
workspace. Polling network failures remain visible and retryable.

## Local verification

Use backend requirements plus pytest/httpx and the disposable SQL fixture from
`docs/chat-history.md`. The sample suite uses dedicated localhost port 55422;
run a PGlite socket server with the same configuration as
`verification/issue-19/postgres.mjs`, changing its port to 55422, then:

```sh
python -m pytest textbook-backend/tests/test_sample_textbook.py -q
```

The 13 regressions cover owned scope, stable replay, unique reservations, Storage
and Qdrant failures, partial vectors, completion failure/restart, full deletion
and reload, pending deletion, unsafe paths, both chat pipelines and diagnostic
search. A controlled independent-session fixture verifies the actual advisory
call for concurrent reservations; local PGlite itself serializes one connection.
A bounded test executes the real parser, parent-child chunker and ingestion
payload code with only embeddings/vector-provider seams. No model downloads or
production data writes occur. Existing history/deletion, container and relevance
regressions also pass, as do Prisma validation, Next type generation, TypeScript,
changed-file ESLint and the optimized frontend build.

Chromium/Playwright at `http://localhost:3122` passed the initial 390×844 mobile
viewport and 1440×1000 desktop. Checks covered one-click loading, ready selection,
suggested chat, citation inspection, Studio note creation, diagnostic results,
delete/reload, a committed load with a deliberately lost response and identical
retry ID, failed-ingestion retry, and a notebook switch while a result was held.
The Browser plugin was unavailable. Screenshots were saved outside the repo;
only the deliberately injected 503, existing logo warning and software-rendered
WebGL performance diagnostics appeared. These checks use synthetic providers
but real API ownership, SQL metadata and bundled sample excerpts. Live embeddings,
Qdrant, Supabase, Gemini output quality and native concurrent PostgreSQL sessions
still require staging verification before rollout.

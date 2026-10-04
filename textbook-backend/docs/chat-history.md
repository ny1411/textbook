# Authenticated notebook chat history (#19)

## Starting point

The audit used main `c12b753` and all accessible remote branches and Git
history. Supabase browser/SSR authentication and the Prisma relational models
already existed. Chat history lived in React state, and `conversation_id` was
only used for telemetry. Uploads did not write relational document metadata.
No accessible committed version contained the four WIP files named by #19
(`services/chat_history.py`, `services/conversation_titles.py`, `core/auth.py`,
`db/prisma_client.py`). Recent merges did not delete them. Uncommitted work in a
different workspace cannot be established from Git.

This implementation reuses the existing mapped Prisma tables. Runtime SQL uses
psycopg's async pool and bound parameters. It does not require a generated Prisma
Python client. Prisma remains the schema contract; the native engine download
was unavailable in the implementation environment, and Prisma's WASM validator
was used to check the model changes.

## Database deployment

Do this before deploying the new backend:

1. Inventory the target database and compare it with the pre-change Prisma
   schema. Do not assume the tables exist based on the repository model alone.
2. For an existing database matching that schema, take a backup, test the
   reviewed upgrade `prisma/changes/issue-19-history.sql` against a staging copy,
   and apply it once in the intended schema. It runs in one transaction and
   fails if already applied. It preserves existing messages and source rows.
3. For an empty database, create a reviewed baseline from the **full current**
   Prisma schema using the normal Prisma migration tooling. Do not apply the
   upgrade afterward: its columns/indexes already exist in that baseline.
   `verification/issue-19/baseline.sql` is only a test fixture subset, not a
   deployment baseline.
4. Verify a real Supabase login, upload, Fast reply, Agent reply, browser reload,
   source inspection, thread switching, and a second account in staging. Check
   a lost-response retry and simultaneous turns from two browser tabs.

Startup never creates tables or applies migrations. Missing tables and SQL
failures return a generic 503 without exposing SQL or connection credentials.
`/healthz` retains its existing Qdrant startup meaning; it is not a relational
schema readiness check. Use an authenticated `/api/notebooks` smoke request to
check database readiness after deployment.

The upgrade adds deterministic per-conversation message sequence numbers,
request IDs, response metadata, and a conversation version for optimistic
concurrency. Source rows use their own UUID and `(messageId, sourceId)` uniqueness,
so multiple passages from the same PDF can be saved. Legacy source rows never
stored their inline citation ordinal; they retain opaque document IDs instead
of inventing a `[Source N]` mapping. Legacy passages/pages/chunks remain available
in the source footer. Historical Agent metrics, scores and modes that were
never saved cannot be reconstructed.

## Configuration and ownership

Keep the existing Supabase Auth/Storage configuration and add the required
relational `DATABASE_URL` from the existing Supabase provisioning runbook.
The URL must explicitly request `sslmode=require` or `sslmode=verify-full`.
Runtime upgrades this to libpq `verify-full`, verifying the CA and hostname.
`sslaccept=strict` is accepted and translated; insecure or ambiguous settings
are rejected. `PGSSLROOTCERT` can supply a trusted provider CA file; otherwise
system CA trust is used. Do not disable certificate verification.

Prisma-only `schema`, `pgbouncer`, `connection_limit` and `pool_timeout` URL options
are removed before libpq connects. `schema` is quoted and applied with UTC **inside
every transaction**, including transaction-pooler connections. Prepared statements
are disabled for PgBouncer compatibility. Each process uses at most four async
connections, an eight-second connect/acquisition timeout, lazy initialization,
and shutdown cleanup. No transaction/connection is held during model inference.

Every protected request sends the existing Supabase access token as a Bearer
header. The backend verifies it through Supabase `auth.get_user(token)`; it does
not trust caller IDs or decode JWT claims as authentication. A supplied user ID
must equal the verified account. Account UUID and notebook ownership are checked
before upload, search, conversation reads/writes, and source/status reads. Document
selection is validated against that notebook's metadata. Foreign IDs produce
404/403 and never reach retrieval. These tables are accessed by the backend
service account: application ownership checks are mandatory, not replaced by
assumed RLS. Database/Storage policies and direct-client access need the broader
security review in #6.

`GET /api/notebooks` upserts the verified email-enabled profile and creates one
owned default notebook if none exists. A transaction-scoped advisory lock makes
first-login bootstrap safe across tabs. Existing notebooks are reused. The UI
lists owned notebooks, remembers only an owned selection, and reloads persisted
sources before enabling chat. Unauthenticated users receive a sign-in prompt.

Uploads store `uploaded_documents` metadata before returning, using the same
UUID as Qdrant ingestion and status polling. Background ingestion updates its
persistent status to COMPLETED/FAILED. Metadata failure removes only the newly
uploaded Storage object. An abrupt backend shutdown can still leave PROCESSING
metadata; durable ingestion recovery is separate deployment/worker work. Old
Storage/Qdrant-only uploads have no relational ownership record and are not
automatically imported: use a reviewed backfill or reupload them.

## API and retry behavior

- `GET /api/notebooks`: owned notebook list/profile bootstrap.
- `GET /api/documents?notebook_id=<uuid>&limit=100&offset=0`: paginated owned sources.
- `GET /api/documents/<uuid>/status`: persistent owned status.
- `POST /api/conversations`: `{ "notebook_id": "<uuid>", "id": "<optional uuid>" }`.
  A caller-generated ID makes creation replayable without taking over another
  owner's conversation.
- `GET /api/conversations?notebook_id=<uuid>&limit=50&offset=0`: most recently
  updated owned threads and `next_offset`.
- `GET /api/conversations/<uuid>/messages?limit=100&before=<sequence>`: latest
  messages in chronological order, complete saved response metadata and
  `next_before` for loading older messages.
- `POST /api/chat` and `POST /api/agent/chat`: existing payload plus a **required
  owned `conversation_id`** and a stable UUID `request_id` for retries. The server
  supplies a request ID if omitted, but callers must retain one to recover a
  lost response. Notebook omission derives it from the owned conversation.

Both pipelines use the last 20 persisted user/assistant messages as canonical
history. Caller-supplied history cannot replace it. A completed reply is saved
atomically with its user question, exact citation labels/excerpts/pages/chunks/
scores, rewritten query, intent, warning, pipeline mode, Agent metrics and
conversation-document links. Cache hits and conversational/fallback/ingestion
responses go through the same save path. Generation exceptions save no turn.
The title comes from the first completed question, without another model call.

Each response includes conversation/title/request/user-message/assistant-message
IDs. Same-request retries return the committed response and original IDs without
duplicate messages. Reusing an ID for a different query/mode/selection returns
409. A short version compare-and-swap after generation rejects a distinct stale
turn with 409 instead of committing a reply against obsolete context. The UI
refreshes persisted messages on that conflict, retains the pending question, and
allows a retry against current canonical history. Retry freezes the original
request ID, conversation ID, mode and source selection, including while source
checkboxes change. Failed history hydration disables sending until explicit
recovery. A pending failure must be retried or explicitly left by switching or
starting a chat.

Chat state is keyed by account/notebook, and in-flight requests are aborted on
scope changes. Late source poll/upload/history/reply results cannot update the
next account's chat or sources. Citations and source inspection are scoped/reset
on transitions. **Studio notes remain legacy localStorage state and are not
partitioned by this change; #6 still needs to isolate those notes and audit
all other persisted UI state.** Full-cycle deletion (#18), sample loader (#22),
SSE (#17), and image attachment history (#20) must integrate with the new auth,
metadata and conversation contracts sequentially after this PR merges.

## Local verification

Install the backend requirements plus pytest/httpx, and install Node's test-only
dependencies with `npm install --prefix verification/issue-19`. Start
`node verification/issue-19/postgres.mjs` in another terminal, then run:

```sh
python -m pytest textbook-backend/tests/test_chat_history.py textbook-backend/tests/test_intent_routing.py textbook-backend/tests/test_container.py textbook-backend/tests/test_relevance.py -q
```

The tests use actual SQL, constraints, transactions and psycopg wire-protocol
calls against disposable PostgreSQL compiled to WebAssembly (PGlite). Each test
creates/drops only its own random schema on fixed localhost port 55419. No
production URL, real credentials or external service is used. The fixture
baseline preserves Prisma's NOT NULL/@updatedAt constraints. Tests cover the
legacy upgrade, multiple passages per PDF, exact response restoration, Agent
metadata, cache/casual/fallback paths, canonical history, request replay,
transaction rollback, stale-version rejection, tenant/notebook rejection,
pagination, and transaction-local schema/timezone settings. Existing intent
regressions execute the actual routing functions and LangGraph nodes with
external retrieval/model/provider calls isolated.

For a local browser check, stop the pytest run and start
`python textbook-backend/tests/history_fixture.py` on port 8199. Point a frontend
preview at it using `BACKEND_URL` and synthetic public Supabase configuration.
This **test-only** app fakes Auth/Storage/ML/Redis/telemetry but runs the real API
models, ownership dependencies and SQL persistence. Its `/fixture/notebooks`
endpoint is not mounted by the production app.

PGlite serializes a single internal database connection. Its test socket server
allows a closing prior socket while the next sequential test connects. Do not
run the browser fixture and SQL suite together, use xdist, or treat these tests
as native multi-session concurrency, provider TLS, real OAuth, real model,
Supabase production or deployment acceptance. Those staging checks remain
required before rollout.

The frontend passed TypeScript, lint for changed files, and an optimized Next
webpack build. Browser checks covered unauthenticated entry, upload/reload,
Fast/Agent replies, exact citation/metric restoration, thread/notebook switching,
remembered owned notebook, lost creation/reply recovery, unchanged retry scope,
failed hydration recovery, retained pending questions after a cross-tab conflict,
both pagination controls, and account changes during delayed replies. The built
app also restored a saved Agent thread at desktop/tablet/mobile sizes without
page or console errors. Deliberately injected network failures/409s produced only
their expected browser console errors during the recovery tests. Previews/builds
used synthetic public configuration and Next's supported local font fixture;
production font/provider networking was not tested. Existing middleware
deprecation/Edge-build and development logo warnings remain.

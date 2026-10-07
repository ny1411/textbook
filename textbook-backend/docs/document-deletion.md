# Full-cycle source deletion (#18)

`DELETE /api/documents?document_id=<uuid>&notebook_id=<uuid>` uses the verified
Supabase Bearer session, never a caller-supplied owner or storage path. Both the
notebook and source must belong to that account and notebook. Foreign, wrong
notebook and unknown IDs return 404 before reaching an external store; malformed
IDs return 422. The response is `{ "document_id": "…", "notebook_id": "…",
"deleted": true }`. Repeating a completed owned deletion returns that same 200.

The source sidebar calls this API and removes local state only after success.
While deletion runs, its button and checkbox are disabled. Failed cleanup leaves
the card available to retry, with an inline error and a pending-deletion label.
Reloading also restores pending cards from PostgreSQL. Late polling responses
cannot select a pending source, and late deletion responses cannot change a
different account/notebook. Processing and failed sources can be removed too.

## Install the schema before deploying

For an existing database matching the current Prisma schema, back up and test
`prisma/changes/issue-18-document-deletion.sql` in staging, then apply it once in
the intended schema after `issue-19-history.sql`. Startup never migrates. For a
new database, use a reviewed baseline generated from the full Prisma schema;
the test baseline is not a deployment baseline. Ensure the backend database
role can read/write the new table: it is backend-only, has RLS enabled with no
browser policies, and revokes access from PUBLIC and existing Supabase anon and
authenticated roles. The migration does not change existing document/citation
foreign keys, which already cascade on document removal.

## Recovery across stores

There is no shared transaction across PostgreSQL, Supabase, Qdrant and Redis.
The endpoint implements durable, retryable cleanup:

1. An advisory lock shared with background ingestion protects the document.
   Ownership and the server-stored relative Storage path are checked, then a
   `document_deletions` intent commits with its owner/notebook/path. Paths must
   remain under the current account directory with no dot/empty path segments.
2. Under the same document lock, remove the bytes from `textbook-documents`,
   delete Qdrant `textbook_chunks` points matching **both** document_id and
   user_id with `wait=True`, invalidate that user's semantic-cache keys, and
   clear its Redis ingestion status. Missing bytes/points are idempotent success;
   absent Redis configuration requires no cache/status operation.
3. Only after all cleanup acknowledges, delete the scoped `uploaded_documents`
   row and commit its completed tombstone together. Existing database cascades
   remove `message_sources` and `conversation_documents`. Historical chat
   messages and saved response excerpts remain historical conversation content.
   Completed tombstones retain only the IDs/timestamps, clearing the Storage path.

A provider/cache/database failure returns 503 with `Retry-After: 2` and a generic
retry message. The intent and document metadata survive; subsequent retries use
the persisted path and repeat idempotent cleanup. Pending sources remain listed
as failed with `deletionPending: true`, while status reads return
`deletion_pending: true`. They are excluded from default retrieval selection;
explicit selection returns 404 and late answer persistence rejects their
citations. This prevents new answers using partially removed data. A restarted
backend can finish cleanup through the same DELETE request. There is no automatic
cleanup worker: retry pending cards or replay their owned IDs operationally.

The advisory lock also prevents an active ingestion writer or a simultaneous
deletion retry from recreating vectors after cleanup. Unlike chat generation,
ingestion/deletion hold a database transaction/connection while their external
work runs. A deletion can therefore wait for an ongoing ingestion; a lost HTTP
response is recoverable by retry. Use the existing bounded pool and provider
timeouts, and verify this latency against deployment/proxy limits in staging.

## Verification

Start the disposable local SQL fixture described in `docs/chat-history.md`, then:

```sh
python -m pytest textbook-backend/tests/test_document_deletion.py textbook-backend/tests/test_chat_history.py -q
python -m pytest textbook-backend/tests/test_cache.py -q
```

The 32 deletion/history checks use real SQL constraints, transaction rollback and
FK cascades against local PGlite, with synthetic Auth/Storage/Qdrant/cache only.
They cover owner/notebook rejection, completed replay, missing objects, unsafe
paths, failure at Storage/Qdrant/cache/SQL stages (including rollback after row deletion), restart recovery, pending-source
listing/selection, and background-worker suppression. Three controlled independent
session tests exercise the actual advisory-lock calls with a deterministic lock
fixture: ingestion before deletion, deletion before ingestion, concurrent deletes.
PGlite's serial connection cannot itself establish native PostgreSQL concurrency.
The 20 cache tests include strict invalidation errors and tenant isolation.

Frontend Next type generation, TypeScript and changed-file ESLint passed. The
Prisma schema passed its matching WASM validator. Local Chromium/Playwright at
`http://localhost:3119` covered upload → remove → reload, successful deletion with
a deliberately lost response → pending disabled selection → retry → reload,
and the mobile source drawer at 390×844 (desktop 1440×1000). The Browser plugin
was unavailable. The browser used the real API and disposable SQL fixture; all
external stores/auth were synthetic. Expected injected 503 logging and the
existing development logo and software-rendered WebGL performance warnings
were the only browser diagnostics. Production
providers, native concurrent sessions, RLS under real Supabase roles, deployment
latency and proxy behavior still require staging verification before rollout.

# Conversation and chat history

Each notebook owns multiple threads. The backend stores each user question and assistant answer
as a separate `conversation_messages` row, with citation snapshots in `message_sources`.
Only active thread IDs are stored in browser storage; message content comes from PostgreSQL.

Both `/api/chat` and `/api/agent/chat` require a Supabase access token and UUID
`notebook_id`, `conversation_id`, and `request_id` fields. The backend derives the owner
from the verified access token and loads recent completed turns from the database.
Client-supplied `user_id` and `history` are not used as authority.

## Database setup

Activate the backend virtual environment before running Prisma commands. Configure `DATABASE_URL`
for runtime connections. For migrations, use a direct connection or the Supabase session pooler
on port 5432, rather than the transaction pooler on port 6543.
Runtime connections to the Supabase transaction pooler automatically use Prisma's `pgbouncer=true`
option without changing the environment file. Missing application tables return a storage-unavailable
response, while the message input remains editable and preserves its draft during initialization.

For an empty application database:

```powershell
python -m prisma migrate deploy
python -m prisma generate
```

For a database that already has the original application schema, review its schema against
`prisma/migrations/20261001000000_initial_schema/migration.sql` first. If it matches, baseline it:

```powershell
python -m prisma migrate resolve --applied 20261001000000_initial_schema
python -m prisma migrate deploy
python -m prisma generate
```

The history migration backfills message order, request IDs, and citation snapshots without
discarding existing rows. Original citation numbers were not stored by the legacy schema;
legacy sources receive stable sequential numbers. New answers retain their exact displayed IDs.
Existing thread titles are treated as manually assigned.

The migration enables RLS and revokes `anon`/`authenticated` Data API access to application tables.
All reads and writes go through the authenticated FastAPI backend. Its database role must have
the privileges needed by Prisma; ownership checks are mandatory because a privileged database
connection can bypass RLS. Browser clients never receive the secret database or Supabase keys.

## Behavior

- The default notebook is created idempotently for each signed-in user. Existing owned notebook IDs
  continue to work; another user's persisted notebook ID falls back to the user's default.
- Threads support create, list, rename, delete, and cursor-paginated message history.
- A separate background LLM invocation names a thread after a saved exchange. An immediate
  question-based title is the fallback. A user rename always wins over delayed model output.
- Assistant rows retain answer text, applied query, intent, grounding status, warning, agent mode,
  confidence, critique, and iteration count. Both normal and cached answers follow the same save path.
- Each source has its own row with its displayed source ID, order, page, excerpt, chunk, document-name
  snapshot, and relevance score. Deleting a document nulls the live relation while retaining the snapshot.
  Deleting a thread explicitly cascades its messages and citations.
- Request IDs deduplicate a submitted turn. Concurrent submissions to a thread return 409 while a
  generation is active. A failed or disconnected latest turn can be retried with the same request ID.
  Expired attempts can be reclaimed after ten minutes; fencing prevents older attempts from overwriting
  a newer answer. Earlier failed turns cannot be retried after subsequent turns establish new context.
- Full history remains stored, while model context is limited to 20 completed messages with at most
  8,000 characters per message. Failed and pending answers are excluded from model context.
- New uploads persist notebook-scoped document metadata so citations can retain document names and
  live relations. The separate full-cycle document deletion feature in `PLAN.md` remains future work.

## Verification

Use a disposable, migrated PostgreSQL database for integration tests:

```powershell
$env:TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55439/postgres'
python -m pytest tests/test_chat_history.py tests/test_intent_routing.py tests/test_document_scoping.py -q
```

The history suite creates test users and removes their data afterward. It verifies citation retention,
metadata restoration, concurrency, retries, ownership, pagination, deletion, and title/rename races.
Without `TEST_DATABASE_URL`, the integration tests are skipped.

Frontend checks:

```powershell
npx tsc --noEmit
npm run build
```

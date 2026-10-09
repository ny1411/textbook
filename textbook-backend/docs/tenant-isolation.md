# Tenant isolation

Backend identity comes from the verified Supabase access token. A supplied
`userId`/`user_id` must match that identity; notebook, conversation, document and
image ownership are checked before retrieval, generation, Storage or mutations.
Qdrant filters and cache namespaces retain the same authenticated account and
notebook scope. Empty document selections do not broaden retrieval.

## Browser workspaces

Studio notes are stored separately for each account and notebook. Signing out
clears visible notes, citations, sources and diagnostics; signing back in restores
only that account's selected notebook. Identity and visible notes are not restored
from localStorage before authentication. Delayed notebook/source responses and
storage hydration cannot replace a newer workspace or resurrect deleted notes.

Studio and Diagnostics remount when the account or notebook changes, clearing
unsaved note/diagnostic drafts and old results. Diagnostics cancels pending
requests and sends the selected document UUID rather than its Storage path.

Notes remain browser-local; this change does not add server note synchronization
or database migrations. Browser-local storage is not an authorization boundary
against someone with direct access to the browser profile.

### Existing notes

The old storage format used one global note array, so the last logged-in account
or selected notebook does not reliably identify its owner. Storage version 1
preserves that array in `state.legacyNotes` under `textbook-notebook-storage`, but
does not display or automatically assign it to an authenticated workspace. Back
up that storage entry before manual recovery. After confirming which notes belong
to you, copy them into the appropriate signed-in notebook. There is no automatic
legacy-note import UI in this change.

## Verification

Install the frontend and disposable database fixture dependencies, then start
the local PostgreSQL-compatible server:

```sh
cd verification/issue-19
npm ci
node postgres.mjs
```

In a separate terminal, run backend isolation and related regressions serially:

```sh
cd textbook-backend
python -m pytest -q tests/test_tenant_isolation.py
python -m pytest -q tests/test_chat_history.py tests/test_document_deletion.py tests/test_image_chat.py tests/test_voice_sql.py
```

The isolation suite uses real FastAPI routes, disposable PGlite SQL, native
Qdrant in-memory dense/sparse filtering, actual LangGraph nodes and cache-key /
invalidation code. Synthetic Auth, Storage, embeddings, reranking, LLM, Redis
transport and speech seams keep it separate from production data. It verifies
missing/forged authentication, cross-account and cross-notebook rejection before
side effects, owned retrieval/chat/history/sample/voice flows, and cleanup that
leaves another account's bytes, vectors, cache and saved citations intact.

Frontend regressions use Node 22.18+ native TypeScript support:

```sh
cd textbook-frontend
node --test tests/tenant-isolation.test.mjs
npm run lint -- --max-warnings=0
npm run build
```

Rendered Chromium verification used the real local API/SQL and Next application
at 1440×900 and 390×844: create notes, switch between two owned notebooks, select
a diagnostic source UUID, clear drafts/results on switching, sign out, sign in
as a different account, and restore the original account's own notes after a
reload. Page identity, content, framework overlay, console and screenshots were
checked. The Browser plugin was unavailable, so regular Playwright was used.

Live provider behavior, native PostgreSQL concurrency/RLS and other browsers
remain staging checks. These local results do not claim production verification.

# Streaming chat

Both `POST /api/chat` and `POST /api/agent/chat` accept the existing authenticated
chat request body. Add `Accept: text/event-stream` for SSE; other clients continue
to receive the existing JSON response. Authentication, conversation/source/image
ownership and request-ID conflicts are checked before the stream opens, retaining
the usual HTTP error statuses.

The frontend uses authenticated `fetch`, rather than `EventSource`, because these
are POST requests. The stream has these named events, each with JSON `data`:

| Event | Data | Meaning |
| --- | --- | --- |
| `status` | `{ "stage": "accepted" }` (and subsequent stage names) | Progress, not answer text. |
| `citations` | `{ "citations": [...], "intent": "textbook_rag", "is_grounded": true, "warning": null }` | Source metadata available before tokens. Agent grounding remains `null` until final reflection; image and general answers keep their existing warnings. |
| `token` | `{ "delta": "new provider text" }` | Append actual provider chunks, without synthetic slicing or typing delays. |
| `done` | Complete persisted `ChatResponse` / `AgentChatResponse` | Authoritative answer, citations, metadata, request ID and saved message IDs. |
| `error` | `{ "message": "…", "status": 500 }` | Terminal failure. Discard the partial assistant response and retain the same request ID for retry. |

After ownership checks, `accepted` flushes before history loading, image storage
downloads/observation, query analysis, retrieval or cold reranking. During idle
work the server sends `: heartbeat` comments every ten seconds. Both response
headers (`Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`) and the
existing Next rewrite preserve streaming; heartbeats keep the proxy's idle socket
timeout from expiring. The initial bytes report progress, because a supported
answer cannot always start within two seconds of cold retrieval.

Grounded agent drafts and reflection retries stay private. Once the existing
graph selects its final evidence, the server streams one final composition and
reflects that exact visible answer once before saving it. There is no regeneration
after visible tokens. This adds one generation and one reflection to grounded/image
agent requests. An agent fallback after empty retrieval also composes a final
streamed answer after its private graph attempts. Direct casual/general-knowledge
intent routes stream without graph drafts. A final reflection
error emits `error` and saves no turn. The final grounding grade can still be
false; it describes the same answer that was streamed and persisted.

Completed cache hits, ingestion notices and request-ID replays send their existing
answer once, rather than pretending cached text is arriving from a provider. `done`
is emitted only after the existing atomic turn-save transaction succeeds. Image
attachment fingerprints, saved observations and exact-request replay are preserved.

Stopping a response aborts its fetch and removes partial optimistic messages. The
frontend refreshes saved history before unlocking the composer. If the request
committed just before the abort, its canonical saved messages replace the partial
pair and the composer clears the consumed question and images. If it did not save,
the composer retains the editable question and images, and an unchanged resend
reuses the original request ID. Disconnects cancel the async persistence task and close provider iterators cooperatively at
the next chunk/boundary. A currently blocked synchronous provider SDK/network call cannot
be interrupted by Python thread cancellation and remains subject to the existing
provider timeout (90 seconds); it cannot subsequently save a partial turn.

## Checks

The backend suite exercises actual SQL, routes, generation functions and LangGraph
with synthetic auth/storage/retrieval/provider seams. It verifies arriving token
chunks, rejected drafts, final reflection failure, citation order, persisted/JSON
replay, images, early network progress, idle heartbeats and disconnect rollback.
Start the disposable SQL server used by the history tests, then run:

```sh
python -m pytest -q textbook-backend/tests/test_chat_stream.py
cd textbook-frontend
npm run test:stream
```

`STREAM_TEST_SQL_PORT` selects a separate disposable SQL port when other suites run
in parallel. Frontend parser tests cover split UTF-8, SSE framing, CRLF, errors,
missing completion, cancellation, and canonical saved IDs. Rendered validation uses
the real Next proxy and browser with a local API and disposable SQL; remote
Gemini, Supabase, Qdrant, Redis and telemetry services are not exercised by these
local tests.


### Local acceptance recorded 2026-10-08

With the actual Next.js 16.3 rewrite and its unchanged 120-second proxy timeout,
synthetic retrieval was delayed for 121 seconds in each mode. Progress, idle
heartbeats, provider-fixture chunks and canonical SQL persistence passed:

| Route | First progress | Total duration | Ten-second heartbeats | Token events |
| --- | ---: | ---: | ---: | ---: |
| `/api/chat` | 0.014 s | 121.111 s | 12 | 4 |
| `/api/agent/chat` | 0.014 s | 121.118 s | 12 | 4 |

Both completed payloads exactly matched their saved SQL history. Browser checks
at 1440×900 and 390×844 verified incremental answers/citations, private agent
attempts, persisted reload, interrupted completion replay, provider error retry,
notebook switching and visible Stop controls. The image cancellation checks held
the first provider chunk for an uncommitted Stop, and separately delayed `done`
after the real SQL commit: the former retained editable text/images and the
original request ID; the latter restored one saved pair, cleared consumed composer
text/images, and sent the next question with a fresh ID and no used attachments.
Authentication/ownership failures retained HTTP 401/403/404 JSON responses before
SSE opened. The final browser sequence reported no app/runtime/console errors.

The Browser plugin was unavailable; Playwright used system Chromium. Next ran
with webpack because the verification workspace shares dependencies through a
symlink outside the worktree, which Turbopack rejects. The long-request evidence
verifies the real HTTP transport and proxy, with synthetic remote-service seams;
it does not measure real model cold-start performance or validate a live provider.

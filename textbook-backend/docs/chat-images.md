# Private image chat (#20)

Both `/api/chat` and `/api/agent/chat` accept `attachment_ids` (an ordered list
of up to four UUIDs). A message requires text, images, or both. `query` can be
empty for image-only messages. Existing text requests and their saved retry
fingerprints keep their prior behavior.

## Deployment

Apply `prisma/changes/issue-20-chat-images.sql` once after the history schema
upgrade, in the intended schema, before deploying. For an empty database,
generate the full baseline from the current Prisma schema instead. Startup
does not migrate. The SQL enables RLS on image metadata and revokes direct
browser-role table access; runtime uses backend/service credentials and checks
owned user, notebook and conversation for every image operation.

Create a **private** Supabase Storage bucket named `textbook-chat-images`, or
set `CHAT_IMAGE_BUCKET` to another private bucket. Never use the public PDF
bucket. No public Storage or expiring signed URLs are returned or persisted.
The backend reads bucket metadata before every upload/download and rejects
public or unverifiable buckets. Keep bucket creation/administration restricted
to operators. Direct browser Storage access must be disabled; image display
uses the authenticated backend content endpoint. Set the bucket limit to
10 MiB and accepted MIME types to `image/png`, `image/jpeg`, `image/webp` as an
additional provider-side limit. Configure `VISION_MODEL` for a Gemini model
with image support (default matches the existing `gemini-3.6-flash` model).

## Upload, send, display and retry

1. Create an owned conversation using the existing conversation endpoint.
2. `POST /api/chat/attachments` with Bearer authorization and multipart
   `conversation_id`, a stable UUID `upload_id`, and `file`. It returns 201 with
   `{id,name,media_type,size,url,created_at}`. `id` equals `upload_id`. Uploading
   again with the same ID and identical bytes/name/type returns the same receipt;
   reusing the ID for different content returns 409. A retry can recover a
   provider upload whose response was lost.
3. Send the existing chat payload with `attachment_ids` and a stable `request_id`.
   Same-request retries return the original saved reply, messages and attachments.
   Image order participates in the fingerprint. Changed image IDs/order, text,
   source selection or pipeline with a reused request ID returns 409.
4. Fetch `url` using Bearer authorization and display a local object URL. Content
   is private/no-store and is available only to the owner. Names are never used
   as Storage paths. The response and user-message history expose attachment
   metadata; the saved user metadata also retains visual observations.
5. `DELETE /api/chat/attachments/<id>` removes an abandoned upload. Repeating
   the deletion is harmless. A saved message attachment returns 409. Cancelled
   uploads whose completion arrives late are still bounded by the cleanup TTL.

JPEG, PNG and WebP must pass file-content MIME validation, structural decoding
and complete pixel decoding. Animated images, malformed files, mismatched MIME,
and unsupported formats return 415. Byte limits are 10 MiB/image; dimensions
are at most 40 million pixels and 8192 pixels per side. Large bodies are read
with a bounded limit after multipart parsing; configure a reverse-proxy request
body limit as well, since framework multipart spooling precedes route handling.

Uploads reserve a durable DB record and deterministic private Storage path
before network I/O. A short image-row lock serializes uploads, retries and
cleanup. Successful sends attach all image rows atomically to the saved user
message together with its answer and citations. A model failure or stale
conversation completion saves no partial turn and leaves the pending images
available for retry. Attached images cannot be reused by a distinct chat send;
text follow-ups automatically reload the latest saved image turn instead.

## Vision and provenance

Images reach the Gemini model as actual `image_url` data blocks for observation,
final answering and Agent reflection. A structured visual pass produces a
standalone retrieval question from text, image content and canonical history.
Images are available in both pipelines with or without matching textbook
chunks. File names and client-supplied history are not visual evidence.

Prompts label image observations `[Image N]` and textbook evidence `[Source N]`.
Only owned retrieved textbook chunks create citation metadata. Mixed visual
answers report `is_grounded=false` and a warning that distinguishes these kinds
of evidence. Image-only sends get a useful title. Canonical history contains
saved visual observations, and a text follow-up reloads the actual bytes from
the latest image turn, preserving its image order rather than relying only on
an initial summary. Greetings keep the ordinary text conversational path.

## Cleanup and checks

Unsent/uploading images expire after 24 hours. Each backend process sweeps up
to 100 expired records every five minutes while running. Cleanup first claims
rows as deleting; failed Storage deletion leaves a durable row for retry. It
never deletes attached message images. `python scripts/cleanup_chat_images.py`
runs one bounded pass and can be scheduled for deployments that scale to zero.
Run additional passes to drain a backlog. Do not delete notebooks/conversations/
accounts by cascading database rows without first deleting their private Storage
objects; those broader deletion flows must preserve an object cleanup manifest.

The tests run real SQL/ownership/idempotency/persistence against the existing
local PGlite fixture while Auth, Storage and model responses are synthetic.
`tests/test_images_unit.py` checks actual multimodal byte blocks and provenance
prompts. `tests/test_image_chat.py` exercises both chat routes, image-only/text
turns, retry failures, history, tenant isolation and cleanup. Test the real
private bucket, model quota/support, token refresh and provider connectivity in
staging before rollout; local fixture success is not live provider acceptance.

Verified on the implementation branch: 36 image/history API+SQL tests, eight
image unit tests and 26 existing intent/relevance/container tests passed;
Prisma's matching WASM schema validator and Python compilation passed. Run the
SQL suite sequentially while the existing PGlite server listens on localhost
55419, and stop any browser fixture using that database first:

```sh
python -m pytest textbook-backend/tests/test_image_chat.py textbook-backend/tests/test_chat_history.py -q
python -m pytest textbook-backend/tests/test_images_unit.py -q
python -m pytest textbook-backend/tests/test_intent_routing.py textbook-backend/tests/test_relevance.py textbook-backend/tests/test_container.py -q
```

Frontend lint, TypeScript and optimized production build passed. Browser checks
used the real API/SQL fixture and actual Next middleware/proxy for native paste
with “Explain this”, private image display, reload restoring the same image ID,
visual follow-up, and an Agent image-only message. A valid PNG of exactly
10 MiB uploaded successfully through the proxy and persisted its exact byte
size. Additional browser checks covered multiple images, removal, picker/drop,
validation and upload/send recovery at desktop/mobile sizes. No relevant UI
console errors occurred in the successful integrated flow. The configured live
Gemini vision call with a synthetic equation image was attempted but failed
with a provider rate-limit error; real vision output and private Supabase
Storage acceptance remain staging checks.

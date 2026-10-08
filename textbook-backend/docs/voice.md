# Voice recording and read aloud (#24)

Voice input uses browser `MediaRecorder` for microphone capture and the Web
Speech API for transcription. Its recording timer and waveform use the actual
microphone stream. Browsers without speech recognition show an unavailable
state; denying microphone access leaves text chat usable. Browser recognition
may use the browser vendor's speech service. This change does not upload or
persist microphone recordings in backend Storage or add a Whisper endpoint.

Read aloud for assistant messages and Studio summaries uses authenticated
`POST /api/voice/synthesize` with `{ "notebook_id": "<owned uuid>", "text":
"<passage>" }`. It returns genuine `audio/wav` bytes. The player creates an
ephemeral browser blob URL, reads real audio duration/current position, and
supports pause, 1/1.25/1.5/2 playback rates and actual seeking. Long passages
are split into visible parts of at most 4000 characters and synthesized one
part at a time. This avoids truncation and does not pretend Web Speech
utterances have a seekable audio asset.

## Provider and deployment

The endpoint reuses the backend's existing **Google Gemini** credentials and
allowed host, using its native AUDIO response modality. It requires
`GOOGLE_API_KEY` and permission/quota for `gemini-2.5-flash-preview-tts`.
`VOICE_TTS_MODEL` can select another compatible Gemini native speech model;
`VOICE_TTS_VOICE` can select a supported prebuilt voice (default `Kore`).
No new database migration, Storage bucket, public URL or browser API key is
needed. Model and voice values come from operator configuration; clients cannot
choose a provider endpoint, model or secret. Existing verified proxy and CA
settings remain in effect. Gemini native speech is used because this app
already uses Google; the implementation does not require an unconfigured
OpenAI/ElevenLabs account or silently contact Edge TTS.

The provider generates the passage before returning a completed WAV asset.
It is not token-by-token audio streaming. Native Gemini single-speaker output
is signed 16-bit little-endian mono PCM; the backend validates the AUDIO
modality, MIME codec, sample rate, channel count, frame alignment and byte/
duration limits before writing a matching WAV header. Text/image responses,
incomplete answers, malformed base64 and mismatched PCM layouts fail cleanly.
Decoded audio is capped at 20 MiB and ten minutes, provider response JSON is
bounded, and each request has a 95-second overall provider deadline.
The Next.js rewrite has a 120-second proxy timeout, allowing this deadline plus
authentication/notebook checks to complete. Configure any additional reverse
proxy with the same bounded timeout so it does not drop ordinary synthesis
requests after its default 30 seconds.

## Ownership, cancellation and limits

Supabase Bearer-token verification and notebook ownership are required before
any provider request. Foreign notebook IDs return 404. Passages must contain
1–4000 characters with non-whitespace text. No passage or audio is retained in
backend caches, relational metadata, Storage, or telemetry. Responses use
`private, no-store`; the frontend revokes blob URLs when playback closes or its
account/notebook scope changes. Google receives the selected passage for speech
generation, so its normal provider data handling applies.

Limits are process-local: at most four active speech requests, one per account,
and eight attempts per account per minute. Retries after upstream failure count
toward this limit. Multi-worker deployments should add a shared rate/budget
limit at their ingress if needed. A client disconnect cancels the in-flight
HTTP request and releases its active slot; upstream computation already accepted
by Google may still complete or incur cost. No automatic provider retry or
substitute audio is generated. The user can retry explicitly. Provider quota/
access/unavailability failures return 503, request-limit failures return 429,
invalid audio returns 502 and synthesis timeout returns 504. Upstream error
bodies, keys and submitted text are never included in API error details.

## Verification

The live configured Gemini speech request was attempted with a synthetic
“Welcome to Textbook” passage and returned HTTP 429. Working model quota is
therefore a deployment prerequisite, not a verified live happy path. Local
tests use a deterministic provider PCM response but execute the real HTTP
contract, audio validation/WAV conversion, ownership dependency, limits,
failure/retry and cancellation behavior. Browser checks use actual decodable
audio to test play/pause, duration, rate and seek; they do not substitute a
simulated progress timer for audio playback.

The voice suite passes 26 tests, including a real disposable SQL tenant check:

```sh
python -m pytest textbook-backend/tests/test_voice.py -q
# With the existing PGlite fixture on localhost:55419 and no browser fixture using it:
python -m pytest textbook-backend/tests/test_voice_sql.py -q
```

For local browser verification, start the existing PGlite server and run
`python textbook-backend/tests/voice_fixture.py`. It exposes the real owned
voice route on localhost:8194 with a synthetic PCM provider transport; its
four-second WAV is decoded and played by the browser. Use a frontend preview
on localhost:3124 pointing to that fixture, and the existing synthetic Auth
tokens from `tests/history_fixture.py`. This test-only server never runs in
the production app or writes to a configured real database.

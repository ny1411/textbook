# Studio exports and Audio Overview

Open Studio → Notes. **Export Markdown** downloads UTF-8 `.md`; **Export PDF** downloads a real paginated A4 PDF containing note text, titles, creation/update dates, source references and saved excerpts. Export buttons are disabled until there are notes. PDF code and fonts load only on demand; Latin, Greek, Cyrillic and Devanagari text use embedded fonts. Other scripts and emoji are not guaranteed by these fonts. Exporting does not upload notes to a service.

**Generate overview** discusses the sources selected in the Sources panel. Choose one to six ready sources from the current notebook. The result contains a two-speaker conversation, an expandable transcript with source names, native play/pause/seek controls, and a **Download audio** WAV link. Only selected passages are summarized; this is not a claim to cover every page. Check the original sources when using generated explanations. Changing source selection, notebook, account or Studio tab cancels pending work and releases the prior audio.

The implementation reuses the app's Gemini credentials and bounded speech infrastructure. Gemini supports two distinct named speaker voices in one audio generation call. This avoids adding a second provider credential or sending documents to a newly configured service. ElevenLabs and Edge-TTS are not required.

## Backend configuration

- `GOOGLE_API_KEY`: required, reused by both transcript and speech calls.
- `AUDIO_OVERVIEW_SCRIPT_MODEL`: defaults to `gemini-3.6-flash`.
- `VOICE_TTS_MODEL`: shared with Read Aloud, defaults to `gemini-2.5-flash-preview-tts`.
- `AUDIO_OVERVIEW_HOST_VOICE`: defaults to `Kore`.
- `AUDIO_OVERVIEW_GUEST_VOICE`: defaults to `Puck`; it must differ from the host voice.

The default TTS request uses Gemini's `multiSpeakerVoiceConfig` / `speakerVoiceConfigs` schema, with `Host` and `Guest` matching the transcript labels. See Google's [Gemini 2.5 multi-speaker example](https://github.com/google-gemini/cookbook/blob/archive/gemini-2.5-tts/quickstarts/Get_started_TTS.ipynb). A configured API key must also have quota for both models. Missing configuration, unavailable passages, invalid transcripts/audio, quota failures and timeouts return explicit retryable errors; no replacement or simulated speech is served by production code.

`POST /api/studio/audio-overview` accepts `notebook_id` and `document_ids` (UUIDs, one to six distinct IDs). Authentication and ownership of the notebook and **every** document are checked in SQL before Qdrant or Gemini. Pending-deletion and unfinished sources are rejected. Qdrant reads include user, notebook and document filters; returned payloads are checked again and bounded to four chunks / 2,400 characters per source. A JSON transcript validates alternating named speakers, supported source IDs, coverage of each selected source and a maximum 4,000 spoken characters before synthesis.

The response is private/no-store JSON containing transcript turns, source metadata, voice names, duration, media type and base64-encoded real mono PCM WAV audio. Existing speech PCM/rate/duration/20 MiB limits apply, with a 110-second total generation deadline. The existing process-local speech limiter prevents overlapping Read Aloud/Overview generation for an account. Disconnects cancel provider work and release reservations. No audio, transcript, note, message or artifact database rows are written; the user can download the result while it is open.

## Validation

`PYTHONPATH=.:tests python -m pytest tests/test_podcast.py tests/test_podcast_sql.py -q` passed all 16 tests. `tests/test_podcast.py` exercises the actual provider request schemas and PCM WAV decoding with a synthetic HTTP transport. `tests/test_podcast_sql.py` additionally exercises authentication, ownership, source readiness/deletion and no-persistence behavior against disposable local SQL at `127.0.0.1:55423`. It never uses production `DATABASE_URL`.

The local browser fixture used real frontend requests, auth checks, SQL and note/audio downloads, with a clearly synthetic provider seam for the transcript and audible PCM. Synthetic tones verify decoding, seeking, playing and downloading; they do not establish live speech quality. Live Gemini model discovery succeeded during implementation, but both transcript and multi-speaker TTS calls returned quota `429`. Live conversation audio therefore remains unverified until provider quota is available. Those failures were checked in the browser as a `503` error with explicit retry.

Chromium browser checks at 1440 × 960 and 390 × 844 verified actionable empty states, real note downloads, transcript/source names, native play/pause/seek, WAV download, quota errors and successful explicit retry through the fixture API. Source/notebook/account/logout/tab changes and Studio unmounts paused the detached prior audio element and removed its `src`; provider-held work was aborted and never displayed a late result. Account changes used a same-page Supabase auth event. No application exceptions or framework overlay occurred; the injected quota HTTP `503`, existing logo aspect-ratio warning and Chromium software-GPU warnings were expected.

The PDF stress export contained 500 evidence lines over 37 A4 pages. Text extraction confirmed title/date/source/document/page/URL/excerpt metadata and Greek content; visual inspection confirmed Devanagari shaping with the embedded licensed font. Devanagari extraction order follows PDF glyph ordering and need not match Unicode reading order. Other scripts and emoji remain outside verified font coverage. Frontend TypeScript, ESLint and production build passed. Browser artifacts and scripts were kept outside the repository; Browser plugin was unavailable, so checks used Playwright and system Chromium.

# Citation relevance scores

`rerank_score` in search results and citations is the stable sigmoid of the BGE
cross-encoder logit. It is finite and bounded from 0 to 1. The displayed match
percentage is normalized relevance, not a calibrated probability. A zero score
is valid and displays as 0%; unavailable scores have no percentage.

Ranking uses the internal `rerank_logit`, preserving order even when extreme
values saturate the sigmoid. Non-finite model scores are excluded. Both chat
pipelines still interpret `CHAT_MIN_RERANK_SCORE` in raw-logit units (default 0),
so the default grounding threshold corresponds to normalized relevance 0.5.
The raw logit is internal and is not included in the citation/search API fields.

Chat cache namespaces are versioned with this change so previously cached raw
logits cannot appear as normalized citation scores. Old entries expire normally;
deployment does not delete other users' cache entries.

Backend verification: `python -m unittest discover -s tests -p test_relevance.py`.
These deterministic tests mock the ML adapter; they do not require model downloads
or provider access.

Frontend verification: run a local frontend dev server, then from
`textbook-frontend` run `node verification/relevance-browser.mjs` with
`PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` and `FRONTEND_URL` set as needed.
The browser check creates and removes a temporary fixture route, exercising the
real citation, Studio and inspector components with deterministic scores and
mocked search responses. No provider requests or production routes are changed.

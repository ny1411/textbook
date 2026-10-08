# Grouped citations

Assistant messages resolve `[Source 1, Source 2, Source 3]` into separate badges,
using the same source metadata and preview/Studio actions as adjacent
`[Source 1][Source 2]` tags. Legacy `[1]`, `[source_1]`, and saved opaque source
IDs remain supported. Hover or keyboard focus previews the excerpt; click pins
the preview. **View Source** opens the matching excerpt in Studio.

The frontend remark transform works on Markdown text nodes and only resolves
IDs present in that message's citation metadata. Unknown or malformed groups
remain literal. Links, image alt text, inline/fenced code, escaped brackets,
and ordinary bracketed text keep their Markdown meaning. If any ID in a group
is unavailable, the entire group remains literal rather than suggesting that
all its references are valid.

Text and image-assisted generation request one bracketed tag per textbook
source, including adjacent tags for claims supported by several sources. Agent
mode uses these same generators. Image labels such as `[Image 1]` remain visual
evidence labels and never become textbook badges.

## Verification

From `textbook-frontend`, with Node 22.18 or newer:

```sh
npm run test:citations
npx --no-install next typegen
npx --no-install tsc --noEmit
```

From `textbook-backend`, with the project's test dependencies installed:

```sh
python -m pytest tests/test_citation_generation.py tests/test_images_unit.py -q
```

The rendering tests exercise real `react-markdown` with the citation plugin;
the backend tests capture the real model prompt and preserve returned source
ordinals without calling live providers. Browser acceptance uses a synthetic
saved answer with three grouped sources: preview source 2, click to pin, choose
**View Source**, and verify its excerpt/page in Studio. Repeat on desktop and
mobile, verify focus/Escape and hover dismissal, and check that literal/code
references stay unchanged.

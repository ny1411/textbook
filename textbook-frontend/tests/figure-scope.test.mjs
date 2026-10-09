import assert from "node:assert/strict";
import { test } from "node:test";
import { boundedCitationExcerpt, figureCitationKey } from "../lib/figure-scope.ts";

const citation = { source_id: 1, document_id: "owned-document", chunk_id: "chunk-1", page_number: 7, text: "Queries match keys." };

test("restored citations with new object identity keep an in-flight diagram scope", () => {
    const capturedScope = figureCitationKey(citation);
    const restoredCitation = JSON.parse(JSON.stringify(citation));
    assert.notEqual(restoredCitation, citation);
    assert.equal(figureCitationKey(restoredCitation), capturedScope);
    // Retrieval relevance is not part of the selected passage identity.
    assert.equal(figureCitationKey({ ...restoredCitation, rerank_score: 0.9 }), capturedScope);
});

test("each passage identity field invalidates the old scope, including page-only changes", () => {
    const capturedScope = figureCitationKey(citation);
    for (const change of [{ source_id: 2 }, { document_id: "another-document" }, { chunk_id: "chunk-2" },
        { page_number: 8 }, { text: "A different passage." }]) {
        assert.notEqual(figureCitationKey({ ...citation, ...change }), capturedScope);
    }
    assert.notEqual(figureCitationKey(null), capturedScope);
    assert.equal(figureCitationKey(null), figureCitationKey(undefined));
});

test("an excerpt cut inside an astral math/emoji symbol remains a well-formed exact citation prefix", () => {
    for (const symbol of ["🌍", "𝑥"]) {
        const text = "a".repeat(2399) + symbol + " rest of passage";
        const excerpt = boundedCitationExcerpt(text);
        assert.equal(excerpt.length, 2399);
        assert.ok(excerpt.isWellFormed());
        assert.ok(text.startsWith(excerpt));
        assert.equal(new TextDecoder().decode(new TextEncoder().encode(excerpt)), excerpt);
    }
});

test("complete symbols at the excerpt bound and short Unicode passages are preserved", () => {
    const short = "Attention 🌍 नमस्ते 𝑥";
    assert.equal(boundedCitationExcerpt(short), short);
    const text = "a".repeat(2398) + "𝑥" + " beyond the limit";
    const excerpt = boundedCitationExcerpt(text);
    assert.equal(excerpt.length, 2400);
    assert.ok(excerpt.endsWith("𝑥"));
    assert.ok(excerpt.isWellFormed());
    assert.ok(text.startsWith(excerpt));
});

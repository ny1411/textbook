import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { renderToStaticMarkup } from "react-dom/server";
import { createCitationPlugin, parseCitationText } from "../lib/citations.ts";

const ids = (text, knownIds = []) => parseCitationText(text, knownIds)
    .filter((token) => token.type === "citation").map((token) => token.sourceId);
const render = (text, knownIds = []) => renderToStaticMarkup(React.createElement(
    ReactMarkdown, { remarkPlugins: [remarkGfm, createCitationPlugin(knownIds)] }, text,
));

test("grouped, adjacent, numeric, and source_ references split in order", () => {
    assert.deepEqual(ids("[Source 1, Source 2, Source 3]"), ["1", "2", "3"]);
    assert.deepEqual(ids("[Source1][Source2] [Source 3][Source 4]"), ["1", "2", "3", "4"]);
    assert.deepEqual(ids("[1, 2] [source_3, SOURCE_4] [Source 5, 6]"), ["1", "2", "3", "4", "5", "6"]);
});

test("actual string IDs resolve exactly, including IDs with source_ prefixes", () => {
    assert.deepEqual(ids("[doc-a_2, source_real] [Source doc-a_2]", ["doc-a_2", "source_real"]),
        ["doc-a_2", "source_real", "doc-a_2"]);
    assert.deepEqual(ids("[Source missing, 999]"), ["missing", "999"]);
});

test("unrelated or partially invalid bracketed prose stays verbatim", () => {
    const text = "Notes [optional] [Sourcebook] [alpha, unrelated] [Source 1,] [Source 1; Source 2]";
    assert.deepEqual(parseCitationText(text, ["alpha"]), [{ type: "text", value: text }]);
});

test("ordinary prose and source order survive multiple groups", () => {
    assert.deepEqual(parseCitationText("First [Source 1, Source 2]; then [3]."), [
        { type: "text", value: "First " },
        { type: "citation", sourceId: "1" },
        { type: "citation", sourceId: "2" },
        { type: "text", value: "; then " },
        { type: "citation", sourceId: "3" },
        { type: "text", value: "." },
    ]);
});

test("Markdown code, links, reference links, images, and unrelated text stay intact", () => {
    const markdown = [
        "Inline `[Source 1, Source 2]`.",
        "```text\n[Source1][Source2]\n```",
        "[[Source 1, Source 2]](https://example.test/read)",
        "![Source 1, Source 2](https://example.test/image.png)",
        "[Source 3]\n\n[Source 3]: https://example.test/reference",
        "[cite:1](#citation-1)",
        "Unrelated [optional].",
    ].join("\n\n");
    const html = render(markdown);
    assert.doesNotMatch(html, /data-source-id=/);
    assert.match(html, /<code>\[Source 1, Source 2\]<\/code>/);
    assert.match(html, /<a href="https:\/\/example.test\/read">\[Source 1, Source 2\]<\/a>/);
    assert.match(html, /alt="Source 1, Source 2"/);
    assert.match(html, /<a href="https:\/\/example.test\/reference">Source 3<\/a>/);
    assert.match(html, /<a href="#citation-1">cite:1<\/a>/);
    assert.match(html, /Unrelated \[optional\]/);
});

test("real Markdown paragraphs, emphasis, lists, and table cells render separate citations", () => {
    const html = render("**Claim [Source 1, Source 2]**\n\n- Another [source_3]\n\n| Fact | Evidence |\n| --- | --- |\n| X | [doc-a] |", ["doc-a"]);
    assert.equal((html.match(/data-source-id=/g) ?? []).length, 4);
    assert.match(html, /<strong>Claim <cite data-source-id="1">\[1\]<\/cite><cite data-source-id="2">\[2\]<\/cite><\/strong>/);
    assert.match(html, /<td><cite data-source-id="doc-a">\[doc-a\]<\/cite><\/td>/);
});

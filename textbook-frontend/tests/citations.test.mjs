import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkCitations } from "../lib/remark-citations.ts";

function render(markdown, sourceIds = [1, 2, 3]) {
    const ids = [];
    const html = renderToStaticMarkup(React.createElement(ReactMarkdown, {
        remarkPlugins: [remarkGfm, [remarkCitations, { sourceIds }]],
        components: {
            a({ node, children, ...props }) {
                const id = node.properties["data-citation-source"];
                if (typeof id === "string") {
                    ids.push(id);
                    return React.createElement("button", { type: "button", "aria-label": `Source ${id}` }, children);
                }
                return React.createElement("a", props, children);
            },
        },
    }, markdown));
    return { ids, html };
}

test("renders each grouped, adjacent and legacy citation in source order", () => {
    const result = render("Grouped [Source 1, Source 2, Source 3]. Adjacent [Source 2][Source 1]. Legacy [1], [source_2], [SOURCE3] and [Source 1, 2, source_3].");
    assert.deepEqual(result.ids, ["1", "2", "3", "2", "1", "1", "2", "3", "1", "2", "3"]);
    assert.equal((result.html.match(/<button/g) || []).length, 11);
});

test("keeps unknown IDs, image labels, ordinary brackets and malformed groups literal", () => {
    const markdown = "[Source 99] [text] [Image 1] [Source 1, Source 99] [Source 1,] [Source 1; Source 2]";
    const result = render(markdown);
    assert.deepEqual(result.ids, []);
    assert.ok(result.html.includes(markdown));
    assert.deepEqual(render("[Source 1, Source 2]", []).ids, []);
});

test("preserves opaque legacy IDs while only resolving supplied source metadata", () => {
    const uuid = "11111111-1111-4111-8111-111111111111";
    assert.deepEqual(render(`[${uuid}] [Source ${uuid}, source_1] [unknown-id]`, [uuid, 1]).ids, [uuid, uuid, "1"]);
    assert.deepEqual(render("[source_abc] [Sourcebook] [Source source_abc, Source Sourcebook]", ["source_abc", "Sourcebook"]).ids,
        ["source_abc", "Sourcebook", "source_abc", "Sourcebook"]);
});

test("does not reinterpret Markdown links, image alt text or reference links", () => {
    const result = render("[Source 1](https://example.com) ![Source 2](/diagram.png) [Source 3][reference]\n\n[reference]: /notes\n\n[link](#citation-1)");
    assert.deepEqual(result.ids, []);
    assert.ok(result.html.includes('href="https://example.com"'));
    assert.ok(result.html.includes('alt="Source 2"'));
    assert.ok(result.html.includes('href="/notes"'));
    assert.ok(result.html.includes('href="#citation-1"'));
});

test("preserves inline, fenced and indented code", () => {
    const result = render("Inline `[Source 1, Source 2]`\n\n```text\n[Source 3]\n```\n\n    [Source 1]\n\nOutside [Source 2].");
    assert.deepEqual(result.ids, ["2"]);
    assert.ok(result.html.includes("<code>[Source 1, Source 2]</code>"));
    assert.ok(result.html.includes("[Source 3]"));
});

test("leaves explicitly escaped citations literal without losing nearby citations or entities", () => {
    const result = render(String.raw`Literal \[Source 1\] and \[Source 2] and [Source 3\]; real [Source 2] &amp; [Source 1].`);
    assert.deepEqual(result.ids, ["2", "1"]);
    assert.ok(result.html.includes("Literal [Source 1] and [Source 2] and [Source 3]; real"));
    assert.ok(result.html.includes("&amp;"));
    assert.deepEqual(render("&#91;Source 1&#93; and [Source 2]").ids, ["2"]);
});

test("works inside emphasis, headings, lists and GFM tables without losing formatting", () => {
    const result = render("## Heading [Source 1]\n\n- **Evidence [Source 2, Source 3]**\n\n| Claim | Source |\n| --- | --- |\n| Text | [source_1] |");
    assert.deepEqual(result.ids, ["1", "2", "3", "1"]);
    for (const tag of ["<h2>", "<strong>", "<table>", "<li>"]) assert.ok(result.html.includes(tag));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { notesAsMarkdown } from "../lib/notes-export.ts";

test("figure exports retain caption, durable ID, model, and citation provenance without private image URLs", () => {
    const note = {
        id: "figure-1", title: "Concept diagram", content: "Queries connect to keys and values.",
        createdAt: "2026-10-09T12:00:00.000Z", updatedAt: "2026-10-09T12:00:00.000Z",
        figure: { id: "durable-figure-id", model: "imagen-test", mediaType: "image/png", width: 1024, height: 1024,
            prompt: "Illustrate an attention layer", url: "blob:expired", image_base64: "private-bytes" },
        sourceRef: { sourceId: 2, documentId: "owned-document", documentName: "Attention textbook",
            pageNumber: 7, excerpt: "Queries determine relevance.\nValues provide content.", contextType: "saved_citation" },
    };
    const markdown = notesAsMarkdown([note], "Notebook", new Date("2026-10-09T13:00:00Z"));
    for (const text of [note.content, "AI-generated concept diagram", "Figure ID: durable-figure-id",
        "Model: imagen-test", "Image: image/png, 1024 × 1024", "Generation prompt: Illustrate an attention layer",
        "Source: [2]", "Document: owned-document", "Document name: Attention textbook", "Page: 7",
        "Context: Verified saved citation", "> Queries determine relevance.\n> Values provide content."]) {
        assert.ok(markdown.includes(text), `Missing ${text}`);
    }
    assert.ok(!markdown.includes("blob:"));
    assert.ok(!markdown.includes("private-bytes"));
    assert.ok(!markdown.includes("/api/image/"));
});

test("combining figure notes keeps existing text and source exports intact", () => {
    const date = "2026-10-09T12:00:00Z";
    const notes = [
        { id: "scratch", title: "My private note", content: "A handwritten observation", createdAt: date, updatedAt: date },
        { id: "quote", content: "A quotation", createdAt: date, updatedAt: date, sourceRef: { sourceId: 1, pageNumber: 3, excerpt: "A source passage" } },
    ];
    const markdown = notesAsMarkdown(notes);
    assert.ok(markdown.includes("My private note"));
    assert.ok(markdown.includes("A handwritten observation"));
    assert.ok(markdown.includes("A quotation"));
    assert.ok(markdown.includes("Source: [1]"));
    assert.ok(markdown.includes("Page: 3"));
    assert.ok(markdown.includes("> A source passage"));
    assert.ok(!markdown.includes("AI-generated"));
});

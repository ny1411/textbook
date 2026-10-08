// No provider/network required: exercise the actual TypeScript speech-text helper.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
const compiled = ts.transpileModule(fs.readFileSync(new URL("../lib/voice-text.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const exported = {};
vm.runInNewContext(compiled.outputText, { exports: exported });
const { speechParts } = exported;
for (const content of [
    "a".repeat(3999) + "😀" + "b".repeat(10),
    "😀".repeat(4001),
    "word".repeat(3000),
]) {
    const parts = speechParts(content);
    assert.ok(parts.length > 1);
    assert.ok(parts.every((part) => part.length <= 4000 && part.isWellFormed()));
    assert.equal(parts.join(""), content);
}
const prose = ("A sentence about the result. ".repeat(300)).trim();
const parts = speechParts(prose);
assert.ok(parts.every((part) => part.length > 0 && part.length <= 4000));
assert.equal(parts.join(" "), prose);
assert.equal(speechParts("## Topic\n**Important** [reference](https://example.com)\n2*3 and value_name").join(" "), "Topic\nImportant reference\n2*3 and value_name");
assert.equal(speechParts("  ").length, 0);
console.log("PASS voice text: bounded full passages, word/sentence boundaries, emoji surrogates, Markdown labels, literal math/identifiers");

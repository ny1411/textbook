import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { registerHooks } from "node:module";
import { createJSONStorage } from "zustand/middleware";

// Resolve the stores with native TypeScript; production uses the Next bundler.
registerHooks({ resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes("/stores/") && specifier.startsWith("./") && !specifier.endsWith(".ts")) {
        return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
} });
const values = new Map();
globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
};
const { useTextbookStore: workspace } = await import("../stores/useTextbookStore.ts");
const { useUserStore: account } = await import("../stores/useUserStore.ts");
const { useSourceStore: sources } = await import("../stores/useSourcesStore.ts");
const storage = () => createJSONStorage(() => localStorage);
const signIn = (id) => account.getState().setUser({ id, email: `${id}@example.invalid` });
const contents = () => workspace.getState().notes.map((note) => note.content);

beforeEach(() => {
    workspace.persist.setOptions({ storage: storage() });
    values.clear();
    account.getState().clearUser();
    workspace.setState({ workspaceUserId: null, activeNotebookId: "", notes: [],
        notesByWorkspace: {}, activeNotebookByUser: {}, legacyNotes: [],
        activeCitation: null, isInspectorOpen: false });
    sources.getState().replaceSources([]);
    values.clear();
});

test("notes, citations and sources do not follow a different account or logout", () => {
    signIn("account-a");
    workspace.getState().setActiveNotebookId("notebook-a");
    workspace.getState().addNote("A private note");
    workspace.getState().setActiveCitation({ source_id: 1, text: "A private citation" });
    workspace.getState().setInspectorOpen(true);
    sources.getState().addSource({ userId: "account-a", documentId: "source-a" });
    signIn("account-b");
    assert.deepEqual(contents(), []);
    assert.equal(workspace.getState().activeNotebookId, "");
    assert.equal(workspace.getState().activeCitation, null);
    assert.equal(workspace.getState().isInspectorOpen, false);
    assert.deepEqual(sources.getState().source, []);
    workspace.getState().setActiveNotebookId("notebook-b");
    workspace.getState().addNote("B private note");
    account.getState().clearUser();
    assert.deepEqual(contents(), []);
    workspace.getState().addNote("Anonymous note must not enter a signed-in notebook");
    signIn("account-a");
    assert.equal(workspace.getState().activeNotebookId, "notebook-a");
    assert.deepEqual(contents(), ["A private note"]);
    signIn("account-b");
    assert.deepEqual(contents(), ["B private note"]);
});

test("notebook switching restores separate notes and edits stay in the selected notebook", () => {
    signIn("account-a");
    workspace.getState().setActiveNotebookId("first");
    workspace.getState().addNote("First notebook");
    const first = workspace.getState().notes[0].id;
    workspace.getState().setActiveNotebookId("second");
    assert.deepEqual(contents(), []);
    workspace.getState().addNote("Second notebook");
    workspace.getState().updateNote(first, "Cross-notebook edit");
    workspace.getState().deleteNote(first);
    assert.deepEqual(contents(), ["Second notebook"]);
    workspace.getState().clearNotes();
    workspace.getState().setActiveNotebookId("first");
    assert.deepEqual(contents(), ["First notebook"]);
    workspace.getState().updateNote(first, "Edited first notebook");
    workspace.getState().setActiveNotebookId("second");
    assert.deepEqual(contents(), []);
    workspace.getState().setActiveNotebookId("first");
    assert.deepEqual(contents(), ["Edited first notebook"]);
});

test("persisted notes stay hidden before authentication and restore only their owner", async () => {
    signIn("account-a");
    workspace.getState().setActiveNotebookId("first");
    workspace.getState().addNote("Persisted private note");
    const saved = values.get("textbook-notebook-storage");
    workspace.setState({ workspaceUserId: null, activeNotebookId: "", notes: [],
        notesByWorkspace: {}, activeNotebookByUser: {} });
    values.set("textbook-notebook-storage", saved);
    await workspace.persist.rehydrate();
    assert.deepEqual(contents(), []);
    assert.equal(workspace.getState().workspaceUserId, null);
    signIn("account-b");
    workspace.getState().setActiveNotebookId("first");
    assert.deepEqual(contents(), []);
    signIn("account-a");
    assert.deepEqual(contents(), ["Persisted private note"]);
});

test("legacy global notes are preserved without guessing ownership from the last session", async () => {
    values.set("textbook-notebook-storage", JSON.stringify({ version: 0, state: {
        workspaceUserId: "account-b", activeNotebookId: "first",
        notes: [{ id: "old-note", content: "Possibly A's old note" }],
    } }));
    await workspace.persist.rehydrate();
    signIn("account-b");
    workspace.getState().setActiveNotebookId("first");
    assert.deepEqual(contents(), []);
    assert.equal(workspace.getState().legacyNotes[0].content, "Possibly A's old note");
    assert.equal(JSON.parse(values.get("textbook-notebook-storage")).state.legacyNotes.length, 1);
});

test("late hydration cannot replace identity, expose a logged-out note, or erase new notes", async () => {
    signIn("account-a");
    workspace.getState().setActiveNotebookId("first");
    workspace.getState().addNote("A saved note");
    const saved = values.get("textbook-notebook-storage");
    let resolveRead;
    workspace.persist.setOptions({ storage: createJSONStorage(() => ({
        getItem: () => new Promise((resolve) => { resolveRead = resolve; }),
        setItem: () => {}, removeItem: () => {},
    })) });
    const hydration = workspace.persist.rehydrate();
    signIn("account-b");
    workspace.getState().setActiveNotebookId("second");
    workspace.getState().addNote("B note made during hydration");
    resolveRead(saved);
    await hydration;
    assert.equal(workspace.getState().workspaceUserId, "account-b");
    assert.deepEqual(contents(), ["B note made during hydration"]);
    const logoutHydration = workspace.persist.rehydrate();
    account.getState().clearUser();
    resolveRead(saved);
    await logoutHydration;
    assert.equal(workspace.getState().workspaceUserId, null);
    assert.deepEqual(contents(), []);
});

test("late hydration cannot resurrect notes deleted after its snapshot was read", async () => {
    signIn("account-a");
    workspace.getState().setActiveNotebookId("first");
    workspace.getState().addNote("Delete this private note");
    const saved = values.get("textbook-notebook-storage");
    let resolveRead;
    workspace.persist.setOptions({ storage: createJSONStorage(() => ({
        getItem: () => new Promise((resolve) => { resolveRead = resolve; }),
        setItem: () => {}, removeItem: () => {},
    })) });
    const hydration = workspace.persist.rehydrate();
    workspace.getState().deleteNote(workspace.getState().notes[0].id);
    resolveRead(saved);
    await hydration;
    assert.deepEqual(contents(), []);
    workspace.getState().setActiveNotebookId("second");
    workspace.getState().setActiveNotebookId("first");
    assert.deepEqual(contents(), []);
});

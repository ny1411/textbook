import assert from "node:assert/strict";
import { test } from "node:test";
import { getBackendUrl } from "../config/deployment.mjs";

const hosted = {
    VERCEL: "1",
    VERCEL_ENV: "preview",
    BACKEND_URL: "https://backend.example.com/",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-test-key",
};

test("local development and vercel dev retain the local FastAPI default", () => {
    assert.equal(getBackendUrl({}), "http://127.0.0.1:8000");
    assert.equal(getBackendUrl({ VERCEL: "1", VERCEL_ENV: "development" }), "http://127.0.0.1:8000");
});

test("preview and production require a configured backend before building", () => {
    for (const VERCEL_ENV of ["preview", "production", undefined]) {
        assert.throws(() => getBackendUrl({ ...hosted, VERCEL_ENV, BACKEND_URL: " " }), /Set BACKEND_URL/);
    }
});

test("hosted builds reject HTTP and local backend destinations", () => {
    for (const BACKEND_URL of [
        "http://backend.example.com", "https://localhost", "https://LOCALHOST.",
        "https://api.localhost", "https://127.0.0.1", "https://127.1", "https://0.0.0.0", "https://[::1]",
        "https://[::]", "https://[::ffff:127.0.0.1]",
    ]) {
        assert.throws(() => getBackendUrl({ ...hosted, BACKEND_URL }), /must use HTTPS/);
    }
});

test("invalid origins fail without exposing credentials in errors", () => {
    for (const BACKEND_URL of [
        "not-a-url", "ftp://backend.example.com", "https://backend.example.com/api",
        "https://backend.example.com?token=private-value", "https://backend.example.com#fragment",
        "https://user:private-value@backend.example.com",
    ]) {
        assert.throws(() => getBackendUrl({ ...hosted, BACKEND_URL }), (error) =>
            /BACKEND_URL/.test(error.message) && !error.message.includes("private-value"));
    }
});

test("public Supabase configuration must be present on hosted builds", () => {
    for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
        assert.throws(() => getBackendUrl({ ...hosted, [key]: " " }), new RegExp(`Set ${key}`));
    }
});

test("normalizes the backend origin so rewrites append /api exactly once", () => {
    assert.equal(getBackendUrl(hosted), "https://backend.example.com");
    assert.equal(getBackendUrl({ ...hosted, BACKEND_URL: " https://backend.example.com:8443/ " }), "https://backend.example.com:8443");
    assert.equal(getBackendUrl({ BACKEND_URL: "http://localhost:9000/" }), "http://localhost:9000");
});

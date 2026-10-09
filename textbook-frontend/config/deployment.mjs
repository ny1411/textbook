/** Validate configuration before Next.js freezes the API rewrite into a build. */
export function getBackendUrl(env = process.env) {
    const hosted = env.VERCEL === "1" && env.VERCEL_ENV !== "development";
    const configured = env.BACKEND_URL?.trim();

    if (hosted && !configured) {
        throw new Error("Set BACKEND_URL to the deployed FastAPI HTTPS origin before building on Vercel.");
    }

    let backend;
    try {
        backend = new URL(configured || "http://127.0.0.1:8000");
    } catch {
        throw new Error("BACKEND_URL must be an absolute HTTP(S) origin, without /api.");
    }

    if (!["http:", "https:"].includes(backend.protocol)
        || backend.username || backend.password || backend.search || backend.hash
        || backend.pathname !== "/") {
        throw new Error("BACKEND_URL must be an HTTP(S) origin without credentials, a path, query, or fragment; /api is added by the rewrite.");
    }

    const hostname = backend.hostname.replace(/\.$/, "").toLowerCase();
    const loopback = hostname === "localhost" || hostname.endsWith(".localhost")
        || hostname === "[::1]" || hostname === "[::]" || hostname === "0.0.0.0"
        || /^127\.\d+\.\d+\.\d+$/.test(hostname)
        || /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(hostname);
    if (hosted && (backend.protocol !== "https:" || loopback)) {
        throw new Error("BACKEND_URL on Vercel must use HTTPS and cannot point to localhost or a loopback address.");
    }

    if (hosted) {
        for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
            if (!env[key]?.trim()) throw new Error(`Set ${key} before building on Vercel.`);
        }
    }

    return backend.origin;
}

# Deploy the frontend to Vercel

## Project and build settings

Import `ny1411/textbook` into the intended Vercel account with project name
`textbook`. The observed default team is `team_uk1Ii5k2P5wcgjeFoxW9ojfC`
(scope `ny1411`); verify access to that target before creating or deploying.

| Setting | Value |
| --- | --- |
| Git repository | `ny1411/textbook` |
| Root Directory | `textbook-frontend` |
| Framework | Next.js |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output Directory | Framework default |
| Production branch | `main` |
| Node.js | 22.x or another supported version satisfying Next.js 16 |

The app's `vercel.json` records the framework and reproducible build commands.
Root Directory belongs in Vercel project settings, not `vercel.json`. Keep the
normal Next.js server build: SSR Supabase cookies, `/auth/callback`, and external
API rewrites require server features.

## Required environment configuration

Set these variables in the new `textbook` project's Preview and Production
environments before deploying. Use separate staging resources for previews
where available. Do not copy backend secrets into this frontend project.

| Variable | Value and purpose |
| --- | --- |
| `BACKEND_URL` | Live FastAPI HTTPS origin, for example `https://backend.example.com`, without `/api` or a trailing path |
| `NEXT_PUBLIC_SUPABASE_URL` | HTTPS root URL of the intended Supabase Auth project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | That project's public anon/publishable key |

The example backend hostname above is illustrative, not a configured service.
The public Supabase values are bundled for the browser; never substitute a
service-role/secret key. `BACKEND_URL` is consumed when Next.js builds its rewrite
manifest. Rebuild after changing any of these variables.

The deployment configuration stops Vercel Preview/Production builds when the
backend is missing, uses HTTP, or points to localhost/loopback. It also rejects
backend credentials, paths, queries, and fragments and requires both public
Supabase variables. Local development and `vercel dev` retain the local FastAPI
default. These checks validate configuration shape; they do not establish backend
reachability or successful authentication.

Copy `.env.example` to `.env.local` only for local development. Both `.env.local`
and `.vercel/` are ignored by Git. Store Vercel credentials through its normal
authentication flow or secret manager; do not commit or print them.

## Backend and OAuth prerequisites

Deploy and verify the long-running FastAPI service before releasing the
frontend. Its `/healthz` only confirms Qdrant startup, not SQL readiness or the
upload/chat flow. Current API routes require a working, TLS-verified
`DATABASE_URL` and a reviewed database baseline/upgrades matching the current
Prisma schema. Review [chat-history.md](../textbook-backend/docs/chat-history.md),
[supabase-production.md](../textbook-backend/docs/supabase-production.md), and
the versioned SQL in `textbook-backend/prisma/changes/` before a backend release.
Startup does not apply those schema changes. The older container deployment
runbook predates runtime SQL and must not be treated as a complete list of
current database requirements. Do not apply migrations as a frontend smoke test.

In the matching Supabase project's Auth URL configuration, set the Site URL to
the chosen production frontend domain and allow its exact
`https://<frontend-domain>/auth/callback` URL. Allow the selected preview callback
URLs when testing previews. The frontend uses the current browser origin for
OAuth redirects; provider callbacks must use that same Supabase project's
configured OAuth callback. Verify Google/GitHub sign-in and the returned session
on the deployed frontend.

The browser sends Bearer tokens and multipart uploads through the frontend's
same-origin `/api` rewrite. Keep that rewrite in `next.config.ts`; no duplicate
Vercel routing rule or direct browser backend URL is needed. The local Next.js
proxy has a 12 MiB body allowance and a 120-second timeout, but Vercel's own
platform limits also apply. Verify representative uploads and streamed chat on
the deployed site rather than treating those local settings as hosted guarantees.

## Deploy and verify a reviewed commit

Git integration can build pull-request previews after the project is imported
and its variables are configured. Verify the deployment's commit SHA, owner,
project, and target environment before using its URL or releasing it.

For an explicitly staged production release with the CLI, run these commands
from the **repository root**, where the project link will be stored. The remote
project must already have Root Directory `textbook-frontend`; do not change to
the app subdirectory with this root link. Use the CLI's authenticated account
and the same explicit scope throughout:

```sh
vercel whoami --format json
vercel link --yes --scope ny1411 --project textbook
vercel project inspect --non-interactive --scope ny1411
git status --short
git rev-parse HEAD
vercel env ls preview --scope ny1411
vercel env ls production --scope ny1411
vercel deploy --prod --skip-domain --scope ny1411
vercel inspect <deployment-url> --scope ny1411
```

Stop if inspection reports another owner/project, missing linkage, access
failure, missing variables, or an unreviewed dirty checkout. `--skip-domain`
stages a production build without assigning the production domains. Wait for
`READY` and verify that deployment before promotion:

1. Open the homepage and confirm there are no JavaScript or network failures.
2. Request `/api/notebooks` without a session: it should return the backend's
   authentication error, not frontend HTML, a proxy 502, or a Vercel login page.
3. Complete real Supabase OAuth sign-in and confirm the session survives a reload.
4. Use the signed-in account to list notebooks, upload a representative document,
   wait for ingestion, and receive a streamed Fast/Agent answer with source
   citations. Reload and verify the saved conversation and source inspection.
5. Exercise a multipart image upload and confirm the API retains the auth header,
   query strings, and streaming events through Vercel's routing.

Protected deployments can be inspected with `vercel curl` or the authenticated
Vercel MCP fetch tool. Preserve deployment protection. Successful local builds
and mocks do not replace this verification against the real backend and Auth.

After the staged production build passes these checks, promote that same build
and repeat the homepage/auth/API smoke checks at the production domain:

```sh
vercel promote <deployment-url> --scope ny1411
vercel logs <deployment-url> --level error --since 1h --scope ny1411
```

Record the project/team, environment, URL, commit SHA, `READY` state, and observed
end-to-end results before marking issue #9 and the plan checkbox complete.

## Current deployment status

On 9 October 2026, the authenticated Vercel MCP connection returned `403
forbidden` for explicitly scoped project listing, reading `textbook`, and
creating the intended `textbook` project in team
`team_uk1Ii5k2P5wcgjeFoxW9ojfC`. The creation attempt was `POST /v11/projects`
with scope `ny1411`; no project or deployment was created. Vercel reported no
known automatic remediation. The CLI was unavailable and `VERCEL_TOKEN` was
absent, so there was no authenticated CLI fallback. The execution environment
also lacks a configured `BACKEND_URL`; the backend container documentation
does not establish a live HTTPS deployment.

This change provides validated deployment preparation. Project-capable Vercel
access and the intended live HTTPS backend origin are still needed. No deployed
URL, production API/Auth verification, or completion of issue #9 is claimed.

# Vercel frontend deployment preparation (#9)

Verified on 9 October 2026 from base `055dd1805444a9661dd9e74f0177911f95fe5f07`
with Node.js 24.19.0 and Next.js 16.3.0. These are local preparation results, not
evidence of a hosted release.

| Check | Result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | Passed; lockfile unchanged |
| `node --test tests/*.test.mjs` | 30 tests passed, including six deployment configuration tests |
| `npm run lint` | Passed |
| Hosted-style `npm run build` | Passed with `VERCEL=1`, `VERCEL_ENV=preview`, an illustrative `https://backend.example.com` origin, and the existing injected public Supabase configuration |
| Build TypeScript checks | Passed as part of `next build` |
| Compiled rewrite manifest | `/api/:path*` targets `https://backend.example.com/api/:path*` |
| Hosted production build with missing `BACKEND_URL` | Exited 1 at configuration load with the intended actionable error, before compiling an invalid deployment |
| Vercel configuration JSON | Valid JSON; Next.js framework, `npm ci`, `npm run build`, and no unsupported `rootDirectory` key |
| `git diff --check` | Passed |

The build retains the existing Next.js middleware deprecation warning. The
TypeScript-based pre-existing Node tests retain their module-type warning.
Neither prevented validation. No browser or API session was created on a live
Vercel deployment because no deployment could be created.

## Live attempt and blockers

The authenticated Vercel connection identifies scope `ny1411` and default team
`team_uk1Ii5k2P5wcgjeFoxW9ojfC`. Explicitly scoped calls to list projects for
`ny1411/textbook` and inspect `textbook` returned `403 forbidden`. A creation
attempt for the authorized new project also failed:

- Operation: `POST /v11/projects`.
- Target: `textbook`, GitHub `ny1411/textbook`, Root Directory
  `textbook-frontend`, Next.js framework, default team above.
- Error: `Not authorized: Trying to access resource under scope "ny1411"`.
- Request ID: `sfo1:sfo1::r9gn7-1791550715590-726ccabb3b0a`.
- Recovery: Vercel reported no known automatic fix; an unchanged retry or
  assumption that reauthentication will fix the scope would not be supported.

Vercel CLI was not installed and `VERCEL_TOKEN` was absent, so an authenticated
CLI fallback was unavailable. The environment's HTTP policy also does not grant
direct `api.vercel.com` or a future deployment hostname. No network policy was
bypassed. `BACKEND_URL` was absent and no repository deployment document supplied
a real hosted backend origin. No Vercel project, deployment, promotion, backend
hosting resource, or database migration was created/applied.

Project-capable Vercel access, the intended live HTTPS backend origin, and live
OAuth/API/upload/chat verification remain necessary. Issue #9 and its plan
checkbox remain open/unchecked. A PR for this preparation should use **Related
to #9**, not **Closes #9**.

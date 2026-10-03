# Production Supabase verification (#11)

Issue #11 is **not complete**. This change adds a repeatable, read-only check and
repairs a Prisma relation that prevented schema validation. It does not create,
reset, migrate, or change the configured Supabase project.

## Provisioning and pricing evidence

Reuse the intended production project if it already exists. Before creating a
project, confirm the current **Free** plan and its limits in the account's
dashboard and on [Supabase pricing](https://supabase.com/pricing). Record the
verification date, project/organization tier, available project allowance,
database size, compute/connection limits, egress, inactivity/pausing behavior,
backup retention, and any costs associated with the selected settings. Confirm
that the project is intended for this production deployment. A project URL or
successful SDK request alone cannot establish its tier or ownership.

Current prices and limits could not be verified in this environment. The network
policy allows the configured project's HTTPS host, but not `supabase.com` or
`api.supabase.com`; no Supabase management capability is available. Historical
free-tier figures in PLAN.md are not evidence of current pricing. No project or
paid resource was created.

## Backend configuration

Set these values in the deployment's secret manager; do not commit them or
include them in logs or smoke reports:

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | HTTPS root URL of the intended production project |
| `SUPABASE_SECRET_KEY` | Backend-only secret/service-role key, never a browser environment variable |
| `DATABASE_URL` | PostgreSQL connection URL from that same project's Connect panel |

Choose a database connection method compatible with the deployment's IPv4/IPv6
network and Prisma. A session pooler is appropriate for a persistent backend.
If using a transaction pooler, follow the current provider guidance for Prisma
and prepared statements; verify that configuration on the actual runtime.
URL-encode password characters when constructing a connection URL.

For Prisma's PostgreSQL connector, require `sslmode=require` and
`sslaccept=strict`. Preserve the provider's remaining required parameters and
configure its trusted certificate material if needed. Do not resolve certificate
errors by accepting invalid certificates. The check rejects absent, permissive,
or duplicate TLS parameters. PostgreSQL's reported TLS state is checked again
when an authorized direct connection is available.

The repository has a Prisma schema but no committed database migration history.
Have the project owner review the actual production schema and an appropriate
baseline/migration before changing it. The corrected
`UploadedDocuments.conversations` relation points to the existing
`ConversationDocuments` join model. This fixes local P1012 validation without
performing a remote schema change. Do not run `db push`, `migrate reset`, or the
repository's reset script as a production verification step.

Keep private relational tables out of the Data API if that is the intended
security design. Review grants and RLS policies separately before exposing
tables. Do not expose tables or relax RLS to make the REST diagnostics pass.

## Read-only smoke check

From `textbook-backend`, with the existing backend dependencies installed:

```bash
python scripts/check_supabase.py
```

The command preserves injected environment values, optionally loads the
backend's `.env` without overriding them, validates configuration, and performs
SDK selects with `LIMIT 0`. It never downloads user/document rows, prints
credentials, or performs writes. REST diagnostics cover all ten table names in
the Prisma schema and representative required columns. `PGRST205` means a table
is unavailable in the PostgREST schema cache; it does not prove that PostgreSQL
lacks the table. Private tables may intentionally have no REST exposure.

The default command returns a JSON report and exits **1** because PostgreSQL
verification is blocked until explicitly requested. An HTTPS-only result does
not verify Prisma connectivity or the database schema.

In an environment authorized to reach the database over TCP, generate the
existing Prisma client locally and run the database checks:

```bash
prisma generate --schema prisma/schema.prisma
python scripts/check_supabase.py --database
```

Client generation requires its existing Prisma runtime/engine downloads; it
does not migrate the database. The second command uses the explicit configured
`DATABASE_URL`, performs only `SELECT` statements, checks `pg_stat_ssl` for the
current connection, validates the table/column probes with `WHERE FALSE`, and
disconnects. No PostgreSQL network attempt is made without `--database` and valid
TLS configuration. Preserve the environment's proxy/CA settings and use its
supported TCP access configuration; a URL is not a TCP grant.

Exit **0** and `verified: true` mean the command's required configuration and
PostgreSQL checks passed. REST results have `required: false` so an intentionally
private schema does not prevent database verification. The result does not
verify provider billing/tier, all constraints/indexes, RLS, end-user
authorization, backups, or application writes. Those remain separate acceptance
evidence for a production deployment.

## Observed results (2 October 2026, Asia/Calcutta)

The configured project was inspected with Supabase Python SDK 2.31.0 using only
zero-row reads. The following observations apply to this environment, not to a
future deployment:

| Check | Observation |
| --- | --- |
| Configuration | Project URL, server key, and PostgreSQL URL are present; runtime readiness observations remain `unknown` |
| TLS configuration | Injected `DATABASE_URL` has no explicit TLS parameters; production preflight fails |
| REST schema | All ten table probes return `PGRST205`; tables are unavailable in the REST schema cache |
| PostgreSQL connection | Not attempted; TCP domain and IP grants are empty, and no generated Prisma client is available |
| Local Prisma schema | Prisma 5.17 validation initially returned P1012; succeeds after the join-relation correction |
| Provider tier and limits | Unverified: pricing and management hosts are outside the HTTP allowlist |

The REST failures require the owner to inspect the database and API exposure
privately; they do not justify a schema reset or public access change. Issue #11
remains open until the intended production project's Free tier/current limits
are confirmed and the database configuration, reviewed schema, security, and
authorized PostgreSQL smoke verification are complete.

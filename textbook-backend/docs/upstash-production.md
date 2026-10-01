# Production Upstash response cache

The backend already reads and writes scoped query responses through Upstash Redis
REST in `services/caching.py`. Production uses the same integration; no separate
cache implementation or embedding service is required by this configuration task.

## Provisioning and runtime configuration

1. In the [Upstash console](https://console.upstash.com/), select the intended Redis
   database and a region near the backend. Reuse an existing intended database
   instead of creating another one. Confirm its account, region, plan, and limits
   before accepting any paid resource or plan change.
2. Configure these **backend-only** runtime variables using the hosting provider's
   secret configuration:

   | Variable | Value |
   | --- | --- |
   | `UPSTASH_REDIS_REST_URL` | The database's HTTPS REST endpoint, ending in `.upstash.io` |
   | `UPSTASH_REDIS_REST_TOKEN` | The database's read/write REST token, not its read-only token |

   Copy the REST values from the database console. Do not use its TCP Redis URI,
   expose the token with a `NEXT_PUBLIC_` variable, or commit a populated `.env`.
   The installed `upstash-redis` package handles authenticated HTTPS requests.
   Preserve runtime proxy and CA settings when the hosting environment supplies
   them, and allow HTTPS to the selected database endpoint.
3. Restart/redeploy the backend after changing variables. The cache client is
   created when the service module is imported. Missing credentials disable the
   application's optional cache, so a running API alone does not prove readiness.
4. Run the smoke command below **inside the deployed backend runtime**, with the
   same environment used by the application. A check from a development machine
   establishes access from that machine only.

## Repeatable smoke verification

From `textbook-backend`, after installing `requirements.txt`:

```bash
python scripts/verify_upstash.py
```

The command validates both variables and the HTTPS provider endpoint, then uses
the application's existing `set_cached_response` and `get_cached_response`
functions. It checks the initial miss, JSON payload round-trip, a positive TTL
bounded by 60 seconds, and misses for another random user and an empty document
selection. It deletes its temporary key in a `finally` block and confirms removal.
Each run uses a new random user/notebook/document scope. It never scans, flushes,
invalidates real-user caches, invokes chat generation, or creates provider resources.

A successful run exits `0` and prints:

```text
PASS: Upstash cache write/read, TTL, scope isolation, and temporary-key cleanup.
```

A failed run exits `1` with a sanitized check name. Raw SDK errors and credentials
are excluded from command output. Cleanup failure is reported as failure even if
the earlier checks passed; check endpoint access and write permissions. A failed
expiry command followed by unavailable cleanup can leave that temporary key, so
do not treat a failed check as evidence that every temporary key has expired.

The normal successful run sends ten Redis commands before SDK retries. Routine
tests are offline and do not touch the configured database:

```bash
python -m pytest tests/test_cache.py -q
```

## Limits and pricing verification

Use the current [Upstash Redis pricing page](https://upstash.com/pricing/redis) and
the selected database's console before choosing or changing a plan. The
[provider's Pricing & Limits documentation](https://upstash.com/docs/redis/overall/pricing)
points to that page. Record the verification date and the actual selected plan's
command allowance, storage allowance, transfer allowance, maximum value/request
size, throughput limit, overage behavior, and price. Confirm whether the limits
apply per database or per account, and whether exceeding them rejects commands or
adds charges. Do not budget from the historical "10k free daily requests" in the
issue or plan without checking these current sources.

An application cache hit performs one `JSON.GET`. A miss followed by a successful
write performs `JSON.GET`, `JSON.SET`, and `EXPIRE`; user invalidation adds `SCAN`
and `DEL` commands. Include those commands, smoke checks, and SDK retries in the
provider's applicable billing units. The existing application TTL defaults to
86,400 seconds. Redis or quota errors fall back to uncached behavior, so monitor
cache failure logs and database usage independently of API uptime.

## Verification evidence and remaining acceptance

On 2026-10-02, the configured Upstash endpoint in the managed execution runtime
passed the real smoke command above, including JSON read/write, bounded TTL,
scope isolation, and confirmed deletion. The offline tests passed separately.
The existing cache service and application contracts were unchanged.

This establishes provider access from that runtime. It does not establish a
deployed backend's configuration, the selected account's plan, or current pricing.
The official pricing endpoint was denied by the environment's outbound policy
(`403` on the HTTPS proxy tunnel). The official Upstash documentation source on
GitHub was reachable, but its pricing page only redirects to that blocked URL.
Current prices and limits therefore remain unverified. Issue #13 and its plan
checkbox remain open until current plan/pricing evidence and a smoke run from the
deployed production backend are available.

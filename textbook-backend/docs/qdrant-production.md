# Production Qdrant verification

The backend expects a Cloud collection named `textbook_chunks` with a named
`dense-text` vector (1024 dimensions, Cosine distance) and a named `sparse-text`
vector. The payload indexes are `user_id`, `notebook_id`, `document_id`, and
`chunk_id` as keywords, plus `page_number` as an integer. `notebook_id` must have
`is_tenant=true`. Retrieval still filters on both user and notebook; the tenant
index is an optimization, not an authorization boundary.

## Configure and verify

Install the backend requirements and provide `QDRANT_URL` and `QDRANT_API_KEY` in
the deployment's secret environment. `QDRANT_TIMEOUT_SECONDS` defaults to 30.
Use the configured HTTPS endpoint and retain the environment's proxy and CA
settings. Never commit API keys or include them in command-line arguments.

Run from `textbook-backend`:

```sh
python scripts/qdrant_smoke.py
```

The default smoke reads collection metadata, validates both vector names and all
required indexes, executes one dense and one sparse query with a fresh synthetic
user/notebook/document scope, and counts points. It uses synthetic vectors, skips
model inference, and requests neither payloads nor stored vectors. It creates no
collections, indexes, or points and prints a JSON result. Any configuration or
API failure exits with status 1; remote exception messages are redacted from the
output because they can contain sensitive response data.

For an operator deliberately provisioning a missing collection or indexes:

```sh
python scripts/qdrant_smoke.py --provision
```

This uses the same idempotent initialization as backend startup. An existing
compatible collection is retained. Missing payload indexes are added, including
the notebook tenant index. Incompatible existing vector configuration fails
before index writes and needs a separate reviewed data migration. The script
never recreates collections, deletes collections, or writes points. Use
`--collection NAME` when verifying an explicitly selected alternate collection.

## Evidence for issue #12

Read-only verification on October 2, 2026 (Asia/Calcutta), against the configured
Qdrant Cloud endpoint with `qdrant-client` 1.19.1:

```json
{"status": "passed", "collection": "textbook_chunks", "health": "green", "point_count": 1063, "vector_queries": ["dense-text", "sparse-text"], "payload_indexes": ["user_id", "notebook_id", "document_id", "page_number", "chunk_id"], "notebook_tenant_index": true}
```

The collection already existed with stored data. Both filtered query endpoints
accepted the configured vector contracts and returned no points for the synthetic
tenant. No provisioning command or Cloud mutation was performed. Local tests also
exercise both dense and sparse queries against fixtures from two users and two
notebooks to check that filters select only the intended scope. The live smoke
does not replace an authenticated end-to-end application test.

## Outstanding provider confirmation

The deployed data-plane API confirms collection configuration and query access;
it does not establish the cluster's RAM, billing plan, free-tier entitlement, or
current pricing. The managed environment permits the configured cluster host but
does not permit the official public pricing/management hosts, and no Qdrant Cloud
management integration is available. Historical plan claims of a free-forever
1 GB cluster have therefore **not been verified** and issue #12 remains open.

Before completing the issue, verify the existing cluster's plan and RAM in the
Qdrant Cloud console, and record current free-tier limits and pricing from
[Qdrant pricing](https://qdrant.tech/pricing/) or current provider documentation.
Confirm whether any expiration, storage, backup, or regional restrictions apply
to the selected cluster. Do not create or resize a paid resource as part of this
verification.

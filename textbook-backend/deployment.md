# Backend container deployment

The Docker image runs FastAPI as a long-running, non-root process with one Uvicorn
worker. CPU-only PyTorch avoids installing CUDA libraries; one worker prevents
each model from being duplicated across processes. Python 3.11 and Debian
Bookworm provide binary wheels and OpenMP for Sentence Transformers, the BGE
embedder, Cross-Encoder reranker, and FastEmbed.

## Build and run

From the repository root:

```sh
docker build -t textbook-backend ./textbook-backend
docker run --rm --name textbook-backend -p 8000:8000 \
  --env-file ./textbook-backend/.env textbook-backend
```

Keep `.env` private. The build context excludes environment files, private keys,
local model caches, and test/evaluation data. Supply credentials at runtime,
never as build arguments. For builds behind a TLS-intercepting proxy, pass a
combined trusted CA bundle as a BuildKit secret:

```sh
docker build --secret id=proxy_ca,src=/path/to/combined-ca-bundle.pem \
  -t textbook-backend ./textbook-backend
```

Runtime HTTPS clients behind such a proxy also need the combined CA bundle
mounted read-only and the relevant `SSL_CERT_FILE`/`REQUESTS_CA_BUNDLE` settings.
Do not disable certificate verification.

Required runtime variables are `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`QDRANT_URL`, `QDRANT_API_KEY`, and `GOOGLE_API_KEY`. Supply
`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` to enable the existing cache
and document-status features. Supply the repository's Langfuse settings to enable
telemetry. `DATABASE_URL` is needed by Prisma admin tooling, but the current
Python API uses Supabase directly: it does not import a generated Prisma client.
The image therefore installs the existing Prisma dependency without running
`prisma generate`, schema migrations, database resets, or seeding. If Python ORM
use is introduced, first validate the backend schema and generate its client
during the image build with access to the Prisma CLI/engine download hosts.

The server binds to `0.0.0.0` and honors `PORT` (default `8000`). For a different
port, adjust both the environment and published port:

```sh
docker run --rm -e PORT=10000 -p 10000:10000 \
  --env-file ./textbook-backend/.env textbook-backend
curl --fail http://localhost:10000/healthz
```

`GET /healthz` returns `{"status":"ready"}` only after the existing Qdrant
collection/index initialization succeeds. Startup failures stop the service.
The probe tracks startup readiness; it does not query every external dependency
or load/test ML models on every request. Docker gives startup a two-minute grace
period. Uvicorn allows 120 seconds for graceful shutdown by default; override
`UVICORN_TIMEOUT_GRACEFUL_SHUTDOWN` if the platform's termination window differs.
Ingestion uses in-process background work, so interrupted uploads still need
operational recovery; the container does not add a durable task queue.

## Model memory, downloads, and cache

Budget at least **4 GiB of RAM**, then measure peak memory with representative
uploads and queries. The BGE-Large and cross-encoder weights alone make small
512 MiB instances unsuitable. Model loading remains lazy: the first upload or
search downloads weights and takes longer than subsequent requests. Allow
outbound HTTPS to Hugging Face and its model/CDN hosts. Production verification
must include an upload plus a retrieval request, not only the health endpoint.

`HF_HOME` and `FASTEMBED_CACHE_PATH` point to writable directories under
`/app/model-cache`. Docker users can persist them with a named volume:

```sh
docker run --rm -p 8000:8000 --env-file ./textbook-backend/.env \
  --mount source=textbook-model-cache,target=/app/model-cache textbook-backend
```

On hosted services, configure persistent storage separately if required, ensure
UID `10001` can write to it, and set the two cache variables to that mount.
Without storage, a replaced container downloads models again. `OMP_NUM_THREADS`
defaults to `2`; tune it to the instance's CPU allocation.

## Render

The root `render.yaml` is a reviewable Blueprint for a Docker web service with
`/healthz` as its health check, a configurable platform port, and manual deploys.
It selects Render's **paid Pro plan (4 GiB)** to accommodate the models; review
current pricing and memory requirements before applying it. No resource is
created by committing this file.

1. In a configured Render account, create a Blueprint from the repository and
   select the reviewed default-branch commit containing this change.
2. Review the paid plan and supply the required secret values in Render. Set
   optional Redis/Langfuse variables as needed. Ensure the existing Supabase
   schema/storage bucket and Qdrant access are ready.
3. Deploy manually and check startup logs and `/healthz`. Verify a real document
   upload, retrieval/reranking, and chat request with an authorized account.
4. Configure the frontend's `BACKEND_URL` to the HTTPS backend URL
   and redeploy the frontend. This backend setup does not alter frontend hosting.

For Railway, create a Docker service with root directory `textbook-backend`, use
the included Dockerfile, supply the same variables, set `/healthz` as the health
check, and allocate memory for both models. The launcher honors Railway's
injected `PORT`.

## Verification and deployment status

Run the isolated readiness/launcher/probe tests without external credentials:

```sh
python -m unittest discover -s textbook-backend/tests -p test_container.py -v
```

These tests stub the existing external startup dependency and routers; they do
not claim that cloud storage, models, or deployment are working. Release
verification also requires building the image, checking its health after startup
with valid runtime configuration, and running the real upload/search/chat flow.

This change supplies container and hosting configuration. It does **not** claim
a live Render/Railway deployment: no hosting account credentials are configured
in the issue-processing environment. Issue #10 remains open until an authorized
hosted deployment and end-to-end verification succeed.

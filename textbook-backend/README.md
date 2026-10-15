# Textbook backend: AI document research assistant

The FastAPI backend for Textbook, an AI document research assistant modeled after Google NotebookLM. Built with FastAPI, LangGraph, Prisma, PostgreSQL via Supabase, Qdrant Cloud, and Google Gemini.

---

## Architecture and tech stack

- **Framework:** FastAPI (Python 3.10+)
- **Relational database:** PostgreSQL via Supabase
- **ORM:** Prisma Client Python (`prisma`)
- **Vector database:** Qdrant Cloud (Dense HNSW + Sparse BM25 + Payload Filters)
- **Dense embeddings:** `BAAI/bge-large-en-v1.5` (1024-dimension normalized)
- **Sparse embeddings:** `Qdrant/bm25` (FastEmbed)
- **Reranker:** `BAAI/bge-reranker-base` (Cross-Encoder)
- **Agent orchestration:** LangGraph (StateGraph with reflection and conditional retry loops)
- **LLM provider:** Google Gemini (`gemini-3.6-flash` via `langchain-google-genai`)
- **PDF extraction:** PyMuPDF (`pymupdf`)
- **Benchmarking and evals:** Deterministic information retrieval metrics and LLM-as-a-judge

---

## Directory structure

```text
textbook-backend/
├── main.py                # FastAPI entry point and route mounting
├── requirements.txt       # Python dependencies
├── .env                   # Environment variables (Qdrant, Supabase, Google)
├── README.md              # Backend documentation
├── core/                  # LLM setup and core configuration
│   └── llm.py             # Google Gemini client initialization
├── db/                    # Database clients
│   ├── qdrant.py          # Qdrant client connection
│   └── supabase.py        # Supabase client connection
├── prisma/                # Prisma ORM schema
│   └── schema.prisma      # Relational database models
├── routers/               # API endpoint definitions
│   ├── __init__.py        # Aggregator router (/api)
│   ├── upload.py          # POST /api/upload - Document storage and ingestion
│   ├── search.py          # POST /api/search - Hybrid search and cross-encoder
│   └── chat.py            # POST /api/chat and POST /api/agent/chat
├── services/              # Core business and AI services
│   ├── parser.py          # PDF text extraction (PyMuPDF)
│   ├── text_splitter.py   # Recursive character splitting
│   ├── chunker.py         # Semantic, parent-child, and code chunking
│   ├── embedder.py        # Dense (BGE-Large) and sparse (BM25) vectorizers
│   ├── indexing.py        # Qdrant collection setup and payload indexing
│   ├── ingestion.py       # Batch vector generation and point upsertion
│   ├── analyzer.py        # Query rewriting, sub-queries, and HyDE generation
│   ├── retriever.py       # Multi-tenant hybrid search and RRF fusion (k=60)
│   ├── reranker.py        # Cross-encoder (BAAI/bge-reranker-base)
│   ├── generator.py       # Lost-in-the-middle reordering and citation prompt
│   └── storage.py         # Supabase bucket upload and download functions
├── agents/                # LangGraph agentic workflows
│   ├── state.py           # AgentState TypedDict schema
│   ├── nodes.py           # planner, retriever, generator, reflection nodes
│   └── graph.py           # Compiled LangGraph state machine
├── evals/                 # Evaluation suite
│   ├── datasets/          # Golden and synthetic evaluation datasets
│   ├── metrics/           # Retrieval (math) and generation (LLM-judge) metrics
│   ├── eval_retrieval.py  # Retrieval benchmark runner
│   ├── eval_generation.py # Generation benchmark runner
│   ├── run_evals.py       # Unified CLI evaluation runner
│   └── reports/           # Evaluation reports (.json, .md)
└── scripts/               # Utility scripts
    ├── reset_db.py        # Reset and initialize Qdrant collection
    └── seed_corpus.py     # Ingest ai-engineer.pdf benchmark corpus
```

---

## Quickstart and local setup

### 1. Prerequisites
- Python 3.10+
- Node.js (for Prisma CLI)
- Accounts for Qdrant Cloud, Supabase, and Google AI Studio

### 2. Environment setup
Create a `.env` file in `textbook-backend/`:
```env
GOOGLE_API_KEY="your-google-gemini-api-key"
QDRANT_URL="https://your-cluster-id.us-east4-0.gcp.cloud.qdrant.io:6333"
QDRANT_API_KEY="your-qdrant-api-key"
QDRANT_TIMEOUT_SECONDS="30"
DATABASE_URL="postgresql://postgres.your-project:your-password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=verify-full"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SECRET_KEY="your-supabase-service-role-key"
```

PostgreSQL connections require `sslmode=require` or `sslmode=verify-full` in
`DATABASE_URL`; the backend enforces certificate and hostname verification for
both. It uses `PGSSLROOTCERT` when set, otherwise the system CA file or Certifi's
CA bundle (including on Windows). Set `PGSSLROOTCERT` to a trusted CA PEM file if
your database uses a CA outside that bundle. A database configuration or connection
failure returns 503 from `/api/notebooks` and also prevents image cleanup; Qdrant
startup can still succeed independently.

For Supabase's pooler, download the database CA certificate from **Database
Settings → SSL Configuration** in the Supabase dashboard, save it locally, and
set its path in `.env`, for example:

```env
PGSSLROOTCERT="C:/Users/neera/Downloads/prod-ca-2021.crt"
```

URL-encode reserved characters in the password portion of `DATABASE_URL`
(for example, `@` becomes `%40`). Restart the backend after changing `.env`.

### 3. Installation

**Create virtual environment:**
```powershell
# Windows (PowerShell / Command Prompt)
python -m venv venv

# macOS / Linux
python3 -m venv venv
```

**Activate virtual environment:**
```powershell
# Windows (PowerShell) - Note the leading ".\" or ".\venv\Scripts\Activate.ps1"
.\venv\Scripts\Activate.ps1

# (Optional) If PowerShell blocks script execution, run this once:
# Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Windows (Command Prompt - cmd.exe)
venv\Scripts\activate.bat

# macOS / Linux (bash/zsh)
source venv/bin/activate
```

**Install dependencies & setup Prisma:**
```powershell
# Install dependencies
python -m pip install -r requirements.txt

# Optional: generate the client for Prisma-based tools (does not create tables)
python -m prisma generate
```

If `pip` reports a launcher error referencing an old project path after moving
the repository, use `python -m pip` to bypass that launcher. Repair pip and install
the dependencies in the activated environment:

```powershell
python -m pip install --force-reinstall pip
python -m pip install -r requirements.txt
```

If the environment's Python also fails, recreate `venv` at the current project
path and reinstall the requirements. Virtual environments should be recreated
after moving a project because installed command launchers can retain old paths.

### 4. Create the PostgreSQL tables

For a new Supabase project with an empty application schema, review
`prisma/baseline.sql` (generated from the full current Prisma schema) and
`prisma/baseline-security.sql`, then run from `textbook-backend/`:

```powershell
python scripts/init_database.py --apply
```

This creates all 12 application tables, enums, indexes, foreign keys, attachment
constraints, and backend-only table protections in one transaction. It uses
`DATABASE_URL` and `PGSSLROOTCERT` from `.env` and refuses to run if the target
schema already contains tables/views. Startup and `prisma generate` do not apply
the schema. The `prisma/changes/` scripts are upgrades for older databases; do
not run them after initializing this current baseline. For an existing database,
follow the deployment guidance in `docs/chat-history.md`.

When updating the baseline for a future empty database, regenerate its Prisma
portion and review the companion security SQL:

```powershell
python -m prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script --output prisma/baseline.sql
```

### 5. Optional sample seeding
```powershell
# Reset Qdrant collection and configure HNSW and payload indexes
python scripts/reset_db.py

# Ingest and embed the sample textbook (ai-engineer.pdf)
python scripts/seed_corpus.py
```

### 6. Run development server
```powershell
python -m uvicorn main:app --reload --port 8000
```
- API docs: `http://localhost:8000/docs`

### 7. Run evaluations
```powershell
# Run the complete retrieval and generation benchmark
python evals/run_evals.py
```

---

## API endpoints summary

| Method | Endpoint | Description | Status |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/upload` | Upload multi-format documents to Supabase Storage | Working |
| `POST` | `/api/search` | Two-stage hybrid search (dense + BM25 RRF + cross-encoder) | Working |
| `POST` | `/api/chat` | Standard RAG pipeline with inline source citations | Working |
| `POST` | `/api/agent/chat` | LangGraph agentic self-reflection chat pipeline | Working |


### Conversational intent routing

Both `/api/chat` and `/api/agent/chat` classify requests as `casual_chat`,
`textbook_rag`, or `general_knowledge`. Greetings and explicit requests to answer
without documents bypass retrieval. Other factual questions search selected sources
first; when no chunks meet the relevance threshold, the response uses general
knowledge with `is_grounded: false`, no citations, and a `warning` for the UI.
Documents still being indexed retain the processing notice.

Send optional `history` as up to 20 `{ "role": "user" | "assistant", "content": "..." }`
messages preceding the current query (8,000 characters per message). The analyzer
rewrites follow-ups into standalone retrieval queries. Requests with history bypass
response caching; stateless requests use a versioned cache namespace.

`CHAT_MIN_RERANK_SCORE` controls the minimum BGE cross-encoder logit accepted by
chat (default `0.0`). This is a starting threshold and should be calibrated against
representative source/query pairs; it is not a probability. Search API behavior is
unchanged. Intent classification always runs for chat; `use_analysis` remains in
the request schema for compatibility.

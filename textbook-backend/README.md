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
DATABASE_URL="postgresql://postgres.your-project:your-password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SECRET_KEY="your-supabase-service-role-key"
```

### 3. Installation
```powershell
# Create virtual environment
python -m venv venv

# Activate virtual environment (Windows)
.\venv\Scripts\Activate

# Install dependencies
pip install -r requirements.txt

# Generate Prisma client
prisma generate
```

### 4. Database seeding and setup
```powershell
# Reset Qdrant collection and configure HNSW and payload indexes
python scripts/reset_db.py

# Ingest and embed the sample textbook (ai-engineer.pdf)
python scripts/seed_corpus.py
```

### 5. Run development server
```powershell
uvicorn main:app --reload --port 8000
```
- API docs: `http://localhost:8000/docs`

### 6. Run evaluations
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

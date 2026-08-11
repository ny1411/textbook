# Textbook Backend — Advanced AI Document Research Assistant

An AI-powered document research assistant backend modeled after **NotebookLM**. Built using **FastAPI**, **Prisma ORM**, **PostgreSQL**, **Qdrant Vector DB**, and **LangGraph**.

---

## Tech Stack

- **Framework:** FastAPI (Python)
- **Database (Relational):** PostgreSQL via Supabase
- **ORM:** Prisma Client Python (`prisma`)
- **Vector Database:** Qdrant Cloud (Dense + Sparse Vectors)
- **Caching:** Redis (Upstash)
- **AI & Data Engineering:**
  - **PDF Parsing:** PyMuPDF (`fitz`)
  - **Embeddings:** Sentence Transformers (`all-MiniLM-L6-v2`)
  - **Keyword Indexing:** BM25 (`rank_bm25`)
  - **Reranking:** Cross-Encoders (`sentence-transformers`)
  - **Agentic Workflow:** LangGraph
  - **Evaluation:** DeepEval / Ragas
  - **Observability:** Langfuse Cloud
- **Deployment:** Docker, Render / Railway

---

## Project Structure (Planned & Current)

```text
textbook-backend/
├── main.py                # FastAPI entry point & app initialization
├── requirements.txt       # Python package requirements
├── README.md              # Backend documentation & roadmap
├── venv/                  # Python virtual environment (git-ignored)
├── prisma/                # Prisma schema and migrations (to be initialized)
│   └── schema.prisma
├── database/              # DB clients & connections
│   ├── models.py
│   └── qdrant_client.py
├── routers/               # API route definitions
│   ├── upload.py
│   ├── search.py
│   └── chat.py
└── services/              # Core business & AI logic
    ├── parser.py          # PDF text extraction
    ├── chunker.py         # Semantic & Parent-Child text splitting
    ├── embeddings.py      # Dense vector generation
    ├── sparse_index.py    # BM25 keyword indexing
    ├── retriever.py       # Hybrid retrieval & RRF
    ├── reranker.py        # Cross-encoder re-scoring
    └── generator.py       # RAG answer generation & citations
```

---

## Quickstart & Local Setup

### 1. Prerequisites
- Python 3.10+
- Node.js (required by Prisma CLI)

### 2. Environment Setup
```powershell
# Navigate into backend directory
cd textbook-backend

# Create virtual environment
python -m venv venv

# Activate virtual environment (Windows PowerShell)
.\venv\Scripts\Activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Initialize Prisma ORM
```powershell
prisma init
```

### 4. Run Development Server
```powershell
uvicorn main:app --reload
```
Server will be running at `http://127.0.0.1:8000`. Access interactive API docs at `http://127.0.0.1:8000/docs`.

---

## API Endpoints Summary

| Method | Endpoint | Description | Status |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Health check endpoint | Working |

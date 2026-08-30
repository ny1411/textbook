# Textbook: AI document research assistant

A document research assistant modeled after Google NotebookLM. Built with FastAPI, LangGraph, Qdrant, Supabase, Prisma, and Next.js 16. It includes two-stage hybrid retrieval, cross-encoder reranking, an agentic reflection loop in LangGraph, and a benchmark evaluation suite.

---

## Table of contents

- [Overview](#overview)
- [System architecture](#system-architecture)
- [Key features](#key-features)
- [Repository structure](#repository-structure)
- [Tech stack](#tech-stack)
- [Database and schema design](#database-and-schema-design)
- [Core pipelines and logic](#core-pipelines-and-logic)
  - [1. Ingestion and chunking](#1-ingestion-and-chunking)
  - [2. Dual-vector embeddings and indexing](#2-dual-vector-embeddings-and-indexing)
  - [3. Query understanding and HyDE](#3-query-understanding-and-hyde)
  - [4. Two-stage hybrid retrieval and reranking](#4-two-stage-hybrid-retrieval-and-reranking)
  - [5. Generation and lost-in-the-middle ordering](#5-generation-and-lost-in-the-middle-ordering)
  - [6. Agentic self-reflection loop with LangGraph](#6-agentic-self-reflection-loop-with-langgraph)
- [Evaluation suite](#evaluation-suite)
  - [Retrieval metrics](#retrieval-metrics-deterministic)
  - [Generation and citation metrics](#generation-and-citation-metrics-llm-as-a-judge)
  - [Running evaluations](#running-evaluations)
- [API reference](#api-reference)
- [Getting started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Environment configuration](#environment-configuration)
  - [Backend setup](#backend-setup)
  - [Frontend setup](#frontend-setup)
  - [Database seeding and ingestion](#database-seeding-and-ingestion)
- [Roadmap and implementation status](#roadmap-and-implementation-status)
- [License](#license)

---

## Overview

Textbook parses textbooks, research papers, and multi-format documents for grounded question answering.

The system uses:
1. **Multi-strategy chunking.** Splits text along semantic boundaries, creates hierarchical parent-child chunks, or splits recursively by programming language syntax.
2. **Dual-index hybrid search.** Queries dense vectors (`BAAI/bge-large-en-v1.5`, 1024 dimensions) and sparse lexical vectors (`Qdrant/bm25` via FastEmbed) at the same time, merging results with Reciprocal Rank Fusion (RRF).
3. **Cross-encoder reranking.** Re-scores candidate passages with `BAAI/bge-reranker-base` using cross-attention over query-document pairs.
4. **Agentic self-reflection loop.** Runs a LangGraph state machine that analyzes the query, decomposes sub-queries, generates candidate answers, and checks factual grounding against source chunks before returning a response.
5. **Evaluation suite.** Measures retrieval quality with standard information retrieval metrics and grades generation with LLM-as-a-judge evaluators.

---

## System architecture

```mermaid
flowchart TB
    subgraph Client ["Client layer"]
        UI["Next.js 16 Frontend\n(React 19, Tailwind v4)"]
    end

    subgraph API ["FastAPI Gateway (/api)"]
        UploadEP["/api/upload\n(MIME validation)"]
        SearchEP["/api/search\n(Hybrid + Rerank)"]
        ChatEP["/api/chat\n(Standard RAG)"]
        AgentEP["/api/agent/chat\n(LangGraph state machine)"]
    end

    subgraph Ingestion ["Ingestion and parsing pipeline"]
        PDF["PyMuPDF Parser\n(extract_text_with_pymupdf)"]
        Chunker["Chunking engine\n(Semantic / Parent-Child / Recursive)"]
        Embedder["Dual embedder\n- Dense: bge-large-en-v1.5\n- Sparse: Qdrant/bm25"]
    end

    subgraph AgentLoop ["LangGraph agentic workflow"]
        Planner["Planner node\n(Query rewriter, sub-queries, HyDE)"]
        RetrieverNode["Retriever node\n(Multi-query hybrid search)"]
        GeneratorNode["Generator node\n(Lost-in-the-middle context packing)"]
        ReflectorNode["Reflection node\n(Factuality judge and confidence scoring)"]
    end

    subgraph Storage ["Databases and storage"]
        SupabaseDB[("PostgreSQL (Supabase)\nPrisma ORM (9 models)")]
        SupabaseStorage[("Supabase bucket\n(textbook-documents)")]
        QdrantDB[("Qdrant vector DB\n- Dense HNSW index\n- Sparse BM25 index\n- Payload filters")]
    end

    subgraph EvalSuite ["Evaluation suite"]
        EvalRetrieval["eval_retrieval.py\n(Recall@K, MRR, NDCG, MAP)"]
        EvalGen["eval_generation.py\n(Faithfulness, relevance, citations)"]
        Reports["evals/reports/\n(JSON and Markdown scorecards)"]
    end

    UI --> UploadEP
    UI --> SearchEP
    UI --> ChatEP
    UI --> AgentEP

    UploadEP --> SupabaseStorage
    UploadEP --> SupabaseDB
    UploadEP --> Ingestion
    Ingestion --> QdrantDB

    SearchEP --> Embedder
    SearchEP --> QdrantDB

    ChatEP --> Embedder
    ChatEP --> QdrantDB

    AgentEP --> Planner
    Planner --> RetrieverNode
    RetrieverNode --> QdrantDB
    RetrieverNode --> GeneratorNode
    GeneratorNode --> ReflectorNode
    ReflectorNode -- "Unfaithful or low confidence" --> RetrieverNode
    ReflectorNode -- "Grounded or max iterations" --> AgentEP

    EvalRetrieval --> QdrantDB
    EvalGen --> QdrantDB
    EvalRetrieval --> Reports
    EvalGen --> Reports
```

---

## Key features

- **Multi-format document ingestion.** Ingests PDF, DOCX, CSV, TXT, Markdown, spreadsheets, presentations, audio, and images into Supabase Storage.
- **Hierarchical parent-child chunking.** Searches across 400-character child chunks, then passes the surrounding 2000-character parent chunk to the LLM for broader context.
- **Semantic chunking.** Uses embedding distances to identify natural topic transitions.
- **Two-stage hybrid retrieval.** Runs dense vector search and sparse BM25 keyword search in parallel, fuses rankings with RRF, then scores the top candidates with a cross-encoder.
- **Query expansion and HyDE.** Generates hypothetical document embeddings and decomposes complex questions into targeted sub-queries.
- **Lost-in-the-middle context ordering.** Reorders retrieved chunks so the highest-scoring passages sit at the start and end of the prompt context window.
- **Inline citations.** Adds source tags with document ID, page number, chunk reference, and reranking score to each factual statement.
- **Agentic self-correction.** Evaluates candidate answers for hallucinations, assigns a 0 to 100 confidence score, and runs another retrieval pass if claims lack grounding.
- **Automated evaluation suite.** Measures 7 retrieval metrics and 7 generation metrics against golden and synthetic test sets.

---

## Repository structure

```text
notebook-lm-copy/
├── PLAN.md                               # Master technical plan and phase tracker
├── learning-plan.md                      # AI engineer learning roadmap and stack notes
├── rag-learning-roadmap.md               # RAG curriculum and concepts checklist
├── ai-engineer.pdf                       # Benchmark corpus document
│
├── textbook-backend/                     # FastAPI backend application
│   ├── main.py                           # Application entry point and route mounting
│   ├── requirements.txt                  # Python dependencies
│   ├── .env                              # Environment variables (Qdrant, Supabase, Google)
│   ├── README.md                         # Backend documentation
│   │
│   ├── core/
│   │   └── llm.py                        # LLM provider wrapper (Google Gemini 3.6 Flash)
│   │
│   ├── db/
│   │   ├── qdrant.py                     # Qdrant client connection
│   │   └── supabase.py                   # Supabase client connection
│   │
│   ├── prisma/
│   │   └── schema.prisma                 # Relational models (Users, Notebooks, Uploads, etc.)
│   │
│   ├── routers/
│   │   ├── __init__.py                   # Central API router aggregator (/api)
│   │   ├── upload.py                     # POST /api/upload - Document storage and ingestion
│   │   ├── search.py                     # POST /api/search - Hybrid search and cross-encoder
│   │   └── chat.py                       # POST /api/chat and POST /api/agent/chat
│   │
│   ├── services/
│   │   ├── parser.py                     # PyMuPDF PDF text extraction
│   │   ├── text_splitter.py              # RecursiveCharacterTextSplitter helper
│   │   ├── chunker.py                    # Semantic, parent-child, and code chunkers
│   │   ├── embedder.py                   # Dense (BGE-Large) and sparse (BM25) vectorizers
│   │   ├── indexing.py                   # Qdrant collection setup and payload indexing
│   │   ├── ingestion.py                  # Batch vector generation and point upsertion
│   │   ├── analyzer.py                   # Query rewriting, sub-queries, and HyDE generation
│   │   ├── retriever.py                  # Multi-tenant hybrid search and RRF fusion (k=60)
│   │   ├── reranker.py                   # Cross-encoder (BAAI/bge-reranker-base)
│   │   ├── generator.py                  # Context reordering, citation formatting, and prompt
│   │   └── storage.py                    # Supabase bucket upload and download functions
│   │
│   ├── agents/
│   │   ├── state.py                      # AgentState TypedDict definition
│   │   ├── nodes.py                      # planner, retriever, generator, reflection nodes
│   │   └── graph.py                      # Compiled LangGraph state machine with conditional loop
│   │
│   ├── evals/                            # Evaluation suite
│   │   ├── datasets/
│   │   │   ├── golden_qa.json            # Curated QA dataset with ground-truth contexts
│   │   │   └── synthetic_qa.json         # Synthetic QA dataset
│   │   ├── metrics/
│   │   │   ├── retrieval.py              # Recall@K, Precision@K, HitRate, MRR, NDCG, MAP, R-Precision
│   │   │   └── generation.py             # Faithfulness, relevance, correctness, citations, rejection
│   │   ├── eval_retrieval.py             # Retrieval evaluation runner
│   │   ├── eval_generation.py            # Generation and groundedness runner
│   │   ├── run_evals.py                  # CLI evaluation runner with Rich output
│   │   └── reports/                      # Evaluation reports (.json, .md)
│   │
│   └── scripts/
│       ├── reset_db.py                   # Recreates Qdrant collection with payload indexes
│       └── seed_corpus.py                # Extracts, chunks, embeds, and indexes ai-engineer.pdf
│
└── textbook-frontend/                    # Next.js 16 web application
    ├── package.json                      # Next.js 16.3.0, React 19.2.8, Tailwind CSS v4
    ├── tsconfig.json                     # TypeScript compiler configuration
    ├── next.config.ts                    # Next.js build configuration
    ├── app/
    │   ├── layout.tsx                    # Root application layout
    │   ├── page.tsx                      # Dashboard and landing page
    │   └── globals.css                   # Tailwind v4 styles
    └── public/                           # SVG icons and static assets
```

---

## Tech stack

### Backend and AI engineering
| Component | Technology | Description |
| :--- | :--- | :--- |
| **API framework** | [FastAPI](https://fastapi.tiangolo.com/) | Asynchronous Python REST API |
| **Server** | [Uvicorn](https://www.uvicorn.org/) | ASGI web server |
| **Relational database** | [PostgreSQL (Supabase)](https://supabase.com/) | User metadata, notebooks, and message history |
| **ORM** | [Prisma Client Python](https://prisma-client-py.readthedocs.io/) | Database client |
| **Object storage** | [Supabase Storage](https://supabase.com/storage) | File storage in `textbook-documents` bucket |
| **Vector database** | [Qdrant Cloud](https://qdrant.tech/) | Dense and sparse vectors with payload filtering |
| **Dense embeddings** | `BAAI/bge-large-en-v1.5` | 1024-dimensional normalized dense vectors |
| **Sparse embeddings** | `Qdrant/bm25` (FastEmbed) | Lexical sparse vectors |
| **Reranking** | `BAAI/bge-reranker-base` | Cross-encoder scoring query-document pairs |
| **Agent orchestration** | [LangGraph](https://langchain-ai.github.io/langgraph/) | Cyclical state graphs with self-reflection |
| **LLM provider** | Google Gemini (`gemini-3.6-flash`) | Reasoning, structured outputs, and prompt chaining |
| **PDF parsing** | [PyMuPDF (`fitz`)](https://pymupdf.readthedocs.io/) | Document text extraction |
| **Console formatting** | [Rich](https://rich.readthedocs.io/) | CLI tables and progress visualization |

### Frontend application
| Component | Technology | Description |
| :--- | :--- | :--- |
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router) | React Server Components and routing |
| **Library** | [React 19](https://react.dev/) | UI component rendering |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) | Utility-first CSS |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) | Static type checking |

---

## Database and schema design

The relational schema lives in `textbook-backend/prisma/schema.prisma` and runs on PostgreSQL through Supabase.

```mermaid
erDiagram
    User ||--o{ Notebooks : owns
    User ||--o{ UploadedDocuments : uploads
    User ||--o{ Conversations : participates
    User ||--o{ GeneratedArtifacts : creates
    User ||--o{ UserMemory : has
    User ||--o{ UserPreferences : configures

    Notebooks ||--o{ UploadedDocuments : contains
    Notebooks ||--o{ Conversations : organizes
    Notebooks ||--o{ GeneratedArtifacts : includes

    UploadedDocuments ||--o{ ConversationDocuments : references
    UploadedDocuments ||--o{ MessageSources : cited_in

    Conversations ||--o{ ConversationMessages : contains
    Conversations ||--o{ ConversationDocuments : attaches
    Conversations ||--o{ GeneratedArtifacts : generates

    ConversationMessages ||--o{ MessageSources : includes
```

### Models summary
1. `User`: User accounts and profiles.
2. `Notebooks`: Project containers grouping documents and chats.
3. `UploadedDocuments`: Metadata for files including type, size, storage URL, status, and page count.
4. `Conversations`: Chat session threads inside a notebook.
5. `ConversationDocuments`: Junction table linking documents to conversations.
6. `ConversationMessages`: Chat messages with role enum (`USER`, `LLM`, `SYSTEM`).
7. `MessageSources`: Citations linking messages to document IDs, pages, and chunk references.
8. `GeneratedArtifacts`: Outputs such as summaries, study guides, and reports.
9. `UserMemory` and `UserPreferences`: Persistent user preferences and episodic memory.

---

## Core pipelines and logic

### 1. Ingestion and chunking
- **Parser (`services/parser.py`).** Uses PyMuPDF to extract text page by page from raw PDF bytes.
- **Chunking engine (`services/chunker.py`).**
  - `semantic_chunking()` uses embedding distance thresholds to find natural topic shifts.
  - `create_parent_child_chunks()` builds 2000-character parent chunks and splits each into 400-character child chunks linked by `parent_id`.
  - `code_chunking()` uses language-specific separators via `RecursiveCharacterTextSplitter.from_language`.

### 2. Dual-vector embeddings and indexing
- **Embedder (`services/embedder.py`).**
  - Dense model: `BAAI/bge-large-en-v1.5` produces 1024-dimension normalized vectors. It adds the prefix `"Represent this sentence for searching relevant passages: "` to queries.
  - Sparse model: `fastembed.SparseTextEmbedding("Qdrant/bm25")` generates sparse keyword indices and values.
- **Qdrant indexing (`services/indexing.py`).**
  - Collection name: `textbook_chunks`.
  - Uses cosine distance with HNSW parameters $M=16$ and $\text{ef\_construct}=100$.
  - Sets up payload indexes for `user_id`, `document_id`, `page_number`, and `chunk_id`.

### 3. Query understanding and HyDE
- **Analyzer (`services/analyzer.py`).**
  - Uses structured outputs to return a `QueryAnalysis` object:
    - `intent`: Classified into `search`, `summarize`, or `casual_chat`.
    - `rewritten_query`: A standalone version of the query for retrieval.
    - `sub_queries`: 2 to 3 smaller questions for complex inputs.
    - `hyde_document`: A generated hypothetical passage that clusters near actual document vectors.

### 4. Two-stage hybrid retrieval and reranking
- **Hybrid search and RRF (`services/retriever.py`).**
  - Queries dense and sparse vectors in Qdrant with tenant filters (`user_id`, optional `document_id`).
  - Merges rankings with Reciprocal Rank Fusion:
    $$\text{RRF\_Score}(d) = \sum_{m \in \{\text{dense}, \text{sparse}\}} \frac{1}{60 + \text{rank}_m(d)}$$
- **Cross-encoder reranking (`services/reranker.py`).**
  - Pairs the query with each candidate passage and scores them using `BAAI/bge-reranker-base`.
  - Returns the top $k$ items sorted by rerank score.

### 5. Generation and lost-in-the-middle ordering
- **Context reordering (`services/generator.py`).**
  - Mitigates the lost-in-the-middle effect by reordering chunks in an alternating pattern: indices $[0, 2, 4, \dots, 3, 1]$. The highest-scoring passages go to the front and back of the prompt context where LLM attention is highest.
- **Inline citations.**
  - Formats passages as `[Source N] (Document: doc_id, Page P)`.
  - Instructs the model to append `[Source N]` to every factual claim and decline to answer if the context lacks the required information.

### 6. Agentic self-reflection loop with LangGraph
Defined in `textbook-backend/agents/graph.py` and `nodes.py`:

```mermaid
stateDiagram-v2
    [*] --> planner_node : START
    planner_node --> retriever_node : Sub-queries and HyDE generated
    retriever_node --> generator_node : Top reranked chunks retrieved
    generator_node --> reflection_node : Answer and citations synthesized
    
    state reflection_node {
        [*] --> CheckGrounding
        CheckGrounding --> CalculateConfidence
        CalculateConfidence --> FormulateCritique
    }

    reflection_node --> [*] : Grounded == True or Iteration >= 2 (END)
    reflection_node --> retriever_node : Grounded == False and Iteration < 2
```

1. **`planner_node`** extracts sub-queries and rewritten search terms.
2. **`retriever_node`** runs multi-query hybrid search and cross-encoder reranking, deduplicating chunks across queries.
3. **`generator_node`** writes the answer with citations.
4. **`reflection_node`** checks the answer against the retrieved passages using a structured `ReflectionGrade` schema. It outputs `is_grounded` (boolean), `confidence_score` (0 to 100), and a critique.
5. **Conditional edge (`should_continue`).** If the answer is ungrounded and the iteration count is under 2, the graph routes back to `retriever_node` to search with the critique before finishing.

---

## Evaluation suite

The evaluation suite in `textbook-backend/evals/` benchmarks retrieval and generation.

### Retrieval metrics (deterministic)
Defined in `evals/metrics/retrieval.py` and run against `datasets/golden_qa.json`:
- **Recall@K ($K=1, 3, 5$).** Fraction of ground-truth passages retrieved in the top $K$.
- **Precision@K.** Fraction of top-$K$ retrieved passages that are relevant.
- **HitRate@K.** $1.0$ if at least one relevant passage appears in top $K$, else $0.0$.
- **MRR@K (Mean Reciprocal Rank).** $\frac{1}{\text{rank}}$ of the first relevant passage.
- **NDCG@K (Normalized Discounted Cumulative Gain).** Position-weighted ranking quality ($DCG@K / IDCG@K$).
- **MAP@K (Mean Average Precision).** Average precision across all relevant ranks.
- **R-Precision.** Precision measured at rank $R = |\text{relevant documents}|$.

### Generation and citation metrics (LLM-as-a-judge)
Defined in `evals/metrics/generation.py`:
- **Faithfulness.** Extracts atomic factual claims and verifies whether each is supported by the context ($supported\_claims / total\_claims$).
- **Answer relevance.** Scores how directly the answer addresses the prompt on a $0.0$ to $1.0$ scale.
- **Answer correctness.** Checks factual agreement and semantic similarity against the ground truth.
- **Completeness.** Identifies missing sub-points from the ground truth.
- **Conciseness.** Penalizes conversational filler and repetitive text.
- **Citation accuracy and completeness.** Measures precision (valid citations / total citations) and recall (cited claims / total claims).
- **Negative rejection accuracy.** Tests whether the model refuses unanswerable questions instead of fabricating facts.

### Running evaluations

```powershell
# Navigate to backend
cd textbook-backend

# Activate virtual environment
.\venv\Scripts\Activate

# Run all evaluations (retrieval and generation)
python evals/run_evals.py

# Run retrieval benchmark only
python evals/eval_retrieval.py

# Run generation benchmark only
python evals/eval_generation.py
```

Reports are written to `textbook-backend/evals/reports/latest_eval_report.json` and `latest_eval_report.md`.

---

## API reference

All endpoints are mounted under `/api` in `textbook-backend/main.py`.

### 1. Document upload
- **`POST /api/upload?userId={userId}`**
  - **Content-Type:** `multipart/form-data`
  - **Parameters:** `userId` (query string), `file` (form file)
  - **Allowed MIME types:** PDF, DOCX, CSV, TXT, Markdown, Excel, PPTX, images, audio.
  - **Response:**
    ```json
    {
      "message": "File uploaded successfully",
      "filename": "ai-engineer.pdf",
      "filepath": "user_123/a1b2c3d4-ai-engineer.pdf"
    }
    ```

### 2. Hybrid search
- **`POST /api/search`**
  - **Request body:**
    ```json
    {
      "user_id": "user_123",
      "query": "What is the difference between dense and sparse search?",
      "document_id": "ai_engineer_handbook",
      "top_k": 5,
      "use_analysis": true
    }
    ```
  - **Response:**
    ```json
    {
      "query": "What is the difference between dense and sparse search?",
      "applied_query": "difference between dense embeddings and sparse BM25 retrieval",
      "total_results": 5,
      "results": [
        {
          "id": "point-uuid-1",
          "rrf_score": 0.0328,
          "rerank_score": 0.9421,
          "text": "Dense vectors capture deep semantic meaning while sparse vectors capture exact keywords...",
          "document_id": "ai_engineer_handbook",
          "page_number": 14,
          "dense_score": 0.884,
          "sparse_score": 12.45
        }
      ]
    }
    ```

### 3. Standard RAG chat
- **`POST /api/chat`**
  - **Request body:**
    ```json
    {
      "user_id": "user_123",
      "query": "Explain how Cross-Encoders work.",
      "top_k": 5,
      "use_analysis": false
    }
    ```
  - **Response:**
    ```json
    {
      "query": "Explain how Cross-Encoders work.",
      "applied_query": "Explain how Cross-Encoders work.",
      "answer": "Cross-Encoders score query-passage pairs simultaneously using full cross-attention layers [Source 1]...",
      "citations": [
        {
          "source_id": 1,
          "document_id": "ai_engineer_handbook",
          "page_number": 28,
          "chunk_id": "chunk_uuid",
          "text": "Cross-encoders process query and passage together through deep cross-attention layers...",
          "rerank_score": 0.961
        }
      ]
    }
    ```

### 4. Agentic RAG chat (LangGraph)
- **`POST /api/agent/chat`**
  - **Request body:**
    ```json
    {
      "user_id": "user_123",
      "query": "Compare HNSW and Product Quantization indexing in Qdrant."
    }
    ```
  - **Response:**
    ```json
    {
      "query": "Compare HNSW and Product Quantization indexing in Qdrant.",
      "applied_query": "HNSW graph search vs Product Quantization vector compression Qdrant",
      "answer": "HNSW constructs hierarchical graphs for fast approximate nearest neighbor search [Source 1], whereas Product Quantization compresses vectors into compact byte codes [Source 2]...",
      "citations": [...],
      "confidence_score": 95,
      "is_grounded": true,
      "critique": "All factual statements are supported by sources 1 and 2.",
      "iteration_count": 1
    }
    ```

---

## Getting started

### Prerequisites
- Python 3.10 or higher
- Node.js 20.x or higher (`npm` or `pnpm`)
- Qdrant Cloud cluster and API key ([qdrant.tech](https://cloud.qdrant.io/))
- Supabase project for PostgreSQL and storage ([supabase.com](https://supabase.com/))
- Google Gemini API key ([aistudio.google.com](https://aistudio.google.com/))

### Environment configuration

Create a `.env` file in `textbook-backend/`:

```env
# Google Gemini API
GOOGLE_API_KEY="your-google-gemini-api-key"

# Qdrant vector DB
QDRANT_URL="https://your-cluster-id.us-east4-0.gcp.cloud.qdrant.io:6333"
QDRANT_API_KEY="your-qdrant-api-key"

# Supabase PostgreSQL database and storage
DATABASE_URL="postgresql://postgres.your-project:your-password@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SECRET_KEY="your-supabase-service-role-key"
```

### Backend setup

```powershell
# 1. Navigate into backend directory
cd textbook-backend

# 2. Create and activate virtual environment
python -m venv venv
.\venv\Scripts\Activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Generate Prisma client
prisma generate

# 5. Start development server
uvicorn main:app --reload --port 8000
```
- Interactive Swagger docs: `http://localhost:8000/docs`
- ReDoc docs: `http://localhost:8000/redoc`

### Frontend setup

```powershell
# 1. Navigate into frontend directory
cd textbook-frontend

# 2. Install dependencies
npm install

# 3. Run development server
npm run dev
```
- Open `http://localhost:3000` in your browser.

### Database seeding and ingestion

To populate Qdrant with the sample textbook corpus `ai-engineer.pdf`:

```powershell
# In textbook-backend with venv activated:

# 1. Reset collection and create HNSW and payload indexes
python scripts/reset_db.py

# 2. Ingest, chunk, and embed ai-engineer.pdf into Qdrant
python scripts/seed_corpus.py

# 3. Run evaluation benchmarks to verify pipeline
python evals/run_evals.py
```

---

## Roadmap and implementation status

| Phase | Description | Status |
| :--- | :--- | :---: |
| **Phase 1** | Project initialization and monorepo setup (FastAPI + Next.js) | Completed |
| **Phase 2** | Document upload and Supabase storage integration | Completed |
| **Phase 3** | PyMuPDF text extraction and parsing | Completed |
| **Phase 4** | Chunking strategies (semantic, parent-child, syntax-aware) | Completed |
| **Phase 5** | Dense embedding pipeline (`BAAI/bge-large-en-v1.5`) | Completed |
| **Phase 6** | Qdrant Cloud vector database setup and schema | Completed |
| **Phase 7** | Indexing mechanisms (HNSW, FastEmbed BM25, payload filtering) | Completed |
| **Phase 8** | Query understanding (rewriting, sub-queries, HyDE) | Completed |
| **Phase 9** | Two-stage hybrid retrieval with Reciprocal Rank Fusion (RRF) | Completed |
| **Phase 10** | Cross-encoder reranking (`BAAI/bge-reranker-base`) | Completed |
| **Phase 11** | Generation pipeline, lost-in-the-middle ordering, and citations | Completed |
| **Phase 12** | Agentic self-reflection workflow with LangGraph | Completed |
| **Phase 13** | Evaluation benchmark suite (retrieval and LLM judges) | Completed |
| **Phase 14** | Production observability (Langfuse Cloud) and semantic caching (Redis) | Next |
| **Phase 15** | Interactive chat interface with streaming citations | Next |
| **Phase 16** | Containerization (Docker) and deployment (Vercel/Render) | Next |

---

## License

This project is licensed under the [MIT License](LICENSE).

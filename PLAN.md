# Textbook: Advanced AI Engineering Detailed Plan

## Overview
**Textbook** is an AI-powered document research assistant modeled after NotebookLM.
This document provides a highly granular, step-by-step roadmap tailored for a beginner. It breaks down complex AI engineering and RAG (Retrieval-Augmented Generation) concepts into their own dedicated phases. Each phase explains *what* we are doing, *why* we are doing it, and lists the specific files and function names you will create.

---

## Tech Stack
### Frontend
- **Framework:** Next.js (React)
- **Styling:** Tailwind CSS
- **Language:** TypeScript
- **Deployment:** Vercel

### Backend
- **Framework:** FastAPI
- **Language:** Python
- **Database (Relational):** PostgreSQL (via Supabase)
- **Vector Database:** Qdrant Cloud
- **Caching:** Redis (via Upstash)
- **Deployment:** Docker & Render / Railway

### AI & Data Engineering
- **PDF Parsing:** PyMuPDF
- **Embeddings:** Sentence Transformers
- **Reranking:** Cross-Encoders
- **Agentic Workflow:** LangGraph
- **Evaluation:** DeepEval (or Ragas)
- **Observability:** Langfuse Cloud

---

## The Master Plan

Use `[x]` to mark tasks as completed.

### Phase 1: Project Initialization & Setup
**Description:** Setting up the foundational folders, version control, and core frameworks (FastAPI for backend, Next.js for frontend).
- [x] Initialize `textbook-backend` and `textbook-frontend` repositories.
  - *Documentation:* [Next.js Docs](https://nextjs.org/docs) | [FastAPI Docs](https://fastapi.tiangolo.com/)
- **Backend Files:**
  - `backend/main.py`: The entry point for the FastAPI server.
  - `backend/requirements.txt`: Python dependencies (fastapi, uvicorn, etc).
- **Frontend Files:**
  - `frontend/package.json`: Node dependencies (next, react, tailwindcss).
- **Key Functions:** `app = FastAPI()` in `main.py`.

### Phase 2: Document Upload & Metadata Storage
**Description:** Creating an API to receive PDF files from the user and storing basic information about the file (name, upload date) in a relational database (PostgreSQL).
- [x] Set up PostgreSQL database using Prisma (or SQLAlchemy).
  - *Documentation:* [Prisma Docs](https://www.prisma.io/docs)
- [x] Build the `/upload` endpoint.
  - *Documentation:* [FastAPI UploadFile](https://fastapi.tiangolo.com/tutorial/request-files/)
- **Backend Files:**
  - `backend/routers/upload.py`: API routes for uploading files.
  - `backend/prisma/schema.prisma`: Database schema definitions.
- **Key Functions:** `upload_document(file: UploadFile)`.

### Phase 3: Document Parsing & Text Extraction
**Description:** AI models can't read raw PDF bytes. We must extract the human-readable text from the PDF.
- [x] Implement text extraction for PDFs.
  - *Details:* Use `pymupdf.open()` to load the document and iterate through pages using `page.get_text("text")` to extract plain text.
  - *Documentation:* [PyMuPDF Text Extraction](https://pymupdf.readthedocs.io/en/latest/the-basics.html)
- **Backend Files:**
  - `backend/services/parser.py`: Logic to read and extract text.
- **Key Functions:** `extract_text_with_pymupdf(pdf_bytes)`.

### Phase 4: Advanced Chunking Strategies
**Description:** LLMs have a limited "context window" (memory). We can't feed a 500-page book at once. We must split the extracted text into smaller "chunks".
- [x] **Semantic Chunking:** Split by natural sentence boundaries so meaning isn't cut in half.
- [x] **Parent-Child Chunking:** Create small chunks for highly accurate searching, but link them to a larger "parent" chunk so the LLM gets enough surrounding context to understand the small chunk.
- [x] **Syntax-Aware/Code-Based Chunking:** Split text based on programming language syntax (e.g., functions, classes, etc.).
  - *Documentation:* [LangChain Text Splitters](https://python.langchain.com/v0.1/docs/modules/data_connection/document_transformers/) (Good conceptual reference for chunking strategies).
- **Backend Files:**
  - `backend/services/chunker.py`: Logic to split text.
- **Key Functions:** `semantic_chunking(raw_text)`, `create_parent_child_chunks(text)`, `code_chunking(text)`.

### Phase 5: Dense Embeddings (Semantic Meaning)
**Description:** Converting our text chunks into arrays of numbers (vectors) representing their meaning. This allows us to search for concepts (e.g., searching "canine" will find "dog").
- [x] Integrate a local embedding model via LangChain (`HuggingFaceBgeEmbeddings`).
  - *Details:* We use `bge-large`, a top-tier open-source model, executed locally using LangChain's uniform API (which uses `sentence-transformers` under the hood). Local models require sufficient RAM for deployment and have smaller context windows (~512 tokens) compared to cloud providers like OpenAI/Voyage, but keep data completely private and avoid API costs.
  - *Documentation:* [LangChain HuggingFace Embeddings](https://docs.langchain.com/oss/python/integrations/embeddings/bge_huggingface)
- **Backend Files:**
  - `backend/services/embedder.py`: Code interacting with the embedding model.
- **Key Functions:** `bge_large_embedder()`.

### Phase 6: Vector Database Setup (Qdrant)
**Description:** Storing our chunks and metadata in a specialized database optimized for lightning-fast similarity searches. We will configure Qdrant to hold our Dense vectors (from Phase 5) and prepare it for advanced indexing techniques.
- [x] Connect to Qdrant.
- [x] Create a basic collection schema.
  - *Documentation:* [Qdrant Python Client](https://qdrant.tech/documentation/quick-start/)
- **Backend Files:**
  - `backend/database/qdrant_client.py`: Database connection and schema setup.
- **Key Functions:** `get_qdrant_client()`, `init_collection()`.

### Phase 7: Advanced Indexing Mechanisms
**Description:** Implementing all available indexing mechanisms using Qdrant. We will start with the techniques we can use immediately, and prepare the foundation for advanced scaling techniques later.
- [ ] Implement **HNSW (Dense Semantic Retrieval)**: Qdrant's default blazing-fast semantic search index for our dense embeddings.
- [ ] Implement **Sparse Vector Index (Learned Lexical Retrieval)**: Replaces standard BM25. We use `fastembed` to generate SPLADE/Sparse vectors for exact keyword matching, natively stored alongside dense vectors for Hybrid Search.
- [ ] Implement **Filterable HNSW**: Set up metadata payloads (e.g. document IDs, page numbers) so we can pre-filter semantic searches instantly.
- [ ] *For Later / Scaling:* **Product Quantization (PQ)** & **Scalar Quantization (SQ)** for vector compression when the dataset grows to millions of vectors.
- [ ] *For Later / Reranking:* **Multivector Index** for late-interaction ColBERT-style retrieval (We will use this in Phase 10 Reranking).
- **Backend Files:**
  - `backend/services/sparse_index.py`: Code for sparse vector generation.
- **Key Functions:** `generate_sparse_vectors(chunks)`, `configure_hnsw()`, `configure_payload_filters()`.

### Phase 8: Query Understanding & Expansion
**Description:** Users often write bad or brief queries (e.g., "what about taxes?"). We use an LLM to rewrite or expand the query before we even search the database.
- [ ] **Query Rewriting:** LLM rewrites the query for clarity.
- [ ] **HyDE (Hypothetical Document Embeddings):** Prompt the LLM to write a fake, hallucinated answer to the query, then embed that fake answer to find real documents that look similar. It is called "fake" (or hypothetical) simply because the AI does not check any facts when writing it. Basically adding made-up details.
  - *Details:* This significantly improves recall because embeddings of a generated "answer" often cluster closer to the real documentation than a short, poorly phrased user "question".
- **Backend Files:**
  - `backend/services/query_analyzer.py`
- **Key Functions:** `rewrite_query(user_input)`, `generate_hyde_document(user_input)`.

### Phase 9: Hybrid Retrieval API (Stage 1 Search)
**Description:** The actual search! We query the database using BOTH Dense search (meaning) and Sparse search (keywords), then mathematically merge the results.
- [ ] Combine results using Reciprocal Rank Fusion (RRF).
  - *Details:* RRF is a simple formula: `1 / (k + rank)`. We calculate this score for both Dense and Sparse results and sum them up to get the final combined ranking.
- **Backend Files:**
  - `backend/routers/search.py`: API endpoint for searching.
  - `backend/services/retriever.py`: Logic to talk to Qdrant.
- **Key Functions:** `perform_hybrid_search(query_vectors)`, `reciprocal_rank_fusion(dense_results, sparse_results)`.

### Phase 10: Reranking (Stage 2 Search)
**Description:** Stage 1 is fast but slightly inaccurate. We take the top 20 results from Stage 1 and pass them through a powerful Cross-Encoder (like ColBERT) to re-score and find the absolute best top 5 results.
- [ ] Implement a Cross-Encoder (e.g., ColBERT) for reranking.
  - *Details:* Unlike bi-encoders (which embed query and doc separately), cross-encoders process both together (often token-by-token like ColBERT), yielding a highly accurate similarity score but at a much higher computational cost.
  - *Documentation:* [SBERT Cross-Encoders](https://sbert.net/examples/applications/cross-encoder/README.html)
- **Backend Files:**
  - `backend/services/reranker.py`
- **Key Functions:** `rerank_with_cross_encoder(query, candidate_chunks)`.

### Phase 11: Generation Pipeline & Citations (RAG)
**Description:** We inject our perfectly retrieved top 5 chunks into a prompt and ask the LLM to answer the user's question based *only* on those chunks.
- [ ] Address "Lost-in-the-Middle": Order the chunks so the most important ones are at the very beginning and very end of the prompt.
  - *Details:* LLMs tend to forget information located in the middle of a long prompt. Reordering contexts mitigates this issue.
- [ ] Prompt the LLM to provide citations (e.g., "According to [doc1]...").
- **Backend Files:**
  - `backend/routers/chat.py`: API endpoint for chat.
  - `backend/services/generator.py`: Logic to prompt the LLM.
- **Key Functions:** `order_context_nodes(chunks)`, `generate_answer_with_citations(query, context)`.

### Phase 12: Agentic Workflow (LangGraph)
**Description:** Upgrading our linear pipeline into a state machine. Instead of just "retrieve then answer," we create AI agents that can loop, plan, and use tools.
- [ ] Build a Planner Agent (breaks down the task).
- [ ] Build a Retriever Agent (executes searches).
- [ ] Build a Reflection Agent (critiques the answer for hallucinations before sending it to the user).
  - *Documentation:* [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- **Backend Files:**
  - `backend/agents/graph.py`: Defines the flowchart of the agents.
  - `backend/agents/nodes.py`: The logic for each individual agent.
- **Key Functions:** `planner_node()`, `retriever_node()`, `reflection_node()`.

### Phase 13: Evaluation (Objective Testing)
**Description:** We don't just guess if our AI is good. We write automated tests using Ragas or DeepEval to mathematically grade the AI.
- [ ] Measure Retrieval metrics: `Recall@K`, `Mean Reciprocal Rank (MRR)`.
- [ ] Measure Generation metrics: `Faithfulness`, `Answer Relevance`.
  - *Documentation:* [DeepEval Docs](https://docs.confident-ai.com/) | [Ragas Docs](https://docs.ragas.io/)
- **Backend Files:**
  - `backend/tests/eval.py`
- **Key Functions:** `evaluate_retrieval_recall()`, `evaluate_generation_faithfulness()`.

### Phase 14: Observability & Caching (Production Polish)
**Description:** Tracking the LLM to see exactly what it is thinking, how much it costs, and caching common answers so we don't pay the LLM twice for the same question.
- [ ] Integrate Langfuse or Phoenix for traces (tracking).
  - *Documentation:* [Langfuse Docs](https://langfuse.com/docs)
- [ ] Integrate Redis for Semantic Caching.
  - *Documentation:* [Upstash Redis](https://upstash.com/docs/redis/overall/getstarted)
- **Backend Files:**
  - `backend/core/telemetry.py`
  - `backend/services/cache.py`
- **Key Functions:** `init_langfuse()`, `semantic_cache_lookup(query)`.

### Phase 15: Frontend Chat Interface
**Description:** Building the user-facing web app using Next.js.
- [ ] Build drag-and-drop document upload.
- [ ] Build chat interface with streaming text and clickable citation links.
  - *Documentation:* [Next.js App Router UI](https://nextjs.org/docs/app)
- **Frontend Files:**
  - `frontend/app/page.tsx`: Main dashboard.
  - `frontend/components/ChatBox.tsx`: The chat UI.
  - `frontend/components/Citation.tsx`: UI for rendering citations.
- **Key Functions:** `useChat()` (React hook), `renderCitations()`.
- **Component Directory:** Use [Beautiful UI](https://beautiful-ui-five.vercel.app/), [21st.dev](https://21st.dev), [shadcn ui](https://ui.shadcn.com/), [UI Goodies](https://uigoodies.com/)
- **Special Components/Websites:** [Epiminds AI - Awwwards.com](https://www.awwwards.com/sites/epiminds-ai), [Rig AI](https://www.awwwards.com/sites/rig-ai), [Cartesia](https://saaslandingpage.com/cartesia/), [Sonic by Cartesia](https://www.cartesia.ai/sonic), [Hydra DB](https://hydradb.com/), [Aria Networks](https://arianetworks.com/)

### Phase 16: Deployment & Containerization (Production)
**Description:** Moving the application from local development to the live internet using modern, free-tier cloud providers. Since our backend uses local ML models, it must be containerized.
- [ ] **Frontend (Vercel):** Deploy the Next.js frontend via Vercel for zero-config global edge routing.
  - *Documentation:* [Vercel Deployment](https://vercel.com/docs)
- [ ] **Backend (Docker & Render/Railway):** Write a `Dockerfile` for the FastAPI backend and deploy it as a long-running container to handle the heavy ML libraries (Sentence Transformers, Cross-Encoders).
  - *Documentation:* [Docker Docs](https://docs.docker.com/) | [Render Docs](https://render.com/docs)
- [ ] **Relational Database (Supabase):** Provision a free Serverless PostgreSQL database for document metadata and user management.
- [ ] **Vector Database (Qdrant Cloud):** Set up a free-forever Qdrant cluster (1GB RAM) to store dense and sparse vectors.
- [ ] **Caching (Upstash):** Integrate Serverless Redis for semantic caching (10k free daily requests).
- [ ] **Observability (Langfuse Cloud):** Configure telemetry to use Langfuse's managed cloud (50k free monthly traces) instead of self-hosting.
- **Backend Files:**
  - `backend/Dockerfile`: Instructions to build the Python environment and ML models.
- **Frontend Files:**
  - `frontend/vercel.json`: (Optional) Vercel-specific routing or configuration.

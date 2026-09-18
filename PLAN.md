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
- [x] Implement **HNSW (Dense Semantic Retrieval)**: Qdrant's default blazing-fast semantic search index for our dense embeddings.
- [x] Implement **Sparse Vector Index (Learned Lexical Retrieval)**: Replaces standard BM25. We use `fastembed` to generate SPLADE/Sparse vectors for exact keyword matching, natively stored alongside dense vectors for Hybrid Search.
- [x] Implement **Filterable HNSW**: Set up metadata payloads (e.g. document IDs, page numbers) so we can pre-filter semantic searches instantly.
- [x] *For Later / Scaling:* **Product Quantization (PQ)** & **Scalar Quantization (SQ)** for vector compression when the dataset grows to millions of vectors.
- [x] *For Later / Reranking:* **Multivector Index** for late-interaction ColBERT-style retrieval (We will use this in Phase 10 Reranking).
- [x] **Data Validation & Type Casting**: Iterate through parsed chunks and strictly enforce metadata types (e.g., `str(document_id)`).
- [x] **Vector Generation**: Run the text through the dense and sparse embedders to create the vector arrays.
- [x] **Upsertion**: Safely upload the vectors and validated payloads to Qdrant.
- **Backend Files:**
  - `backend/services/indexing.py`
  - `backend/services/ingestion.py`
- **Key Functions:** `generate_sparse_vectors(chunks)`, `configure_hnsw()`, `configure_payload_filters()`,`ingest_documents()`, `validate_payload()`.

### Phase 8: Query Understanding & Expansion
**Description:** Users often write bad or brief queries (e.g., "what about taxes?"). We use an LLM to rewrite or expand the query before we even search the database.
- [x] **Query Rewriting:** LLM rewrites the query for clarity.
- [x] **HyDE (Hypothetical Document Embeddings):** Prompt the LLM to write a fake, hallucinated answer to the query, then embed that fake answer to find real documents that look similar. It is called "fake" (or hypothetical) simply because the AI does not check any facts when writing it. Basically adding made-up details.
  - *Details:* This significantly improves recall because embeddings of a generated "answer" often cluster closer to the real documentation than a short, poorly phrased user "question".
- **Backend Files:**
  - `backend/services/analyzer.py`
  - `backend/core/llm.py`
- **Key Functions:** `analyze_query(user_input)`.

### Phase 9: Hybrid Retrieval API (Stage 1 Search)
**Description:** The actual search! We query the database using BOTH Dense search (meaning) and Sparse search (keywords), then mathematically merge the results.
- [x] Combine results using Reciprocal Rank Fusion (RRF).
  - *Details:* RRF is a simple formula: `1 / (k + rank)`. We calculate this score for both Dense and Sparse results and sum them up to get the final combined ranking.
- **Backend Files:**
  - `backend/routers/search.py`: API endpoint for searching.
  - `backend/services/retriever.py`: Logic to talk to Qdrant.
- **Key Functions:** `perform_hybrid_search(query_vectors)`, `reciprocal_rank_fusion(dense_results, sparse_results)`.

### Phase 10: Reranking (Stage 2 Search)
**Description:** Stage 1 is fast but slightly inaccurate. We take the top 20 results from Stage 1 and pass them through a powerful Cross-Encoder to re-score and find the absolute best top 5 results.
- [x] Implement a Cross-Encoder for reranking.
  - *Details:* We use `BAAI/bge-reranker-base` loaded via LangChain (`HuggingFaceCrossEncoder`), which pairs directly with our `BAAI/bge-large` dense embedding model. Unlike bi-encoders (which embed query and doc separately), cross-encoders process query and passage together through deep cross-attention layers, yielding a highly accurate relevance score.
  - *Documentation:* [LangChain HuggingFaceCrossEncoder Docs](https://reference.langchain.com/python/langchain-community/cross_encoders/huggingface/HuggingFaceCrossEncoder) | [SBERT Cross-Encoders](https://sbert.net/examples/applications/cross-encoder/README.html)
- **Backend Files:**
  - `backend/services/reranker.py`
  - `backend/routers/search.py`
- **Key Functions:** `reranker_with_cross_encoder(query, candidate_chunks, top_k)`.


### Phase 11: Generation Pipeline & Citations (RAG)
**Description:** We inject our perfectly retrieved top 5 chunks into a prompt and ask the LLM to answer the user's question based *only* on those chunks.
- [x] Address "Lost-in-the-Middle": Order the chunks so the most important ones are at the very beginning and very end of the prompt.
  - *Details:* LLMs tend to forget information located in the middle of a long prompt. Reordering contexts mitigates this issue.
- [x] Prompt the LLM to provide citations (e.g., "According to [doc1]...").
- **Backend Files:**
  - `backend/routers/chat.py`: API endpoint for chat.
  - `backend/services/generator.py`: Logic to prompt the LLM.
- **Key Functions:** `order_context_nodes(chunks)`, `generate_answer_with_citations(query, context)`.

### Phase 12: Agentic Workflow (LangGraph)
**Description:** Upgrading our linear pipeline into a state machine. Instead of just "retrieve then answer," we create AI agents that can loop, plan, and use tools.
- [x] Build a Planner Agent (breaks down the task).
- [x] Build a Retriever Agent (executes searches).
- [x] Build a Reflection Agent (critiques the answer for hallucinations before sending it to the user).
  - *Documentation:* [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- **Backend Files:**
  - `backend/agents/graph.py`: Defines the flowchart of the agents.
  - `backend/agents/nodes.py`: The logic for each individual agent.
- **Key Functions:** `planner_node()`, `retriever_node()`, `reflection_node()`.

### Phase 13: Evaluation (Objective Testing)
**Description:** We don't just guess if our AI is good. We write automated benchmarks using deterministic retrieval math and LLM-as-a-Judge to mathematically grade the AI.
- [x] Measure Retrieval metrics: `Recall@K`, `Precision@K`, `HitRate@K`, `MRR@K`, `NDCG@K`, `MAP@K`, `R-Precision`.
- [x] Measure Generation metrics: `Faithfulness`, `Answer Relevance`, `Answer Correctness`, `Completeness`, `Conciseness`, `Citation Accuracy`, `Negative Rejection Accuracy`.
  - *Documentation:* [DeepEval Docs](https://docs.confident-ai.com/) | [Ragas Docs](https://docs.ragas.io/)
- **Backend Files:**
  - `textbook-backend/evals/metrics/retrieval.py`
  - `textbook-backend/evals/metrics/generation.py`
  - `textbook-backend/evals/eval_retrieval.py`
  - `textbook-backend/evals/eval_generation.py`
  - `textbook-backend/evals/run_evals.py`
- **Key Functions:** `evaluate_retrieval()`, `evaluate_generation()`, `run_all_evals()`.

### Phase 14: Observability & Caching (Production Polish)
**Description:** Tracking the LLM to see exactly what it is thinking, how much it costs, and caching common answers so we don't pay the LLM twice for the same question.
- [x] Integrate Langfuse for traces (tracking).
  - *Documentation:* [Langfuse Docs](https://langfuse.com/docs)
- [x] Integrate Redis for Semantic Caching.
  - *Documentation:* [Upstash Redis](https://upstash.com/docs/redis/overall/getstarted)
- **Backend Files:**
  - `backend/core/telemetry.py`
  - `backend/services/cache.py`
- **Key Functions:** `init_langfuse()`, `semantic_cache_lookup(query)`.

### Phase 15: Frontend Research Interface (NotebookLM-Style Next.js App)
**Description:** Building the user-facing web app using Next.js App Router, React 19, TypeScript, and Tailwind CSS v4. Modeled after Google NotebookLM, this interface features a 3-panel research workspace: Sources & Upload, Chat with Citation badging & Agentic reflection metrics, and a Studio/Inspector panel.

#### Phase 15.1: Architecture & Design System Setup
- [x] Set up Next.js project structure, Tailwind CSS v4 design tokens, and utility libraries (`clsx`, `tailwind-merge`, `lucide-react`, `zustand`).
- [x] Implement responsive 3-column research layout (Sources Sidebar, Chat Center, Studio Inspector).
  - *Documentation:* [Next.js App Router](https://nextjs.org/docs/app) | [Tailwind CSS v4](https://tailwindcss.com/docs)
- **Frontend Files:**
  - `textbook-frontend/app/layout.tsx`: Root layout, fonts, and theme providers.
  - `textbook-frontend/app/globals.css`: Design system tokens, slate dark theme, custom scrollbars.
  - `textbook-frontend/components/layout/Header.tsx`: Top navigation bar with active notebook title and status.
  - `textbook-frontend/components/layout/ResizableLayout.tsx`: 3-panel collapsible layout container.
- **Key Functions:** `cn()`, `Header()`, `ResizableLayout()`.

#### Phase 15.2: Backend Route Integration & Typed API Layer
- [x] Configure Next.js rewrites proxy in `next.config.ts` to seamlessly route `/api/*` requests to the FastAPI backend (`http://localhost:8000/api/*`) without CORS issues.
- [x] Define TypeScript schemas matching FastAPI Pydantic models (`ChatRequest`, `ChatResponse`, `AgentChatResponse`, `SearchRequest`, `SearchResponse`, `UploadResponse`).
- [x] Implement typed API fetch modules with centralized error handling.
  - *Documentation:* [Next.js Rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites)
- **Frontend Files:**
  - `textbook-frontend/next.config.ts`: Proxy rewrites configuration.
  - `textbook-frontend/types/api.ts`: API request and response TypeScript interfaces.
  - `textbook-frontend/lib/api/client.ts`: Base fetch client.
  - `textbook-frontend/lib/api/upload.ts`: Document upload caller (`POST /api/upload`).
  - `textbook-frontend/lib/api/chat.ts`: Fast RAG (`POST /api/chat`) and Agentic RAG (`POST /api/agent/chat`) callers.
  - `textbook-frontend/lib/api/search.ts`: Diagnostic hybrid search caller (`POST /api/search`).
- **Key Functions:** `uploadDocument()`, `sendChatMessage()`, `sendAgentChatMessage()`, `performSearch()`.

#### Phase 15.3: Source Management & Document Upload
- [x] Build drag-and-drop document upload interface with file type validation (PDF, DOCX, TXT, MD).
- [x] Build sources sidebar showing uploaded files, file sizes, page counts, and active multi-selection checkboxes for filtering queries.
- [x] Implement document inspection modal to preview document text.
- **Frontend Files:**
  - `textbook-frontend/components/sources/FileUploadDropzone.tsx`: Drag-and-drop upload zone with progress bar.
  - `textbook-frontend/components/sources/SourceCard.tsx`: Individual source card with delete and toggle.
  - `textbook-frontend/components/sources/SidebarSources.tsx`: Complete source management panel.
  - `textbook-frontend/components/sources/SourceViewerModal.tsx`: Extracted text viewer with passage highlighting.
  - `textbook-frontend/hooks/useUpload.ts`: Hook managing file uploads and states.
  - `textbook-frontend/hooks/useSources.ts`: Hook managing active documents and selection filters.
- **Key Functions:** `useUpload()`, `useSources()`, `onDrop()`, `toggleSource()`.

#### Phase 15.4: Interactive Chat Interface & Citation Engine
- [x] Build chat message container with user and assistant message bubbles.
- [x] Integrate `react-markdown` and `remark-gfm` with custom citation pill renderer.
- [x] Implement interactive citations: clicking a citation badge (`[1]`, `[source_1]`) highlights the exact source excerpt and displays metadata (page number, rerank score).
- [x] Implement mode toggle: switch between **Fast RAG** (`/api/chat`) and **Agentic RAG** (`/api/agent/chat`).
- [x] Add query suggestion prompt chips ("Summarize key concepts", "Compare findings", "Explain methodology").
- **Frontend Files:**
  - `textbook-frontend/components/chat/ChatInterface.tsx`: Main chat container with scroll area.
  - `textbook-frontend/components/chat/ChatMessage.tsx`: Markdown message bubble with citation badges.
  - `textbook-frontend/components/chat/ChatInput.tsx`: Auto-resizing textarea with submit action and mode toggle.
  - `textbook-frontend/components/chat/CitationBadge.tsx`: Interactive citation pill with preview popover.
  - `textbook-frontend/components/chat/SuggestedQueries.tsx`: Quick query suggestions.
  - `textbook-frontend/hooks/useChat.ts`: Custom hook managing chat state, history, and pipeline mode.
- **Key Functions:** `useChat()`, `handleSendMessage()`, `renderCitations()`, `onCitationClick()`.

#### Phase 15.5: Agent Diagnostics & Studio Notes Panel
- [x] Build Studio/Inspector panel on the right side for notes, summaries, and deep citation analysis.
- [x] Build Agent Metrics card to display LangGraph self-reflection data: confidence score gauge, groundedness status, iteration count, and critique thoughts.
- [x] Build Retrieval Diagnostic modal to test and inspect Stage 1 (Hybrid Dense + Sparse) and Stage 2 (Cross-Encoder) scores.
- **Frontend Files:**
  - `textbook-frontend/components/layout/StudioPanel.tsx`: Right panel for notes and active citation view.
  - `textbook-frontend/components/chat/AgentMetrics.tsx`: Confidence score, groundedness, and critique display.
  - `textbook-frontend/components/search/RetrievalInspectorModal.tsx`: Retrieval testing drawer.
  - `textbook-frontend/stores/useNotebookStore.ts`: Global state for active citation, active notebook, and studio notes.
- **Key Functions:** `AgentMetrics()`, `RetrievalInspectorModal()`, `useNotebookStore()`.

### Phase 15.6: Better UX
- [ ] Prevent lenis to hijak internal scroll areas like scrollable chatbox, scrollable source viewer, etc. Add lenis `data-lenis-prevent` on internal scroll containers, so chat scroll works smoothly.
- [ ] Add **MeshGradint** to background of central hero section, use [Shader Paper Design Mesh Gradient](https://shaders.paper.design/mesh-gradient).
- [ ] Add **MeshGradint** on audio playback card, use animated shader as a living waveform blob visualizer from [Shader Paper Design Mesh Gradient](https://shaders.paper.design/mesh-gradient). When playing, `speed={0.2}`, when paused, `speed={0.05}`
- [ ] Add **Heatmap** effect during image generation using [Shader Paper Design Heatmap](https://shaders.paper.design/heatmap).
- [ ] Add **LiquidMetal** blob pulse effect when agent is in reflecting/thinking mode. Use [Shader Paper Design Liquid Metal](https://shaders.paper.design/liquid-metal).
- [x] Add **PulsatingBorder** effect to chat input container when agent is generating responses. Use [Shader Paper Design Pulsating Border](https://shaders.paper.design/pulsing-border).

#### Phase 15.7: Verification & End-to-End Polish
- [ ] Verify full roundtrip with FastAPI backend: PDF upload -> Hybrid Search -> Rerank -> Generation with Citations -> UI Render.
- [ ] Verify multi-tenant isolation using consistent `userId`.
- [ ] Validate responsive layout on desktop and tablet viewports.
- [ ] Run Next.js linting and production build (`npm run build`).

- **Component Directory Inspiration:** [Beautiful UI](https://beautiful-ui-five.vercel.app/), [21st.dev](https://21st.dev), [shadcn ui](https://ui.shadcn.com/), [UI Goodies](https://uigoodies.com/)
- **Special Components/Websites Reference:** [Epiminds AI - Awwwards.com](https://www.awwwards.com/sites/epiminds-ai), [Rig AI](https://www.awwwards.com/sites/rig-ai), [Cartesia](https://saaslandingpage.com/cartesia/), [Sonic by Cartesia](https://www.cartesia.ai/sonic), [Hydra DB](https://hydradb.com/), [Aria Networks](https://arianetworks.com/)


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

---

### Remaining Implementations:
**Description:** Essential production-readiness, data persistence, and security tasks to connect the prototype frontend to a multi-user, persistent backend.

- [x] **User Authentication & Session Persistence (Supabase Auth):**
  - Implement Login/Signup modal or page using Supabase Auth (`@supabase/ssr` or `@supabase/supabase-js`).
  - Wire actual user UUID into `useUserStore` instead of hardcoded `"default_user"`.
  - Implement `GET /api/documents?userId=...` so the Sources sidebar automatically fetches and persists existing documents on page reload.
- [ ] **Adaptive Content-Aware Ingestion Pipeline (Upload -> Dynamic Chunking -> Qdrant Indexing):**
  - Ensure `POST /api/upload` not only saves the file to Supabase Storage, but automatically triggers text extraction, chunking, embedding, and upserting into Qdrant so documents are instantly queryable in `/api/chat`.
  - **Dynamic Strategy Selection:** Inspect the uploaded file type and structure to route into the optimal chunking strategy:
    - **Code Chunking:** For programming scripts and code files (`.py`, `.ts`, `.js`, `.json`, etc.) preserving function, class, and block scope boundaries using language-aware AST chunkers.
    - **Semantic Chunking:** For dense prose, essays, and unstructured text using cosine distance breakpoints between consecutive sentences to keep related concepts together.
    - **Parent-Child Chunking:** For long-form textbooks, academic papers, and manuals with headers/sections to generate small child chunks (for high-precision vector search) linked to larger parent context windows (for complete context in generation).
  - **Cache Invalidation:** Invalidate/flush Redis semantic cache keys for the user (`cache:{user_id}:*`) whenever a new document is ingested so stale "no relevant documents" responses are never served.
  - *Optional / Production:* Offload parsing & embedding to a background worker (e.g., Celery, FastAPI `BackgroundTasks`, or Upstash QStash).

- [ ] **Full-Cycle Document Deletion API (`DELETE /api/documents`):**
  - Create a unified deletion endpoint that atomically cleans up:
    1. Supabase Storage: delete file bytes from `textbook-documents` bucket.
    2. Qdrant Cloud: delete all vector points matching `document_id` and `user_id`.
    3. PostgreSQL: cascade delete metadata from `uploaded_documents` table via Prisma.
- [ ] **Conversation & Chat History Persistence:**
  - Persist conversation messages, generated answers, and citations into PostgreSQL (`conversations`, `conversation_messages`, and `message_sources` Prisma tables).
  - Enable multiple notebook threads and past chat history switching.
- [ ] **Streaming Responses (Server-Sent Events / SSE):**
  - Upgrade `/api/chat` and `/api/agent/chat` from blocking JSON to streaming tokens with citation badges rendering as they arrive.

- [ ] **Intent Routing & Dual-Mode Conversational Chat (Casual Chat vs RAG vs General Knowledge):**
  - **Problem:** Currently, *every* query is blindly sent to Qdrant vector search and Cross-Encoder rerank. If the user greets ("hello", "who are you?") or asks general questions not in their uploaded PDF, the system hits a dead-end wall: *"No relevant documents found to answer your question."*
  - **Fast Intent Router:** Use `services/analyzer.py`'s `intent` classifier (`casual_chat`, `general_knowledge`, `textbook_rag`) to route queries:
    - `casual_chat`: Greetings and assistant meta-questions bypass vector search and generate conversational replies.
    - `textbook_rag`: Closed-domain queries strictly retrieve chunks and cite sources.
    - `general_knowledge` / Fallback: When no chunks pass the retrieval threshold, provide an answer using base LLM knowledge accompanied by an ungrounded warning badge (*"Answered using general AI knowledge; not found in your uploaded documents"*).
  - **Conversational Multi-Turn Contextualization:** Pass chat history into a query contextualizer node (e.g. rewriting *"can you give an example of that?"* -> *"can you give an example of backpropagation?"*) so follow-up questions retrieve relevant chunks.

- [ ] **Modal Wiring & Layout Verification (Inspector Modal Mount):**
  - Wire `RetrievalInspectorModal` into `app/page.tsx` with `useTextbookStore` so clicking `Diagnostics` in `StudioPanel` or the `SlidersHorizontal` icon in `Header` opens the Stage 1 & Stage 2 inspector modal.

- [ ] **Zero-State Onboarding & Sample Textbook Loader:**
  - When a user has not uploaded any documents, offer a 1-click "Load Sample AI Engineering Textbook" button so users can immediately test search, citations, and studio notes without having to find and upload a PDF first.

- [ ] **Studio Notes Export & Audio Overview (NotebookLM Podcast):**
  - Export Studio notes to `.md` / Markdown and PDF.
  - Implement two-speaker Audio Overview generation (podcast conversation discussing uploaded sources) powered by ElevenLabs or Edge-TTS.

- [ ] **Voice Interaction Mode (Speech-to-Text & Text-to-Speech):**
  - **User Voice Recording (Speech-to-Text / STT):**
    - Add interactive microphone button to `ChatInput.tsx` with recording timer and live audio waveform blob visualizer.
    - Capture audio via browser `MediaRecorder` API and transcribe either via Web Speech API or backend endpoint `POST /api/voice/transcribe` (powered by OpenAI Whisper or local `faster-whisper`).
    - Automatically populate transcript into chat input with optional auto-send trigger ("hands-free voice mode").
  - **LLM Voice Playback (Text-to-Speech / TTS):**
    - Add "Read Aloud / Listen" speaker button to `ChatMessage.tsx` assistant bubbles and Studio note summaries.
    - Stream high-quality synthesized speech via `POST /api/voice/synthesize` (using Edge-TTS, ElevenLabs, or OpenAI `tts-1`) or client-side Web Speech API.
    - Embed interactive audio player card with playback controls (Play/Pause, speed toggle: 1x, 1.25x, 1.5x, 2x, seek bar) and reactive living waveform visualization (using Paper Design MeshGradient shader).

- [ ] **AI Concept & Diagram Image Generation with Heatmap Loading Animation:**
  - **Diagram & Illustration Generation:**
    - Enable visual concept explanations (e.g., *"Generate a diagram of the Transformer attention mechanism"*, *"Visualize neural network layers"*, or an "Illustrate Concept" button on citations).
    - Backend endpoint `POST /api/image/generate` synthesizing technical illustrations and diagrams (via Flux, Imagen, or DALL-E 3).
  - **Heatmap Shader Loading Animation:**
    - While synthesis is in progress, render an animated **Heatmap shader** card using `@paper-design/shaders-react` ([Shader Paper Design Heatmap](https://shaders.paper.design/heatmap)).
    - Thermal chromatic fluid dynamics pulse across the placeholder container with real-time progress steps (*"Analyzing concept geometry..."* -> *"Synthesizing visual topology..."* -> *"Rendering final figure..."*).
  - **Image Card & Studio Integration:**
    - Seamless crossfade transition from the dynamic heatmap shader into the generated illustration.
    - Interactive controls: full-screen lightbox preview, download image, copy to clipboard, and 1-click **"Save Figure to Studio Notes"** with caption and source document reference.

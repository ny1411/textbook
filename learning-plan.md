# Recommended Tech Stack and Learning Roadmap

## Tech Stack Overview

| Layer            | Recommended Stack                                                   |
| ---------------- | ------------------------------------------------------------------- |
| Frontend         | Next.js 16 + React 19 + TypeScript                                  |
| UI               | Tailwind CSS v4 + shadcn/ui + Radix UI + Motion                     |
| State            | TanStack Query + Zustand                                            |
| Backend          | FastAPI (Python)                                                    |
| Authentication   | Better Auth                                                         |
| Database         | PostgreSQL + Prisma                                                 |
| Cache            | Redis                                                               |
| Queue            | BullMQ or Temporal                                                  |
| Storage          | S3 or Cloudflare R2                                                 |
| Document Parsing | PyMuPDF, pdfplumber, python-docx, python-pptx, PaddleOCR            |
| Text Processing  | spaCy, regex, semantic-text-splitter                                |
| Embeddings       | OpenAI, Voyage AI, Jina AI, or BAAI BGE                             |
| Vector Database  | Qdrant (or pgvector for smaller deployments)                        |
| Keyword Search   | Elasticsearch or OpenSearch                                         |
| Reranking        | Cohere Rerank, BGE Reranker, or Jina Reranker                       |
| Orchestration    | LangGraph + PydanticAI + MCP                                        |
| LLM Providers    | OpenAI, Gemini, Anthropic (with OpenRouter for routing if desired)  |
| Evaluation       | Ragas + DeepEval + LangSmith                                        |
| Observability    | Langfuse + OpenTelemetry                                            |
| Audio            | Whisper + ElevenLabs or OpenAI TTS                                  |
| Deployment       | Vercel (frontend), Fly.io/Railway (backend), Docker for portability |

## A Practical Learning Order

To avoid getting overwhelmed, learn in this sequence:

1. **Web fundamentals:** TypeScript, React, Next.js, SQL, FastAPI.
2. **Modern full-stack:** PostgreSQL, Prisma, authentication, object storage, streaming APIs.
3. **Document ingestion:** PDFs, DOCX, OCR, parsing, cleaning, chunking.
4. **Retrieval systems:** Embeddings, vector databases, hybrid search, reranking.
5. **Applied LLMs:** Prompt engineering, structured outputs, tool calling, context engineering.
6. **Advanced RAG:** Multi-query retrieval, GraphRAG, agentic RAG, citation systems.
7. **Agent orchestration:** LangGraph, MCP, multi-agent workflows, reflection and verification.
8. **Production AI:** Evaluation, observability, caching, security, deployment, performance optimization.

## Extended Learning Roadmap

Here is an expanded, step-by-step roadmap to guide you through the learning sequence, complete with milestones and practical projects:

### Phase 1: Web Fundamentals & Modern Full-Stack (Weeks 1-4)
- **Goal:** Build robust, full-stack web applications.
- **Key Topics:**
  - **TypeScript & React 19:** Understand types, interfaces, hooks, and new React 19 features (like compiler optimizations).
  - **Next.js 16 (App Router):** Server Components, Server Actions, Layouts, and API Routes.
  - **Styling:** Master Tailwind CSS v4 and integrate `shadcn/ui` and `Motion` for accessible, animated UIs.
  - **Backend (Python):** Build scalable APIs with FastAPI.
  - **Database & Auth:** Set up PostgreSQL, use Prisma for type-safe database access, and integrate Better Auth.
- **Milestone Project:** Build a full-stack SaaS boilerplate with user authentication, a dashboard, and basic CRUD operations.

### Phase 2: Data Pipeline & Ingestion (Weeks 5-6)
- **Goal:** Extract and process unstructured data efficiently.
- **Key Topics:**
  - **Document Parsing:** Use `PyMuPDF` and `pdfplumber` to extract text from PDFs. Learn `PaddleOCR` for image-based PDFs.
  - **Text Processing & Chunking:** Clean text using `spaCy` and `regex`. Implement semantic chunking strategies (`semantic-text-splitter`) to prepare data for embeddings.
  - **Storage:** Save raw and processed files into Object Storage (S3 / Cloudflare R2).
- **Milestone Project:** Create a document upload portal that parses resumes or reports, cleans the text, and stores both the original file and extracted content.

### Phase 3: Retrieval-Augmented Generation (RAG) Core (Weeks 7-8)
- **Goal:** Build a robust search and retrieval system.
- **Key Topics:**
  - **Embeddings:** Generate vector representations using OpenAI or BAAI BGE.
  - **Vector Databases:** Set up and index data in Qdrant or `pgvector`.
  - **Hybrid Search & Reranking:** Combine semantic search with keyword search (Elasticsearch/OpenSearch). Apply Cohere Rerank or BGE Reranker to improve search accuracy.
- **Milestone Project:** Build a "Company Knowledge Base" where users can search through thousands of parsed documents using both keyword and semantic search, with highly accurate reranked results.

### Phase 4: Applied LLMs & Advanced RAG (Weeks 9-10)
- **Goal:** Integrate intelligence and complex querying capabilities.
- **Key Topics:**
  - **LLM Integration:** Connect to OpenAI, Gemini, or Anthropic. Utilize OpenRouter for model fallback/routing.
  - **Advanced Prompts & Tools:** Master prompt engineering, strict structured outputs (JSON), and LLM tool calling.
  - **Advanced RAG Techniques:** Implement multi-query retrieval (rewriting user queries), basic GraphRAG concepts, and citation mechanisms to avoid hallucinations.
- **Milestone Project:** Develop an AI Research Assistant that answers user queries by fetching relevant documents, synthesizing an answer, and citing the exact source chunks.

### Phase 5: Agent Orchestration (Weeks 11-12)
- **Goal:** Build autonomous, multi-step AI agents.
- **Key Topics:**
  - **LangGraph & PydanticAI:** Build stateful, multi-actor applications. Understand state management and cyclical graphs.
  - **Model Context Protocol (MCP):** Connect agents to external tools and data sources seamlessly.
  - **Agentic Workflows:** Implement reflection (agents reviewing their own work) and multi-agent debate/collaboration.
- **Milestone Project:** Create an "Automated Data Analyst Agent" that can independently query a database, perform data analysis, and write a summary report using multiple distinct agent roles.

### Phase 6: Production AI & Operations (Weeks 13-14)
- **Goal:** Deploy, monitor, and scale AI applications safely.
- **Key Topics:**
  - **Caching & Queues:** Use Redis for semantic caching and BullMQ/Temporal for background task management.
  - **Evaluation & Observability:** Integrate Ragas/DeepEval to test RAG pipelines. Use Langfuse and OpenTelemetry to monitor LLM costs, latency, and trace agent steps.
  - **Deployment:** Containerize with Docker. Deploy Next.js to Vercel and FastAPI backend to Fly.io/Railway.
- **Milestone Project:** Take your AI Research Assistant from Phase 4, add comprehensive tracing with Langfuse, implement a feedback loop for users to rate answers, and deploy it to production.

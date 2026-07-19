# Complete RAG Learning Roadmap

##   1: RAG Fundamentals
- [x] RAG Overview

---

##   2: Information Retrieval & Search Foundations
- [x] Information Retrieval Basics
- [x] Metadata Filtering
- [x] Keyword Search (TF-IDF)
- [x] BM25
- [x] Semantic Search
- [x] Hybrid Search

---

## Embeddings
- [ ] Embedding Fundamentals
- [ ] Dense Embeddings
- [ ] Sparse Embeddings
- [ ] Late Interaction Embeddings
- [ ] Multi-vector Embeddings
- [ ] Embedding Normalization
- [ ] Embedding Dimensionality Reduction
- [ ] Quantized Embeddings
- [ ] Domain-specific Embeddings
- [ ] Embedding Models
  - [ ] OpenAI
  - [ ] Voyage AI
  - [ ] Jina AI
  - [ ] BAAI BGE
  - [ ] E5
  - [ ] GTE
  - [ ] Nomic

---

## Vector Databases & Indexing
- [x] Approximate Nearest Neighbor (ANN)
- [ ] HNSW
- [ ] IVF
- [ ] Product Quantization (PQ)
- [ ] Optimized PQ (OPQ)
- [ ] Scalar Quantization
- [ ] Binary Quantization
- [ ] Vector Databases
- [ ] Batch Indexing
- [ ] Incremental Indexing
- [ ] Real-time Indexing
- [ ] Re-indexing
- [ ] Index Versioning
- [ ] Sharding
- [ ] Replication
- [ ] Compression

---

## Chunking Strategies
- [ ] Fixed-size Chunking
- [ ] Sliding Window Chunking
- [ ] Recursive Chunking
- [ ] Semantic Chunking
- [ ] Structure-aware Chunking
- [ ] Document-aware Chunking
- [ ] Parent-Child Chunking
- [ ] Hierarchical Chunking
- [ ] Adaptive Chunking
- [ ] Multi-resolution Chunking
- [ ] Chunk Overlap
- [ ] Chunk Size Tradeoffs
- [ ] Lost-in-the-Middle Problem

---

## Retrieval Techniques
- [ ] Dense Retrieval
- [ ] Sparse Retrieval
- [ ] Hybrid Retrieval
- [ ] Parent Document Retrieval
- [ ] Multi-vector Retrieval
- [ ] Metadata Retrieval
- [ ] Contextual Retrieval
- [ ] Graph Retrieval
- [ ] Knowledge Graph Retrieval
- [x] Similarity Metrics
  - [x] Cosine Similarity
  - [x] Dot Product
  - [x] Euclidean Distance
- [ ] Score Fusion
- [x] Reciprocal Rank Fusion (RRF)
- [ ] Weighted Score Fusion

---

## Query Understanding
- [ ] Query Rewriting
- [ ] Query Expansion
- [ ] Query Decomposition
- [ ] Query Classification
- [ ] Query Routing
- [ ] Intent Detection
- [ ] Query Normalization

---

## Reranking
- [ ] Cross Encoders
- [ ] ColBERT
- [ ] Cohere Rerank
- [ ] BGE Reranker
- [ ] Jina Reranker
- [ ] LLM-based Reranking
- [ ] Cascade Reranking

---

## Advanced Retrieval
- [ ] Multi-query Retrieval
- [ ] HyDE
- [ ] Self-query Retrieval
- [ ] Step-back Prompting
- [ ] Hypothetical Document Embeddings
- [ ] Top-K Retrieval
- [ ] Dynamic-K Retrieval
- [ ] Recursive Retrieval
- [ ] Multi-hop Retrieval
- [ ] Tree Retrieval
- [ ] Hierarchical Retrieval

---

## Context Engineering
- [ ] Context Compression
- [ ] Context Filtering
- [ ] Context Deduplication
- [ ] Context Ordering
- [ ] Context Packing
- [ ] Token Budgeting
- [ ] Prompt Assembly

---

## LLMs & Text Generation
- [ ] Transformer Architecture
- [ ] LLM Sampling Strategies
- [ ] Prompt Engineering
- [ ] Prompt Engineering for RAG
- [ ] Citation Prompting
- [ ] Grounded Prompting
- [ ] Structured Outputs
- [ ] JSON Mode
- [ ] Function Calling
- [ ] Tool Calling
- [ ] XML Prompting
- [ ] Handling Hallucinations
- [ ] LLM Performance Evaluation
- [ ] RAG vs Fine-tuning

---

## Generation Strategies
- [ ] Retrieve-Then-Read
- [ ] Retrieve-Read-Retrieve
- [ ] Iterative Retrieval
- [ ] Self-RAG
- [ ] Corrective RAG (CRAG)
- [ ] Adaptive RAG
- [ ] Active RAG
- [ ] Fusion-in-Decoder (FiD)

---

## Citation & Grounding
- [ ] Source Attribution
- [ ] Chunk Citation
- [ ] Span Citation
- [ ] Page Citation
- [ ] Evidence Highlighting
- [ ] Confidence Scoring

---

## Hallucination Reduction
- [ ] Grounded Generation
- [ ] Evidence Verification
- [ ] Faithfulness Checking
- [ ] Retrieval Confidence
- [ ] Answer Abstention
- [ ] Reflection
- [ ] Self Verification

---

## Agentic RAG
- [ ] Agentic RAG Fundamentals
- [ ] Planner Agents
- [ ] Retriever Agents
- [ ] Research Agents
- [ ] Reflection Agents
- [ ] Memory Systems
- [ ] Tool Use
- [ ] LangGraph
- [ ] Model Context Protocol (MCP)
- [ ] Multi-agent Workflows

---

## Memory Systems
- [ ] Conversation Memory
- [ ] Episodic Memory
- [ ] Semantic Memory
- [ ] Vector Memory
- [ ] Long-term Memory
- [ ] Memory Summarization

---

## Knowledge Graphs
- [ ] Entity Extraction
- [ ] Relation Extraction
- [ ] Knowledge Graph Construction
- [ ] Neo4j
- [ ] Graph Traversal
- [ ] Hybrid Graph Retrieval

---

## Advanced RAG Architectures
- [ ] GraphRAG
- [ ] RAPTOR
- [ ] LightRAG
- [ ] MemoRAG
- [ ] LongRAG
- [ ] Modular RAG
- [ ] Adaptive RAG
- [ ] Self-RAG
- [ ] Corrective RAG (CRAG)

---

## RAG Evaluation
- [ ] Retrieval Metrics
  - [x] Recall@K
  - [x] Precision@K
  - [ ] Hit Rate
  - [x] Mean Reciprocal Rank (MRR)
  - [x] Mean Average Precision (MAP)
  - [ ] nDCG
- [ ] Generation Metrics
  - [ ] Faithfulness
  - [ ] Answer Relevance
  - [ ] Context Precision
  - [ ] Context Recall
  - [ ] Hallucination Rate
- [ ] Evaluation Frameworks
  - [ ] Ragas
  - [ ] DeepEval
  - [ ] LangSmith
  - [ ] TruLens
  - [ ] Phoenix

---

## Production RAG
- [ ] Logging
- [ ] Monitoring
- [ ] Observability
- [ ] Semantic Caching
- [ ] Embedding Cache
- [ ] Response Cache
- [ ] Streaming
- [ ] Async Pipelines
- [ ] Batch Processing
- [ ] Queue Systems
- [ ] Cost vs Response Quality
- [ ] Latency vs Response Quality
- [ ] Model Routing
- [ ] Retry Logic
- [ ] Fallback Models

---

## Security
- [ ] Prompt Injection
- [ ] Retrieval Poisoning
- [ ] Data Leakage Prevention
- [ ] Access Control
- [ ] Row-level Security
- [ ] PII Detection
- [ ] Secret Redaction

---

## Performance Optimization
- [ ] Quantization
- [ ] ANN Optimization
- [ ] GPU Indexing
- [ ] Latency Optimization
- [ ] Throughput Optimization
- [ ] Index Compression

---

## Long Context Handling
- [ ] Long-context Prompting
- [ ] Context Window Optimization
- [ ] Sliding Context
- [ ] Context Summarization
- [ ] Memory Compression

---

## Multimodal RAG
- [ ] Image Embeddings
- [ ] OCR Pipelines
- [ ] Table Retrieval
- [ ] Chart Understanding
- [ ] Video Retrieval
- [ ] Audio Retrieval
- [ ] Vision-Language Models
- [ ] PDF Vision Models

---

## Deployment & Scaling
- [ ] GPU Deployment
- [ ] Horizontal Scaling
- [ ] Load Balancing
- [ ] Background Workers
- [ ] Blue-Green Deployment

---

## Emerging Topics
- [ ] Contextual Retrieval
- [ ] Retrieval-Augmented Agents
- [ ] Retrieval-Augmented Planning
- [ ] Tool-Augmented Generation
- [ ] Mixture of Retrievers
- [ ] Memory-Augmented Transformers
- [ ] Retrieval-Augmented Reasoning
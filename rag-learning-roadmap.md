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
- [x] Embedding Fundamentals
- [x] Contextualized Token Embeddings
  - [x] GloVe Word Embeddings
  - [x] Word2Vec Algebra
  - [x] GloVe vs BERT
- [x] Token Embeddings
  - [x] Cross Encoder
  - [x] BERT
- [x] Sentence Embeddings
  - [x] Cosine Similarity
  - [x] SBERT
- [x] Two Stage Retrival Approach
- [x] Dual Encoders
  - [x] Contrastive Loss
  - [x] Cross Entropy Loss
- [x] Dense Embeddings
- [x] Sparse Embeddings
- [x] Late Interaction Embeddings
- [x] Multi-vector Embeddings
- [x] Embedding Normalization
- [x] Embedding Dimensionality Reduction
- [x] Quantized Embeddings
- [x] Domain-specific Embeddings
- [x] Embedding Models
  - [x] OpenAI
  - [ ] Voyage AI
  - [ ] Jina AI
  - [ ] BAAI BGE
  - [ ] E5
  - [ ] GTE
  - [ ] Nomic

---

## Vector Databases & Indexing
- [x] Approximate Nearest Neighbor (ANN)
- [x] HNSW
- [x] IVF
- [x] Compression
  - [x] Product Quantization (PQ)
  - [x] Optimized PQ (OPQ)
  - [x] Scalar Quantization
  - [x] Binary Quantization
- [x] Vector Databases
- [x] Batch Indexing
- [x] Incremental Indexing
- [x] Real-time Indexing
- [x] Re-indexing
- [x] Index Versioning
- [x] Sharding
- [x] Replication

---

## Chunking Strategies
- [x] Fixed-size Chunking
- [x] Sliding Window Chunking
- [x] Recursive Chunking
- [x] Semantic Chunking
- [x] Structure-aware Chunking
- [x] Document-aware Chunking
- [x] Parent-Child Chunking
- [x] Hierarchical Chunking
- [x] Adaptive Chunking
- [x] Multi-resolution Chunking
- [x] Chunk Overlap
- [x] Chunk Size Tradeoffs
- [x] Lost-in-the-Middle Problem

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
- [x] Query Rewriting
- [ ] Query Expansion
- [ ] Query Decomposition
- [ ] Query Classification
- [ ] Query Routing
- [ ] Intent Detection
- [ ] Query Normalization

---

## Reranking
- [x] Bi-encoders
- [x] Cross Encoders
- [x] ColBERT
- [ ] Cohere Rerank
- [ ] BGE Reranker
- [ ] Jina Reranker
- [x] LLM-based Reranking
- [ ] Cascade Reranking

---

## Advanced Retrieval
- [ ] Multi-query Retrieval
- [x] HyDE
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
- [x] Transformer Architecture
- [x] LLM Sampling Strategies
  - [x] Greedy Decoding
  - [x] Temparature
  - [x] Top-K Sampling
  - [x] Top-P Sampling
  - [x] Repetition Penalty
  - [x] Logit Bias
- [x] Prompt Engineering
- [x] Prompt Engineering for RAG
- [x] In Context Learning
- [x] Encouraging Reasoning
- [x] Chain-of-thought 
  - [x] Few-shot CoT
  - [x] Zero-shot CoT
  - [x] Auto-CoT
- [x] Context Window Management
- [x] Management Stratergies
- [x] Citation Prompting
  - [x] ContextCite
- [x] Prompt Chaining
- [ ] Grounded Prompting
- [ ] Structured Outputs
- [ ] JSON Mode
- [x] Function Calling
- [ ] Tool Calling
- [ ] XML Prompting
- [ ] Handling Hallucinations
- [x] LLM Performance Evaluation
- [x] RAG vs Fine-tuning

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
- [x] Agentic RAG Fundamentals
  - [x] Sequential Workflow
  - [x] Parallel Workflow
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
  - [x] Faithfulness
  - [x] Answer Relevance
  - [ ] Context Precision
  - [ ] Context Recall
  - [ ] Hallucination Rate
- [ ] Evaluation Frameworks
  - [x] Ragas
  - [ ] DeepEval
  - [ ] LangSmith
  - [ ] TruLens
  - [ ] Phoenix

---

## Production RAG
- [x] Pheonix Tools
  - [x] Traces
  - [x] Evaluation Integration
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
- [x] Cost vs Response Quality
- [x] Latency vs Response Quality
- [ ] Model Routing
- [ ] Retry Logic
- [ ] Fallback Models

---

## Security
- [ ] Prompt Injection
- [ ] Retrieval Poisoning
- [x] Data Leakage Prevention
- [x] Data Tenat Separation
- [x] LLM Data Leaking
- [ ] Access Control
- [ ] Row-level Security
- [ ] PII Detection
- [ ] Secret Redaction

---

## Performance Optimization
- [x] Quantization
  - [x] 1-bit Quantized Embedding Model
  - [x] Matryoshka Quantization
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
- [x] Image Tokenization
- [ ] Image Embeddings
- [ ] OCR Pipelines
- [ ] Table Retrieval
- [ ] Chart Understanding
- [ ] Video Retrieval
- [ ] Audio Retrieval
- [x] Vision-Language Models
- [x] PDF Vision Models

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
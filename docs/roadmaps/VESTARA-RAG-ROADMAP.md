# Vestara RAG — First-Principles Roadmap

**Owner:** Eddie Villanueva  
**Implementation mode:** Personal / Manual  
**Target:** October 6, 2026  
**Status:** IN PROGRESS  
**Primary repository:** `vestara-ai-core`

---

## 1. Objective

Build Retrieval-Augmented Generation capability for Vestara from first principles.

The objective is not merely to integrate a RAG framework. The implementation should make every major layer understandable, inspectable, testable, and replaceable.

The learning and implementation path is:

```text
Source
  ↓
Ingestion
  ↓
Parsing
  ↓
Document
  ↓
Chunking
  ↓
Embedding
  ↓
Vector Storage
  ↓
Similarity
  ↓
Retrieval
  ↓
Context Assembly
  ↓
Grounded Generation
  ↓
Citation / Provenance
  ↓
Evaluation
```

Frameworks must not obscure these boundaries during the initial implementation.

---

# 2. Engineering Principles

Vestara RAG must preserve these invariants:

- Retrieval relevance ≠ Authority
- Similarity ≠ Truth
- Documentation ≠ Implementation
- Proposed ≠ Current
- Absence of evidence ≠ Evidence of absence
- Context ≠ Authority
- Retrieved content ≠ Agent instruction
- Knowledge ≠ Permission

Every retrieved answer should eventually be traceable through:

```text
Answer
  ↓
Citation
  ↓
Retrieved Chunk
  ↓
Document
  ↓
Source URI
  ↓
Original Evidence
```

---

# 3. Current Baseline

Vestara already contains a Knowledge Engine.

Existing pipeline:

```text
Repository
   ↓
DocumentParser
   ↓
KnowledgeDocument
   ↓
ChunkEngine
   ↓
KnowledgeChunk[]
   ↓
KnowledgeIndexer
   ↓
KnowledgeStorage
   ↓
SQLite
```

Existing components include:

- `DefaultKnowledgeEngine`
- `DocumentParser`
- `ChunkEngine`
- `KnowledgeIndexer`
- `KnowledgeStorage`
- `RepositoryAnalyzer`

Existing document contract:

```text
KnowledgeDocument
```

Existing chunk contract:

```text
KnowledgeChunk
```

The current chunker is line-oriented and preserves source line ranges.

Current defaults:

```text
Maximum chunk size: 100 lines
Overlap:             10 lines
```

Current retrieval is lexical rather than semantic.

Conceptually:

```text
query
  ↓
SQL LIKE
  ↓
matching documents
  ↓
chunks
```

There is currently no production semantic vector retrieval path.

---

# 4. Milestone RAG-000 — Knowledge Engine Baseline

**Status:** IN PROGRESS

## Purpose

Understand the existing Vestara Knowledge Engine before modifying it.

## Completed

- [x] Repository baseline
- [x] Knowledge package identified
- [x] Public contracts inspected
- [x] `KnowledgeDocument` understood
- [x] `KnowledgeChunk` contract inspected
- [x] `DocumentParser` understood
- [x] Created controlled source specimen
- [x] Executed parser manually
- [x] Inspected resulting `KnowledgeDocument`
- [x] Identified URI-derived document identity
- [x] Identified trailing-newline line-count edge case
- [x] `ChunkEngine` understood
- [x] Chunked controlled document
- [x] Verified overlap behavior
- [x] Verified `maxSize=5`, `overlap=2`, `stride=3`
- [x] Verified predicted chunk boundaries against runtime output
- [x] Identified missing guard for `overlap >= maxSize`
- [x] Inspected `KnowledgeIndexer`
- [x] Understood filesystem discovery and ingestion filtering
- [x] Understood batching and concurrency (`CONCURRENCY = 8`)
- [x] Understood parser → chunker → storage orchestration
- [x] Inspected `KnowledgeStorage`
- [x] Confirmed current retrieval is lexical SQL `LIKE`
- [x] Confirmed current search score is constant `1.0`
- [x] Identified document-level search / first-five-chunks retrieval limitation
- [x] Identified potential stale chunks during document re-indexing
- [x] Identified application-managed document/chunk referential integrity

## Pending

- [ ] Establish baseline tests — **NEXT**

## Exit Criteria

We can explain and demonstrate:

```text
file → document → chunks
```

without relying on an external framework.

---

# 5. Milestone RAG-001 — Ingestion and Provenance

**Status:** PENDING

## Learn

Understand:

- ingestion
- source identity
- document identity
- content hashing
- metadata
- provenance
- re-indexing
- changed documents
- deleted documents
- authority/status metadata

## Implement

Establish deterministic ingestion for a small controlled Vestara corpus.

Each document should eventually retain information such as:

```text
documentId
sourceUri
sourceType
contentHash
indexedAt
status
authority
scope
```

## Exit Criteria

Given a stored document, Vestara can determine exactly where it came from and which version of the source produced it.

---

# 6. Milestone RAG-002 — Chunking

**Status:** PENDING

## Learn

Understand:

- why chunking exists
- chunk size
- overlap
- semantic boundaries
- line-based chunking
- token-based chunking
- structural chunking
- chunk identity
- chunk provenance

## Implement

Start with Vestara's existing deterministic line-based chunker.

Do not optimize prematurely.

## Experiments

Compare:

```text
100 lines / 0 overlap
100 lines / 10 overlap
50 lines / 10 overlap
```

Observe how boundaries affect retrievable information.

## Exit Criteria

For any chunk, we can answer:

> Why does this chunk exist, which document produced it, and exactly where in the original source did it come from?

---

# 7. Milestone RAG-003 — Embeddings

**Status:** PENDING

## Learn

Understand:

- embedding models
- embedding vectors
- vector dimensions
- semantic representation
- query embeddings
- document embeddings
- normalization
- batching
- model identity
- embedding version compatibility

## Implement

Create an explicit Vestara embedding boundary.

Conceptually:

```text
EmbeddingProvider

embed(text[])
      ↓
EmbeddingVector[]
```

Do not hide embeddings behind generation APIs.

Record at minimum:

```text
text/chunk identity
embedding model
provider
dimensions
vector
```

## Exit Criteria

Manually take one Vestara chunk and produce its embedding.

We must understand exactly:

```text
text
 ↓
embedding model
 ↓
vector
```

before proceeding.

---

# 8. Milestone RAG-004 — Vector Storage

**Status:** PENDING

## Learn

Understand:

- vector persistence
- vector dimensionality
- embedding/model compatibility
- vector indexing
- brute-force search
- approximate nearest-neighbor search

## Initial Implementation

Do not introduce a dedicated vector database yet.

Use the existing local knowledge persistence boundary where practical.

For the small learning corpus:

```text
chunkId → embedding
```

is sufficient.

Similarity calculations can initially happen in TypeScript.

## Later Candidates

Only after understanding the mechanics evaluate technologies such as:

- pgvector
- Qdrant
- other dedicated vector stores

## Exit Criteria

Embeddings survive persistence and can be loaded deterministically for comparison.

---

# 9. Milestone RAG-005 — Vector Mathematics

**Status:** PENDING

This is a mandatory learning milestone.

## Learn

Understand:

- vectors
- dimensions
- dot product
- vector magnitude
- normalization
- cosine similarity
- distance vs similarity
- ranking

Implement cosine similarity manually.

Conceptually:

```text
similarity(A, B) =
    dot(A, B)
    ─────────────
    |A| × |B|
```

## Exercise

Compare embeddings for several Vestara sentences and inspect their similarity scores.

## Exit Criteria

We can explain why two vectors receive their similarity score without depending on a vector database.

---

# 10. Milestone RAG-006 — Semantic Retrieval

**Status:** PENDING

Pipeline:

```text
Question
   ↓
Query Embedding
   ↓
Compare against Chunk Embeddings
   ↓
Cosine Similarity
   ↓
Sort
   ↓
Top-K
```

Retrieval results should expose:

```text
chunkId
documentId
sourceUri
startLine
endLine
similarityScore
embeddingModel
content
```

Important:

```text
similarityScore ≠ truth
similarityScore ≠ authority
similarityScore ≠ confidence
```

## Exit Criteria

A natural-language question retrieves semantically related Vestara chunks without requiring exact keyword matches.

---

# 11. Milestone RAG-007 — Context Assembly

**Status:** PENDING

## Learn

Understand how retrieval becomes LLM context.

Pipeline:

```text
Top-K Retrieval
      ↓
ContextAssembler
      ↓
Bounded Evidence
      ↓
Generation Request
```

Evidence blocks should have explicit identifiers:

```text
[S1]
source...
content...

[S2]
source...
content...
```

Retrieved content must be treated as evidence/data rather than instructions.

## Exit Criteria

We can inspect the exact context supplied to the model before generation occurs.

---

# 12. Milestone RAG-008 — Grounded Generation

**Status:** PENDING

Pipeline:

```text
Question
     +
Retrieved Evidence
     ↓
Grounded Prompt
     ↓
AIProvider
     ↓
Answer
```

The model should:

- answer using supplied evidence
- distinguish evidence from instructions
- avoid unsupported claims
- report insufficient evidence where appropriate
- reference supplied source identifiers

Generation should reuse Vestara's canonical provider boundary rather than create another provider architecture.

## Exit Criteria

Vestara answers one question using only retrieved Vestara knowledge.

---

# 13. Milestone RAG-009 — Citations

**Status:** PENDING

Citations must be structural rather than decorative model text.

Target:

```text
GroundedAnswer
├── answer
├── citations[]
├── retrieval[]
├── model
└── usage
```

A citation should resolve to:

```text
citationId
chunkId
documentId
sourceUri
startLine
endLine
```

The model may reference:

```text
[S1]
```

but Vestara—not the model—must resolve `S1` to authoritative source metadata.

## Exit Criteria

Every citation can be traced to the exact original source location.

---

# 14. Milestone RAG-010 — Evaluation

**Status:** PENDING

Test:

- retrieval correctness
- irrelevant retrieval
- missing evidence
- conflicting evidence
- CURRENT vs PROPOSED information
- superseded information
- citation correctness
- unsupported answers
- re-indexing behavior

Create a deterministic test embedding provider so CI does not require paid embedding calls.

## Exit Criteria

RAG quality can be measured rather than judged solely by whether an answer sounds convincing.

---

# 15. Milestone RAG-011 — Production Hardening

**Status:** PENDING

Only after the basic system works evaluate:

- vector databases
- hybrid lexical/vector retrieval
- BM25
- reranking
- query rewriting
- metadata filtering
- permission filtering
- ingestion jobs
- incremental indexing
- caching
- observability
- embedding migrations
- larger corpora
- prompt-injection defenses

---

# 16. Deferred Technologies

Do not introduce these during the first-principles implementation unless the roadmap explicitly reaches the appropriate milestone:

```text
LangChain
LlamaIndex
Qdrant
pgvector
Chroma
GraphRAG
Agentic RAG
ANN optimization
reranking frameworks
query rewriting frameworks
```

They are not rejected technologies.

They are intentionally deferred until their underlying mechanisms are understood.

---

# 17. Final Dogfood Goal

Vestara should be able to answer:

> What is the authoritative Vestara rule governing X?

Execution must be inspectable:

```text
Question
   ↓
Query Embedding
   ↓
Vector Comparison
   ↓
Top-K Retrieval
   ↓
Authority / Provenance
   ↓
Context Assembly
   ↓
Grounded Generation
   ↓
Citation Resolution
   ↓
Answer
```

Then introduce contradictory sources such as:

```text
CURRENT
PROPOSED
SUPERSEDED
```

Semantic retrieval may find all of them.

Vestara must preserve their authority/status rather than treating the most similar text as truth.

---

# 18. Current Position

```text
RAG-000 Knowledge Baseline       ◐ IN PROGRESS
RAG-001 Ingestion/Provenance     ○ PENDING
RAG-002 Chunking                 ○ PENDING
RAG-003 Embeddings               ○ PENDING
RAG-004 Vector Storage           ○ PENDING
RAG-005 Vector Mathematics       ○ PENDING
RAG-006 Semantic Retrieval       ○ PENDING
RAG-007 Context Assembly         ○ PENDING
RAG-008 Grounded Generation      ○ PENDING
RAG-009 Citations                ○ PENDING
RAG-010 Evaluation               ○ PENDING
RAG-011 Production Hardening     ○ PENDING
```

---

# 19. Session Log

## Session 001 — RAG Program Initialization

**Date:** September 20, 2026

### Decisions

- RAG will initially be developed manually by the repository owner.
- No coding agents.
- No Global Assistant integration.
- No Activity Room integration.
- No workflow orchestration.
- No RAG framework.
- No vector database yet.
- Existing Vestara Knowledge Engine will be evolved rather than replaced.

### Established

Existing architecture has:

```text
Parser
Chunker
Indexer
SQLite Knowledge Storage
Lexical Search
```

Missing semantic pipeline:

```text
Embedding
Vector Storage
Similarity
Semantic Retrieval
Context Assembly
Grounded Generation
Citation Resolution
Evaluation
```

### Next Starting Point

Run the Knowledge Engine baseline inspection.

Then:

```text
ONE Vestara document
       ↓
parse
       ↓
inspect KnowledgeDocument
       ↓
chunk
       ↓
inspect KnowledgeChunk[]
```

Do not begin embeddings until this path is understood and verified.

---

# 20. Resume Point

When returning to this work, begin here:

**Current milestone:** `RAG-000`

**Next task:** manually inspect and execute the existing document parsing and chunking pipeline.

**Do not jump ahead to:** embeddings or vector databases.

The immediate question to answer is:

> How does an ordinary Vestara source file become the exact chunks that will eventually receive embeddings?

---
title: RAG-001 — Vestara Knowledge Authority and Retrieval Baseline
version: 0.1.0
status: planned
owner: vestara
last-reviewed: 2026-09-17
next-review: 2026-10-17
---

# RAG-001 — Vestara Knowledge Authority & Retrieval Baseline

| Field | Value |
|---|---|
| Status | PLANNED |
| Mode | Audit / Architecture |
| Implementation | NOT AUTHORIZED |
| Last Updated | 2026-09-17 |

> Recorded per Reviewer directive 2026-09-17. Marking PLANNED is the entire
> action. **Do not start RAG-001.** Active UI work (UI-FOUNDATION-006 Global
> Layout → Settings convergence) takes precedence; opening RAG-001 now would
> create a second expensive development branch while two UI milestones are
> unfinished.

## Objective

Establish the authoritative knowledge, provenance, retrieval, evidence,
security, and conflict-resolution architecture required **before** implementing
Vestara RAG, embeddings, or vector storage.

## Scope

- knowledge-source taxonomy
- current context/retrieval audit
- source authority
- provenance
- implementation status
- product applicability
- version/freshness
- claim → evidence relationships
- conflicting/superseded knowledge
- retrieval permission boundaries
- RAG evaluation requirements

## Required distinctions

```text
CURRENT
PROPOSED
HOLD
DEPRECATED
SUPERSEDED
UNKNOWN
```

## Core invariants

```text
Retrieval relevance ≠ Authority
Similarity ≠ Truth
Documentation ≠ Implementation
Proposed ≠ Current
Absence of evidence ≠ Evidence of absence
Context ≠ Authority
Retrieved content ≠ Agent instruction
Knowledge ≠ Permission
```

## Initial dogfood corpus

- Vestara architecture/contracts
- source/runtime evidence
- LEGAL-TRUST-001 (`docs/legal/`, DRAFT v0.1)
- verification/evidence records

## Reference regression cases

1. MIT badge exists ≠ proven MIT licensing (`docs/legal/SOFTWARE-LICENSE.md` §1).
2. Internal DELETE ≠ user-facing erasure capability (`docs/legal/DATA-RETENTION-DELETION-POLICY.md` §2; `RAG-DOGFOOD-001` UNKNOWN note).
3. Local telemetry evidence ≠ proof telemetry can never leave host (`docs/legal/TELEMETRY-DATA-POLICY.md` §2).

## Baseline test case

`docs/evidence/RAG-DOGFOOD-001-PERSONAL-DATA-BASELINE.md` — frozen pre-RAG Q&A
with rerun protocol and 0–2 scoring on provenance, precision, contradiction
handling, CURRENT/PLANNED/UNKNOWN classification.

## HOLD (no implementation under RAG-001)

```text
embedding model
vector database
chunking strategy
retrieval framework
indexing architecture
background ingestion
Assistant integration
RAG APIs/UI
```

## Relationship to existing indexing (CURRENT, not duplicated)

- The local Knowledge Engine indexing path (batched SQLite writes,
  `docs/MILESTONES.md` v3.7) and repository comprehension pipeline (v0.3.0)
  are CURRENT file-indexing capabilities. RAG-001 must audit and build on
  them, not re-implement them.

## Exit

Architecture/audit accepted before RAG implementation begins. Activation of
RAG-001 requires explicit authorization after the ACTIVE stream below completes.

## Sequencing (Reviewer directive — binding order)

```text
ACTIVE
│
├── UI Global Layout
│   └── UI-FOUNDATION-006
│       WorkspacePanelLayout / shared page geometry
│
└── Settings UI
    ├── Appearance / Layout
    ├── System / Services
    ├── Environment
    └── remaining Settings convergence

PLANNED
│
└── RAG-001 (this document — NOT AUTHORIZED to start)

LATER
    RAG-002 Canonical Knowledge Contracts
        ↓
    RAG-003 Ingestion + Provenance
        ↓
    RAG-004 Retrieval / Ranking
        ↓
    RAG-005 Assistant Integration
        ↓
    RAG-006 Evaluation / Evidence
        ↓
    RAG-007 Dogfood
```

Architectural dependency (preserved):

```text
Canonical Tokens
      ↓
Canonical Theme
      ↓
Shared UI Primitives
      ↓
Global / Workspace Layout      ← resume here (UI-FOUNDATION-006)
      ↓
Settings                        ← first real consumer of the layout substrate
Activity Room
Files
Agents
Marketplace
...
```

Immediate next move: recover exactly where UI-FOUNDATION-006 / Global Layout
stopped, finish it, then finish Settings on the resulting substrate — rather
than styling Settings independently. After Settings is complete, RAG-001 may
be proposed for activation.

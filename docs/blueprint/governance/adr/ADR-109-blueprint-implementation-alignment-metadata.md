---
id: "adr-109"
adr: "ADR-109"
title: "Blueprint Implementation-Alignment Metadata and Versioned Reconcilement"
category: "standard"
version: 1.0
date: "2026-08-01"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect"]
consulted: ["@documentation-engineer"]
informed: ["@team"]
tags: ["blueprint", "metadata", "governance"]
referenced_by:
  - type: "blueprint"
    target: "99-appendix/implementation-alignment.md"
---

## Context

The Blueprint was frozen while the implementation evolved. Without alignment
metadata, documents cannot distinguish implemented, verified, partial, and
proposed architecture, and stale claims persist.

## Decision

Adopt a universal status metadata block for Blueprint documents, replacing the
permanent-freeze framing with **versioned reconcilement**. Recommended fields:

```yaml
id, title, volume, book, version, status, owner,
created, last-reviewed, next-review,
architecture-status: proposed | accepted | superseded,
implementation-status: not-started | partial | implemented,
verification-status: unverified | partial | verified,
implementation-repository, implementation-ref, tags
```

The Blueprint remains the architectural authority; implementation is the
evidence of reality. The capability maturity matrix
(`99-appendix/capability-maturity-matrix.md`) is the canonical status view, and
`scripts/validate-blueprint.mjs` enforces the metadata.

## Consequences

### Positive
- Clear status for every capability; stale claims are detectable.
- Validation automation keeps links, ids, dates, and ADR references healthy.

### Negative
- New metadata on existing documents (migration effort).
- Validation must not block unrelated work.

### Risks
- Metadata drift (risk; mitigation: validation in CI/review).

## Alternatives Considered
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Keep permanent freeze | stable | cannot reflect implementation | rejected |
| Separate alignment appendix only | light | not per-document | adopted alongside metadata |

## Implementation Notes
- Migration required? Yes (add metadata to new documents; existing docs over
  time).
- Breaking changes? No.

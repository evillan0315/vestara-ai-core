---
id: "adr-012"
adr: "ADR-012"
title: "Immutable Evidence, Comparable Deltas, and Indeterminate Verification Conclusions"
category: "architecture"
version: 1.0
date: "2026-08-06"
status: "accepted"
owner: "@chief-architect"
last-reviewed: "2026-08-06"
next-review: "2026-11-06"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
tags: ["verification", "evidence", "adr", "architecture", "confidence"]
referenced_by:
  - type: "blueprint"
    target: "00-governance/04-decision-log.md"
  - type: "runtime"
    target: "@vestara/verification"
influences:
  - "AI Engineer"
  - "DevOps Engineer"
---

# ADR-012 — Immutable Evidence, Comparable Deltas, and Indeterminate Verification Conclusions

## Context

Vestara's engineering culture is evidence-based: telemetry, engineering
events, filesystem mutations, and verification evidence are first-class
artifacts. Verification today, however, reduces to a boolean — "did the
tests pass?" — which conflates three distinct questions:

1. Did the feature do what it was intended to do?
2. Did it integrate without breaking adjacent systems?
3. Is the repository baseline healthy?

A single pass/fail outcome cannot answer these separately. Two observations
may both be "green" or both be "red" while the underlying failure set, scope,
or environment differ materially. A boolean-only verifier also hides the
subtle case where the failure count is unchanged but the *identity* of the
failures has changed — a regression that count-based reporting misses.

Vestara requires verification conclusions that are derived from immutable
evidence, comparable across runs, and honest about when evidence does not
justify a conclusion at all.

## Decision

> Vestara will derive verification conclusions only from immutable evidence
> snapshots and explicit comparison results. Evidence that is not sufficiently
> comparable must produce an indeterminate conclusion rather than pass or fail.

The architectural boundary is:

- **Domain layer** — collects observations, normalizes evidence, and defines
  subsystem-specific comparison rules. It implements exactly two contracts:
  `EvidenceCollector<TSnapshot>` and `EvidenceComparator<TSnapshot, TDelta>`.
- **Generic evidence framework** — validates provenance, determines
  comparability, produces immutable deltas, derives confidence, derives
  conclusions, and feeds reporting and merge-readiness decisions. It does not
  understand what a failed test, missing graph edge, dropped telemetry event,
  or disabled marketplace asset means.

## Core Invariants

These are stable and should rarely, if ever, change:

1. **Evidence is immutable.** Snapshots are written once and never mutated.
   Conclusions are never stored as primary facts.
2. **Conclusions are derived.** A verification result is always computed from
   two immutable snapshots (baseline and current), never asserted manually.
3. **Comparability precedes conclusions.** The framework must evaluate whether
   evidence is comparable before producing any regression or readiness result.
4. **`incomparable` → `indeterminate`.** Evidence that cannot be compared must
   produce an indeterminate conclusion, not a pass or failure.
5. **Confidence is derived from evidence quality.** Confidence reflects the
   strength and completeness of the evidence, not the existence of evidence.
   Partial comparability narrows valid conclusions and lowers confidence.
6. **The framework may refuse to conclude.** When evidence is insufficient or
   invalid, the framework must be allowed to return `indeterminate` rather than
   invent a pass/fail.

## Extension Model

New subsystems implement only two contracts:

```ts
interface EvidenceCollector<TSnapshot> {
  collect(): Promise<TSnapshot>;
}

interface EvidenceComparator<TSnapshot, TDelta> {
  compare(baseline: TSnapshot, current: TSnapshot): TDelta;
}
```

The shared framework provides `ComparabilityEvaluator`, `ConfidenceDeriver`,
`ConclusionEngine`, `EvidenceStore`, `VerificationReporter`, and
`MergeReadinessPolicy`. Expected subsystem integrations include repository
verification, engineering graph state, telemetry traces, workflow state,
runtime topology, marketplace inventories, and visual baselines.

A strong shared snapshot contract:

```ts
interface EvidenceSnapshot<TIdentity, TExecution, TResult> {
  schemaVersion: string;
  evidenceType: string;
  identity: TIdentity;
  execution: TExecution;
  results: TResult;
  capturedAt: string;
  contentHash: string;
}
```

## Rejected Alternatives

- **Boolean-only verifier** — rejected: it conflates feature correctness,
  integration health, and repository baseline, and cannot distinguish a
  changed failure identity from a stable one.
- **A shared universal evidence schema for every subsystem** — rejected:
  repository tests, engineering graph, telemetry, and marketplace state have
  materially different semantics; domain adapters own their evidence shapes.
- **Storing conclusions as primary facts** — rejected: persisted conclusions
  hide the provenance and comparison that justify them and cannot be replayed.
- **Trusting tool exit codes without preserving supporting evidence** —
  rejected: exit codes without the underlying observation, scope, and
  environment are not reproducible evidence.

## Consequences

### Positive

- Verification results are auditable and replayable from immutable evidence.
- Regression detection is objective: a computed `RepositoryEvidenceDelta`
  reports added/resolved/unchanged failures rather than a raw count.
- Consistent reasoning across every subsystem without coupling them to a
  single evidence schema.
- The framework is self-aware about comparison quality through the
  `comparable` field, preventing false confidence from invalid comparisons.

### Trade-offs

- More storage: immutable snapshots, deltas, and metadata accumulate.
- More metadata: identity, scope, environment, and provenance must be recorded
  on every snapshot.
- Explicit comparability logic is required for every domain comparator.
- Additional implementation effort to stand up the shared framework.

## Out of Scope

- Snapshot storage implementation (backend, retention, indexing).
- Evidence serialization format and transport protocol.
- UI and dashboards.
- Merge-readiness policy details.
- Confidence algorithm specifics.

These are intentionally left to evolve independently. By declaring them out of
scope, the ADR preserves the architectural contract without prescribing
implementation.

---

- Supersedes: none
- Dependencies: none
- Related: `docs/ADR/ADR-007-decision-pipeline.md`, `docs/ADR/ADR-009-recovery-full-kernel-composition.md`

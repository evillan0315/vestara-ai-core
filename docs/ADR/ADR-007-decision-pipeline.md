---
id: "adr-007"
adr: "ADR-007"
title: "Decision Pipeline"
category: "implementation"
version: 1.0
date: "2026-08-03"
status: "accepted"
owner: "@chief-architect"
last-reviewed: "2026-08-03"
next-review: "2026-11-03"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
tags: ["decision-pipeline", "governance", "permission", "policy", "verification", "trust", "history"]
referenced_by:
  - type: "blueprint"
    target: "00-governance/04-decision-log.md (ADR-035 Decision Pipeline)"
  - type: "runtime"
    target: "@vestara/decision-pipeline"
  - type: "runtime"
    target: "@vestara/kernel"
influences:
  - "AI Engineer"
---

# ADR-007 — Decision Pipeline

## Context

The Execution Layer can run jobs, but nothing enforces the *order* or
*invariant chain* connecting governance stages. The Blueprint decision
ADR-035 establishes the Decision Pipeline as an invariant chain every request
must traverse in order, with no stage bypassed or reordered:

```
Request → Permission → Policy → Execution → Verification → Trust → History
```

Each stage is knowledge-bounded: Permission knows only identity/role; Policy
only organizational rules; the Scheduler only workers/capabilities; Workers
never self-authorize or self-verify; Verification produces evidence, not
opinions; Trust is the first probabilistic stage; History is immutable and
append-only.

## Decision

Introduce `@vestara/decision-pipeline`, a dependency-light package (depends only
on `@vestara/types`) that realizes the ADR-035 chain without hard-coupling to
any existing implementation:

- **`DecisionContext`** — the canonical typed accumulation object. Each stage
  populates exactly one additional field: `request`, `principal`,
  `permissionResult`, `policyDecision`, `executionResult`,
  `verificationResult`, `trustRecord`, `historyRecord`.
- **`DecisionPipeline`** — runs stages in the fixed `STAGE_ORDER`
  (permission → policy → execution → verification → trust → history),
  enforces "one field per stage" (duplicate or unknown fields error), and
  short-circuits when Permission denies.
- **Stage adapters** — `permissionStage`, `policyStage`, `executionStage`,
  `verificationStage`, `trustStage` compose an existing implementation behind a
  thin interface (e.g. `@vestara/permissions`, `@vestara/policy-engine`,
  `@vestara/verification`, `@vestara/trust`) so the pipeline stays
  dependency-light and integration happens at the composition root.
- **`HistoryRecorder`** — append-only history: records are immutable, and a
  failure is recorded as a new record referencing the original decision.

The Kernel composes the pipeline at boot from its existing Permission /
Scheduler / Worker components, honoring the kernel's "orchestrates, not
implements" invariant.

## Alternatives Considered

- **Merge Permission and Policy stages** — rejected by ADR-035: identity and
  governance have different sources of truth.
- **Make Trust deterministic** — rejected: trust must incorporate probabilistic
  evidence (failure rates, recovery patterns).
- **Let workers self-verify** — rejected: verification must be independent of
  execution.

## Trade-offs

- Adapters are thin by design; the pipeline does not know a specific
  implementation, which keeps it reusable but moves wiring to the composition
  root.
- Read-only operations may skip execution/verification/trust stages by simply
  omitting those stage runners, per ADR-035.

## Consequences

- Every governed request now has a canonical, auditable path through the
  invariant chain.
- History becomes the immutable audit trail for replay and debugging.
- This is the integration point for Intent (ADR-005): an Intent produces the
  plan that enters the pipeline at Execution.

---

- Supersedes: none
- Dependencies: `@vestara/types`
- Implements (blueprint): ADR-035, `00-governance/07-ai-operating-system-architecture.md`
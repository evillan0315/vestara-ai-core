---
id: "adr-009"
adr: "ADR-009"
title: "Recovery & Full Kernel Composition"
category: "implementation"
version: 1.0
date: "2026-08-03"
status: "accepted"
owner: "@chief-architect"
last-reviewed: "2026-08-03"
next-review: "2026-11-03"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
tags: ["recovery", "failure-budget", "quarantine", "kernel", "boot", "reliability"]
referenced_by:
  - type: "blueprint"
    target: "00-governance/04-decision-log.md (ADR-029 Recovery & Failure Budget, ADR-030 Kernel Architecture)"
  - type: "runtime"
    target: "@vestara/kernel"
  - type: "runtime"
    target: "@vestara/verification"
  - type: "runtime"
    target: "@vestara/trust"
influences:
  - "DevOps Engineer"
  - "Backend Engineer"
---

# ADR-009 — Recovery & Full Kernel Composition

## Context

Runtimes fail, workers crash, and jobs time out. The Blueprint decision
ADR-029 requires a **recovery strategy** (configurable retry) and an objective
**failure budget** that "tracks error rates across services" and triggers
"alerts and automated mitigation" on exhaustion. ADR-030 defines the Kernel as
the composition root owning lifecycle, shared infrastructure, permissions,
policy, and the service dependency graph, with a 16-step boot order from
Configuration through the Interface Layer.

`vestara-ai-core` already had `DefaultRecoveryManager` (retry + backoff +
escalation) but lacked the failure budget, worker quarantine, and the
verification/trust engines as composed boot infrastructure.

## Decision

Extend `@vestara/kernel` with three capabilities and reconcile the boot
composition:

### 1. Failure budget — `FailureBudget` (ADR-029)

A windowed, per-component error-rate budget. `recordOutcome(ok)` feeds a
sliding window; the budget reports `healthy` → `consuming` → `exhausted`.
Exhaustion fires `recovery:failure-budget.exhausted` once, carries a
`mitigation` action (`notify | degrade | quarantine | halt`), and can be
`reset()`. `minOutcomes` prevents premature exhaustion on tiny samples.

### 2. Worker quarantine — `DefaultWorkerManager` extension (ADR-029)

Workers now have a per-worker failure budget (`failureBudgetFor`). `quarantine`
removes a worker from scheduling and records metadata; `release` re-registers
it and resets its budget; expired quarantines auto-release after
`releaseAfterMs` (deadlock-free remediation, mirroring the ownership lock
design).

### 3. Full kernel composition — verification & trust engines at boot (ADR-030)

The kernel boot now also instantiates and exposes the **Verification Engine**
(`@vestara/verification`, deterministic evidence) and the **Trust Engine**
(`@vestara/trust`, probabilistic reputation) alongside the existing
Recovery Manager, Job Scheduler, Job Manager, Intent Manager, Ownership & Lock
Manager, and Decision Pipeline. This completes the Runtime-layer composition
of ADR-030's 16-step order; the Interface Layer (API, WebSocket, CLI) remains
the embedding host's responsibility.

## Alternatives Considered

- **Ephemeral error counters** — rejected: without a window and min-sample
  gate, transient spikes and tiny samples misclassify health.
- **Hard-killing failed workers** — rejected: quarantine + auto-release is
  reversible and preserves the worker for diagnosis, matching the
  deadlock-free recovery principle.
- **Verification/trust as optional plug-ins only** — rejected: composing them
  at boot makes the decision pipeline's later stages (ADR-007) reachable by
  default.

## Trade-offs

- Failure budgets are in-memory; a durable budget would require persistence
  and is future work.
- Auto-release uses a fixed `releaseAfterMs` per manager; per-worker cooldown
  tuning is left to embedding hosts.
- The kernel now composes more engines at boot, marginally increasing boot
  surface in exchange for a complete Runtime layer.

## Consequences

- Every worker gets an objective exhaustion signal that feeds remediation.
- Quarantine is the default mitigation for exhausted workers.
- Kernel consumers get `verificationEngine` and `trustEngine` at boot, ready
  for the Decision Pipeline's verification/trust stages (ADR-007).

---

- Supersedes: none
- Dependencies: `@vestara/verification`, `@vestara/trust`, `@vestara/scheduler`
- Implements (blueprint): ADR-029, ADR-030, `00-governance/07-ai-operating-system-architecture.md`
---
id: "adr-005"
adr: "ADR-005"
title: "Intent Systems — Goal to Execution Plan"
category: "implementation"
version: 1.0
date: "2026-08-03"
status: "accepted"
owner: "@chief-architect"
last-reviewed: "2026-08-03"
next-review: "2026-11-03"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
tags: ["intent", "planner", "planning", "job", "kernel", "state-machine"]
referenced_by:
  - type: "blueprint"
    target: "00-governance/04-decision-log.md (ADR-026 Intent Model)"
  - type: "runtime"
    target: "@vestara/intent"
  - type: "runtime"
    target: "@vestara/kernel"
influences:
  - "AI Engineer"
---

# ADR-005 — Intent Systems (Goal to Execution Plan)

## Context

The Execution Layer schedules Jobs (ADR-024) onto Workers (ADR-025) once a plan
exists, but nothing turns a user goal into that plan. Users express goals in
natural language; sub-processes need a safe, deterministic place to produce an
ordered set of jobs. Without an Intent model, the Planner has no structured
input and the Scheduler no structured output, so every caller would invent its
own ad-hoc goal→job decomposition.

The Blueprint decision ADR-026 ("Intent Model — Goals to Execution Plans")
specifies the capability; this implementation ADR records how
`@vestara/intent` realizes it inside `vestara-ai-core`.

## Decision

Introduce `@vestara/intent`, a zero-runtime-dependency planning package (depends
only on `@vestara/state-machine` and `@vestara/types`), exposing three
abstractions:

- **`Intent`** — a state-machine-backed goal record. States:
  `submitted → planning → executing → completed | failed | cancelled`, with
  `paused ⇄ executing`. It owns constraints, success criteria, an optional
  `ExecutionPlan`, and produces an immutable `IntentInfo` projection.
- **`Planner`** — a deterministic goal→plan decomposer. It matches step
  definitions against the goal text, orders jobs, builds a dependency graph from
  `dependsOn` relationships, and sums `estimatedDuration`. Identical inputs yield
  identical plans; `maxJobs` constraints clamp the number of steps.
- **`IntentManager`** — the lifecycle facade. Submits intents, drives
  plan/approve/complete/cancel/pause/resume/fail, and queries by status.

The Kernel instantiates `IntentManager` during boot so job-driven workflows can
seed plans through the same composition root as the scheduler and job manager,
honoring the kernel's "orchestrates, not implements" invariant.

## Alternatives Considered

- **Planner inside Workspace/`execution-planner`** — rejected: that planner is
  role-assignment oriented and tied to the workspace facade; the runtime Intent
  system needs a dependency-light, runtime-layer home.
- **Extend `@vestara/job` directly** — rejected: jobs represent *how* the system
  runs a single operation; intents represent *why* the set of jobs exists
  (goal, constraints, criteria). Keeping plan construction separate avoids
  overloading the job lifecycle.

## Trade-offs

- Deterministic planning is intentionally simple (keyword step-matching), so
  complex, ML-driven decomposition is not attempted here. This keeps the run
  path predictable at the cost of sophistication.
- Job IDs in an `ExecutionPlan` are placeholders (`"1"`, `"2"`, …); a real
  scheduler assigns worker-scoped `JobId`s. Dependencies reference these logical
  positions, not durable IDs.

## Consequences

- New kernels and embedding hosts get a canonical `IntentManager` instead of
  bespoke goal→plan code.
- The planner is deterministic, keeping execution evidence reproducible.
- This is the natural integration point for ADR-035's Decision Pipeline: the
  Intent system produces the `ExecutionPlan` that becomes the first class of the
  decision chain (Plan → Permission → Policy → Execution → Verification →
  Trust → History).

---

- Supersedes: none
- Dependencies: `@vestara/state-machine`, `@vestara/types`
- Implements (blueprint): ADR-026, `00-governance/07-ai-operating-system-architecture.md`
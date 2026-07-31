---
id: "adr-004"
adr: "ADR-004"
title: "Multi-Agent Workflow"
category: "implementation"
version: 1.0
date: "2026-07-31"
status: "proposed"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager", "@product-manager"]
tags: ["workflow", "orchestration", "agents", "events", "state-machine"]
referenced_by:
  - type: "architecture"
    target: "docs/Architecture/Agent-Orchestration.md"
  - type: "blueprint"
    target: "PCS-025 Multi-Agent Project Management"
influences:
  - "AI Engineer"
  - "Backend Engineer"
---

# ADR-004 — Multi-Agent Workflow

## Context

`AgentWorkflowService` hard-coded a single sequential `feature` workflow
(architect → developer → verifier). Project management demands multiple plans, task
dependencies, parallel execution, approvals, revisions, retries, resumability, and a
complete audit history — none of which the prototype supports.

## Decision

Introduce a `WorkflowOrchestrator` as the single writer of workflow state, driven by an
event model and persisted state machines:

- **Orchestrator owns state**: project/plan/task state machines; agents are pluggable
  specialists producing/consuming artifacts.
- **Event-driven**: agents communicate via `@vestara/events` with correlation IDs; the
  workflow is replayable from the event log.
- **Task graph**: planner emits a DAG; orchestrator dispatches parallel waves with
  file-lock coordination.
- **Failure handling**: bounded retries + bounded revision loops; human escalation as
  the final path (Approval Gateway).
- **Resumability**: persisted `ExecutionJob.checkpoint` + task state; re-entry is
  idempotent.
- **Capability-based assignment**: tasks declare required capabilities; the resolver
  (`@vestara/capabilities`) matches agents — replacing keyword regex matching.

See PCS-025 for the full design; this ADR records the decision and rationale.

## Alternatives Considered

- **Extend AgentWorkflowService in place**: rejected — a hard-coded step list cannot
  express dependencies, parallelism, or retries.
- **Direct agent-to-agent calls**: rejected — couples specialists, breaks replayability
  and audit.
- **Stateless dispatch (fire-and-forget)**: rejected — no resumability or partial
  completion semantics.

## Trade-offs

- Orchestrator is a coordination bottleneck by design; mitigated by horizontal
  worker scaling (agents execute outside the orchestrator).
- Event-sourced replay requires disciplined, idempotent agent steps.

## Consequences

- New agent roles register via `AgentDefinition` + capability declarations without
  orchestrator changes.
- Remote workers can implement the existing `remote` `WorkerType` contract.
- Status: proposed — implementation is staged per the PCS-025 roadmap (Phase 1
  orchestration core → Phase 2 review/test/approval → Phase 3 distributed).

---

- Supersedes: `AgentWorkflowService` single-workflow prototype
- Dependencies: ADR-001, ADR-002, ADR-003

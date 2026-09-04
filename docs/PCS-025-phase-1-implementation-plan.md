---
title: "PCS-025 — Phase 1 Implementation Plan: Orchestration Core"
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# PCS-025 — Phase 1 Implementation Plan: Orchestration Core

**Status**: In progress — core package delivered, integration wired (see §11)

| Field | Value |
|-------|-------|
| ID | PCS-025 Phase 1 |
| Name | Multi-Agent Workflow Orchestration Core |
| ADR | ADR-004 (implementation), ADR-118 (blueprint) |
| Blueprint | `PCS-025-multi-agent-project-management.md` |
| Scope | `WorkflowOrchestrator` + project/plan/task state machines + task/artifact/file-lock stores + event catalog extension + retry policy + task-graph waves + resume/checkpoint |

## 1. Context

ADR-118 was **proposed** at the time this plan was written; it is now **accepted**
(2026-08-03) with Phase 1 implemented. The current execution path is the single-agent
durable harness (`AgentHarnessRuntime`). There is no `WorkflowOrchestrator`,
`TaskStore`, `ArtifactStore`, or `FileLockRegistry` anywhere in
`vestara-ai-core`. The legacy `AgentWorkflowService`
(`packages/workspace/src/agent-workflow-service.ts`) hard-codes one sequential
`feature` workflow (architect → developer → verifier), is in-memory only, and
is referenced by no API route — it is the prototype ADR-118 supersedes.

### What already exists and is reusable

| Foundation | Location | Reuse |
|-----------|----------|-------|
| Generic state machine | `packages/state-machine/src/index.ts` | project/plan/task machines |
| Capability resolver | `packages/capabilities/src/resolver.ts` | capability-based task assignment (Phase 2) |
| Agent capability declarations | `AgentDefinition.capabilities` (`packages/workspace/src/types.ts:567`), seeded in `agent-storage.ts` | assignment |
| Temporal event store w/ `correlationId`/`taskId`/`threadId` | `packages/engineering-event-store/src/index.ts` | replayable orchestration log |
| Durable harness (execution path) | `packages/agent-harness/`; `HarnessExecutionAdapter` (`packages/workspace/src/harness-session.ts:267`) | per-task execution |
| Canonical workflow projection + swimlanes | `packages/workflow-projections/` | multi-agent run visibility |
| Multi-thread aggregation (built, unwired) | `projectWorkflowAcrossThreads` (`packages/workflow-projections/src/multithread.ts`) | agent swimlanes |
| Worktree leases | `packages/worktree-runtime/` | conflict prevention (Phase 2 waves) |

## 2. Architecture Approach

The orchestrator is the **single writer of workflow state**. Each task is
dispatched as **one durable harness thread** (the harness is the execution
path). The orchestrator:

- owns project/plan/task state machines (built on `@vestara/state-machine`);
- applies events → transitions machines → persists → appends `orchestration.*`
  events to the existing `SqliteEngineeringEventStore`;
- derives state and resumes from event replay (idempotent re-entry).

This reuses the existing temporal event store instead of introducing a parallel
event model, and the multi-thread projection makes runs visible today via
`projectWorkflowAcrossThreads` (each agent thread already projects; grouping by
a shared workflow key is the remaining glue).

## 3. New Package: `packages/workflow-orchestrator/`

Clean layering mirroring `packages/workflow-projections/`. CommonJS +
`module: nodenext` per repo convention; sql.js stores follow the
`db.prepare(...).run(params)` pattern used by `PlanStorage`.

| File | Contents |
|------|----------|
| `src/types.ts` | `WorkflowTask` = existing `Task` (`types.ts:190`) + `requiredCapabilities[]`, `assignedAgentId?`, `revisionCount`, `lastError?`, `startedAt/completedAt`. Project/plan/task state unions. 13 task states per PCS-025 §5. |
| `src/state-machines.ts` | Project/Plan/Task machines from `@vestara/state-machine`; transition tables match PCS-025 §7. |
| `src/task-graph.ts` | Topological sort over `Task.dependencies[]` → parallel waves; cycle detection. `ExecutionPlanner` currently ignores deps (`execution-planner.ts:45-63`). |
| `src/stores/task-store.ts` | sql.js `tasks` table: id, plan_id, summary, description, files (JSON), dependencies (JSON), status, required_capabilities (JSON), assigned_agent_id, revision_count, last_error, started_at, completed_at, created_at, updated_at. |
| `src/stores/artifact-store.ts` | Versioned artifact JSON docs (kind `analysis|plan|architecture|changeset|review|test|verification`, projectId, planId?, taskId?, agentId, body, version). |
| `src/stores/file-lock-registry.ts` | path → holderAgentId/taskId, acquire/release with conflict detection; emits `file.lock.*` events. |
| `src/retry-policy.ts` | Exponential backoff, max 3 attempts; revision cap 3; escalation → approval. |
| `src/orchestrator.ts` | `WorkflowOrchestrator` — event-apply loop, dispatch via injected `runTask` adapter (wraps `HarnessExecutionAdapter`), checkpoint + resume. |
| `__tests__/` | See §8. |

## 4. Event Catalog Extension

New append-only `orchestration.*` event types through the existing
`SqliteEngineeringEventStore` (each carrying `correlationId` = projectId, plus
`planId`/`taskId` where applicable):

- `project.created`, `project.phase.changed`
- `task.created`, `task.ready`, `task.assigned`, `task.started`,
  `task.completed`, `task.failed`, `task.blocked`, `task.retrying`,
  `task.revision`
- `file.lock.acquired`, `file.lock.released`, `file.lock.conflict`
- `workflow.checkpoint`

No change to the `@vestara/events` UI catalog is required for Phase 1; the
kernel event bus forwarder (`workspace-context.ts:750`) already publishes
events to the UI.

## 5. Wiring (`apps/api/src/`)

1. `workspace-context.ts:215` — construct stores + orchestrator in the
   composition root; expose on `WorkspaceContext` (pattern: lines 842-920).
2. `routes/agent-harness.ts:47` — stamp a shared `workflowId`/`projectId` into
   thread `metadata` and `taskId` when creating task threads so sibling threads
   group for the multi-thread projection.
3. `routes/workflow.ts` — for grouped threads, serve `projectWorkflowAcrossThreads`
   instead of single-thread `projectWorkflow` (this is the "agent swimlanes"
   item on `20-roadmaps/engineering-os-roadmap.md:104`).
4. New `routes/orchestration.ts` — `POST /api/projects/:id/start`,
   `GET /api/projects/:id/state`, `GET /api/projects/:id/audit`.

## 6. Supersede Legacy Prototype

Deprecate the `AgentWorkflowService` export
(`packages/workspace/src/agent-workflow-service.ts`) once the orchestrator
replaces it. It is already dead code (exported from the package index, no route
consumer). `WorkflowService` (`workflow-service.ts`) is a separate guided-CLI
step list and stays.

## 7. Acceptance Criteria (PCS-025 Phase 1)

- A project started through the orchestrator runs analyst → planner → architect
  → (approval) → task waves → verifier and completes with `verification.passed`.
- Full audit: every transition is an `orchestration.*` event with
  `correlationId`; replay of the event log reproduces identical state.
- Resume: an interrupted run re-enters from the last checkpoint idempotently.

## 8. Tests + Verification

`packages/workflow-orchestrator/__tests__/` (Vitest, sql.js in-memory):

- state machine transition tables (valid + invalid transitions)
- task-graph wave ordering + cycle detection
- task/artifact store persistence
- file-lock acquire/release + conflict
- orchestrator happy-path with a fake executor (task → `verification.passed`)
- retry and revision caps → blocked/escalation
- resume-from-replay idempotency

Sequence: `pnpm lint && pnpm build && pnpm test` (build before test — tests
resolve `@vestara/*` from `dist/`).

## 9. Sequencing

1. Scaffold package + types + state machines + tests
2. Stores (task/artifact/file-lock) + tests
3. Task graph + retry policy + tests
4. Orchestrator (event-apply loop + dispatch adapter) + happy-path test
5. `orchestration.*` event catalog + composition-root wiring
6. API routes + thread workflow-key stamping
7. Projection wiring (`projectWorkflowAcrossThreads` exposed)
8. Deprecate `AgentWorkflowService`; update ADR-004/ADR-118 status and
   `docs/IMPLEMENTATION_STATUS.md`

## 10. Status Reconciliation Note

`docs/IMPLEMENTATION_STATUS.md` marks **v5.3 Agent Workflow Orchestration** as
✅ Complete. That row reflects the legacy `AgentWorkflowService` prototype, not
ADR-118 orchestration. The 2026-08-02 reconciliation report instructed keeping
ADR-118 proposed — that guidance is **superseded on 2026-08-03**: ADR-118 (and
implementation ADR-004) moved to **accepted** with Phase 1 orchestration core
implemented, tracked as **v5.4 🔶 Partial** in `IMPLEMENTATION_STATUS.md`.
Phases 2-3 (review/test/approval, parallel waves, remote workers) remain, so
the full multi-agent lifecycle is not yet marked complete.

## 11. Delivery Notes (2026-08-03)

Phase 1 core is implemented and green:

- **New package** `packages/workflow-orchestrator/` — `WorkflowOrchestrator`,
  project/plan/task state machines (`@vestara/state-machine`), `TaskStore` /
  `ArtifactStore` / `FileLockRegistry` (sql.js), task-graph waves + cycle
  detection, bounded retry/revision policy, checkpoint + idempotent resume.
  28 tests pass; biome clean; `tsc` builds.
- **Execution adapter** `HarnessTaskDispatcher`
  (`packages/workspace/src/harness-task-dispatcher.ts`) — the PCS-025 "agents
  are pluggable specialists" boundary: each task runs as its own durable harness
  thread tagged with a shared `workflowId`. Task → agent assignment uses the
  real `@vestara/capabilities` resolver (exact, wildcard, and implied matches)
  — replacing keyword regex matching (PCS-025 §5). 7 tests pass.
- **Event bridge** `apps/api/src/bridges/orchestration-event-bridge.ts` —
  projects `orchestration.*` events into the temporal engineering event store.
- **Composition root + API** — `WorkflowOrchestrator` wired in
  `apps/api/src/workspace-context.ts`; `apps/api/src/routes/orchestration.ts`
  exposes the project lifecycle (`POST /api/orchestration/projects`, phase
  actions, snapshot, audit).
- **Reconciliation with parallel work** — the concurrent
  `MultiAgentWorkflowOrchestrator` (harness stage-chain) is kept as the
  low-level execution model; it and the multi-thread projection feed this
  orchestrator. `projectWorkflowAcrossThreads` now resolves the shared
  `workflowId` from thread metadata. Two type errors in that in-progress work
  were fixed so the full `pnpm build` passes.

All Phase 1 acceptance items (§7) are now delivered: a harness-backed
end-to-end project run (`apps/api/__tests__/workflow-orchestrator-harness.test.ts`),
projection wiring (`/api/workflow` multi-thread aggregation), and the approval
gateway (Phase 2).

### Delivery Notes — Phase 2 & Phase 3 foundations (2026-08-03)

- **Phase 2 (complete):** reviewer + tester stages with bounded revision loops
  (`TaskDispatcher.review/test`; `needs-review → reviewing → approved |
  changes-requested → assigned | rejected → blocked`, revision cap), the
  high-risk-change **Approval Gateway** (`DefaultRiskApprovalPolicy`,
  `awaiting-approval` task state, `resolveTaskApproval`, `pendingApprovals`,
  `/api/orchestration/projects/:id/tasks/:taskId/approval`), **parallel task
  waves** (`maxParallelTasks`, bounded lock-wait then block), and capability-
  based assignment via `@vestara/capabilities`. 11 new orchestrator tests.
- **Phase 3 (complete):** `TokenBudget` (blocks dispatch when exhausted),
  event-sourced `reconcile(projectId, events)` drift detection, and
  failure-injection/load tests. Remote workers (v10.0) are complete; multi-repo
  projects remain future — the `TaskDispatcher` interface is the worker contract.
- `HarnessTaskDispatcher.review/test` run reviewer/tester harness turns with a
  deterministic decision parser (`parseReviewDecision`).
- Tests: full suite green (150 files), lint clean, build clean.

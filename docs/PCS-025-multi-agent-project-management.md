---
title: PCS-025 — Multi-Agent Project Management
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# PCS-025 — Multi-Agent Project Management

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-025 |
| Name | Multi-Agent Project Management Workflow |
| Status | Implemented — orchestration core (Phase 1), review/test stages, Approval Gateway, parallel waves, token budgets, event-sourced reconcile (Phases 1–3) |
| Owner | Chief Architect |
| Prerequisite | PCS-003 Planning, PCS-004 Implement, PCS-005 Verify, PCS-007 Agent Runtime, PCS-011 Agent Execution, PCS-017 Execution Engine, PCS-024 Agent Filesystem Capabilities |
| Scope | Multi-agent project lifecycle: creation → implementation → review → verify → complete |

> **Implementation status (2026-08-03)**: Phases 1–3 are delivered —
> `packages/workflow-orchestrator/` provides `WorkflowOrchestrator`,
> project/plan/task state machines, `TaskStore`/`ArtifactStore`/
> `FileLockRegistry`, bounded retry/revision policy, task-graph waves,
> idempotent resume, reviewer/tester stages with bounded revision loops,
> the high-risk-change Approval Gateway, parallel task waves with file-lock
> contention handling, token budgets, and event-sourced reconcile/rebuild.
> Tasks execute through the harness
> (`packages/workspace/src/harness-task-dispatcher.ts`); `orchestration.*` events
> project into the engineering event store; `/api/orchestration/*` exposes the
> lifecycle. See `docs/PCS-025-phase-1-implementation-plan.md` §11 for the
> delivery record. Remote workers (v10.0) are complete; multi-repo projects
> remain future.

> **Canonical reference**: the architectural model (WorkflowOrchestrator, event bus,
> agent/task lifecycles, artifact model, state machines, file locking, capability
> system, approval workflow) is documented once in
> [`docs/Architecture/Agent-Orchestration.md`](Architecture/Agent-Orchestration.md)
> and ADRs [ADR-001](ADR/ADR-001-runtime.md),
> [ADR-002](ADR/ADR-002-capability-system.md),
> [ADR-004](ADR/ADR-004-multi-agent-workflow.md). This blueprint specifies the workflow
> lifecycle, event/data model, failure recovery, and roadmap.

This blueprint maps onto the **existing** Vestara runtime. Every section names the
components that already exist (verified in source) and the components that must be
built. Where a feature exists in prototype form, the gap is called out explicitly.

---

## 1. Overall Architecture

Layered design. Agents are **specialists coordinated by an orchestrator**; every
concern has one owner (the existing coordinator-composes-specialists invariant).

```
┌────────────────────────── Human ──────────────────────────┐
│   Approval Gateway (plan/architecture/high-risk/deploy)   │
└───────────────▲─────────────────────────────┬─────────────┘
                │ approve / reject / resume    │ requests
┌───────────────┴─────────────────────────────▼─────────────┐
│  WorkflowOrchestrator  (NEW)                                │
│  • project/plan/task state machines                         │
│  • retry & revision policy                                  │
│  • resume/checkpoint                                        │
│  • task dispatch + file-lock coordination                   │
└───┬────────────┬─────────────┬─────────────┬───────────────┘
    │            │             │             │
    ▼            ▼             ▼             ▼
┌────────┐ ┌──────────┐ ┌────────────┐ ┌───────────────────┐
│ Agent  │ │ Agent    │ │ Agent      │ │ AgentWorker        │
│ Runtime│ │ Coordinator│ │ Capability │ │ (in-process/      │
│(exists)│ │(exists)   │ │ Manager    │ │  subprocess/remote)│
└────────┘ └──────────┘ └────────────┘ └───────────────────┘
    │            │             │             │
    ▼            ▼             ▼             ▼
┌────────────────────────────────────────────────────────────┐
│  Runtime layer: FilesystemRuntime, RuntimeGroup, Kernel,    │
│  ExecutionEngine, ImplementationService, VerificationService│
└────────────────────────────────────────────────────────────┘
    │            │             │             │
    ▼            ▼             ▼             ▼
┌────────────────────────────────────────────────────────────┐
│  Persistence: sql.js stores (agents/plans/changeSets/…)     │
│  + NEW stores: projects, artifacts, approvals, fileLocks,   │
│  executionJobs, auditLog                                    │
└────────────────────────────────────────────────────────────┘
    │
    ▼
┌────────────────────────────────────────────────────────────┐
│  EventBus (@vestara/events) + TelemetryRuntime + ActivityLog│
│  + UnderstandingEngine/Memory (shared context)              │
└────────────────────────────────────────────────────────────┘
```

**Existing components (verified):**
- `DefaultKernel` boots job manager, recovery manager, task scheduler, worker manager.
- `EventBus` + `@vestara/events` typed `WorkspaceEvent` (10 categories).
- `AgentRuntime` (`packages/workspace/src/agent-runtime.ts`) role dispatch.
- `AgentCoordinator`/`AgentWorker` (in-process, subprocess, remote types).
- `ExecutionPlanner` (keyword role assignment, strategy) + `ExecutionEngine` (async jobs, progress, cancel).
- `AgentCapabilityManager` + `FilesystemRuntime` (sandboxed fs, approval gates, history).
- `PlanningService`, `ImplementationService`, `VerificationService`, `WorkspaceAnalyst`.
- `AgentWorkflowService` (single hard-coded `feature` workflow — **prototype only**).
- `@vestara/state-machine` (generic), `@vestara/understanding` (observe → understand → plan).
- `@vestara/capabilities` (catalog/resolver/matcher — not yet wired to execution).
- `TelemetryRuntime`, `ActivityLogStore`, `AuditStore`, `MemoryService`.

**Gap summary (what must be built):** a real `WorkflowOrchestrator`, per-task state
machine + retry/revision policy, file-lock registry, artifact store + review/test
services, approval gateway, audit-event pipeline, and resumability/checkpointing.

---

## 2. Workflow Diagram (textual)

```
User creates Project
        │
        ▼
P1 Analyzing ──► Repository Analyst ──► RepositoryAnalysisReport
        │
        ▼
P2 Planning ───► Planner ──► Plan + TaskGraph
        │
        ▼
P3 Architecture Review ──► Architect ──► ArchitectureReview (pass / violate)
        │
        ▼
P4 Pending Approval ──► HUMAN: approve / reject / edit scope
        │ approved
        ▼
P5 Executing ──► per task (parallel via DAG):
        │        Developer ──► Changeset ──► Reviewer (approve/changes/reject)
        │          ▲  ▲            │  │
        │          │  └── revision loop ──┘
        │          └─ retry on failure/cancel/resume
        │
        ▼
P6 Testing ────► Tester ──► TestReport (pass / fail)
        │
        ▼
P7 Verifying ──► Verifier ──► VerificationReport (pass / fail)
        │
        ├─ pass ──► P8 Completed ──► Archived
        └─ fail ──► reopen plan (P5) or cancel
Project can be Cancelled at any phase (P0).
```

---

## 3. Agent Responsibilities

Every agent: consumes typed **artifacts + events**, produces typed **artifacts**,
never touches the filesystem except through `AgentCapabilityManager`, never calls
another agent directly (communicates via EventBus + artifact store).

### 3.1 Repository Analyst Agent
| | |
|---|---|
| Inputs | `ProjectCreated` event, `WorkspaceSession`, workspace profile/fingerprint |
| Outputs | `RepositoryAnalysisReport` artifact |
| Responsibilities | inspect repo, architecture, technologies, packages, dependency graph, affected files, impact estimate, risks, missing tests, coding conventions |
| Lifecycle | `idle → analyzing → completed / failed` |
| Code | extend `WorkspaceAnalyst` (`packages/workspace/src/workspace-analyst.ts`) + `DefaultUnderstandingEngine` producers |
| Confidence | `confidence: 0..1` written to report; low confidence → orchestrator requests re-analysis |

### 3.2 Planner Agent
| | |
|---|---|
| Inputs | user request, `RepositoryAnalysisReport`, relevant memories |
| Outputs | `Plan` artifact + `TaskGraph` (dependencies, execution order, milestones) |
| Responsibilities | decompose work, milestones, tasks, effort estimates, dependencies, identify parallel work + blockers, complexity |
| Code | extend `PlanningService` (`planning-service.ts`) + `ExecutionPlanner` (`execution-planner.ts`) |
| Note | task `dependencies[]` is the DAG; `ExecutionPlanner` computes strategy + agent assignments |

### 3.3 Architect Agent
| | |
|---|---|
| Inputs | `Plan`, `RepositoryAnalysisReport`, Architecture Knowledge Graph |
| Outputs | `ArchitectureReview` artifact (approve / violations / recommendations) |
| Responsibilities | architectural consistency, boundary enforcement, package-ownership validation, regression detection |
| Code | NEW `ArchitectureReviewService` over `@vestara/architecture-runtime` + ADR/KG |
| Gate | review result `status: 'approved' | 'violations'`; violations → back to Planner (revision loop) |

### 3.4 Developer Agent
| | |
|---|---|
| Inputs | `approved` task assignment, plan task, repository context |
| Outputs | `Changeset` (FileChange[]) + `ImplementationReport` + execution log |
| Responsibilities | implement one task, modify files, generate code, update docs, migrations |
| Code | `ImplementationService.implement()` + `apply()` routed through `AgentCapabilityManager` |
| Constraint | one task per execution; acquires file locks; produces a **proposed** changeset first (no direct apply) |

### 3.5 Reviewer Agent
| | |
|---|---|
| Inputs | `Changeset`, plan constraints, repo conventions |
| Outputs | `ReviewReport` with decision `approve | request-changes | reject` |
| Responsibilities | code quality, style, architecture, maintainability, bugs, dead/duplicated code, security |
| Code | NEW `ReviewService` (uses `@vestara/architecture-runtime` validators + capability read-only access) |
| Effect | `approve` → task complete; `request-changes` → Developer revision loop (bounded); `reject` → task blocked, orchestrator may replan |

### 3.6 Tester Agent
| | |
|---|---|
| Inputs | applied `Changeset`, workspace, plan |
| Outputs | `TestReport` (coverage, failures, regression analysis) |
| Responsibilities | run/generate tests, validate coverage, run app, reproduce failures |
| Code | NEW `TestService`; leverage `@vestara/evaluation` `EvaluationHarness` + `pnpm test` / package filters |
| Effect | fail → Developer/task retry or replan |

### 3.7 Verifier Agent
| | |
|---|---|
| Inputs | plan, applied changesets, review + test reports, build results |
| Outputs | `VerificationReport` (final pass/fail) |
| Responsibilities | goal achieved, requirements satisfied, scope/constraints respected, no unintended changes, build succeeds, project still works |
| Code | extend `VerificationService` (`verification-service.ts`); add scope/no-unintended-change diff check |
| Effect | `pass` → project complete; `fail` → reopen executing phase (bounded) or cancel |

---

## 4. Agent Communication Model

Agents are **decoupled through events and artifacts** — no direct method calls between
agents. Communication channels:

| Channel | Purpose | Existing |
|---------|---------|----------|
| **EventBus** (`@vestara/events`) | typed lifecycle events with `correlationId` (projectId/planId/taskId) | ✅ |
| **Artifact store** | durable inputs/outputs of each agent step | 🔶 add `ArtifactStore` |
| **Shared context** | `WorkspaceSession` profile/fingerprint/manifest/prefs | ✅ |
| **Memory** | `session.storeMemory(type, content)`; `MemoryRuntime.getContext` | ✅ |
| **Observations** | `FsObservation` after every filesystem capability call | ✅ |
| **Logs / execution history** | `ExecutionEngine` jobs, `AuditStore`, `TelemetryRuntime` | ✅ |

**Rules:**
- Every event carries `{ projectId, planId?, taskId?, agentId, correlationId }`.
- Agents subscribe to the channels they act on (`approvals`, `agents`, `artifacts`, `workspace`).
- An agent publishes exactly one terminal event (`*Completed` / `*Failed`) per unit of work.
- Human decisions are also events (`collab.approved/rejected`), so the workflow is fully replayable.

---

## 5. Task Lifecycle

```
pending → ready → assigned → in-progress → needs-review → reviewing → approved
    │        │            │               │              └→ changes-requested → assigned (revision)
    │        │            │               └→ testing → failed → retrying → assigned
    │        │            └──→ failed → retrying (backoff) → assigned | blocked
    │        └── blocked (dependency failed / lock conflict / rejected review)
    └── cancelled
```
Transitions are driven by events and applied by the `WorkflowOrchestrator`. Each
transition is persisted (`TaskStore`) and audited.

**Statuses (extends existing `TaskStatus`):** `pending, ready, assigned, in-progress,
needs-review, reviewing, changes-requested, testing, approved, retrying, blocked,
failed, cancelled, completed`.

**Task → agent mapping** uses a capability-based resolver: task declares
`requiredCapabilities: ['code-generation' | 'filesystem.write' …]` and the resolver
(`@vestara/capabilities` `DefaultCapabilityResolver`) matches agents that advertise
those capabilities — replacing the current keyword regex in `ExecutionPlanner`.

---

## 6. Project Lifecycle

`Draft → Analyzing → Planning → Architecture → PendingApproval → Executing → Testing
→ Verifying → Completed → Archived`, with `Cancelled` reachable from any phase
(except Archived).

Phases are owned by the orchestrator; each phase = one workflow unit with an
artifact gate. Phase transitions are idempotent and resumable (see §11).

---

## 7. State Machines

Built on the existing `@vestara/state-machine` (generic, zero-dependency). Transition
tables below.

### 7.1 Project
```
draft ──► analyzing ──► planning ──► architecture ──► pending-approval
   ▲                                     │                │
   │                                     ▼                ▼
   └──────────── cancelled ◄───────── executing ◄── approved / executing
                                           │
                        ┌──────────────────┼──────────────────┐
                        ▼                  ▼                  ▼
                     testing            verifying           completed ──► archived
                                            │
                                            └──► (fail) executing / cancelled
```

### 7.2 Plan
`draft → proposed → reviewed (architect) → approved → executing → completed | cancelled | needs-revision`

### 7.3 Task
See §5 (fully enumerated above).

### 7.4 Agent (lifecycle of the runtime, not a single job)
`created → initializing → running → stopped`, plus `degraded / recovering / quarantined / failed / destroyed` — already implemented in `@vestara/runtime` (`RUNTIME_TRANSITIONS`).

### 7.5 Execution (a workflow run / job)
`queued → running → completed | failed | cancelled | paused → resumed → running`

---

## 8. Event Model

Producers/consumers for the core events (extends `@vestara/events` catalog; new types
use existing `system`/`agent`/`planning`/`implementation`/`verification`/`collaboration`
categories).

| Event | Producer | Consumers |
|-------|----------|-----------|
| `project.created` | API/CLI | Orchestrator → dispatches Repository Analyst |
| `project.cancelled` | Orchestrator | all agents (abort signal) |
| `analysis.completed` | Repository Analyst | Planner |
| `plan.generated` | Planner | Architect |
| `plan.approved` / `plan.rejected` | Approval Gateway / Human | Orchestrator |
| `architecture.reviewed` (pass/violations) | Architect | Orchestrator → Planner (violations) |
| `task.assigned` | Orchestrator | Developer worker |
| `task.started` / `task.completed` | Developer | Orchestrator, Reviewer |
| `task.failed` / `task.cancelled` / `task.blocked` | Worker / Orchestrator | Orchestrator (retry policy) |
| `changeset.created` | Developer | Reviewer |
| `review.approved` / `review.changes-requested` / `review.rejected` | Reviewer | Orchestrator |
| `tests.passed` / `tests.failed` | Tester | Orchestrator |
| `verification.passed` / `verification.failed` | Verifier | Orchestrator |
| `approval.requested` | Orchestrator | Human (Approval Gateway) |
| `approval.granted` / `approval.denied` | Human | Orchestrator |
| `file.lock.acquired` / `file.lock.released` / `file.lock.conflict` | FileLockRegistry | Orchestrator, Workers |

Existing events already wired: `plan.*`, `changeset.*`, `verification.*`,
`collab.*`, `agent.*`, `memory.*`, `workspace.*` (see `packages/events/src/index.ts`).
`WORKSPACE_EVENT_CHANNELS` already include `approvals` and `artifacts` channels.

---

## 9. Data Model (models, not SQL)

All persisted via existing sql.js stores pattern (`db.prepare(...).run(params)`) in
NEW store modules. `id` = `{type}-{timestamp}-{seq}`; every model carries `createdAt`
/ `updatedAt`; every mutation is also an audit entry.

| Model | Key fields |
|-------|-----------|
| `Project` | id, name, goal, repoPath, phase, status, workspaceId, createdAt, updatedAt, cancelReason? |
| `Plan` | existing `Plan` + `revision` (int, bump on replan), `architectureReviewId?`, `approvalId?` |
| `Task` | existing `Task` + `requiredCapabilities[]`, `assignedAgentId?`, `revisionCount`, `lastError?`, `startedAt/completedAt` |
| `TaskGraph` | planId, edges `[{ from: taskId, to: taskId }]`, topoOrder `taskId[]` |
| `AgentExecution` | existing + `taskId?`, `workerType`, `attempt`, `resumedFrom?`, `cancelledBy?` |
| `ExecutionJob` | engine job + `projectId/planId/taskId`, `status`, `events[]`, `checkpoint` |
| `Artifact` | id, kind (`analysis|plan|architecture|changeset|review|test|verification`), projectId, planId?, taskId?, agentId, body (JSON), version |
| `FileLock` | path (rel), holderAgentId, taskId, acquiredAt, releasedAt |
| `Changeset` | existing `ChangeSet` (proposed content; apply is explicit) |
| `ReviewReport` | id, changesetId, decision, findings[], comments, reviewerAgentId |
| `TestReport` | id, changesetId, passed/failed/skipped, coverage, failures[], regressionNotes |
| `VerificationReport` | existing `VerificationReport` + `noUnintendedChanges: boolean` |
| `Approval` | existing `Approval` + `kind` (`plan|architecture|high-risk|deploy`), `targetType/targetId`, `requestedBy`, `decidedAt` |
| `OperationLog` | agentId, capability, path, status, changes summary (from `FilesystemRuntime.getHistory()`) |
| `AuditEntry` | existing `AuditStore` + workflow correlationId |
| `MemoryEntry` | existing `MemoryRuntime` (`fact/preference/event/decision`) |

---

## 10. Artifact Definitions

Every artifact is a versioned JSON document in `ArtifactStore`. Consumers read the
latest version; auditors read all versions.

1. **RepositoryAnalysisReport** — `{ summary, architecture, technologies[], packages[], dependencyGraph{edges[]}, affectedFiles[], impactEstimate{files, packages, risk}, risks[], missingTests[], conventions[], confidence }`
2. **Implementation Plan** — the existing `Plan` (+ task graph, milestones, effort).
3. **ArchitectureReview** — `{ status: 'approved'|'violations', violations[{type, file, detail, recommendation}], recommendedChanges[] }`
4. **Changeset / ImplementationReport** — existing `ChangeSet` (FileChange list) + `{ taskId, agentId, duration, appliedAt?, log[] }`.
5. **ReviewReport** — `{ decision, findings[{severity, file, line?, detail}], securityIssues[], approvals? }`
6. **TestReport** — `{ coverage{lines, branches}, results{passed, failed, skipped}, failures[{test, error}], regressionAnalysis }`
7. **VerificationReport** — existing + `{ goalAchieved, requirementsSatisfied, scopeRespected, constraintsRespected, noUnintendedChanges, buildResult }`
8. **ExecutionLog** — append-only `[{ ts, agentId, event, artifactId?, detail }]`
9. **PatchSummary** — derived from changeset (`+added/-removed per file`), used by reviewer + human.
10. **TaskState** — snapshot of task status + revision + last error (for resumability).
11. **PlanUpdates** — revision delta (what changed after architect/review feedback).

---

## 11. Failure Recovery Strategy

| Failure | Detection | Recovery | Retry policy |
|---------|-----------|----------|--------------|
| Developer failed | `task.failed` + execution error | re-dispatch to same/other developer | exponential backoff, max 3 attempts → task `blocked`, orchestrator escalates |
| Reviewer rejected | `review.rejected` | task `blocked`; orchestrator replans that task or project `needs-revision` | human decision if >1 replan |
| Reviewer requested changes | `review.changes-requested` | task back to `assigned` (revision loop) | max `N=3` revisions per task, then `blocked` |
| Tests failed | `tests.failed` | affected task retry, then replan | bounded, same as developer |
| Verification failed | `verification.failed` | reopen `executing` for the failed scope, bounded; else human | 1 auto-reopen, then approval |
| Architecture violation | `architecture.reviewed: violations` | Planner regenerates affected tasks | revision counter |
| Repository changed during execution | fingerprint/mtime delta detected by Understanding engine | task `blocked` + `needs-rebase`; re-read affected files, re-create changeset | human confirm |
| Merge conflict | `FileChange.originalContent` mismatch at apply | `conflict` status; merge or re-implement task | human if auto-merge fails |
| Interrupted execution | crash / cancelled job | resume from persisted `ExecutionJob.checkpoint` + `TaskState` | idempotent re-entry |
| Lost context | memory miss | rebuild context from artifacts + `MemoryRuntime` + Understanding re-observe | n/a |

**Principles:** state is authoritative and persisted before effects; every agent step
is idempotent (re-running produces the same terminal event); retries are bounded;
human intervention is the last-resort escalation path.

---

## 12. Parallel Execution Strategy

1. **DAG scheduling.** `TaskGraph` computed at plan time (topological order). Independent
   sibling tasks form parallel "waves". `ExecutionEngine` already supports async
   concurrent jobs with progress + cancellation.
2. **Worker pool.** Existing `AgentWorker` types: `in-process` (default), `subprocess`
   (isolation), `remote` (future). Orchestrator dispatches waves to a worker pool
   bounded by `maxParallelWorkers` (per repo + global).
3. **File locking.** NEW `FileLockRegistry`: a task declares its target files
   (`Task.files[]`); locks are acquired before `assigned→in-progress`. A task that
   needs a held lock goes `blocked` (depends-on-lock) and retries on `file.lock.released`.
4. **Conflict prevention.** Two layers: (a) locks prevent concurrent writers of the
   same path; (b) `Changeset.apply()` compares `FileChange.originalContent` against
   current disk content — mismatch → `conflict` (no silent overwrite). FilesystemRuntime
   path containment + deny list remain enforced.
5. **Idempotent apply.** ChangeSets apply once; re-apply is a no-op (`status=applied`).

---

## 13. Human Approval Workflow

`ApprovalGateway` (NEW) wraps the existing `CollaborationService`/`Approval` +
`approvals` event channel. Required approvals:

- **Plan approval** (mandatory by default; `plan.approved` gates implementation).
- **Architecture sign-off** (project phase `architecture`; optional via project policy).
- **High-risk changes** — any changeset containing: `filesystem.delete`, `.env`-adjacent
  paths, >10 files, or sensitive-path hits (already classified by `FilesystemRuntime`
  risk levels).
- **Production deployment / apply to protected branches** (config-gated).
- **Resume / cancel** of a blocked or paused project.

Flow: orchestrator publishes `approval.requested` → human acts in UI/CLI
(`collab.approved | collab.rejected` + comment) → orchestrator advances or revises the
workflow. All approvals are audit entries.

---

## 14. Sequence Diagram (text)

```
User        Orchestrator   Analyst   Planner   Architect   Developer   Reviewer   Tester   Verifier   Human
 │  create project  │          │         │          │          │          │         │        │        │
 │─────────────────►│          │         │          │          │          │         │        │        │
 │                  │ project.created (dispatch analyst)                     │
 │                  │─────────►│          │          │          │          │         │        │        │
 │                  │          │ analyze  │          │          │          │         │        │        │
 │                  │          │─────────►│          │          │          │         │        │        │
 │                  │ analysis.completed  │          │          │          │         │        │        │
 │                  │          │ plan.generate         │          │          │         │        │        │
 │                  │          │          │─────────►│          │          │         │        │        │
 │                  │          │          │ plan.generated          │        │         │        │        │
 │                  │          │          │          │ architecture.review      │        │        │
 │                  │          │          │          │─────────► │          │         │        │        │
 │                  │          │          │          │ architecture.reviewed     │        │        │
 │                  │          │          │          │ (approved)                │        │        │
 │                  │ approval.requested                                          │        │        │
 │                  │───────────────────────────────────────────────────────────────────────────────►│
 │                  │ ◄────────────────────────────────────────────────────────────────────────────── approve
 │                  │ task.assigned (wave 1)                                                          │
 │                  │─────────────────────────────────────────────────────────────────► Developer     │
 │                  │ implement + changeset.apply ──► changeset.created ──► Reviewer                   │
 │                  │ review.approved ──► task.completed (repeat per task, parallel)                    │
 │                  │ all tasks complete → testing ──► tests.passed ──► verifying                       │
 │                  │ verification.passed ──► project.completed ──► human notified                      │
```

---

## 15. Risk Analysis

| Risk | Mitigation |
|------|-----------|
| Agent hallucinates changes | changesets are proposed, not applied; reviewer + verifier gates; `FileChange.originalContent` diff |
| Filesystem escape / destructive ops | `FilesystemRuntime` root containment + deny list + high-risk approval (already implemented) |
| Concurrent edits / corruption | `FileLockRegistry` + conflict-on-apply; atomic writes |
| Infinite retry loops | bounded retries + revision caps; escalation to human |
| Stale context after repo changes | Understanding re-observe + fingerprint delta → task rebase |
| Orphaned workers on crash | checkpointed `ExecutionJob`; orchestrator resumes on boot (kernel recovery manager) |
| Cost blowout (token spend) | per-agent token budgets + `TelemetryRuntime` cost tracking; planner effort estimates gate agent count |
| Plan/task status drift | single writer (orchestrator) for workflow state; events are source of truth for transitions |

---

## 16. Future Extensibility

- **New agent roles** register via `AgentDefinition` + capability declaration; no
  orchestrator change (specialists are pluggable).
- **New capability domains** (`network`, `database`, `shell`-gated) extend
  `AgentCapabilityManager` with the same permission-gated contract.
- **Remote/distributed workers** implement the existing `remote` `WorkerType` contract.
- **Multi-repo** projects: one orchestrator per repo, a parent project aggregates
  sub-orchestrators.
- **Plugin marketplace** for agent prompts/roles via `@vestara/capabilities` catalog.
- **MCP tool adapters** can be surfaced as capabilities through the same manager.

---

## 17. Implementation Roadmap

**Phase 1 — Orchestration core — ✅ implemented (partial)**
`WorkflowOrchestrator` + project/plan/task state machines; `TaskStore`, `ArtifactStore`,
`FileLockRegistry`; event catalog extension (`orchestration.*` via
`apps/api/src/bridges/orchestration-event-bridge.ts`); retry policy; task-graph waves
from plan DAG (`task-graph.ts`); resume from persisted checkpoint. The legacy
`AgentWorkflowService` prototype is deprecated (superseded). Tasks execute through the
harness (`HarnessTaskDispatcher`).
Acceptance (pending full pass): single sequential project completes with
`verification.passed` + full audit log.

**Phase 2 — Review, test, approval — ✅ complete**
Capability-based task assignment (replace keyword matching) is delivered:
`HarnessTaskDispatcher` resolves task → agent through `@vestara/capabilities`
(`DefaultCapabilityResolver` over the builtin taxonomy, supporting exact,
wildcard, and implied matches; `packages/workspace/src/harness-task-dispatcher.ts`).
Reviewer + tester stages with bounded revision loops (`TaskDispatcher.review/test`,
`needs-review → reviewing → approved | changes-requested → assigned | rejected →
blocked`, revision cap from the retry policy); Approval Gateway for high-risk
changes (`DefaultRiskApprovalPolicy` + `awaiting-approval` task state +
`resolveTaskApproval`, plan approval via the `pending-approval` phase); parallel
task waves with file-lock contention handling (`maxParallelTasks`, bounded
lock-wait then block); observability (§18).

**Phase 3 — Distributed + hardening — ✅ delivered (foundations; network transport future)**
Delivered: token/cost budgets (`TokenBudget` — blocks dispatch once exhausted);
event-sourced `reconcile(projectId, events)` (rebuild expected task state from the
event log and diff against stores); full event-sourced `rebuild(projectId, events,
context)` — `task.created` events now carry the task definition so the event log
reconstructs project, plan, and tasks with their statuses; **multi-repo parent
orchestration** (`MultiRepoOrchestrator` — one `WorkflowOrchestrator` per repo,
a parent project aggregates per-repo sub-projects with aggregate status and
metrics); **remote worker contract** (`WorkerPool` — bounded worker pool with
`runWithConcurrency`; `SubprocessTaskDispatcher` executes each task in an
isolated child process over IPC, with a pluggable executor module); failure-
injection + load tests (flaky dispatchers, large task DAGs). Network transport
for remote workers remains future; any transport implements the `TaskDispatcher`
contract.

---

## 18. Observability

Implemented (2026-08-03): the orchestrator emits a telemetry callback on every
lifecycle operation (`onTelemetry` — dispatch, review, test, approval, task
completion, with agent/status/duration) wired to `TelemetryRuntime.track`, and
exposes per-project + workspace aggregates via `metrics(projectId)` /
`listMetrics(workspaceId)` and `GET /api/orchestration/[projects/:id/]metrics`.
The Workspace "Orchestration" page (`/orchestration`) lists projects with phase/
status/task metrics and renders the Approval Gateway queue with approve/deny.
Plus new per-project dashboards:

| Metric | Source |
|--------|--------|
| Agent execution duration / per phase | `onTelemetry` + `TelemetryRuntime` |
| Failures + retries per task/agent | `Task.failed`, `task.retrying`, task `attemptCount` |
| Task throughput (completed/sec per worker) | telemetry aggregation |
| Approval bottlenecks (time in `awaiting-approval`) | `task.approval-requested/resolved` timestamps |
| Success rate per agent / per plan | execution history |
| Cost + token usage per agent/project | provider usage + `TelemetryRuntime` |
| File lock contention (`file.lock.conflict` count) | lock registry events |

---

*End of blueprint. All new components are additive to the existing Vestara runtime;
no existing lifecycle, capability, or security invariants are changed.*

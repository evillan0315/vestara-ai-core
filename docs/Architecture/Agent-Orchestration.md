# Agent Orchestration — Architecture

| Field | Value |
|-------|-------|
| Status | Canonical (single source of truth) |
| Owner | Chief Architect |
| Version | 1.0 |
| Related | PCS-024 (Agent Filesystem Capabilities), PCS-025 (Multi-Agent Project Management), ADR-001..ADR-004 |

This is the canonical explanation of Vestara's agent orchestration system: how
specialized agents collaborate to safely plan, execute, review, and verify work in a
workspace. Specifications (PCS-024, PCS-025) reference this document instead of
duplicating the architectural model.

> **Implementation status (2026-08-03)**: the PCS-025 Phase 1 orchestration core is
> delivered in `packages/workflow-orchestrator/` (`WorkflowOrchestrator`, project/
> plan/task state machines, `TaskStore`/`ArtifactStore`/`FileLockRegistry`, bounded
> retry/revision policy, task-graph waves, checkpoint/resume). Tasks execute through
> the durable harness via `HarnessTaskDispatcher`; `orchestration.*` events project
> into the temporal engineering event store; `/api/orchestration/*` exposes the
> lifecycle. Agent-runner roles (`Repository Analyst`, `Reviewer`, `Tester`, remote
> workers) and the Approval Gateway remain future (PCS-025 Phases 2-3).

---

## 1. Design Invariant

**Coordinator-composes-specialists.** Coordinators orchestrate, specialists decide,
every concern has one owner. Agents never reach the filesystem directly and never call
each other directly — they publish events and exchange artifacts.

```
LLM = reasoning
Planner = decides actions
Capability Manager = authorizes
Filesystem Runtime = executes controlled operations
Understanding Runtime = interprets results
Memory / Context = preserves knowledge
```

## 2. Layers

```
Human ──► Approval Gateway ──► WorkflowOrchestrator ──► AgentRuntime ──► AgentWorker
                                        │                    │
                                        ▼                    ▼
                              ExecutionEngine        AgentCapabilityManager
                                        │                    │
                                        ▼                    ▼
                              Persistence (stores)    FilesystemRuntime
                                        │                    │
                                        ▼                    ▼
                              EventBus + Telemetry    Workspace (sandbox)
```

## 3. WorkflowOrchestrator

The orchestrator is the single writer of workflow state. It owns the project/plan/task
state machines, dispatches units of work to agents, applies retry and revision policy,
and coordinates file locks. Every transition it makes is persisted and published as an
event, so the workflow is resumable and replayable.

Responsibilities:
- Project/plan/task state machine transitions
- Task dispatch (capability-matched) and worker-pool scheduling
- Retry (bounded backoff) and revision (bounded loop) policy
- File-lock coordination and conflict handling
- Approval-gate detection and human escalation
- Checkpointing for interrupted-execution resume

## 4. Event Bus

Agents communicate exclusively through `@vestara/events` `WorkspaceEvent`s published on
the `EventBus`. Categories: `conversation, workspace, planning, implementation,
verification, collaboration, system, agent, memory, profile`. Every workflow event
carries `{ projectId, planId?, taskId?, agentId, correlationId }` for traceability.

Producer → consumer model: agents produce terminal events (`*Completed` / `*Failed`),
the orchestrator consumes them to advance state; the Approval Gateway produces
`collab.approved | collab.rejected`; workers emit `task.*` and `file.lock.*`.

## 5. Agent Lifecycle

The agent *runtime* follows `@vestara/runtime` transitions:
`created → initializing → running → stopped`, with
`degraded / recovering / quarantined / failed / destroyed`.

A unit of agent work is an `AgentExecution` (one task, one agent, one attempt):
`queued → running → completed | failed | cancelled | paused → resumed → running`.

`AgentRuntime` dispatches by role; `AgentCoordinator`/`AgentWorker` provide execution
isolation (`in-process`, `subprocess`, `remote`).

## 6. Task Lifecycle

```
pending → ready → assigned → in-progress → needs-review → reviewing → approved
    │        │            │               │              └→ changes-requested → assigned
    │        │            │               └→ testing → failed → retrying → assigned
    │        │            └──→ failed → retrying | blocked
    │        └── blocked (dependency failed / lock conflict / rejected)
    └── cancelled
```

Statuses: `pending, ready, assigned, in-progress, needs-review, reviewing,
changes-requested, testing, approved, retrying, blocked, failed, cancelled, completed`.

## 7. Artifact Model

Every agent step consumes and produces versioned JSON artifacts in the artifact store.

| Kind | Producer | Consumed by |
|------|----------|-------------|
| `analysis` | Repository Analyst | Planner |
| `plan` | Planner | Architect, Orchestrator |
| `architecture` | Architect | Orchestrator |
| `changeset` | Developer | Reviewer, Tester |
| `review` | Reviewer | Orchestrator |
| `test` | Tester | Verifier |
| `verification` | Verifier | Orchestrator, Human |

Artifacts gate transitions: a phase cannot start until its input artifact exists and
is approved.

## 8. State Machines

All state machines are built on `@vestara/state-machine` (generic, zero-dependency).

- **Project**: `draft → analyzing → planning → architecture → pending-approval →
  executing → testing → verifying → completed → archived`; `cancelled` reachable from
  any non-terminal phase.
- **Plan**: `draft → proposed → reviewed → approved → executing → completed` with
  `needs-revision` (bounded) and `cancelled`.
- **Task**: see §6.
- **Agent / Execution**: see §5.

Failure states (`failed`, `blocked`, `retrying`) are first-class; recovery rules are
owned by the orchestrator's policy (bounded retries, revision caps, human escalation).

## 9. File Locking

- `FileLockRegistry` holds per-path locks keyed by agent/task.
- A task declares `Task.files[]`; locks acquired before `assigned → in-progress`.
- Contended locks put the task in `blocked` (depends-on-lock), retried on
  `file.lock.released`.
- Second defense: `Changeset.apply()` compares `FileChange.originalContent` to the
  current disk content; mismatch → `conflict` (never a silent overwrite).

## 10. Capability System

Agents reach the filesystem only through `AgentCapabilityManager`:

```
Agent → requests capability → AgentCapabilityManager (permission gate)
     → FilesystemRuntime (sandbox, approval, dry-run, history) → FsObservation
```

12 `filesystem.*` capabilities map to `(repository, read | modify)` permission gates;
mutations require a reason; delete is high-risk and requires approval. See PCS-024 and
ADR-002/003 for the full model.

## 11. Approval Workflow

`ApprovalGateway` wraps the collaboration approval model (`collab.submitted /
approved / rejected`). Required approvals: plan, architecture sign-off, high-risk
changes (delete, sensitive paths, >10 files), deployment. Human decisions are events,
so the workflow remains replayable. Every approval is an audit entry.

## 12. Observability & Audit

- `TelemetryRuntime` — per-agent op tracking, durations, failures, retries.
- `ActivityLogStore` — domain event stream.
- `AuditStore` — immutable workflow + approval audit trail.
- `FilesystemRuntime.getHistory()` — operation log with change summaries.

## References

- PCS-024 — Agent Filesystem Capabilities (capability model + safety controls)
- PCS-025 — Multi-Agent Project Management (workflow lifecycle + event/data model)
- PCS-025 Phase 1 — `docs/PCS-025-phase-1-implementation-plan.md` (delivery record)
- ADR-001 — Runtime model
- ADR-002 — Capability system
- ADR-003 — Filesystem runtime
- ADR-004 — Multi-agent workflow

---
title: ARX-015 M8 — Workflow Run & DAG Evidence
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# ARX-015 M8 — Workflow Run & DAG Evidence

**Status:** FROZEN  
**Date:** 2026-08-27  
**Build:** `tsc -b` clean, `pnpm lint:check` clean  
**Tests:** 197/197 agent-harness, 179/179 opencode-runtime, 36/36 engineering-event-store, 47/47 repository-binding

---

## M8 Objective

Establish WorkflowRun as the orchestration authority with deterministic DAG scheduling, task lifecycle state machine, and idempotent run creation. Build on frozen M1–M7 authority surfaces.

---

## Frozen Invariants

| ID | Invariant | Evidence |
|----|-----------|----------|
| WF-1 | One user workflow start → one authoritative WorkflowRun | Test: `concurrent/retried starts for same execution identity produce one run` |
| WF-2 | DAG dependencies are authoritative (task becomes runnable only when deps satisfied) | Test: `task becomes runnable only when declared dependencies are satisfied` |
| WF-3 | Agent completion means actual completion (start ≠ complete) | Test: `starting an AgentRun is not interpreted as completing a WorkflowTask` |
| WF-4 | Workflow state and runtime state remain separate | Test: `WorkflowRun owns orchestration, RuntimeSessionBinding owns continuity` |
| WF-5 | Consume M4 AI authority (no direct provider/model selection) | Test: `WorkflowTaskInstance has aiBindingId field` |
| WF-6 | Consume M5 repository authority (no independent discovery) | Test: `WorkflowRun carries repositoryBindingId, tasks do not independently discover` |
| WF-7 | Consume M7 session continuity (shared under SHARED_WORKFLOW) | Test: `multiple tasks share one RuntimeSessionBinding` |
| WF-8 | Explicit task lifecycle (invalid transitions fail closed) | Test: `invalid transitions fail closed` |
| WF-9 | Failure propagation respects the DAG (deadlock detection) | Test: `failed prerequisite does not silently release dependent tasks` |
| WF-10 | Sufficient lineage for M9 | Test: `WorkflowRun answers all M9 questions` |

---

## Architecture

```
WorkflowDefinition / WorkflowPlan (immutable WHAT)
             ↓
        WorkflowRun (mutable execution state)
             ↓
        Workflow DAG (task dependencies)
             ↓
     WorkflowTask instances (bounded executable units)
             ↓
      AgentAssignment
             ↓
       execution/runtime
```

### Task Lifecycle State Machine

```
pending → runnable → running → completed
                         ↓       failed
                         ↓→ waiting → running
pending/runnable/running/failed → cancelled
```

### Workflow Run State Machine

```
pending → running → completed
                 → failed  (deadlock or all tasks terminal with failures)
                 → cancelled
failed → running  (retry/resume)
```

---

## Files Created/Modified

| File | Action |
|------|--------|
| `packages/types/src/ids.ts` | Modified: added `WorkflowPlanId`, `WorkflowTaskId` |
| `packages/types/src/workflow.ts` | Created: M8 types (WorkflowRun, WorkflowPlan, WorkflowTaskInstance, WorkflowEvent, WorkflowEventType) |
| `packages/types/src/index.ts` | Modified: exports `workflow` |
| `packages/agent-harness/src/workflow-run-engine.ts` | Created: WorkflowRunEngine (state machine, DAG, idempotency, event emission) |
| `packages/agent-harness/__tests__/m8-workflow-run-dag.test.ts` | Created: 21 hermetic evidence tests |
| `packages/agent-harness/__tests__/m8-final-invariant-evidence.test.ts` | Created: 33 hermetic evidence tests (Areas 1–8) |
| `docs/activity-room/arx-015-m8-evidence.md` | Created: this evidence document |

---

## Defect Found & Fixed

**Idempotency Key Staleness (Area 5 discovery):** `startTask()` and `completeTask()` updated `this.runs` but not `this.runsByIdempotencyKey`. On retry/resume, the engine returned stale task states from the original `start()` call instead of the actual current state. Fixed by introducing `storeRun()` helper that atomically updates both maps. This is a permanent regression test.

---

## Test Results

```
agent-harness:           197/197 pass (12 files)
  m8-workflow-run-dag.test.ts:                21 tests
  m8-final-invariant-evidence.test.ts:        33 tests (Areas 1–8)
  m4-final-evidence.test.ts:                  21 tests
  other existing tests:                      122 tests
opencode-runtime:        179/179 pass (14 files)
engineering-event-store:  36/36 pass (2 files)
repository-binding:       47/47 pass (1 file)
```

---

## Area 1: dependencyCondition 'any' Semantics

### Exact Semantics

| Prerequisite State | `dependencyCondition: 'completed'` | `dependencyCondition: 'any'` |
|--------------------|--------------------------------------|-------------------------------|
| prerequisite completed | ✅ Released | ✅ Released |
| prerequisite failed | ❌ Blocked | ✅ Released |
| prerequisite cancelled | ❌ Blocked | ✅ Released |

### Key Proof

`dependencyCondition` defaults to `'completed'` when not specified. An ordinary `plan → implement → review → verify` workflow MUST use `'completed'` on all dependencies. The `'any'` condition must be **deliberately declared** and cannot accidentally release ordinary downstream tasks after failure.

**Evidence:** 6 tests in Area 1 prove both conditions, the default, and deliberate declaration requirement.

---

## Area 2: M4 Composition Without Live AI

**Proven:** WorkflowTask carries `aiBindingId` field (set externally by harness/runtime), but WorkflowRunEngine has zero references to provider/model selection. The engine's type signature accepts `RepositoryBindingId`, `RuntimeSessionId`, `agentAssignmentId` — NOT provider/model.

**Evidence:** 2 tests in Area 2 prove:
1. Task carries aiBindingId while engine selects neither provider nor model
2. Task.output carries ResolvedAiBinding metadata for M9

---

## Area 3: Actual-Completion Semantics (ARX-014D Regression)

**Proven:** `agentRun STARTED` ≠ `task COMPLETED`. A dependent task must remain blocked until authoritative `completeTask(success=true)` is received.

**Evidence:** 3 tests in Area 3 prove:
1. AgentRun STARTED does NOT mean task COMPLETED — dependent remains blocked
2. task.startTask is not interpreted as task.completeTask
3. Dependent blocked until explicit completeTask(success=true)

---

## Area 4: Concurrent Idempotent Start

**Proven:** `Promise.all(N × start(sameIdempotencyKey))` → exactly 1 WorkflowRun.

**Evidence:** 3 tests in Area 4 prove:
1. Promise.all of 50 concurrent starts with same key → 1 WorkflowRun, 49 reused
2. Interleaved sequential starts are also idempotent
3. Different keys produce different runs

---

## Area 5: Retry/Resume Identity

**Proven:** Retry/resume does NOT manufacture:
- ❌ new WorkflowRun
- ❌ new RepositoryBinding
- ❌ new RuntimeSessionBinding

Completed task state/evidence remains intact unless retry semantics explicitly target that task.

**Defect found and fixed:** Idempotency key staleness — `startTask()`/`completeTask()` updated `this.runs` but not `this.runsByIdempotencyKey`. Fixed via `storeRun()` helper.

**Evidence:** 2 tests in Area 5 prove:
1. Retry preserves WorkflowRun, RepositoryBinding, RuntimeSessionBinding identity
2. Completed task state/evidence preserved on retry

---

## Area 6: DAG Validation

**Proven beyond cycles:** Rejects:
- ❌ missing dependency IDs
- ❌ self-dependencies (detected as cycle)
- ❌ duplicate task IDs (detected as cycle by Kahn's algorithm)

**Evidence:** 6 tests in Area 6 prove all rejection cases and valid acceptance.

---

## Area 7: M9 Event Readiness

**Proven:** WorkflowRunEngine emits typed events carrying M1/M2 lineage. M9 can durably represent:

| Event | Payload | M1 Lineage |
|-------|---------|------------|
| `workflow.started` | workflowRunId | ✅ executionId, traceId |
| `workflow.completed` | workflowRunId | ✅ executionId, traceId |
| `workflow.failed` | workflowRunId | ✅ executionId, traceId |
| `workflow.cancelled` | workflowRunId | ✅ executionId, traceId |
| `task.runnable` | taskInstanceId, taskId | ✅ via workflowRunId |
| `task.started` | taskInstanceId, agentAssignmentId | ✅ via workflowRunId |
| `task.completed` | taskInstanceId, output | ✅ via workflowRunId |
| `task.failed` | taskInstanceId, error | ✅ via workflowRunId |
| `task.cancelled` | taskInstanceId, taskId | ✅ via workflowRunId |

**Evidence:** 10 tests in Area 7 prove every event type, M1 lineage, and full event sequence.

---

## Area 8: Final Composition Proof

### Counts

| Entity | Count | Authority |
|--------|-------|-----------|
| WorkflowRuns | 1 | M8 orchestration |
| WorkflowTasks | 4 | M8 task instances |
| RuntimeSessionBindings | 1 | M7 (shared) |
| RepositoryBindings | 1 | M5 (single source) |
| ResolvedAiBindings | ≥1 hermetic | M4 (carried, not selected) |
| Duplicate WorkflowRuns | 0 | WF-1 enforced |
| Unintended physical sessions | 0 | M7 boundary |
| Premature dependent starts | 0 | WF-2 enforced |
| Live provider calls | 0 | Hermetic |
| Live OpenCode sessions | 0 | Hermetic |

**Evidence:** 2 tests in Area 8 prove full scenario and M1/M2 lineage.

---

## Cross-Milestone Authority Verification

| Check | Result |
|-------|--------|
| Workflow code does not select provider/model directly | ✅ PASS |
| Tasks do not independently rediscover repository authority | ✅ PASS |
| Multiple tasks share one RuntimeSessionBinding | ✅ PASS |
| No competing identities introduced | ✅ PASS |
| Invalid task transitions fail closed | ✅ PASS |
| Failed prerequisite blocks dependents under 'completed' | ✅ PASS |
| DAG cycle detected and rejected | ✅ PASS |
| Self-dependency detected and rejected | ✅ PASS |
| Duplicate task IDs detected and rejected | ✅ PASS |
| Retry/resume preserves WorkflowRun identity | ✅ PASS |
| Completed task state preserved on retry | ✅ PASS |
| Idempotency key staleness fixed | ✅ PASS |
| Events carry M1/M2 lineage for M9 | ✅ PASS |

---

## Sign-off

- [x] All 10 M8 invariants verified
- [x] All 8 bounded evidence areas proven
- [x] Composition scenario passes (1 workflow, 4 tasks, ≥1 AI binding, all terminal)
- [x] No regressions in M1–M7 test suites (459/459 total across all packages)
- [x] Build clean (`tsc -b`)
- [x] Lint clean (`pnpm lint:check`)
- [x] Zero live side effects
- [x] Defect found (idempotency staleness) and fixed

**M8 Status: FROZEN. Ready for M9 — Durable Activity Room.**

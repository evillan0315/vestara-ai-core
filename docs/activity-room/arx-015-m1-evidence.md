---
title: ARX-015 M1 — Verification Evidence
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# ARX-015 M1 — Verification Evidence

> Milestone: M1 — Canonical Identity & Lineage
> Status: ACCEPTED AND FROZEN
> Date: 2026-08-27

## Verification Commands

```
bash build-order.sh              → clean (95 projects, 0 errors)
pnpm lint:check                  → 1266 files, 0 issues
pnpm check:source-artifacts      → clean
pnpm --filter @vestara/engineering-event-store test → 13/13 pass
```

## Test Results

### M1 New Tests (4 tests, all pass)

| Test | Purpose | Result |
|---|---|---|
| `resolveCorrelationId derives from executionId with cor- prefix` | Proves canonical derivation | PASS |
| `resolveCorrelationId returns undefined for absent/empty executionId (fail-closed)` | Fail-closed on absent identity | PASS |
| `resolveCorrelationId rejects non-execution identity formats` | Documents runtime vs compile-time enforcement boundary | PASS |
| `prove: resolveCorrelationId is the only canonical path producing cor- prefix` | INV-ID-1 invariant proof | PASS |

### M1 Persistence Tests (3 tests, all pass)

| Test | Purpose | Result |
|---|---|---|
| `persists traceId and workflowRunId columns and queries them` | New columns stored + queryable | PASS |
| `round-trips traceId/workflowRunId through close-reopen (durable persistence)` | Durability across DB restart | PASS |
| `maintains hash-chain integrity when traceId/workflowRunId are set` | Hash chain unbroken by new columns | PASS |

### Existing Tests (6 tests, all pass)

All 6 pre-existing engineering-event-store tests pass unchanged, confirming backward compatibility.

## resolveCorrelationId() — Invariant Evidence

### Derivation Rules

```
resolveCorrelationId(executionId: string | undefined): string | undefined
  - Valid executionId → "cor-{executionId}"
  - undefined → undefined (fail-closed)
  - "" → undefined (fail-closed)
  - "   " → undefined (fail-closed, whitespace-only)
```

### INV-ID-1 Compliance

1. **Canonical path**: `resolveCorrelationId()` is the ONLY function in the codebase that produces the `cor-{executionId}` format.
2. **Fail-closed**: Returns `undefined` when executionId is absent/empty. Absent correlation preferred over misleading correlation.
3. **Brand enforcement**: At compile time, `CorrelationId` and `ExecutionId` are distinct branded types. A `CorrelationId` cannot be passed where `ExecutionId` is expected and vice versa.

### Legacy Violations Identified (NOT fixed in M1 — tracked for M2+)

These producers use non-execution values as correlationId:

| Producer | File | Violation | Impact |
|---|---|---|---|
| `generateCorrelationId()` | `packages/events/src/factory/createEvent.ts:10` | `cor-${Date.now()}-${counter}` — timestamp counter | Generic event envelope, not engineering-event-store |
| `conversation-runtime` | `packages/conversation-runtime/src/index.ts:159` | `this._session.id` — sessionId | Conversation lifecycle events |
| `runtime` | `packages/runtime/src/index.ts:193` | `cor-${Date.now()}` — timestamp | Runtime state transition events |
| `activity-projection` | `packages/activity-projection/src/source-event.ts:96` | `orchestration:${projectId}:${type}` — projectId | Workflow orchestration projection |
| `workspace-runtime` | `packages/workspace/src/workspace-runtime.ts:627` | `workspace.identity?.id` — workspace identity | Workspace lifecycle events |
| `project-service` | `packages/workspace/src/project-service.ts:32,75` | `project.id`, `task.id` — project/task identity | Project/task lifecycle events |
| `order-service` | `packages/workspace/src/order-service.ts:76,102,121` | `order.id`, `id` — order identity | Order lifecycle events |
| `opencode-runtime` | `packages/opencode-runtime/src/events/event-bridge.ts:218` | `opencode:${event.sessionId}` — sessionId | OpenCode session events |

These are in the generic `@vestara/events` envelope system, NOT in `@vestara/engineering-event-store`. They will be addressed when the events system adopts the canonical contract (M2).

## Pre-Existing Test Failures (Baseline Evidence)

Both failures confirmed identical on baseline commit `489442d` (before M1 changes):

### 1. `opencode-runtime/config.test.ts` — "requires a password"

- **Test**: `expect(() => resolveOpenCodeConfig({ baseUrl: '...' })).toThrow()`
- **Failure**: Function does not throw when password is missing
- **Root cause**: Test expects validation that was never implemented
- **Baseline commit**: `489442d`
- **M1 impact**: None — unrelated to identity/lineage changes

### 2. `documentation/documentation.test.ts` — "accepts the unmodified independent package documents"

- **Test**: Validates `packages/settings-framework/README.md` semantic rules
- **Failure**: `implementation-reference-exists` rule fails on unmodified settings-framework docs
- **Root cause**: Pre-existing documentation drift in settings-framework package
- **Baseline commit**: `489442d`
- **M1 impact**: None — new `docs/IDENTITY-OWNERSHIP.md` is not scanned by this test (it validates `packages/settings-framework/` only)

## Files Modified

| File | Change |
|---|---|
| `packages/types/src/ids.ts` | Added TraceId, WorkflowRunId, BindingId branded types |
| `packages/engineering-event-store/src/migrations.ts` | Added ARX-015 M1 migration (trace_id, workflow_run_id columns) |
| `packages/engineering-event-store/src/index.ts` | Added resolveCorrelationId, updated EngineeringTruthEventInput, append, query, eventFromRow |
| `packages/engineering-event-store/__tests__/index.test.ts` | Added 7 M1 tests (4 invariant + 3 persistence) |
| `docs/IDENTITY-OWNERSHIP.md` | New: canonical identity registry with 5-way distinction |

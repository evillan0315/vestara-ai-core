# ARX-015 M2 — Verification Evidence

> Milestone: M2 — Canonical Event Contract
> Date: 2026-08-27

## Verification Commands

```
bash build-order.sh              → clean (95 projects, 0 errors)
pnpm lint:check                  → 1267 files, 0 issues
pnpm check:source-artifacts      → clean
pnpm --filter @vestara/engineering-event-store test → 36/36 pass (13 M1 + 23 M2)
pnpm vitest run packages/events/__tests__/ → 18/18 pass
pnpm vitest run packages/event-bus/__tests__/ → 1/1 pass
pnpm --filter @vestara/tui-projections test → 1/1 pass
```

## M2 Test Results (23 tests)

### Canonical Header Construction (2 tests)

| Test | Purpose | Result |
|---|---|---|
| `EngineeringTruthEventInput accepts all canonical identity fields` | All identity fields persisted | PASS |
| `events without execution context have undefined execution/correlation` | Fail-closed: absent over misleading | PASS |

### Execution Correlation (3 tests)

| Test | Purpose | Result |
|---|---|---|
| `resolveCorrelationId produces cor-{executionId} and nothing else` | Canonical derivation | PASS |
| `returns undefined for non-execution inputs` | Fail-closed behavior | PASS |
| `engineering store persists executionId alongside correlationId` | DB persistence + query | PASS |

### Uncorrelated Events (2 tests)

| Test | Purpose | Result |
|---|---|---|
| `system events can be appended without executionId` | System lifecycle uncorrelated | PASS |
| `workspace lifecycle events can be appended without executionId` | Workspace lifecycle uncorrelated | PASS |

### Trace Propagation (1 test)

| Test | Purpose | Result |
|---|---|---|
| `traceId propagates across events in the same causal trace` | Cross-event trace grouping | PASS |

### Causation Chain (1 test)

| Test | Purpose | Result |
|---|---|---|
| `causationId references the direct causal predecessor` | Causal chain propagation | PASS |

### Workflow Lineage (1 test)

| Test | Purpose | Result |
|---|---|---|
| `workflowRunId propagates across events in the same workflow run` | Workflow run grouping | PASS |

### Serialization/Deserialization (1 test)

| Test | Purpose | Result |
|---|---|---|
| `round-trips all canonical identity fields through SQLite` | Full round-trip | PASS |

### Durable Persistence (1 test)

| Test | Purpose | Result |
|---|---|---|
| `canonical identity fields survive close-reopen` | Durability verification | PASS |

### Hash-Chain Integrity (1 test)

| Test | Purpose | Result |
|---|---|---|
| `hash chain remains valid with all canonical identity fields` | Integrity with new fields | PASS |

### Activity Projection (2 tests)

| Test | Purpose | Result |
|---|---|---|
| `fromOrchestrationEvent leaves correlationId absent` | projectId not execution identity | PASS |
| `fromOrchestrationEvent without projectId also has absent correlation` | Fail-closed | PASS |

### Legacy Producer Migration (8 tests)

| Test | Producer | Before (correlationId value) | After | Result |
|---|---|---|---|---|
| `conversation-runtime` | `conversation-runtime/src/index.ts` | `this._session.id` (sessionId) | `{}` (absent) | PASS |
| `runtime` | `runtime/src/index.ts` | `` `cor-${Date.now()}` `` (timestamp) | `{ ttl: 60 }` (absent) | PASS |
| `workspace-runtime` | `workspace/src/workspace-runtime.ts` | `workspace.identity.id` (workspace id) | `{ causationId, ttl }` (absent) | PASS |
| `opencode-runtime` | `opencode-runtime/src/events/event-bridge.ts` | `` `opencode:${sessionId}` `` (sessionId) | `{}` (absent) | PASS |
| `order-service` | `workspace/src/order-service.ts` | `order.id` / `id` (order id) | `{}` (absent) | PASS |
| `project-service` | `workspace/src/project-service.ts` | `project.id` / `task.id` (project/task id) | `{}` (absent) | PASS |
| `suggestion-service` | `workspace/src/suggestion-service.ts` | `suggestionId` (suggestion id) | `{}` (absent) | PASS |
| `milestone-service` | `workspace/src/milestone-service.ts` | `` `milestone-${version}` `` (milestone version) | `{}` (absent) | PASS |

## Three-Event-Envelope System Disposition

| System | Disposition | Rationale |
|---|---|---|
| `@vestara/engineering-event-store` (EngineeringTruthEvent) | **KEEP + EXTEND** | Authoritative hash-chained store. Added `executionId`, `requestId` columns. `correlationId` now optional (absent when no execution context). |
| `@vestara/shared` (VestaraEvent) | **ADAPT** | Added `executionId`, `requestId`, `traceId` to metadata. Event bus (`EmitEvent`) accepts new fields. Legacy `correlationId` still present for backward compat. |
| `@vestara/events` (EventEnvelope) | **DEPRECATE** | `EventEnvelope` in `@vestara/types/src/events.ts` renamed to `EventEnvelope_Legacy`. `EventEnvelope` in `@vestara/events/src/envelope/envelope.ts` is not imported anywhere. Will be retired when all consumers migrate to `VestaraEvent` or `DomainEventEnvelope`. |
| `@vestara/activity-projection` (ActivitySourceEvent) | **ADAPT** | `fromOrchestrationEvent()` no longer fabricates correlation from projectId. Events without execution context remain uncorrelated. |

## Producer/Consumer Migration Matrix

### Producers (Before → After)

| # | Producer | File | Before | After |
|---|---|---|---|---|
| 1 | `conversation-runtime` | `packages/conversation-runtime/src/index.ts` | `correlationId: this._session.id` | `metadata: {}` |
| 2 | `runtime` | `packages/runtime/src/index.ts` | `correlationId: \`cor-${Date.now()}\`` | `metadata: { ttl: 60 }` |
| 3 | `workspace-runtime` | `packages/workspace/src/workspace-runtime.ts` | `correlationId: workspace.identity.id` | `metadata: { causationId, ttl }` |
| 4 | `opencode-runtime` | `packages/opencode-runtime/src/events/event-bridge.ts` | `correlationId: \`opencode:${sessionId}\`` | `metadata: {}` |
| 5 | `order-service` | `packages/workspace/src/order-service.ts` | `correlationId: order.id` | `metadata: {}` |
| 6 | `project-service` | `packages/workspace/src/project-service.ts` | `correlationId: project.id / task.id` | `metadata: {}` |
| 7 | `suggestion-service` | `packages/workspace/src/suggestion-service.ts` | `correlationId: suggestionId` | `metadata: {}` |
| 8 | `milestone-service` | `packages/workspace/src/milestone-service.ts` | `correlationId: \`milestone-${version}\`` | `metadata: {}` |
| 9 | `agent-service` | `packages/workspace/src/agent-service.ts` | `correlationId: result.execution.id` | `correlationId: \`cor-${result.execution.id}\`` (canonical derivation) |
| 10 | `conversation` | `packages/conversation/src/index.ts` | `correlationId: conversationId` | `metadata: {}` |
| 11 | `stream` | `packages/stream/src/index.ts` | `correlationId: conversationId` | `metadata: {}` |
| 12 | `events factory` | `packages/events/src/factory/createEvent.ts` | `generateCorrelationId()` (timestamp) | Deprecated (still available for backward compat) |

### Consumers (Unchanged — backwards compatible)

| # | Consumer | File | Impact |
|---|---|---|---|
| 1 | `tui-projections` | `packages/tui-projections/src/index.ts` | `StreamEnvelope.correlationId` now optional. No behavioral change. |
| 2 | `external-runtime` | `apps/api/src/external-runtime/service.ts` | `buildSessionTimeline` parameter `correlationId` now optional. No behavioral change. |
| 3 | `activity-projection` projectors | `packages/activity-projection/src/projectors/*` | Read `correlationId` from events. Undefined correlation is handled naturally. |
| 4 | `workflow-projections` | `packages/workflow-projections/src/` | Read events. Unaffected by optional correlationId. |
| 5 | `engineering-memory` | `packages/memory/src/engineering-memory-projection.ts` | Reads `metadata.correlationId`. Undefined correlation propagated naturally. |

## CausationId Semantics (Established in M2)

| Concept | Field | Semantics | Example |
|---|---|---|---|
| **Execution correlation** | `correlationId` | "These events belong to the same execution attempt" | `cor-exec-001` groups all events in one agent turn |
| **Causal trace** | `traceId` | "These events are causally related across processes" | `trace-abc` groups events from harness → API → agent |
| **Direct causation** | `causationId` | "This specific event caused this event" | Event B's `causationId` = Event A's `eventId` |
| **Workflow lineage** | `workflowRunId` | "These events belong to the same workflow project run" | `wf-run-001` groups all events in one workflow execution |

### Propagation Rules

- `correlationId`: Derived from `executionId` via `resolveCorrelationId()`. Shared across all events in one execution attempt. Absent when no execution context.
- `traceId`: Created at top-level entry points. Propagated unchanged to all descendant events. Survives process boundaries.
- `causationId`: Set to the `eventId` of the immediately preceding event. Root events (no cause) leave it undefined. Never skipped or chained (A→B→C, not A→C).
- `workflowRunId`: Created when a workflow project starts execution. Propagated unchanged to all events within that run.

## Identity Semantics (Canonical Header Fields)

| Field | Semantic | Lifecycle | Common Mistake |
|---|---|---|---|
| `eventId` | Unique event identifier | Per-event | Using correlationId as eventId |
| `requestId` | Transport/request correlation | Single HTTP/WS request | Using as execution correlation |
| `traceId` | Distributed causal trace | Across process boundaries | Confusing with sessionId |
| `correlationId` | Execution correlation | Single execution attempt | Using session/project/workspace id |
| `executionId` | Canonical execution identity | Single execution attempt | None — source of truth |
| `workflowRunId` | Workflow instance | Single workflow run | Confusing with projectId |
| `causationId` | Direct causal predecessor | Per-event (references another eventId) | Confusing with correlationId |

## Files Modified

| File | Change |
|---|---|
| `packages/types/src/ids.ts` | Added `ExecutionId`, `RequestId` branded types |
| `packages/types/src/events.ts` | Defined canonical `EventHeader`, `DomainEventEnvelope<T>`, deprecated legacy types |
| `packages/engineering-event-store/src/index.ts` | Added `executionId`, `requestId` to input/query; made `correlationId` optional; updated append/query/eventFromRow |
| `packages/engineering-event-store/src/migrations.ts` | Added `engineering_events.arx015-canonical-event-contract` migration |
| `packages/engineering-event-store/__tests__/m2-canonical-event-contract.test.ts` | New: 23 M2 tests |
| `packages/shared/src/events.ts` | Added `executionId`, `requestId`, `traceId` to `VestaraEvent.metadata` |
| `packages/event-bus/src/index.ts` | Updated `EmitEvent` to accept new metadata fields |
| `packages/events/src/factory/createEvent.ts` | Deprecated `generateCorrelationId()` |
| `packages/tui-protocol/src/index.ts` | Made `StreamEnvelope.correlationId` optional |
| `packages/conversation-runtime/src/index.ts` | Removed 5 session-derived correlationId values |
| `packages/runtime/src/index.ts` | Removed timestamp-derived correlationId |
| `packages/workspace/src/workspace-runtime.ts` | Removed workspace-derived correlationId |
| `packages/workspace/src/order-service.ts` | Removed 3 order-derived correlationId values |
| `packages/workspace/src/project-service.ts` | Removed 2 project/task-derived correlationId values |
| `packages/workspace/src/suggestion-service.ts` | Removed suggestion-derived correlationId |
| `packages/workspace/src/milestone-service.ts` | Removed milestone-derived correlationId |
| `packages/workspace/src/agent-service.ts` | Fixed to use canonical `cor-${execution.id}` derivation |
| `packages/opencode-runtime/src/events/event-bridge.ts` | Removed session-derived correlationId |
| `packages/conversation/src/index.ts` | Removed 10 conversation-derived correlationId values |
| `packages/stream/src/index.ts` | Removed 5 conversation-derived correlationId values |
| `packages/activity-projection/src/source-event.ts` | `fromOrchestrationEvent` no longer fabricates correlation from projectId |
| `apps/api/src/external-runtime/service.ts` | Made `correlationId` optional in `buildSessionTimeline` parameter |

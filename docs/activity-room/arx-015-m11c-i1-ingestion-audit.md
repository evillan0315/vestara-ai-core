---
title: "M11C-I1 — M9 Production Ingestion Bridge: Ownership Audit"
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# M11C-I1 — M9 Production Ingestion Bridge: Ownership Audit

**Date**: 2026-08-28
**Status**: Audit complete. Ready for implementation decision.

---

## 1. Current Activity Stores — Two Separate Systems

### System A: Old Activity Room (`activity.db`)

| Property | Value |
|----------|-------|
| Database | `.vestara/activity.db` |
| Store class | `SqliteActivityStore` (from `@vestara/activity-projection`) |
| Service | `ActivityProjectionService` (projects `ActivitySourceEvent` → `ActivityRecord`) |
| Schema | `ActivityRecord` (agent-message, task, workflow, test, verification) |
| Write path | `ActivityService` (packages/activity-log) → `ActivityLogStore.append()` |
| Read path | Old WebSocket `/ws` in `server.ts` |
| Human messages | `POST /api/activity` → `room.service.appendActivity()` |
| Status | **Operational** — populated by EventBus events |

### System B: M11A Activity Room (`m9-activity.db`)

| Property | Value |
|----------|-------|
| Database | `.vestara/m9-activity.db` |
| Store class | `DurableActivityStore` (`SqliteActivityStore` from m9-sqlite-store.ts) |
| Service | None (direct store reads) |
| Schema | M9 `ActivityRecord` (different shape from old room) |
| Write path | **Nobody** (empty) |
| Read path | M11A HTTP API + M11B WebSocket |
| Status | **Operational but empty** — structurally complete, no data source |

---

## 2. Current Event Producers

### M8 WorkflowRunEngine

```
WorkflowRunEngine.emitEvent() → eventCallbacks[]
```

- Produces: `WorkflowEvent` (workflow.started, task.runnable, task.started, task.completed, etc.)
- Carries: `workflowRunId`, `executionId`, `traceId`, `taskId`, `agentAssignmentId`
- **Nobody subscribes** to `WorkflowRunEngine.onEvent()` in the API server
- Events are lost

### OrchestrationEventBridge

```
WorkflowOrchestrator → OrchestrationEventBridge.append() → EngineeringEventStore + EventBus
```

- Produces: `orchestration.*` events (project.created, task.started, task.completed, etc.)
- Written to: `SqliteEngineeringEventStore` (separate from M9)
- Re-emitted on: `EventBus` as `orchestration.*`
- **Not consumed by M9**

### ActivityService (packages/activity-log)

```
EventBus → ActivityService._handleEvent() → ActivityLogStore.append() → subscribers
```

- Subscribes to: `conversation:*`, `workspace:*`, `plan:*`, `changeset:*`, `verification:*`, `agent:*`, `memory:*`, `user:*`
- Converts: `VestaraEvent` → `WorkspaceEvent` → `ActivityLogStore.append()`
- **Writes to ActivityLogStore (System A), NOT to M9**

### Human Messages

```
POST /api/activity → room.service.appendActivity() → SqliteActivityStore → hub.broadcast()
```

- Writes to: Old Activity Room store (System A)
- **Not written to M9**

---

## 3. ActivityLogStore Ownership

### What It Is

`ActivityLogStore` (packages/activity-log) is a **simple SQLite event log** that stores `WorkspaceEvent` records. It's consumed by:

1. `ActivityService.query()` — dashboard API (`GET /api/activity-log`)
2. `ActivityService.onEvent()` — notification center, WebSocket broadcast
3. `server.ts` line 291 — broadcasts domain events to old WebSocket clients

### Its Role

`ActivityLogStore` is **NOT legacy**. It serves a different concern:

- **ActivityLogStore**: Operational event log for the dashboard and notifications
- **M9 DurableActivityStore**: Canonical activity truth for the Activity Room

They coexist. ActivityLogStore should NOT be replaced by M9. It's the operational dashboard backend. M9 is the Activity Room backend.

### Write Sites

| Writer | Event Source | Target |
|--------|-------------|--------|
| `ActivityService._handleEvent()` | EventBus patterns | ActivityLogStore |
| `ActivityService.emitDirect()` | Legacy `broadcast()` in server.ts | ActivityLogStore |
| `notificationService.start()` | ActivityService.onEvent | NotificationStore |

---

## 4. M9 Adapter Inventory

The following adapters already exist in `packages/activity-projection/src/`:

| Adapter | Input Type | Output Type | Status |
|---------|-----------|-------------|--------|
| `fromWorkflowEvent()` | M8 `WorkflowEvent` | M9 `ActivityEvent` | ✅ Ready |
| `fromHumanMessage()` | `HumanMessageInput` | M9 `ActivityEvent` | ✅ Ready |
| `fromAgentLifecycle()` | `AgentLifecycleInput` | M9 `ActivityEvent` | ✅ Ready |
| `fromOrchestrationEvent()` | `OrchestrationEventLike` | `ActivitySourceEvent` | ✅ Ready (for old room) |
| `fromEngineeringTruthEvent()` | `EngineeringTruthEventLike` | `ActivitySourceEvent` | ✅ Ready (for old room) |

**Key insight**: `fromWorkflowEvent()`, `fromHumanMessage()`, and `fromAgentLifecycle()` output `ActivityEvent` (M9 format). `fromOrchestrationEvent()` and `fromEngineeringTruthEvent()` output `ActivitySourceEvent` (old room format).

For M9 ingestion, we need the M9-format adapters.

---

## 5. The Gap

```
                    AUTHORITATIVE PRODUCERS
                             │
            ┌────────────────┼────────────────┐
            │                │                │
        Workflow          Agent           Human
        lifecycle       lifecycle        message
            │                │                │
            └────────┬───────┴────────┬───────┘
                     │                │
                     ▼                ▼
               EventBus events    Direct API
                     │                │
                     ▼                │
            ┌────────────────┐        │
            │ ActivityService│        │
            │ (ActivityLog)  │        │
            └────────────────┘        │
                     │                │
                     ▼                ▼
              ActivityLogStore   Old Activity Room
              (dashboard)        (legacy WS)
                     │
                     ✗  ← NOT connected to M9
                     │
                     ▼
              M9 DurableActivityStore (EMPTY)
                     │
                     ▼
              M10 Projection → M11A → M11B → M11C
```

### What's Missing

1. **M8 WorkflowRunEngine events** — `onEvent()` is never subscribed to. Events are lost.
2. **Orchestration events** — Written to EngineeringEventStore, not M9.
3. **ActivityService events** — Written to ActivityLogStore, not M9.

### What's NOT Missing

- M9 adapters exist and are correct
- M9 store schema is complete
- M10 projection reads from M9 correctly
- M11A/M11B/M11C consume correctly

---

## 6. Recommended Integration Point

### Option A: EventBus Bridge (Recommended)

Add a single `M9IngestionBridge` that subscribes to the same EventBus patterns as `ActivityService`, but writes to M9 instead of ActivityLogStore.

```
EventBus → M9IngestionBridge → fromWorkflowEvent/fromHumanMessage/fromAgentLifecycle → M9 DurableActivityStore
```

**Advantages:**
- Single write point (no dual-writing from multiple services)
- Same event patterns already defined in ActivityService
- M9 adapters already exist
- Idempotent (M9 store deduplicates by eventId)
- No coupling between workflow engine and M9

**Disadvantages:**
- EventBus events are `VestaraEvent` (generic), not `WorkflowEvent` (typed)
- Need to map `VestaraEvent` → M9 adapter inputs

### Option B: WorkflowRunEngine Subscription

Subscribe to `WorkflowRunEngine.onEvent()` and bridge directly to M9.

```
WorkflowRunEngine.onEvent() → fromWorkflowEvent() → M9 DurableActivityStore
```

**Advantages:**
- Direct, typed `WorkflowEvent` → M9 adapter
- No EventBus indirection

**Disadvantages:**
- Only covers workflow/task events, not human messages or agent lifecycle
- Requires separate bridges for other event types
- Multiple write points (violates single-bridge principle)

### Option C: EngineeringEventStore Bridge

Bridge from `SqliteEngineeringEventStore` to M9.

**Advantages:**
- EngineeringEventStore already has orchestration events

**Disadvantages:**
- EngineeringEventStore is a different concern (audit trail)
- Would create a dependency chain: Orchestrator → EngineeringEventStore → M9
- Doesn't cover human messages or agent lifecycle

---

## 7. Recommendation: Option A — EventBus Bridge

### Why

1. **Single canonical boundary**: One bridge, all event types
2. **Same patterns already defined**: ActivityService's `EVENT_MAP` is the reference
3. **M9 adapters exist**: `fromWorkflowEvent()`, `fromHumanMessage()`, `fromAgentLifecycle()` are ready
4. **Idempotent**: M9 store deduplicates by `eventId`
5. **No dual-writing**: Bridge is the only M9 writer
6. **Preserves M9 identity**: `eventId`, `executionId`, `traceId`, `workflowRunId`, `taskId` all flow through

### Implementation Sketch

```typescript
// packages/activity-projection/src/m9-ingestion-bridge.ts

import type { EventBus } from '@vestara/event-bus';
import type { VestaraEvent } from '@vestara/shared';
import { fromWorkflowEvent, fromHumanMessage, fromAgentLifecycle } from './m9-adapter';
import type { DurableActivityStore } from './m9-sqlite-store';

export class M9IngestionBridge {
  constructor(
    private readonly store: DurableActivityStore,
    private readonly eventBus: EventBus,
  ) {}

  start(): void {
    // Subscribe to the same patterns as ActivityService
    for (const pattern of EVENT_MAP) {
      this.eventBus.subscribe(pattern, (event) => this.ingest(event));
    }
  }

  private async ingest(event: VestaraEvent): Promise<void> {
    const activityEvent = this.mapToActivityEvent(event);
    if (activityEvent) {
      await this.store.append(activityEvent);
    }
  }

  private mapToActivityEvent(event: VestaraEvent): ActivityEvent | null {
    // Map VestaraEvent → M9 adapter input
    // Use fromWorkflowEvent for workflow:* events
    // Use fromHumanMessage for human messages
    // Use fromAgentLifecycle for agent:* events
  }
}
```

### Event Coverage

| EventBus Pattern | M9 Adapter | Coverage |
|-----------------|------------|----------|
| `conversation:*` | `fromHumanMessage()` | Human messages |
| `workspace:*` | System events | Workspace lifecycle |
| `plan:*` | `fromWorkflowEvent()` | Plan lifecycle |
| `changeset:*` | `fromAgentLifecycle()` | Implementation |
| `verification:*` | `fromAgentLifecycle()` | Verification |
| `agent:*` | `fromAgentLifecycle()` | Agent lifecycle |
| `orchestration:*` | `fromOrchestrationEvent()` | Orchestration |

---

## 8. What NOT to Do

1. **Do NOT add `m9Store.append()` calls throughout workflow/runtime code** — creates multiple write points
2. **Do NOT replace ActivityLogStore** — it serves the dashboard, not the Activity Room
3. **Do NOT bridge from EngineeringEventStore** — wrong concern, wrong schema
4. **Do NOT derive workflow truth from log prose** — M8 WorkflowRunEvents are the source
5. **Do NOT make M9 authoritative for workflow execution** — M8/runtime remains the writer
6. **Do NOT change M10/M11A/M11B/M11C** — they read from M9 correctly

---

## 9. Verification After Implementation

### Smoke Proof (One Workflow)

```
Start API
   ↓
Start ONE workflow via orchestration
   ↓
M8 WorkflowRunEngine emits event
   ↓
EventBus carries event
   ↓
M9IngestionBridge ingests
   ↓
m9-activity.db exists with records
   ↓
M10 ProjectionRuntime sees records
   ↓
M11B emits activity via WebSocket
   ↓
Firefox Activity Room shows it
```

### Full Regression

After smoke proof passes:
- ROOM-2 through ROOM-9 can be re-run
- Activity Room shows real workflow activity
- Participants are projection-driven
- Aggregation works with real data
- Reconnect delivers catch-up correctly

---

## 10. Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `packages/activity-projection/src/m9-ingestion-bridge.ts` | **Create** | Single bridge from EventBus → M9 |
| `packages/activity-projection/src/index.ts` | **Modify** | Export bridge |
| `apps/api/src/workspace-context.ts` | **Modify** | Instantiate bridge at boot |
| `apps/api/src/index.ts` | **Modify** | Start bridge after M11A init |

### Estimated Scope

- ~100 lines new code (bridge)
- ~10 lines modification (context + index)
- No changes to M10/M11A/M11B/M11C
- No changes to ActivityLogStore

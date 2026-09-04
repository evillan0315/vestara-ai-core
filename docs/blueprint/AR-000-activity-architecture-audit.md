---
title: AR-000 — Existing Activity Architecture Audit
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# AR-000 — Existing Activity Architecture Audit

**Author**: Vestara Developer Agent  
**Date**: 2026-09-04  
**Classification**: Read-only audit — no production mutations  

---

## Executive Summary

**Decision: B — `activity-projection` IS the Activity Room.**

The package's internal name ("projection") describes its mechanism, but its purpose, contracts, consumers, and test coverage prove it represents the Activity Room domain. Creating a separate `packages/activity-room` would be redundant. The recommended action is to **evolve the package name** from `activity-projection` to `activity-room` while preserving all internal modules.

---

## Audit Inventory

### 1. packages/activity-projection

**Package name**: `@vestara/activity-projection`  
**Description**: "Typed, append-only activity projection for the Activity Room (AAR-001)"  
**Dependencies**: `@vestara/event-bus`, `@vestara/shared`, `@vestara/sqlite-migrations`, `@vestara/types`, `sql.js`

#### What it owns

| Domain | Exports | Lines |
|--------|---------|------:|
| **Activity types** | `ActivityRecord` (6-kind discriminated union), `ActivityKind`, `ActivityActor`, `ActivityBase`, `WorkflowActivity`, `TaskActivity`, `AgentMessageActivity`, `TestActivity`, `VerificationActivity`, `AcceptanceActivity` | 193 |
| **Projection pipeline** | `ActivityProjector` interface, `ActivityProjectorRegistry`, 6 projectors (workflow, task, agent-message, test, verification, organizational) | ~400 |
| **Service orchestration** | `ActivityProjectionService` (source event → projector → redaction → append-only persistence) | 120 |
| **Persistence** | `ActivityStore` interface, `InMemoryActivityStore`, `SqliteActivityStore`, `DurableActivityStore` (alias) | ~250 |
| **Live delivery** | `ActivityStreamHub`, `ActivityStreamConnection`, `ActivityStreamSink`, `ActivityStreamMessage` | 213 |
| **Query** | `ActivityQuery`, `ActivityPage`, `ActivitySeverity`, `severityOf` | ~125 |
| **Adapters** | `fromEngineeringTruthEvent`, `fromOrchestrationEvent`, `fromWorkflowEvent`, `fromAgentLifecycle`, `fromHumanMessage`, `fromInteractionPresented`, `fromInteractionResponded` | ~300 |
| **Projection runtime** | `ProjectionRuntime`, `EffectiveState`, `projectEffectiveState` | ~200 |
| **Redaction** | `ActivityRedactor`, `RedactionPolicy`, `DEFAULT_REDACTION_POLICY` | ~100 |
| **Sequencing** | `MonotonicSequence` | ~30 |
| **M9 bridge** | `M9IngestionBridge`, `M9DeliveryVerifier` | ~100 |
| **Batch** | `ActivityBatch`, `toActivityBatch` | ~30 |

#### Production consumers (14 files)

| Consumer | How it uses activity-projection |
|----------|--------------------------------|
| `apps/api/src/activity-room.ts` | Creates room singleton (store + service + hub) |
| `apps/api/src/routes/activity-room.ts` | M9 API: history, messages, receipts |
| `apps/api/src/routes/activity-room-m11a.ts` | M11A read API: snapshot, activities, participants, attention |
| `apps/api/src/routes/activity-room-m11b.ts` | M11B WebSocket transport |
| `apps/api/src/routes/interactions.ts` | Interaction projection |
| `apps/api/src/bridges/activity-room-organizational-bridge.ts` | Organizational bridge |
| `apps/api/src/message-receipts.ts` | Message delivery receipts |
| `apps/api/src/participants.ts` | Participant projection |
| `apps/api/src/workspace-context.ts` | Type imports |
| `apps/api/src/index.ts` | Boot initialization |
| `apps/workspace/src/hooks/useActivityStream.ts` | React hook for live stream |
| `apps/workspace/src/lib/activity.ts` | Activity utility functions |
| `apps/workspace/src/pages/activity/activity-types.ts` | UI type definitions |
| `packages/interaction-app/src/index.ts` | Comment-only reference |

#### Test coverage

24 test files, ~200+ tests. Includes:
- Unit tests for every projector, store, adapter, redactor
- Integration tests for the full projection pipeline
- M10 invariant review (including the 100K stress test)
- M11A read API contract tests
- Delivery/resync behavior tests

---

### 2. packages/event-bus

**Package name**: `@vestara/event-bus`  
**Description**: In-process typed event bus  

**What it owns**: `InProcessEventBus` class, `EventBus` interface, `EmitEvent` type  
**Consumers**: ~40 packages across the entire monorepo — foundational infrastructure  

**Relationship to Activity Room**: `activity-projection` depends on `event-bus` but does NOT currently use it for event delivery. The `ActivityProjectionService` receives events through direct method calls (`project()` / `appendActivity()`), not through the event bus. The event bus is used by other subsystems (kernel, runtime, bridges) that emit events which may eventually flow into the activity projection.

**Verdict**: Generic infrastructure. NOT Activity Room-specific. Keep as-is.

---

### 3. packages/engineering-event-store

**Package name**: `@vestara/engineering-event-store`  
**Description**: Canonical event store for engineering truth  

**What it owns**: `SqliteEngineeringEventStore`, `ImmutableEvidenceManifestStore`, `ContentAddressedEvidenceStore`, `DurableThreadRecoveryService`, evidence manifest, integrity verification, truth graph projection  

**Consumers**: 14 production files — bridges, evidence, workflow projections, activity-projection's source-event adapter  

**Relationship to Activity Room**: `activity-projection/src/source-event.ts` imports `EngineeringTruthEventLike` from this package and provides `fromEngineeringTruthEvent()` to normalize engineering events into activity source events. This is a one-way adapter: engineering-event-store → activity-projection.

**Verdict**: Independent authoritative system. NOT Activity Room-specific. Keep as-is.

---

### 4. Existing Activity Room API/Routes

Four route layers exist, representing evolutionary stages:

| Layer | File | Endpoints | Status |
|-------|------|-----------|--------|
| **Legacy** | `activity.ts` | `GET /api/activity-log`, `GET /api/activity` | Uses `@vestara/activity-log` (different package) |
| **M9** | `activity-room.ts` | `GET /api/activity-room`, `GET /api/activity-room/:id`, `GET /api/activity-room/state`, `POST /api/messages`, receipts | Primary Activity Room API |
| **M11A** | `activity-room-m11a.ts` | `GET /api/activity-room/v1/snapshot`, `/v1/activities`, `/v1/activities/:id`, `/v1/participants`, `/v1/attention`, `/v1/workflow-summary` | Production read API |
| **M11B** | `activity-room-m11b.ts` | WebSocket: subscribe/ack/ping/unsubscribe | Realtime transport |

The M11C page (`M11CActivityRoomPage.tsx`) is a UI evolution that consumes M11A + M11B.

**Key observation**: The legacy `activity.ts` route uses `@vestara/activity-log` (a separate package), NOT `@vestara/activity-projection`. These are two distinct systems:
- `@vestara/activity-log` — older, simpler activity log (consumed by `apps/api` and `apps/cli`)
- `@vestara/activity-projection` — newer, typed, append-only Activity Room projection

---

### 5. Existing Workspace Activity Room UI

~30 files in `apps/workspace/src/pages/activity/`:

| Component | Role |
|-----------|------|
| `ActivityRoomPage.tsx` | Main page (358 lines) |
| `M11CActivityRoomPage.tsx` | M11C evolution |
| `ActivityStream.tsx` / `M11CActivityStream.tsx` | Stream rendering |
| `ActivityItem.tsx` / `M11CStreamItem.tsx` | Individual item rendering |
| `ActivityDetailModal.tsx` | Detail view |
| `ActivityComposer.tsx` | Message composition |
| `ActivitySidebar.tsx` | Sidebar with participants |
| `ActivityStatePanel.tsx` | Effective state panel |
| `ActivityWorkflowBrowser.tsx` | Workflow browser |
| `ActivityScopeSelector.tsx` | Scope selection |
| `ActivityCorrectionDialog.tsx` | Correction dialog |
| `AgentDetailDrawer.tsx` | Agent detail drawer |
| `ExecutionPulse.tsx` | Execution visualization |
| `VisualEditMode.tsx` | Visual edit mode |

Hooks:
- `useActivityRoomModel.ts` — Main model hook
- `useActivityStream.ts` — Stream connection hook
- `useM11CActivityRoom.ts` — M11C model hook

API clients:
- `m11a-api.ts` — M11A REST client
- `m11b-client.ts` — M11B WebSocket client

---

### 6. ActivityItem/Projection Contracts

**Two distinct ActivityRecord types exist:**

#### Type 1: `@vestara/activity-projection` (AAR-001 contract)
- Location: `packages/activity-projection/src/contracts.ts`
- Discriminated union on `kind`: `workflow | task | agent-message | test | verification | acceptance`
- Fields: `id`, `sequence`, `timestamp`, `actor`, `workflowId`, `sessionId`, `taskId`, `correlationId`, `evidenceRefs`, `effect`, `relatesTo`, `correctionOf`
- This is the **canonical Activity Room contract** used by all M9/M11A/M11B API layers

#### Type 2: `@vestara/types` (M9 contract)
- Location: `packages/types/src/activity.ts`
- Has `ActivityRecordId` branded type, `eventId`, `sequenceNumber`
- Has `ActivityEvent` (input), `ActivityStore` interface, `ActivityCursor`, `ActivityQuery`
- Used by M11A route for participant/attention/summary projections
- Also defines `ActivityRoomProjection`, `ParticipantProjection`, `AttentionEntry`, `WorkflowSummary`

**Overlap**: Both define `ActivityRecord`, `ActivityQuery`, and `ActivityStore` with different shapes. The M11A route bridges between them.

---

### 7. SSE/Polling/Event Consumers

| Mechanism | Implementation | Location |
|-----------|---------------|----------|
| **WebSocket** | M11B protocol over `ws` | `activity-room-m11b.ts` |
| **ActivityStreamHub** | In-process broadcast | `activity-projection/src/stream.ts` |
| **React hooks** | `useActivityStream`, `useActivityRoomModel` | `apps/workspace/src/hooks/` |
| **Polling** | REST GET endpoints | `activity-room.ts`, `activity-room-m11a.ts` |

No SSE implementation exists. The M11B WebSocket transport is the primary live delivery mechanism.

---

### 8. Duplicate Implementations

| Pattern | Duplicate? | Details |
|---------|-----------|---------|
| ActivityRecord types | **YES** | `activity-projection/contracts.ts` vs `types/activity.ts` |
| ActivityStore interface | **YES** | `activity-projection/store.ts` vs `types/activity.ts` |
| ActivityQuery | **YES** | `activity-projection/store.ts` vs `types/activity.ts` |
| Activity service | **YES** | `@vestara/activity-log` (legacy) vs `@vestara/activity-projection` (current) |
| Activity API routes | **PARTIAL** | Legacy `activity.ts` vs M9 `activity-room.ts` vs M11A `activity-room-m11a.ts` |

---

### 9. Dead Implementations

| Item | Status |
|------|--------|
| `GET /api/activity-log` (legacy) | Still routed, uses `@vestara/activity-log` |
| `GET /api/activity` (legacy) | Still routed, uses `@vestara/activity-log` ActivityService |
| `TrialActivityRoom.tsx` | Qualification page, likely dead |

---

## Decision: Option B

### Rationale

1. **The package description says "for the Activity Room"** — it was always intended to BE the Activity Room
2. **All Activity Room API routes consume from this package** — M9, M11A, M11B all depend on `@vestara/activity-projection`
3. **All Activity Room UI consumes from this package** — hooks, API clients, types all reference it
4. **No separate `packages/activity-room` exists** — all Activity Room code lives here
5. **The projection pipeline is the Activity Room's core capability** — the Activity Room IS a projection system
6. **Creating a new package would just re-export** — adding `packages/activity-room` that re-exports from `activity-projection` adds complexity without value

### Recommended Action

**Evolve the package name** from `@vestara/activity-projection` to `@vestara/activity-room`:

1. Rename `packages/activity-projection/` → `packages/activity-room/`
2. Update `package.json` name: `@vestara/activity-room`
3. Update all 14 production consumers to import from `@vestara/activity-room`
4. Update all test consumers similarly
5. Keep all internal module structure unchanged (contracts, projectors, service, store, stream, etc.)

This is a **rename**, not a rewrite. The internal architecture is sound.

### Authority Boundaries (Preserved)

| Boundary | Owner | Activity Room Relationship |
|----------|-------|---------------------------|
| Workflow status | Workflow Orchestrator | Activity Room **observes** workflow transitions |
| Agent execution | Agent Harness | Activity Room **observes** agent lifecycle |
| Verification verdict | VCTRL/Verification | Activity Room **observes** verification outcomes |
| Repository identity | Workspace/Repository | Activity Room **references** repository IDs |
| Runtime session state | Runtime Session | Activity Room **observes** session events |
| Provider/model selection | Provider Runtime | Activity Room **observes** provider events |
| Activity projection | **Activity Room** | **Owns** projection, store, stream, query |
| Activity messaging | **Activity Room** | **Owns** human message append + receipts |

### Consolidation Opportunities

After the rename, address these duplicates:

1. **ActivityRecord types**: Merge `types/activity.ts` ActivityRecord into `activity-room/contracts.ts` or establish clear provenance (types = input contract, contracts = stored record)
2. **Legacy activity routes**: Deprecate `activity.ts` routes that use `@vestara/activity-log` — redirect to M11A endpoints
3. **ActivityStore interface**: Consolidate the two ActivityStore interfaces into one

---

## Appendix: Full Consumer Map

### @vestara/activity-projection consumers (production)

```
apps/api/src/activity-room.ts
apps/api/src/bridges/activity-room-organizational-bridge.ts
apps/api/src/index.ts
apps/api/src/message-receipts.ts
apps/api/src/participants.ts
apps/api/src/routes/activity-room-m11a.ts
apps/api/src/routes/activity-room-m11b.ts
apps/api/src/routes/activity-room.ts
apps/api/src/routes/interactions.ts
apps/api/src/workspace-context.ts
apps/workspace/src/hooks/useActivityStream.ts
apps/workspace/src/lib/activity.ts
apps/workspace/src/pages/activity/activity-types.ts
packages/interaction-app/src/index.ts (comment only)
```

### @vestara/activity-projection consumers (tests)

```
packages/activity-projection/__tests__/ (24 files)
packages/workspace/__tests__/agent-runtime-harness.test.ts
packages/workspace/__tests__/harness-session.test.ts
packages/workspace/__tests__/harness-task-dispatcher.test.ts
apps/api/__tests__/activity-room.test.ts
apps/api/__tests__/activity-room-delivery.test.ts
apps/api/__tests__/activity-room-ws.test.ts
apps/api/__tests__/activity-room-organizational-bridge.test.ts
apps/api/__tests__/harness-approval-interaction-bridge.test.ts
apps/api/__tests__/harness-approval-production-chain.test.ts
apps/api/__tests__/interactions.test.ts
apps/api/__tests__/multi-agent-workflow-routes.test.ts
apps/api/__tests__/orchestration-routes.test.ts
apps/workspace/__tests__/activity-room.test.tsx
apps/workspace/__tests__/activity-room-agent-drawer.test.tsx
apps/workspace/__tests__/activity-room-model.test.tsx
apps/workspace/__tests__/activity-scope.test.tsx
apps/workspace/__tests__/activity-messaging.test.tsx
apps/workspace/__tests__/activity-hardening.test.tsx
apps/workspace/__tests__/m11c-activity-room.test.tsx
```

### @vestara/event-bus consumers (production, 40+ files)

Foundational infrastructure — used by kernel, runtime, bridges, agent-harness, conversation-runtime, and many more. NOT Activity Room-specific.

### @vestara/engineering-event-store consumers (production, 14 files)

Authoritative engineering truth store — used by bridges, evidence, workflow projections. Activity Room consumes through the `fromEngineeringTruthEvent()` adapter.

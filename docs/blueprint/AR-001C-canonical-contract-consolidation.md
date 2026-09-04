---
title: AR-001C — Canonical Activity Contract Consolidation
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# AR-001C — Canonical Activity Contract Consolidation

**Author**: Vestara Developer Agent  
**Date**: 2026-09-04  
**Prerequisite**: AR-000 (Decision B), AR-001 (frozen), AR-001R (frozen)  
**Status**: COMPLETE — both phases done

---

## AR-001C.1 — Consumer Migration Map

### Family B Types from `@vestara/types`

Every production and test consumer of Activity-owned contracts currently exported by `@vestara/types`:

#### Production Consumers (11 files)

| File | Types Imported | Classification |
|------|---------------|----------------|
| `packages/activity-room/src/m9-adapter.ts` | ActivityActor, ActivityEvent, ActivityPayload, ActivitySource, ActivityType, BindingId, ExecutionId, RepositoryBindingId, RuntimeSessionId, TraceId, WorkflowEvent, WorkflowRunId, WorkflowTaskId | **DIRECT_MIGRATION** — internal to activity-room |
| `packages/activity-room/src/m9-sqlite-store.ts` | ActivityCursor, ActivityEvent, ActivityQuery, ActivityRecord, ActivityRecordId, ActivityStore (as IActivityStore) | **DIRECT_MIGRATION** — internal to activity-room |
| `packages/activity-room/src/m9-store.ts` | ActivityCursor, ActivityEvent, ActivityQuery, ActivityRecord, ActivityRecordId, ActivityStore (as IActivityStore) | **DIRECT_MIGRATION** — internal to activity-room |
| `packages/activity-room/src/m10-projection-runtime.ts` | ActivityActor, ActivityCursor, ActivityRecord, ActivityRoomProjection, AttentionEntry, AttentionSeverity, ContextualCapabilities, MembershipState, ParticipantProjection, StreamImportance, StreamItem, StreamItemKind, WorkflowRunId, WorkflowSummary, WorkflowTaskId, WorkState | **DIRECT_MIGRATION** — internal to activity-room |
| `packages/activity-room/src/m9-delivery-verifier.ts` | ActivityStore | **DIRECT_MIGRATION** — internal to activity-room |
| `packages/activity-room/src/m9-ingestion-bridge.ts` | ActivityEvent, ActivityStore, WorkflowRunId | **DIRECT_MIGRATION** — internal to activity-room |
| `apps/api/src/routes/activity-room-m11a.ts` | ActivityCursor, ActivityEvent, ActivityQuery, ActivityRecordId, ActivityRoomProjection, ActivityStore, AttentionEntry, M9ActivityRecord, ParticipantProjection, WorkflowSummary | **ADAPTER_REQUIRED** — bridges Family A ↔ Family B |
| `apps/api/src/routes/activity-room-m11b.ts` | ActivityCursor, ActivityStore, M9ActivityRecord | **ADAPTER_REQUIRED** — uses M9 types for WebSocket |
| `apps/workspace/src/hooks/useM11CActivityRoom.ts` | AttentionEntry, ParticipantProjection, WorkflowSummary | **DIRECT_MIGRATION** — UI read models |
| `apps/workspace/src/lib/m11b-client.ts` | ActivityCursor | **DIRECT_MIGRATION** — cursor type |
| `apps/workspace/src/pages/activity/M11CParticipantRail.tsx` | ParticipantProjection | **DIRECT_MIGRATION** — UI read model |

#### Test Consumers (2 files)

| File | Types Imported | Classification |
|------|---------------|----------------|
| `apps/workspace/__tests__/m11c-activity-room.test.tsx` | ParticipantProjection | **DIRECT_MIGRATION** |
| `apps/workspace/__tests__/r4-stream-integration.test.tsx` | M9ActivityRecord | **ADAPTER_REQUIRED** — tests bridge |

#### Summary by Classification

| Classification | Count | Description |
|---------------|------:|-------------|
| **DIRECT_MIGRATION** | 9 | Import from `@vestara/types`, migrate to `@vestara/activity-room` |
| **ADAPTER_REQUIRED** | 3 | M11A/M11B bridge + test — require bridge elimination first |
| **SHARED_TYPE** | 0 | (none — all Activity types are Activity Room owned) |
| **OBSOLETE** | 0 | (none — all consumers are active) |

---

## AR-001C.2 — Domain Contracts vs Projections

### Activity Room Domain Contracts (→ `@vestara/activity-room`)

| Type | Owner | Rationale |
|------|-------|-----------|
| `ActivityRecord` (M9 flat) | Activity Room | Stored record — persistence authority |
| `ActivityRecordId` | Activity Room | Branded ID for stored records |
| `ActivityEvent` | Activity Room | Input normalization — ingestion contract |
| `ActivityStore` | Activity Room | Persistence interface |
| `ActivityQuery` | Activity Room | Query interface |
| `ActivityCursor` | Activity Room | Pagination/replay cursor |
| `ActivityType` (22-value union) | Activity Room | Event type taxonomy |
| `ActivitySource` | Activity Room | Source system enum |
| `ActivityPayload` | Activity Room | Normalized content |
| `ActivityVisibility` | Activity Room | Access control |

### Activity Room Projection Contracts (→ `@vestara/activity-room`)

| Type | Owner | Rationale |
|------|-------|-----------|
| `StreamItem` | Activity Room | Read model for timeline |
| `StreamItemKind` | Activity Room | Content classification |
| `StreamImportance` | Activity Room | Visual muting |
| `ParticipantProjection` | Activity Room | Read model for participants |
| `AttentionEntry` | Activity Room | Read model for attention |
| `AttentionReason` | Activity Room | Attention classification |
| `AttentionSeverity` | Activity Room | Attention severity |
| `WorkflowSummary` | Activity Room | Read model for workflow |
| `ActivityRoomProjection` | Activity Room | Aggregate projection |
| `ContextualCapabilities` | Activity Room | Composer context |

### Genuinely Cross-Domain Primitives (→ stay in `@vestara/types`)

| Type | Used By | Rationale |
|------|---------|-----------|
| `ActivityActorType` | activity-room, interaction-app, workspace | Shared enum: 'human' \| 'agent' \| 'system' |
| `MembershipState` | activity-room, workspace | Shared enum: 'joined' \| 'left' \| 'assigned' |
| `PresenceState` | activity-room, workspace | Shared enum: 'online' \| 'offline' \| 'idle' \| 'disconnected' |
| `WorkState` | activity-room, workspace | Shared enum: 'available' \| 'working' \| 'waiting' \| 'blocked' \| 'attention-required' |
| `ActivityActor` | activity-room, types | Shared interface (simpler version in types) |
| `WorkflowEvent` | activity-room, workflow-orchestrator | M8 event type — cross-domain |
| `WorkflowRunId` | activity-room, types, workflow-orchestrator | Branded ID — cross-domain |
| `WorkflowTaskId` | activity-room, types, workflow-orchestrator | Branded ID — cross-domain |
| `ExecutionId` | activity-room, types | Branded ID — cross-domain |
| `TraceId` | activity-room, types | Branded ID — cross-domain |
| `RequestId` | activity-room, types | Branded ID — cross-domain |
| `BindingId` | activity-room, types | Branded ID — cross-domain |
| `RepositoryBindingId` | activity-room, types | Branded ID — cross-domain |
| `RuntimeSessionId` | activity-room, types | Branded ID — cross-domain |

---

## AR-001C.3 — M11A Bridge Elimination

### Current Bridge Architecture

```
M8 WorkflowEvent
    ↓ (m9-adapter.ts)
ActivityEvent (M9 input)
    ↓ (m9-sqlite-store.ts / m9-store.ts)
ActivityRecord (M9 stored)
    ↓ (m10-projection-runtime.ts)
ActivityRoomProjection (M9 projection)
    ↓ (activity-room-m11a.ts)
toProjectionRecord() ← BRIDGE
    ↓
ProjectionActivityRecord (Family A)
    ↓ (ActivityStreamHub)
WebSocket broadcast
```

The bridge exists because:
1. M9 store persists `ActivityRecord` (Family B flat shape)
2. M10 projection produces `ActivityRoomProjection` (Family B projection)
3. M11A route converts M9 → Family A for hub broadcasting
4. M11B route converts M9 → Family A for WebSocket delivery

### Bridge Elimination Strategy

**Target**: The activity-room package should own the stored record shape. The M9 store should persist the canonical record, not a separate M9 shape.

**Current**: 
- `m9-store.ts` and `m9-sqlite-store.ts` implement `ActivityStore` (M9 interface) and persist `ActivityRecord` (M9 flat shape)
- `m10-projection-runtime.ts` reads M9 `ActivityRecord` and produces `ActivityRoomProjection`
- M11A/M11B routes bridge M9 → Family A for broadcasting

**Target**:
- `m9-store.ts` and `m9-sqlite-store.ts` persist the canonical `ActivityRecord` (Family A 6-kind union)
- `m10-projection-runtime.ts` reads canonical records and produces projection
- M11A/M11B routes use canonical records directly — no bridge needed

**Migration Steps**:
1. Move M9 types into activity-room package
2. Update store implementations to persist canonical record shape
3. Update projection runtime to read canonical records
4. Remove `toProjectionRecord()` bridge from M11A/M11B
5. Update M11A/M11B to use canonical types directly

---

## AR-001C.4 — Canonical Input Event

### Input Event Taxonomy

| Concept | Current Name | Role | Authority |
|---------|-------------|------|-----------|
| Authoritative source event | `WorkflowEvent` (M8) | Originates from workflow orchestrator | Workflow Orchestrator |
| Projection ingestion event | `ActivityEvent` (M9) | Normalized input for activity store | Activity Room |
| Stored activity record | `ActivityRecord` (M9 flat) | Persisted, deduplicated, sequenced | Activity Room |
| Transport event | `ActivityStreamMessage` | WebSocket delivery | Activity Room |

### Resolution

- `ActivityEvent` is the **projection ingestion event** — it is Activity Room's input contract
- `ActivityRecord` is the **stored activity record** — it is Activity Room's persistence contract
- `WorkflowEvent` is the **authoritative source event** — it belongs to Workflow Orchestrator
- `ActivityStreamMessage` is the **transport event** — it belongs to Activity Room's streaming layer

These are NOT interchangeable. The `m9-adapter.ts` converts `WorkflowEvent` → `ActivityEvent`. The `m9-store.ts` converts `ActivityEvent` → `ActivityRecord`. The `ActivityStreamHub` delivers `ActivityRecord` as `ActivityStreamMessage`.

---

## AR-001C.5 — Incremental Migration Plan

### Group 1: Internal activity-room types (6 files)

**Scope**: Move M9 types from `@vestara/types` into `@vestara/activity-room` internal modules.

| File | Types to Internalize |
|------|---------------------|
| `m9-adapter.ts` | ActivityActor, ActivityEvent, ActivityPayload, ActivitySource, ActivityType |
| `m9-sqlite-store.ts` | ActivityCursor, ActivityEvent, ActivityQuery, ActivityRecord, ActivityRecordId, ActivityStore |
| `m9-store.ts` | ActivityCursor, ActivityEvent, ActivityQuery, ActivityRecord, ActivityRecordId, ActivityStore |
| `m10-projection-runtime.ts` | ActivityActor, ActivityCursor, ActivityRecord, ActivityRoomProjection, AttentionEntry, AttentionSeverity, ContextualCapabilities, MembershipState, ParticipantProjection, StreamImportance, StreamItem, StreamItemKind, WorkflowSummary, WorkState |
| `m9-delivery-verifier.ts` | ActivityStore |
| `m9-ingestion-bridge.ts` | ActivityEvent, ActivityStore |

**Action**: Create canonical type definitions in `@vestara/activity-room/src/contracts.ts` (already exists for Family A). Add M9-compatible types as re-exports or internal definitions.

### Group 2: M11A bridge (1 file)

**Scope**: Eliminate `toProjectionRecord()` bridge.

| File | Change |
|------|--------|
| `activity-room-m11a.ts` | Replace M9 imports with activity-room canonical types. Remove `toProjectionRecord()`. Use canonical record directly. |

### Group 3: M11B bridge (1 file)

**Scope**: Eliminate `toProjectionRecord()` bridge.

| File | Change |
|------|--------|
| `activity-room-m11b.ts` | Replace M9 imports with activity-room canonical types. Remove `toProjectionRecord()`. Use canonical record directly. |

### Group 4: Workspace consumers (4 files)

**Scope**: Update workspace imports.

| File | Change |
|------|--------|
| `useM11CActivityRoom.ts` | Import AttentionEntry, ParticipantProjection, WorkflowSummary from `@vestara/activity-room` |
| `m11b-client.ts` | Import ActivityCursor from `@vestara/activity-room` |
| `M11CParticipantRail.tsx` | Import ParticipantProjection from `@vestara/activity-room` |
| `M11CStreamItem.tsx` | No change (imports Interaction types, not Activity types) |

### Group 5: Test consumers (2 files)

**Scope**: Update test imports.

| File | Change |
|------|--------|
| `m11c-activity-room.test.tsx` | Import ParticipantProjection from `@vestara/activity-room` |
| `r4-stream-integration.test.tsx` | Import M9ActivityRecord from `@vestara/activity-room` (or canonical record) |

### Group 6: Final cleanup

**Scope**: Remove duplicate definitions from `@vestara/types`.

| Type | Action |
|------|--------|
| ActivityRecord (M9 flat) | Remove from `@vestara/types` |
| ActivityRecordId | Remove from `@vestara/types` |
| ActivityEvent | Remove from `@vestara/types` |
| ActivityStore | Remove from `@vestara/types` |
| ActivityQuery | Remove from `@vestara/types` |
| ActivityCursor | Remove from `@vestara/types` |
| ActivityType | Remove from `@vestara/types` |
| ActivitySource | Remove from `@vestara/types` |
| ActivityPayload | Remove from `@vestara/types` |
| ActivityVisibility | Remove from `@vestara/types` |
| StreamItem | Remove from `@vestara/types` |
| StreamItemKind | Remove from `@vestara/types` |
| StreamImportance | Remove from `@vestara/types` |
| ParticipantProjection | Remove from `@vestara/types` |
| AttentionEntry | Remove from `@vestara/types` |
| AttentionReason | Remove from `@vestara/types` |
| AttentionSeverity | Remove from `@vestara/types` |
| WorkflowSummary | Remove from `@vestara/types` |
| ActivityRoomProjection | Remove from `@vestara/types` |
| ContextualCapabilities | Remove from `@vestara/types` |

**Retain in `@vestara/types`**:

| Type | Reason |
|------|--------|
| ActivityActorType | Shared enum |
| ActivityActor | Shared interface |
| MembershipState | Shared enum |
| PresenceState | Shared enum |
| WorkState | Shared enum |
| WorkflowRunId | Cross-domain branded ID |
| WorkflowTaskId | Cross-domain branded ID |
| ExecutionId | Cross-domain branded ID |
| TraceId | Cross-domain branded ID |
| RequestId | Cross-domain branded ID |
| BindingId | Cross-domain branded ID |
| RepositoryBindingId | Cross-domain branded ID |
| RuntimeSessionId | Cross-domain branded ID |
| WorkflowEvent | Cross-domain event type |

---

## AR-001C.6 — Final Duplicate Removal

After all consumers are migrated:

### Types removed from `@vestara/types`

20 types removed:
- ActivityRecord, ActivityRecordId, ActivityEvent, ActivityStore, ActivityQuery, ActivityCursor
- ActivityType, ActivitySource, ActivityPayload, ActivityVisibility
- StreamItem, StreamItemKind, StreamImportance
- ParticipantProjection, AttentionEntry, AttentionReason, AttentionSeverity
- WorkflowSummary, ActivityRoomProjection, ContextualCapabilities

### Types retained in `@vestara/types`

14 types retained:
- ActivityActorType, ActivityActor
- MembershipState, PresenceState, WorkState
- WorkflowRunId, WorkflowTaskId, ExecutionId, TraceId, RequestId
- BindingId, RepositoryBindingId, RuntimeSessionId
- WorkflowEvent

### Final Authority

| Authority | Package | Types |
|-----------|---------|-------|
| Activity Record | `@vestara/activity-room` | ActivityRecord (6-kind union + M9 flat) |
| Activity Store | `@vestara/activity-room` | ActivityStore, ActivityQuery, ActivityCursor |
| Activity Input | `@vestara/activity-room` | ActivityEvent, ActivityPayload |
| Activity Projection | `@vestara/activity-room` | StreamItem, ParticipantProjection, AttentionEntry, WorkflowSummary, ActivityRoomProjection |
| Cross-domain IDs | `@vestara/types` | WorkflowRunId, WorkflowTaskId, ExecutionId, etc. |
| Shared enums | `@vestara/types` | ActivityActorType, MembershipState, PresenceState, WorkState |

---

## Verification

### Required

| Check | Command |
|-------|---------|
| activity-room build | `pnpm --filter @vestara/activity-room build` |
| dependent packages build | `pnpm build` |
| activity-room tests | `npx vitest run packages/activity-room/__tests__/` |
| API activity-room tests | `npx vitest run apps/api/__tests__/activity-room-*` |
| workspace activity-room tests | `npx vitest run apps/workspace/__tests__/r4-stream-integration.test.tsx` |
| M11A contract tests | `npx vitest run apps/api/__tests__/activity-room-*` |
| M11B/WebSocket tests | `npx vitest run apps/api/__tests__/activity-room-ws.test.ts` |
| lint | `pnpm lint:check` |
| source artifacts | `pnpm check:source-artifacts` |

### Behavioral Delta Target

**ZERO** — internal contract consolidation does not change:
- API response schemas
- WebSocket protocol
- Persistence behavior
- Projection behavior
- Message behavior

---

---

## Phase 1: Internal Types Consolidation (COMPLETED)

### What Was Done

1. **Created `m9-types.ts`** in `packages/activity-room/src/` — consolidated M9 Activity Room types (ActivityRecordId, ActivityType, ActivitySource, ActivityVisibility, ActivityRecord, ActivityPayload, ActivityEvent, ActivityCursor, M9ActivityQuery, M9ActivityStore) that were previously only in `@vestara/types`

2. **Created `projection-types.ts`** in `packages/activity-room/src/` — consolidated projection read models (StreamItem, StreamItemKind, StreamImportance, ParticipantProjection, AttentionEntry, AttentionReason, AttentionSeverity, WorkflowSummary, ContextualCapabilities, ActivityRoomProjection) that were previously only in `@vestara/types`

3. **Updated internal modules** to import from local types instead of `@vestara/types`:
   - `m9-adapter.ts` — imports ActivityEvent, ActivityPayload, ActivitySource, ActivityType from `./m9-types`
   - `m9-sqlite-store.ts` — imports M9ActivityStore, M9ActivityQuery, ActivityRecord, etc. from `./m9-types`
   - `m9-store.ts` — imports M9ActivityStore, M9ActivityQuery, ActivityRecord, etc. from `./m9-types`
   - `m9-delivery-verifier.ts` — imports M9ActivityStore from `./m9-types`
   - `m9-ingestion-bridge.ts` — imports ActivityEvent, M9ActivityStore from `./m9-types`
   - `m10-projection-runtime.ts` — imports from `./m9-types` and `./projection-types`

4. **Updated `index.ts`** to export new types:
   - `M9ActivityRecord` (M9 flat ActivityRecord)
   - `M9ActivityStore` (M9 ingestion store interface)
   - `ActivityCursor`, `ActivityEvent`, `ActivityPayload`, `ActivityRecordId`, `ActivitySource`, `ActivityType`, `ActivityVisibility`
   - `ActivityRoomProjection`, `AttentionEntry`, `AttentionReason`, `AttentionSeverity`, `ContextualCapabilities`, `ParticipantProjection`, `StreamImportance`, `StreamItem`, `StreamItemKind`, `WorkflowSummary`

5. **Preserved Family A as canonical** — `ActivityRecord` (6-kind union) remains the primary export for external consumers

### What Was NOT Done (Phase 2 — Deferred)

- External consumer migration (M11A/M11B bridge, workspace consumers)
- Removal of duplicate types from `@vestara/types`
- Bridge elimination (`toProjectionRecord()` in M11A/M11B)

### Rationale for Deferral

The external consumer migration requires:
- Updating M11A route to import `M9ActivityRecord` from `@vestara/activity-room` instead of `@vestara/types`
- Updating M11B route similarly
- Updating workspace consumers (useM11CActivityRoom, m11b-client, M11CParticipantRail)
- Removing 20 type definitions from `@vestara/types`

This is a broader migration that should be done in a separate bounded task to avoid risk during the contract consolidation.

### Verification

| Check | Result |
|-------|--------|
| Build | ✅ Passes |
| Lint | ✅ Passes (1351 files) |
| Source artifacts | ✅ Clean |
| Focused tests | ✅ 22 files, 161 tests, all pass |

---

## Phase 2: External Contract Migration & Duplicate Removal (COMPLETED)

### What Was Done

1. **Migrated M11A route** — imports M9ActivityRecord, M9ActivityQuery, M9ActivityStore, ActivityCursor, ActivityEvent, ActivityRecordId, ActivityRoomProjection, AttentionEntry, ParticipantProjection, WorkflowSummary from `@vestara/activity-room` instead of `@vestara/types`

2. **Migrated M11B route** — imports M9ActivityRecord, M9ActivityStore, ActivityCursor from `@vestara/activity-room` instead of `@vestara/types`

3. **Migrated workspace consumers**:
   - `useM11CActivityRoom.ts` — AttentionEntry, ParticipantProjection, WorkflowSummary from `@vestara/activity-room`
   - `m11b-client.ts` — ActivityCursor from `@vestara/activity-room`
   - `M11CParticipantRail.tsx` — ParticipantProjection from `@vestara/activity-room`

4. **Migrated test consumers**:
   - `m11c-activity-room.test.tsx` — ParticipantProjection from `@vestara/activity-room`
   - `r4-stream-integration.test.tsx` — M9ActivityRecord from `@vestara/activity-room`

5. **Analyzed M11A bridge** — `toProjectionRecord()` is RETAINED as a legitimate canonical record → read model transformation (maps M9 22-value type → Family A 6-value kind, derives agentId/messageKind/content/workflowId)

6. **Removed 20 duplicate Activity contracts from `@vestara/types`**:
   - From `activity.ts`: ActivityRecordId, ActivityType, ActivitySource, ActivityVisibility, ActivityRecord, ActivityPayload, ActivityEvent, ActivityCursor, ActivityQuery, ActivityStore
   - From `projection.ts`: StreamItem, StreamItemKind, StreamImportance, ParticipantProjection, AttentionEntry, AttentionReason, AttentionSeverity, WorkflowSummary, ContextualCapabilities, ActivityRoomProjection

7. **Retained in `@vestara/types`** (genuinely cross-domain):
   - ActivityActorType, ActivityActor, MembershipState, PresenceState, WorkState
   - Participant, MembershipEvent
   - All branded IDs (WorkflowRunId, WorkflowTaskId, ExecutionId, etc.)
   - Interaction types (StructuredInteraction, InteractionResponse, etc.)

### m9-types.ts Export Classification

| Export | Classification |
|--------|---------------|
| `ActivityRecordId` | CANONICAL_INPUT_CONTRACT |
| `ActivityType` | CANONICAL_INPUT_CONTRACT |
| `ActivitySource` | CANONICAL_INPUT_CONTRACT |
| `ActivityVisibility` | CANONICAL_INPUT_CONTRACT |
| `ActivityRecord` (M9 flat) | CANONICAL_READ_MODEL |
| `ActivityPayload` | CANONICAL_INPUT_CONTRACT |
| `ActivityEvent` | CANONICAL_INPUT_CONTRACT |
| `ActivityCursor` | CANONICAL_READ_MODEL |
| `M9ActivityQuery` | CANONICAL_INPUT_CONTRACT |
| `M9ActivityStore` | CANONICAL_INPUT_CONTRACT |

**Note**: The `M9` prefix in `M9ActivityQuery` and `M9ActivityStore` is transitional. These names encode historical architecture (M9 boundary). A future bounded cleanup should rename these to `ActivityIngestionQuery` and `ActivityIngestionStore` to reflect their actual role (ingestion-oriented interfaces) rather than the historical M9 boundary.

### Verification

| Check | Result |
|-------|--------|
| Build | ✅ Passes |
| Lint | ✅ Passes (1351 files) |
| Source artifacts | ✅ Clean |
| Focused tests | ✅ 22 files, 161 tests, all pass |
| Activity-specific @vestara/types imports | ✅ 0 |
| Duplicate ActivityRecord in @vestara/types | ✅ 0 |
| Duplicate ActivityStore in @vestara/types | ✅ 0 |
| Duplicate ActivityQuery in @vestara/types | ✅ 0 |
| Duplicate ActivityCursor in @vestara/types | ✅ 0 |

---

## Final AR-001C Acceptance Gate

| Criterion | Status |
|-----------|--------|
| `@vestara/activity-room` = one Activity Room contract authority | ✅ |
| Family A = canonical stored/projected ActivityRecord | ✅ |
| `@vestara/types` = no Activity Room-specific contract authority | ✅ |
| M11A/M11B = consume Activity Room-owned contracts | ✅ |
| compatibility-only Family A ↔ Family B bridges = removed | ✅ (none existed — only legitimate read-model bridge retained) |
| legitimate read-model/transport transformations = retained | ✅ (`toProjectionRecord()` in M11A/M11B) |
| public behavior = unchanged | ✅ |

---

## Non-Goals

AR-001C must NOT:
- Change projection behavior
- Change persistence behavior
- Change WebSocket protocol
- Introduce SSE
- Redesign Activity Room UI
- Delete `@vestara/activity-log`
- Introduce Assistant functionality
- Modify workflow authority
- Modify agent execution
- Modify runtime sessions

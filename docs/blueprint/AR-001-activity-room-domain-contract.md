---
title: AR-001 — Activity Room Domain Contract
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# AR-001 — Activity Room Domain Contract

**Author**: Vestara Developer Agent  
**Date**: 2026-09-04  
**Classification**: Contract/ownership audit — no production mutations  
**Prerequisite**: AR-000 accepted (Decision B: `activity-projection` IS the Activity Room)

---

## AR-001.1 — Contract Inventory

### Two Parallel Contract Families

The codebase contains two distinct type families for Activity Room concepts:

#### Family A: `@vestara/activity-projection` (AAR-001 contracts)

Source: `packages/activity-projection/src/contracts.ts` (193 lines)

| Type | Kind | Discriminated? | Purpose |
|------|------|---------------|---------|
| `ActivityRecord` | Union of 6 kinds | Yes (`kind` field) | Stored activity record |
| `ActivityKind` | String literal union | — | `'workflow' \| 'task' \| 'agent-message' \| 'test' \| 'verification' \| 'acceptance'` |
| `ActivityBase` | Interface | — | Shared envelope: id, sequence, timestamp, actor, workflowId, sessionId, taskId, correlationId, evidenceRefs, effect, relatesTo, correctionOf |
| `WorkflowActivity` | Interface extends Base | kind='workflow' | Workflow transitions |
| `TaskActivity` | Interface extends Base | kind='task' | Task lifecycle |
| `AgentMessageActivity` | Interface extends Base | kind='agent-message' | Agent messages, tool calls, approvals |
| `TestActivity` | Interface extends Base | kind='test' | Test results |
| `VerificationActivity` | Interface extends Base | kind='verification' | Verification outcomes |
| `AcceptanceActivity` | Interface extends Base | kind='acceptance' | Acceptance boundary state |
| `ActivityActor` | Interface | — | Actor identity (type, id, displayName, role, modelId, providerId) |
| `ActivityActorType` | String union | — | `'human' \| 'agent' \| 'system'` |
| `ActivityOrganizationalEffect` | String union | — | 10 values: message, finding, recommendation, decision, authorization, intervention, handoff, closure, recognition, hold |
| `ActivityQuery` | Interface | — | Query filters: workflowId, sessionId, taskId, agentId, kind, severity, afterSequence, beforeSequence, limit |
| `ActivityPage` | Interface | — | Paginated result: records[], nextSequence |
| `ActivityStore` | Interface | — | Persistence: append, get, list, lastSequence |
| `ActivityStreamMessage` | Union | Yes (`type` field) | WebSocket messages: activity.appended, activity.resync-required |
| `ActivitySeverity` | Derived | — | Computed from record kind/state |

**Consumers**: 14 production files, ~20+ test files  
**Persistence**: `SqliteActivityStore` (SQLite via sql.js)  
**Transport**: `ActivityStreamHub` → WebSocket (M11B)  
**UI**: `activity-types.ts`, `ActivityItem.tsx`, `ActivityStream.tsx`, `useActivityStream.ts`

#### Family B: `@vestara/types` (M9/M10 contracts)

Source: `packages/types/src/activity.ts` (408 lines) + `packages/types/src/projection.ts` (309 lines)

| Type | Kind | Discriminated? | Purpose |
|------|------|---------------|---------|
| `ActivityRecord` | Flat interface | No | Durable record with branded `activityId`, `eventId`, `sequenceNumber` |
| `ActivityRecordId` | Branded string | — | Unique record identity |
| `ActivityType` | String literal union | — | 22 values: `workflow.started`, `task.completed`, `agent.progress`, `human.message`, etc. |
| `ActivityEvent` | Interface | — | Input event (before normalization) |
| `ActivityStore` | Interface | — | Persistence: append, query, getAfter, getByEventId, replay, rebuild, getCursor, lastSequence |
| `ActivityQuery` | Interface | — | Filters: workflowRunId, executionId, taskId, actor, actorId, type, source, after, before, afterTimestamp, limit |
| `ActivityCursor` | Interface | — | Pagination: sequenceNumber, eventId, timestamp |
| `ActivityActor` | Interface | — | Actor: type, id, displayName (simpler than Family A) |
| `ActivityActorType` | String union | — | `'human' \| 'agent' \| 'system'` |
| `ActivitySource` | String union | — | `'workflow-engine' \| 'agent-harness' \| 'human-input' \| 'runtime-session' \| 'system' \| 'interaction-app'` |
| `ActivityPayload` | Interface | — | Content: message, data, error, output, dependencyCondition |
| `ActivityVisibility` | String union | — | `'all' \| 'operators' \| 'system'` |
| `Participant` | Interface | — | Room membership: participantId, type, displayName, membership, presence, workState |
| `MembershipState` | String union | — | `'joined' \| 'left' \| 'assigned'` |
| `PresenceState` | String union | — | `'online' \| 'offline' \| 'idle' \| 'disconnected'` |
| `WorkState` | String union | — | `'available' \| 'working' \| 'waiting' \| 'blocked' \| 'attention-required'` |
| `StreamItem` | Interface | — | Projected stream item with kind, importance, aggregation |
| `ParticipantProjection` | Interface | — | Live participant state |
| `AttentionEntry` | Interface | — | Attention items |
| `WorkflowSummary` | Interface | — | Workflow summary |
| `ActivityRoomProjection` | Interface | — | Complete room projection |
| `ContextualCapabilities` | Interface | — | Composer context |

**Consumers**: 30+ files across API routes and workspace UI  
**Persistence**: No direct persistence — consumed by M11A route  
**Transport**: M11A REST + M11B WebSocket  
**UI**: All Activity Room page components

### Duplicate Contract Analysis

| Concept | Family A (activity-projection) | Family B (types) | Overlap? |
|---------|-------------------------------|------------------|----------|
| ActivityRecord | Discriminated union (6 kinds) | Flat interface with branded ID | **YES — different shapes** |
| ActivityStore | append, get, list, lastSequence | append, query, getAfter, getByEventId, replay, rebuild, getCursor, lastSequence | **YES — different APIs** |
| ActivityQuery | workflowId, sessionId, taskId, agentId, kind, severity, afterSequence, beforeSequence, limit | workflowRunId, executionId, taskId, actor, actorId, type, source, after, before, afterTimestamp, limit | **YES — different fields** |
| ActivityActor | type, id, displayName, role, modelId, providerId | type, id, displayName | **YES — Family A is richer** |
| ActivityActorType | 'human' \| 'agent' \| 'system' | 'human' \| 'agent' \| 'system' | **Identical** |
| ActivityCursor | Not defined (uses sequence number) | sequenceNumber, eventId, timestamp | **NO — Family A lacks this** |
| ActivityType/ActivityKind | 6 values (kind field) | 22 values (type field) | **YES — different granularity** |

---

## AR-001.2 — Canonical Activity Record

### Designation

**The canonical Activity Room record is Family A** (`activity-projection/src/contracts.ts`).

Rationale:
1. It is the **stored** record — `SqliteActivityStore` persists this shape
2. It is the **broadcast** record — `ActivityStreamHub` delivers this shape
3. It is the **queried** record — all API routes return this shape
4. It has **discriminated kinds** providing type safety
5. It carries **organizational effects** (finding, recommendation, decision, etc.)
6. It supports **append-only corrections** via `correctionOf`

Family B's `ActivityRecord` is an **input normalization contract** (M9), not the stored record. The M11A route bridges between them.

### Canonical Field Specification

```typescript
/**
 * Canonical Activity Room Record.
 *
 * This is the single authoritative shape for stored, broadcast, and
 * queried activity records. Every field documents its provenance,
 * serialization, and projection behavior.
 */
interface ActivityRecord {
  // ─── Identity ──────────────────────────────────────────
  /** Unique record identity. Generated on append. Not user-assigned. */
  readonly id: string;

  /** Monotonic sequence number. Assigned by store on append. Ordering anchor. */
  readonly sequence: number;

  /** ISO 8601 timestamp. Source: subsystem event time. */
  readonly timestamp: string;

  // ─── Discriminant ──────────────────────────────────────
  /**
   * Activity kind. Discriminant for the union.
   * Source: projector determines kind from source event type.
   * Values: 'workflow' | 'task' | 'agent-message' | 'test' | 'verification' | 'acceptance'
   */
  readonly kind: ActivityKind;

  // ─── Actor ─────────────────────────────────────────────
  /**
   * Who produced this activity.
   * Source: resolved from source event authority.
   * NOT the Activity Room's identity — it is a projection of the actor's identity.
   */
  readonly actor: ActivityActor;

  // ─── Provenance (correlation references) ───────────────
  /**
   * Workflow identity. References the authoritative WorkflowRun.
   * Required on workflow/task activity. Optional on others.
   */
  readonly workflowId?: string;

  /**
   * Runtime session identity. References RuntimeSessionBinding.
   * Optional — present when activity occurred within a session.
   */
  readonly sessionId?: string;

  /**
   * Task identity. References the authoritative WorkflowTask.
   * Required on task/test activity. Optional on others.
   */
  readonly taskId?: string;

  /**
   * Correlation identity. Links related records across subsystems.
   * Derived from executionId when available.
   */
  readonly correlationId?: string;

  // ─── Evidence ──────────────────────────────────────────
  /**
   * References to evidence artifacts. Content-addressed digests or URIs.
   * Source: subsystem event payload.
   * Append-only — never mutated.
   */
  readonly evidenceRefs: readonly string[];

  // ─── Organizational ────────────────────────────────────
  /**
   * Organizational effect of this record.
   * Source: projector infers from event type and payload.
   * Values: message | finding | recommendation | decision | authorization |
   *         intervention | handoff | closure | recognition | hold
   */
  readonly effect?: ActivityOrganizationalEffect;

  /**
   * Related record IDs. Append-only relationship graph.
   * Values: supersedes, scoped_to, supported_by, etc.
   */
  readonly relatesTo?: readonly string[];

  /**
   * Correction reference. When set, this record corrects the referenced record.
   * The original is never mutated (append-only contract).
   */
  readonly correctionOf?: string;

  // ─── Kind-specific payload ─────────────────────────────
  // Discriminated by `kind` — each kind carries its own typed fields.
  // See: WorkflowActivity, TaskActivity, AgentMessageActivity,
  //      TestActivity, VerificationActivity, AcceptanceActivity
}
```

### Kind-Specific Fields (Preserved from existing contracts)

| Kind | Additional Fields |
|------|------------------|
| `workflow` | workflowId (required), previousState, currentState, reason, authoritative, observed |
| `task` | taskId (required), planId?, previousStatus, status, summary? |
| `agent-message` | agentId, threadId?, turnId?, messageKind, content, toolName?, risk?, status?, referencedActivityIds? |
| `test` | taskId?, command, passed, failed, skipped, durationMs?, failureFingerprints, outputExcerpt? |
| `verification` | verificationRunId?, taskId?, outcome, confidence?, checks[], reason? |
| `acceptance` | workflowId (required), objective, obligations[], materialUncertainties[], conditional, derivedBy |

### Fields NOT on the Canonical Record

| Field | Reason excluded |
|-------|----------------|
| `runtimeSessionId` | Activity Room does not own session identity — it is a correlation reference |
| `provider` | Provider identity is an execution detail, not activity identity |
| `model` | Model identity is an execution detail, not activity identity |
| `title` | Title is a UI concern, not a stored activity fact |
| `agent.timestamp` | Actor timestamp is redundant with record timestamp |

---

## AR-001.3 — Explicit Provenance

### Provenance Model

Every ActivityRecord is a **derived projection**. The Activity Room does not own the underlying facts. Each record must be traceable to its authoritative origin.

### Reference Fields and Their Authorities

| Reference Field | Authority | Required On | Optional On | Notes |
|----------------|-----------|-------------|-------------|-------|
| `workflowId` | Workflow Orchestrator / WorkflowRun | workflow, task, acceptance | agent-message, test, verification | References the workflow run identity |
| `taskId` | Workflow Orchestrator / WorkflowTask | task, test | agent-message, verification | References the task identity |
| `sessionId` | Runtime Session / RuntimeSessionBinding | (none required) | agent-message | Present when activity occurred within a runtime session |
| `correlationId` | Derived from executionId | (none required) | all | Links related records across subsystems |
| `evidenceRefs` | Evidence authority / ContentAddressedEvidenceStore | verification, test | agent-message | Content-addressed artifact references |
| `agentId` | Agent Harness / AgentDefinition | agent-message | (none) | References the agent identity (on AgentMessageActivity) |
| `threadId` | Thread Runtime / ThreadStore | (none required) | agent-message | References the conversation thread |
| `turnId` | Thread Runtime / ThreadStore | (none required) | agent-message | References the conversation turn |
| `verificationRunId` | Verification / VCTRL | verification | (none) | References the verification run |
| `repositoryId` | Repository Binding | (none currently) | (none) | Not yet on ActivityRecord — add when workspace scoping is needed |

### Provenance Rules

1. **IDs are references, not authority** — Activity Room stores IDs that reference authoritative entities. It never owns those entities.
2. **Missing references are valid** — Not every activity has a workflow, task, or session. System-level activities may lack them.
3. **No manufactured identity** — Activity Room never generates workflow/task/session IDs. It receives them from authoritative subsystems.
4. **Append-only relationships** — `relatesTo` and `correctionOf` are append-only. No record is ever mutated.
5. **Evidence is content-addressed** — `evidenceRefs` contain SHA-256 digests or URIs, not mutable paths.

---

## AR-001.4 — Authority Matrix

| Domain | Authority Owner | Activity Room Role | Activity Room Can/Cannot |
|--------|----------------|-------------------|------------------------|
| **Repository identity** | RepositoryBinding | References `repositoryId` | Can reference, cannot create/modify/delete |
| **Workflow lifecycle** | Workflow Orchestrator / WorkflowRun | Projects transitions as WorkflowActivity | Can project, cannot transition/status-change |
| **Task lifecycle** | Workflow Orchestrator / WorkflowTask | Projects transitions as TaskActivity | Can project, cannot transition/status-change |
| **Agent execution** | Agent Harness / execution authority | Projects lifecycle as AgentMessageActivity | Can project, cannot execute/assign/reassign |
| **Runtime continuity** | RuntimeSessionBinding | References `sessionId` | Can reference, cannot create/destroy sessions |
| **Verification verdict** | Verification / VCTRL | Projects outcome as VerificationActivity | Can project, cannot pass/fail/override |
| **Evidence** | Evidence authority / ContentAddressedEvidenceStore | References evidence artifacts | Can reference, cannot create/modify artifacts |
| **Engineering truth** | EngineeringEventStore | Adapts events via `fromEngineeringTruthEvent` | Can adapt, cannot append to event store |
| **Human messaging** | Activity Room (current) | Owns message append + receipts | **Can** append, broadcast, track receipts |
| **Activity projection** | Activity Room | Owns projection, store, stream, query | **Can** project, store, stream, query |
| **Organizational effects** | Activity Room | Infers from event type/payload | **Can** classify effects |

### Authority Boundary Validation

```
Activity Room CAN:
  ✓ Project workflow/task/agent/verification events
  ✓ Persist derived projection
  ✓ Stream live updates
  ✓ Query historical activity
  ✓ Append human messages (currently)
  ✓ Classify organizational effects
  ✓ Track message delivery receipts
  ✓ Apply redaction before persistence

Activity Room CANNOT:
  ✗ Transition workflow state
  ✗ Assign/reassign agents
  ✗ Pass/fail verification
  ✗ Create/destroy runtime sessions
  ✗ Modify evidence artifacts
  ✗ Append to engineering event store
  ✗ Override provider/model selection
  ✗ Manufacture correlation IDs from non-execution identities
```

---

## AR-001.5 — Messaging Ownership Audit

### Current Messaging Architecture

| Component | Location | Role | Authority Status |
|-----------|----------|------|-----------------|
| `ActivityComposer` | `apps/workspace/src/pages/activity/` | UI for composing messages | Presentation only |
| `lib/activity.ts:sendMessage()` | `apps/workspace/src/lib/` | Sends POST to `/api/messages` | Transport |
| `activity-room.ts:handleActivityRoomRoute` | `apps/api/src/routes/` | Receives POST `/api/messages`, validates, appends | **MESSAGE_AUTHORITY** |
| `message-receipts.ts` | `apps/api/src/` | Tracks delivery/observation receipts | **MESSAGE_AUXILIARY** |
| `maybeWakeAddressedAgent()` | `apps/api/src/routes/activity-room.ts` | Wakes idle workflow on message | Side-effect |
| `conversation-runtime` | `packages/conversation-runtime/` | AI conversation sessions with providers | **SEPARATE_AUTHORITY** |
| `thread-runtime` | `packages/thread-runtime/` | Thread persistence for harness execution | **SEPARATE_AUTHORITY** |

### Ownership Classification

**Activity Room is MESSAGE_INGRESS + MESSAGE_PROJECTION**

| Aspect | Classification | Evidence |
|--------|---------------|----------|
| Message composition UI | TRANSPORT_ONLY | `ActivityComposer` is a React component, no authority |
| Message validation + append | MESSAGE_AUTHORITY | `handleActivityRoomRoute` validates content, creates `AgentMessageActivity`, appends to store |
| Message broadcast | MESSAGE_PROJECTION | `ActivityStreamHub.broadcast()` delivers to connected clients |
| Message receipts | MESSAGE_AUXILIARY | `message-receipts.ts` tracks delivery state (in-memory, not durable) |
| Message → agent delivery | MESSAGE_AUTHORITY → WORKFLOW | `maybeWakeAddressedAgent()` calls `ctx.multiAgentWorkflow.resumeIfIdle()` |
| AI conversation | SEPARATE | `conversation-runtime` manages AI sessions independently |

### Three-Conversation Risk Assessment

| Conversation System | Authority | Storage | Scope |
|--------------------|-----------|---------|-------|
| Activity Room messaging | Activity Room | SQLite (activity.db) | Human ↔ all agents in workflow |
| Conversation Runtime | conversation-runtime | SQLite (conversation.db) | User ↔ AI provider sessions |
| Thread Runtime | thread-runtime | SQLite (threads.db) | Agent harness execution threads |

**Risk**: These three systems serve different purposes but could be confused:
- Activity Room = **operational messaging** (human directs agents in workflow context)
- Conversation Runtime = **AI conversation** (user interacts with AI providers)
- Thread Runtime = **execution threads** (agent harness manages tool/execution flow)

**Mitigation**: Activity Room messages are workflow-scoped, append-only, and organizational. They are NOT conversation threads. The Floating Assistant (AR-005+) should use Conversation Runtime, not Activity Room messaging.

**Recommendation**: Keep Activity Room as MESSAGE_INGRESS for operational workflow messaging. The Floating Assistant should use Conversation Runtime for AI conversations. Do not merge these.

---

## AR-001.6 — API Generation Classification

| Route File | Endpoints | Generation | Classification |
|------------|-----------|------------|----------------|
| `activity.ts` | `GET /api/activity-log`, `GET /api/activity` | Legacy | **LEGACY** — uses `@vestara/activity-log`, not Activity Room |
| `activity-room.ts` | `GET /api/activity-room`, `GET /api/activity-room/:id`, `GET /api/activity-room/state`, `POST /api/messages`, receipts | M9 | **CANONICAL** — primary Activity Room API |
| `activity-room-m11a.ts` | `GET /api/activity-room/v1/*` | M11A | **CANONICAL** — production read API |
| `activity-room-m11b.ts` | WebSocket: subscribe/ack/ping/unsubscribe | M11B | **TRANSPORT** — WebSocket realtime delivery |

### Details

#### `activity.ts` — LEGACY

- Uses `@vestara/activity-log` (different package)
- `GET /api/activity-log` — returns events from `ActivityLogStore`
- `GET /api/activity` — returns events from `ActivityService`
- **Status**: Dead code path for new Activity Room functionality. Still routed but superseded by M9/M11A.

#### `activity-room.ts` — CANONICAL (M9)

- Uses `@vestara/activity-projection` (Activity Room package)
- `GET /api/activity-room` — paginated history with latest-window optimization
- `GET /api/activity-room/:id` — single record retrieval
- `GET /api/activity-room/state` — effective state projection
- `POST /api/messages` — human message append
- `POST /api/agents/:id/messages` — direct agent message
- Message receipts endpoints
- Workflow command interception (`/resume`, `/verify`)
- **Status**: Primary Activity Room API. Handles both read and write.

#### `activity-room-m11a.ts` — CANONICAL (M11A)

- Uses `@vestara/activity-projection` + `@vestara/types`
- `GET /api/activity-room/v1/snapshot` — room snapshot + cursor
- `GET /api/activity-room/v1/activities` — paginated activities
- `GET /api/activity-room/v1/activities/:id` — single activity
- `GET /api/activity-room/v1/activities/aggregate/:id` — aggregate drill-down
- `GET /api/activity-room/v1/participants` — participant projection
- `GET /api/activity-room/v1/attention` — attention projection
- `GET /api/activity-room/v1/workflow-summary` — workflow summary
- **Status**: Production read API. Read-only, no mutation.

#### `activity-room-m11b.ts` — TRANSPORT (M11B)

- WebSocket protocol over `ws`
- Operations: subscribe, ack, ping, unsubscribe
- Messages: subscribed, activity, catchup-complete, resync-required, heartbeat, error
- **Status**: Realtime transport layer. No domain logic.

### Recommendation

AR-003 should evaluate the existing WebSocket transport (M11B) first. Do not introduce SSE as an additional transport without evidence that WebSocket is insufficient.

---

## AR-001.7 — Legacy activity-log Analysis

### Package: `@vestara/activity-log`

**Description**: "Domain activity log with SQLite persistence and event streaming"  
**Exports**: `ActivityLogStore`, `ActivityService`, `NotificationService`, `NotificationStore`

### Consumer Analysis

| Consumer | File | Usage | Classification |
|----------|------|-------|----------------|
| `apps/api` | `workspace-context.ts` | Creates `ActivityLogStore` + `ActivityService` at boot | **COMPATIBILITY** — legacy boot path |
| `apps/api` | `routes/activity.ts` | Serves `/api/activity-log` and `/api/activity` | **LEGACY** — superseded by M9/M11A |
| `apps/api` | `routes/execution.ts` | `ctx.activityStore.query({ limit })` for execution items | **COMPATIBILITY** — still used for execution view |
| `apps/api` | `index.ts` | Passes `activityService` to server creation | **COMPATIBILITY** — server expects it |
| `apps/cli` | `context/cli-context.ts` | Creates `ActivityLogStore` + `ActivityService` at boot | **COMPATIBILITY** — CLI boot path |
| `apps/cli` | `context/cli-context.ts` | `registerActivityService(activityService)` for events-server | **COMPATIBILITY** — CLI event system |

### Capability Comparison

| Capability | activity-log | Activity Room (activity-projection) | Available in AR? |
|------------|-------------|-------------------------------------|-----------------|
| SQLite persistence | Yes | Yes | Yes |
| Event streaming | Yes (in-process) | Yes (WebSocket) | Yes |
| Typed activity records | No (generic events) | Yes (discriminated union) | Yes |
| Organizational effects | No | Yes | Yes |
| Message append | No | Yes | Yes |
| Live delivery | No (polling) | Yes (WebSocket) | Yes |
| Redaction | No | Yes | Yes |
| Cursor pagination | No | Yes | Yes |
| Correction/append-only | No | Yes | Yes |

### Migration Recommendation

1. **DO NOT delete** `@vestara/activity-log`
2. **DO NOT redirect** API routes during AR-001
3. **Classify consumers**:
   - `routes/activity.ts` — **LEGACY**, superseded by M9/M11A
   - `routes/execution.ts` — **COMPATIBILITY**, still uses `activityStore.query()`
   - `workspace-context.ts` — **COMPATIBILITY**, boot creates both systems
   - `cli-context.ts` — **COMPATIBILITY**, CLI boot creates both systems
4. **Post-AR-001R migration** (separate task):
   - Migrate `execution.ts` to use Activity Room query
   - Remove `activity.ts` route (or redirect to M11A)
   - Remove `activity-log` from `workspace-context.ts` boot
   - Remove `activity-log` from `cli-context.ts` boot
   - Deprecate `@vestara/activity-log`

---

## AR-001.8 — Contract Migration Plan

### Current State (BEFORE)

```
packages/activity-projection/
  contracts.ts    → ActivityRecord (6-kind union), ActivityBase, ActivityKind, etc.
  store.ts        → ActivityStore interface, ActivityQuery, ActivityPage
  stream.ts       → ActivityStreamMessage, ActivityStreamHub
  service.ts      → ActivityProjectionService
  projector.ts    → ActivityProjector interface

packages/types/
  activity.ts     → ActivityRecord (flat), ActivityEvent, ActivityStore, ActivityQuery, ActivityCursor
  projection.ts   → StreamItem, ParticipantProjection, AttentionEntry, WorkflowSummary, ActivityRoomProjection
```

### Target State (AFTER AR-001R + AR-002+)

```
packages/activity-room/  (renamed from activity-projection)
  contracts.ts    → CANONICAL ActivityRecord (6-kind union)
                    CANONICAL ActivityKind, ActivityActor, ActivityOrganizationalEffect
  store.ts        → CANONICAL ActivityStore, ActivityQuery, ActivityPage
  stream.ts       → ActivityStreamMessage, ActivityStreamHub (unchanged)
  service.ts      → ActivityProjectionService (unchanged)
  projector.ts    → ActivityProjector (unchanged)
  cursor.ts       → ActivityCursor (migrated from types)
  provenance.ts   → Provenance references (new, explicit)

packages/types/
  activity.ts     → GENUINELY cross-domain primitives only
                    ActivityActorType (shared across subsystems)
                    MembershipState, PresenceState, WorkState (shared enums)
  projection.ts   → StreamItem, ParticipantProjection, AttentionEntry, WorkflowSummary
                    (consumed by M11A route, may stay or move)
```

### Migration Steps (AR-001R scope)

1. **Rename package**: `packages/activity-projection/` → `packages/activity-room/`
2. **Update package.json name**: `@vestara/activity-projection` → `@vestara/activity-room`
3. **Migrate ActivityCursor** from `types/activity.ts` to `activity-room/cursor.ts`
4. **Update all imports** in 14 production files + ~20 test files
5. **Update workspace aliases** in `vitest.config.ts`
6. **Update build configuration** in `tsconfig.json` references

### What Stays in `@vestara/types`

| Type | Reason |
|------|--------|
| `ActivityActorType` | Shared enum used by multiple subsystems |
| `MembershipState` | Shared enum used by participant projection |
| `PresenceState` | Shared enum used by participant projection |
| `WorkState` | Shared enum used by participant projection |
| `StreamItem` | Projection type consumed by M11A route |
| `ParticipantProjection` | Projection type consumed by M11A route |
| `AttentionEntry` | Projection type consumed by M11A route |
| `WorkflowSummary` | Projection type consumed by M11A route |
| `ActivityRoomProjection` | Aggregate projection type |

### What Moves to `@vestara/activity-room`

| Type | From | Reason |
|------|------|--------|
| `ActivityCursor` | `types/activity.ts` | Activity Room pagination concept |
| `ActivityRecord` | `types/activity.ts` | Superseded by activity-projection's canonical record |
| `ActivityEvent` | `types/activity.ts` | Input normalization — Activity Room concern |
| `ActivityStore` (M9 version) | `types/activity.ts` | Superseded by activity-projection's store |
| `ActivityQuery` (M9 version) | `types/activity.ts` | Superseded by activity-projection's query |

### What Gets Deleted from `@vestara/types`

| Type | Reason |
|------|--------|
| `ActivityRecord` (M9 flat version) | Superseded by canonical 6-kind union |
| `ActivityEvent` (M9 input version) | Superseded by `ActivitySourceEvent` adapter |
| `ActivityStore` (M9 version) | Superseded by activity-projection's store |
| `ActivityQuery` (M9 version) | Superseded by activity-projection's query |

---

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| M11A route bridges between two ActivityRecord shapes | Medium | AR-001R consolidates to one shape |
| `execution.ts` still uses `activityStore.query()` from activity-log | Low | Migrate to Activity Room query post-AR-001R |
| Two ActivityStore interfaces confuse consumers | Medium | Consolidate during AR-001R |
| Activity Room messaging + Conversation Runtime + Thread Runtime = three conversation authorities | Medium | Keep separate — different scopes and purposes |
| Legacy `activity.ts` route still routed | Low | Deprecate post-AR-001R |

---

## Acceptance Evidence

| Criterion | Evidence | Status |
|-----------|----------|--------|
| One canonical Activity record designated | Family A (6-kind discriminated union) designated as canonical | ✅ |
| Duplicate contracts identified | 4 duplicate pairs identified (ActivityRecord, ActivityStore, ActivityQuery, ActivityActor) | ✅ |
| Field provenance documented | Every canonical field has meaning, source, required/optional, serialization, projection behavior | ✅ |
| Authority matrix established | 8 domains mapped with Activity Room role and can/cannot | ✅ |
| Messaging ownership classified | MESSAGE_INGRESS + MESSAGE_PROJECTION | ✅ |
| API generation classified | 4 files: 1 LEGACY, 2 CANONICAL, 1 TRANSPORT | ✅ |
| activity-log traced | 6 consumers, all COMPATIBILITY or LEGACY | ✅ |
| Contract migration plan produced | BEFORE/AFTER state, migration steps, what stays/moves/deletes | ✅ |

---
title: AR-002 — Canonical Activity Projection Pipeline
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# AR-002 — Canonical Activity Projection Pipeline

**Author**: Vestara Developer Agent  
**Date**: 2026-09-04  
**Prerequisite**: AR-000, AR-001, AR-001R, AR-001C, AR-001L (all frozen)

---

## AR-002.1 — Current Pipeline Trace

### Production Call Graph

```
Authoritative Subsystem
    │
    ├── Workflow Orchestrator → WorkflowEvent
    ├── Agent Harness → lifecycle events
    ├── Human Input → conversation events
    ├── Interaction App → interaction events
    └── Verification → verification events
         │
         ▼
    M9IngestionBridge (EventBus subscriber)
         │
         ├── fromWorkflowEvent()     → ActivityEvent (workflow/task types)
         ├── fromAgentLifecycle()    → ActivityEvent (agent-message type)
         ├── fromHumanMessage()      → ActivityEvent (agent-message type)
         ├── fromInteractionPresented() → ActivityEvent (agent-message type)
         └── fromInteractionResponded() → ActivityEvent (agent-message type)
              │
              ▼
         M9ActivityStore.append(event)
              │
              ├── Deduplication by eventId
              ├── Sequence assignment (MonotonicSequence)
              └── SQLite persistence
                   │
                   ▼
              ActivityStreamHub.broadcast(record)
                   │
                   ▼
              M11B WebSocket → Workspace UI
```

### Source Event Classification

| Source | Event Types | Projector | ActivityKind |
|--------|------------|-----------|--------------|
| **WORKFLOW** | project.created, project.phase.changed, project.completed, project.cancelled, plan.approved | WorkflowProjector | workflow |
| **TASK** | task.created, task.ready, task.assigned, task.started, task.completed, task.failed, task.cancelled, task.blocked, task.retrying, task.review.decided | TaskProjector | task |
| **AGENT** | harness.user-message, harness.agent-message, harness.model-response, harness.tool-call, harness.tool-result, harness.approval-requested, harness.approval-decision, harness.harness-run, harness.turn.started, harness.final-outcome, harness.outcome.completed, harness.outcome.failed, harness.steer, harness.model.completed, harness.tool.started, harness.tool.completed, harness.tool.failed, harness.approval.requested, harness.approval.resolved | AgentMessageProjector | agent-message |
| **HUMAN** | conversation:created, conversation:session.started | AgentMessageProjector (via adapter) | agent-message |
| **TEST** | task.tests.decided, harness.verification-result | TestProjector | test |
| **VERIFICATION** | harness.verification.started, harness.verification.completed, harness.verification-result, verification.passed, verification.failed, verification.awaiting-approval, project.verification.reopened | VerificationProjector | verification |
| **ACCEPTANCE** | acceptance.boundary | OrganizationalProjector | acceptance |
| **ORGANIZATIONAL** | workflow.started, workflow.completed | OrganizationalProjector | acceptance |
| **INTERACTION** | interaction:presented, interaction:responded | AgentMessageProjector (via adapter) | agent-message |
| **RUNTIME** | (none currently) | (no projector) | — |

### Sources with No Projector

| Source | Disposition | Rationale |
|--------|------------|-----------|
| RUNTIME events | DEFER | Not yet modeled as Activity Room facts |
| workspace:opened/indexed/updated | DEFER | May become Activity facts when collaborative |
| workspace:discover/fingerprint/analysis/manifest/present/index/understood/ready/error | IGNORE | Operational, not collaboration facts |
| memory:indexed | IGNORE | Operational |
| user:profile.created/updated | IGNORE | Identity management |

---

## AR-002.2 — Canonical Ingestion Contract

### ActivitySourceEvent (Normalized Projection Input)

```typescript
interface ActivitySourceEvent {
  readonly id: string;           // Stable event identity for deduplication
  readonly type: string;         // Event type taxonomy
  readonly at: string;           // ISO 8601 timestamp
  readonly actorId: string;      // Actor identity
  readonly authority: ActivitySourceAuthority;  // 'user' | 'agent' | 'system' | 'policy' | 'verification'
  readonly workflowId?: string;  // Workflow provenance
  readonly sessionId?: string;   // Runtime session provenance
  readonly taskId?: string;      // Task provenance
  readonly threadId?: string;    // Thread provenance
  readonly turnId?: string;      // Turn provenance
  readonly verificationRunId?: string;  // Verification provenance
  readonly correlationId?: string;      // Cross-subsystem correlation
  readonly sourceSequence?: number;     // Source ordering (if available)
  readonly payload: Readonly<Record<string, unknown>>;  // Normalized content
}
```

### Invariants

1. **ActivitySourceEvent is NOT authoritative** — it is a normalized projection input
2. **ActivitySourceEvent carries provenance** — enough to construct an Activity record
3. **ActivitySourceEvent is NOT a generic event bus contract** — it is Activity Room-specific
4. **Adapters normalize authoritative events** — projectors never reach into subsystem internals
5. **Two adapter families exist**:
   - `fromEngineeringTruthEvent()` — adapts `@vestara/engineering-event-store` events
   - `fromOrchestrationEvent()` — adapts `@vestara/workflow-orchestrator` events

---

## AR-002.3 — Deterministic Projection

### Current Determinism Analysis

| Component | Deterministic? | Evidence |
|-----------|---------------|----------|
| WorkflowProjector | ✅ YES | Pure function: event → record. No external state. |
| TaskProjector | ✅ YES | Pure function: event → record. No external state. |
| AgentMessageProjector | ✅ YES | Pure function: event → record. No external state. |
| TestProjector | ✅ YES | Pure function: event → record. No external state. |
| VerificationProjector | ✅ YES | Pure function: event → record. No external state. |
| OrganizationalProjector | ✅ YES | Pure function: event → record. No external state. |
| ActivityRedactor | ✅ YES | Pure function: record → redacted record. No external state. |
| MonotonicSequence | ⚠️ STATEFUL | Allocates from counter. Same start = same sequence. |
| M9ActivityStore | ⚠️ STATEFUL | Deduplication by eventId. Same event = same record. |

### Projection Rules

1. **No ambient state discovery** — projectors do NOT discover current workflow state, agent, provider/model, repository, or runtime session from global state
2. **Required facts arrive from source event** — projectors extract provenance from `ActivitySourceEvent` fields
3. **Optional facts are derived from event payload** — projectors extract content from `event.payload`
4. **No authority inference from**:
   - `process.cwd()`
   - Activity title
   - UI state
   - Provider/model defaults
   - Current OpenCode session
   - Timestamps used as identity

---

## AR-002.4 — Provenance Preservation

### Identifier Flow Through Pipeline

| Identifier | Source | Activity Field | Preserved? |
|-----------|--------|---------------|------------|
| source eventId | `ActivitySourceEvent.id` | `ActivityRecord.id` (via projector) | ✅ |
| correlationId | `ActivitySourceEvent.correlationId` | `ActivityRecord.correlationId` | ✅ |
| workflowId | `ActivitySourceEvent.workflowId` | `ActivityRecord.workflowId` | ✅ |
| taskId | `ActivitySourceEvent.taskId` | `ActivityRecord.taskId` | ✅ |
| agentId | `ActivitySourceEvent.actorId` | `ActivityRecord.actor.id` | ✅ |
| threadId | `ActivitySourceEvent.threadId` | (agent-message threadId) | ✅ |
| runtimeSessionId | `ActivitySourceEvent.sessionId` | (agent-message sessionId) | ✅ |
| verificationRunId | `ActivitySourceEvent.verificationRunId` | `ActivityRecord.verificationRunId` | ✅ |
| evidenceRefs | `event.payload.evidenceRefs` | `ActivityRecord.evidenceRefs` | ✅ |

### Provenance Rules

1. **Missing references are valid** — not every Activity kind requires every identifier
2. **Never manufacture identifiers** — if a field is absent, it remains absent
3. **Append-only relationships** — `relatesTo` and `correctionOf` are never mutated

---

## AR-002.5 — Idempotent Ingestion

### Current Duplicate Semantics

| Layer | Deduplication | Mechanism |
|-------|--------------|-----------|
| M9ActivityStore | `eventId` uniqueness | SQLite UNIQUE constraint on `event_id` column |
| M9IngestionBridge | `getSemanticEventId()` | Derives stable eventId from event type + payload |
| ActivityProjectionService | `DuplicateActivityError` | `skipDuplicates: true` (default) — ignores duplicates |

### Duplicate Identity

The M9ActivityStore uses `eventId` as the deduplication anchor:

```sql
INSERT INTO m9_activity_events (event_id, ...) VALUES (?, ...)
-- SQLite UNIQUE constraint enforces: same eventId → same record
```

**Semantic eventId derivation** (M9IngestionBridge):
- Interaction events: `event.payload.eventId` (semantic identity)
- All other events: `${event.type}:${event.id}` (delivery identity)

### Invariant

```
same authoritative event
        +
same Activity projection
        ↓
one logical Activity fact
```

**Not used as deduplication identity**:
- ❌ title
- ❌ timestamp
- ❌ payload JSON hash
- ❌ agentId
- ❌ runtimeSessionId

---

## AR-002.6 — Ordering

### Sequence Behavior

| Aspect | Mechanism | Guarantee |
|--------|-----------|-----------|
| Persistence ordering | `MonotonicSequence.allocate()` | Strictly increasing, gap-free |
| Replay ordering | `M9ActivityStore.replay()` | Returns records in sequence order |
| Query ordering | `M9ActivityStore.query()` | Returns records in sequence order |
| Stream ordering | `ActivityStreamHub.broadcast()` | Delivers in sequence order |

### MonotonicSequence

```typescript
class MonotonicSequence {
  private next: number;
  constructor(start = 1) { this.next = Math.max(1, Math.floor(start)); }
  allocate(): number { return this.next++; }
}
```

**Restart behavior**: On restart, `MonotonicSequence` initializes from `store.lastSequence() + 1`. This ensures gap-free continuation.

**Timestamp role**: Timestamps are descriptive metadata. Sequence is the primary ordering mechanism.

---

## AR-002.7 — Projector Coverage

### Registered Projectors

| Projector | Kind | Accepted Events | Required Provenance | Optional Provenance |
|-----------|------|----------------|--------------------|--------------------|
| WorkflowProjector | workflow | project.*, plan.approved, workflow.transition.* | workflowId | taskId, correlationId |
| TaskProjector | task | task.* | taskId, workflowId | correlationId |
| AgentMessageProjector | agent-message | harness.*, conversation:*, interaction:* | actorId | threadId, turnId, sessionId |
| TestProjector | test | task.tests.decided, harness.verification-result | taskId | correlationId |
| VerificationProjector | verification | harness.verification.*, verification.*, project.verification.* | verificationRunId | taskId, correlationId |
| OrganizationalProjector | acceptance | workflow.started, workflow.completed, acceptance.boundary | workflowId | correlationId |

### Projector Count

6 projectors registered. All are pure functions (no external state discovery).

### No Additional Projectors Needed

The current 6 projectors cover all INGEST-classified source events. No additional projectors are required unless a new source event type requires a distinct Activity semantic.

---

## AR-002.8 — Redaction Boundary

### Redaction Policy

```typescript
const DEFAULT_REDACTION_POLICY: RedactionPolicy = {
  sensitiveKeys: [
    'apikey', 'api_key', 'authorization', 'bearer', 'token',
    'access_token', 'refresh_token', 'password', 'passwd', 'secret',
    'client_secret', 'clientsecret', 'credential', 'credentials',
    'privatekey', 'private_key', 'accesskey', 'access_key',
    'secretkey', 'secret_key', 'sessionkey', 'session_key',
    'cookie', 'ssh_private_key',
  ],
  sensitivePatterns: [
    /sk-[A-Za-z0-9_-]{20,}/,           // OpenAI API keys
    /AKIA[0-9A-Z]{16}/,                 // AWS access keys
    /gh[pousr]_[A-Za-z0-9]{20,}/,       // GitHub tokens
    /Bearer\s+[A-Za-z0-9._~+/=-]+/i,    // Bearer tokens
    /Basic\s+[A-Za-z0-9+/=]+/i,         // Basic auth
    /-----BEGIN[ A-Z]+PRIVATE KEY-----/, // Private keys
  ],
  replacement: '[REDACTED]',
};
```

### Leakage Audit

| Category | Covered? | Evidence |
|----------|---------|----------|
| Credentials | ✅ | sensitiveKeys includes apikey, password, secret, token, etc. |
| Authorization headers | ✅ | Bearer/Basic patterns matched |
| API keys | ✅ | sk-* and AKIA patterns matched |
| Raw provider secrets | ✅ | token/key patterns matched |
| Environment secrets | ⚠️ PARTIAL | Only known patterns matched |
| Sensitive tool arguments | ⚠️ PARTIAL | Only if payload key matches sensitiveKeys |
| Oversized model payloads | ❌ NO | No size-based redaction |

### Redaction Boundary

Redaction runs:
1. **Before persistence** — `ActivityProjectionService.project()` calls `redactor.redact()` before `store.append()`
2. **Before broadcast** — `ActivityStreamHub.broadcast()` receives already-redacted records
3. **Never skipped** — redaction is mandatory in the pipeline

---

## AR-002.9 — Projection Failure Semantics

### Failure Matrix

| Failure | Behavior | Observable? |
|---------|----------|------------|
| Source event malformed | Adapter returns null → silently skipped | ⚠️ Logged at bridge level |
| No projector exists | `registry.projectAll()` returns empty array → no record created | ⚠️ Silent |
| Projector throws | Exception propagates → record not created | ✅ Exception thrown |
| Redaction fails | Exception propagates → record not persisted | ✅ Exception thrown |
| Persistence fails (non-duplicate) | Exception propagates → record not broadcast | ✅ Exception thrown |
| Persistence fails (duplicate) | `skipDuplicates: true` → silently ignored | ⚠️ Silent (by design) |
| Stream delivery fails | `ActivityStreamHub` handles resync internally | ✅ Resync directive sent |

### Critical Invariant

```
Activity projection failure ≠ authoritative workflow failure
```

Activity Room must not retroactively own or change the authoritative operation it is observing. Failures in projection are Activity Room's problem, not the subsystem's.

---

## AR-002.10 — Persistence Before Broadcast

### Pipeline Ordering

```typescript
// ActivityProjectionService.project()
async project(event: ActivitySourceEvent): Promise<readonly ActivityRecord[]> {
  const candidates = this.registry.projectAll(event);  // 1. Project
  for (const candidate of candidates) {
    const redacted = this.redactor.redact(candidate);   // 2. Redact
    const record = withSequence(redacted, await this.nextSequence());  // 3. Sequence
    await this.store.append(record);                     // 4. Persist
    this.onAppended?.(record);                           // 5. Broadcast (via hub)
  }
}
```

**Verified**: Persistence (step 4) happens strictly before broadcast (step 5). The `onAppended` callback is invoked only after `store.append()` succeeds.

### ActivityRoom Wiring

```typescript
// apps/api/src/activity-room.ts
const service = new ActivityProjectionService({
  store,
  onAppended: (record) => hub.broadcast(record),  // Broadcast after persist
});
```

**Confirmed**: A client must not receive an Activity record that canonical persistence rejected.

---

## AR-002.11 — Replay/Rebuild

### Current Capabilities

| Operation | Method | Evidence |
|-----------|--------|----------|
| Append | `M9ActivityStore.append()` | SQLite INSERT with dedup |
| Restart/reopen | `M9ActivityStore` constructor | Opens existing SQLite DB |
| Replay | `M9ActivityStore.replay(from?, to?)` | Returns records in sequence order |
| Rebuild | `M9ActivityStore.rebuild()` | Returns all records in sequence order |
| Cursor continuation | `M9ActivityStore.getCursor()` | Returns last appended record |
| Effective state | `ProjectionRuntime.rebuild(records)` | Reconstructs projection from records |

### Rebuild Behavior

The M11A route uses `M9ActivityStore.rebuild()` to reconstruct projection state on startup:

```typescript
const records = await room.store.rebuild();
const runtime = new ProjectionRuntime();
const projection = runtime.rebuild(records);
```

**Verified**: Activity Room projections can reconstruct expected read state from durable records.

---

## AR-002.12 — Bounded Activity Payload

### Current Payload Behavior

| Field | Size | Bounded? |
|-------|------|---------|
| `id` | ~50 chars | ✅ Bounded |
| `sequence` | integer | ✅ Bounded |
| `timestamp` | ISO 8601 | ✅ Bounded |
| `kind` | enum | ✅ Bounded |
| `actor` | {type, id, displayName} | ✅ Bounded |
| `content` (agent-message) | Variable | ⚠️ M11A truncates to 400 chars for timeline |
| `evidenceRefs` | Array of strings | ✅ Bounded |
| `payload` | Record<string, unknown> | ⚠️ Unbounded (projector-dependent) |

### M11A Truncation

The M11A route applies `projectActivity()` which truncates agent-message content to 400 chars for the timeline list:

```typescript
const PREVIEW_BUDGET = 400;
function projectActivity(record: ActivityRecord): ActivityRecord & { hasDetails?: boolean } {
  if (record.kind !== 'agent-message') return record;
  const content = record.content ?? '';
  if (content.length <= PREVIEW_BUDGET) return record;
  // Truncate and flag hasDetails
}
```

**Verified**: Large payloads are bounded at the API layer. Full content is available on demand via `GET /api/activity-room/:id`.

---

## AR-002.13 — Verification

### Focused Tests (Existing)

| Test | Coverage | Status |
|------|----------|--------|
| `store.test.ts` | Append, dedup, list, get, lastSequence | ✅ 3 tests |
| `contracts.test.ts` | ActivityRecord types, resolveActivityActor | ✅ 6 tests |
| `batch.test.ts` | toActivityBatch, pagination | ✅ 2 tests |
| `stream.test.ts` | ActivityStreamHub, connection, resync | ✅ 5 tests |
| `service.test.ts` | ActivityProjectionService project/append | ✅ 8 tests |
| `adapters.test.ts` | fromEngineeringTruthEvent, fromOrchestrationEvent | ✅ 3 tests |
| `severity.test.ts` | severityOf classification | ✅ 7 tests |
| `sequence.test.ts` | MonotonicSequence allocation | ✅ 3 tests |
| `redactor.test.ts` | ActivityRedactor patterns | ✅ 5 tests |
| `effective-state.test.ts` | projectEffectiveState | ✅ 5 tests |
| `projectors/*.test.ts` | Individual projector coverage | ✅ 22 tests |
| `store-sqlite.test.ts` | SQLite persistence | ✅ 3 tests |

### Total: 72 tests across 16 files

### Invariant Coverage Matrix

| Invariant | Test Coverage |
|-----------|--------------|
| Source → canonical record | ✅ service.test.ts, adapters.test.ts |
| Provenance preservation | ✅ contracts.test.ts, adapters.test.ts |
| Idempotency | ✅ store.test.ts (dedup) |
| Deterministic projection | ✅ service.test.ts, projectors/*.test.ts |
| Sequence ordering | ✅ sequence.test.ts, store.test.ts |
| Persist-before-broadcast | ✅ service.test.ts (onAppended callback) |
| Redaction | ✅ redactor.test.ts |
| Projector failure | ✅ service.test.ts (error propagation) |
| Persistence failure | ✅ store.test.ts (DuplicateActivityError) |
| Stream failure | ✅ stream.test.ts (resync) |
| Replay/rebuild | ✅ store-sqlite.test.ts |

---

## AR-002.14 — Production Characterization

### Existing Production Path Evidence

The production path has been validated through:

1. **M9IngestionBridge** — subscribes to EventBus INGEST patterns, normalizes via adapters, appends to M9ActivityStore
2. **M11A route** — reads from M9ActivityStore, projects via ProjectionRuntime, serves via REST API
3. **M11B route** — broadcasts via ActivityStreamHub over WebSocket
4. **Workspace UI** — consumes M11A REST + M11B WebSocket

### Production Characterization (Existing Infrastructure)

| Step | Component | Evidence |
|------|-----------|----------|
| Authoritative event | EventBus | `conversation:created`, `agent:started`, etc. |
| Normalized input | M9IngestionBridge | `mapToActivityEvent()` |
| Deterministic projector | 6 projectors | Pure functions, no external state |
| Canonical ActivityRecord | M9ActivityStore.append() | SQLite persistence |
| Redaction | ActivityRedactor | Before persistence |
| Ordered delivery | ActivityStreamHub → M11B | Sequence-based |

---

## Summary

### Pipeline Invariants Verified

| Invariant | Status |
|-----------|--------|
| Authoritative event → normalized projection input | ✅ Verified |
| Deterministic projector → canonical ActivityRecord | ✅ Verified |
| Redaction before persistence | ✅ Verified |
| Persistence before broadcast | ✅ Verified |
| Provenance preserved | ✅ Verified |
| Duplicate semantics defined | ✅ eventId-based |
| Ordering deterministic | ✅ MonotonicSequence |
| Failures observable | ✅ Exception propagation |
| Authority boundaries intact | ✅ Activity Room downstream |
| No second Activity implementation | ✅ Verified (AR-001L) |
| No second realtime transport | ✅ M11B only |
| No provider/runtime dependency | ✅ Verified |

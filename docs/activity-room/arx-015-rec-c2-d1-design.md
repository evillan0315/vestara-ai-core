# ARX-015 AR-REC-C2-D1 — Interaction Authority Design Gate

> **Status**: DESIGN + EVIDENCE ONLY  
> **Authorized by**: Director  
> **Executed by**: vestara-developer  
> **Date**: 2026-08-29  
> **Frozen baselines**: AR-REC-A at `355922b`, AR-REC-B at `5dc54ba`, AR-REC-C1 at `fc30f8b`  
> **Mutation scope**: Design documentation/evidence only. No production code, tests, schemas, stores, routes, events, UI components, or behavioral changes.  
> **Implementation authorization**: AR-REC-C2 implementation is NOT authorized.

---

## D1-0: Objective

Design the smallest domain-neutral interaction infrastructure capable of:

**Presentation flow:**
```
StructuredInteraction
  → authoritative validation
  → durable persistence
  → projection/audit publication
  → M9 → M10/M11
```

**Response flow:**
```
InteractionResponse
  → narrow structured ingress
  → authoritative interaction lookup
  → structural validation
  → atomic response persistence
  → projection/audit publication
```

The design MUST stop before producer-specific interpretation, governance, or execution. A successfully recorded InteractionResponse MUST NOT, by itself, cause domain execution.

---

## D1-1: Application Boundary Selection

### Existing Vestara Patterns Examined

| Pattern | Example | Structure |
|---------|---------|-----------|
| Composition-root-migrated shared-DB stores | `PlanStorage`, `SuggestionStorage`, `AgentStorage` | Concrete class, receives `db: any`, no interface |
| Self-managed DB with static factory | `FileThreadStore`, `SqliteEngineeringEventStore` | `static async open(dbPath)`, owns own file + migration |
| Service + port/adapter | `ActivityProjectionService` + `ActivityStore` interface | Port interface + concrete impl, service orchestrates |
| Bridge (EventBus → store) | `M9IngestionBridge`, `AgentLifecycleBridge` | Subscribes to EventBus, normalizes, persists |

### Selected Pattern: Persistence Port + Application Service

Following the `ActivityProjectionService` + `ActivityStore` pattern (the most disciplined pattern in the codebase):

```
InteractionPersistencePort (interface)
  ↑ implemented by
SqliteInteractionStore (concrete)

InteractionService (application boundary)
  owns: validation, persistence coordination, publication
  receives: InteractionPersistencePort, EventBus (or callback)
```

**Rationale**: This is the smallest abstraction whose responsibility is truthful. The port interface allows test substitution (in-memory mock). The service coordinates the full lifecycle without becoming a domain authority.

### What InteractionService Owns

| Responsibility | Evidence |
|---------------|----------|
| `validateInteraction()` structural validation | Frozen B contract function exists |
| Persist immutable `StructuredInteraction` | C1-2: no existing substrate does this |
| Retrieve by `InteractionId` | C1-3: required for response validation |
| `validateResponseForInteraction()` structural validation | Frozen B contract function exists |
| Record at most one `InteractionResponse` | C1 frozen invariant |
| Publish interaction facts after committed persistence | C1-5: required for M9 projection |

### What InteractionService Does NOT Own

| Prohibition | Evidence |
|------------|----------|
| ChoiceId → handler/operation mapping | REC-GOV-04, C1-10 |
| Domain execution/routing | C1-11: UNRESOLVED boundary |
| Governance/authorization | REC-GOV-03 |
| Workflow/orchestration dispatch | C1-10: producer retains domain correlation |
| Agent wake-up | C1-10: UNRESOLVED boundary |
| Generic metadata/payload/context | REC-GOV-10, C1 frozen invariants |
| Market/agent/workflow-specific logic | REC-GOV-10 |

---

## D1-2: Persistence Contract

### Interface: `InteractionPersistencePort`

```typescript
interface InteractionPersistencePort {
  /** Persist an immutable StructuredInteraction. Fails if interactionId already exists. */
  put(interaction: StructuredInteraction): Promise<void>;

  /** Retrieve a StructuredInteraction by InteractionId. Returns undefined if absent. */
  get(interactionId: InteractionId): Promise<StructuredInteraction | undefined>;

  /** Record at most one InteractionResponse for an interaction.
   *  Returns the recorded response on success.
   *  Throws if: interaction not found, response already recorded, choiceId invalid. */
  recordResponse(
    interactionId: InteractionId,
    response: InteractionResponse,
  ): Promise<InteractionResponse>;

  /** Retrieve the response for an interaction, if any. */
  getResponse(interactionId: InteractionId): Promise<InteractionResponse | undefined>;

  /** Check if a response exists for an interaction. */
  hasResponse(interactionId: InteractionId): Promise<boolean>;
}
```

### Schema Design

```sql
CREATE TABLE IF NOT EXISTS interactions (
  interaction_id TEXT PRIMARY KEY,
  conversation_id TEXT,
  presenting_participant_id TEXT NOT NULL,
  presenting_participant_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content TEXT NOT NULL,
  choices_json TEXT NOT NULL,           -- serialized InteractionChoice[]
  lifecycle TEXT NOT NULL DEFAULT 'presented'  -- derived, not authoritative
);

CREATE INDEX IF NOT EXISTS idx_interactions_conversation
  ON interactions(conversation_id);

CREATE TABLE IF NOT EXISTS interaction_responses (
  interaction_id TEXT PRIMARY KEY UNIQUE,  -- atomic one-response enforcement
  response_id TEXT NOT NULL,
  selected_choice_id TEXT NOT NULL,
  responding_participant_id TEXT NOT NULL,
  responding_participant_name TEXT NOT NULL,
  responded_at TEXT NOT NULL,
  correlation_id TEXT,
  FOREIGN KEY (interaction_id) REFERENCES interactions(interaction_id)
);
```

### Lifecycle: Derived, Not Persisted

`InteractionLifecycle` (`'presented' | 'responded' | 'expired'`) is derived from facts:
- `hasResponse(id) === true` → `'responded'`
- `hasResponse(id) === false` → `'presented'`
- Expired requires downstream policy (C2 UNRESOLVED)

The `lifecycle` column in the `interactions` table is a **denormalized cache** for query convenience, not the authoritative source. The authoritative source is the response existence check.

---

## D1-3: Durable Implementation Selection

### Candidates Evaluated

| Candidate | Ownership | Isolation | Startup | Atomicity | Migration |
|-----------|-----------|-----------|---------|-----------|-----------|
| Dedicated SQLite (self-managed) | Interaction authority owns its file | Separate file, no schema collision | Load from disk, no replay | SQLite transactions | Own migration manifest |
| Extension of plans.db (shared-DB) | Shared with workspace stores | Same file, separate tables | Loaded by composition root | Same transaction scope | Chained into PLANS_MANIFEST |
| Extension of activity.db (M9) | Shared with M9 | Same file, separate tables | Loaded by M9 init | Same transaction scope | Chained into ACTIVITY_MANIFEST |
| In-memory only | Process-scoped | N/A | N/A | N/A | N/A |

### Selected: Dedicated SQLite (Self-Managed)

Following the `FileThreadStore` / `SqliteEngineeringEventStore` pattern:

```
static async open(dbPath: string, options?: { persistDebounceMs?: number })
  → openSqlDb(dbPath)
  → migrate(db, INTERACTION_MANIFEST, { persist: ... })
  → return new SqliteInteractionStore(db, dbPath, ...)
```

**Why not shared-DB**: The workspace `plans.db` already carries 15+ tables. Adding interaction tables increases startup migration cost and couples interaction persistence to workspace domain evolution. A separate file is cleaner.

**Why not M9**: M9 is projection infrastructure (C1 frozen). Making M9 own interaction persistence violates "M9 remains projection-only."

**Why not in-memory**: C1 frozen: "production requires durable interaction persistence satisfying restart recovery."

### File Location

```
.vestara/interactions.db
```

Separate from:
- `.vestara/plans/plans.db` (workspace domain)
- `.vestara/activity.db` (M9 projection)
- `.vestara/threads/agent-harness.db` (thread runtime)
- `.vestara/events/engineering-events.db` (engineering truth)

### Migration Manifest

```typescript
export const INTERACTION_MANIFEST: MigrationManifest = buildManifest('interactions', [
  INTERACTION_MIGRATIONS,
]);
```

Single baseline step creating `interactions` + `interaction_responses` tables.

### Startup Behavior

- Open `.vestara/interactions.db` (create if absent)
- Run `INTERACTION_MANIFEST` migration
- **No replay loop** — interactions are indexed, queried on demand
- Active interactions loaded lazily via `get(interactionId)`

---

## D1-4: Atomic Response Semantics

### Frozen Invariant

> At most one authoritative response per interaction.

### Implementation: SQLite Transaction

```sql
BEGIN TRANSACTION;

-- 1. Verify interaction exists
SELECT interaction_id FROM interactions WHERE interaction_id = ?;

-- 2. Verify no response exists (UNIQUE constraint + explicit check)
SELECT response_id FROM interaction_responses WHERE interaction_id = ?;

-- 3. Verify choiceId is valid
SELECT choices_json FROM interactions WHERE interaction_id = ?;
-- Application-level check: selectedChoiceId exists in choices

-- 4. Insert response (UNIQUE constraint provides atomic guarantee)
INSERT INTO interaction_responses (
  interaction_id, response_id, selected_choice_id,
  responding_participant_id, responding_participant_name,
  responded_at, correlation_id
) VALUES (?, ?, ?, ?, ?, ?, ?);

-- 5. Update denormalized lifecycle cache
UPDATE interactions SET lifecycle = 'responded' WHERE interaction_id = ?;

COMMIT;
```

### Race Condition Analysis

The `interaction_responses.interaction_id PRIMARY KEY UNIQUE` constraint prevents the "check-then-insert" race:

| Scenario | Behavior |
|----------|----------|
| First valid response | INSERT succeeds, returns response |
| Same response retried (same authoritative identity) | UNIQUE violation → detected, returns existing response (idempotent) |
| Conflicting second response | UNIQUE violation → returns 409 Conflict |
| Concurrent responses | SQLite serialized writes — exactly one wins, other gets UNIQUE violation |
| Process failure during write | Transaction rolls back, no partial state |
| Unknown interaction | SELECT returns empty → 404 |
| Invalid ChoiceId | Application check fails → 400 |
| Malformed response | Structural validation fails before DB access → 400 |

### Idempotent Retry Definition

"Same authoritative identity" = same `interactionId` + same `responseId`. The `responseId` is the idempotent retry key. The server checks: "does a response with this `responseId` already exist for this `interactionId`?" If yes, return the existing response. If a different `responseId` is submitted for the same `interactionId`, return 409 Conflict.

**Note**: `correlationId` remains provenance/correlation (C1 frozen). It is NOT the idempotency key unless a later contract explicitly defines dedup semantics for it.

---

## D1-5: Identity and Trust Boundary

### Client-Submitted Fields

| Field | Origin | Trust Level | Server Action |
|-------|--------|-------------|---------------|
| `interactionId` | URL path | Untrusted — must verify existence | Lookup in DB, return 404 if absent |
| `selectedChoiceId` | Request body | Untrusted — must verify validity | Check against interaction's `choices_json` |
| `respondingParticipantId` | Request body | **UNTRUSTED** — MUST be overridden | **Replace with server-derived identity** |
| `respondingParticipantName` | Request body | **UNTRUSTED** — MUST be overridden | **Replace with server-derived identity** |
| `correlationId` | Request body | Low trust — presentation/provenance only | Store as-is, NOT used for idempotency |

### Server-Derived Fields

| Field | Source | Authority |
|-------|--------|-----------|
| `responseId` | Server-generated (UUID or branded) | Server is sole authority for response identity |
| `respondedAt` | `new Date().toISOString()` | Server clock is authoritative |
| `respondingParticipantId` | Authentication context / session | Server resolves from auth, NOT from client |
| `respondingParticipantName` | User profile / auth context | Server resolves from auth |

### Trust Invariant

> The client MUST NOT be able to impersonate another participant merely by supplying a participant ID/name.

**Implementation**: The API endpoint extracts participant identity from the authenticated session/context, ignoring any `respondingParticipantId`/`respondingParticipantName` in the request body. If no auth context exists, the request is rejected.

### B Contract Alignment

The frozen `InteractionResponse` type (`packages/types/src/interaction.ts:123-150`) defines:
- `responseId: Brand<string, 'ResponseId'>` — server-generated
- `respondingParticipantId: string` — overridden by server
- `respondingParticipantName: string` — overridden by server
- `respondedAt: Timestamp` — overridden by server
- `correlationId?: string` — client-provided, stored as-is

The transport-neutral contract is safe for API ingestion because the server overrides identity fields. No contract modification needed.

---

## D1-6: Publication Boundary

### Prohibited Publishers (per D1-6 constraints)

| Candidate | Reason for Exclusion |
|-----------|---------------------|
| React/Activity Room UI | Client-side, no authority |
| M9 | Projection infrastructure, not interaction authority |
| M10 | Projection runtime, downstream consumer |
| Transport route (API endpoint) | Transport boundary, not domain authority |
| Raw persistence adapter | Persistence responsibility only |

### Selected: InteractionService (Application Boundary)

The `InteractionService` publishes after committed persistence. This follows the `ActivityProjectionService` pattern: persist first, then `onAppended` callback.

### Publication Mechanism

```typescript
interface InteractionPublicationPort {
  onInteractionPresented(interaction: StructuredInteraction): void;
  onInteractionResponded(
    interactionId: InteractionId,
    response: InteractionResponse,
  ): void;
}
```

**Wiring** (in composition root):
```typescript
const interactionService = new InteractionService({
  store: interactionStore,
  publication: {
    onInteractionPresented(interaction) {
      eventBus.emit({
        type: 'interaction.presented',
        source: 'interaction-service',
        payload: { interactionId: interaction.interactionId, ... },
      });
    },
    onInteractionResponded(interactionId, response) {
      eventBus.emit({
        type: 'interaction.responded',
        source: 'interaction-service',
        payload: { interactionId, responseId: response.responseId, ... },
      });
    },
  },
});
```

### Consistency Guarantee

**After-commit publication**: Facts are published to EventBus AFTER the SQLite transaction commits. If the process dies between commit and publication, the fact is durably persisted but not projected. On restart, M9 will not have the record. This is acceptable because:
- M9 is projection, not authority
- The interaction + response are durably stored
- A future reconciliation pass could re-publish orphaned interactions
- The production requirement does not demand exactly-once publication (M9 deduplicates by eventId)

**Not transactional/outbox**: The production requirement does not require distributed transaction guarantees. The EventBus is in-process (`InProcessEventBus`). If the process dies, both the EventBus state and the M9 projection state are lost together — they restart in sync.

---

## D1-7: Canonical Fact/Event Contract

### Event Naming Convention

Existing Vestara events use `source:type` format:
- `conversation:created`, `conversation:response.completed`
- `agent:started`, `agent:completed`
- `orchestration.task.started`
- `harness.turn.started`

### Recommended Semantic Event Names

| Semantic Fact | Recommended Name | Rationale |
|---------------|-----------------|-----------|
| Interaction presented | `interaction:presented` | Matches `conversation:created` pattern |
| Interaction responded | `interaction:responded` | Matches `conversation:response.completed` pattern |

**Note**: These are recommendations based on existing conventions. Exact names are C2 design decisions. C1 classified these as "required projection/audit semantic facts."

### Event Payload

**`interaction:presented`**:
```typescript
{
  type: 'interaction:presented',
  source: 'interaction-service',
  payload: {
    interactionId: string,
    conversationId?: string,
    presentingParticipantId: string,
    presentingParticipantName: string,
    content: string,
    choiceCount: number,
    createdAt: string,
  },
  metadata: {
    correlationId: string,
    // no executionId/traceId — interactions may not be execution-scoped
  },
}
```

**`interaction:responded`**:
```typescript
{
  type: 'interaction:responded',
  source: 'interaction-service',
  payload: {
    interactionId: string,
    responseId: string,
    selectedChoiceId: string,
    respondingParticipantId: string,
    respondingAt: string,
  },
  metadata: {
    correlationId: string,
  },
}
```

### Design Decision: Snapshot vs Reference

**Selected: Projection-safe snapshot in payload**. The event payload contains enough information for M9 to project without looking up the interaction store. This avoids a circular dependency (M9 → interaction store) and ensures projection is self-contained.

**NOT selected**: Reference-only (just IDs). This would require M9 consumers to query the interaction store, coupling projection to persistence.

---

## D1-8: M9 Projection Design

### Projection-Safe Fields for Activity Records

When M9 ingests `interaction:presented`, the resulting `ActivityRecord` carries:

```typescript
{
  type: 'human.message',  // or a new ActivityType if authorized later
  actor: {
    type: 'human' | 'agent',
    id: interaction.presentingParticipantId,
    displayName: interaction.presentingParticipantName,
  },
  source: 'interaction-service',
  payload: {
    message: interaction.content,
    data: {
      interactionId: interaction.interactionId,
      kind: 'interaction',
      lifecycle: 'presented',
      choices: interaction.choices,  // projection-safe subset
      choiceCount: interaction.choices.length,
    },
  },
}
```

When M9 ingests `interaction:responded`:

```typescript
{
  type: 'human.message',  // or new type
  actor: {
    type: 'human',
    id: response.respondingParticipantId,
    displayName: response.respondingParticipantName,
  },
  source: 'interaction-service',
  payload: {
    message: `Selected: ${choiceLabel}`,  // presentation-only
    data: {
      interactionId: response.interactionId,
      kind: 'interaction-response',
      lifecycle: 'responded',
      selectedChoiceId: response.selectedChoiceId,
      responseId: response.responseId,
    },
  },
}
```

### What M9 Does NOT Do

| Prohibition | Evidence |
|------------|----------|
| Validate choices | C1: M9 remains projection-only |
| Determine response validity | C1: domain validity with downstream systems |
| Enforce one-response | C1: interaction persistence authority owns this |
| Interpret ChoiceId | C1: producer retains domain correlation |
| Execute anything | C1: M9 is projection infrastructure |
| Be source of interaction truth | C1: interaction persistence authority is source |

### M10/M11 Impact

No M10/M11 changes required for C2. M10 already projects any `ActivityRecord` into participant summaries. M11B already broadcasts any projected record. The `kind: 'interaction'` in `payload.data` allows future UI components to render interaction-specific views without M10 changes.

---

## D1-9: Response Transport Design

### Route

```
POST /api/interactions/:interactionId/response
```

### Request Body

```typescript
{
  selectedChoiceId: string,    // required — the opaque choice selection
  correlationId?: string,      // optional — provenance/correlation
}
```

**NOT accepted** (explicitly excluded per D1-9 constraints):
- `operation`, `command`, `handler`, `route`, `workflow`, `tool`
- `capability`, `execution target`, `approval result`, `policy result`
- `metadata`, `payload`, `context`, arbitrary fields
- `respondingParticipantId`, `respondingParticipantName`, `respondedAt`, `responseId`

### Server-Derived Fields

| Field | Source |
|-------|--------|
| `responseId` | Server-generated branded ID |
| `respondedAt` | Server clock |
| `respondingParticipantId` | Auth context (session, token) |
| `respondingParticipantName` | User profile from auth context |

### Validation Ordering

```
1. Parse + structural validation (body shape)
2. Auth context extraction → participant identity
3. Interaction lookup by interactionId → 404 if absent
4. validateResponseForInteraction(response, interaction) → 400 if structural invalid
5. recordResponse(interactionId, response) → atomic DB insert
   - UNIQUE violation → 409 (conflicting response)
   - Success → return recorded response
6. Publication (after commit)
```

### Response Semantics

| Scenario | HTTP Status | Body |
|----------|-------------|------|
| Success (first response) | 201 Created | `{ response: InteractionResponse }` |
| Idempotent retry (same responseId) | 200 OK | `{ response: InteractionResponse }` |
| Conflicting response | 409 Conflict | `{ error: { code: 'CONFLICT', message: 'Response already recorded' } }` |
| Unknown interaction | 404 Not Found | `{ error: { code: 'NOT_FOUND', message: 'Interaction not found' } }` |
| Invalid choiceId | 400 Bad Request | `{ error: { code: 'INVALID_CHOICE', message: '...' } }` |
| Malformed request | 400 Bad Request | `{ error: { code: 'VALIDATION_FAILED', message: '...' } }` |
| No auth context | 401 Unauthorized | `{ error: { code: 'UNAUTHORIZED', message: '...' } }` |

---

## D1-10: Producer-Side Presentation Boundary

### Interface: `InteractionPresentationPort`

```typescript
interface InteractionPresentationPort {
  /** Present a StructuredInteraction. Persists and publishes. */
  present(interaction: StructuredInteraction): Promise<void>;
}
```

**Implementation**: `InteractionService` implements this port. The service validates, persists, and publishes.

### Usage (Test/Synthetic Producer)

```typescript
const service = new InteractionService({ store, publication });

await service.present({
  interactionId: 'int-test-001' as InteractionId,
  presentingParticipantId: 'test-producer',
  presentingParticipantName: 'Test Producer',
  createdAt: new Date().toISOString(),
  content: 'Which option?',
  choices: [
    { choiceId: 'choice-a' as ChoiceId, label: 'Option A' },
    { choiceId: 'choice-b' as ChoiceId, label: 'Option B' },
  ],
});
```

### What C2 Does NOT Integrate (per D1-10)

- SuggestionService
- Agents
- Harness
- Workflow
- Marketplace
- Observer
- Any real domain producer

C2 must be testable with a synthetic/test producer. Generic infrastructure verified independently from producer-specific continuation semantics.

---

## D1-11: Explicit Continuation Boundary

### Frozen Boundary

```
record InteractionResponse
  → publish response fact
  → END OF GENERIC C2 RESPONSIBILITY
```

### What C2 MUST NOT Implement

| Prohibition | Evidence |
|------------|----------|
| ChoiceId → handler | REC-GOV-04 |
| ChoiceId → operation | REC-GOV-04 |
| ChoiceId → workflow | C1-10 UNRESOLVED |
| ChoiceId → tool | C1-10 UNRESOLVED |
| ChoiceId → capability | C1-10 UNRESOLVED |
| Label → behavior | REC-GOV-05 |
| Agent wake-up | C1-10 UNRESOLVED |
| Workflow continuation | C1-10 UNRESOLVED |
| Harness continuation | C1-10 UNRESOLVED |
| Marketplace action | C1-10 UNRESOLVED |

### Expected C2 Behavior

A successful response with **zero resulting domain execution** is expected C2 behavior. The interaction is recorded, the fact is published, and C2 stops. Producer-specific interpretation remains a later explicitly authorized integration.

---

## D1-12: Failure Model

| Failure | Authoritative State | Retry Safety | API Result | Projection Lag | Domain Execution |
|---------|-------------------|-------------|------------|----------------|-----------------|
| Persistence unavailable | No state change | Safe to retry | 500 | N/A | None |
| Duplicate InteractionId (put) | Existing interaction preserved | Idempotent (existing returned) | 200/409 | None | None |
| Malformed interaction | No state change | Safe to retry | 400 | N/A | None |
| Interaction with zero choices | No state change | Safe to retry | 400 | N/A | None |
| Duplicate ChoiceIds | No state change | Safe to retry | 400 | N/A | None |
| Unknown interaction (response) | No state change | Safe to retry | 404 | N/A | None |
| Invalid ChoiceId | No state change | Safe to retry | 400 | N/A | None |
| Duplicate identical response | Existing response returned | Idempotent | 200 | None | None |
| Conflicting response | Existing response preserved | Safe to retry (gets 409) | 409 | None | None |
| Concurrent response race | One wins, one gets UNIQUE violation | Winner: 200, Loser: 409 | 200/409 | None | None |
| Persistence succeeds / publication fails | Response durably stored | Publication retry on next operation | 200 | Temporary | None |
| Publication duplicates | M9 deduplicates by eventId | Idempotent | N/A | None | None |
| API restart | Interactions + responses durable | Replay from DB | 200 | None | None |
| Activity projection unavailable | Response stored, not projected | Publication retry | 200 | Temporary | None |
| M9 ingestion failure | Response stored, M9 lagging | M9 retry on next poll | 200 | Temporary | None |

**Domain execution remains NONE throughout C2.**

---

## D1-13: Dependency Direction

### Package Dependency Graph

```
@vestara/types
  └── StructuredInteraction, InteractionResponse, InteractionId, ChoiceId
      (frozen B contract — no changes)

@vestara/interaction-persistence (NEW)
  ├── depends on: @vestara/types (for contract types)
  ├── depends on: @vestara/sqlite-migrations (for migration infrastructure)
  ├── provides: InteractionPersistencePort (interface)
  ├── provides: SqliteInteractionStore (concrete)
  └── provides: INTERACTION_MANIFEST (migration)

@vestara/activity-projection
  └── extends: PATTERN_DISPOSITIONS + m9-adapter.ts
      (adds interaction patterns, NOT new dependency on interaction-persistence)

@vestara/api (apps/api)
  ├── depends on: @vestara/interaction-persistence (for store)
  ├── depends on: @vestara/types (for contract types)
  ├── provides: InteractionService (application boundary)
  ├── provides: POST /api/interactions/:id/response (transport)
  └── provides: POST /api/interactions (presentation ingress)

@vestara/workspace-ui (apps/workspace)
  └── consumes: interaction data via M9/M11 WebSocket
      (NO direct dependency on @vestara/interaction-persistence)
```

### What Interaction Infrastructure Does NOT Depend On

| Package | Reason for Exclusion |
|---------|---------------------|
| `@vestara/workspace-ui` | Client-side, no authority |
| `@vestara/agent-harness` | Producer domain |
| `@vestara/workflow-orchestrator` | Producer domain |
| `@vestara/marketplace` | Producer domain |
| `@vestara/conversation` | Separate domain |
| `@vestara/activity-projection` | Downstream consumer, not upstream dependency |

### Dependency Direction Rule

```
types/contracts
  ↑
interaction persistence (port + impl)
  ↑
interaction application boundary (service)
  ↓
publication port (callback/EventBus)
  ↓
EventBus adapter → M9 ingestion → M10/M11
```

The application boundary depends upward on types and persistence, and downward on publication. M9 depends downward on facts, not upward on interaction authority.

---

## D1-14: Performance Implications

### Boot Behavior

| Concern | Analysis |
|---------|----------|
| Replay all interactions on boot? | **NO** — interactions are indexed by `interaction_id`, queried on demand. No O(n) replay. |
| Active interactions preloaded? | **NO** — loaded lazily via `get(interactionId)`. Active interaction count expected small. |
| Database initialization cost | Low — CREATE TABLE IF NOT EXISTS + index creation. Same as other SQLite stores. |
| M9 projection cost | Low — one ActivityRecord per interaction event. Same cost as existing events. |
| Boot-critical? | **NO** — interaction persistence can initialize asynchronously after API starts serving. |

### Runtime Performance

| Concern | Analysis |
|---------|----------|
| Interaction lookup | O(1) indexed by `interaction_id` PRIMARY KEY |
| Response record | O(1) indexed by `interaction_id` PRIMARY KEY |
| Publication | In-process EventBus emit — negligible |
| M9 ingestion | Same as existing — one append per event |

### No New Startup Replay Loop

The interaction persistence follows the `FileThreadStore` pattern: open DB, run migration, ready for on-demand queries. No startup replay, no O(n) reconstruction.

---

## D1-15: Verification Design

### C2 Evidence Requirements

**Interaction lifecycle:**
1. Create valid interaction → retrieve by InteractionId → match
2. Reject malformed interaction (zero choices) → 400
3. Reject malformed interaction (duplicate ChoiceIds) → 400
4. Reject duplicate InteractionId safely → idempotent or 409
5. Restart persistence → retrieve interaction → match

**Response lifecycle:**
6. Record valid opaque response → retrieve response → match
7. Retry same authoritative response (same responseId) → no duplication, return existing
8. Reject conflicting response (different responseId, same interactionId) → 409
9. Concurrent response race → exactly one authoritative winner
10. Reject unknown interaction → 404
11. Reject invalid ChoiceId → 400

**Publication:**
12. Publish presentation fact → M9 records ActivityRecord
13. Publish response fact → M9 records ActivityRecord
14. Duplicate publication → M9 deduplicates (same eventId)
15. M9 remains derived (delete M9 record, interaction still exists)

**Restart:**
16. Restart API → retrieve interaction → match
17. Restart API → retrieve response → match

**No domain execution:**
18. No workflow starts from interaction creation
19. No agent wakes from interaction creation
20. No tool executes from response recording
21. No Marketplace action occurs
22. Zero resulting domain execution after successful response

### Test Strategy

- **Unit tests**: InteractionPersistencePort mock + InteractionService logic
- **Integration tests**: SqliteInteractionStore + real SQLite
- **Contract tests**: InteractionService with in-memory port (fast)
- **Restart proof**: Create interaction + response → close DB → reopen → retrieve → match
- **Concurrency proof**: Parallel response submissions → exactly one wins

---

## D1-16: Proposed Implementation Surface

### REQUIRED (production)

| # | File/Package | Action | Purpose |
|---|-------------|--------|---------|
| 1 | `packages/interaction-persistence/src/index.ts` | CREATE | `InteractionPersistencePort` interface + `InteractionService` |
| 2 | `packages/interaction-persistence/src/sqlite-store.ts` | CREATE | `SqliteInteractionStore` concrete implementation |
| 3 | `packages/interaction-persistence/src/migrations.ts` | CREATE | `INTERACTION_MANIFEST` migration |
| 4 | `packages/interaction-persistence/src/__tests__/interaction-persistence.test.ts` | CREATE | Persistence port tests |
| 5 | `packages/interaction-persistence/src/__tests__/interaction-service.test.ts` | CREATE | Service logic tests |
| 6 | `packages/interaction-persistence/src/__tests__/interaction-store.test.ts` | CREATE | SQLite store integration tests |
| 7 | `packages/interaction-persistence/package.json` | CREATE | Package manifest |
| 8 | `packages/interaction-persistence/tsconfig.json` | CREATE | TypeScript config |
| 9 | `apps/api/src/routes/interactions.ts` | CREATE | `POST /api/interactions` + `POST /api/interactions/:id/response` |
| 10 | `apps/api/src/workspace-context.ts` | MODIFY | Wire InteractionService into WorkspaceContext |
| 11 | `apps/api/src/server.ts` | MODIFY | Register interaction routes |

### TEST (verification)

| # | File | Purpose |
|---|------|---------|
| 12 | `packages/interaction-persistence/src/__tests__/interaction-restart-proof.test.ts` | Restart persistence verification |
| 13 | `packages/interaction-persistence/src/__tests__/interaction-concurrent-proof.test.ts` | Concurrent response race proof |
| 14 | `packages/interaction-persistence/src/__tests__/interaction-no-execution-proof.test.ts` | Zero domain execution proof |

### PROJECTION (M9 integration)

| # | File | Action | Purpose |
|---|------|--------|---------|
| 15 | `packages/activity-projection/src/m9-adapter.ts` | MODIFY | Add `fromInteractionPresented` + `fromInteractionResponded` adapters |
| 16 | `packages/activity-projection/src/m9-ingestion-bridge.ts` | MODIFY | Add `interaction:presented` + `interaction:responded` to `PATTERN_DISPOSITIONS` |

### TRANSPORT (API)

| # | File | Action | Purpose |
|---|------|--------|---------|
| 17 | `apps/api/src/routes/interactions.ts` | CREATE | Transport boundary (listed above in REQUIRED) |

### NOT REQUIRED (for C2)

| # | Component | Why Not Required |
|---|-----------|-----------------|
| 18 | InteractionCard UI component | LATER UI |
| 19 | SuggestionService adapter | DEFER |
| 20 | Agent/Harness integration | UNRESOLVED C2 boundary |
| 21 | Workflow/Orchestration integration | UNRESOLVED C2 boundary |
| 22 | Marketplace integration | UNRESOLVED C2 boundary |
| 23 | M10 changes | Not required — M10 handles any ActivityRecord |
| 24 | M11 changes | Not required — M11B broadcasts any projected record |

---

## D1-17: Unresolved Questions / Blockers

| # | Question | Impact | Resolution Path |
|---|----------|--------|-----------------|
| 1 | Exact canonical event names | Low — `interaction:presented`/`interaction:responded` recommended | C2 authorizer confirms or adjusts |
| 2 | InteractionService package location | Low — `packages/interaction-persistence` recommended | Follows existing package conventions |
| 3 | ActivityType extension needed? | Medium — currently no `interaction.*` ActivityType | Either extend enum or use `human.message` + `payload.data.kind` |
| 4 | New ActivityType vs payload.kind | Medium — `kind: 'interaction'` in payload.data avoids enum change | C2 authorizer decides |
| 5 | Auth context extraction mechanism | Low — existing auth middleware provides user identity | Follow existing route auth patterns |
| 6 | Interaction-specific M9 adapter vs generic | Low — separate adapters are cleaner | Follow existing adapter pattern |
| 7 | `conversationId` optional field usage | Low — not required for C2 core flow | Leave optional, producer provides if context exists |

---

## D1-18: Evidence References

### Source Files Examined for Pattern Analysis

| File | Pattern Extracted |
|------|-------------------|
| `packages/activity-projection/src/service.ts` | Service + port/adapter, onAppended publication |
| `packages/activity-projection/src/store.ts` | ActivityStore interface (port) |
| `packages/activity-projection/src/store-sqlite.ts` | SqliteActivityStore (adapter) |
| `packages/activity-projection/src/m9-ingestion-bridge.ts` | PATTERN_DISPOSITIONS, bridge normalization |
| `packages/activity-projection/src/m9-adapter.ts` | Adapter functions for M9 |
| `packages/thread-runtime/src/index.ts` | FileThreadStore self-managed DB pattern |
| `packages/engineering-event-store/src/index.ts` | SqliteEngineeringEventStore self-managed pattern |
| `packages/workspace/src/suggestion-service.ts` | Service + storage + EventBus injection |
| `packages/workspace/src/plan-storage.ts` | Shared-DB store pattern |
| `packages/workspace/src/scaffold-migrations.ts` | Migration manifest structure |
| `packages/sqlite-migrations/src/types.ts` | MigrationManifest, MigrationStep types |
| `packages/event-bus/src/index.ts` | EventBus interface + InProcessEventBus |
| `packages/shared/src/events.ts` | VestaraEvent envelope |
| `apps/api/src/index.ts` | Composition root boot sequence |
| `apps/api/src/workspace-context.ts` | WorkspaceContext dependency wiring |
| `apps/api/src/activity-room.ts` | ActivityRoom initialization pattern |
| `apps/api/src/bridges/agent-lifecycle-bridge.ts` | Bridge pattern (EventBus → canonical events) |
| `apps/api/src/bridges/orchestration-event-bridge.ts` | Bridge pattern (orchestrator → EventBus) |
| `packages/types/src/interaction.ts` | Frozen B contract |
| `packages/types/src/activity.ts` | ActivityRecord, ActivityEvent, ActivityType |

---

## Conclusion

The D1 design establishes the minimum production architecture for the interaction authority:

1. **Application boundary**: `InteractionService` — validates, persists, publishes. Does not interpret choices or execute operations.
2. **Persistence**: Dedicated SQLite (`SqliteInteractionStore`) — self-managed, own file, own migration, atomic one-response enforcement.
3. **Atomic response**: SQLite transaction + UNIQUE constraint — safe against concurrent races, process failures, and idempotent retries.
4. **Publication**: After-commit EventBus emission — consistent with existing Vestara patterns, acceptable consistency guarantee.
5. **M9 projection**: Adapters normalize interaction facts into ActivityRecords — M9 remains downstream, never authoritative.
6. **Transport**: `POST /api/interactions/:id/response` — narrow, server-derived identity, no executable semantics.
7. **Continuation boundary**: C2 stops at response recording + publication. Producer-specific interpretation is UNRESOLVED.
8. **Implementation surface**: 17 files (11 REQUIRED, 3 TEST, 3 PROJECTION), no speculative refactors.

**AR-REC-C2 implementation remains NOT AUTHORIZED.**

---

> **Design complete. No production code, tests, schemas, stores, routes, events, UI components, or behavioral changes were made.**

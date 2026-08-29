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

### Selected Pattern: Persistence Port + Application Service in Producer-Neutral Package

Following the `ActivityProjectionService` + `ActivityStore` pattern (the most disciplined pattern in the codebase):

```
InteractionPersistencePort (interface)
  ↑ implemented by
SqliteInteractionStore (concrete)

InteractionService (application boundary)
  owns: validation, persistence coordination, publication
  receives: InteractionPersistencePort, InteractionPublicationPort
```

**Rationale**: This is the smallest abstraction whose responsibility is truthful. The port interface allows test substitution (in-memory mock). The service coordinates the full lifecycle without becoming a domain authority.

### Package Boundary: Producer-Neutral Application Package

`InteractionService` must NOT live in `@vestara/api`. HTTP is a transport consumer of the interaction capability, not its owner. Future producers (agent harness, workflow orchestrator, marketplace) must not depend on `@vestara/api` to call `InteractionService.present()`.

**Selected layout**: `packages/interaction-app/`

```
packages/interaction-app/
  src/
    index.ts              ← exports InteractionService + InteractionPersistencePort + InteractionPublicationPort
    interaction-service.ts ← InteractionService class
    interaction-persistence-port.ts ← port interface
    interaction-publication-port.ts ← publication port interface
    __tests__/
      interaction-service.test.ts
  package.json
  tsconfig.json
```

**Dependency direction** (immutable):

```
apps/api ──────────────────┐
                           ↓
               @vestara/interaction-app (InteractionService)
                           ↑
future producers ──────────┘

@vestara/interaction-app
       ↓
@vestara/interaction-persistence (port + SQLite impl)
       ↓
durable adapter (.vestara/interactions.db)

@vestara/interaction-app
       ↓
InteractionPublicationPort → EventBus adapter
       ↓
M9 (consumes facts independently)
```

`@vestara/interaction-app` depends on `@vestara/interaction-persistence` (port + impl) and `@vestara/types` (frozen B contract). `@vestara/api` depends on `@vestara/interaction-app`. Future producers depend on `@vestara/interaction-app`. `@vestara/activity-projection` does NOT depend on either interaction package — it only consumes EventBus events.

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
  choices_json TEXT NOT NULL           -- serialized InteractionChoice[]
);

CREATE INDEX IF NOT EXISTS idx_interactions_conversation
  ON interactions(conversation_id);

CREATE TABLE IF NOT EXISTS interaction_responses (
  interaction_id TEXT PRIMARY KEY,     -- UNIQUE per interaction: at most one response
  response_id TEXT NOT NULL,           -- server-derived, globally unique identity
  selected_choice_id TEXT NOT NULL,
  responding_participant_id TEXT NOT NULL,
  responding_participant_name TEXT NOT NULL,
  responded_at TEXT NOT NULL,
  correlation_id TEXT,
  FOREIGN KEY (interaction_id) REFERENCES interactions(interaction_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_interaction_responses_response_id
  ON interaction_responses(response_id);
```

**Schema invariants:**
- `interaction_responses.interaction_id` — PRIMARY KEY enforces at most one response per interaction.
- `interaction_responses.response_id` — UNIQUE index enforces globally unique response identity. The response identity is globally unique authoritative identity, encoded explicitly in the schema.

### Response Identity

- **Response identity** (`response_id`): Server-derived, globally unique. Encoded in schema via `UNIQUE` index.
- **HTTP retry identity**: Not the same as response identity. An HTTP retry after a lost response may produce a new `responseId` (server derives fresh on each attempt). The retry identity is the request itself, not the durable response.

### Deterministic Response/Retry/Conflict Semantics

**Case 1: Same interaction + same response identity**
```
Request: POST /api/interactions/:id/response { selectedChoiceId: 'A' }
  → server derives responseId = uuid()
  → INSERT INTO interaction_responses (...) VALUES (..., responseId, ...)

Retry (lost response, client resubmits same selectedChoiceId):
  → server derives NEW responseId = uuid()
  → INSERT attempt → UNIQUE(interaction_id) violation → response already exists
  → SELECT existing response WHERE interaction_id = ?
  → return existing response (200)
  → No durable side effects from retry
```

**Case 2: Same interaction + different response identity (conflict)**
```
Request A: POST /api/interactions/:id/response { selectedChoiceId: 'A' }
  → INSERT succeeds → 200

Request B: POST /api/interactions/:id/response { selectedChoiceId: 'B' }
  → INSERT attempt → UNIQUE(interaction_id) violation → response already exists
  → SELECT existing response WHERE interaction_id = ?
  → existing response has selectedChoiceId = 'A' ≠ 'B'
  → return 409 Conflict (existing response body included)
```

**Case 3: Same response identity + different interaction**
```
Request A: POST /api/interactions/:id1/response { selectedChoiceId: 'A' }
  → responseId = uuid-X → INSERT succeeds → 200

Request B: POST /api/interactions/:id2/response { selectedChoiceId: 'A' }
  → responseId = uuid-Y → INSERT succeeds → 200
  → Different interaction, different response, both valid
```

**Case 4: Same response identity + different interaction (identity collision)**
```
Request A: POST /api/interactions/:id1/response { selectedChoiceId: 'A' }
  → responseId = uuid-X → INSERT succeeds → 200

Request B: POST /api/interactions/:id2/response { selectedChoiceId: 'B' }
  → responseId = uuid-X (collision) → UNIQUE(response_id) violation
  → server derives new responseId = uuid-Y → INSERT succeeds → 200
  → No durable side effects, different response recorded
```

**Case 5: HTTP retry after lost response (same selectedChoiceId, new responseId)**
```
Client sends: POST /api/interactions/:id/response { selectedChoiceId: 'A' }
  → server derives responseId = uuid-X → INSERT succeeds → 200
  → response lost in transit

Client retries: POST /api/interactions/:id/response { selectedChoiceId: 'A' }
  → server derives NEW responseId = uuid-Y
  → INSERT attempt → UNIQUE(interaction_id) violation → already responded
  → SELECT existing response WHERE interaction_id = ?
  → existing response has selectedChoiceId = 'A' (same choice)
  → return existing response (200) — idempotent from client perspective
```

**Case 6: HTTP retry after lost response (different selectedChoiceId, new responseId)**
```
Client sends: POST /api/interactions/:id/response { selectedChoiceId: 'A' }
  → server derives responseId = uuid-X → INSERT succeeds → 200
  → response lost in transit

Client changes mind, retries: POST /api/interactions/:id/response { selectedChoiceId: 'B' }
  → server derives NEW responseId = uuid-Y
  → INSERT attempt → UNIQUE(interaction_id) violation → already responded
  → SELECT existing response WHERE interaction_id = ?
  → existing response has selectedChoiceId = 'A' ≠ 'B'
  → return 409 Conflict (existing response body included)
  → Original authoritative response (A) preserved
```

**Summary table:**

| Scenario | SelectedChoiceId match? | Durable side effects | HTTP status |
|----------|------------------------|---------------------|-------------|
| Same interaction, same choice, retry | Yes | None (idempotent) | 200 (existing response) |
| Same interaction, different choice | No | None (conflict) | 409 (existing response) |
| Concurrent race, same choice | Yes | One wins, one rolls back | 200 (winner), 409 (loser) |
| Concurrent race, different choice | No | One wins, one rolls back | 200 (winner), 409 (loser) |
| Response identity collision | N/A | New responseId derived | 200 (new response) |

**`correlationId`** remains non-authoritative unless separately proven. It is stored but does not affect response semantics.

### Lifecycle: Derived, Not Persisted

`InteractionLifecycle` (`'presented' | 'responded' | 'expired'`) is derived from authoritative facts:
- `hasResponse(id) === true` → `'responded'`
- `hasResponse(id) === false` → `'presented'`
- Expired requires downstream policy (C2 UNRESOLVED)

**No persisted lifecycle column.** The authoritative source is the response existence check. The `interactions` table carries only the immutable presentation fact. The `interaction_responses` table carries only the immutable response fact. Lifecycle is derived at query time by joining the two tables. No `UPDATE` statement is needed during response recording.

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

The database constraint, not a prior SELECT, is the final concurrency authority.

```sql
BEGIN TRANSACTION;

-- 1. Verify interaction exists (defensive — FK constraint also enforces)
SELECT 1 FROM interactions WHERE interaction_id = ?;

-- 2. Verify choiceId is valid (application-level)
SELECT choices_json FROM interactions WHERE interaction_id = ?;
-- Application checks: selectedChoiceId exists in deserialized choices

-- 3. Insert response — UNIQUE(interaction_id) is the atomic authority
--    If no response exists: INSERT succeeds
--    If same responseId retried: INSERT fails (response_id UNIQUE) → idempotent
--    If different responseId: INSERT fails (interaction_id UNIQUE) → conflict
INSERT INTO interaction_responses (
  interaction_id, response_id, selected_choice_id,
  responding_participant_id, responding_participant_name,
  responded_at, correlation_id
) VALUES (?, ?, ?, ?, ?, ?, ?);

COMMIT;
```

**No UPDATE statement.** The `interaction_responses` table is the sole source of response truth. Lifecycle is derived at query time by checking response existence.

### Deterministic Response Semantics

| Scenario | DB Constraint Hit | Result |
|----------|------------------|--------|
| No existing response + valid response | UNIQUE(interaction_id) passes, response_id UNIQUE passes | INSERT succeeds → 201 Created |
| Same responseId retried (idempotent) | response_id UNIQUE violation | Catch → SELECT existing → return 200 OK |
| Different responseId, already responded | interaction_id UNIQUE violation | Catch → return 409 Conflict |
| Concurrent valid responses | SQLite serialized — one INSERT wins, other hits UNIQUE | Winner: 201, Loser: 409 |

### Transaction/Error Handling for Losing Concurrent Request

SQLite serializes writes at the database level. When two concurrent requests attempt to insert into `interaction_responses` for the same `interaction_id`:

1. Request A begins transaction, INSERT succeeds, COMMIT
2. Request B begins transaction, INSERT attempts, UNIQUE(interaction_id) violation
3. SQLite throws constraint violation within Request B's transaction
4. Request B executes ROLLBACK (no partial state)
5. Request B returns 409 Conflict to client

The losing request has **no durable side effects** — the transaction rolled back completely. The winner's response is durably committed.

### Idempotent Retry

"Same authoritative response" = same `interactionId` + same `responseId`. The server catches the `response_id` UNIQUE violation and returns the existing response. `correlationId` remains provenance/correlation (C1 frozen). It is NOT the idempotency key.

---

## D1-5: Identity and Trust Boundary

### Frozen Transport Behavior

**Client request (minimal)**:
```typescript
{
  selectedChoiceId: string,    // required — the opaque choice selection
  correlationId?: string,      // optional — only if existing transport conventions require it
}
```

The client sends the minimum: which choice was selected, plus optional correlation. The client does NOT send participant identity, timestamps, or response identity.

### Server/Application-Derived Fields

| Field | Source | Authority |
|-------|--------|-----------|
| `responseId` | Server-generated (branded UUID) | Server is sole authority for response identity |
| `respondedAt` | `new Date().toISOString()` | Server clock is authoritative |
| `respondingParticipantId` | Authentication context / session | Server resolves from auth, NOT from client |
| `respondingParticipantName` | User profile / auth context | Server resolves from auth |
| `interactionId` | URL path parameter | Verified against DB existence |

### Trust Invariant

> The client MUST NOT be able to impersonate another participant merely by supplying a participant ID/name.

**Implementation**: The API endpoint extracts participant identity from the authenticated session/context. Any `respondingParticipantId`/`respondingParticipantName` in the request body is ignored (if present at all). If no auth context exists, the request is rejected with 401.

### Auth Context Gap Classification

If the current Activity Room lacks sufficient authenticated human identity (e.g., no auth middleware on the interaction response route), this is classified as a **dependency/gap** — not something to invent. The design assumes existing auth context is available. If it is not, that gap must be resolved before C2 implementation, not papered over with invented identity.

### B Contract Alignment

The frozen `InteractionResponse` type (`packages/types/src/interaction.ts:123-150`) defines transport-neutral fields. The API endpoint constructs the full `InteractionResponse` from:
- `selectedChoiceId` ← client request body
- `correlationId` ← client request body (optional)
- `responseId` ← server-generated
- `respondedAt` ← server clock
- `respondingParticipantId` ← server auth context
- `respondingParticipantName` ← server auth context

No contract modification needed.

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

**After-commit publication**: Facts are published to EventBus AFTER the SQLite transaction commits.

### Publication Failure and Recovery

**Scenario**: DB commit succeeds → process dies before EventBus publication → API restarts.

**Result**: Interaction + response are durably stored in `.vestara/interactions.db`. M9 has no corresponding ActivityRecord. The interaction is authoritative but invisible in Activity Room.

**Minimum production consistency strategy**: Accepted best-effort projection with startup reconciliation scan.

**Startup reconciliation** (on API boot, after interaction store opens):
1. Query `interactions` table for all interactions
2. For each interaction, check if a corresponding M9 ActivityRecord exists (via eventId lookup)
3. If no M9 record exists, re-publish the interaction fact to EventBus
4. For interactions with responses, check if response fact was published
5. If no M9 response record exists, re-publish the response fact

**Event identity for reconciliation**: Deterministic eventId derived from immutable identity (see D1-7b below). Same interaction → same eventId → M9 deduplicates via existing UNIQUE constraint. Reconciliation is idempotent.

**Why not transactional outbox**: The EventBus is in-process (`InProcessEventBus`). The probability of commit-succeed-die-before-publish is low (microseconds between commit and emit). The reconciliation scan is simple, bounded (active interactions count is small), and runs once at boot. An outbox adds schema complexity disproportionate to the risk.

**Why not accepted permanent gap**: For a production-durable Activity Room interaction, a committed authoritative interaction that never becomes observable in Activity Room is unacceptable. The reconciliation scan ensures eventual observability.

**Consistency property**: Authoritative interaction persistence may temporarily lead Activity projection (between commit and publication). A recoverable publication failure will not permanently erase the interaction from Activity Room — the startup reconciliation scan repairs it.

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

### D1-7b: Stable Event Identity for Idempotent Projection

**Problem**: If retry/reconciliation republishes the same semantic fact, M9's existing `event_id UNIQUE` constraint provides idempotent projection — but only if the event identity is deterministic.

**Selected: Deterministic eventId derived from immutable identity.**

```
eventId for presented: interaction:presented:${interactionId}
eventId for responded: interaction:responded:${interactionId}
```

**Rationale**: The `interactionId` is immutable and unique. Deriving `eventId` from it ensures:
- Same interaction always produces same eventId
- Reconciliation replay produces identical eventId
- M9 deduplicates via existing UNIQUE constraint
- No fresh unrelated event ID on retry

**NOT selected**: Fresh UUID per publication attempt. This would create duplicate M9 records on retry.

**Event identity belongs to the interaction presentation/response fact**, not to the publication attempt. The eventId is deterministically derived from the immutable `InteractionId` (for presentation) or `InteractionId` (for response — same interaction, different event type prefix).

---

## D1-8: M9 Projection Design

### ActivityType Decision

**Selected: Extend `ActivityType` enum with `interaction.presented` and `interaction.responded`.**

**Rationale**: The existing `ActivityType` enum (`packages/types/src/activity.ts:41-64`) is the canonical type system for Activity records. Overloading an unrelated type (e.g., `human.message`) to carry interaction semantics would be semantically dishonest — an interaction presentation is not a message. Extending the enum preserves semantic identity while keeping M9 derived.

**Evidence**: `ActivityType` already includes domain-specific types (`workflow.started`, `agent.started`, `verification.completed`). Adding `interaction.presented` and `interaction.responded` follows the established extensibility pattern noted in the type definition: "Extensible for future domains."

**NOT selected**: `human.message` + `payload.data.kind: 'interaction'`. This overloads an unrelated type and hides the semantic identity in an untyped JSON field.

### Projection-Safe Fields for Activity Records

When M9 ingests `interaction:presented`, the resulting `ActivityRecord` carries:

```typescript
{
  type: 'interaction.presented',  // new ActivityType
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
      choices: interaction.choices,  // projection-safe subset
      choiceCount: interaction.choices.length,
    },
  },
}
```

When M9 ingests `interaction:responded`:

```typescript
{
  type: 'interaction.responded',  // new ActivityType
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
  correlationId?: string,      // optional — provenance/correlation (only if transport conventions require)
}
```

**NOT accepted** (explicitly excluded per D1-9 constraints):
- `operation`, `command`, `handler`, `route`, `workflow`, `tool`
- `capability`, `execution target`, `approval result`, `policy result`
- `metadata`, `payload`, `context`, arbitrary fields
- `respondingParticipantId`, `respondingParticipantName`, `respondedAt`, `responseId` — all server-derived

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

### Simplified: InteractionService.present() Directly

**Removed**: `InteractionPresentationPort` interface. It adds no genuine dependency-inversion value — its only method (`present`) is already exposed by `InteractionService`. Future producer packages can depend directly on `InteractionService` (or its interface) without an intermediary port.

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

### Compile-Time Package Dependencies

```
@vestara/types
  ↑ (imports contract types)
@vestara/interaction-persistence
  ↑ (imports InteractionPersistencePort, InteractionPublicationPort, SqliteInteractionStore)
@vestara/interaction-app
  ↑ (imports InteractionService, exposes service to consumers)
@vestara/api (apps/api)
  ↑ (imports InteractionService for route handlers)
API route handlers call service.present() / service.recordResponse()

@vestara/activity-projection
  ↑ (imports PATTERN_DISPOSITIONS, m9-adapter)
M9IngestionBridge (existing, extends)
```

**Key invariant**: `@vestara/interaction-app` depends inward on `@vestara/interaction-persistence` (port + impl) and `@vestara/types` (contracts). `@vestara/api` depends on `@vestara/interaction-app`. Future producers (agent harness, workflow, marketplace) depend on `@vestara/interaction-app`. `@vestara/activity-projection` does NOT depend on `@vestara/interaction-persistence` or `@vestara/interaction-app` — it only consumes EventBus events.

### Runtime Data Flow

```
Producer (agent harness / workflow / API route)
  → @vestara/interaction-app: InteractionService.present(interaction)
    → @vestara/interaction-persistence: InteractionPersistencePort.put(interaction)     [persist]
    → InteractionPublicationPort.onInteractionPresented()  [publish]
      → EventBus.emit('interaction:presented', { eventId: 'interaction:presented:${id}', ... })
        → M9IngestionBridge handler (subscribed to 'interaction:presented')
          → fromInteractionPresented() adapter → ActivityEvent
          → M9.append(activityEvent)              [project]
            → M10 ProjectionRuntime                [derive]
              → ActivityStreamHub.broadcast()      [deliver]
                → WebSocket → Activity Room UI

Human clicks choice
  → POST /api/interactions/:id/response { selectedChoiceId }
    → Auth context → participant identity
    → @vestara/interaction-app: InteractionService.recordResponse(interactionId, response)
      → @vestara/interaction-persistence: InteractionPersistencePort.recordResponse()  [persist atomically]
      → InteractionPublicationPort.onInteractionResponded()  [publish]
        → EventBus.emit('interaction:responded', { eventId: 'interaction:responded:${id}', ... })
          → M9IngestionBridge handler
            → fromInteractionResponded() adapter → ActivityEvent
            → M9.append(activityEvent)
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
types/contracts (frozen B contract)
  ↑
interaction persistence (port + SQLite impl)
  ↑
interaction application (InteractionService)
  ↓
publication port (callback → EventBus)
  ↓
EventBus → M9 bridge (existing) → M9 → M10/M11
```

The application package depends upward on types and persistence, and downward on publication. M9 depends downward on facts (via EventBus), not upward on interaction authority. The persistence adapter depends inward on contracts, not outward on the application layer. Future producers depend on `@vestara/interaction-app`, not on `@vestara/api`.

---

## D1-14: Performance Implications

### Boot Behavior

| Concern | Analysis |
|---------|----------|
| Replay all interactions on boot? | **NO** — interactions are indexed by `interaction_id`, queried on demand. No O(n) replay. |
| Active interactions preloaded? | **NO** — loaded lazily via `get(interactionId)`. Active interaction count expected small. |
| Database initialization cost | Low — CREATE TABLE IF NOT EXISTS + index creation. Same as other SQLite stores. |
| M9 projection cost | Low — one ActivityRecord per interaction event. Same cost as existing events. |
| Boot-critical? | **NO** — interaction persistence initializes synchronously (fast), reconciliation runs async after API is serving. |

### Runtime Performance

| Concern | Analysis |
|---------|----------|
| Interaction lookup | O(1) indexed by `interaction_id` PRIMARY KEY |
| Response record | O(1) indexed by `interaction_id` PRIMARY KEY |
| Publication | In-process EventBus emit — negligible |
| M9 ingestion | Same as existing — one append per event |

### No New Startup Replay Loop

The interaction persistence follows the `FileThreadStore` pattern: open DB, run migration, ready for on-demand queries. No startup replay, no O(n) reconstruction.

### Reconciliation: Bounded Indexed Strategy

**Goal**: Committed interaction facts that were not projected (publication failed before process death) must eventually become projected after recoverable failure.

**What C2 MUST NOT implement**: Boot → load every interaction → query M9 individually for every interaction. This is O(n) / N+1 and must be avoided.

**Selected strategy**: Bounded reconciliation via indexed timestamp scan + single M9 batch query.

#### Query Shape

```sql
-- Find interactions created in the last 24 hours that may need reconciliation
-- (bounded by time window, not total interaction count)
SELECT interaction_id, created_at
FROM interactions
WHERE created_at > datetime('now', '-1 day')
ORDER BY created_at ASC
LIMIT 100;
```

```sql
-- Find responses recorded in the last 24 hours that may need reconciliation
SELECT r.interaction_id, r.responded_at
FROM interaction_responses r
WHERE r.responded_at > datetime('now', '-1 day')
ORDER BY r.responded_at ASC
LIMIT 100;
```

#### Indexes Used

```sql
-- Already defined in schema:
CREATE INDEX IF NOT EXISTS idx_interactions_conversation
  ON interactions(conversation_id);

-- New index required for reconciliation:
CREATE INDEX IF NOT EXISTS idx_interactions_created_at
  ON interactions(created_at);

CREATE INDEX IF NOT EXISTS idx_interaction_responses_responded_at
  ON interaction_responses(responded_at);
```

#### Reconciliation Algorithm

```
On API startup (async, after API is serving):

1. Query interactions.created_at index: last 24h, LIMIT 100
   → batch of { interactionId, createdAt }

2. For each interactionId in batch:
   → Compute deterministic eventId: 'interaction:presented:${interactionId}'
   → Check M9: does this eventId exist? (single indexed query)
   → If not: republish 'interaction:presented' via EventBus

3. Query interaction_responses.responded_at index: last 24h, LIMIT 100
   → batch of { interactionId, respondedAt }

4. For each interactionId in batch:
   → Compute deterministic eventId: 'interaction:responded:${interactionId}'
   → Check M9: does this eventId exist? (single indexed query)
   → If not: republish 'interaction:responded' via EventBus

5. If batch was full (100 items), schedule next batch starting from last timestamp
   → Continue until batch is empty
   → Maximum bounded work: ceil(n/100) batches, each O(1) indexed
```

**Alternative (simpler, selected for C2)**: Since interaction volume is expected low (hundreds, not thousands) in early production, and M9 deduplicates via deterministic eventId, a single-pass reconciliation is acceptable:

```
On API startup (async, after API is serving):

1. Query: SELECT interaction_id FROM interactions ORDER BY created_at DESC LIMIT 100;
   → bounded by LIMIT, not total count

2. For each interactionId:
   → eventId = 'interaction:presented:${interactionId}'
   → M9.checkEventId(eventId)  -- single indexed query
   → If missing: EventBus.emit('interaction:presented', { eventId, ... })

3. Query: SELECT interaction_id FROM interaction_responses ORDER BY responded_at DESC LIMIT 100;
   → bounded by LIMIT, not total count

4. For each interactionId:
   → eventId = 'interaction:responded:${interactionId}'
   → M9.checkEventId(eventId)
   → If missing: EventBus.emit('interaction:responded', { eventId, ... })
```

**Complexity**: O(1) per interaction (indexed M9 lookup), O(100) total interactions scanned (bounded by LIMIT). No N+1 over unbounded set. Total work bounded by `min(interaction_count, 100)`.

#### Boot-Critical?

**NO.** Reconciliation runs asynchronously after API is serving. Interactions created during reconciliation window may temporarily lack projection, but are served correctly from the interaction persistence store. Publication failure is recoverable, not fatal.

#### How Missing Presentations/Responses Are Detected

- M9 stores events by `eventId`. Reconciliation computes deterministic `eventId` from `interactionId` and checks M9 directly.
- If `eventId` is absent from M9 → the fact was committed but not projected → republish.
- If `eventId` is present → projection succeeded → skip.

#### How Deterministic Event IDs Make Republishing Safe

- `eventId('interaction:presented:${id}')` is deterministic and immutable.
- M9 `append()` uses `eventId` as deduplication key (UNIQUE constraint in M9 schema).
- Republishing the same event is idempotent — M9 ignores duplicate `eventId`.
- No conditional publish, no outbox, no two-phase commit required.

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

## D1-16: Revised Implementation Surface

### REQUIRED (production)

| # | File/Package | Action | Purpose |
|---|-------------|--------|---------|
| 1 | `packages/interaction-persistence/src/index.ts` | CREATE | Exports `InteractionPersistencePort`, `InteractionPublicationPort`, `SqliteInteractionStore` |
| 2 | `packages/interaction-persistence/src/interaction-persistence-port.ts` | CREATE | `InteractionPersistencePort` interface |
| 3 | `packages/interaction-persistence/src/interaction-publication-port.ts` | CREATE | `InteractionPublicationPort` interface |
| 4 | `packages/interaction-persistence/src/sqlite-store.ts` | CREATE | `SqliteInteractionStore` concrete implementation |
| 5 | `packages/interaction-persistence/src/migrations.ts` | CREATE | `INTERACTION_MANIFEST` migration (interactions + interaction_responses tables, with reconciliation indexes) |
| 6 | `packages/interaction-persistence/package.json` | CREATE | Package manifest |
| 7 | `packages/interaction-persistence/tsconfig.json` | CREATE | TypeScript config |
| 8 | `packages/interaction-app/src/index.ts` | CREATE | Exports `InteractionService` |
| 9 | `packages/interaction-app/src/interaction-service.ts` | CREATE | `InteractionService` class — validates, persists, publishes |
| 10 | `packages/interaction-app/package.json` | CREATE | Package manifest (depends on `@vestara/interaction-persistence`, `@vestara/types`) |
| 11 | `packages/interaction-app/tsconfig.json` | CREATE | TypeScript config |
| 12 | `apps/api/src/routes/interactions.ts` | CREATE | `POST /api/interactions` + `POST /api/interactions/:id/response` (transport boundary) |
| 13 | `apps/api/src/workspace-context.ts` | MODIFY | Wire InteractionService into WorkspaceContext, add async reconciliation on boot |
| 14 | `apps/api/src/server.ts` | MODIFY | Register interaction routes |

### TEST (verification)

| # | File | Purpose |
|---|------|---------|
| 15 | `packages/interaction-persistence/src/__tests__/interaction-store.test.ts` | SQLite store tests (put, get, recordResponse, getResponse, hasResponse, UNIQUE constraint) |
| 16 | `packages/interaction-app/src/__tests__/interaction-service.test.ts` | Service logic tests (validate, persist, publish coordination) |
| 17 | `packages/interaction-app/src/__tests__/interaction-restart-proof.test.ts` | Restart persistence verification |
| 18 | `packages/interaction-app/src/__tests__/interaction-concurrent-proof.test.ts` | Concurrent response race proof |
| 19 | `packages/interaction-app/src/__tests__/interaction-retry-proof.test.ts` | HTTP retry / idempotent response proof |

### PROJECTION (M9 integration)

| # | File | Action | Purpose |
|---|------|--------|---------|
| 20 | `packages/types/src/activity.ts` | MODIFY | Extend `ActivityType` with `'interaction.presented' \| 'interaction.responded'` |
| 21 | `packages/activity-projection/src/m9-adapter.ts` | MODIFY | Add `fromInteractionPresented` + `fromInteractionResponded` adapters |
| 22 | `packages/activity-projection/src/m9-ingestion-bridge.ts` | MODIFY | Add `interaction:presented` + `interaction:responded` to `PATTERN_DISPOSITIONS` |

### NOT REQUIRED (for C2)

| # | Component | Why Not Required |
|---|-----------|-----------------|
| 23 | InteractionCard UI component | LATER UI |
| 24 | SuggestionService adapter | DEFER |
| 25 | Agent/Harness integration | UNRESOLVED C2 boundary |
| 26 | Workflow/Orchestration integration | UNRESOLVED C2 boundary |
| 27 | Marketplace integration | UNRESOLVED C2 boundary |
| 28 | M10 changes | Not required — M10 handles any ActivityRecord |
| 29 | M11 changes | Not required — M11B broadcasts any projected record |
| 30 | `InteractionPresentationPort` | Removed — redundant with InteractionService.present() |

---

## D1-17: Unresolved Questions / Blockers

| # | Question | Impact | Status |
|---|----------|--------|--------|
| 1 | Exact canonical event names | Low | RESOLVED — `interaction:presented` / `interaction:responded` (recommended, freeze after C2 authorizer confirms) |
| 2 | InteractionService package location | Low | RESOLVED — `packages/interaction-app` (producer-neutral) |
| 3 | ActivityType extension | Medium | RESOLVED — Extend `ActivityType` enum with `interaction.presented` / `interaction.responded` |
| 4 | Auth context extraction mechanism | Medium | CLASSIFIED — Must follow existing route auth patterns; gap if Activity Room lacks auth middleware |
| 5 | `conversationId` optional field usage | Low | RESOLVED — Optional, producer provides if context exists |
| 6 | Publication failure recovery | Medium | RESOLVED — Bounded reconciliation scan (LIMIT 100, indexed timestamps, async after boot) |
| 7 | Event identity for retry | Medium | RESOLVED — Deterministic: `interaction:presented:${interactionId}` / `interaction:responded:${interactionId}` |
| 8 | Response identity global uniqueness | Medium | RESOLVED — `response_id` is globally unique authoritative identity, explicit UNIQUE index in schema |

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

1. **Package boundary**: Two producer-neutral packages. `@vestara/interaction-app` (InteractionService) is consumed by `apps/api` and future producers. `@vestara/interaction-persistence` (port + SQLite impl) is consumed by `@vestara/interaction-app`. `@vestara/activity-projection` does NOT depend on either interaction package.

2. **Application boundary**: `InteractionService` (in `@vestara/interaction-app`) — validates, persists, publishes. Does not interpret choices or execute operations. Includes `present()` for producer submission and `recordResponse()` for human response.

3. **Persistence**: Dedicated SQLite (`SqliteInteractionStore`) — self-managed, own file (`.vestara/interactions.db`), own migration. Two tables: `interactions` (immutable presentation fact) + `interaction_responses` (immutable response fact, PRIMARY KEY on interaction_id + UNIQUE on response_id).

4. **Response identity**: `response_id` is globally unique authoritative identity, explicit in schema via UNIQUE index. HTTP retry after lost response may produce new responseId; server derives fresh on each attempt. Same interaction + same choice → idempotent (200, existing response). Same interaction + different choice → conflict (409, existing response preserved). No idempotency-key subsystem required.

5. **Atomic response**: SQLite transaction + UNIQUE constraint is the final concurrency authority. No prior SELECT as gate. Losing concurrent request rolls back completely with no durable side effects.

6. **Lifecycle**: Derived from authoritative facts (response existence check). No persisted lifecycle column. No UPDATE during response recording.

7. **Publication**: After-commit EventBus emission via `InteractionPublicationPort` callback. Deterministic eventId (`interaction:presented:${id}` / `interaction:responded:${id}`) ensures M9 idempotent projection.

8. **Reconciliation**: Bounded indexed strategy (LIMIT 100, timestamp-indexed scans, async after boot). O(1) per interaction checked, O(100) total interactions scanned. No O(n) / N+1 startup regression. M9 deterministic eventId deduplication makes republishing safe.

9. **Transport**: `POST /api/interactions/:id/response` with minimal body `{ selectedChoiceId, correlationId? }`. Server derives responseId, respondedAt, participant identity from auth context. Client cannot impersonate participants.

10. **Continuation boundary**: C2 stops at response recording + publication. Zero domain execution. Producer-specific interpretation of opaque ChoiceId remains UNRESOLVED C2 boundary.

11. **Implementation surface**: 22 files (14 REQUIRED, 5 TEST, 3 PROJECTION). Two new packages (`interaction-persistence`, `interaction-app`). No speculative refactors.

**AR-REC-C2 implementation remains NOT AUTHORIZED.**

---

> **Design complete. No production code, tests, schemas, stores, routes, events, UI components, or behavioral changes were made.**

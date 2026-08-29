# ARX-015 AR-REC-C1 — Interaction Integration Architecture Audit

> **Status**: COMPLETE  
> **Authorized by**: Director  
> **Executed by**: vestara-developer  
> **Date**: 2026-08-29  
> **Frozen baseline**: AR-REC-A at `355922b`, AR-REC-B at `5dc54ba`  
> **Mutation scope**: Audit documentation/evidence only. No production code, contracts, schemas, stores, routes, events, UI components, or behavioral changes.  
> **Primary question**: Given only an `interactionId` and opaque `choiceId`, how can Vestara recover sufficient authoritative provenance to safely continue processing?

---

## Executive Summary

The AR-REC-C1 audit examines every existing Vestara subsystem that could produce, store, project, ingest, or respond to structured interactions. The audit finds:

**No existing substrate stores "a set of choices + presenting source" that can be looked up by `interactionId`.** The AR-REC-B `StructuredInteraction` contract is defined in `@vestara/types` but is never instantiated by any production code. All existing producer subsystems (SuggestionService, Conversation/Message, Harness Approval, Orchestration Dispatch) use their own data shapes and lifecycle. None produces or consumes `StructuredInteraction`.

**The gap is narrow but real.** The minimum integration surface is:
1. A new **durable interaction persistence authority** that holds `StructuredInteraction` objects keyed by `InteractionId`, with atomic one-response-per-interaction enforcement
2. A new **narrow structured response ingress** that accepts `InteractionResponse` and validates it against the stored interaction
3. A **projection/audit publication mechanism** for downstream awareness (M9, evidence trail)

**Governed continuation is an UNRESOLVED C2 integration boundary.** The `presentingParticipantId`, `conversationId`, and `selectedChoiceId` provide provenance/correlation but do not themselves contain domain meaning. The producer/originating capability must retain or be able to recover its own authoritative domain-specific correlation necessary to interpret the opaque choice. C1 does not yet establish how every producer satisfies this requirement.

Three candidate integration architectures are evaluated. **Candidate A (Durable Interaction Authority + Narrow Response Ingress)** is recommended as the minimum viable integration: a durable interaction persistence implementation, a new response endpoint, and a projection/audit publication mechanism — all without modifying existing subsystem contracts. In-memory storage is reference/development-only; production requires durable persistence satisfying restart recovery and atomic response uniqueness.

---

## C1-0: Audit Scope

This audit examines:

| Subsystem | Examined For |
|-----------|-------------|
| SuggestionService | Producer of interaction-like objects, reuse candidate |
| Conversation/Message | Message lifecycle, structured response support |
| Agent Harness | Approval pipeline, decision patterns |
| Orchestration Dispatch | Task-level approval, policy evaluation |
| M9 ActivityStore | Projection infrastructure, persistence substrate |
| M9 IngestionBridge | Event normalization, EventBus integration |
| M10 ProjectionRuntime | Participant projection, attention |
| Engineering Event Store | Durable evidence, append-only event log |
| EventBus (InProcessEventBus) | Pattern matching, event routing |
| Activity Room API (M11A) | Read surface, composeParticipants |
| Activity Room WebSocket (M11B) | Real-time transport, hub |
| Activity Room Legacy | `/api/messages`, `/api/activity-room` |
| Activity Room M11C Page | UI rendering, message submission |
| DecisionService | Decision lifecycle (dormant) |
| Scaffold Migrations | Dormant `decisions` table |
| PolicyEngine | Approval policies |
| Harness Approval Pipeline | Tool-level approval |

---

## C1-1: Contract Inventory

### AR-REC-B Frozen Contract (`packages/types/src/interaction.ts`)

| Type | Purpose | Status |
|------|---------|--------|
| `InteractionId` | Stable branded identity | Defined, exported, unused in production |
| `ChoiceId` | Stable branded choice identity | Defined, exported, unused in production |
| `InteractionChoice` | Choice with label + description | Defined, unused |
| `StructuredInteraction` | Presented interaction envelope | Defined, unused |
| `InteractionResponse` | Human response to interaction | Defined, unused |
| `InteractionLifecycle` | `'presented' \| 'responded' \| 'expired'` | Defined, unused |
| `isStructuredInteraction()` | Type guard | Defined, unused |
| `isInteractionResponse()` | Type guard | Defined, unused |
| `validateInteraction()` | Structural validation (non-empty choices, unique IDs) | Defined, unused |
| `validateResponseForInteraction()` | Relationship validation (interactionId match, choice exists) | Defined, unused |

**Key finding**: The contract is complete and self-contained but has zero production consumers. No subsystem creates, stores, or retrieves `StructuredInteraction` objects. No endpoint accepts `InteractionResponse`.

### Existing Analogous Contracts

| Contract | Location | Analogy | Gap vs StructuredInteraction |
|----------|----------|---------|------------------------------|
| `Suggestion` | `packages/workspace/src/suggestion-service.ts:12-34` | Single recommendation, no multi-choice | No `InteractionId`, no `InteractionChoice[]`, no response capture |
| `Message` | `packages/shared/src/conversation-types.ts:22-33` | Text message in conversation | No structured choices, no response capture, no lifecycle |
| `ApprovalRequest` | `packages/agent-harness/src/index.ts:1199-1224` | Tool execution approval | Domain-specific (tool-call), not reusable for arbitrary interactions |
| `PolicyDecision` | `packages/agent-harness/src/execution-policy.ts:49-67` | Risk assessment result | Consumed by Harness, not exposed as interaction |
| `AttentionItem` | `packages/workspace/src/attention-system.ts:69-79` | Notification/attention signal | No choices, no response capture |

---

## C1-2: Producer / Origin Audit

### SuggestionService

**File**: `packages/workspace/src/suggestion-service.ts`  
**Status**: REUSE/EXTEND  

**Current lifecycle**:
```
deterministicSuggest() → Suggestion[]
aiSuggest() → Suggestion[]
  → storage.store(suggestion)          // persists to dismissed_suggestions / suggestion_feedback
  → getActiveSuggestions(workspace)    // non-dismissed
  → dismiss(id)                        // mark dismissed
  → trackAction(id, action)            // record action taken
  → executeSuggestion(id)              // run suggestion.command
```

**Gaps vs StructuredInteraction**:
- No `InteractionId` — Suggestion uses `string id`
- No `InteractionChoice[]` — singular recommendation, not multi-choice
- No response capture — `trackAction` stores `action: string`, not a structured `InteractionResponse`
- No lifecycle state — no `presented/responded/expired`
- No provenance — no `presentingParticipantId`, `respondingParticipantId`
- `executeSuggestion` is a direct execution authority — violates REC-GOV-01

**Assessment**: SuggestionService is the **highest-value reuse candidate** but cannot directly produce `StructuredInteraction` without extension. A wrapper that:
1. Generates `StructuredInteraction` from Suggestion data (mapping `Suggestion.title` → `content`, creating `InteractionChoice[]` from suggested actions)
2. Stores the interaction in a new `InteractionStore`
3. Captures `InteractionResponse` on human selection
4. Delegates to existing SuggestionService for execution

...would allow SuggestionService to become an interaction producer without modifying its core contract.

### ConversationService / Message

**File**: `packages/shared/src/conversation-types.ts:22-33`, `packages/conversation/src/index.ts`  
**Status**: NO STRUCTURED RESPONSES IN CURRENT CODEBASE  

**Message type**:
```typescript
interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;           // 'system' | 'user' | 'assistant' | 'tool'
  content: string;             // freeform text only
  provider?: string;
  model?: string;
  tokens?: number;
  cost?: number;
  latency?: number;
  createdAt: string;
}
```

**Key finding**: `Message.content` is `string` — freeform text. There is no `structuredResponse` field, no `interactionId` reference, no choice selection data. The Activity Room composer sends messages via `POST /api/messages` with `{ content, agentId? }` body. No existing mechanism attaches a structured response to a message.

**Assessment**: Conversation/Message cannot serve as the interaction store. It is presentation infrastructure. An interaction response could be sent as a message, but the structured data would need to live elsewhere.

### Agent Harness Approval Pipeline

**File**: `packages/agent-harness/src/index.ts` (lines 1080-1290)  
**Status**: DOMAIN-SPECIFIC, NOT REUSABLE FOR AR-REC  

**Approval lifecycle**:
```
createPendingApproval(toolCall, 'tool-call')
  → ApprovalRequest { approvalId, agentId, correlationId, createdAt }
  → decideApproval(approvalId, 'approved' | 'rejected')
  → re-execute tool call or skip
```

**Key invariant**: `actor: { id: identity.agentId || 'agent-harness', role: 'system' }` — role is always `'system'`. The Harness is always the presenter. Human is always the decider.

**Gaps vs StructuredInteraction**:
- Domain-specific: tied to tool execution, not arbitrary interactions
- Binary decision: `approved | rejected`, not N-option choices
- No `InteractionId` — uses `ApprovalRequestId`
- No `InteractionChoice[]` — single approval decision
- Actor identity is always `role: 'system'` — cannot represent agent-originated interactions with agent-specific provenance

**Assessment**: The Harness approval pipeline is **independently authoritative** and remains so. AR-REC interactions that trigger tool execution will re-enter the Harness approval boundary (REC-GOV-03). The Harness is NOT the interaction store.

### Orchestration Dispatch (Task Approval)

**File**: `packages/workflow-orchestrator/src/orchestration-dispatch.ts`  
**Status**: DOMAIN-SPECIFIC, NOT REUSABLE  

**Task approval lifecycle**:
```
orchestrate() → assign()
  → evaluateContext() → approvalPolicy.evaluate(task, changePlan)
    → if policy triggers approval:
      → task enters 'awaiting-approval' state
      → external approval required
```

**Gaps**: Binary approval, no N-option choices, no `InteractionId`, no structured response capture.

**Assessment**: Same as Harness — independently authoritative, not the interaction store.

### DecisionService (Dormant)

**File**: `packages/workspace/src/types.ts` (inferred from scaffold migrations)  
**Status**: DORMANT — schema exists, zero wiring  

**Scaffold migration** (`packages/workspace/src/scaffold-migrations.ts:81-89`):
```sql
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  recommendation_id TEXT,
  selected_option_id TEXT,
  decided_by TEXT,
  decided_at TEXT,
  metadata TEXT
);
```

**Key finding**: This table has the right shape for decision persistence but:
1. Zero wiring — no code reads from or writes to this table
2. Binary pattern — `recommendation_id` + `selected_option_id` suggests 1:1 recommendation→decision
3. No interaction store — decisions table references `recommendation_id` but there is no corresponding `recommendations` or `interactions` table
4. No lifecycle — no `presented/responded/expired` state tracking
5. `metadata TEXT` — generic extension bag, which AR-REC-B explicitly rejected

**Assessment**: Historical design evidence. The `decisions` table could potentially be reused for decision persistence, but it lacks the interaction store (the "presented choices + presenting source" substrate). The `metadata` field violates AR-REC-B's no-extension-bag invariant.

---

## C1-3: Interaction Ownership / State Audit

### What Exists

| Artifact | Status | Can Store StructuredInteraction? |
|----------|--------|----------------------------------|
| `InteractionId` (type) | Defined in `@vestara/types` | N/A — it's a type, not a store |
| `StructuredInteraction` (type) | Defined in `@vestara/types` | N/A — it's a type, not a store |
| `InteractionResponse` (type) | Defined in `@vestara/types` | N/A — it's a type, not a store |
| `InteractionLifecycle` (type) | Defined in `@vestara/types` | N/A — it's a type, not a store |
| `decisions` table | Schema in scaffold migrations | Partial — stores decisions, not interactions |
| `dismissed_suggestions` table | Active in SuggestionService | No — stores dismissal state, not interactions |
| `suggestion_feedback` table | Active in SuggestionService | No — stores action feedback, not interactions |
| `m9_activity_events` table | Active in M9 SQLite store | No — stores ActivityEvents, not StructuredInteractions |
| `engineering_events` table | Active in Engineering Event Store | No — stores raw events, not structured interactions |

### What Does NOT Exist

**There is no interaction store.** No table, no in-memory map, no persistence layer holds `StructuredInteraction` objects keyed by `InteractionId`. This is the primary gap the C2 integration must address.

The `validateResponseForInteraction()` function in `packages/types/src/interaction.ts:263-287` requires both the `InteractionResponse` AND the `StructuredInteraction` to validate. Without a store that can retrieve the interaction by `interactionId`, this validation function cannot be called in production.

---

## C1-4: Persistence Substrate Audit

### Candidate 1: M9 DurableActivityStore

**File**: `packages/activity-projection/src/m9-sqlite-store.ts`  
**Schema**: `m9_activity_events` with `event_id TEXT NOT NULL UNIQUE`  
**Dedup**: Database-level UNIQUE constraint on `event_id`  
**Operations**: `append`, `query`, `getAfter`, `getByEventId`, `replay`, `rebuild`, `getCursor`, `lastSequence`

**Assessment**: M9 is projection/read-model infrastructure. It stores `ActivityEvent` objects (from `@vestara/types`), not `StructuredInteraction` objects. M9's schema is fixed — adding an interaction store would require either:
- A new table (extending M9's scope, which is a governance concern)
- Using `payload.data` JSON field to carry interaction data (possible but semantically wrong — M9 becomes authoritative for interactions)

**Verdict**: REUSE for projection (rendering interactions in Activity Room). NOT the canonical interaction store.

### Candidate 2: Engineering Event Store

**File**: `packages/engineering-event-store/src/index.ts`  
**Schema**: `engineering_events` with `id TEXT NOT NULL UNIQUE`  
**Dedup**: Database-level UNIQUE constraint on `id`  
**Operations**: `appendEvent`, `queryEvents`, `getEventById`, `replayEvents`

**Assessment**: Append-only, hash-chained event log. Could store `interaction.presented` and `interaction.responded` events. However:
- Events are raw `{ id, type, data, timestamp, metadata }` — no structured query by `interactionId`
- Would require application-level indexing to retrieve interaction by ID
- Engineering Event Store is evidence infrastructure, not query infrastructure

**Verdict**: GOOD for durable evidence/audit trail. NOT suitable as primary interaction lookup store.

### Candidate 3: In-Memory Store (New)

**Assessment**: A new in-memory `Map<InteractionId, StructuredInteraction>` for active interactions. Fast lookup by `InteractionId`. No schema migration required.

**Verdict**: RECOMMENDED as reference/development interface only. **NOT production-ready.** Fails: API restart (data lost), process crash (no recovery), delayed human response (interaction gone), replay/reprojection (no durable events), horizontal/multi-process (process-scoped). Production requires a durable interaction persistence implementation satisfying restart recovery and atomic response uniqueness. SQLite is a strong implementation candidate given existing local Vestara architecture, but C1 does not make a storage technology authoritative unless evidence proves that requirement.

### Candidate 4: Decisions Table (Dormant)

**Assessment**: The `decisions` table in scaffold migrations stores decision responses but NOT the original interactions (the "presented choices"). Cannot look up an interaction by `InteractionId` from this table alone.

**Verdict**: NOT suitable as primary interaction store. Could be reused for decision persistence (the "response" side).

### Candidate 5: SuggestionService Storage

**Assessment**: Stores `Suggestion` objects, not `StructuredInteraction`. Different shape, different lifecycle.

**Verdict**: NOT suitable. Reuse candidate at the service layer, not the storage layer.

### Candidate 6: FileThreadStore

**Assessment**: Stores conversation threads. Different domain, different shape.

**Verdict**: NOT suitable.

### Candidate 7: PolicyEngine

**Assessment**: Evaluates policies, does not store interactions.

**Verdict**: NOT suitable.

### Candidate 8: AttentionService

**Assessment**: In-process only, no persistence, no structured choices.

**Verdict**: NOT suitable.

### Candidate 9: ConversationService

**Assessment**: Stores conversations/messages. Different domain.

**Verdict**: NOT suitable.

### Summary

| Candidate | Primary Store? | Evidence Trail? | Projection? | Recommendation |
|-----------|---------------|----------------|-------------|----------------|
| M9 DurableActivityStore | ❌ | ⚠️ (via events) | ✅ | Projection only |
| Engineering Event Store | ❌ | ✅ | ❌ | Evidence trail only |
| In-Memory Store (new) | ⚠️ Reference only | ❌ | ❌ | Development/reference only, NOT production |
| Decisions Table (dormant) | ❌ | ⚠️ | ❌ | Decision persistence (partial) |
| SuggestionService Storage | ❌ | ❌ | ❌ | Not suitable |
| FileThreadStore | ❌ | ❌ | ❌ | Not suitable |
| PolicyEngine | ❌ | ❌ | ❌ | Not suitable |
| AttentionService | ❌ | ❌ | ❌ | Not suitable |
| ConversationService | ❌ | ❌ | ❌ | Not suitable |

---

## C1-5: Event and Projection Audit

### Current EventBus Events

**File**: `packages/activity-projection/src/m9-ingestion-bridge.ts:43-192`

INGEST patterns (→ M9 projection):
- `conversation:created`, `conversation:response.completed`, `conversation:session.started`
- `plan:created`, `plan:approved`
- `changeset:created`, `changeset:applied`
- `verification:started`, `verification:completed`
- `agent:started`, `agent:completed`
- `orchestration.*`

IGNORE patterns (→ not Activity Room facts):
- `workspace:discover.completed`, `workspace:fingerprint.completed`, etc.
- `memory:indexed`, `user:profile.created`, `user:profile.updated`

DEFER patterns (→ future):
- `workspace:opened`, `workspace:indexed`, `workspace:updated`

### Missing Events for AR-REC

| Semantic Fact | Purpose | Current Status |
|---------------|---------|---------------|
| Interaction presented | Interaction created and presented to human — required projection/audit fact | **ABSENT** |
| Interaction responded | Human selected a choice — required projection/audit fact | **ABSENT** |
| Interaction expired | Interaction lifecycle expired — required projection/audit fact | **ABSENT** |
| Interaction superseded | Interaction replaced by newer one — required projection/audit fact | **ABSENT** |

**Classification**: These are required projection/audit semantic facts. The exact EventBus contract names and publishing implementation are C2 design decisions. Existing M9 ingestion architecture provides strong evidence that canonical events are a likely integration mechanism, but C1 does not authorize or freeze exact event names. M9 remains downstream projection.

### EventB routing note

**File**: `packages/event-bus/src/index.ts:158-165`

`InProcessEventBus` uses pattern matching: exact match or prefix glob (`orchestration.*` matches `orchestration.task.started`). The pattern `agent.*` would match `agent.started` and `agent.completed` but would NOT match `agent:started` (dot vs colon separator). New `interaction.*` events would need consistent separator convention.

### M10 Projection Impact

**File**: `packages/activity-projection/src/m10-projection-runtime.ts`

M10 projects ActivityRecords into participant-level summaries. `updateParticipantFromRecord()` (line 144) derives `ParticipantProjection` from ActivityRecords. If interactions are projected as ActivityRecords (via M9), M10 will automatically derive participant-level summary data.

**Assessment**: No M10 changes needed if interactions flow through M9 as ActivityEvents. M10 already handles any ActivityRecord type.

---

## C1-6: Human Response Ingress Audit

### Current Ingress Points

| Endpoint | Method | Body | Can Accept InteractionResponse? |
|----------|--------|------|--------------------------------|
| `POST /api/messages` | POST | `{ content: string, agentId?: string }` | ❌ No structured fields |
| `POST /api/agents/:id/messages` | POST | `{ content: string, agentId?: string }` | ❌ No structured fields |
| `POST /api/conversations` | POST | `{ title: string }` | ❌ Creates conversation, not response |
| `POST /api/conversations/:id/messages` | POST | `{ content: string }` | ❌ Freeform text only |
| WebSocket `/ws/activity-room/v1` | WS | `M11BMessage` union | ❌ No interaction response type |

### Activity Room Composer (UI)

**File**: `apps/workspace/src/pages/activity/M11CActivityRoomPage.tsx`

The Activity Room composer sends messages via:
```typescript
POST /api/messages { content: string, agentId?: string }
```

No `interactionId`, no `selectedChoiceId`, no structured response fields.

**Assessment**: A new ingress point is needed. Options:
1. New `POST /api/interactions/:id/response` endpoint (cleanest separation)
2. Extend `POST /api/messages` with optional `interactionId` + `selectedChoiceId` fields (least disruption)
3. New WebSocket message type in M11B (real-time, but adds complexity)

### WebSocket Transport (M11B)

**File**: `apps/api/src/routes/activity-room-m11b.ts`

M11B handles `M11BMessage` union type: `join-room`, `leave-room`, `ping`. No interaction response type exists. The WebSocket is binary/JSON protocol with buffer capacity 128.

**Assessment**: Could add `interaction-response` message type to M11B. However, this would couple real-time transport to interaction semantics. A REST endpoint is simpler for initial integration.

---

## C1-7: Server-Side Resolution

### validateResponseForInteraction

**File**: `packages/types/src/interaction.ts:263-287`

```typescript
function validateResponseForInteraction(
  response: InteractionResponse,
  interaction: StructuredInteraction,
): readonly InteractionValidationError[]
```

This function validates:
1. `response.interactionId === interaction.interactionId`
2. `response.selectedChoiceId` exists in `interaction.choices`

**Critical gap**: This function requires BOTH the response AND the interaction to be passed in. Without an interaction store, the server cannot retrieve the interaction by `interactionId` to validate against.

### Resolution Chain (Proposed)

```
Human submits InteractionResponse via narrow response ingress
  → Server retrieves StructuredInteraction from durable persistence by interactionId
  → validateResponseForInteraction(response, interaction)
  → If invalid: return 400 with validation errors
  → If valid: persist response fact atomically (one response per interaction)
  → [END OF INTERACTION PERSISTENCE AUTHORITY]
  → Projection/audit publication mechanism makes fact available for M9/evidence
  → M9 projects into Activity Room
```

**The API endpoint is transport and MUST NOT become authoritative event owner.** The interaction persistence authority records the response fact. The exact application/domain publishing owner for projection/audit publication is a C2 design decision.

### Existing Analogous Resolution

**Harness Approval Resolution** (`packages/agent-harness/src/index.ts:1260-1289`):
```
decideApproval(approvalId, decision)
  → Retrieve ApprovalRequest from in-memory Map
  → Validate decision is 'approved' | 'rejected'
  → Execute callback if approved
  → Remove from pending approvals
```

The Harness uses an in-memory `Map<string, PendingApproval>` for its own domain-specific approval pipeline. This is an existing pattern for in-process lookup, but the interaction persistence authority requires durable persistence (not in-memory) for production.

---

## C1-8: Operational Idempotency / Retry Audit

### M9 Deduplication

**File**: `packages/activity-projection/src/m9-sqlite-store.ts:36`

```sql
event_id TEXT NOT NULL UNIQUE
```

M9 deduplicates by `event_id` at the database level. Same `event_id` → same `ActivityRecord`. This provides idempotent ingestion.

### Engineering Event Store Dedup

**File**: `packages/engineering-event-store/src/migrations.ts:13`

```sql
id TEXT NOT NULL UNIQUE
```

Same pattern — database-level uniqueness on `id`.

### Interaction Response Idempotency

**Gap**: No existing mechanism prevents duplicate `InteractionResponse` submissions for the same `interactionId`. Without a durable interaction persistence:
1. Cannot check if a response already exists for the interaction
2. Cannot enforce "one authoritative response per interaction" invariant
3. Cannot detect double-click / retry duplicates

**Production requirement**: One authoritative response per interaction, unless a future explicitly authorized product contract changes that invariant. `UNIQUE(interaction_id)` or equivalent durable atomic enforcement is a valid C2 candidate.

**Idempotency classification**:
- Same interaction + same authoritative response identity → candidate idempotent retry
- Same interaction + conflicting response identity → candidate conflict
- Exact transactional behavior remains C2 design

**Note on `correlationId`**: The `InteractionResponse.correlationId` field exists in the frozen B contract as provenance/correlation. C1 does not make correlation-based uniqueness a separate production requirement merely because `correlationId` exists. `correlationId` remains provenance/correlation unless a later contract explicitly defines dedup semantics for it.

---

## C1-9: Staleness and Validity Boundary

### Mechanical Validity (Detectable by Durable Persistence)

| Condition | Detection | Resolution |
|-----------|-----------|------------|
| Interaction does not exist | Store lookup returns undefined | Return 404 |
| Interaction already has response | `hasResponse(interactionId)` | Return 409 Conflict |
| `selectedChoiceId` not in interaction choices | `validateResponseForInteraction` | Return 400 |
| `interactionId` mismatch | `validateResponseForInteraction` | Return 400 |
| Response already recorded with same `correlationId` | Correlation lookup | Return 409 |

### Domain Validity (Must Remain with Downstream Systems)

| Condition | Who Detects | Resolution |
|-----------|-------------|------------|
| Interaction is stale (state changed since presentation) | Downstream authority (REC-GOV-08) | Reject or re-evaluate |
| Selected choice is no longer valid | Downstream authority | Reject with explanation |
| Actor is not authorized to respond | Downstream authority | Reject with authorization error |
| Interaction expired by policy | Downstream authority | Reject with staleness error |

**Key invariant (REC-GOV-08)**: "A decision created against state at T1 may be acted upon at T2 only after the appropriate downstream authority evaluates current state." The interaction store handles mechanical validity only. Domain validity is the responsibility of whatever system receives the interaction response.

---

## C1-10: Governed Continuation — UNRESOLVED C2 BOUNDARY

### Status: UNRESOLVED

Governed continuation is an **UNRESOLVED C2 integration boundary**, not a solved existing path.

### What is established

The interaction persistence authority's responsibility ends at:
1. Persisting the response fact (one response per interaction)
2. Making the fact available for projection/audit

The `presentingParticipantId`, `conversationId`, and `selectedChoiceId` provide provenance/correlation but do not themselves contain domain meaning. `selectedChoiceId` is an opaque correlation key — it does not encode executable semantics.

### What is NOT established

**The producer/originating capability must retain or be able to recover its own authoritative domain-specific correlation necessary to interpret the opaque choice.** This correlation MUST NOT be moved into Activity Room or encoded into generic interaction fields such as `command`, `operation`, `handler`, `route`, `payload`, `metadata`, `context`, or equivalent executable/domain escape hatches.

C1 does not yet establish how every producer satisfies this requirement. Therefore governed continuation remains an UNRESOLVED C2 integration boundary.

### What C1 explicitly does NOT propose

- Changes to Harness, Workflow, Agents, Orchestration, or other producers
- Operation dispatchers, command routers, choiceId→handler maps
- Choice label→behavior maps, generic capability executors
- Activity Room execution paths

### Existing continuation paths (independent, not repurposed)

**Path 1: Freeform Message → Agent Wake** (`apps/api/src/routes/activity-room.ts:175-183`)
```
POST /api/messages → sendActivityMessage() → maybeWakeAddressedAgent()
```
Existing path for freeform messages. Not repurposed for interaction responses.

**Path 2: Approval Decision → Tool Re-execution** (`packages/agent-harness/src/index.ts:1260-1289`)
```
decideApproval(approvalId, 'approved') → re-execute tool call
```
Domain-specific to tool execution. Independently authoritative.

**Path 3: Task Approval → Orchestration Resume** (`packages/workflow-orchestrator/src/orchestration-dispatch.ts`)
```
approval received → resume task execution
```
Domain-specific to task orchestration. Independently authoritative.

These paths exist independently. C1 does not establish that any of them can safely receive an opaque `ChoiceId` and interpret it without the originating capability retaining its own domain-specific correlation.

---

## C1-11: Runtime Call Graphs

### Graph 1: Interaction Presentation (Agent → Human)

```
Agent generates recommendation
  → SuggestionService.deterministicSuggest() / aiSuggest()
    → Returns Suggestion[]
  → [C2] InteractionAdapter.createInteraction(suggestion)
    → Maps Suggestion → StructuredInteraction
    → [C2] Durable persistence stores interaction
    → [C2] Projection/audit publication mechanism makes fact available
  → [C2] M9IngestionBridge handles interaction-presented fact
    → [C2] fromInteractionPresented() adapter
    → M9.append(activityEvent)
  → Activity Room UI renders interaction
    → M11CActivityRoomPage receives ActivityRecord via WebSocket
    → [C2] Renders interaction with choices
```

**Missing edges** (all C2 design decisions):
1. No durable interaction persistence exists
2. No projection/audit publication mechanism exists
3. No M9 adapter for interaction facts exists
4. No interaction presentation UI component exists

### Graph 2: Interaction Response (Human → System)

```
Human clicks choice in Activity Room UI
  → [C2] Narrow structured response ingress
    → { responseId, interactionId, selectedChoiceId, respondingParticipantId, ... }
  → [C2] Durable persistence retrieves StructuredInteraction by interactionId
  → [C2] validateResponseForInteraction(response, interaction)
  → [C2] Durable persistence records response fact atomically
  → [END OF INTERACTION PERSISTENCE AUTHORITY]
  → [C2] Projection/audit publication mechanism makes fact available
  → [C2] M9 projects into Activity Room
  → [UNRESOLVED] Governed continuation — producer retains domain-specific correlation
```

**Missing edges** (all C2 design decisions):
1. No durable interaction persistence exists
2. No narrow structured response ingress exists
3. No projection/audit publication mechanism exists
4. Governed continuation is UNRESOLVED — originating capability must interpret opaque ChoiceId using its own domain-specific correlation

### Graph 3: Tool Approval (Existing, Independent)

```
Agent invokes tool
  → Harness.resolveEffectivePolicy()
    → disposition: 'require-approval'
  → Harness.createPendingApproval(toolCall, 'tool-call')
    → ApprovalRequest { approvalId, ... }
    → EventBus.emit('approval.requested', ...)
  → Human approves
    → POST /api/approvals/:id (or similar)
    → Harness.decideApproval(approvalId, 'approved')
    → Re-execute tool call
```

**Note**: This path is independent of AR-REC. After a human interaction response triggers governed continuation, if the downstream authority encounters a tool approval boundary, the Harness pipeline handles it separately.

### Graph 4: Task Approval (Existing, Independent)

```
Task dispatched
  → OrchestrationDispatch.assign()
    → approvalPolicy.evaluate(task, changePlan)
    → If approval required: task enters 'awaiting-approval'
  → External approval received
    → Task resumes execution
```

**Note**: Independent of AR-REC. Task approval is a separate governance boundary.

### Graph 5: Freeform Message → Agent Wake (Existing)

```
Human types message in Activity Room
  → POST /api/messages { content, agentId? }
    → sendActivityMessage() → creates ActivityRecord
    → maybeWakeAddressedAgent(ctx, record)
      → Checks if agent is idle
      → Wakes agent if needed
```

**Note**: This is the existing path. Interaction responses could piggyback on this path by sending a message with the interaction context, but structured data would be lost.

### Graph 6: M9 Ingestion (Existing)

```
EventBus event emitted
  → M9IngestionBridge.onEvent()
    → Pattern matches against PATTERN_DISPOSITIONS
    → If INGEST: normalize via adapter → M9.append()
    → If IGNORE: skip
    → If DEFER: skip
  → M9 stores ActivityRecord
  → M10 ProjectionRuntime projects into ParticipantProjection
  → WebSocket broadcasts to connected clients
```

**Note**: Existing M9 ingestion architecture provides strong evidence that canonical events are a likely integration mechanism for interaction projection. C2 would add interaction-related patterns to `PATTERN_DISPOSITIONS` and corresponding adapters. Exact event names are C2 design decisions.

### Graph 7: WebSocket Broadcast (Existing)

```
M9.append() → new ActivityRecord
  → M10 ProjectionRuntime.updateParticipantFromRecord()
  → M11B background activity watcher polls M9 every 500ms
    → Detects new records
    → Broadcasts via hub to connected WebSocket clients
  → Activity Room UI receives update
    → Renders new activity in stream
```

---

## C1-12: Ownership Matrix

| Capability | Current Owner | AR-REC Needs | Gap |
|-----------|--------------|-------------|-----|
| Interaction identity | Nobody (type only) | Durable persistence authority | NEW: persistence + lookup |
| Choice identity | Nobody (type only) | Durable persistence authority | NEW: embedded in interaction |
| Interaction presentation | SuggestionService (partial) | Producer + persistence authority | NEW: producer integration + persistence |
| Interaction persistence | Nobody | Durable persistence authority | NEW: durable persistence (not in-memory) |
| Interaction lifecycle | Nobody | Derived from facts | NEW: presented/responded/expired derivation |
| Response capture | Nobody | Narrow structured response ingress | NEW: transport boundary |
| Response validation | `validateResponseForInteraction` (unused) | Persistence authority + ingress | NEW: wire validation |
| Response idempotency | Nobody | Atomic one-response-per-interaction | NEW: durable constraint |
| Staleness detection | Nobody | Downstream authorities | UNRESOLVED: C2 boundary |
| Governance re-entry | Existing Harness/Orchestration | Existing (unchanged) | NONE |
| Activity Room rendering | M11C + M10 | [C2] Interaction presentation component | NEW: UI component (LATER UI) |
| Evidence trail | M9 + Engineering Event Store | M9 + Engineering Event Store | NONE (add patterns) |
| Participant projection | M10 ProjectionRuntime | M10 (unchanged) | NONE |
| Real-time transport | M11B WebSocket | M11B (unchanged) | NONE |
| Projection/audit publication | Nobody | Publication mechanism | NEW: exact owner is C2 design decision |
| Governed continuation | Nobody | Producer retains domain correlation | UNRESOLVED: C2 boundary |

---

## C1-13: Candidate Integration Architectures

### Candidate A: Durable Interaction Authority + Narrow Response Ingress (RECOMMENDED)

**Capabilities/Responsibilities**:
1. **Durable interaction persistence authority** — stores `StructuredInteraction` objects keyed by `InteractionId`, with restart recovery
2. **Atomic one-response-per-interaction enforcement** — `UNIQUE(interaction_id)` or equivalent durable constraint
3. **Authoritative interaction lookup by InteractionId** — O(1) retrieval for validation
4. **Narrow structured response ingress** — transport boundary that accepts `InteractionResponse`, validates structurally, delegates to persistence
5. **Projection/audit publication mechanism** — makes interaction facts available for M9 and evidence trail (exact ownership is C2 design decision)
6. **M9 normalization/projection support** — adapters and pattern dispositions for M9 ingestion

**Pros**:
- Clean separation: persistence authority, transport boundary, publication mechanism
- No modification to existing subsystems (SuggestionService, Harness, Conversation)
- AR-REC-B contract used directly (no new types)
- M9 projection works via existing ingestion architecture patterns
- Follows existing patterns (M9 ingestion bridge, durable persistence)

**Cons**:
- New persistence implementation to maintain
- Requires LATER UI component for Activity Room rendering
- Governed continuation remains UNRESOLVED C2 boundary

### Candidate B: Extend Message with Structured Response

**Components**:
1. Extend `Message` type with optional `structuredResponse?: InteractionResponse`
2. Extend `POST /api/messages` with optional `interactionId` + `selectedChoiceId`
3. ConversationService handles response validation
4. M9 already projects messages

**Pros**:
- Minimal new infrastructure
- Reuses existing message flow
- M9 projection works automatically

**Cons**:
- Modifies existing `Message` contract (violates "no modification to existing subsystems")
- Couples conversation messaging to interaction semantics
- Cannot look up interaction by `interactionId` without a separate store
- Violates ownership boundary: Conversation owns messaging, StructuredInteraction owns interaction semantics

### Candidate C: Extend SuggestionService Directly

**Components**:
1. Add `InteractionId` field to `Suggestion` type
2. Add `choices: InteractionChoice[]` to `Suggestion`
3. Add `recordResponse(suggestionId, response)` method
4. SuggestionService becomes the interaction store

**Pros**:
- Builds on existing service
- No new store class

**Cons**:
- SuggestionService owns suggestion lifecycle, not interaction semantics
- Couples suggestion generation to interaction persistence
- Cannot represent interactions that originate outside SuggestionService
- Violates AR-REC-B: "Interaction identity/choices/responses should not depend on SuggestionService ownership"

### Candidate D: Dormant Decisions Table + New Interactions Table

**Components**:
1. Create `interactions` table (mirroring AR-REC-B types)
2. Wire dormant `decisions` table for response persistence
3. New API endpoints for interaction CRUD + response submission

**Pros**:
- Durable persistence from day one
- Reuses dormant schema

**Cons**:
- Schema-first approach without service layer
- No in-memory fast path
- New table requires migration
- More complex than in-memory store for initial integration

### Recommendation

**Candidate A** is recommended. It provides the cleanest separation, follows existing patterns (M9 ingestion bridge, durable persistence), and does not modify any existing subsystem contracts. Production requires a durable interaction persistence implementation satisfying restart recovery and atomic response uniqueness. In-memory storage is reference/development-only.

---

## C1-14: C2 Minimum Wiring Recommendation

### REQUIRED Capabilities/Responsibilities

These are the minimum capabilities C2 must provide. C1 describes capabilities/responsibilities before premature concrete class freezing.

| # | Capability | Architectural Requirement |
|---|-----------|--------------------------|
| 1 | **Durable interaction persistence authority** | Stores `StructuredInteraction` objects keyed by `InteractionId`. Satisfies: restart recovery, delayed human response, replay/reprojection. Production requires durable persistence, not in-memory. |
| 2 | **Authoritative interaction lookup by InteractionId** | O(1) retrieval for structural validation. Satisfies: `validateResponseForInteraction` can be called in production. |
| 3 | **Atomic one-response-per-interaction enforcement** | `UNIQUE(interaction_id)` or equivalent durable constraint. Satisfies: production idempotency, double-click/retry protection. |
| 4 | **Narrow structured response ingress** | Transport boundary that accepts `InteractionResponse`, validates structurally, delegates to persistence. Satisfies: human response capture without modifying existing ingress paths. |
| 5 | **Projection/audit publication mechanism** | Makes interaction facts available for M9 projection and evidence trail. Satisfies: Activity Room rendering, audit/certification. |
| 6 | **M9 normalization/projection support** | Adapters and pattern dispositions for M9 ingestion. Satisfies: Activity Room renders interactions via existing M9/M10/M11B pipeline. |

### UNRESOLVED C2 Design Decisions

These items are identified as required but their exact implementation is a C2 design decision:

| # | Item | Why Unresolved |
|---|------|---------------|
| 1 | **Application/domain boundary responsible for publication** | C1 establishes the semantic need to publish authoritative interaction facts for projection, but must leave the exact application/domain publishing owner for C2 design. The API endpoint is transport and MUST NOT become authoritative event owner. |
| 2 | **Producer-specific opaque-choice interpretation/continuation** | The producer/originating capability must retain or be able to recover its own authoritative domain-specific correlation necessary to interpret the opaque choice. C1 does not establish how every producer satisfies this. |
| 3 | **Exact canonical event names/contracts** | C1 classifies "interaction presented" and "interaction responded" as required projection/audit semantic facts. The exact EventBus contract names are C2 design decisions. Existing M9 ingestion architecture provides strong evidence that canonical events are a likely integration mechanism. |

### DEFER

| # | Item | Why Deferred |
|---|------|-------------|
| 1 | **SuggestionService adapter** | Maps existing SuggestionService output to StructuredInteraction format. Not required for initial interaction flow — only needed when SuggestionService becomes an interaction producer. |

### LATER UI

| # | Item | Why Later |
|---|------|----------|
| 1 | **InteractionCard / recommendation presentation** | Renders `StructuredInteraction` with choice buttons. Required for full Activity Room UI, but not for API-level interaction flow. |

### What NOT to Wire in C2

- Domain-specific routing (which downstream authority processes the response) — UNRESOLVED
- Staleness detection (domain validity) — UNRESOLVED
- Lifecycle management (expiration, superseding) — UNRESOLVED
- Attention integration — LATER
- Cross-domain generality verification — LATER

---

## C1-15: Evidence and References

### Source Files Examined

| File | Lines | Finding |
|------|-------|---------|
| `packages/types/src/interaction.ts` | 1-299 | AR-REC-B frozen contract, complete, unused |
| `packages/types/src/interaction-architecture.ts` | 1-~100 | B1 Architecture Selection Record |
| `packages/types/__tests__/interaction-contract.test.ts` | 1-~500 | 65 verification tests |
| `packages/workspace/src/suggestion-service.ts` | 1-641 | Primary reuse candidate, no interaction support |
| `packages/shared/src/conversation-types.ts` | 1-89 | Message is text-only, no structured responses |
| `packages/conversation/src/index.ts` | 1-~500 | ConversationService, message lifecycle |
| `packages/agent-harness/src/index.ts` | 1-~1300 | Approval pipeline, domain-specific |
| `packages/agent-harness/src/execution-policy.ts` | 1-~100 | PolicyDecision, risk assessment |
| `packages/workflow-orchestrator/src/orchestration-dispatch.ts` | 1-~500 | Task approval, domain-specific |
| `packages/workflow-orchestrator/src/policies.ts` | 1-~100 | DefaultRiskApprovalPolicy |
| `packages/workspace/src/attention-system.ts` | 1-~300 | AttentionItem, in-process only |
| `packages/workspace/src/scaffold-migrations.ts` | 1-~150 | Dormant decisions table |
| `packages/engineering-event-store/src/index.ts` | 1-~550 | Append-only event log |
| `packages/activity-projection/src/m9-sqlite-store.ts` | 1-~300 | M9 SQLite store, dedup by event_id |
| `packages/activity-projection/src/m9-ingestion-bridge.ts` | 1-~510 | EventBus → M9 normalization |
| `packages/activity-projection/src/m9-adapter.ts` | 1-~300 | M9 adapters (no interaction adapter) |
| `packages/activity-projection/src/m10-projection-runtime.ts` | 1-~200 | Participant projection |
| `packages/event-bus/src/index.ts` | 1-~250 | InProcessEventBus pattern matching |
| `packages/policy-engine/src/default-policy-engine.ts` | 1-~200 | PolicyEngine |
| `apps/api/src/index.ts` | 1-~500 | API boot, composition root |
| `apps/api/src/routes/activity-room-m11a.ts` | 1-~400 | M11A API, composeParticipants |
| `apps/api/src/routes/activity-room-m11b.ts` | 1-~400 | M11B WebSocket transport |
| `apps/api/src/routes/activity-room.ts` | 1-~490 | Legacy Activity Room API |
| `apps/workspace/src/pages/activity/M11CActivityRoomPage.tsx` | 1-~600 | Main Activity Room page |

### Commits Referenced

| Commit | Description |
|--------|-------------|
| `355922b` | AR-REC-A frozen baseline |
| `5dc54ba` | AR-REC-B frozen baseline |
| `d545736` | Agent participant lifecycle bridge |
| `31a3995` | Identity separation fix |
| `b890b91` | Agent/Team Authority Integration |
| `51635e9` | Bulk commit (102 files) |
| `16d5d41` | Startup latency remediation |
| `433b7eb` | M9IngestionBridge + smoke proof |

---

## Conclusion

The AR-REC-C1 audit establishes that:

1. **Vestara requires a small durable interaction authority** capable of resolving immutable `StructuredInteraction` objects by `InteractionId` and durably recording at most one `InteractionResponse`. Existing substrates do not truthfully own this responsibility.

2. **No existing substrate stores "a set of choices + presenting source" that can be looked up by `interactionId`.** This is the primary gap. The AR-REC-B contract is complete but has zero production consumers.

3. **Production requires a durable interaction persistence implementation** satisfying restart recovery and atomic response uniqueness. In-memory storage is reference/development-only. SQLite is a strong implementation candidate given existing local Vestara architecture.

4. **M9 remains downstream projection.** The interaction persistence authority is separate from M9. M9 projects interaction facts for Activity Room rendering via existing ingestion architecture patterns.

5. **A narrow structured response ingress is required** — a transport boundary that accepts `InteractionResponse`, validates structurally, and delegates to persistence. The API endpoint is transport and MUST NOT become authoritative event owner.

6. **Projection/audit publication mechanism is required** but exact publication ownership and event contracts are C2 design decisions.

7. **Governed continuation is an UNRESOLVED C2 integration boundary.** The producer/originating capability must retain or be able to recover its own authoritative domain-specific correlation necessary to interpret the opaque choice. This correlation MUST NOT be moved into Activity Room or encoded into generic interaction fields. C1 does not establish how every producer satisfies this requirement.

8. **Three candidate architectures were evaluated.** Candidate A (Durable Interaction Authority + Narrow Response Ingress) is recommended as the minimum viable integration.

**Unresolved C2 boundaries**:
- Application/domain boundary responsible for publication
- Producer-specific opaque-choice interpretation/continuation
- Exact canonical event names/contracts

**AR-REC-C2 remains NOT AUTHORIZED.** This audit provides the evidence base for a future C2 authorization decision.

---

> **Audit complete. No production code, contracts, schemas, stores, routes, events, UI components, or behavioral changes were made.**

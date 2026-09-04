---
title: ARX-015 AR-REC-C2-I3-D1 — Producer Ownership / Continuation Topology Design
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# ARX-015 AR-REC-C2-I3-D1 — Producer Ownership / Continuation Topology Design

> **Status**: DESIGN/EVIDENCE ONLY  
> **Authorized by**: Director  
> **Executed by**: vestara-developer  
> **Date**: 2026-08-30  
> **Frozen baselines**: AR-REC-A at `355922b`, AR-REC-B at `5dc54ba`, AR-REC-C1 at `fc30f8b`, AR-REC-C2-D1 at `83e68cc`, AR-REC-C2-I1 at `4418709`, AR-REC-C2-I2-C1 at `a8cc2e3`, AR-REC-C2-I2-I1 at `f83e1a4`, C2-I3-PREFLIGHT at `e2b6164`  
> **Mutation scope**: Documentation/evidence only. No production code, tests, schemas, stores, routes, events, UI components, or behavioral changes.

---

## D1-0: Objective

Determine the minimum topology for associating:

```
domain-owned pending state
         ↕
interactionId
         ↕
authoritative InteractionResponse
```

while preserving:
- Generic interaction infrastructure knows no domains
- Activity Room knows no domains
- ChoiceId has no global meaning
- Adding a future producer does not require editing a central dispatcher

---

## D1-1: Creation-Side Ownership Lifecycle

### 1.1 Complete Future Ownership Lifecycle

```
Originating domain (e.g., Marketplace, Workflow, Diagnostics)
  ↓
creates durable pending domain context
  - Stores: { interactionId, domainObject, choiceInterpretation, createdAt, ... }
  - Persists to domain-owned SQLite (or other durable store)
  - This is the domain's own state — not part of generic interaction system
  ↓
establishes interaction ownership/correlation
  - Option 1: Domain records interactionId ↔ pending context mapping in its own store
  - Option 2: Domain populates correlationId on the InteractionResponse at creation time
  - Option 3: Domain uses presentingParticipantId as a known prefix for its interactions
  ↓
InteractionService.present(interaction)
  - Generic system persists the interaction fact
  - Generic system emits interaction:presented
  - M9 ingests for Activity Room projection
  - Generic system knows nothing about the domain
  ↓
... human considers ...
  ↓
HTTP POST /api/interactions/:id/responses { choiceId }
  - Generic system persists the response fact (frozen)
  - Generic system emits interaction:responded
  - M9 ingests for Activity Room projection
  ↓
Domain subscriber receives interaction:responded
  - Extracts interactionId from event payload
  - Queries own durable pending context by interactionId
  - If found: revalidates domain state, continues through governance
  - If not found: ignores (not its interaction)
```

### 1.2 The Critical Observation

The creation side establishes ownership through **durable domain state**, not through the generic interaction system. The generic system only needs to emit the event. The domain needs to:
1. Remember what it created (durable pending context)
2. Listen for the response (EventBus subscription)
3. Match the response to its context (lookup by interactionId)

This is the same pattern used by the harness approval system:
- Harness creates approval request → persists as thread item
- Human resolves approval → `decideApproval()` reads thread items by `(threadId, approvalId)`
- No central registry — durable state IS the ownership authority

### 1.3 Evidence: Existing Ownership Lifecycle Patterns

| System | Creation | Persistence | Lookup Key | Continuation |
|--------|----------|-------------|------------|-------------|
| Harness approval | `approval-request` thread item | SQLite thread store | `(threadId, approvalId)` | `decideApproval()` reads durable state |
| Orchestrator approval | Task status → `awaiting-approval` | SQLite task store | `(projectId, taskId)` | `resolveTaskApproval()` reads durable state |
| Conversation response | `conversation:response.completed` event | SQLite conversation store | `conversationId` | CLI handler reads conversation by ID |
| Engineering events | `harness.*` events | SQLite event store | `threadId` / `turnId` | Query after the fact |

**Pattern:** Create durable state → emit event → domain reads durable state by identity. No central registry.

---

## D1-2: Response-Side Call Graph

```
interaction:responded event
  ↓
EventBus fans out to ALL subscribers
  ↓
┌─────────────────────────────────────────────────────┐
│ Subscriber 1: M9IngestionBridge                     │
│   - Ingests into Activity Room (existing)            │
│   - Blind projection — processes every event         │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│ Subscriber 2: Marketplace domain handler             │
│   - Reads interactionId from event                   │
│   - Queries own store: SELECT * WHERE interactionId  │
│   - If found: revalidate, continue                   │
│   - If not found: ignore                             │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│ Subscriber 3: Workflow domain handler                │
│   - Reads interactionId from event                   │
│   - Queries own store: SELECT * WHERE interactionId  │
│   - If found: revalidate, continue                   │
│   - If not found: ignore                             │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│ Subscriber N: Future domain handler                  │
│   - Same pattern — no central coordination needed    │
└─────────────────────────────────────────────────────┘
```

**Key:** The EventBus does the fan-out. Each domain subscriber independently queries its own durable state. No central dispatcher is involved.

---

## D1-3: Ownership Authority

### 3.1 Who Owns Interpretation of Interaction X?

**Answer:** The domain that created the interaction and durably recorded the pending context.

**Evidence:** The `StructuredInteraction` carries `presentingParticipantId` — this identifies the creator. But the ownership authority is not this string — it is the **durable pending context in the domain's own store**. The `presentingParticipantId` is a display field, not an ownership key.

### 3.2 Ownership Invariant

```
For any interactionId:
  - Exactly one domain's durable store contains a pending context
    mapping that interactionId to domain-specific interpretation
  - That domain is the sole authority for interpreting responses
    to that interaction
  - The generic interaction system does NOT enforce this uniqueness
  - The domain enforces it through its own store constraints
```

### 3.3 Ownership vs. Interpretation

| Concept | Authority | Enforcement |
|---------|-----------|-------------|
| "Who created this interaction?" | `presentingParticipantId` (display) | Generic system |
| "Who owns the pending context for this interaction?" | Domain's durable store | Domain (store constraint) |
| "What does choiceId X mean?" | Domain's interpretation mapping | Domain (application logic) |
| "Is this operation still valid?" | Domain's revalidation | Domain (current state query) |
| "Is this operation authorized?" | Governance stack | Existing approval system |

---

## D1-4: Persistence Ownership

| Layer | What It Persists | Who Owns It |
|-------|-----------------|-------------|
| Interaction facts | `StructuredInteraction`, `InteractionResponse` | Generic interaction authority |
| Publication ledger | Event delivery state | Generic interaction authority |
| M9 activity records | Activity Room projection | Activity Room projection |
| **Domain pending context** | `interactionId ↔ domain object, choiceInterpretation` | **Domain** |
| **Domain revalidation result** | Whether operation is still valid | **Domain** |
| **Governance approval** | Whether operation is authorized | **Governance stack** |

**The domain's pending context is the ownership authority.** It is not part of the generic interaction system. It is not part of Activity Room. It is not part of M9.

---

## D1-5: Topology Comparison

### Topology A: Central InteractionResponseBridge

```
interaction:responded
  ↓
Central InteractionResponseBridge
  ↓
looks up producer ownership from ???
  ↓
routes to correct producer
  ↓
producer revalidates, continues
```

**How it resolves ownership:**
The bridge must answer "which producer owns interaction X?" Options:
1. **Producer enumeration** — maintain a list of known producers. REJECTED: requires editing bridge for each new producer.
2. **Domain switch/case** — `switch(presentingParticipantId) { case 'marketplace': ... }`. REJECTED: hardcoded routing.
3. **Domain service registry** — maintain a `Map<interactionId, producerId>`. REJECTED: creates a central dispatcher that owns all interactions.
4. **Query all producer stores** — ask each producer "is this yours?". REJECTED: O(producers) per response, creates coupling.

**Verdict:** REJECTED. Every ownership resolution mechanism turns the bridge into a central dispatcher. The bridge pattern works for bounded event namespaces (harness.*, agent.*) where the bridge is a blind projection, not for open-ended producer ownership.

### Topology B: Domain-Owned Subscribers

```
interaction:responded
  ↓
EventBus fans out
  ↓
Each domain independently subscribes
  ↓
Each domain queries its own durable state
  ↓
Only the owning domain acts
```

**How it resolves ownership:**
Each domain queries its own store for the interactionId. If found, it owns it. If not, it ignores.

**Evidence support:**
- EventBus supports `interaction:responded` exact match and `interaction:*` prefix wildcard
- Existing bridges use wildcard subscription + payload extraction
- Harness approval uses durable state query by identity (`(threadId, approvalId)`)
- No central coordination needed

**Verdict:** RECOMMENDED. Follows proven patterns, no central dispatcher, genericity preserved.

### Topology C: Existing Correlation Mechanism

**Search results:** No durable ownership registration mechanism exists. The `OwnershipRegistry` is in-memory only. The publication ledger is delivery-tracking, not ownership-tracking. The `correlationId` field is not used for routing.

**Verdict:** INSUFFICIENT EVIDENCE. No existing mechanism can be reused without modification.

### Topology D: Evidence-Supported Alternative

**None found.** Topology B is the only architecture supported by repository evidence.

---

## D1-6: Dependency-Direction Comparison

### Topology A: Central Bridge

```
Generic interaction infrastructure
  → Central bridge (depends on generic)
    → knows about all producers (coupling)
      → each producer
```

**Dependency violation:** The central bridge must depend on all producers to resolve ownership. This creates a dependency fan-in to the bridge, making it a central coordination point.

### Topology B: Domain Subscribers

```
Generic interaction infrastructure
  → EventBus (decoupled delivery)
    ← Each producer subscribes independently
      → Each producer's own durable state
```

**Dependency compliance:**
- Generic interaction infrastructure depends on: persistence, EventBus, M9 (for publication verification)
- Each producer depends on: generic interaction infrastructure (for event types only), own durable state
- No producer depends on another producer
- No central bridge depends on producers
- **Acyclic, decoupled, composable**

---

## D1-7: Restart Behavior

### Topology A: Central Bridge

1. API restarts
2. Central bridge re-subscribes to EventBus
3. If bridge has durable state: it survives
4. If bridge is stateless: it must re-derive ownership from producer stores
5. If bridge has a registry: registry must be durable or rebuilt

**Problem:** The bridge's ownership resolution mechanism must survive restarts. If it's a registry, it must be durable. If it queries producers, it creates startup coupling.

### Topology B: Domain Subscribers

1. API restarts
2. Each producer re-subscribes to EventBus (standard bridge pattern)
3. Each producer queries its own durable pending contexts
4. Producers can reconcile: "I have pending interactions that haven't been responded to"
5. No central coordination needed

**Advantage:** Each producer is self-sufficient. No central component needs to survive restarts. The durable pending context in each producer's store is the recovery authority.

**Evidence:** This is exactly how `reconcileInterruptedThreads()` works — at boot, query durable state for unprocessed items, act on them.

---

## D1-8: Duplicate Delivery Behavior

### EventBus Semantics

The `InProcessEventBus` delivers each event to every matching subscriber exactly once per subscriber. There is no deduplication across subscribers.

### Topology A: Central Bridge

Single subscriber — no duplicate delivery possible. But requires central ownership resolution.

### Topology B: Domain Subscribers

Multiple subscribers — each receives every `interaction:responded` event. Each queries its own store:
- **Owning domain:** finds pending context, acts on it
- **Non-owning domains:** don't find a pending context, ignore

**Duplicate delivery is harmless** because:
1. Each domain queries its own store (no cross-domain reads)
2. Each domain only acts if it finds a matching pending context
3. The generic system doesn't care who responds
4. The response is idempotent (same-choice retry returns 200)

**Evidence:** The harness engineering event bridge blindly persists every `harness.*` event. Multiple bridges subscribe to the same events. This is the established pattern — fan-out is safe because each bridge is independent.

---

## D1-9: Multiple-Owner Behavior

### Scenario

Two domains claim the same `interactionId`.

### Analysis

**Structural possibility:** The generic interaction system allows it — `interactionId` is an opaque branded string with no uniqueness constraint beyond the SQLite PRIMARY KEY on the interactions table. The `StructuredInteraction` does not carry a `producerId` or `ownerId` field.

**However:** In practice, this should not happen because:
1. `interactionId` is generated by the producer (typically `int-${Date.now()}-${random}`)
2. Different producers generate different IDs (collision probability is negligible)
3. A producer would only create an interaction for its own domain context

### Invariant

```
Ownership must be structurally unique:
  - Each interactionId has exactly one owner
  - The owner is determined by which domain's durable store
    contains a pending context for that interactionId
  - If two domains claim the same interactionId, this is an
    invariant violation (bug in producer logic)
```

### Detection

The generic system cannot detect this. The domain must enforce uniqueness within its own store. If a bug causes two domains to create interactions with the same ID, the response would be processed by both — this is a producer-level bug, not a generic system failure.

### Policy Recommendation

Do not implement multi-owner handling. Document that `interactionId` ownership is structurally unique by convention (different producers generate different IDs). If multi-owner scenarios emerge in practice, the domain should use `correlationId` to distinguish related interactions.

---

## D1-10: Unowned-Response Behavior

### Scenario

A valid authoritative response exists but no producer currently claims it.

### Possible Causes

| Cause | Likelihood | Duration |
|-------|-----------|----------|
| Producer removed/uninstalled | Low | Until producer is reinstalled |
| Migration changed producer identity | Low | Until migration is complete |
| Software upgrade changed store schema | Low | Until upgrade is complete |
| Delayed response (human responded after producer context expired) | Medium | Until producer reconciles |
| Corruption in producer's durable store | Rare | Until store is repaired |

### Analysis

The interaction/response facts remain durable evidence regardless of whether a producer claims them. The `interaction:responded` event is emitted. The M9 projection records the response. The Activity Room shows the response.

**What does NOT happen:** No domain processing occurs. The human chose something, the choice was recorded, but nobody acted on it.

### Policy

```
Do not silently convert absence of a continuation consumer
into interaction failure.

The response is durable evidence. Its existence is a fact.
The absence of continuation is a separate concern.
```

### Recovery Options (For Future Implementation)

1. **Producer reconciliation at boot:** Each producer queries its durable store for pending contexts that have responses but no continuation. This is the `reconcileInterruptedThreads()` pattern.

2. **Orphaned response detection:** A diagnostic tool could periodically check for interactions with responses that have no matching producer pending context. This is a monitoring concern, not a generic system concern.

3. **Human notification:** If a response is received but no producer acts on it, the Activity Room could eventually show a "no handler" indicator. This is a UI concern.

---

## D1-11: Future-Domain Genericity Proof

### BananaDepartment Test

**Given:**
- `BananaDepartment` is a completely new domain
- It produces interactions with choices A/B/C
- It needs to receive responses and interpret them

**Required: BananaDepartment implements:**
1. A durable pending context store (its own SQLite table, file, etc.)
2. A choice interpretation mapping (A → action1, B → action2, C → action3)
3. An EventBus subscriber for `interaction:responded`
4. A handler that queries its own store by interactionId

**Required: Generic system provides:**
1. `InteractionService.present()` — persists the interaction
2. `InteractionService.recordResponse()` — persists the response
3. `interaction:responded` EventBus event — notifies subscribers
4. The event payload includes `interactionId` and `selectedChoiceId`

**Required: ZERO modifications to:**
- `interaction-app` (generic interaction authority)
- `interaction-persistence` (SQLite store, migrations)
- Activity Room / M9 (projection only)
- HTTP interaction route (`POST /api/interactions/:id/responses`)
- Any central dispatcher or bridge

**BananaDepartment's composition wiring (in `workspace-context.ts` or equivalent):**
```typescript
// BananaDepartment's own bridge — subscribes to interaction:responded
const unsubBanana = kernel.eventBus.subscribe('interaction:responded', async (event) => {
  const interactionId = event.payload.interactionId;
  const selectedChoiceId = event.payload.selectedChoiceId;
  
  // Query BananaDepartment's own durable store
  const pending = await bananaStore.getPendingByInteractionId(interactionId);
  if (!pending) return; // Not BananaDepartment's interaction
  
  // Interpret the choice
  const action = pending.choiceInterpretation[selectedChoiceId];
  if (!action) return; // Unknown choice — log and ignore
  
  // Revalidate current domain state
  const currentState = await bananaStore.getCurrentState(pending.domainObjectId);
  if (!currentState.isValid) return; // Stale — notify human
  
  // Continue through existing governance/execution path
  await bananaGovernance.execute(action, currentState);
});

// Cleanup on shutdown
context.close = async () => { unsubBanana(); };
```

**Genericity proof:** BananaDepartment adds ~30 lines of code in its own domain boundary. Zero lines in generic infrastructure. The generic system doesn't know BananaDepartment exists.

---

## D1-12: Delivery vs. Continuation Semantics

### Three Distinct Facts

| Fact | Meaning | Authority | Durability |
|------|---------|-----------|------------|
| **Response recorded** | "This human selected choice X at time T" | Generic interaction authority | Durable (SQLite) |
| **Producer observed** | "The owning domain learned about the response" | EventBus delivery | Ephemeral (in-memory) |
| **Producer continued** | "The owning domain revalidated and acted" | Domain authority | Durable (domain store) |

### Analysis

**Fact 1 (Response recorded):** Fully durable. Survives restarts. The `interaction_publication_ledger` ensures the event reaches M9.

**Fact 2 (Producer observed):** Ephemeral. The EventBus is in-memory. If the producer's subscriber was not active when the event was emitted, the observation is lost. However:
- The producer re-subscribes at boot
- The producer can query its durable pending contexts for "interactions with responses that haven't been processed"
- This is the reconciliation pattern (`reconcileInterruptedThreads`)

**Fact 3 (Producer continued):** Domain-durable. The producer's durable store records whether continuation occurred. If continuation failed, the producer can retry.

### EventBus Sufficiency

The EventBus is sufficient for **Fact 2** (observation) when the producer is in-process. For **Fact 3** (continuation), the producer needs its own durable state.

**The gap is at Fact 2→3 boundary:** If the EventBus delivery fails (producer was not subscribed), the producer must have a durable reconciliation mechanism. This is the same pattern used by `reconcileInterruptedThreads()` — at boot, query durable state for unprocessed items.

### Recommendation

The EventBus provides **at-least-once** delivery semantics within a process lifetime. For **cross-restart** durability, each producer must implement reconciliation by querying its own durable pending contexts. This is not a new requirement — it is the established pattern.

---

## D1-13: Recommended Topology

### **Topology B: Domain-Owned Subscribers**

### Justification

| Criterion | Topology A (Central Bridge) | Topology B (Domain Subscribers) |
|-----------|----------------------------|--------------------------------|
| Genericity | Requires central ownership resolution | Zero central coordination |
| Fan-out | Single subscriber | Multiple subscribers (harmless) |
| Lookup cost | O(1) if registry, O(producers) if query | O(1) per producer (own store) |
| Ownership ambiguity | Central authority may be wrong | Each domain owns its own state |
| Duplicate delivery | None | Harmless (each domain self-filters) |
| Restart registration | Bridge must re-derive ownership | Each producer re-subscribes (standard) |
| Dependency direction | Bridge depends on all producers | Producers depend on generic only |
| Lifecycle | Bridge must match producer lifecycle | Producers are self-managed |
| Failure isolation | Bridge failure blocks all producers | Each producer is isolated |
| Adding new producer | Edit bridge | Add subscriber (no central edit) |

### Why Existing Bridges Are Not Precedent for Topology A

The existing bridges (`AgentLifecycleBridge`, `HarnessEngineeringEventBridge`, `M9IngestionBridge`) are **blind projections** — they process every event in a bounded namespace (`harness.*`, `interaction:*`). They do not route events to specific producers. They are projection authorities, not continuation authorities.

Producer continuation has **different ownership semantics** than event projection:
- Projection: "process every event" (blind, no ownership)
- Continuation: "process only events I own" (ownership-aware, domain-specific)

The existing bridges demonstrate that wildcard subscription + payload extraction works for projection. Topology B extends this pattern to continuation by having each domain do its own ownership check.

---

## D1-14: Minimum Future Implementation Surface

### What Would Need to Be Created

| Component | Package | Purpose | Size |
|-----------|---------|---------|------|
| Per-producer response subscriber | Domain-owned (each producer) | Subscribe to `interaction:responded`, query own store | ~15-30 lines per producer |
| Per-producer pending context store | Domain-owned (each producer) | Map `interactionId` → domain pending context | Varies per producer |
| Per-producer choice interpretation | Domain-owned (each producer) | Map `ChoiceId` → domain action | Varies per producer |

### What Would NOT Change

| Component | Why No Change |
|-----------|--------------|
| `StructuredInteraction` contract | Frozen; producer carries its own mapping |
| `InteractionResponse` contract | Frozen; already emits `interaction:responded` |
| `InteractionService` | Frozen; already publishes response events |
| `InteractionEventBusAdapter` | Frozen; already emits correct event types |
| Activity Room / M9 | Frozen; projection only |
| HTTP interaction route | Frozen; already records responses |
| EventBus | Frozen; already supports `interaction:responded` pattern |
| Generic interaction infrastructure | Frozen; already publishes response events |

### Total New Code Surface

- **0 lines** in generic interaction infrastructure
- **~15-30 lines** per producer (subscriber + handler)
- **Varies** per producer (durable pending context store)
- **No central bridge, no central dispatcher, no central registry**

---

## D1-15: Unresolved Questions

### 1. How Does a Producer Efficiently Filter "Is This Mine?"

**Problem:** In Topology B, every producer receives every `interaction:responded` event. Each must query its own store to check ownership. With N producers, this is N queries per response.

**Mitigation:** 
- N is small (likely <10 producers)
- Each query is O(1) against a SQLite index on `interactionId`
- The EventBus fan-out is in-process (no network cost)
- This is the same cost as the existing `harness.*` fan-out (3 bridges process every harness event)

**Alternative (if N becomes large):** The producer could maintain an in-memory `Set<InteractionId>` of active pending interactions, populated at creation time and cleared at continuation. This avoids the SQLite query for the common case (not my interaction → fast reject). Only interactions in the set trigger a database query.

### 2. Should the Producer Populate `correlationId` at Creation Time?

**Problem:** `InteractionResponse.correlationId` exists but is never populated. It could serve as an ownership routing key.

**Analysis:**
- If the producer populates `correlationId` when creating the interaction, the response event carries it
- The producer could subscribe to `interaction:responded` and filter by `correlationId` matching its own prefix
- This avoids the SQLite query for non-owning producers

**Trade-off:** Requires the HTTP route to accept `correlationId` from the client (currently rejected by strict body validation in I2-I1). Alternatively, the producer pre-registers the correlationId in its own store and the subscriber checks both the event payload and its own store.

**Recommendation:** Defer. The SQLite query approach is sufficient for the initial implementation. Optimization via `correlationId` can be added later if performance requires it.

### 3. How Does the Producer Handle Stale Interactions?

**Problem:** A producer creates an interaction at T1. Domain state changes at T2. Human responds at T3. The response is valid but the underlying operation may be stale.

**Analysis:** This is the producer's responsibility (established in I3-PREFLIGHT). The producer revalidates current domain state at continuation time. If stale, the producer decides what to do (notify human, discard, proceed anyway).

**No generic system change needed.** This is domain-specific logic.

### 4. What Happens If a Producer Is Uninstalled?

**Problem:** Producer creates interaction, is uninstalled, human responds later.

**Analysis:** The response is durable evidence. The `interaction:responded` event is emitted. No subscriber handles it (producer is gone). The Activity Room shows the response. The response is never acted upon.

**Policy:** This is the unowned-response scenario (D1-10). The response remains as historical evidence. No failure is raised. If the producer is reinstalled, it can reconcile its durable pending contexts.

---

## D1-16: Concept Distinction Matrix (Reaffirmed)

| Concept | Authority | Must Not Be |
|---------|-----------|-------------|
| Interaction ownership | Domain's durable pending context | Generic system's knowledge |
| Choice interpretation | Domain's application logic | Generic system's routing |
| Response observation | EventBus delivery + domain subscription | Generic system's callback |
| Domain revalidation | Domain's current state query | Generic system's responsibility |
| Governance approval | Existing approval stack | Conversational choice |
| Execution authorization | Decision pipeline | Producer's choice recognition |

---

*End of AR-REC-C2-I3-D1 evidence document.*

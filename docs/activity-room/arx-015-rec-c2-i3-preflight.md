# ARX-015 AR-REC-C2-I3-PREFLIGHT — Producer Provenance & Governed Continuation Audit

> **Status**: AUDIT/DESIGN ONLY  
> **Authorized by**: Director  
> **Executed by**: vestara-developer  
> **Date**: 2026-08-30  
> **Frozen baselines**: AR-REC-A at `355922b`, AR-REC-B at `5dc54ba`, AR-REC-C1 at `fc30f8b`, AR-REC-C2-D1 at `83e68cc`, AR-REC-C2-I1 at `4418709`, AR-REC-C2-I2-C1 at `a8cc2e3`, AR-REC-C2-I2-I1 at `f83e1a4`  
> **Mutation scope**: Documentation/evidence only. No production code, tests, schemas, stores, routes, events, UI components, or behavioral changes.

---

## I3-0: Objective

Determine the minimum architecture by which the system that originally creates a StructuredInteraction can later recognize an authoritative InteractionResponse and continue through its own existing domain/governance path—without putting executable semantics into:

- Activity Room
- StructuredInteraction
- InteractionChoice
- InteractionResponse
- M9
- HTTP transport
- Generic interaction infrastructure

**Central question:** Given only the frozen generic interaction/response facts, how does the originating Vestara capability recover enough authoritative provenance to understand the human's choice without turning `choiceId` into a global command?

---

## I3-1: Current End-to-End Interaction Architecture

### 1.1 The Complete Flow (Today)

```
Producer (does not yet exist in production)
  ↓
creates StructuredInteraction
  ↓
InteractionService.present()
  ↓
SqliteInteractionStore.put()  ← durable fact
  ↓
InteractionEventBusAdapter.onInteractionPresented()
  ↓
EventBus.emit({ type: 'interaction:presented' })
  ↓
M9IngestionBridge → fromInteractionPresented() → M9 store
  ↓
ActivityProjectionService → ActivityStreamHub → WebSocket → Activity Room UI
  ↓
  ... human considers ...
  ↓
HTTP POST /api/interactions/:id/responses { choiceId }
  ↓
InteractionService.recordResponse()
  ↓
SqliteInteractionStore.putResponse()  ← durable fact
  ↓
InteractionEventBusAdapter.onInteractionResponded()
  ↓
EventBus.emit({ type: 'interaction:responded' })
  ↓
M9IngestionBridge → fromInteractionResponded() → M9 store
  ↓
ActivityProjectionService → ActivityStreamHub → WebSocket → Activity Room UI
  ↓
[NOTHING ELSE HAPPENS]
```

### 1.2 Key Observation

The `interaction:responded` event is emitted but **only consumed by the M9IngestionBridge for Activity Room projection**. No domain subscriber, no agent wake-up, no workflow continuation, no callback is triggered. The response is a durable fact that nobody reads.

### 1.3 Provenance on the Frozen Contract

`StructuredInteraction` carries:
- `interactionId` — branded opaque string (no encoded provenance)
- `presentingParticipantId` — string (agent ID or 'system')
- `presentingParticipantName` — string (display name)
- `createdAt` — timestamp
- `conversationId?` — optional string (not populated by any production code)
- `content` — human-readable prompt
- `choices` — ordered `InteractionChoice[]`

`StructuredInteraction` **does not carry**:
- `correlationId` to upstream causal events
- `causationId`, `originId`, or `parentId`
- Task/workflow linkage
- Domain object reference
- Any metadata, payload, context, or extension point

`InteractionResponse` carries:
- `responseId` — globally unique
- `interactionId` — references the interaction
- `selectedChoiceId` — the human's choice
- `respondingParticipantId` / `respondingParticipantName`
- `respondedAt` — timestamp
- `correlationId?` — optional, never populated by production code

### 1.4 What Exists vs. What Is Missing

| What exists today | What is missing |
|---|---|
| `interactionId` (opaque branded string) | No encoded provenance (producer ID, workflow context) |
| `presentingParticipantId` / `presentingParticipantName` | No structured correlation to upstream agent/workflow/task |
| `conversationId?` (optional) | No `parentId`, `causationId`, `originId`, or task/workflow linkage |
| `createdAt` timestamp | No lifecycle state on the contract |
| `InteractionResponse.correlationId?` | Never populated by production code |
| M9 carries `correlationId`, `effect`, `relatesTo`, `correctionOf` | Interaction-to-M9 adapter does not populate these fields |
| Publication ledger with deterministic event IDs | No recovery orchestrator (recovery is manual/external) |
| 6 canonical agents with capabilities | No agent registered as "interaction producer" |
| No production caller of `InteractionService.present()` | All interaction creation is in test harnesses |

---

## I3-2: Missing Continuation Edge

The gap is precisely at the boundary between:

```
InteractionResponse authority (frozen, generic, domain-neutral)
  ↓
??? (no bridge exists)
  ↓
Originating producer's domain authority (specific, durable, restart-safe)
```

Today, the `interaction:responded` event reaches only M9. There is no mechanism for the originating capability to learn that a response was recorded, let alone to act on it.

---

## I3-3: Repository Evidence for Existing Continuation/Correlation Mechanisms

### 3.1 EventBus Pattern Matching

**File:** `packages/event-bus/src/index.ts:158-165`

The `InProcessEventBus` supports:
- Exact match: `pattern === eventType`
- Prefix wildcard: `pattern.endsWith('*')` — `interaction:*` matches `interaction:presented` and `interaction:responded`
- No segment-level globbing: `agent.*` does NOT match `agent:started` (dot vs colon delimiter)

**Implication:** A subscriber with pattern `interaction:responded` would receive exactly the response events. A subscriber with `interaction:*` would receive both presentation and response events.

### 3.2 Existing Bridge Patterns

Three bridge patterns exist that subscribe to EventBus events and route them to domain authorities:

| Bridge | File | Pattern | What it does |
|--------|------|---------|-------------|
| `AgentLifecycleBridge` | `apps/api/src/bridges/agent-lifecycle-bridge.ts` | `harness.*` | Re-emits canonical `agent:started`/`agent:completed` events |
| `HarnessEngineeringEventBridge` | `apps/api/src/bridges/harness-engineering-event-bridge.ts` | `harness.*` | Projects to `SqliteEngineeringEventStore` |
| `M9IngestionBridge` | `packages/activity-projection/src/m9-ingestion-bridge.ts` | Multiple patterns | Normalizes and persists to M9 Activity Room |

**Key observation:** The bridge pattern is the established architectural shape for routing EventBus events to domain authorities. A new `InteractionResponseBridge` would follow this exact pattern.

### 3.3 Workflow Orchestrator Resumption

**File:** `packages/workflow-orchestrator/src/orchestrator.ts:448-457`

```typescript
async resume(projectId: string): Promise<ProjectSnapshot> {
    const project = await this.mustGetProject(projectId);
    if (project.phase === 'executing') {
      return this.runExecution(projectId);
    }
    return this.snapshot(projectId);
}
```

The orchestrator resumes by reloading persisted state and re-deriving runnable tasks. It does not need an in-memory callback — it reads durable state and decides what to do next.

### 3.4 Agent Harness Approval Resume

**File:** `packages/agent-harness/src/index.ts:411-496`

The harness `decideApproval()` method:
1. Checks idempotency (already decided?)
2. If approved: re-attaches environment, re-invokes the approved tool call, processes remaining queued calls, continues turn loop
3. If rejected: finishes turn as `blocked`

**Critical:** Pending approvals survive restarts because they are persisted as thread items (`packages/agent-harness/src/index.ts:383-409`). The `pendingApprovals()` method reads from the durable store, not from memory.

### 3.5 Durable Pending Approval Discovery

**File:** `packages/agent-harness/src/index.ts:383-409`

```typescript
async pendingApprovals(threadId: string): Promise<readonly PendingApproval[]> {
    const items = this.options.store.listItems(threadId as TaskThreadId);
    // Cross-references approval-request items against approval-decision items
}
```

This is the canonical pattern for "find pending human decisions" — query durable state, don't rely on callbacks.

### 3.6 Thread Recovery at Boot

**File:** `workspace-context.ts:1120-1138`

```typescript
reconcileInterruptedThreads({ threads, events, telemetry });
```

At boot, threads in non-terminal states are marked blocked with clear reason codes. This is the existing pattern for "what to do when a human didn't respond before a crash."

### 3.7 Correlation ID Patterns

| System | Has `correlationId`? | How it's used |
|--------|---------------------|---------------|
| `StructuredInteraction` | NO | — |
| `InteractionResponse` | YES (optional) | Never populated |
| `ActivityBase` (M9) | YES (optional) | Never populated from interactions |
| `ThreadItem` | YES | Links tool calls to results |
| Engineering events | YES | Hash-chained audit trail |
| Harness events | YES | `correlationId` + `causationId` on every emission |

---

## I3-4: Candidate Architectures Considered

### Candidate A: EventBus Subscriber Bridge

```
Producer creates StructuredInteraction
  ↓
interaction:responded event
  ↓
InteractionResponseBridge (new, subscribes to 'interaction:responded')
  ↓
reads correlationId from response payload
  ↓
looks up domain-owned pending context by correlationId
  ↓
revalidates current domain state
  ↓
continues through existing governance/execution path
```

**Evidence support:** The bridge pattern is well-established (3 existing bridges). EventBus supports `interaction:responded` pattern matching. `correlationId` is already on `InteractionResponse` (just never populated).

**Rejection assessment:** NOT rejected. This is the minimum viable shape.

### Candidate B: Domain-Owned Polling

```
Producer periodically queries InteractionService
  for responses to its interactions
  ↓
revalidates domain state
  ↓
continues
```

**Evidence support:** `InteractionService` already exposes `recordResponse()` which could be extended to expose `getResponse()`. The publication ledger pattern (`WHERE published_at IS NULL`) proves polling is an established recovery pattern.

**Rejection assessment:** Feasible but wasteful. EventBus push is strictly superior when the producer is in-process. Polling adds unnecessary latency and load. REJECTED as primary mechanism; retained as recovery fallback.

### Candidate C: In-Memory Callback/Handler Registry

```
Producer registers: (interactionId) => handler
  ↓
InteractionService calls handler when response arrives
  ↓
handler continues domain flow
```

**Evidence support:** None. No existing pattern uses in-memory callback registration for durable continuation.

**Rejection assessment:** REJECTED. Does not survive restarts, process crashes, or producer restarts. Violates the durability requirement.

### Candidate D: InteractionService Extension Points

```
InteractionService gets new lifecycle hooks:
  onResponse(callback)
  onPresented(callback)
  ↓
Callbacks fire in-process
```

**Evidence support:** `InteractionService.verifyAndAcknowledge()` already exists as a post-emit hook.

**Rejection assessment:** REJECTED. Same durability problem as Candidate C. Tightly couples the generic interaction authority to domain-specific behavior. Violates the "generic interaction infrastructure must not own domain-specific side" constraint.

### Candidate E: HTTP Webhook/Callback

```
Producer registers callback URL with StructuredInteraction
  ↓
InteractionService POSTs to callback on response
  ↓
Producer's webhook handles continuation
```

**Evidence support:** None. No webhook pattern exists in the codebase.

**Rejection assessment:** REJECTED. Introduces network dependency, callback URL management, retry semantics, and security concerns. The producer is in-process — HTTP is unnecessary overhead.

### Candidate F: M9 Projection Extension

```
Extend M9 ActivityRecord with domain-specific projection
  ↓
Interaction response creates domain-specific projection record
  ↓
Domain subscriber reads M9 projection
```

**Evidence support:** M9 already projects interaction events. The `ActivityProjectionService` has 6 projectors.

**Rejection assessment:** REJECTED for primary continuation. M9 is the Activity Room's projection authority, not a domain continuation mechanism. Using M9 as the continuation substrate would couple Activity Room to domain execution. However, M9 projection could serve as an **audit trail** of continuation decisions.

---

## I3-5: Explicit Rejection Reasons

| Candidate | Rejection Reason |
|-----------|-----------------|
| C (In-memory callback) | Does not survive restarts, crashes, or producer restarts |
| D (InteractionService hooks) | Same durability problem; couples generic authority to domain behavior |
| E (HTTP webhook) | Unnecessary network dependency for in-process producer |
| F (M9 as continuation substrate) | Couples Activity Room to domain execution |
| Generic command dispatcher | Would turn choiceId into a global command; violates frozen contract |
| Generic operation registry | Would create a new generic routing system; existing EventBus + bridge pattern is sufficient |
| Any architecture putting executable semantics in Activity Room, StructuredInteraction, InteractionChoice, InteractionResponse, M9, HTTP transport, or generic interaction infrastructure | Explicitly prohibited by authorization scope |

---

## I3-6: Recommended Minimum Ownership Model

### The Three Authorities

| Authority | Owns | Must Not Own |
|-----------|------|-------------|
| **Generic interaction authority** (`interaction-app`) | Presentation facts, response facts, idempotent/conflict classification, publication | Domain-specific interpretation of choiceIds |
| **Producer/domain authority** (existing: workflow, harness, marketplace, etc.) | Pending intent mapping, choice semantics, domain revalidation, governance, execution | How the generic interaction system records facts |
| **Activity Room** (`activity-projection`) | Projection of interaction facts for human visibility | Any domain execution or continuation logic |

### The Separation

```
Producer domain authority
  ↓ owns
domain-owned pending context
  ↓ creates
StructuredInteraction (generic, frozen)
  ↓ persists
interaction authority (generic, frozen)
  ↓ projects
Activity Room (human visibility)
  ↓ human responds
InteractionResponse authority (generic, frozen)
  ↓ emits
interaction:responded event
  ↓ observed by
InteractionResponseBridge (new, domain-owned)
  ↓ reads
domain-owned pending context (revalidated)
  ↓ continues
existing governance/execution path
```

---

## I3-7: Producer Provenance Model

### What "Producer" Means

A **producer** is any Vestara capability that:
1. Creates a `StructuredInteraction` to present choices to a human
2. Needs to learn when an authoritative response is recorded
3. Needs to interpret the response within its own domain context

Producers are NOT enumerated. The generic interaction infrastructure does not know or care who the producer is.

### Candidate Producers (Non-Exhaustive)

| Producer | Domain | Choice Semantics |
|----------|--------|-----------------|
| Marketplace | Capability availability | "Make it available" / "Tell me more" |
| Repository analysis | Implementation comparison | "Compare them" / "Continue anyway" |
| Diagnostics | System health | "Investigate" / "Show evidence" / "Ignore" |
| Workflow orchestrator | Task approval | "Approve" / "Reject" / "Modify" |
| Agent harness | Tool approval | "Allow" / "Deny" / "Scope" |
| Configuration | Setting change | "Apply" / "Cancel" |
| Future unknown | Arbitrary | Arbitrary |

### Producer Provenance Requirements

The producer must durably retain a mapping conceptually resembling:

```
domain object / pending intent
  ↕
interactionId
  ↕
domain-specific interpretation of ChoiceIds
```

**Critical:** This mapping is **domain-owned**, not generic-owned. The generic interaction system only knows `interactionId` ↔ `selectedChoiceId`. The producer knows what `selectedChoiceId` means.

### How the Generic Contract Supports This

The frozen `StructuredInteraction` carries `presentingParticipantId` — this is the producer's identity. However, it is a display-oriented string, not a structured provenance link. The producer needs its own durable mapping from `interactionId` to its domain context.

**The generic interaction system must not own the domain-specific side of that mapping.**

---

## I3-8: Choice Interpretation Ownership

### The Rule

Choice interpretation is **exclusively** the producer's responsibility.

### How This Works

1. Producer creates `StructuredInteraction` with choices it defines
2. Producer simultaneously records (in its own durable state) what each `choiceId` means
3. When the response arrives, the producer reads `selectedChoiceId` and interprets it using its own mapping
4. The generic system never interprets choices

### Rejected Patterns

```
// REJECTED: Generic interpretation
switch (choiceId) {
  case "install": ...    // in Activity Room or generic infrastructure
  case "deploy": ...
}

// REJECTED: Generic escape hatches on the contract
interface StructuredInteraction {
  command?: string;      // executable payload
  operation?: string;    // generic operation
  handler?: string;      // callback reference
  route?: string;        // HTTP route
  metadata?: Record<string, unknown>;  // arbitrary instructions
}

// REJECTED: Response-level escape hatches
interface InteractionResponse {
  command?: string;
  operation?: string;
  handler?: string;
}
```

### What the Producer Receives

```typescript
// The producer receives ONLY:
{
  interactionId: InteractionId,
  selectedChoiceId: ChoiceId,
  respondingParticipantId: string,
  respondedAt: Timestamp,
  correlationId?: string  // if populated by the producer at creation time
}
```

The producer then looks up its own mapping:
```typescript
const pending = await myDomainStore.getPendingByInteractionId(interactionId);
// pending contains: { domainObject, choiceInterpretation, createdAt, ... }
const interpretation = pending.choiceInterpretation[selectedChoiceId];
// interpretation is domain-specific, NOT generic
```

---

## I3-9: Response Observation Mechanism

### The Recommended Shape

A new bridge (`InteractionResponseBridge`) that:

1. Subscribes to `interaction:responded` on the EventBus
2. Reads `interactionId` and `selectedChoiceId` from the event payload
3. Queries durable domain state for the pending context associated with this `interactionId`
4. Revalidates current domain state (permissions, policy, preconditions)
5. Routes to the existing governance/execution path

### Why EventBus Push (Not Polling)

- The producer is in-process — no network boundary
- EventBus is the established pattern for cross-cutting event distribution
- `InProcessEventBus` is synchronous within the process — delivery is guaranteed before the HTTP response returns
- Polling would add latency (500ms+ intervals) and unnecessary load

### Why Not a New Subscription Mechanism

The existing `EventBus.subscribe(pattern, handler)` is sufficient. No new subscription mechanism is needed. The bridge pattern is proven by 3 existing bridges.

### Composition Root Location

The bridge would be wired at the same level as other bridges — in `apps/api/src/index.ts` or `apps/api/src/workspace-context.ts`, alongside `AgentLifecycleBridge` and `HarnessEngineeringEventBridge`.

---

## I3-10: Restart/Crash Durability Analysis

### Crash Windows

| Window | Scenario | Survives? | Recovery Mechanism |
|--------|----------|-----------|-------------------|
| A | Response committed, event not emitted | YES | Publication ledger: `getPendingPublications()` |
| B | Response committed, event emitted, M9 not ingested | YES | Publication recovery: re-emit from ledger |
| C | Response committed, event emitted, M9 ingested, bridge not triggered | YES | Bridge reads durable domain state at next boot |
| D | Response committed, bridge triggered, domain state not updated | DEPENDS | Domain-specific recovery (same as existing thread recovery) |
| E | API restarts before human responds | YES | Interaction persists in SQLite; human can still respond; producer re-subscribes at boot |

### Why In-Memory Callbacks Fail

If the producer registered an in-memory callback:
1. API process crashes
2. Callback is lost
3. Human's response arrives (via HTTP, which restarts the server)
4. InteractionService records the response, emits `interaction:responded`
5. No subscriber exists — event is lost
6. The durable interaction/response facts exist, but nobody acts on them

### Why EventBus + Durable Domain State Works

1. API process crashes
2. All in-memory subscriptions are lost
3. API restarts
4. Bridges re-subscribe to EventBus (this is what all existing bridges do at boot)
5. Human's response arrives (or was already recorded before crash)
6. `interaction:responded` is emitted (or replayed from publication ledger)
7. Bridge receives the event
8. Bridge queries durable domain state (which survived the crash in SQLite)
9. Bridge revalidates and continues

**The bridge does not need to survive the crash. The durable domain state does.**

### The Key Insight

The bridge is a **stateless event router**. It has no state to lose. It reads durable state, makes a decision, and routes to the existing governance path. If it misses an event, it can be re-triggered by querying durable state for "interactions with responses that haven't been processed."

This is the same pattern used by `reconcileInterruptedThreads()` — query durable state, find unprocessed items, act on them.

---

## I3-11: Staleness/Domain Revalidation Boundary

### The Scenario

```
T1: Recommendation created — "API latency increased. [Investigate] [Show evidence] [Ignore]"
T2: Domain state changes — API latency returns to normal
T3: Human responds — "Investigate"
```

### What the Interaction Layer Can Prove

- This human selected "Investigate" for this interaction at T3
- The response is durable and authoritative

### What the Interaction Layer Cannot Prove

- Whether the underlying operation (investigate API latency) remains valid at T3
- Whether the human's choice still makes sense given current domain state
- Whether permissions, policy, or preconditions still hold

### Which Authority Revalidates

**The originating producer/domain authority** revalidates. Not the interaction layer, not the Activity Room, not the generic infrastructure.

### How Revalidation Works

When the bridge receives `interaction:responded`:
1. Look up domain-owned pending context by `interactionId`
2. **Re-read current domain state** (not the state at T1)
3. Evaluate: Is this operation still valid? Are permissions still granted? Are preconditions still met?
4. If valid → continue through existing governance/execution path
5. If invalid → handle gracefully (notify human, log staleness, discard)

### Why This Is the Producer's Responsibility

The producer knows:
- What domain state was relevant at T1
- What domain state is relevant now
- How to evaluate whether the choice is still valid
- What to do if it's not

The generic interaction system knows none of this.

---

## I3-12: Governance/Approval Separation

### Two Distinct Facts

| Fact | Meaning | Authority |
|------|---------|-----------|
| **Conversational choice** | "I want to investigate" | Activity Room / interaction system |
| **Governance approval** | "This operation is authorized" | Existing approval system (permissions, policy, workflow) |

### Why They Must Remain Separate

1. A human choosing "Investigate" is a **conversational intent**, not an **authorization**
2. The actual investigation may require permissions the human doesn't have
3. The investigation may trigger policy checks, budget limits, or risk assessments
4. These checks are already implemented in the existing governance stack

### The Existing Governance Stack

| Layer | Mechanism | File |
|-------|-----------|------|
| Execution Policy | Three modes (hermetic/governed/live) | `packages/agent-harness/src/execution-policy.ts` |
| AI Invocation Guard | Fail-closed binding verification | `packages/agent-harness/src/ai-invocation-guard.ts` |
| Orchestrator Approval | Risk-based task approval | `packages/workflow-orchestrator/src/orchestrator.ts:763-791` |
| Harness Tool Approval | Per-tool-call approval with queue persistence | `packages/agent-harness/src/index.ts:812-843` |
| Decision Pipeline | Permission → Policy → Execution → Verification → Trust | Kernel-booted chain |
| Role-Based Permissions | Full RBAC | `packages/types/src/permissions.ts` |

### The Continuation Path

```
Human choice (conversational intent)
  ↓
Producer revalidates domain state
  ↓
Producer routes through EXISTING governance stack
  ↓
Governance approval (if required)
  ↓
Execution (if authorized)
  ↓
Verification (if required)
```

**A producer recognizing a choice must not itself mean the protected operation is authorized.**

---

## I3-13: Genericity Proof

### Test Case 1: Marketplace

```
Producer: Marketplace capability
Interaction: "This capability is available."
Choices: [ Make it available ] [ Tell me more ]

Flow:
1. Marketplace creates StructuredInteraction
2. Marketplace records: interactionId → { capabilityId, intent: 'install' }
3. Human chooses "Make it available"
4. interaction:responded fires
5. InteractionResponseBridge receives event
6. Bridge queries Marketplace durable state: find pending by interactionId
7. Marketplace revalidates: is this capability still available? Are permissions sufficient?
8. If valid → Marketplace's existing install flow (with governance checks)
9. If invalid → Marketplace notifies human
```

**No modification to generic interaction infrastructure required.**

### Test Case 2: Repository Analysis

```
Producer: Repository analysis tool
Interaction: "Two implementations already exist."
Choices: [ Compare them ] [ Continue anyway ]

Flow:
1. Analysis tool creates StructuredInteraction
2. Analysis tool records: interactionId → { implA, implB, intent: 'compare' }
3. Human chooses "Compare them"
4. interaction:responded fires
5. InteractionResponseBridge receives event
6. Bridge queries Analysis durable state
7. Analysis revalidates: do these implementations still exist? Same versions?
8. If valid → Analysis runs comparison (existing tool invocation)
9. If invalid → Analysis notifies human
```

**No modification to generic interaction infrastructure required.**

### Test Case 3: Diagnostics

```
Producer: Diagnostics tool
Interaction: "API latency increased significantly."
Choices: [ Investigate ] [ Show evidence ] [ Ignore ]

Flow:
1. Diagnostics creates StructuredInteraction
2. Diagnostics records: interactionId → { metric, threshold, intent: 'investigate' }
3. Human chooses "Investigate"
4. interaction:responded fires
5. InteractionResponseBridge receives event
6. Bridge queries Diagnostics durable state
7. Diagnostics revalidates: is latency still elevated? Is the symptom still present?
8. If valid → Diagnostics runs investigation (existing diagnostic tool)
9. If stale → Diagnostics notes the latency returned to normal, notifies human
```

**No modification to generic interaction infrastructure required.**

### Test Case 4: Future Unknown Capability

```
Producer: Arbitrary future producer
Interaction: Arbitrary prompt
Choices: Arbitrary choices

Flow:
1. Future producer creates StructuredInteraction
2. Future producer records: interactionId → { its own domain context }
3. Human responds
4. interaction:responded fires
5. InteractionResponseBridge receives event (same bridge, same code)
6. Bridge queries future producer's durable state (same query pattern)
7. Future producer revalidates and continues (its own domain logic)
```

**No modification to generic interaction infrastructure required.**

### Genericity Conclusion

The generic interaction infrastructure requires **zero source modification** for any new producer. The producer brings:
- Its own durable pending context store
- Its own choice interpretation mapping
- Its own domain revalidation logic
- Its own governance/execution path

The generic system provides:
- Durable presentation/response facts
- EventBus publication of `interaction:responded`
- Idempotent/conflict classification

---

## I3-14: Dependency-Direction Analysis

```
                    ┌─────────────────────┐
                    │  Generic Interaction │
                    │     Authority        │
                    │  (interaction-app)   │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │ Persistence  │  │  EventBus    │  │  Activity    │
    │  (SQLite)    │  │  (InProcess) │  │  Room (M9)   │
    └──────────────┘  └──────┬───────┘  └──────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
          ┌──────────────┐  ┌──────────────────┐
          │   M9 Ingestion│  │ InteractionResponse│
          │    Bridge     │  │     Bridge         │
          └──────────────┘  │   (NEW, domain-owned)│
                            └────────┬─────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │                │                │
                    ▼                ▼                ▼
          ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
          │  Workflow    │  │   Harness    │  │ Marketplace  │
          │ Orchestrator │  │              │  │              │
          └──────────────┘  └──────────────┘  └──────────────┘
```

**Dependency rules:**
- Generic interaction authority depends on: persistence, EventBus, M9 (for publication verification)
- M9 ingestion bridge depends on: generic interaction authority (subscribes to its events)
- InteractionResponse bridge depends on: generic interaction authority (subscribes to its events) + domain authorities
- Domain authorities depend on: generic interaction authority (for response facts) + their own durable state
- **NO dependency cycles**
- **Generic authority never depends on domain authorities**
- **Domain authorities never depend on each other through the interaction system**

---

## I3-15: Minimum Implementation Surface (If Later Authorized)

### What Would Need to Be Created

| Component | Package | Purpose | Size |
|-----------|---------|---------|------|
| `InteractionResponseBridge` | `apps/api/src/bridges/` | Subscribes to `interaction:responded`, routes to domain producers | ~80 lines |
| Producer pending context store (per producer) | Domain-owned | Maps `interactionId` → domain-specific pending intent | Varies per producer |
| Producer choice interpretation mapping | Domain-owned | Maps `ChoiceId` → domain-specific action | Varies per producer |

### What Would NOT Change

| Component | Why No Change |
|-----------|--------------|
| `StructuredInteraction` contract | Frozen; producer carries its own mapping |
| `InteractionResponse` contract | Frozen; `correlationId` already exists (just needs population) |
| `InteractionService` | Frozen; already emits `interaction:responded` |
| Activity Room / M9 | Frozen; already projects interaction events |
| HTTP transport | Frozen; already records responses |
| Generic interaction infrastructure | Frozen; already publishes response events |

### What Would Need Minimal Extension

| Component | Change | Justification |
|-----------|--------|---------------|
| `InteractionEventBusAdapter.onInteractionResponded()` | Populate `correlationId` from response payload | Already on the contract, just never set |
| HTTP route `POST /api/interactions/:id/responses` | Populate `correlationId` on the response if producer provides it | Optional field, backward-compatible |
| Boot sequence (`apps/api/src/index.ts`) | Wire `InteractionResponseBridge` alongside existing bridges | Standard bridge registration |

### Total New Code Surface

- **~80 lines** for the bridge
- **~0 lines** for the generic interaction infrastructure
- **Varies** per producer (their own pending context + interpretation mapping)

---

## I3-16: Unresolved Questions / Blockers

### 1. Producer Registration Pattern

**Question:** How does the `InteractionResponseBridge` know which producer owns a given `interactionId`?

**Evidence:** Today, `presentingParticipantId` is the only provenance on the interaction. But it's a display string, not a structured routing key.

**Options:**
- (a) Bridge queries all producer stores until one claims the `interactionId` — simple but O(producers)
- (b) Interaction carries a `producerId` field — requires contract extension
- (c) Producer registers a subscription filter (e.g., `interaction:responded:${interactionIdPrefix}`) — requires producer-specific event type extensions

**Recommendation:** Option (a) is simplest for the minimum viable implementation. The number of producers is small (likely <10), and each query is O(1) against a SQLite index. Option (b) is cleaner but requires a frozen contract change (authorized only if Director approves).

### 2. CorrelationId Population

**Question:** Who sets `correlationId` on the `InteractionResponse`?

**Evidence:** The HTTP route at `apps/api/src/routes/interactions.ts:116-123` does not set `correlationId`. The field exists on the contract but is never populated.

**Recommendation:** The producer should set `correlationId` when creating the interaction (as part of its durable pending context). The HTTP route would then propagate it. This requires the HTTP route to accept an optional `correlationId` from the client, or the producer to pre-register it.

### 3. Recovery Orchestration

**Question:** Who calls `getPendingPublications()` and when?

**Evidence:** The method exists on `InteractionService` but no production code calls it. The publication ledger has unacknowledged entries.

**Recommendation:** The boot sequence should include a publication recovery step — either in the bridge wiring or as a dedicated recovery service. This is a natural extension of the existing boot recovery patterns (`reconcileInterruptedThreads`, `worktreeRuntime.recover`).

### 4. Staleness Handling UX

**Question:** When the producer determines a response is stale, how is the human notified?

**Evidence:** The Activity Room has no mechanism for "this response was recorded but the underlying state changed." The human would see their response recorded but nothing would happen.

**Recommendation:** The producer should emit a domain-specific event (e.g., `interaction.stale`) that the Activity Room could project as a notification. This is out of scope for the generic interaction infrastructure.

### 5. Multiple Response Handling

**Question:** What if the producer creates multiple interactions for the same domain object?

**Evidence:** The generic system allows it (no uniqueness constraint on domain object). The producer must handle this itself.

**Recommendation:** Document that producers should use `correlationId` to link related interactions, and handle conflicting responses in their domain logic.

---

## I3-17: Concept Distinction Matrix

These concepts MUST NOT collapse into one abstraction:

| Concept | Definition | Authority | Lives |
|---------|-----------|-----------|-------|
| **Recommendation** | "You might want to do X" | Producer's analysis | Producer domain |
| **StructuredInteraction** | "Here are your choices" | Generic interaction authority | `interaction-app` |
| **InteractionChoice** | "Option A / Option B" | Producer (defines choices) | `@vestara/types` (frozen) |
| **InteractionResponse** | "I chose Option A" | Generic interaction authority | `interaction-app` |
| **Human intent** | "I want to investigate" | Human (via choice) | Implicit in response |
| **Domain interpretation** | "Investigate means run diagnostic tool" | Producer domain | Producer's durable state |
| **Governance approval** | "This operation is authorized" | Existing governance stack | Permissions/policy/workflow |
| **Authorization** | "The system may execute this" | Decision pipeline | Kernel/execution-policy |
| **Workflow continuation** | "Resume the next step" | Workflow orchestrator | `workflow-orchestrator` |
| **Execution** | "Run the operation" | Agent harness / tools | `agent-harness` |
| **Verification / acceptance** | "The result is correct" | Verification engine | `verification` / evidence |

---

## I3-18: Proposed Continuation Graph (Evidence-Adjusted)

Based on repository evidence, the recommended graph:

```
Producer/domain authority
  ↓
creates domain-owned pending context (durable, SQLite-backed)
  ↓
creates StructuredInteraction (generic, frozen)
  ↓
interaction authority (interaction-app, generic, frozen)
  ↓
Activity Room (M9 projection, human visibility)
  ↓
human responds via HTTP (frozen ingress)
  ↓
InteractionResponse authority (generic, frozen)
  ↓
emits interaction:responded (EventBus, in-process)
  ↓
M9IngestionBridge → M9 Activity Room (existing)
  ↓
InteractionResponseBridge (NEW, stateless, domain-owned)
  ↓
reads domain-owned pending context (durable, SQLite)
  ↓
revalidates current domain state (producer responsibility)
  ↓
existing governance stack (permissions, policy, approvals)
  ↓
existing execution path (harness, tools, workflow)
  ↓
verification / acceptance (if required)
```

**Modifications from the proposed graph in the authorization:**
- Added "revalidates current domain state" as an explicit step (staleness handling)
- Added "existing governance stack" as a mandatory gate before execution
- Added "verification / acceptance" as the final step
- The InteractionResponseBridge is **stateless** — it reads durable state, not in-memory state

---

## I3-19: Files Changed

None. This is an audit/design document only.

---

## I3-20: Summary

### Recommendation

Implement a **stateless InteractionResponseBridge** that:
1. Subscribes to `interaction:responded` on the EventBus
2. Queries durable domain state for the pending context associated with the `interactionId`
3. Revalidates current domain state (permissions, policy, preconditions)
4. Routes to the existing governance/execution path

### Why This Is Minimum

- **0 lines** changed in generic interaction infrastructure
- **~80 lines** for the bridge (follows proven bridge pattern)
- **Varies** per producer (their own pending context + interpretation)
- Reuses existing EventBus, SQLite persistence, governance stack, and execution paths

### Why This Is Safe

- Generic interaction contracts remain frozen
- Activity Room remains projection-only
- No new generic infrastructure
- No executable semantics in the interaction layer
- Governance approval remains separate from conversational choice
- Staleness is handled by the producer, not the generic system

### What Would Block This

- If no producer exists that needs continuation (currently true — no production callers of `present()`)
- If the Director determines that the frozen contracts cannot support the required provenance (evidence says they can, with the optional `correlationId`)

---

*End of AR-REC-C2-I3-PREFLIGHT evidence document.*

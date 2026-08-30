# ARX-015 AR-REC-C2-I3-D2 — Domain Continuation Durability & Reconciliation Design

> **Status**: DESIGN/EVIDENCE ONLY  
> **Authorized by**: Director  
> **Executed by**: vestara-developer  
> **Date**: 2026-08-30  
> **Frozen baselines**: AR-REC-A at `355922b`, AR-REC-B at `5dc54ba`, AR-REC-C1 at `fc30f8b`, AR-REC-C2-D1 at `83e68cc`, AR-REC-C2-I1 at `4418709`, AR-REC-C2-I2-C1 at `a8cc2e3`, AR-REC-C2-I2-I1 at `f83e1a4`, C2-I3-PREFLIGHT at `e2b6164`, C2-I3-D1 at `6f89e8d`  
> **Mutation scope**: Documentation/evidence only. No production code, tests, schemas, stores, routes, events, UI components, or behavioral changes.

---

## D2-0: Objective

Resolve how a domain-owned subscriber achieves eventual continuation after an authoritative InteractionResponse when EventBus observation is ephemeral.

**Central question:**
```
response committed
      ↓
interaction:responded
      ↓
producer misses event / crashes
      ↓
restart
      ↓
???
      ↓
originating domain discovers authoritative response
      ↓
safely resumes continuation
```

The solution MUST NOT make the generic interaction publication ledger responsible for domain continuation.

---

## D2-1: Existing Reconciliation Patterns (Evidence)

### 1.1 Boot Reconciliation Sequence

**File:** `apps/api/src/workspace-context.ts` lines 1093-1138

The standard boot reconciliation phase runs in this order:

| Step | Operation | Sync/Async | Pattern |
|------|-----------|------------|---------|
| 1 | `worktreeRuntime.recover()` | Sync | Query durable state → detect anomalies → transition status |
| 2 | `harnessSession.restoreActiveSessions()` | Async, fire-and-forget | Query all threads → rebuild projection → persist |
| 3 | `importThreadHistory()` | Sync | Idempotent backfill — deterministic event IDs, skip existing |
| 4 | `reconcileInterruptedThreads()` | Sync | Query active threads → block non-approval threads → emit recovery events |

**Key observation:** There is no formal "recovery stage" in the boot stage machine, but reconciliation is embedded in `createWorkspaceContext()` and runs before the HTTP server starts listening.

### 1.2 Thread Interruption Reconciliation

**File:** `packages/engineering-event-store/src/index.ts` lines 625-675

`reconcileInterruptedThreads()`:
- Iterates ALL threads via `listThreads()` (SQLite query)
- For each thread with an active turn:
  - `awaiting-approval` → preserved (safe to resume)
  - Terminal states → skipped
  - All other states → blocked with reason code
- Detects side-effect ambiguity: tool calls without matching results
- Never resumes — blocks all non-approval threads, leaving recovery to explicit human/system decision

**Pattern:** Query durable state → classify → transition to safe state → emit recovery event.

### 1.3 Durable Thread Recovery

**File:** `packages/engineering-event-store/src/index.ts` lines 530-604

`DurableThreadRecoveryService.recover()`:
- Input: `(threadId, action: 'resume'|'abandon'|'reconcile', actorId, reason, sideEffectsReconciled?)`
- Validates recoverability: thread must be in `blocked` or `awaiting-approval`
- Creates checkpoint before state transition
- `resume` → new turn with same input (queued state)
- `abandon` → cancel turn and thread
- Emits `recovery.thread-{resumed|abandoned|reconciled}` event

**Pattern:** Explicit recovery action with validation, checkpoint, and event emission.

### 1.4 Harness Approval Recovery

**File:** `packages/agent-harness/src/index.ts` lines 383-409

`pendingApprovals()`:
- Reads ALL items from durable thread store (not in-memory)
- Builds `Set` of decided approval IDs from `approval-decision` items
- Returns unapproved `approval-request` items as `PendingApproval[]`

**Pattern:** Cross-reference two sets from durable state — requests minus decisions = pending.

### 1.5 Orchestrator Resume

**File:** `packages/workflow-orchestrator/src/orchestrator.ts` lines 448-457

`resume()`:
- Reloads persisted project state
- If `executing` phase → `runExecution()` re-derives runnable tasks from current persisted status
- Completed tasks never re-executed (status filter excludes them)

**Pattern:** Re-derive current state from durable source → act on what's pending.

### 1.6 Idempotency Strategies Found

| Strategy | Location | Mechanism |
|----------|----------|-----------|
| Deterministic event ID | `importThreadHistory()` | `thread-item:${item.id}` — same input → same ID → skip existing |
| UNIQUE constraint | `InteractionService.recordResponse()` | DB constraint → catch → classify idempotent vs conflict |
| eventId dedup | M9 store | `byEventId.get(eventId)` — in-memory map, rebuilt at boot |
| Set-based dedup | External runtime SSE | `consumed.has(key)` — in-memory, not durable |
| Decision check | `decideApproval()` | Scan thread items for existing `approval-decision` before re-executing |
| IdempotencyKey | `WorkflowRunInput` | Required field, concurrent start dedup |

### 1.7 Processed/Consumed Markers Found

| Marker | Location | Mechanism |
|--------|----------|-----------|
| `published_at IS NULL` | Publication ledger | Partial index for pending recovery |
| `byEventId` Map | M9 store | In-memory dedup, rebuilt from SQLite at boot |
| `acknowledged` boolean | Attention items | `false` → `true` on resolution |
| `approval-decision` items | Thread items | Cross-reference against `approval-request` items |
| `recovery.turn-reconciled` events | Engineering events | After reconciliation, threads are in terminal state |

---

## D2-2: Fast-Path Sequence

```
HTTP POST /api/interactions/:id/responses { choiceId }
  ↓
InteractionService.recordResponse()
  ↓
SqliteInteractionStore.putResponse()     ← durable fact (SQLite transaction)
  ↓
InteractionEventBusAdapter.onInteractionResponded()
  ↓
EventBus.emit({ type: 'interaction:responded', payload: { interactionId, selectedChoiceId, ... } })
  ↓
┌──────────────────────────────────────────────────────────────┐
│ FAST PATH (EventBus delivery, in-process)                     │
│                                                                │
│ Domain subscriber receives event                               │
│   ↓                                                           │
│ Extracts interactionId from payload                           │
│   ↓                                                           │
│ Queries own durable pending context by interactionId          │
│   ↓                                                           │
│ If found: mark as observed, revalidate, continue              │
│ If not found: ignore (not this domain's interaction)          │
└──────────────────────────────────────────────────────────────┘
```

**Assumption:** The EventBus is in-process and synchronous. When `emit()` returns, all subscribers have been called. If the domain subscriber is registered at boot, it will receive the event.

---

## D2-3: Recovery-Path Sequence

```
API restarts (crash or deliberate)
  ↓
Boot sequence: createWorkspaceContext()
  ↓
Domain re-subscribes to EventBus (standard bridge wiring)
  ↓
┌──────────────────────────────────────────────────────────────┐
│ RECOVERY PATH (boot reconciliation)                           │
│                                                                │
│ Domain reconciliation function runs                           │
│   ↓                                                           │
│ Queries own durable pending contexts                          │
│   WHERE response_received = true                              │
│   AND continuation_status != 'continued'                      │
│   ↓                                                           │
│ For each uncontinued response:                                │
│   ↓                                                           │
│ Look up authoritative response from InteractionService        │
│   (via SqliteInteractionStore.getResponse(interactionId))     │
│   ↓                                                           │
│ If response exists:                                           │
│   ↓                                                           │
│ Revalidate current domain state                               │
│   ↓                                                           │
│ Continue through governance/execution                         │
│   ↓                                                           │
│ Mark as continued                                             │
│                                                                │
│ If response not found:                                        │
│   ↓                                                           │
│ Log anomaly (pending context exists but no response)          │
│ Mark as stale or leave for future reconciliation              │
└──────────────────────────────────────────────────────────────┘
```

### Why Recovery Works

1. **Domain pending context is durable** (SQLite) — survives crashes
2. **InteractionResponse is durable** (SQLite) — survives crashes
3. **The domain can query both at boot** — no EventBus needed
4. **Idempotency is ensured** by the `continuation_status` marker — re-processing is safe because the marker prevents double-continuation

---

## D2-4: Creation Failure Matrix

### Two-Step Creation

```
Step 1: Domain creates durable pending context
        { interactionId, domainObject, choiceInterpretation, ... }
Step 2: InteractionService.present(interaction)
```

### Failure Scenarios

| # | Failure Point | Domain State | Interaction State | Recoverable? | Mechanism |
|---|--------------|-------------|-------------------|-------------|-----------|
| C1 | Step 1 fails | Nothing | Nothing | N/A | Clean abort |
| C2 | Step 1 succeeds, Step 2 fails | Pending context exists | No interaction | **Reconcilable** | Domain detects orphaned pending context at boot (no matching interaction) |
| C3 | Step 2 succeeds, domain state fails | Pending context lost | Interaction exists | **Reconcilable** | Interaction exists but no domain claims it — unowned response (D1-10) |
| C4 | Process crashes between Step 1 and Step 2 | Depends on timing | Depends on timing | **Reconcilable** | Either C2 or C3, both reconcilable |
| C5 | Both succeed | Persistent | Persistent | **Normal** | Fast path or recovery path handles continuation |

### Analysis

**C2 (domain context exists, interaction missing):**
- The domain has a pending context with an `interactionId` that doesn't exist in the interaction store
- At boot, the domain can detect this by querying `InteractionService.get(interactionId)` — if it throws "Interaction not found", the pending context is orphaned
- **Policy:** The domain should clean up orphaned pending contexts. This is a domain-level concern.

**C3 (interaction exists, domain context missing):**
- The interaction was created but the domain's pending context was lost
- The interaction has a response but nobody claims it
- This is the **unowned response** scenario (D1-10) — durable evidence, no continuation
- **Policy:** Do not raise failure. The response remains as historical evidence.

**C4 (crash between steps):**
- Depends on timing: if crash after SQLite commit of Step 1 but before Step 2, it's C2; if after Step 2 commit but before domain state persist, it's C3
- Both are reconcilable via the mechanisms above

### Key Insight

The two-step creation does NOT need to be atomic. The system already handles partial creation gracefully through reconciliation. The publication ledger pattern proves this: `InteractionService.present()` creates both the interaction and ledger entry atomically, but the domain's pending context is a separate step that doesn't need atomic coordination.

---

## D2-5: Response Failure Matrix

### Three-Step Response Pipeline

```
Step 1: HTTP records response (InteractionService.recordResponse())
Step 2: EventBus emits interaction:responded
Step 3: Domain subscriber receives and processes
```

### Failure Scenarios

| # | Failure Point | State | Recoverable? | Mechanism |
|---|--------------|-------|-------------|-----------|
| R1 | Step 1 fails (validation) | No response recorded | N/A | HTTP error to client |
| R2 | Step 1 fails (conflict) | Previous response exists | N/A | 409 to client (or 200 idempotent) |
| R3 | Step 1 succeeds, Step 2 fails | Response persisted, event not emitted | **Reconcilable** | Publication ledger recovery (getPendingPublications) |
| R4 | Step 2 succeeds, Step 3 fails (subscriber not registered) | Response persisted, event emitted, domain didn't see it | **Reconcilable** | Domain boot reconciliation |
| R5 | Step 3 starts, process crashes | Domain partially processed | **Reconcilable** | Idempotent continuation (status marker) |
| R6 | Step 3 completes, domain continuation fails | Domain observed, governance/execution failed | **Recoverable** | Domain retry logic (existing pattern) |

### Analysis

**R3 (publication ledger recovery):**
- The `interaction_publication_ledger` entry has `published_at = NULL`
- `getPendingPublications()` finds it
- Recovery re-emits the event
- This is the existing C2 publication recovery mechanism

**R4 (domain missed event):**
- The EventBus is in-process. If the domain subscriber is registered at boot, it receives the event.
- If the subscriber was not registered (e.g., domain package not loaded), the event is lost from the EventBus perspective.
- **Recovery:** At boot, the domain reconciliation function queries its own durable pending contexts and cross-references with the interaction store.

**R5 (crash during continuation):**
- The domain partially processed the response
- The `continuation_status` marker prevents double-processing on re-entry
- If the domain crashed before setting the marker, re-processing is safe because continuation is idempotent (see D2-6)

---

## D2-6: Domain Continuation Idempotency Model

### State Machine

```
pending ──────────────────────────────────────────────────────→ continued
  │                                                               ↑
  │ (interaction:responded received)                               │
  ↓                                                               │
observed ─────────────────────────────────────────────────────────→│
  │                                                               │
  │ (revalidation + governance satisfied)                          │
  ↓                                                               │
processing ───────────────────────────────────────────────────────→│
  │                                                               │
  │ (governance failed / domain state invalid)                     │
  ↓                                                               │
failed/retryable ──→ (retry) ──→ processing ──→ continued        │
```

### State Definitions (Derived from Evidence)

| State | Meaning | Duration | Evidence Pattern |
|-------|---------|----------|-----------------|
| `pending` | Interaction created, awaiting human response | Hours/days | Publication ledger `published_at IS NULL` |
| `observed` | `interaction:responded` received by domain subscriber | Milliseconds | In-memory (EventBus delivery) |
| `processing` | Domain revalidating and continuing | Milliseconds | Transient |
| `continued` | Domain successfully completed continuation | Terminal | Thread item `approval-decision` pattern |
| `failed/retryable` | Governance failed or domain state invalid | Retries possible | Thread `blocked` with reason code |

### Why These States Are Necessary

- `pending` → `observed`: Distinguishes "interaction exists" from "domain saw the response"
- `observed` → `processing`: Distinguishes "domain saw it" from "domain is acting on it"
- `processing` → `continued`: Distinguishes "domain is acting" from "domain finished"
- `failed/retryable`: Allows retry without re-triggering the entire pipeline

### Why NOT More States

The existing evidence shows that complex state machines (like the harness thread state) are necessary for multi-step operations with side effects. Domain continuation is typically a single operation: revalidate → governance → execute. A simpler state machine is sufficient.

### Idempotency Guarantee

If the domain crashes during `processing`:
1. The `continuation_status` is still `observed` (not yet `continued`)
2. At boot, the recovery path re-processes
3. The domain checks: "have I already continued this?" (idempotency key: `interactionId`)
4. If already continued: skip
5. If not: re-validate and continue

**The idempotency key is `interactionId`** — the same interaction cannot be continued twice because the domain's durable store tracks the status.

---

## D2-7: Durable State Ownership

### What the Domain Must Persist

| Field | Purpose | Source |
|-------|---------|--------|
| `interactionId` | Link to generic interaction | Created by domain |
| `domainObjectId` | Domain-specific entity being discussed | Created by domain |
| `choiceInterpretation` | Mapping of ChoiceId → domain action | Created by domain |
| `createdAt` | When the pending context was created | Domain timestamp |
| `continuationStatus` | `pending` \| `observed` \| `processing` \| `continued` \| `failed` | Updated by domain |
| `continuedAt` | When continuation completed (if terminal) | Domain timestamp |
| `correlationId` | Optional: links to upstream execution | Created by domain |

### What the Domain MUST NOT Persist

- Interaction content (owned by generic interaction authority)
- Response facts (owned by generic interaction authority)
- M9 activity records (owned by Activity Room projection)
- Publication ledger entries (owned by generic interaction authority)

### Ownership Boundary

```
┌─────────────────────────────────────────────┐
│ Generic Interaction Authority                │
│                                              │
│ interactions table (StructuredInteraction)   │
│ interaction_responses table (Response)       │
│ interaction_publication_ledger (delivery)    │
│ EventBus events (interaction:*)              │
└─────────────────────────────────────────────┘
              ↕ interactionId (opaque link)
┌─────────────────────────────────────────────┐
│ Domain Authority (per producer)              │
│                                              │
│ domain_pending_contexts table                │
│   (interactionId, domainObject, choices,     │
│    continuationStatus, ...)                  │
│                                              │
│ Domain-specific revalidation logic           │
│ Domain-specific governance path              │
│ Domain-specific execution path               │
└─────────────────────────────────────────────┘
```

---

## D2-8: Interaction Lookup Requirements

### What the Domain Needs from the Generic System

The domain needs to answer: "Has an authoritative response been recorded for interaction X?"

**Option A: Query InteractionService directly**
```typescript
const response = await interactionService.getResponse(interactionId);
// If response exists: authoritative response recorded
// If not: awaiting response
```

**Option B: Check interaction:responded event payload**
```typescript
// In the EventBus subscriber:
const response = event.payload; // Contains interactionId, selectedChoiceId, etc.
```

**Option C: Cross-reference domain state with interaction store**
```typescript
// At boot reconciliation:
const pending = await domainStore.getPendingByInteractionId(interactionId);
if (pending && pending.continuationStatus !== 'continued') {
  const response = await interactionStore.getResponse(interactionId);
  if (response) {
    // Authoritative response exists, resume continuation
  }
}
```

### Contract Requirements

The generic interaction system must expose:

| Method | Purpose | Already Exists? |
|--------|---------|----------------|
| `getResponse(interactionId)` | Look up authoritative response | **YES** — `SqliteInteractionStore.getResponse()` |
| `hasResponse(interactionId)` | Check if response exists (boolean) | **YES** — `SqliteInteractionStore.hasResponse()` |

**No new contract is needed.** The existing `InteractionPersistencePort` already provides the required lookup methods. The frozen public contracts (`StructuredInteraction`, `InteractionResponse`) are sufficient.

### The Frozen Public Contracts Are Sufficient

```
Domain at boot:
  1. Query own durable pending contexts
  2. For each pending context with continuationStatus != 'continued':
     a. Call interactionStore.getResponse(interactionId)
     b. If response exists → revalidate → continue
     c. If not → leave as pending
```

This requires no modification to `InteractionService`, `StructuredInteraction`, `InteractionResponse`, or any generic interaction contract.

---

## D2-9: Governance Boundary

### Seven Distinct Facts

| # | Fact | Authority | Evidence |
|---|------|-----------|----------|
| 1 | **Response observed** | Domain subscriber (EventBus) | `interaction:responded` received |
| 2 | **Choice interpreted** | Domain (choiceInterpretation mapping) | `selectedChoiceId` → domain action |
| 3 | **Current state valid** | Domain (revalidation query) | Domain queries current state |
| 4 | **Governance satisfied** | Existing governance stack | Permissions, policy, risk assessment |
| 5 | **Operation authorized** | Decision pipeline | Permission → Policy → Execution → Verification → Trust |
| 6 | **Operation executed** | Domain execution path | Existing harness/tools/workflow |
| 7 | **Outcome verified** | Verification engine | Existing evidence/verification |

### Why These Must Not Collapse

```
// WRONG: Generic governance.execute(choice)
interaction:responded → generic governance → execute

// RIGHT: Domain-specific governance chain
interaction:responded
  → domain observes
  → domain interprets choice
  → domain revalidates state
  → domain routes through EXISTING governance
  → existing permission check
  → existing policy check
  → existing approval (if required)
  → existing execution
  → existing verification
```

### The Governance Stack Is Not Modified

The existing governance mechanisms remain authoritative:

| Mechanism | File | Purpose |
|-----------|------|---------|
| Execution Policy | `packages/agent-harness/src/execution-policy.ts` | Three modes, effective policy |
| AI Invocation Guard | `packages/agent-harness/src/ai-invocation-guard.ts` | Fail-closed binding check |
| Orchestrator Approval | `packages/workflow-orchestrator/src/orchestrator.ts:763-791` | Risk-based task approval |
| Harness Tool Approval | `packages/agent-harness/src/index.ts:812-843` | Per-tool-call approval |
| Decision Pipeline | Kernel | Permission → Policy → Execution → Verification → Trust |
| Role-Based Permissions | `packages/types/src/permissions.ts` | Full RBAC |

**A producer recognizing a choice must not itself mean the protected operation is authorized.**

---

## D2-10: Crash/Restart Proof

### Scenario Matrix

| # | Scenario | survives? | Recovery |
|---|----------|-----------|----------|
| X1 | Response committed, EventBus delivery successful, domain continuation completes | ✅ | No recovery needed |
| X2 | Response committed, EventBus delivery successful, domain crashes during continuation | ✅ | Boot reconciliation: `continuationStatus` is `observed` or `processing`, re-validate and continue |
| X3 | Response committed, EventBus delivery successful, domain completes but crash before status update | ✅ | Boot reconciliation: `continuationStatus` is `observed`, re-validate and continue (idempotent) |
| X4 | Response committed, EventBus delivery fails (subscriber not registered) | ✅ | Boot reconciliation: domain queries durable pending contexts, cross-references with interaction store |
| X5 | Response committed, process crashes before EventBus emit | ✅ | Publication ledger recovery: `getPendingPublications()` finds pending entry, re-emits event |
| X6 | Response committed, process crashes after EventBus emit but before M9 ingestion | ✅ | Publication ledger recovery: same mechanism |
| X7 | API restarts, domain re-subscribes, no pending responses | ✅ | Normal — nothing to do |
| X8 | Domain package uninstalled, reinstalled later | ✅ | Domain reconciliation queries durable pending contexts, processes any uncontinued responses |

### Why In-Memory State Is Not a Problem

The only in-memory state in the domain subscriber is the EventBus subscription itself. This is re-established at boot (standard bridge pattern). The durable state (pending contexts, continuation status) survives in SQLite.

The EventBus `Set<InteractionId>` optimization (if used) is also in-memory and rebuilt at boot from the durable pending context store.

---

## D2-11: Duplicate Delivery Behavior

### EventBus Duplicate Delivery

The `InProcessEventBus` does NOT deduplicate across subscribers. Each subscriber receives every matching event exactly once per emit call. However:

1. If the same event is emitted twice (e.g., publication recovery re-emits), each subscriber receives it twice
2. The domain subscriber must handle this gracefully

### Idempotency Against Duplicates

| Duplicate Cause | Handling |
|----------------|----------|
| EventBus re-delivery (publication recovery) | Domain checks `continuationStatus` — if `continued`, skip |
| Reconciliation re-processing (boot) | Domain checks `continuationStatus` — if `continued`, skip |
| Concurrent duplicate (two subscribers for same domain) | Domain uses SQLite UNIQUE constraint on `interactionId` in pending contexts |

### The Status Marker Prevents Double Continuation

```
First delivery:
  continuationStatus = 'observed' → 'processing' → 'continued'

Second delivery (duplicate):
  continuationStatus = 'continued' → skip (already done)
```

This is the same pattern as `decideApproval()` — check for existing decision before re-executing.

---

## D2-12: Uninstall/Reinstall Behavior

### Uninstall Scenario

1. Domain creates pending context (durable in domain's SQLite)
2. Domain is uninstalled (domain's SQLite is deleted or left orphaned)
3. Human responds to interaction
4. `interaction:responded` fires — no domain subscriber
5. Response is recorded as durable evidence
6. Activity Room shows the response
7. No continuation occurs

### Reinstall Scenario

1. Domain is reinstalled
2. Domain's SQLite is recreated (empty) or restored from backup
3. If empty: no pending contexts — orphaned response (D1-10)
4. If restored: pending contexts exist with `continuationStatus != 'continued'`
5. Domain reconciliation runs at boot
6. Cross-references with interaction store
7. Continues any uncontinued responses

### Policy

The generic interaction system does not distinguish between "domain uninstalled" and "domain hasn't loaded yet." The response is durable evidence regardless. The domain's durable state is the recovery authority.

---

## D2-13: Scale Analysis

### Expected Producer Counts

| Category | Count | Interaction Frequency |
|----------|-------|----------------------|
| Marketplace | 1 | Low (capability installations) |
| Workflow Orchestrator | 1 | Medium (task approvals) |
| Agent Harness | 1 | High (tool approvals) |
| Diagnostics | 1 | Low (system health) |
| Configuration | 1 | Low (setting changes) |
| Future unknown | <10 | Variable |

**Total:** <15 producers expected.

### Fan-Out Cost

Each `interaction:responded` event fans out to all subscribers. With <15 producers:
- EventBus iteration: O(15) pattern matches (negligible)
- Each subscriber: O(1) SQLite query (indexed on `interactionId`)
- Total: O(15) indexed SQLite queries per response (negligible)

### In-Memory Set Optimization

The optional `Set<InteractionId>` filter (mentioned in D1) is NOT necessary at expected scale. With <15 producers and O(1) indexed queries, the overhead is negligible. If scale grows beyond ~50 producers, the optimization becomes relevant — but this is a future concern.

**Recommendation:** Do not implement the in-memory Set optimization. It adds complexity without measurable benefit at expected scale.

---

## D2-14: Dependency Direction

```
Generic Interaction Authority
  ↓ persists interaction/response facts
  ↓ emits interaction:responded
  ↓
EventBus (decoupled delivery)
  ↓ fans out to all subscribers
  ↓
┌─────────────────────────────────────────────┐
│ Domain A subscriber                          │
│   → queries Domain A durable state           │
│   → queries generic interaction store        │
│   → revalidates Domain A state               │
│   → routes through Domain A governance       │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│ Domain B subscriber                          │
│   → queries Domain B durable state           │
│   → queries generic interaction store        │
│   → revalidates Domain B state               │
│   → routes through Domain B governance       │
└─────────────────────────────────────────────┘
```

**Dependency rules:**
- Generic interaction authority: depends on persistence, EventBus, M9
- Each domain: depends on generic interaction authority (for `getResponse()`), own durable state, own governance
- No domain depends on another domain
- No central bridge depends on any domain
- **Acyclic, decoupled, composable**

---

## D2-15: Minimum Future Implementation Surface

### Per Producer (Domain-Owned)

| Component | Purpose | Size |
|-----------|---------|------|
| Durable pending context store | SQLite table mapping `interactionId` → domain state | ~30 lines (schema + CRUD) |
| EventBus subscriber | Subscribe to `interaction:responded`, filter by own interactions | ~15 lines |
| Boot reconciliation function | Query pending contexts, cross-reference with interaction store, continue | ~40 lines |
| Choice interpretation mapping | Domain-specific `ChoiceId` → action | Varies |

**Total per producer:** ~85 lines + domain-specific logic

### Generic Interaction Infrastructure

**Zero changes.** The existing contracts and persistence are sufficient:
- `InteractionService.getResponse(interactionId)` — already exists
- `SqliteInteractionStore.getResponse(interactionId)` — already exists
- `interaction:responded` event — already emitted
- Publication ledger recovery — already implemented

### What Would NOT Be Created

- No central bridge
- No central dispatcher
- No producer registry
- No generic continuation framework
- No generic governance.execute() abstraction
- No modification to frozen contracts

---

## D2-16: Blockers / Unresolved Questions

### 1. Domain Pending Context Schema

**Question:** What is the exact SQLite schema for the domain's pending context store?

**Answer:** This is domain-specific. Each producer defines its own schema. The minimum fields are `interactionId` (TEXT PRIMARY KEY) and `continuationStatus` (TEXT). Other fields are domain-specific.

**Recommendation:** Defer schema design to when a specific producer is implemented. The evidence proves the pattern works; the exact schema is a domain concern.

### 2. Reconciliation Timing

**Question:** When exactly does boot reconciliation run?

**Answer:** Within `createWorkspaceContext()`, after `importThreadHistory()` and `reconcileInterruptedThreads()`. The domain's reconciliation should run at the same phase.

**Recommendation:** Follow the existing pattern — wire domain reconciliation in `createWorkspaceContext()` alongside other recovery operations.

### 3. InteractionStore Access from Domain

**Question:** How does the domain access `InteractionStore.getResponse()`?

**Answer:** The domain receives the `InteractionService` (or `SqliteInteractionStore`) at composition time, just like other services receive their dependencies.

**Recommendation:** Inject the interaction store as a dependency when wiring the domain subscriber at composition time.

### 4. Error Handling During Reconciliation

**Question:** What happens if the domain's reconciliation function throws?

**Answer:** Follow the existing pattern — `harnessSession.restoreActiveSessions()` is fire-and-forget with `.catch()` logging. The domain reconciliation should be similarly resilient: log errors, continue with other pending contexts.

**Recommendation:** Per-interaction error isolation — one failing continuation must not block others.

---

## D2-17: Proof That Frozen Contracts Are Sufficient

### Required Lookup: "Has an authoritative response been recorded for interaction X?"

**Contract method:** `SqliteInteractionStore.getResponse(interactionId: InteractionId): Promise<{ response: InteractionResponse } | undefined>`

**Already implemented:** `packages/interaction-persistence/src/sqlite-store.ts` lines 213-227

```typescript
async getResponse(interactionId: InteractionId): Promise<{ response: InteractionResponse } | undefined> {
  const row = this.queryOne<{ ... }>(
    `SELECT response_id, selected_choice_id, ... FROM interaction_responses WHERE interaction_id = ?`,
    [interactionId],
  );
  if (!row) return undefined;
  return { response: { responseId: ..., selectedChoiceId: ..., ... } };
}
```

**No modification needed.** The domain can query this at boot to discover authoritative responses for its pending interactions.

### Required Event: "An authoritative response was recorded"

**Contract event:** `interaction:responded` with payload `{ interactionId, selectedChoiceId, responseId, ... }`

**Already emitted:** `packages/interaction-persistence/src/interaction-event-bus-adapter.ts` lines 40-55

**No modification needed.** The domain subscribes to this event for the fast path.

### Required Persistence: "Domain pending context survives restarts"

**Already proven:** SQLite-backed stores with `persist()` after every write (the standard pattern across 10+ stores in the codebase).

**No modification needed.** The domain creates its own SQLite store following the established pattern.

---

*End of AR-REC-C2-I3-D2 evidence document.*

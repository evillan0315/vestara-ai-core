# ARX-015 AR-REC-C2-I3-I1 — First Real Producer Selection & Implementation Preflight

> **Status**: PREFLIGHT / EVIDENCE / DESIGN ONLY  
> **Authorized by**: Director  
> **Executed by**: vestara-developer  
> **Date**: 2026-08-30  
> **Frozen baselines**: AR-REC-A at `355922b`, AR-REC-B at `5dc54ba`, AR-REC-C1 at `fc30f8b`, AR-REC-C2-D1 at `83e68cc`, AR-REC-C2-I1 at `4418709`, AR-REC-C2-I2-C1 at `a8cc2e3`, AR-REC-C2-I2-I1 at `f83e1a4`, C2-I3-PREFLIGHT at `e2b6164`, C2-I3-D1 at `6f89e8d`, C2-I3-D2 at `5ead7a6`  
> **Mutation scope**: Documentation/evidence only. No production code, tests, schemas, stores, routes, events, UI components, or behavioral changes.  
> **Implementation authorization**: NOT AUTHORIZED.

---

## I1-0: Objective

Identify the smallest existing real Vestara domain that can serve as the first production proof of the AR-REC domain-owned continuation topology (D1 at `6f89e8d`, D2 at `5ead7a6`).

---

## I1-1: Candidate Inventory

### Candidate 1: Agent Harness Tool-Call Approval

**Status: ACTIVE, PRODUCTION, DURABLE**

**Trigger:** A tool invocation returns `status: 'approval-required'` from `ToolRuntime.invoke()`. This happens when the `RiskBasedToolPolicy` evaluates a tool with risk `high` and the tool has not been pre-approved.

**Tools that trigger approval:**

| Tool | Risk | File |
|------|------|------|
| `shell.execute` | `high` | `packages/tools/shell/src/index.ts:132` |
| `git.add` | `high` | `packages/tools/git/src/index.ts:195` |
| `git.commit` | `high` | `packages/tools/git/src/index.ts:218` |

**What the human chooses:** Approve or Reject the specific tool call (e.g., `git.commit` on a sensitive repository).

**Durable state:**
- Thread items of kind `approval-request` and `approval-decision` in `ThreadStore` (SQLite)
- Turn state persisted as `awaiting-approval`
- `pendingApprovals()` reads from durable thread items, not in-memory state

**Governance:** `RiskBasedToolPolicy` → `ExecutionPolicy` → `AIInvocationGuard`

**Execution:** Re-invocation of the tool with `approved = true`, then remaining queued calls, then turn continuation

**Verification:** Tool execution produces `EvidenceArtifact[]`; turn continues to verification phase

**Restart/recovery:** `pendingApprovals()` discovers unresolved approvals by cross-referencing `approval-request` and `approval-decision` thread items

**HTTP endpoint:** `POST /api/agent-threads/:threadId/approvals/:approvalId/resolve`

---

### Candidate 2: Workflow Orchestrator High-Risk Task Approval

**Status: ACTIVE, PRODUCTION, DURABLE**

**Trigger:** `DefaultRiskApprovalPolicy` flags a task when files exceed threshold, contain deletes, or touch sensitive paths.

**What the human chooses:** Approve or Reject a high-risk task before agent dispatch.

**Durable state:** Task store (SQLite) with `status: 'awaiting-approval'`; event log with `task.approval-requested`

**Governance:** `DefaultRiskApprovalPolicy.evaluate()` → task status transition

**Execution:** Task transitions to `assigned`, dispatched to agent

**Verification:** Task completion via agent execution; verification phase

**HTTP endpoint:** `POST /api/orchestration/projects/:projectId/tasks/:taskId/approval`

---

### Candidate 3: Marketplace Permission Gate

**Status: ACTIVE, PRODUCTION**

**Trigger:** Extension install/update requires permissions.

**What the human chooses:** Grant or Reject extension permissions.

**Durable state:** In-memory `MarketplaceOperationDto` with `status: 'awaiting-permission'`

**Governance:** Permission enumeration from extension manifest

**Execution:** Extension installation

**HTTP endpoint:** `POST /api/marketplace/install` with `approved: true`

**Weakness:** Two-call pattern (not real-time blocking); in-memory state; different approval semantics (permission grant vs. operation approval)

---

### Candidate 4: Documentation Proposal Approval

**Status: ACTIVE, PRODUCTION**

**Trigger:** Documentation plan targets governance/constitution/blueprint paths.

**What the human chooses:** Approve or Reject a documentation proposal.

**Durable state:** `DocumentationProposal` with `status: 'proposed'`

**Governance:** `NEVER_AUTOMATICALLY_APPLY` list; `approvalRequired` flag

**Execution:** `applyProposal()` writes documentation files

**Weakness:** Niche use case; less frequently triggered; simpler governance

---

### Candidate 5: OpenCode Permission Dialog

**Status: ACTIVE, PRODUCTION**

**Trigger:** Upstream `permission.asked` events from OpenCode runtime.

**What the human chooses:** Approve or Reject tool permission with scope (once/session).

**Durable state:** In-memory permission registry; audit log entries

**Governance:** Risk classification (safe/sensitive/dangerous)

**Execution:** Permission forwarded to upstream OpenCode server

**Weakness:** Upstream-controlled; not Vestara-owned governance; in-memory state

---

## I1-2: Candidate Comparison Matrix

| Criterion | Harness Approval | Orchestrator Approval | Marketplace | Documentation | OpenCode |
|-----------|-----------------|----------------------|-------------|---------------|----------|
| Real production use | ✅ shell/git tools | ✅ high-risk tasks | ✅ extension install | ✅ governance docs | ✅ upstream tools |
| Domain ownership | ✅ AgentHarness | ✅ WorkflowOrchestrator | ✅ MarketplaceService | ✅ DocumentationService | ❌ OpenCode |
| Existing durable state | ✅ ThreadStore (SQLite) | ✅ TaskStore (SQLite) | ⚠️ In-memory DTO | ✅ Proposal state | ❌ In-memory |
| Existing governance | ✅ RiskBasedToolPolicy + ExecutionPolicy + AIInvocationGuard | ✅ DefaultRiskApprovalPolicy | ✅ Permission manifest | ✅ NEVER_AUTOMATICALLY_APPLY | ⚠️ Risk classification |
| Existing execution path | ✅ Tool re-invocation | ✅ Task dispatch | ✅ Extension install | ✅ File write | ❌ Forward to upstream |
| Existing verification | ✅ EvidenceArtifact + verification phase | ✅ Verification phase | ⚠️ Install success | ✅ File diff | ❌ N/A |
| Natural structured choice | ✅ Approve/Reject tool | ✅ Approve/Reject task | ✅ Grant/Reject permissions | ✅ Approve/Reject proposal | ✅ Approve/Reject + scope |
| Restart/recovery | ✅ pendingApprovals() from durable store | ✅ Task status query | ❌ In-memory lost | ✅ Proposal status query | ❌ Re-surfaced from SSE |
| Low blast radius | ✅ Single tool call | ⚠️ Entire task | ⚠️ Extension install | ✅ Single document | ⚠️ Upstream dependency |
| Low semantic invention | ✅ Direct mapping | ✅ Direct mapping | ⚠️ Different semantics | ✅ Direct mapping | ❌ Different architecture |
| Genericity value | ✅ Proves topology for most common HITL | ✅ Proves topology for workflow | ⚠️ Different pattern | ⚠️ Niche | ❌ Not Vestara-owned |
| Proves D1/D2 end-to-end | ✅ Full fast+recovery path | ✅ Full fast+recovery path | ⚠️ Partial | ✅ Full path | ❌ Different architecture |
| Activity Room → response → continuation | ✅ Direct proof | ✅ Direct proof | ⚠️ Indirect | ✅ Direct proof | ❌ Not applicable |

---

## I1-3: Recommended First Producer

### **Agent Harness Tool-Call Approval**

### Why

1. **Most mature durable state:** Thread items with `approval-request` and `approval-decision` kinds, persisted in SQLite via `ThreadStore`. The `pendingApprovals()` method already reads from durable state — the exact pattern D2 requires.

2. **Deepest governance integration:** Three-layer governance (RiskBasedToolPolicy → ExecutionPolicy → AIInvocationGuard) already runs after the human decision. No new governance needed.

3. **Direct execution path:** `decideApproval()` re-invokes the tool with `approved = true`, processes remaining queued calls, and continues the turn. The execution path is proven and production-tested.

4. **Natural structured choice:** "Approve this git.commit" / "Reject this git.commit" — exactly the kind of opaque ChoiceId → domain meaning mapping D1 describes.

5. **Restart/recovery proven:** `pendingApprovals()` cross-references `approval-request` and `approval-decision` thread items from durable store. This is the D2 reconciliation pattern already implemented.

6. **Lowest semantic invention:** The harness already has the entire flow — approval request, human decision, tool re-execution, continuation. AR-REC would replace the HTTP resolution endpoint with an InteractionResponse, not invent new semantics.

7. **Highest genericity value:** If AR-REC can prove the topology for harness approval (the most common HITL pattern), it proves the topology for all similar patterns.

### Why Not Others

| Candidate | Rejection/Deferral Reason |
|-----------|--------------------------|
| Orchestrator Task Approval | Good candidate but less frequently triggered; higher blast radius (entire task vs. single tool call); defers to harness as proof |
| Marketplace Permission Gate | Two-call pattern, in-memory state, different semantics (permission grant vs. operation approval); not a clean fit for D1/D2 |
| Documentation Proposal Approval | Niche use case; less frequently triggered; simpler governance; defers to harness as proof |
| OpenCode Permission Dialog | Upstream-controlled; not Vestara-owned governance; in-memory state; different architecture; cannot prove Vestara's own topology |

---

## I1-4: Existing Ownership/Persistence/Governance/Evidence Evidence

### Ownership

The `AgentHarnessRuntime` owns the approval flow. It creates the approval request, persists the thread item, and resolves the decision. The `ThreadStore` is the durable ownership authority.

### Persistence

**File:** `packages/agent-harness/src/index.ts`

| What | Where | Durability |
|------|-------|------------|
| Approval request | `ThreadItem` kind `approval-request` in `ThreadStore` | SQLite, survives restart |
| Approval decision | `ThreadItem` kind `approval-decision` in `ThreadStore` | SQLite, survives restart |
| Turn state | `AgentTurn.state = 'awaiting-approval'` | SQLite, survives restart |
| Pending tool calls | `ApprovalRequestPayload.pendingCalls` in thread item | SQLite, survives restart |
| Active run lock | `Map<threadId, ActiveRun>` in harness | In-memory, lost on restart |

### Governance

**File:** `packages/tool-runtime/src/index.ts` lines 81-89

```
RiskBasedToolPolicy:
  critical → deny
  high → require-approval
  medium → allow-and-notify
  low → allow
```

After approval, the tool is re-invoked with `approved = true`, which bypasses the `require-approval` gate. The `ExecutionPolicy` and `AIInvocationGuard` provide additional governance layers.

### Execution

**File:** `packages/agent-harness/src/index.ts` lines 460-495

`decideApproval()` when approved:
1. Re-invokes `ToolRuntime.invoke(request, signal, approved=true)`
2. Records tool result as `ThreadItem`
3. Executes remaining `pendingCalls` (queued tool calls)
4. Continues turn via `continueTurn()` reasoning loop

### Evidence

- Thread items `approval-request` and `approval-decision` record who asked, why, and who decided
- Events `harness.approval.requested` and `harness.approval.resolved` emitted through EventBus
- Tool execution produces `EvidenceArtifact[]`
- Turn continues to verification phase

---

## I1-5: Fast-Path Sequence

```
1. LLM returns tool calls (e.g., git.add, git.commit)
         ↓
2. executeToolCalls() iterates calls sequentially
         ↓
3. For git.add: ToolRuntime.invoke(request, signal, approved=false)
         ↓
4. RiskBasedToolPolicy.evaluate({risk: 'high'})
   → { decision: 'require-approval' }
         ↓
5. invoke() returns { status: 'approval-required' }
         ↓
6. Harness (PRODUCER) detects approval-required:
   a. Generates unique approvalId
   b. Serializes remaining calls into pendingCalls[]
   c. Persists 'approval-request' ThreadItem (durable)
   d. Transitions turn to 'awaiting-approval'
   e. Emits 'harness.approval.requested'
   f. Returns { approvalId }
         ↓
7. Domain creates StructuredInteraction:
   - interactionId = derived from approvalId
   - content = "Approve git.add on [files]"
   - choices = [ { choiceId: 'approve' }, { choiceId: 'reject' } ]
   - presentingParticipantId = agent thread ID
         ↓
8. InteractionService.present(interaction)
   → durable fact persisted
   → interaction:presented emitted
   → M9 ingested → Activity Room shows interaction
         ↓
9. Human chooses 'approve' in Activity Room
         ↓
10. POST /api/interactions/:interactionId/responses { choiceId: 'approve' }
    → InteractionService.recordResponse()
    → durable response fact persisted
    → interaction:responded emitted
         ↓
11. Domain subscriber receives interaction:responded
    → extracts interactionId, selectedChoiceId='approve'
    → queries own pending context by interactionId
    → interprets: 'approve' → approved=true
         ↓
12. Domain revalidates: is turn still awaiting-approval?
    → checks ThreadStore: turn.state === 'awaiting-approval' ✓
         ↓
13. Existing governance: RiskBasedToolPolicy → approved=true bypasses gate
         ↓
14. Existing execution: ToolRuntime.invoke(request, signal, approved=true)
    → tool executes
    → EvidenceArtifact[] produced
         ↓
15. Remaining pendingCalls executed (git.commit)
         ↓
16. Turn continues via continueTurn()
         ↓
17. Domain marks continuation complete
    → appends 'approval-decision' ThreadItem
    → emits 'harness.approval.resolved'
```

---

## I1-6: Recovery Sequence

```
1. Vestara / API restarts
         ↓
2. Boot sequence: createWorkspaceContext()
         ↓
3. Domain re-subscribes to EventBus (standard bridge wiring)
         ↓
4. Domain reconciliation function runs:
   a. Queries ThreadStore for all threads with turn.state === 'awaiting-approval'
   b. For each: calls pendingApprovals(threadId) to find unresolved approvals
   c. For each pending approval:
      - Checks InteractionStore.getResponse(interactionId)
      - No response → remain pending (human hasn't responded yet)
      - Response exists → interpret + revalidate + continue
         ↓
5. Revalidation: is turn still awaiting-approval?
   → If yes: proceed with continuation
   → If no: skip (already resolved by another path)
         ↓
6. Existing governance: RiskBasedToolPolicy → approved=true
         ↓
7. Idempotent continuation:
   → decideApproval() checks for existing 'approval-decision' ThreadItem
   → If found: returns existing outcome (no re-execution)
   → If not found: proceeds with tool re-execution
         ↓
8. Tool executes (idempotent if already executed)
         ↓
9. Domain marks continuation complete
```

---

## I1-7: Creation Failure Matrix

### Two-Step Creation

```
Step 1: Harness (producer) creates durable pending context
        (approval-request ThreadItem + turn state transition)
Step 2: InteractionService.present(interaction)
```

### Failure Scenarios

| # | Failure Point | Harness State | Interaction State | Recoverable? | Mechanism |
|---|--------------|--------------|-------------------|-------------|-----------|
| A | Step 1 fails | Nothing persisted | Nothing | N/A | Clean abort — tool invocation fails, turn continues or fails |
| B | Step 1 succeeds, Step 2 fails | Approval-request ThreadItem exists, turn in awaiting-approval | No interaction | **Reconcilable** | Harness pendingApprovals() finds the request. No interaction means human can't respond via Activity Room, but can still resolve via existing HTTP endpoint. Not a contradiction — dual resolution path. |
| C | Step 2 succeeds, Step 1 fails | No approval request | Interaction exists but no domain context | **Reconcilable** | Unowned response (D1-10). Interaction exists as evidence. No domain claims it. Activity Room shows it. |
| D | Crash between Step 1 and Step 2 | Depends on timing | Depends on timing | **Reconcilable** | Either B or C, both reconcilable |

### D2 Conclusion Validated

D2's conclusion that "domain pending context + StructuredInteraction creation does not require one cross-domain transaction" **holds for the harness producer**:

- **Scenario B** is the critical case: the harness approval request exists but the interaction was never created. The harness already has a resolution path (existing HTTP endpoint). The missing interaction means the Activity Room can't display it, but the harness can still function. This is a graceful degradation, not a contradiction.
- **Scenario C** is the unowned response case — durable evidence, no continuation. Already handled by D1-10 policy.

---

## I1-8: Response/Continuation Crash Matrix

### Crash Windows

| # | Scenario | State | Idempotent? | Recovery |
|---|----------|-------|-------------|----------|
| 1 | Response committed, EventBus delivery successful, continuation completes | Normal | N/A | No recovery needed |
| 2 | Response committed, EventBus delivery successful, crash during tool re-execution | Tool may have executed | **Depends on tool** | `decideApproval()` idempotency check: if 'approval-decision' ThreadItem exists, returns existing outcome without re-execution |
| 3 | Response committed, EventBus delivery successful, crash after tool execution but before 'approval-decision' persisted | Tool executed, decision not recorded | **Yes** — `decideApproval()` re-checks, finds no decision, re-invokes tool (tools are idempotent: git.add on same files is safe) |
| 4 | Response committed, EventBus delivery fails (subscriber not registered) | Response in DB, no domain action | **Reconcilable** | Boot reconciliation: pendingApprovals() + getResponse() |
| 5 | Response committed, crash before EventBus emit | Response in DB, publication ledger pending | **Reconcilable** | Publication recovery re-emits interaction:responded |
| 6 | Duplicate EventBus delivery | Same response delivered twice | **Yes** — `decideApproval()` idempotency check prevents double execution |
| 7 | EventBus + reconciliation racing | Both deliver simultaneously | **Yes** — `decideApproval()` acquires active run lock; second invocation throws "Thread already has an active run" |

### Critical Crash Window Analysis

```
protected operation succeeds (git.add executes)
            ↓
        PROCESS CRASH
            ↓
    "continued" (approval-decision ThreadItem) not persisted
```

**Is this safe?**

**Yes.** The tool execution is the protected operation. `git.add` is idempotent — adding the same files again is safe. When the harness restarts:
1. `pendingApprovals()` finds the unresolved approval (no 'approval-decision' item)
2. `decideApproval()` is called again
3. It re-invokes `ToolRuntime.invoke(request, signal, approved=true)`
4. `git.add` runs again on the same files — idempotent, no harm
5. The 'approval-decision' ThreadItem is now persisted
6. Continuation proceeds

**Key insight:** The harness approval flow is safe because:
- The tools (`shell.execute`, `git.add`, `git.commit`) are operationally idempotent or evidence-backed
- `decideApproval()` checks for existing decisions before re-execution
- The active run lock prevents concurrent re-execution

**This is NOT universally true for all domains.** The harness approval flow works because its tools are idempotent. A domain with non-idempotent operations would need additional protection (e.g., operation deduplication, transactional recording, or evidence-backed execution).

---

## I1-9: Idempotency Proof

### Duplicate EventBus Delivery

```
First delivery:
  Domain subscriber: queries pendingApprovals() → finds request
  → calls decideApproval() → checks for existing decision → none found
  → records decision, re-invokes tool, continues

Second delivery (duplicate):
  Domain subscriber: queries pendingApprovals() → request still pending?
  → calls decideApproval() → checks for existing decision → FOUND
  → returns existing outcome (no re-execution)
```

**Proof:** `decideApproval()` lines 422-429 scan thread items for existing `approval-decision`. If found, returns the turn's outcome without re-executing the tool.

### EventBus + Reconciliation Racing

```
EventBus delivery: decidesApproval() → acquires active run lock
Reconciliation: pendingApprovals() → calls decideApproval() → "Thread already has an active run" → throws
```

**Proof:** The active run lock (`this.active` Map) prevents concurrent execution. Second path gets an error, which is logged and skipped.

### Restart After Response But Before Continuation

```
Restart → pendingApprovals() finds request
→ getResponse(interactionId) finds response
→ interpret + revalidate
→ decideApproval() → no existing decision → proceed
```

**Proof:** Same as first delivery. Idempotency check ensures safe re-entry.

### Restart During Continuation

```
Crash during tool re-execution
Restart → pendingApprovals() finds request (no decision recorded)
→ decideApproval() → re-invokes tool (idempotent) → records decision
```

**Proof:** Tool idempotency + decision check = safe recovery.

### Restart After Protected Operation But Before Marking Continued

```
Tool executed → crash before 'approval-decision' persisted
Restart → pendingApprovals() finds request (no decision)
→ decideApproval() → re-invokes tool (idempotent) → records decision
```

**Proof:** Same as above. The tool is idempotent, so re-execution is safe.

### Reconciliation After Successful Completion

```
Continue after successful completion:
→ pendingApprovals() → approval-decision exists → skipped
```

**Proof:** The decision ThreadItem prevents re-processing. `pendingApprovals()` filters out decided approvals.

---

## I1-10: Governance Boundary

### Seven D2 Facts — Harness Approval Mapping

| # | Fact | Harness-Specific Evidence |
|---|------|--------------------------|
| 1 | **Response recorded** | `InteractionService.recordResponse()` persists response in SQLite |
| 2 | **Response observed** | Domain subscriber receives `interaction:responded` via EventBus |
| 3 | **Choice interpreted** | `'approve'` → `approved = true`; `'reject'` → `approved = false` |
| 4 | **Current state revalidated** | Check `turn.state === 'awaiting-approval'` in ThreadStore |
| 5 | **Governance satisfied** | `RiskBasedToolPolicy` → `approved=true` bypasses `require-approval` gate; `ExecutionPolicy` and `AIInvocationGuard` also checked |
| 6 | **Operation executed** | `ToolRuntime.invoke(request, signal, approved=true)` — actual tool execution |
| 7 | **Outcome verified** | Tool produces `EvidenceArtifact[]`; turn continues to verification phase |

### Human Choice ≠ Execution Authorization

The human selecting `'approve'` does NOT directly authorize the tool execution. The governance chain is:

```
Human choice: 'approve'
  ↓
Domain interprets: approved=true
  ↓
Domain revalidates: turn still awaiting-approval?
  ↓
RiskBasedToolPolicy: approved=true → bypasses require-approval
  ↓
ExecutionPolicy: evaluates operation against effective policy
  ↓
AIInvocationGuard: verifies binding, budget, mode
  ↓
ToolRuntime.invoke(approved=true): executes tool
```

**Each step is a separate authority.** The human choice is the first link in the chain, not the entire chain.

---

## I1-11: Genericity Proof

### BananaDepartment Test

If BananaDepartment wanted to use the same topology:

1. BananaDepartment creates durable pending context in its own store
2. BananaDepartment calls `InteractionService.present(interaction)`
3. Human responds in Activity Room
4. `interaction:responded` fires
5. BananaDepartment's subscriber receives event
6. BananaDepartment queries its own store by `interactionId`
7. BananaDepartment interprets choice using its own mapping
8. BananaDepartment revalidates its own state
9. BananaDepartment routes through its own governance
10. BananaDepartment executes its own operation

**No modification to harness, InteractionService, Activity Room, or any other producer.**

The harness approval is a **proof of topology**, not a special case. BananaDepartment follows the exact same pattern with its own domain logic.

---

## I1-12: Performance Assessment

### Expected Pending-State Cardinality

| Metric | Value |
|--------|-------|
| Concurrent awaiting-approval turns | 0-5 (rarely more) |
| Total pending approvals per boot | 0-3 (most boots have none) |
| Query cost per reconciliation | O(pending) × O(1) SQLite lookup |

### Recovery Query Cost

```
For each thread with turn.state === 'awaiting-approval':
  pendingApprovals(threadId) → scan thread items → O(items per thread)
  getResponse(interactionId) → O(1) indexed lookup
```

**Total:** O(pending × items_per_thread) — negligible at expected scale.

### In-Memory InteractionId Set

**Not necessary.** With 0-5 pending approvals, the SQLite query is fast enough. The in-memory optimization is only relevant at scale >50 concurrent approvals, which is not expected for the harness approval use case.

---

## I1-13: Minimum Implementation Surface

### What Would Need to Be Created

| Component | Package | Purpose | Size |
|-----------|---------|---------|------|
| Harness approval producer adapter | `apps/api/src/bridges/` or `packages/agent-harness/src/` | Creates StructuredInteraction from approval request, subscribes to interaction:responded, maps ChoiceId to approved boolean | ~80-120 lines |
| Integration with existing `decideApproval()` | `packages/agent-harness/src/index.ts` | Add alternative resolution path via InteractionResponse | ~20-30 lines |
| Boot reconciliation for interaction-backed approvals | `apps/api/src/workspace-context.ts` | Wire harness reconciliation alongside existing recovery | ~20-30 lines |

**Total:** ~120-180 lines

### What Would NOT Change

| Component | Why No Change |
|-----------|--------------|
| `StructuredInteraction` contract | Frozen |
| `InteractionResponse` contract | Frozen |
| `InteractionService` | Frozen |
| `InteractionEventBusAdapter` | Frozen |
| Activity Room / M9 | Frozen |
| HTTP interaction route | Frozen |
| `RiskBasedToolPolicy` | Already produces `require-approval` |
| `ExecutionPolicy` | Already evaluates after approval |
| `AIInvocationGuard` | Already verifies after approval |
| `ToolRuntime.invoke()` | Already accepts `approved` parameter |
| `pendingApprovals()` | Already reads from durable store |
| `decideApproval()` | Already handles idempotency |

### What Would Be Touched

| File | Change |
|------|--------|
| `packages/agent-harness/src/index.ts` | Add `presentApprovalAsInteraction()` method; add `resolveFromInteractionResponse()` method |
| `apps/api/src/routes/interactions.ts` | No change (generic route handles all producers) |
| `apps/api/src/workspace-context.ts` | Wire harness interaction subscriber at boot |

---

## I1-14: Tests Required

| Test | Purpose |
|------|---------|
| `presentApprovalAsInteraction()` creates correct StructuredInteraction | Verify mapping from approval request to interaction |
| `resolveFromInteractionResponse()` with 'approve' calls `decideApproval(approved=true)` | Verify choice interpretation |
| `resolveFromInteractionResponse()` with 'reject' calls `decideApproval(approved=false)` | Verify choice interpretation |
| `resolveFromInteractionResponse()` when turn no longer awaiting-approval | Verify revalidation |
| Boot reconciliation discovers pending approvals with responses | Verify recovery path |
| Boot reconciliation skips already-continued approvals | Verify idempotency |
| Duplicate EventBus delivery is idempotent | Verify duplicate safety |
| Crash during tool re-execution recovers safely | Verify crash window |

---

## I1-15: Blockers / Contradictions

### None Identified

D2's generic conclusions hold for the harness producer:
- Creation atomicity: Two-step creation is not atomic, but both partial-creation scenarios are reconcilable
- Response idempotency: `decideApproval()` idempotency check + tool idempotency = safe recovery
- Governance boundary: Seven D2 facts map cleanly to harness-specific authorities
- Restart durability: `pendingApprovals()` reads from durable store, works after restart

### One Observation

The harness approval flow already has a working resolution path (HTTP endpoint). The AR-REC integration would add an **alternative** resolution path via Activity Room InteractionResponse, not replace the existing path. This means:
- The harness continues to work without AR-REC
- AR-REC adds Activity Room as an additional resolution surface
- Both paths converge at `decideApproval()`

This is the correct architectural relationship — AR-REC extends, not replaces.

---

## I1-16: Recommendation

### Smallest Implementation Milestone

**AR-REC-C2-I3-I2: Harness Approval → InteractionResponse Bridge**

**Scope:**
1. `presentApprovalAsInteraction()` — maps `ApprovalRequestPayload` → `StructuredInteraction`
2. `resolveFromInteractionResponse()` — maps `InteractionResponse.selectedChoiceId` → `approved` boolean → `decideApproval()`
3. Boot reconciliation — discovers pending approvals with responses
4. Tests proving fast path, recovery path, idempotency, crash safety

**NOT in scope:**
- Activity Room UI changes
- Generic interaction contract changes
- New governance authorities
- New execution mechanisms
- Workflow/Harness/Orchestration behavior changes

---

*End of AR-REC-C2-I3-I1 evidence document.*

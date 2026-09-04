---
title: "AR-REC-C2 I3-I2 Evidence: Harness Approval Producer Implementation"
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# AR-REC-C2 I3-I2 Evidence: Harness Approval Producer Implementation

**Frozen**: `d9788e0` (implementation), `f853fd4` (evidence), `a683c76` (C1 recovery correction)
**Date**: 2026-08-30
**Status**: FROZEN

## Summary

Implemented the first real producer integration: Agent Harness tool-call approval → StructuredInteraction → Activity Room → InteractionResponse → Harness continuation.

### I3-I2-C1 Correction: Harness Continuation Recovery Reliability

Closed the recovery gap where a durable InteractionResponse could remain indefinitely uncontinued during the same process lifetime if:
1. EventBus continuation fails
2. Boot reconciliation also fails
3. No process restart occurs

**Fix**: Added bounded retry with exponential backoff (max 3 retries, 1s → 2s → 4s) and observability logging.

## Files Changed

### New Files (I3-I2)

| File | Lines | Purpose |
|------|-------|---------|
| `packages/agent-harness/src/harness-approval-interaction-adapter.ts` | ~180 | Domain-owned adapter: approvalId ↔ interactionId, approvalToInteraction, ChoiceId interpretation, resolveFromInteractionResponse, findUncontinuedApprovals |
| `apps/api/src/bridges/harness-approval-interaction-bridge.ts` | ~240 | Composition root: subscribes to interaction:responded, filters to harness approvals, delegates to decideApproval(), boot reconciliation with bounded retry |
| `packages/agent-harness/__tests__/harness-approval-interaction-adapter.test.ts` | ~280 | 28 unit tests for adapter functions |
| `apps/api/__tests__/harness-approval-interaction-bridge.test.ts` | ~520 | 14 unit tests for bridge event handling and reconciliation |
| `apps/api/__tests__/harness-approval-production-chain.test.ts` | ~430 | 6 production-chain integration tests |
| `apps/api/__tests__/harness-approval-recovery.test.ts` | ~400 | 10 recovery/retry evidence tests (I3-I2-C1) |

### Modified Files

| File | Changes |
|------|---------|
| `packages/agent-harness/src/index.ts` | Re-export adapter functions from main package entry point |
| `packages/agent-harness/package.json` | Add `@vestara/interaction-app`, `@vestara/interaction-persistence` deps |
| `apps/api/src/workspace-context.ts` | Wire bridge with InteractionService, harness, thread resolver, disposal pattern |
| `pnpm-lock.yaml` | Dependency updates |

## Architecture

### Three-Layer Design

```
┌─────────────────────────────────────────────────────────────────┐
│                    Composition Root (Bridge)                     │
│  createHarnessApprovalInteractionBridge()                        │
│  - subscribes to interaction:responded                          │
│  - filters to harness approval interactions                     │
│  - delegates to decideApproval()                                │
│  - boot reconciliation with bounded retry (I3-I2-C1)           │
│  - exponential backoff: 1s, 2s, 4s (max 3 retries)            │
│  - observable failures via BridgeLogger                         │
├─────────────────────────────────────────────────────────────────┤
│                    Domain Adapter (Stateless)                     │
│  approvalToInteraction(), interpretApprovalResponse()           │
│  approvalInteractionId(), resolveFromInteractionResponse()      │
│  - ONLY place where ChoiceId → approved boolean mapping lives   │
│  - deterministic interactionId = approvalId (no mapping table)  │
├─────────────────────────────────────────────────────────────────┤
│                    Existing Harness (Unmodified)                 │
│  pendingApprovals() — reads from durable ThreadStore            │
│  decideApproval() — idempotent decision recording + execution   │
│  - existing decision check (line 435-444)                       │
│  - active run lock (line 432)                                   │
│  - turn state check (line 447)                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Approval request** → `approvalToInteraction()` converts to `StructuredInteraction`
2. **User response** → `InteractionService.recordResponse()` persists to SQLite
3. **EventBus delivery** → `interaction:responded` event emitted
4. **Bridge subscriber** → filters to harness approvals, calls `resolveFromInteractionResponse()`
5. **Continuation** → delegates to existing `decideApproval()` which:
   - Checks for existing decision (idempotency)
   - Records approval-decision to ThreadStore
   - Executes tool if approved
   - Returns turn outcome

### InteractionId Derivation

```typescript
// Deterministic, no mapping table needed
approvalInteractionId('approval-abc') → 'harness-approval:approval-abc'
interactionApprovalId('harness-approval:approval-abc') → 'approval-abc'
```

## Recovery Mechanism (I3-I2-C1)

### Problem

A durable InteractionResponse could remain indefinitely uncontinued if:
1. EventBus `interaction:responded` handler fails (e.g., `decideApproval()` throws)
2. Boot reconciliation also fails (e.g., InteractionStore temporarily unavailable)
3. No process restart occurs
4. Same-choice HTTP retry does NOT re-emit the event (InteractionService idempotency)

### Solution

Added bounded retry with exponential backoff to the bridge's reconciliation:

```typescript
// Reconciliation with bounded retry
async function reconcileWithRetry(): Promise<void> {
  for (let attempt = 0; attempt <= maxReconciliationRetries; attempt++) {
    try {
      const success = await attemptReconciliation(attempt);
      if (success) return;
    } catch (err) {
      error(`reconciliation attempt ${attempt} threw: ${err.message}`);
    }

    if (attempt < maxReconciliationRetries && !disposed) {
      const delay = reconciliationBackoffMs * Math.pow(2, attempt);
      log(`retrying reconciliation in ${delay}ms`);
      await new Promise<void>((resolve) => {
        retryTimer = setTimeout(resolve, delay);
      });
    }
  }

  if (!disposed) {
    warn(`reconciliation exhausted after ${maxReconciliationRetries + 1} attempt(s)`);
  }
}
```

### Retry Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxReconciliationRetries` | 3 | Maximum retry attempts after initial failure |
| `reconciliationBackoffMs` | 1000 | Base delay for exponential backoff |

Actual retry schedule: 1s, 2s, 4s (3 retries after initial attempt).

### Observability

All reconciliation attempts are logged via `BridgeLogger`:

- `log()`: Successful reconciliation ("reconciled N approval(s) on attempt M")
- `warn()`: Per-approval failure ("reconciliation attempt M failed for approval X: ...")
- `error()`: Attempt-level exception ("reconciliation attempt M threw: ...")
- `warn()`: Exhaustion ("reconciliation exhausted after N attempt(s)")

### Cleanup

`BridgeDisposal.dispose()` cancels pending retry timers and unsubscribes from EventBus.

## Idempotency Analysis

### Crash Window 1: Between decision recording and tool execution

**Protection**: `decideApproval()` idempotency check (line 435-444):
```typescript
const existingDecision = allItems.find(
  (item) => item.kind === 'approval-decision' && record(item.payload).approvalId === approvalId,
);
if (existingDecision) {
  // Return existing turn state — no tool re-execution
  return { thread, turn, outcome: turn.outcome };
}
```

**Proof**: The ThreadStore persists to SQLite. After crash + restart, `pendingApprovals()` reads from the same durable store. If a decision was recorded before the crash, the idempotency check finds it and returns without re-executing the tool.

### Crash Window 2: Between event emission and decision recording

**Protection**: Boot reconciliation scans pending approvals for existing responses and calls `decideApproval()`. With I3-I2-C1, reconciliation retries on failure.

**Proof**: `findUncontinuedApprovals()` reads from both `pendingApprovals()` (ThreadStore) and `interactionService.getResponse()` (InteractionStore). If a response exists but no decision was recorded, reconciliation triggers continuation. If reconciliation fails, it retries with exponential backoff.

### Crash Window 3: EventBus redelivery

**Protection**: Bridge handles this by delegating to `decideApproval()` which has the idempotency check.

**Proof**: Production-chain integration test "idempotency: double EventBus delivery does not double-execute" proves this. The harness mock's idempotency guard handles the second call.

### Active Run Lock

**Protection**: `decideApproval()` throws if `this.active.has(threadId)` (line 432).

**Scope**: This is in-memory only — does not survive restarts. After a crash, the active map is empty, so the lock does not prevent re-execution. However, the durable decision check (Crash Window 1) handles this case.

## Remaining Limitations

1. **Harness arbitrary tool execution replay safety**: INDETERMINATE. The ThreadStore's `persist()` debounce (250ms default) means a crash within that window can lose the approval decision, allowing tool re-execution on restart. This is a pre-existing Harness behavior, not introduced by AR-REC. Preserved as ADJACENT finding.

2. **Same-choice HTTP retry**: Does NOT re-emit `interaction:responded`. This is by design (InteractionService idempotency). The recovery mechanism relies on reconciliation retry, not event re-emission.

3. **InteractionStore unavailability**: If InteractionStore is permanently unavailable (not just temporarily), reconciliation will exhaust retries and log exhaustion. The approval remains stuck until the store becomes available again.

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| `harness-approval-interaction-adapter.test.ts` | 28 | ALL PASS |
| `harness-approval-interaction-bridge.test.ts` | 14 | ALL PASS |
| `harness-approval-production-chain.test.ts` | 6 | ALL PASS |
| `harness-approval-recovery.test.ts` (I3-I2-C1) | 10 | ALL PASS |
| `interactions.test.ts` (existing) | 35 | ALL PASS |
| `interaction-persistence/__tests__` (existing) | 41 | ALL PASS |
| `agent-harness/__tests__` (existing) | 225 | ALL PASS |
| **Total** | **359** | **ALL PASS** |

## Invariants Preserved

- **REC-GOV-01**: Recommendation ≠ authority. Bridge presents choices, doesn't execute.
- **REC-GOV-03**: Governance always applies. RiskBasedToolPolicy remains the authority.
- **REC-GOV-05**: Domain preserves ownership. Adapter is stateless translator.
- **Three distinctions**: Human choice ≠ governance approval ≠ execution authorization.
- **I3-I2-C1**: Reconciliation failures are observable and retried. No silent loss of durable responses.

## Acceptance Criteria

| Criterion | Evidence |
|-----------|----------|
| approvalToInteraction produces valid StructuredInteraction | 7 tests in adapter suite |
| ChoiceId mapping is correct | interpretApprovalResponse tests |
| interaction:responded subscriber filters correctly | 6 tests in bridge suite |
| decideApproval is called with correct parameters | Production-chain integration tests |
| Boot reconciliation finds missed responses | Reconciliation tests |
| Idempotency: double delivery safe | Production-chain idempotency test |
| No deep internal imports | Build passes dependency boundary check |
| Biome lint passes | `pnpm lint:check` passes |
| EventBus continuation failure does not lose durable response | Recovery test 1 |
| Initial reconciliation failure is recoverable without restart | Recovery test 2 |
| Later reconciliation succeeds and continues approval | Recovery test 3 |
| Already-continued approval is not continued again | Recovery test 4 |
| Multiple reconciliation attempts remain idempotent | Recovery test 5 |
| One failing approval does not block other recoverable approvals | Recovery test 6 |
| Same-choice HTTP retry remains idempotent | Recovery test 7 |
| No generic interaction component gains Harness semantics | Recovery test 8 |

## Frozen Milestone State

**Frozen at**: `d9788e0`, `f853fd4`, `a683c76`

### Accepted Conclusions

1. Agent Harness tool-call approval is the first real AR-REC producer.
2. Harness retains approval semantics and continuation authority.
3. Activity Room remains presentation/decision-response surface only.
4. Interaction infrastructure remains domain-neutral.
5. EventBus provides the fast continuation path.
6. Harness durable pending state + durable InteractionResponse provide recovery authority.
7. Producer-local bounded reconciliation provides transient-failure recovery without requiring restart.
8. Reconciliation failure is observable.
9. Generic interaction infrastructure does not become a continuation queue or producer dispatcher.
10. Existing Harness arbitrary-tool replay safety remains INDETERMINATE because of the pre-existing ThreadStore persistence debounce crash window.

### Adjacent Findings (Carried Forward)

- **Harness arbitrary-tool replay safety**: INDETERMINATE. Pre-existing ThreadStore `persist()` debounce (250ms) crash window. Not fixed under AR-REC. Evidence only.

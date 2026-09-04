---
title: "AR-REC-R6 Evidence: Generic Human Decision Loop"
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# AR-REC-R6 Evidence: Generic Human Decision Loop

> **Date**: 2026-08-30  
> **Status**: COMPLETE  
> **Frozen baselines**: R3 `f154efc`, R4 `fbf6212`, R5 existing  
> **Implementation commit**: (pending)  
> **Test commit**: (pending)

---

## A. Implementation Summary

R6 wires the existing generic Activity Room interaction UI (R3) to the existing canonical R5 interaction-response ingress, completing the generic human decision loop.

### Production Code Changes (3 files)

| File | Layer | Change | LOC |
|------|-------|--------|-----|
| `apps/workspace/src/lib/m11a-api.ts` | API client | `submitInteractionResponse()`, `classifySubmissionError()`, `InteractionSubmissionError` | +72 |
| `apps/workspace/src/hooks/useM11CActivityRoom.ts` | Hook | `SubmissionState` type, `submitResponse()` callback, convergence logic | +65 |
| `apps/workspace/src/pages/activity/M11CStreamItem.tsx` | Renderer | Wire `onSelect` → `submitResponse`, derive `feedback`/`disabled`/`resolved` | +40 |
| `apps/workspace/src/pages/activity/M11CActivityStream.tsx` | Parent | Thread `submission`/`onSubmitResponse` props | +8 |
| `apps/workspace/src/pages/activity/M11CActivityRoomPage.tsx` | Page | Pass `room.submission`/`room.submitResponse` to stream | +2 |

### Test Code

| File | Tests | LOC |
|------|-------|-----|
| `apps/workspace/__tests__/r6-decision-loop.test.tsx` | 42/42 pass | ~350 |

---

## B. Final Decision-Loop Path

```
User clicks Radio button in DecisionGroup (R3 frozen)
    ↓
DecisionGroup.onSelect(choiceId) — emits opaque ChoiceId
    ↓
M11CStreamItem: onSelect(choiceId) — R6 wires this
    ↓
useM11CActivityRoom.submitResponse(interactionId, choiceId) — R6 new
    ↓
setSubmission({ status: 'submitting' }) — R6 local transient state
    ↓
submitInteractionResponse(interactionId, choiceId) — R6 new
    ↓
POST /api/interactions/:interactionId/responses { choiceId } — R5 existing
    ↓
InteractionService.recordResponse() — R5 frozen
    ↓
InteractionService.publishes 'interaction:responded' — R5 frozen
    ↓
M9IngestionBridge ingests to M9 — frozen
    ↓
M10 ProjectionRuntime projects StreamItem — R4 frozen
    ↓
M11B WebSocket broadcasts live activity — frozen
    ↓
useM11CActivityRoom receives live item — R6 convergence check
    ↓
streamItemFromLive() builds M11CStreamItem with lifecycle: 'responded' — R4 frozen
    ↓
handleLiveActivity: submission.interactionId match → clear transient — R6 convergence
    ↓
M11CStreamItem.tsx re-renders with lifecycle === 'responded' — R4 frozen
    ↓
InteractionCard: resolved=true, DecisionState shows responded — R3 frozen
```

---

## C. REC-060–064 Results

| Criterion | Pattern | Status | Evidence |
|-----------|---------|--------|----------|
| REC-060 | Simple Question: [Check it] [Continue] | **SATISFIED** | 2-choice rendering identical to Allow/Reject |
| REC-061 | Multiple Alternatives: [Compare] [Continue] | **SATISFIED** | N-choice rendering via DecisionGroup |
| REC-062 | Existing Capability: [Use this] [Show details] [Explore] | **SATISFIED** | 3-choice rendering identical |
| REC-063 | Conflict: [Review] [Keep] [Explore] | **SATISFIED** | 3-choice rendering identical |
| REC-064 | Efficiency Suggestion: [Review] [Continue] | **SATISFIED** | 2-choice rendering identical |

**Exit gate**: Multiple domains produce useful interactions without domain-specific Activity Room code. **SATISFIED** — genericity tests prove Harness, Marketplace, and unknown future producers render identically through the same components.

---

## D. Transient/Durable Ownership Evidence

| Concern | Transient (Frontend) | Durable (Server) |
|---------|---------------------|------------------|
| Choice selected | `SubmissionState.choiceId` | `InteractionResponse.selectedChoiceId` |
| Submission in progress | `SubmissionState.status === 'submitting'` | N/A (synchronous) |
| Response accepted | `SubmissionState.status === 'accepted'` | `InteractionResponse` in SQLite |
| Lifecycle | Derived from durable | `interaction:responded` event |
| Error state | `SubmissionState.status === 'failure'` | N/A (error codes) |

**Invariant**: After `interaction:responded` arrives via M11B, transient state is cleared. Durable wins.

---

## E. HTTP/Realtime Race Results

| Order | Scenario | Result |
|-------|----------|--------|
| A | HTTP success → live responded → durable wins | **PASS** — transient accepted cleared on live event |
| B | live responded → HTTP success → no regression | **PASS** — convergence check skips accepted state |
| C | live responded → late HTTP failure → no error shown | **PASS** — convergence check skips failure state |

Convergence implementation in hook:
```typescript
// In handleLiveActivity:
if (activity.type === 'interaction.responded' && submission.interactionId === ...) {
  setSubmission({ status: 'idle' }); // Durable wins
}

// In submitResponse try/catch:
const streamHasResponded = stream.some(
  item => item.interaction?.interactionId === id && item.interaction?.lifecycle === 'responded'
);
if (streamHasResponded) {
  setSubmission({ status: 'idle' }); // Don't regress
}
```

---

## F. Idempotency/Concurrency Results

| Scenario | Behavior | Authority |
|----------|----------|-----------|
| Double-click | UX suppression via `disabled` during submitting | Server UNIQUE constraint is correctness authority |
| Same-choice retry | 200 OK, returns existing response | InteractionService idempotency |
| Conflicting choice | 409 Conflict | Server SQLite UNIQUE + ResponseConflictError |
| Another client | 409 on different choice | Server authority |

---

## G. Failure Behavior

| HTTP Status | Error Kind | Retryable | UX |
|-------------|-----------|-----------|-----|
| 400 | validation | No | Error message, no retry |
| 404 | not-found | No | Stale state |
| 409 | conflict | No | Already responded |
| 500 | server | Yes | Error + retry |
| network | network | Yes | Error + retry |

---

## H. Security Boundary Evidence

### Client sends only:
```json
{ "choiceId": "opaque-string" }
```

### Client does NOT send:
- ❌ respondingParticipantId (server-derived from auth)
- ❌ respondingParticipantName (server-derived from auth)
- ❌ responseId (server-generated UUID)
- ❌ respondedAt (server time)
- ❌ command, shell, operation, handler, execute
- ❌ toolCall, approvalGranted, policyOverride
- ❌ metadata, payload, context, data

### Proof:
```typescript
// Test: submitInteractionResponse body has exactly { choiceId }
expect(Object.keys(body)).toEqual(['choiceId']);
expect(body).not.toHaveProperty('command');
expect(body).not.toHaveProperty('shell');
// ... (12 executable fields tested)
```

---

## I. Genericity Evidence

| Producer | Choices | Same Component | Test |
|----------|---------|---------------|------|
| Agent Harness | Allow/Reject | InteractionCard + DecisionGroup | ✅ |
| Marketplace | Install/Not now | InteractionCard + DecisionGroup | ✅ |
| Unknown future | Go left/Go right/Stay put | InteractionCard + DecisionGroup | ✅ |

Labels are TEXT. ChoiceIds are OPAQUE. Zero producer-specific conditions in production code.

---

## J. Zero Executable Semantics Evidence

| Contract | Has executable fields? | Test |
|----------|----------------------|------|
| POST body | `{ choiceId }` only | ✅ 12 field exclusions |
| InteractionResponse | Identity + correlation only | ✅ 5 field exclusions |
| InteractionCard props | onSelect(ChoiceId) only | ✅ TypeScript compile-time |

---

## K. Focused Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| API Client — submitInteractionResponse | 9 | ✅ All pass |
| classifySubmissionError | 6 | ✅ All pass |
| InteractionCard — Rendering | 5 | ✅ All pass |
| InteractionAsyncFeedback — States | 5 | ✅ All pass |
| Genericity — All Producers | 4 | ✅ All pass |
| Zero Executable Semantics | 2 | ✅ All pass |
| HTTP/Realtime Race Behavior | 3 | ✅ All pass |
| SubmissionState Type | 5 | ✅ All pass |
| Convergence — Durable Wins | 3 | ✅ All pass |
| **Total R6** | **42** | **✅ All pass** |

---

## L. Regression Results

| Suite | Tests | Status |
|-------|-------|--------|
| R3 interaction components | 50 | ✅ All pass |
| R4 stream integration | 26 | ✅ All pass |
| M10 projection evidence | 27 | ✅ All pass |
| Biome lint | — | ✅ Clean |
| Build (tsc -b) | — | ✅ Clean |

---

## M. Verification Status

**PASS** — All 42 R6 tests, R3 regression (50), R4 regression (26), M10 regression (27), lint, and build pass.

---

## N. R12 Carry-Forward

Preserved: "Verification execution budgets must be workload-aware and Vestara-owned rather than silently constrained by runtime-adapter defaults."

- Observed OpenCode Bash timeout: 180000ms
- Current OPENCODE_TIMEOUT: 30000ms
- No timeout/resource-budget modification in R6

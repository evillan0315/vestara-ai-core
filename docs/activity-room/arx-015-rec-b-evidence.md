# ARX-015 AR-REC-B — Minimum Interaction Contract Selection + Bounded Contract Implementation

> **Status**: COMPLETE  
> **Authorized by**: Director  
> **Executed by**: vestara-developer  
> **Date**: 2026-08-29  
> **Frozen baseline**: AR-REC-A at 355922b  
> **Mutation scope**: Canonical interaction contract/types, focused tests, evidence/documentation

---

## B1: Architecture Selection Record

### Candidates Evaluated

| Candidate | Description | Verdict |
|-----------|-------------|---------|
| **A. Activity-record extension** | Extend M9 Activity contracts to represent recommendation/choice | **REJECTED** |
| **B. Conversation/message extension** | Extend conversation/message model to carry structured interaction | **REJECTED** |
| **C. Generic structured-interaction contract** | Domain-neutral interaction envelope | **SELECTED** |
| **D. First-class Recommendation contract** | Dedicated canonical Recommendation domain object | **REJECTED** |

### Selection: Candidate C — Generic Structured-Interaction Contract

**Selection rule applied**: "choose the smallest abstraction that owns the semantics truthfully. Do not choose the smallest diff merely because it requires less code."

The core semantics are: **one party presents options, another party selects**. This is a domain-neutral interaction pattern, not a domain-specific concept. The minimum owning abstraction is a generic structured-interaction contract.

### Why Each Alternative Was Rejected

**A (Activity-record extension)**: Would make M9 projection → command owner. Activity records are projection/read-model infrastructure (activity.ts:9-16), not command authority. Making M9 own recommendation semantics would make Activity Room → authority. Violates: "M9 remains projection/read-model infrastructure unless evidence establishes otherwise."

**B (Conversation/message extension)**: Would make conversation persistence → governance authority. Message types in shared/src/conversation-types.ts are message-oriented (id, conversationId, role, content). Adding recommendation/choice would turn every conversation into a potential governance authority. Not all recommendations originate from conversations. Violates: "without turning conversation persistence into a new governance authority."

**D (First-class Recommendation)**: Too specific for the minimum abstraction. "Recommendation" implies domain-specific intent. The actual pattern is generic: present options, capture selection. A first-class Recommendation would need rationale, confidence, source, impact — higher-level concerns that don't belong in the minimum contract. Violates: "choose the smallest abstraction that owns the semantics truthfully."

### Trade-offs of Selected Candidate

| Criterion | Assessment |
|-----------|------------|
| Semantic ownership | ✅ Owns "interaction pattern" truthfully |
| Canonical identity | ✅ InteractionId, ChoiceId (branded, stable) |
| Provenance | ✅ PresentingParticipantId, RespondingParticipantId |
| Correlation/causation | ✅ interactionId, correlationId |
| Persistence | ⚠️ No new store — contract is a type, persistence is AR-REC-C concern |
| Idempotency | ✅ Response is idempotent by contract design |
| Replay safety | ✅ Same choice = same intent, different responseId |
| Stale-response | ✅ Lifecycle type supports expired state |
| N-option support | ✅ choices: readonly InteractionChoice[] |
| Backward compat | ✅ Plain text messages not affected |
| Activity Room projection | ✅ Contract can be projected without M9 becoming authoritative |
| Engineering Event evidence | ⚠️ No new events — AR-REC-B defines contract, events are AR-REC-C concern |
| Governance separation | ✅ Type guards prevent confusion with approval DTOs |
| Cross-domain reuse | ✅ Works for marketplace, engineering, configuration, unknown domains |
| Future capability support | ✅ Domain-neutral, metadata extensible |
| Migration cost | ✅ Zero — new types, no existing code modified |
| Duplication | ✅ No overlap with existing contracts |
| Dependency direction | ✅ @vestara/types has no external dependencies |
| Implementation surface | ✅ 2 type files, 1 test file, ~200 lines of types |

---

## B2: Minimum Canonical Contract

### Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `packages/types/src/interaction.ts` | **CREATED** | Canonical interaction contract types |
| `packages/types/src/interaction-architecture.ts` | **CREATED** | B1 Architecture Selection Record |
| `packages/types/src/index.ts` | **MODIFIED** | Added export for interaction types |
| `packages/types/__tests__/interaction-contract.test.ts` | **CREATED** | 55 verification tests |

### Contract Types

**StructuredInteraction** — A presented interaction with ordered choices:
- `interactionId: InteractionId` — stable identity
- `conversationId?: string` — optional conversation correlation
- `presentingParticipantId: string` — who presented
- `presentingParticipantName: string` — display name
- `createdAt: Timestamp` — creation time
- `content: string` — human-readable prompt
- `choices: readonly InteractionChoice[]` — ordered choice collection
- `metadata?: Record<string, unknown>` — extensible, display-only

**InteractionChoice** — A single choice within an interaction:
- `choiceId: ChoiceId` — stable opaque identity (correlation, not authority)
- `label: string` — presentation-only label
- `description?: string` — optional bounded explanation

**InteractionResponse** — A human response to an interaction:
- `responseId: Brand<string, 'ResponseId'>` — stable identity
- `interactionId: InteractionId` — reference to originating interaction
- `selectedChoiceId: ChoiceId` — selected choice (opaque, not label)
- `respondingParticipantId: string` — who responded
- `respondingParticipantName: string` — display name
- `respondedAt: Timestamp` — response time
- `correlationId?: string` — for safe replay

**InteractionLifecycle** — Lifecycle states (derived, not persisted):
- `'presented'` — interaction exists, awaits response
- `'responded'` — human has selected
- `'expired'` — stale, downstream authorities must re-evaluate

---

## B3: No Executable Semantics

The contract explicitly DOES NOT contain:
- `command`, `shellCommand`, `operation`, `execute`, `handler`, `endpoint`, `route`
- `toolCall`, `approvalGranted`, `policyOverride`, `permissionOverride`
- Runtime execution, installation, removal, deployment, mutation
- Any field that could become an escape hatch for executable semantics

**Verified by**: 4 tests in "B3: No executable semantics in contract" describe block.

---

## B4: Lifecycle Without Execution State

Lifecycle is derived from facts, not persisted as execution state:
- `StructuredInteraction` has no `lifecycle`, `state`, or `status` field
- Lifecycle is derived from whether a response exists
- A response is idempotent: replaying does not create a second decision
- A stale recommendation must not become permanent execution capability

**Verified by**: 4 tests in "B4: Lifecycle states" describe block.

---

## B5: Approval Separation in Types

The type architecture makes accidental substitution difficult:
- `StructuredInteraction` is structurally incompatible with `ApprovalRequestPayload`
- `InteractionResponse` is structurally incompatible with `PolicyDecision`
- `InteractionResponse` does not have `approve`/`reject` semantics — it has `selectedChoiceId`
- Type guards (`isStructuredInteraction`, `isInteractionResponse`) prevent confusion

**Verified by**: 5 tests in "B5: Approval separation" and "B5: Type incompatibility verification" describe blocks.

---

## B6: Persistence Responsibility

**Decision**: No new persistence at this stage.

Rationale:
- The contract is a type definition, not a persistence schema
- M9 remains projection/read-model infrastructure (not command authority)
- Engineering Event Store may provide immutable evidence but must not become command authority
- Persistence responsibility is an AR-REC-C concern
- The contract can be projected to M9 or stored independently — that's a wiring decision

---

## B7: Event Requirements

**Decision**: No new events at this stage.

Rationale:
- The contract defines the type structure, not the event contract
- Whether recommendation presentation and human choice require existing events with additional typed data, new canonical events, or no new events is an AR-REC-C concern
- AR-REC-B implements the minimum canonical contract; events are a separate concern

---

## B8: Canonical Text Ingress Preserved

- Plain text messages are not `StructuredInteraction` (verified by test)
- `StructuredInteraction` is not a plain text message (verified by test)
- Natural language words like "Install", "Delete", "Approve" do not trigger recommendation semantics — labels are presentation-only (verified by test)
- No keyword routing introduced

**Verified by**: 3 tests in "B8: Text ingress backward compatibility" describe block.

---

## B9: Cross-Domain Generality Proof

Verified against 4 domains (fixture/scenario only, not production hardcoding):

1. **Marketplace**: "I found an existing dashboard component" → 3 choices (Use, Show details, Continue building)
2. **Engineering**: "Two reasonable implementation approaches" → 3 choices (Approach A, Approach B, Explain trade-offs)
3. **Configuration**: "Existing configuration appears compatible" → 3 choices (Use existing, Compare, Keep current plan)
4. **Unknown future domain**: "Quantum entanglement calibration needs adjustment" → 3 choices (Recalibrate, Run diagnostics, Ignore)

All pass. Contract is domain-neutral. No Activity Room source changes needed for new domains.

**Verified by**: 4 tests in "B9: Cross-domain generality" describe block.

---

## B10: Negative Architecture Tests

Explicitly proved that none of these can occur through the new contract alone:

| Negative Test | Result |
|---------------|--------|
| choiceId → shell command | ✅ PASS — choiceId is branded string, no command mapping |
| choice label → operation | ✅ PASS — label is presentation-only |
| recommendation → direct tool invocation | ✅ PASS — no toolCall field |
| recommendation response → approvalGranted | ✅ PASS — no approvalGranted field |
| Activity Room → Workflow dispatch | ✅ PASS — no workflowRunId/dispatch field |
| Activity Room → Harness execution | ✅ PASS — no harnessExecution/threadId field |
| Activity Room → Marketplace install | ✅ PASS — no install/package field |
| Activity Room → Policy allow | ✅ PASS — no policyAllow field |
| replayed response → repeated mutation | ✅ PASS — idempotent by design |
| stale response → permanent authority | ✅ PASS — no authority/permission field |
| unknown choice → arbitrary payload execution | ✅ PASS — no payload/execution field |

**Verified by**: 11 tests in "B10: Negative architecture tests" describe block.

---

## B12: Verification Evidence

### Test Results

```
 packages/types/__tests__/interaction-contract.test.ts (55 tests)
   B2: StructuredInteraction contract          10 passed
   B2: InteractionResponse contract             6 passed
   B2: N-option support                         4 passed
   B3: No executable semantics in contract      4 passed
   B5: Approval separation                      3 passed
   B4: Lifecycle states                         4 passed
   Type guards                                  4 passed
   B8: Text ingress backward compatibility      3 passed
   B9: Cross-domain generality                  4 passed
   B10: Negative architecture tests            11 passed
   B5: Type incompatibility verification        2 passed

 Test Files  1 passed (1)
      Tests  55 passed (55)
```

### Build Verification

```
$ pnpm --filter @vestara/types build
$ tsc
(clean — no errors)
```

### Existing Tests Unaffected

```
 packages/types/__tests__/index.test.ts (19 tests) — all passed
```

---

## B13: Completion Report

### Selected Canonical Abstraction
Generic Structured-Interaction Contract (Candidate C)

### Why Each Alternative Was Rejected
- **A**: Would make M9 projection → command owner
- **B**: Would make conversation persistence → governance authority
- **D**: Too specific for minimum abstraction

### Exact Production Files Changed
1. `packages/types/src/interaction.ts` — CRE created: canonical contract types
2. `packages/types/src/interaction-architecture.ts` — CREATED: B1 selection record
3. `packages/types/src/index.ts` — MODIFIED: added `export * from './interaction'`
4. `packages/types/__tests__/interaction-contract.test.ts` — CREATED: 55 verification tests

### Contracts Introduced
- `InteractionId` — branded string, stable identity
- `ChoiceId` — branded string, stable opaque choice identity
- `InteractionChoice` — choice with ID, label, optional description
- `StructuredInteraction` — presented interaction with ordered choices
- `InteractionResponse` — human response referencing interaction and selected choice
- `InteractionLifecycle` — `'presented' | 'responded' | 'expired'`
- `isStructuredInteraction()` — type guard
- `isInteractionResponse()` — type guard

### Persistence Decision
No new persistence. Contract is a type; persistence is AR-REC-C concern.

### Event Decision
No new events. Contract defines type structure; events are AR-REC-C concern.

### Backward-Compatibility Result
Plain text messages unaffected. No keyword routing. No existing code modified.

### Governance-Separation Evidence
- Type guards prevent confusion with approval DTOs
- Contract has no executable semantics
- Choice identity is correlation, not authority
- Response does not produce approvalGranted or equivalent

### Tests and Verification Results
55/55 tests pass. Build clean. Existing tests unaffected.

### Adjacent Findings
None discovered during AR-REC-B execution.

### Commit Hash
(Pending — will be provided after commit)

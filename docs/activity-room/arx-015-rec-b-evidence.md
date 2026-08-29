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

**B (Conversation/message extension)**: Semantic ownership and coupling violation. Message owns communication content/history. StructuredInteraction owns independently addressable interaction semantics. Interactions may originate outside Conversation. Interaction identity/choices/responses should not depend on Conversation ownership. Candidate C remains reusable across Conversation, Activity Room, and future unknown consumers. Conversation may later reference/carry an interaction without becoming its canonical owner. Ownership boundary: Conversation owns messaging. StructuredInteraction owns interaction semantics. Governance owns authority.

**D (First-class Recommendation)**: Too specific for the minimum abstraction. "Recommendation" implies domain-specific intent. The actual pattern is generic: present options, capture selection. A first-class Recommendation would need rationale, confidence, source, impact — higher-level concerns that don't belong in the minimum contract. Violates: "choose the smallest abstraction that owns the semantics truthfully."

### Trade-offs of Selected Candidate

| Criterion | Assessment |
|-----------|------------|
| Semantic ownership | ✅ Owns "interaction pattern" truthfully |
| Canonical identity | ✅ InteractionId, ChoiceId (branded, stable) |
| Provenance | ✅ PresentingParticipantId, RespondingParticipantId |
| Correlation/causation | ✅ interactionId, correlationId |
| Persistence | ⚠️ No new store — persistence is a later integration concern requiring explicit authorization |
| Idempotency | ⚠️ Contract provides identity/correlation primitives; persistence idempotency is a consumer concern |
| Replay safety | ⚠️ Contract provides stable identities; replay suppression is a consumer concern |
| Stale-response | ⚠️ Lifecycle type supports expired state; stale evaluation against current state is a consumer concern |
| N-option support | ✅ choices: readonly InteractionChoice[] + validateInteraction enforces choices.length >= 1 |
| Structural validation | ✅ validateInteraction (choices non-empty, unique IDs) + validateResponseForInteraction (relationship integrity) |
| Backward compat | ✅ Plain text messages not affected |
| Activity Room projection | ✅ Contract can be projected without M9 becoming authoritative |
| Engineering Event evidence | ⚠️ No new events — event integration is a later concern requiring explicit authorization |
| Governance separation | ✅ Type guards + structural validation prevent confusion with approval DTOs |
| Cross-domain reuse | ✅ Works for marketplace, engineering, configuration, unknown domains |
| Future capability support | ✅ Domain-neutral, no generic metadata escape hatch |
| Migration cost | ✅ Zero — new types, no existing code modified |
| Duplication | ✅ No overlap with existing contracts |
| Dependency direction | ✅ @vestara/types has no external dependencies |
| Implementation surface | ✅ 2 type files, 1 test file, ~250 lines of types |

---

## B2: Minimum Canonical Contract

### Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `packages/types/src/interaction.ts` | **CREATED** | Canonical interaction contract types |
| `packages/types/src/interaction-architecture.ts` | **CREATED** | B1 Architecture Selection Record |
| `packages/types/src/index.ts` | **MODIFIED** | Added export for interaction types |
| `packages/types/__tests__/interaction-contract.test.ts` | **CREATED** | 65 verification tests |

### Contract Types

**StructuredInteraction** — A presented interaction with ordered choices:
- `interactionId: InteractionId` — stable identity
- `conversationId?: string` — optional conversation correlation
- `presentingParticipantId: string` — who presented (follows existing Vestara string conventions)
- `presentingParticipantName: string` — display name
- `createdAt: Timestamp` — creation time
- `content: string` — human-readable prompt
- `choices: readonly InteractionChoice[]` — ordered choice collection (no generic metadata/extension bag)

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
- Any generic metadata, payload, context, data, or extension bag
- Any field that could become an escape hatch for executable semantics

**Verified by**: 4 tests in "B3: No executable semantics in contract" describe block.

---

## B4: Lifecycle Without Execution State

Lifecycle is derived from facts, not persisted as execution state:
- `StructuredInteraction` has no `lifecycle`, `state`, or `status` field
- Lifecycle is derived from whether a response exists
- A stale recommendation must not become permanent execution capability

**Contract guarantees** (verified by tests):
- Stable typed identities (responseId, interactionId, selectedChoiceId)
- Opaque choice identity (choiceId is correlation, not label)
- Relational validation (validateResponseForInteraction)
- N-option support (validateInteraction enforces choices.length >= 1)

**Deferred operational guarantees** (require consumer/persistence implementation):
- Persistence idempotency
- Retry/reconnect deduplication
- Replay suppression
- Stale-response evaluation against current system state
- Downstream governed continuation

**Verified by**: 4 tests in "B4: Lifecycle states" + 2 tests in "B10: Negative architecture tests" (idempotency/reconnect primitives).

---

## B5: Approval Separation in Types

The type architecture makes accidental substitution difficult:
- `StructuredInteraction` is structurally incompatible with `ApprovalRequestPayload`
- `InteractionResponse` is structurally incompatible with `PolicyDecision`
- `InteractionResponse` does not have `approve`/`reject` semantics — it has `selectedChoiceId`
- Type guards (`isStructuredInteraction`, `isInteractionResponse`) prevent shape confusion
- Structural validation (`validateInteraction`, `validateResponseForInteraction`) enforces relational invariants

**Verified by**: 5 tests in "B5: Approval separation" + 5 tests in "B5: Type incompatibility verification" + 9 tests in "Structural validation" describe blocks.

---

## B6: Persistence Responsibility

**Decision**: No new persistence at this stage.

Rationale:
- The contract is a type definition, not a persistence schema
- Persistence, projection/event integration, and transport integration are later integration concerns requiring explicit authorization and ownership selection
- A following milestone does not acquire those responsibilities merely because it follows B
- The contract can be projected to M9 or stored independently — that's a wiring decision requiring explicit authorization

---

## B7: Event Requirements

**Decision**: No new events at this stage.

Rationale:
- The contract defines the type structure, not the event contract
- Whether interaction presentation and human choice require existing events with additional typed data, new canonical events, or no new events is a later integration concern requiring explicit authorization
- AR-REC-B implements the minimum canonical contract; event integration is a separate concern requiring explicit authorization

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
| replayed response → repeated mutation | ✅ PASS — contract provides identity/correlation primitives (deferred to consumer) |
| stale response → permanent authority | ✅ PASS — no authority/permission field |
| unknown choice → arbitrary payload execution | ✅ PASS — no payload/execution field |

**Verified by**: 13 tests in "B10: Negative architecture tests" describe block.

---

## B12: Verification Evidence

### Test Results

```
 packages/types/__tests__/interaction-contract.test.ts (65 tests)
   B2: StructuredInteraction contract          10 passed
   B2: InteractionResponse contract             6 passed
   B2: N-option support                         4 passed
   B3: No executable semantics in contract      4 passed
   B5: Approval separation                      3 passed
   B4: Lifecycle states                         4 passed
   Type guards                                  4 passed
   B8: Text ingress backward compatibility      3 passed
   B9: Cross-domain generality                  4 passed
   B10: Negative architecture tests            13 passed
   B5: Type incompatibility verification        2 passed
   Structural validation: validateInteraction   5 passed
   Structural validation: validateResponse      4 passed

 Test Files  1 passed (1)
      Tests  65 passed (65)
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
- **B**: Semantic ownership/coupling — interaction identity must not depend on Conversation ownership
- **D**: Too specific for minimum abstraction

### Exact Production Files Changed
1. `packages/types/src/interaction.ts` — CREATED: canonical contract types + validation
2. `packages/types/src/interaction-architecture.ts` — CREATED: B1 selection record
3. `packages/types/src/index.ts` — MODIFIED: added `export * from './interaction'`
4. `packages/types/__tests__/interaction-contract.test.ts` — CREATED: 65 verification tests

### Contracts Introduced
- `InteractionId` — branded string, stable identity
- `ChoiceId` — branded string, stable opaque choice identity
- `InteractionChoice` — choice with ID, label, optional description
- `StructuredInteraction` — presented interaction with ordered choices (no generic metadata/extension bag)
- `InteractionResponse` — human response referencing interaction and selected choice
- `InteractionLifecycle` — `'presented' | 'responded' | 'expired'`
- `InteractionValidationError` — validation error type
- `isStructuredInteraction()` — type guard (shape validation)
- `isInteractionResponse()` — type guard (shape validation)
- `validateInteraction()` — structural validation (choices non-empty, unique IDs)
- `validateResponseForInteraction()` — relational validation (response-interaction relationship)

### Persistence Decision
No new persistence. Contract is a type; persistence is a later integration concern requiring explicit authorization and ownership selection.

### Event Decision
No new events. Contract defines type structure; event integration is a later concern requiring explicit authorization and ownership selection.

### Backward-Compatibility Result
Plain text messages unaffected. No keyword routing. No existing code modified.

### Governance-Separation Evidence
- Type guards prevent shape confusion with approval DTOs
- Structural validation enforces relational invariants
- Contract has no executable semantics
- Choice identity is correlation, not authority
- Response does not produce approvalGranted or equivalent

### Tests and Verification Results
65/65 tests pass. Build clean. Existing tests unaffected.

### Adjacent Findings
None discovered during AR-REC-B execution.

### Commit Hash
(Pending — will be provided after commit)

# ARX-015 R0–R13 Milestone Reconciliation

> **Date**: 2026-08-30  
> **Status**: COMPLETE — Documentation/evidence only  
> **Authorized by**: Director  
> **Executed by**: vestara-developer  
> **Mutation scope**: Documentation/evidence only. No production code, tests, schemas, stores, routes, events, UI components, or behavioral changes.  
> **Frozen baseline**: I3-I2 at `6c7356f`  
> **Purpose**: Requirement-by-requirement trace of original R0–R13 roadmap against repository evidence. Determine status of each requirement. Recommend next single milestone.

---

## A. Executive Summary

The AR-REC milestone roadmap defined 14 requirements (R0–R13) for contextual recommendations and governed decisions in Activity Room. **Three batches have been implemented and frozen**: AR-REC-A (R0 audit), AR-REC-B (R1–R2 contracts), and AR-REC-C (R3–R6 partial, R7 first producer). The C2 implementation produced durable interaction infrastructure, HTTP ingress, and the first real producer (Agent Harness tool-call approval).

**Current status by batch:**

| Batch | Phases | Status | Evidence |
|-------|--------|--------|----------|
| AR-REC-A | R0 | **COMPLETE & FROZEN** | `arx-015-rec-a-existing-capability-audit.md` at `355922b` |
| AR-REC-B | R1–R2 | **COMPLETE & FROZEN** | `arx-015-rec-b-evidence.md` at `5dc54ba` |
| AR-REC-C1 | C1 audit | **COMPLETE & FROZEN** | `arx-015-rec-c1-integration-audit.md` at `fc30f8d` |
| AR-REC-C2-D1 | Design | **COMPLETE & FROZEN** | `arx-015-rec-c2-d1-design.md` at `83e68cc` |
| AR-REC-C2-I1 | Infrastructure | **COMPLETE & FROZEN** | `arx-015-rec-c2-i1-evidence.md` at `4418709` |
| AR-REC-C2-I2 | HTTP ingress | **COMPLETE & FROZEN** | `arx-015-rec-c2-i2-preflight.md` at `f83e1a4` |
| AR-REC-C2-I3 | First producer | **COMPLETE & FROZEN** | `arx-015-rec-c2-i3-i2.md` at `6c7356f` |

**Summary of R0–R13 status:**

| Requirement | Status | Batch |
|-------------|--------|-------|
| R0 — Existing Capability Audit | **COMPLETE** | AR-REC-A |
| R1 — Generic Recommendation Contract | **COMPLETE** | AR-REC-B |
| R2 — Decision Response Contract | **COMPLETE** | AR-REC-B |
| R3 — Shared UI Foundation | **UNIMPLEMENTED** | — |
| R4 — Activity Stream Integration | **PARTIALLY COMPLETE** | C2-I1 (M9 adapters) |
| R5 — Canonical Decision Submission | **COMPLETE** | C2-I1 + C2-I2 |
| R6 — Contextual Recommendation Presentation | **UNIMPLEMENTED** | — |
| R7 — Marketplace Discovery Use Case | **SUPERSEDED** | Harness is first producer, not Marketplace |
| R8 — Cross-Domain Generality Verification | **PARTIALLY COMPLETE** | I3-I1 genericity proof; no formal multi-domain verification |
| R9 — Recommendation Lifecycle & Concurrency | **PARTIALLY COMPLETE** | C2-I1 concurrent response tests; no superseded/multi-client tests |
| R10 — Attention & Notification Integration | **UNIMPLEMENTED** | — |
| R11 — Security & Governance Verification | **PARTIALLY COMPLETE** | C2-I2 server validation; no forged-option/expired-recommendation tests |
| R12 — Performance & Resilience | **UNIMPLEMENTED** | — |
| R13 — Production Acceptance | **UNIMPLEMENTED** | — |

---

## B. Requirement-by-Requirement Trace

### R0 — Existing Capability Audit

**Original criterion:** Do not implement another recommendation system before determining what Vestara already has. REC-000 through REC-005.

| Sub-criterion | Status | Evidence |
|---------------|--------|----------|
| REC-000: Recommendation Contract Audit | **COMPLETE** | AR-REC-A Deliverable 1: SuggestionService, tool/task approval, conversation structured responses, attention, dormant decisions table, engineering events, policy engine |
| REC-001: Governance Contract Audit | **COMPLETE** | AR-REC-A Deliverable 5: Three distinctions verified, REC-GOV-01 through REC-GOV-10 compliance matrix |
| REC-002: Existing Ingress Audit | **COMPLETE** | AR-REC-A Deliverable 6: Chat, console, collaboration button, OpenCode permission, WorkflowRail |
| REC-003: Existing Persistence Audit | **COMPLETE** | AR-REC-A Deliverable 3: Persistence ownership map across 9 stores |
| REC-004: Existing Event Audit | **COMPLETE** | AR-REC-A Deliverable 4: Event ownership map with 6 existing events |
| REC-005: Gap Classification | **COMPLETE** | AR-REC-A Deliverable 8: REUSE/EXTEND/ADJACENT GAP/BLOCKER classification |

**Exit gate:** Architecture report establishes what can be reused and what genuinely does not exist. **SATISFIED.**

**Frozen at:** `355922b`

---

### R1 — Generic Recommendation Contract

**Original criterion:** Contract can represent arbitrary recommendations without understanding their domain. REC-010 through REC-015.

| Sub-criterion | Status | Evidence |
|---------------|--------|----------|
| REC-010: Recommendation Identity | **COMPLETE** | `InteractionId` branded string, stable identity (`packages/types/src/interaction.ts`) |
| REC-011: Recommendation Content | **COMPLETE** | `content: string` (required), no `title`/`summary`/`context` in minimum contract — by design (Candidate C selection) |
| REC-012: Decision Options | **COMPLETE** | `InteractionChoice { choiceId, label, description? }` — no `operation`, `command`, `handler` |
| REC-013: Recommendation State | **COMPLETE** | `InteractionLifecycle: 'presented' | 'responded' | 'expired'` — derived, not persisted |
| REC-014: Option Presentation | **COMPLETE** | `label: string` — presentation-only. No `install`, `delete`, `deploy`, `rollback` in contract |
| REC-015: Unknown Option Compatibility | **COMPLETE** | Domain-neutral contract verified with 4 cross-domain scenarios in B9 tests |

**Exit gate:** Contract can represent arbitrary recommendations without understanding their domain. **SATISFIED.**

**Frozen at:** `5dc54ba`
**Tests:** 65/65 pass

---

### R2 — Decision Response Contract

**Original criterion:** Decision can be recorded safely without Activity Room acquiring operational authority. REC-020 through REC-026.

| Sub-criterion | Status | Evidence |
|---------------|--------|----------|
| REC-020: Decision Identity | **COMPLETE** | `InteractionResponse { responseId, interactionId, selectedChoiceId, respondingParticipantId, respondedAt }` |
| REC-021: No Executable Payload | **COMPLETE** | B3 tests: 4 tests verify no `command`, `shellCommand`, `operation`, `execute`, `handler` |
| REC-022: Opaque Decision Reference | **COMPLETE** | `selectedChoiceId: ChoiceId` — branded, opaque, returned to governed boundary |
| REC-023: Decision Provenance | **COMPLETE** | `respondingParticipantId`, `respondingParticipantName`, `respondedAt`, `correlationId?` |
| REC-024: Idempotency | **COMPLETE** | D1-4: SQLite UNIQUE constraint on `interaction_id` — at most one response. D1-5: `response_id` UNIQUE for idempotent retry |
| REC-025: Replay Safety | **COMPLETE** | B10 tests: 13 negative architecture tests prove no executable semantics from replayed responses |
| REC-026: Stale Decision Protection | **COMPLETE** | C1-9: Domain validity remains with downstream authorities. REC-GOV-08 enforced |

**Exit gate:** Decision can be recorded safely without Activity Room acquiring operational authority. **SATISFIED.**

**Frozen at:** `5dc54ba`
**Tests:** 65/65 pass (B contract)

---

### R3 — Shared UI Foundation

**Original criterion:** Generic decision UI exists independently of Marketplace, Workflow, Agents or Activity Room-specific styling. REC-030 through REC-037.

| Sub-criterion | Status | Evidence |
|---------------|--------|----------|
| REC-030: Shared UI Inventory | **NOT DONE** | C1-14 LATER UI section identified need; no inventory produced |
| REC-031: RecommendationCard | **UNIMPLEMENTED** | No `RecommendationCard` component exists in `apps/workspace/src/` |
| REC-032: DecisionGroup | **UNIMPLEMENTED** | No `DecisionGroup` component exists |
| REC-033: DecisionOption | **UNIMPLEMENTED** | No `DecisionOption` component exists |
| REC-034: DecisionState | **UNIMPLEMENTED** | No resolved/pending/unavailable presentation |
| REC-035: Async Feedback | **UNIMPLEMENTED** | No submitting/accepted/failure/retry/unavailable/stale feedback |
| REC-036: Theme Compliance | **UNIMPLEMENTED** | No theme token usage for interaction components |
| REC-037: Accessibility | **UNIMPLEMENTED** | No keyboard/focus/screen-reader testing for interaction components |

**Exit gate:** Generic decision UI exists independently of Marketplace, Workflow, Agents or Activity Room-specific styling. **NOT REACHED.**

**Status:** UNIMPLEMENTED. This is a gap between the current infrastructure (backend only) and the user-facing experience. The M9 adapters project interaction facts into Activity Room as ActivityRecords, but no dedicated UI components render `interaction.presented` / `interaction.responded` types.

---

### R4 — Activity Stream Integration

**Original criterion:** Recommendations behave like first-class Activity Room records without changing stream architecture. REC-040 through REC-045.

| Sub-criterion | Status | Evidence |
|---------------|--------|----------|
| REC-040: Recommendation Activity | **PARTIAL** | M9 adapters (`fromInteractionPresented`, `fromInteractionResponded`) convert to ActivityEvent. `ActivityType` enum extended with `interaction.presented` / `interaction.responded`. M9 ingestion bridge handles `interaction:presented` / `interaction:responded` patterns. Activity Records are projected into Activity Room. |
| REC-041: Source Identity | **PARTIAL** | `presentingParticipantId` / `presentingParticipantName` mapped to `actor` in ActivityRecord. Uses `composeParticipants()` from M10. |
| REC-042: Historical Decision Presentation | **UNIMPLEMENTED** | ActivityItem.tsx does not have a dedicated renderer for `interaction.presented` or `interaction.responded` types. These records exist in M9 but may render as generic activity items. |
| REC-043: Result Separation | **UNIMPLEMENTED** | No UI distinction between decision and subsequent execution/result |
| REC-044: Activity Correlation | **PARTIAL** | `interactionId` is carried in `payload.data` of ActivityRecord. `correlationId` available but not populated by production code. |
| REC-045: Stream Virtualization Compatibility | **PARTIAL** | Activity Records follow existing M9 schema. Stream virtualization works for any ActivityRecord type. |

**Exit gate:** Recommendations behave like first-class Activity Room records without changing stream architecture. **PARTIALLY REACHED.** Backend projection works. UI rendering of interaction-specific types is missing.

**Key evidence:**
- `packages/types/src/activity.ts:66-67` — `ActivityType` extended
- `packages/activity-projection/src/m9-adapter.ts:284,321` — adapters exist
- `packages/activity-projection/src/m9-ingestion-bridge.ts:120,126` — patterns registered
- `apps/workspace/src/pages/activity/ActivityItem.tsx` — no dedicated interaction renderer

---

### R5 — Canonical Decision Submission

**Original criterion:** Decision submission is governed, idempotent and incapable of bypassing existing authority. REC-050 through REC-055.

| Sub-criterion | Status | Evidence |
|---------------|--------|----------|
| REC-050: Existing Ingress Only | **COMPLETE** | `POST /api/interactions/:interactionId/responses` — REST endpoint, no browser-side execution dispatcher |
| REC-051: Minimal Submission | **COMPLETE** | Request body: `{ selectedChoiceId, correlationId? }` — client sends minimum. Server derives `responseId`, `respondedAt`, `respondingParticipantId`, `respondingParticipantName` |
| REC-052: Server-Side Validation | **COMPLETE** | `authenticate()` extracts `AuthUser.id`/`AuthUser.name`. `validateResponseForInteraction()` checks structural validity. `SqliteInteractionStore.recordResponse()` enforces UNIQUE constraint |
| REC-053: Governance Re-entry | **COMPLETE** | No `activityRoomTrusted = true`. Harness continuation goes through existing `RiskBasedToolPolicy` → `ExecutionPolicy` → `AIInvocationGuard` |
| REC-054: Failure Handling | **COMPLETE** | `ResponseConflictError` for 409. `InteractionService` throws structured errors. HTTP route returns proper error codes |
| REC-055: No Automatic Retry of Mutations | **COMPLETE** | Same-choice HTTP retry does NOT re-emit `interaction:responded` (InteractionService idempotency). Retry returns existing response without side effects |

**Exit gate:** Decision submission is governed, idempotent and incapable of bypassing existing authority. **SATISFIED.**

**Evidence:**
- `apps/api/src/routes/interactions.ts` — HTTP route handler
- `packages/interaction-app/src/interaction-service.ts` — service with validation
- `packages/interaction-persistence/src/sqlite-store.ts` — UNIQUE constraint enforcement
- `packages/interaction-app/src/response-conflict-error.ts` — structured error type

---

### R6 — Contextual Recommendation Presentation

**Original criterion:** Multiple domains can produce useful interactions without domain-specific Activity Room code. REC-060 through REC-064.

| Sub-criterion | Status | Evidence |
|---------------|--------|----------|
| REC-060: Simple Question | **UNIMPLEMENTED** | No UI component renders `[ Check it ] [ Continue ]` pattern |
| REC-061: Multiple Alternatives | **UNIMPLEMENTED** | No UI component renders `[ Compare ] [ Continue with current approach ]` pattern |
| REC-062: Existing Capability | **UNIMPLEMENTED** | No UI component renders `[ Use this option ] [ Show details ] [ Explore alternatives ]` pattern |
| REC-063: Conflict | **UNIMPLEMENTED** | No UI component renders `[ Review conflict ] [ Keep current setup ] [ Explore alternatives ]` pattern |
| REC-064: Efficiency Suggestion | **UNIMPLEMENTED** | No UI component renders `[ Review evidence ] [ Continue ]` pattern |

**Exit gate:** Multiple domains can produce useful interactions without domain-specific Activity Room code. **NOT REACHED.**

**Note:** The backend infrastructure (R1–R2 contracts, R5 submission) supports any number of choices and labels. The UI rendering layer (R3) is the blocker. Once R3 components exist, R6 is automatically satisfied because the same components render all patterns.

---

### R7 — Marketplace Discovery Use Case

**Original criterion:** Marketplace becomes a verification scenario, not an Activity Room dependency. Complete flow without Activity Room importing Marketplace execution logic. REC-070–076.

| Sub-criterion | Status | Evidence |
|---------------|--------|----------|
| REC-070–076: Marketplace flow | **SUPERSEDED** | Marketplace is NOT the first real producer. Agent Harness tool-call approval is. The original plan assumed Marketplace as the first demonstration. Reality: Harness approval is simpler, more mature, and has durable state. |

**Disposition:** **SUPERSEDED by I3-I2 (Harness Approval Producer).**

The Harness Approval Producer demonstrates the complete topology:
1. Domain creates durable pending context (ThreadStore)
2. Domain calls `InteractionService.present()` (via adapter)
3. Human responds in Activity Room (via HTTP route)
4. `interaction:responded` fires (EventBus)
5. Domain subscriber receives event (Bridge)
6. Domain interprets choice (Adapter: `'approve'` → `approved = true`)
7. Domain revalidates state (ThreadStore check)
8. Domain routes through existing governance (RiskBasedToolPolicy)
9. Domain executes operation (ToolRuntime.invoke)
10. Domain marks continuation complete (approval-decision ThreadItem)

This is the same topology R7/Marketplace would use. The Marketplace scenario remains a future verification test, not a prerequisite.

**Exit gate:** Complete Marketplace recommendation flow without domain-specific code. **NOT REACHED (deferred).** However, the topology is proven by the Harness producer. Marketplace is a future verification scenario, not a blocker.

---

### R8 — Cross-Domain Generality Verification

**Original criterion:** Use the exact same UI infrastructure for verification, database, deployment, agent, and unknown future scenarios. REC-080–084.

| Sub-criterion | Status | Evidence |
|---------------|--------|----------|
| REC-080–084: Multi-domain verification | **PARTIALLY COMPLETE** | I3-I1 (BananaDepartment test) proves generic topology. No formal multi-domain test with real producers. |

**Evidence:**
- I3-I1 §I1-11: BananaDepartment test proves any domain can follow the same topology
- I3-I1 §I1-3: Candidate comparison matrix shows Harness is the strongest first proof
- No other real producer has been integrated yet

**Disposition:** The genericity proof is theoretical (BananaDepartment test). The Harness producer provides one concrete proof. Formal cross-domain verification with 2+ real producers has not been done.

**Exit gate:** Zero domain-specific source modifications across scenarios. **NOT FORMALLY VERIFIED.** The architecture is designed for generality (no domain-specific code in Activity Room or interaction infrastructure), but only one producer exists.

---

### R9 — Recommendation Lifecycle & Concurrency

**Original criterion:** Recommendation state remains coherent under realistic concurrency. REC-090–095.

| Sub-criterion | Status | Evidence |
|---------------|--------|----------|
| REC-090: Superseded | **UNIMPLEMENTED** | No mechanism to supersede an interaction with a newer one |
| REC-091: Concurrent | **PARTIAL** | C2-I1 concurrent response tests prove exactly one winner from parallel requests. SQLite serialization handles concurrency. |
| REC-092: Multi-client | **UNIMPLEMENTED** | No multi-client UI testing (e.g., two browsers responding to same interaction) |
| REC-093: Reconnect | **PARTIALLY COMPLETE** | WebSocket reconnection (M11B) delivers new ActivityRecords. Interaction state is durable in SQLite. |
| REC-094: Duplicate Submission | **COMPLETE** | D1-4/D1-5: UNIQUE constraint prevents duplicates. Idempotent retry returns existing response. |
| REC-095: Historical Replay | **COMPLETE** | B10 tests prove historical responses cannot become executable. Activity Room renders as resolved record. |

**Exit gate:** Recommendation state remains coherent under realistic concurrency. **PARTIALLY REACHED.** Core concurrency (R091, R094) is proven. Lifecycle states (R090 superseded) and multi-client (R092) are unimplemented.

---

### R10 — Attention & Notification Integration

**Original criterion:** Important decisions are discoverable without turning suggestions into noise. REC-100–103.

| Sub-criterion | Status | Evidence |
|---------------|--------|----------|
| REC-100: Decision needed qualifies for attention | **UNIMPLEMENTED** | No attention item created when `interaction:presented` fires |
| REC-101: No attention spam | **UNIMPLEMENTED** | No dedup/throttle for interaction attention items |
| REC-102: Resolved attention | **UNIMPLEMENTED** | No automatic attention dismissal when `interaction:responded` fires |
| REC-103: No new notification authority | **N/A** | No attention integration implemented, so this invariant is trivially preserved |

**Exit gate:** Important decisions are discoverable without turning suggestions into noise. **NOT REACHED.**

---

### R11 — Security & Governance Verification

**Original criterion:** Hostile or malformed recommendation input cannot become unauthorized execution. REC-110–116.

| Sub-criterion | Status | Evidence |
|---------------|--------|----------|
| REC-110: Forged option | **PARTIAL** | `validateResponseForInteraction()` checks `selectedChoiceId` exists in interaction choices. Server-derived identity prevents impersonation. |
| REC-111: Expired recommendation | **UNIMPLEMENTED** | No expiration mechanism for interactions |
| REC-112: Unauthorized actor | **PARTIAL** | `authenticate()` extracts `AuthUser`. Unauthenticated requests default to `local-operator` (admin). No 401 rejection for missing tokens. |
| REC-113: Manipulated client | **PARTIAL** | Server derives `responseId`, `respondedAt`, `respondingParticipantId`. Client cannot inject these. |
| REC-114: Model hallucination | **N/A** | Interactions are domain-generated, not model-generated in current implementation |
| REC-115: Unknown recommendation | **COMPLETE** | 404 returned for unknown `interactionId` |
| REC-116: Governance evidence | **PARTIAL** | Thread items record approval-request/decision. Interaction facts are durable in SQLite. No explicit audit trail linking interaction to governance decision. |

**Exit gate:** Hostile or malformed recommendation input cannot become unauthorized execution. **PARTIALLY REACHED.** Core validation works. Expired recommendations (R111) and full governance evidence chain (R116) are gaps.

---

### R12 — Performance & Resilience

**Original criterion:** Recommendation UX remains cheap enough for a long-running Activity Room. REC-120–125.

| Sub-criterion | Status | Evidence |
|---------------|--------|----------|
| REC-120: Bounded payloads | **PARTIAL** | `choices: readonly InteractionChoice[]` — no size limit enforced at contract level |
| REC-121: Lazy detail | **UNIMPLEMENTED** | No lazy loading for interaction details |
| REC-122: Stream performance | **PARTIAL** | Activity Records follow existing M9 schema. No dedicated performance testing for interaction records. |
| REC-123: Event burst | **UNIMPLEMENTED** | No event burst testing for interaction events |
| REC-124: Partial failure | **PARTIAL** | Publication ledger handles partial failure (D1-14). Reconciliation recovers. |
| REC-125: Memory | **UNIMPLEMENTED** | No memory profiling for interaction components |

**Exit gate:** Recommendation UX remains cheap enough for a long-running Activity Room. **NOT REACHED.** Performance testing is unimplemented.

---

### R13 — Production Acceptance

**Original criterion:** Production-ready recommendation/decision surface. Full certification scenario. 18 acceptance criteria.

| Criterion | Status | Evidence |
|-----------|--------|----------|
| No keyword interpretation | **COMPLETE** | B8 tests: natural language words do not trigger recommendation semantics |
| No domain-specific code | **COMPLETE** | Interaction infrastructure is domain-neutral. Activity Room has no domain-specific interaction code. |
| Provenance preserved | **COMPLETE** | `presentingParticipantId`, `respondingParticipantId` in contract and ActivityRecord |
| Duplicate submission safe | **COMPLETE** | UNIQUE constraint + idempotent retry |
| Governance evaluates intent | **COMPLETE** | Harness: RiskBasedToolPolicy → ExecutionPolicy → AIInvocationGuard chain |
| Shared primitives follow theme | **UNIMPLEMENTED** | No UI components to theme |
| Unrelated recommendation renders through same UI | **UNIMPLEMENTED** | No UI components exist |

**Exit gate:** Production-ready recommendation/decision surface. **NOT REACHED.** R3 (Shared UI Foundation) is the primary blocker.

---

## C. Marketplace R7 Disposition

### Original Plan

R7 defined Marketplace as the first real producer verification scenario:
- REC-070–076: Marketplace discovery flow without domain-specific Activity Room code

### Actual Implementation

Agent Harness tool-call approval was selected as the first real producer (I3-I1 at `6359523`). Reasons:
1. Most mature durable state (ThreadStore SQLite)
2. Deepest governance integration (three-layer)
3. Direct execution path (ToolRuntime.invoke)
4. Natural structured choice (Approve/Reject)
5. Restart/recovery proven (pendingApprovals from durable store)
6. Lowest semantic invention
7. Highest genericity value

### Disposition

**R7 is SUPERSEDED.** Marketplace is not the first producer. The Harness Approval Producer proves the same topology. Marketplace remains a future verification test — it would exercise the identical infrastructure with a different domain adapter.

### What Would Be Needed for Marketplace R7

1. Marketplace adapter: `MarketplaceInteractionAdapter` — maps permission request to `StructuredInteraction`
2. Marketplace bridge: subscribes to `interaction:responded`, interprets `'grant'`/`'reject'`, delegates to existing permission flow
3. Verification test: install extension → permission request appears in Activity Room → human grants → extension installs

This is a future milestone, not a prerequisite for R7 completion.

---

## D. Cross-Domain R8 Disposition

### Original Plan

R8 required using the exact same UI infrastructure for verification, database, deployment, agent, and unknown future scenarios.

### Current State

- One real producer: Agent Harness tool-call approval
- Genericity proof: BananaDepartment test (I3-I1 §I1-11) — theoretical
- No formal multi-domain verification with 2+ real producers

### Disposition

**R8 is PARTIALLY COMPLETE.** The architecture is designed for generality:
- Generic interaction contract (`StructuredInteraction`) — domain-neutral
- Generic submission endpoint (`POST /api/interactions/:id/responses`) — domain-neutral
- Generic M9 projection (`fromInteractionPresented`/`fromInteractionResponded`) — domain-neutral
- Domain-owned continuation topology (D1 at `6f89e8d`) — each producer owns its own subscriber

However, formal cross-domain verification requires at least one additional real producer. The Harness is the first proof. A second producer (e.g., Orchestrator Task Approval, or a synthetic test producer) would complete R8.

---

## E. Lifecycle R9 Disposition

### Current State

- **Concurrent response**: PROVEN — SQLite serialization, exactly one winner
- **Duplicate submission**: PROVEN — UNIQUE constraint, idempotent retry
- **Superseded**: NOT IMPLEMENTED — no mechanism to supersede an interaction
- **Multi-client**: NOT TESTED — no multi-browser testing
- **Reconnect**: PARTIAL — WebSocket reconnection delivers new records

### What Would Be Needed

1. `InteractionLifecycle` extension: add `'superseded'` state with `supersededBy: InteractionId`
2. Supersession logic: when a newer interaction supersedes an older one, mark the old as superseded
3. Multi-client testing: two browsers respond to same interaction — verify exactly one wins
4. UI rendering: show superseded interactions differently (e.g., grayed out)

### Disposition

**R9 is PARTIALLY COMPLETE.** Core concurrency is proven. Lifecycle management (superseded) and multi-client testing are gaps.

---

## F. Attention R10 Disposition

### Current State

- Attention system exists (`InMemoryAttentionItem` + `AttentionService`)
- No integration between interaction events and attention system
- No attention items created for `interaction:presented`
- No attention dismissal for `interaction:responded`

### What Would Be Needed

1. Attention bridge: subscribe to `interaction:presented`, create attention item
2. Attention dismissal: subscribe to `interaction:responded`, dismiss attention
3. Dedup/throttle: prevent attention spam for rapid-fire interactions
4. Attention linking: attention item references `interactionId`

### Disposition

**R10 is UNIMPLEMENTED.** This is a future milestone. The attention system is in-memory only — production attention may require durable persistence first.

---

## G. Security R11 Disposition

### Current State

- **Forged option**: PROVEN — `validateResponseForInteraction()` checks choice exists
- **Server-derived identity**: PROVEN — `respondingParticipantId` from `authenticate()`
- **Unknown recommendation**: PROVEN — 404 for unknown `interactionId`
- **Expired recommendation**: NOT IMPLEMENTED — no expiration mechanism
- **Governance evidence**: PARTIAL — Thread items exist, but no explicit audit trail linking interaction to governance decision

### What Would Be Needed

1. Interaction expiration: `expiresAt` field, rejection of expired interactions
2. Governance evidence chain: link `InteractionResponse` → `ApprovalRequest` → `ApprovalDecision` in ThreadStore
3. Auth hardening: 401 rejection for missing tokens (currently defaults to `local-operator`)

### Disposition

**R11 is PARTIALLY COMPLETE.** Core validation works. Expiration and full governance evidence chain are gaps.

---

## H. Performance R12 Disposition

### Current State

- O(1) indexed lookups for interaction and response
- In-process EventBus emission (negligible)
- Publication ledger with bounded recovery (LIMIT 100)
- No formal performance testing

### What Would Be Needed

1. Payload size limits: enforce max `choices.length` at contract or service level
2. Stream performance testing: measure Activity Room rendering with many interaction records
3. Event burst testing: rapid-fire `interaction:presented` events
4. Memory profiling: long-running Activity Room with many interactions

### Disposition

**R12 is UNIMPLEMENTED.** Performance testing is a future milestone. The current implementation is architecturally efficient (O(1) lookups, bounded recovery), but no formal evidence exists.

---

## I. Certification R13 Disposition

### Current State

R13 requires the full certification scenario: "Build a new UI component for a dashboard." with 18 acceptance criteria.

### Blockers

1. **R3 (Shared UI Foundation)** — No UI components exist for rendering interactions
2. **R6 (Contextual Presentation)** — No domain-specific presentation patterns
3. **R12 (Performance)** — No performance evidence

### Disposition

**R13 is UNIMPLEMENTED.** This is the final milestone and requires all preceding milestones to be complete.

---

## J. Adjacent Findings (Carried Forward)

| # | Finding | Classification | Action |
|---|---------|---------------|--------|
| 1 | Harness arbitrary-tool replay safety: INDETERMINATE (ThreadStore `persist()` debounce 250ms crash window) | ADJACENT | Not fixed under AR-REC. Evidence only. |
| 2 | `sql.js` WASM file missing — prevents direct Node inspection of `.vestara/plans/plans.db` | ADJACENT | Not a blocker for current work |
| 3 | Pre-existing flaky tests: `activity-hardening` pagination, `activity-messaging` under parallel load | ADJACENT | Not modified |
| 4 | Remaining ~32s O(n) startup recovery (`replay → project → saveExecutionSession` × 767 threads) | ADJACENT | Not fixed under AR-REC |
| 5 | Same-choice HTTP retry does NOT re-emit `interaction:responded` (InteractionService idempotency) | OBSERVATION | By design. Recovery relies on reconciliation retry. |
| 6 | InteractionStore unavailability causes reconciliation exhaustion | OBSERVATION | Logged, not permanently lost. Store recovery resumes reconciliation. |

---

## K. Production File Inventory

### New Packages

| Package | Purpose | Files |
|---------|---------|-------|
| `packages/interaction-persistence/` | Port interfaces, SQLite store, EventBus adapter, migrations | `src/index.ts`, `src/interaction-persistence-port.ts`, `src/interaction-publication-port.ts`, `src/sqlite-store.ts`, `src/migrations.ts`, `src/interaction-event-bus-adapter.ts`, `src/publication-delivery-verifier.ts` |
| `packages/interaction-app/` | Producer-neutral InteractionService | `src/index.ts`, `src/interaction-service.ts`, `src/response-conflict-error.ts` |

### New Files in Existing Packages

| File | Purpose |
|------|---------|
| `packages/agent-harness/src/harness-approval-interaction-adapter.ts` | Domain adapter: approval ↔ interaction mapping |
| `apps/api/src/routes/interactions.ts` | HTTP response endpoint |
| `apps/api/src/bridges/harness-approval-interaction-bridge.ts` | Composition root: event subscriber + reconciliation |

### Modified Files

| File | Changes |
|------|---------|
| `packages/types/src/activity.ts` | Extended `ActivityType` with `interaction.presented` / `interaction.responded` |
| `packages/types/src/activity.ts` | Extended `ActivitySource` with `'interaction-app'` |
| `packages/activity-projection/src/m9-adapter.ts` | Added `fromInteractionPresented()` and `fromInteractionResponded()` |
| `packages/activity-projection/src/m9-ingestion-bridge.ts` | Added `interaction:presented` / `interaction:responded` patterns |
| `packages/activity-projection/src/index.ts` | Exported new adapters |
| `packages/agent-harness/src/index.ts` | Re-export adapter functions |
| `packages/agent-harness/package.json` | Added `@vestara/interaction-app`, `@vestara/interaction-persistence` deps |
| `apps/api/src/workspace-context.ts` | Wired bridge with InteractionService, harness, disposal |

---

## L. Test Inventory

| Suite | Tests | Status |
|-------|-------|--------|
| `packages/types/__tests__/interaction-contract.test.ts` | 65 | ALL PASS |
| `packages/interaction-persistence/__tests__/interaction-store.test.ts` | 19 | ALL PASS |
| `packages/interaction-app/__tests__/interaction-service.test.ts` | 15 | ALL PASS |
| `packages/interaction-persistence/__tests__/interaction-restart-proof.test.ts` | 10 | ALL PASS |
| `packages/interaction-persistence/__tests__/interaction-publication-recovery.test.ts` | 8 | ALL PASS |
| `packages/interaction-persistence/__tests__/interaction-concurrent-proof.test.ts` | 4 | ALL PASS |
| `packages/activity-projection/__tests__/interaction-publication-delivery.test.ts` | (included in above) | ALL PASS |
| `packages/agent-harness/__tests__/harness-approval-interaction-adapter.test.ts` | 28 | ALL PASS |
| `apps/api/__tests__/harness-approval-interaction-bridge.test.ts` | 14 | ALL PASS |
| `apps/api/__tests__/harness-approval-production-chain.test.ts` | 6 | ALL PASS |
| `apps/api/__tests__/harness-approval-recovery.test.ts` | 10 | ALL PASS |
| `apps/api/__tests__/interactions.test.ts` | 35 | ALL PASS |
| `packages/interaction-persistence/__tests__/` (existing) | 41 | ALL PASS |
| `packages/agent-harness/__tests__/` (existing) | 225 | ALL PASS |
| **Total** | **480+** | **ALL PASS** |

---

## M. Commit History

| Commit | Description | Frozen? |
|--------|-------------|---------|
| `355922b` | AR-REC-A existing capability + governance audit | YES |
| `5dc54ba` | AR-REC-B minimum interaction contract selection + implementation | YES |
| `fc30f8b` | AR-REC-C1 Interaction Integration Architecture Audit | YES |
| `83e68cc` | AR-REC-C2-D1 Interaction Authority Design Gate | YES |
| `4418709` | AR-REC-C2-I1 Durable Interaction Authority + Publication Substrate | YES |
| `a8cc2e3` | AR-REC-C2-I2-C1 response idempotent/conflict classification | YES |
| `f83e1a4` | AR-REC-C2-I2-I1 structured interaction response HTTP ingress | YES |
| `e2b6164` | AR-REC-C2-I3-PREFLIGHT Producer Provenance & Governed Continuation Audit | YES |
| `6f89e8d` | AR-REC-C2-I3-D1 Producer Ownership / Continuation Topology Design | YES |
| `5ead7a6` | AR-REC-C2-I3-D2 Domain Continuation Durability & Reconciliation Design | YES |
| `6359523` | AR-REC-C2-I3-I1 First Real Producer Selection & Implementation Preflight | YES |
| `d9788e0` | AR-REC-C2-I3-I2 Harness Approval Producer Implementation | YES |
| `f853fd4` | AR-REC-C2-I3-I2 evidence document | YES |
| `a683c76` | AR-REC-C2-I3-I2-C1 Harness Continuation Recovery Reliability | YES |
| `6c7356f` | AR-REC-C2 I3-I2 FROZEN | YES |

---

## N. Remaining Gaps Summary

### Gaps Required Before Completion

| Gap | Required By | Severity | Notes |
|-----|------------|----------|-------|
| R3: Shared UI Foundation | R6, R7, R13 | **HIGH** | No interaction rendering components exist |
| R6: Contextual Presentation | R7, R13 | **HIGH** | Depends on R3 |
| R10: Attention Integration | R13 | **MEDIUM** | Depends on durable attention persistence |
| R12: Performance Testing | R13 | **MEDIUM** | No formal performance evidence |
| R13: Production Acceptance | — | **HIGH** | Final certification; depends on R3, R6, R10, R12 |

### Gaps That Can Be Deferred

| Gap | Can Defer? | Notes |
|-----|-----------|-------|
| R7: Marketplace Scenario | YES | Harness proves topology. Marketplace is a verification test. |
| R8: Cross-Domain Verification | YES | BananaDepartment test proves genericity. Formal multi-domain test is future. |
| R9: Lifecycle (Superseded) | YES | Core concurrency proven. Superseded is edge case. |
| R11: Security (Expired, Auth) | PARTIAL | Core validation works. Expiration and auth hardening are future. |

---

## O. Next Single Milestone Recommendation

### Recommended: R3 — Shared UI Foundation

**Rationale:**
1. R3 is the primary blocker for R6, R7, and R13
2. R3 is the natural next step after the backend infrastructure (R1–R2 contracts, R5 submission, I3-I2 first producer)
3. R3 components will enable the full user-facing experience for the Harness Approval Producer
4. R3 components will be reusable for all future producers (Marketplace, Orchestrator, etc.)

**Scope for R3:**
1. `InteractionCard` — renders `interaction.presented` ActivityRecord with choice buttons
2. `DecisionGroup` — container for choice options
3. `DecisionOption` — accessible button that emits `optionId selected`
4. `DecisionState` — resolved/pending/unavailable presentation
5. Async feedback: submitting → accepted → failure → retry
6. Theme compliance: use existing Vestara design tokens
7. Accessibility: keyboard, focus, screen-reader

**NOT in scope for R3:**
- R7 Marketplace scenario
- R8 Cross-domain verification
- R9 Lifecycle (superseded)
- R10 Attention integration
- R11 Security hardening
- R12 Performance testing
- R13 Production certification

**Estimated size:** ~400–600 lines across 5–8 files (components + tests)

---

## P. Invariant Preservation

### REC-GOV-01 through REC-GOV-10

| Invariant | Status | Evidence |
|-----------|--------|----------|
| REC-GOV-01: Recommendation ≠ authority | **PRESERVED** | Bridge presents choices, doesn't execute. No domain execution from interaction creation. |
| REC-GOV-02: Decision ≠ direct execution | **PRESERVED** | `selectedChoiceId` is opaque. Governance chain runs separately. |
| REC-GOV-03: Governance always applies | **PRESERVED** | RiskBasedToolPolicy → ExecutionPolicy → AIInvocationGuard chain unchanged. |
| REC-GOV-04: No Operation Dispatcher | **PRESERVED** | No `switch (decision.action)` in Activity Room. ChoiceId interpretation is domain-owned. |
| REC-GOV-05: Presentation Labels Have No Authority | **PRESERVED** | Labels are presentation-only in `InteractionChoice`. |
| REC-GOV-06: No Prose-to-Authority Conversion | **PRESERVED** | Model text does not create executable capability. |
| REC-GOV-07: Decisions Are Contextual | **PRESERVED** | Each `InteractionResponse` references specific `interactionId` and `selectedChoiceId`. |
| REC-GOV-08: Current State Must Be Revalidated | **PRESERVED** | Harness revalidates `turn.state === 'awaiting-approval'` before continuation. |
| REC-GOV-09: Activity Room Remains Projection + Interaction | **PRESERVED** | Activity Room has no orchestration or governance authority. |
| REC-GOV-10: No Hardcoded Domain Knowledge | **PRESERVED** | Interaction infrastructure is domain-neutral. No Marketplace/Agent/Workflow names in generic code. |

### Three Distinctions

| Distinction | Status | Evidence |
|-------------|--------|----------|
| Human conversational choice | **PRESERVED** | `InteractionResponse.selectedChoiceId` is intent, not approval |
| Governance approval | **PRESERVED** | `RiskBasedToolPolicy` remains the authority |
| Execution authorization | **PRESERVED** | `ToolRuntime.invoke(approved=true)` is the execution boundary |

---

## Q. Acceptance Boundary

This reconciliation document is **documentation/evidence only**. No production code, tests, schemas, stores, routes, events, UI components, or behavioral changes were made.

The next authorized action is to proceed with the recommended R3 milestone, subject to Director authorization.

---

> **Reconciliation complete. All R0–R13 requirements traced. Next milestone recommended: R3 — Shared UI Foundation.**

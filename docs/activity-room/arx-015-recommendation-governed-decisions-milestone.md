---
title: ARX-015 — Contextual Recommendations & Governed Decisions Milestone
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# ARX-015 — Contextual Recommendations & Governed Decisions Milestone

**Date:** 2026-08-29
**Status:** Approved — Planning Complete
**Architecture Review:** `docs/activity-room/arx-015-architecture-review.md` (Revision 2, frozen)
**Authoritative Repository:** `vestara-ai-core`
**Blueprint:** `vestara-blueprint/06-workspace/activity-room-recommendation-governed-decisions-milestone.md`
**Scope:** A distinct extension from AR-UI (Activity Room Production Team Experience). Allows agents and other Vestara capabilities to surface context-aware suggestions, alternatives, discoveries, conflicts, efficiencies, and questions inside Activity Room, while allowing humans to respond through structured decisions that remain fully governed.

---

## Purpose

This milestone is **deliberately separate** from the core Participant/Team production work (AR-UI). It keeps the first milestone focused on making Activity Room stable, while this second plan introduces the richer recommendation/decision experience without turning Activity Room into an execution authority.

**This capability must remain generic. Marketplace discovery is an initial use case, not the architecture.**

---

## Architectural Invariants (Frozen)

These invariants are frozen at the top of this plan. Every phase below operates within them.

### REC-GOV-01 — Recommendation ≠ Authority

An Agent recommendation does not authorize execution.

### REC-GOV-02 — Decision ≠ Direct Execution

A human selecting a decision option communicates intent. It does not directly invoke a destructive or mutating operation.

### REC-GOV-03 — Governance Always Applies

Every resulting operation remains subject to existing authorization, permissions, policies, workflow governance, execution boundaries, verification, and evidence requirements.

### REC-GOV-04 — No Operation Dispatcher

Activity Room MUST NOT contain logic equivalent to `switch (decision.action) { case "install": ... }`. There should be no Activity Room operation vocabulary requiring such dispatch.

### REC-GOV-05 — Presentation Labels Have No Authority

A label like `[ Use this option ]` is presentation. Changing the label must not change the operational meaning of the underlying governed decision.

### REC-GOV-06 — No Prose-to-Authority Conversion

Model-generated text cannot create an executable capability. `"I can remove this."` does not produce authority to perform removal.

### REC-GOV-07 — Decisions Are Contextual

A decision records what the human selected within a particular recommendation/context. It is not a reusable capability token.

### REC-GOV-08 — Current State Must Be Revalidated

A decision created against state at T1 may be acted upon at T2 only after the appropriate downstream authority evaluates current state.

### REC-GOV-09 — Activity Room Remains Projection + Interaction

Activity Room presents recommendations, captures decisions, and displays resulting state. It does not become an orchestration or governance authority.

### REC-GOV-10 — No Hardcoded Domain Knowledge

No Marketplace names, package operations, agent roles, models, teams, recommendation categories, workflow names, or business-specific choices should be hardcoded into the generic recommendation UI.

---

## Production Boundary (Inherited from AR-UI)

> **Activity Room may read authoritative Vestara state, compose presentation/read models, invoke already-supported configuration mutations, and submit messages through existing ingress.**
>
> **Activity Room MUST NOT change or reproduce Harness, Workflow, Orchestration, Agent execution, routing, runtime/session, governance, or authorization semantics.**
>
> **Missing backend capability is reported as a dependency or adjacent finding — not invented inside the UI.**

---

## Composer Generality Invariant (Inherited from AR-UI)

The Activity Room composer is a general human/AI interaction surface, not a command-specific frontend.

It MUST NOT contain keyword-specific behavior, workflow-specific UI logic, agent-role routing tables, Marketplace-package assumptions, or execution-specific branching.

> **The most important acceptance criterion: Vestara should be able to become more capable without Activity Room needing to learn what every new capability means.**

---

## Interaction Envelope

When a recommendation arrives, Activity Room produces a clean interaction envelope:

```text
Message
  recommendation: { id, title?, message, summary?, context?, options[] }
  source: sourceParticipantId
  conversation: current conversation
  workspace: current workspace
```

When the user responds, Activity Room captures a clean decision envelope:

```text
Decision
  recommendationId: the recommendation
  optionId: the selected option
  decidedBy: current human
  decidedAt: timestamp
```

Then it crosses the existing ingress boundary. Activity Room's responsibility ends at producing this envelope.

---

## Objective

Allow agents and other Vestara capabilities to surface context-aware suggestions, alternatives, discoveries, conflicts, efficiencies, and questions inside Activity Room, while allowing humans to respond through structured decisions that remain fully governed.

A user should eventually be able to say:

> Build a new UI component for a dashboard.

Vestara may discover that something useful already exists. The Activity Room could then present:

```text
Mimo

I found existing dashboard components that
may fit what you're asking for.

[ Check existing options ]
[ Continue building ]
[ Tell me more ]
```

If the user investigates further:

```text
Mimo

I found three potentially suitable options.

Dashboard Metrics
Already available to this workspace.

Analytics Cards
Available as an additional capability.

Dashboard Kit
Currently unavailable.

[ Compare options ]
[ Use Dashboard Metrics ]
[ Continue building ]
```

Activity Room does not understand Marketplace installation, package management, component generation, or workflow routing. It understands:

**Recommendation → Decision options → Decision response → State**

Everything operational remains downstream of the governed Vestara architecture.

---

## Definition of Done

> **Activity Room Contextual Recommendation Definition of Done**
>
> An existing or future Vestara capability can surface a grounded recommendation containing arbitrary contextual decision options.
>
> Activity Room can render that recommendation using shared, theme-consistent components without understanding its domain.
>
> A human can select an option and Activity Room can submit that decision through an existing governed interaction boundary without possessing or deriving executable authority.
>
> Existing governance determines the meaning, authorization, validity and operational consequences of the decision.
>
> Resulting activity is projected back into Activity Room with sufficient provenance to understand what was proposed, what was decided and what happened.
>
> New recommendation-producing capabilities can be introduced without modifying Activity Room source code.

### Architectural Test

> **Delete the Marketplace scenario from the test suite mentally. Does the architecture still make complete sense?**
>
> If yes, we've built a Vestara recommendation capability.
>
> If no, we've accidentally built Marketplace buttons in Activity Room.

This should be a **generic governed human–AI decision surface**, with Marketplace merely being one of the first compelling demonstrations of it.

---

## Implementation Batches

| Batch | Phases | Scope | Outcome |
|-------|--------|-------|---------|
| **AR-REC-A** | R0 | Existing capability + governance audit | Architecture report: what can be reused, what genuinely does not exist |
| **AR-REC-B** | R1–R2 | Recommendation/Decision contracts | Generic recommendation and decision response contracts |
| **AR-REC-C** | R3–R4 | Shared UI + Activity Stream presentation | RecommendationCard, DecisionGroup, DecisionOption, stream integration |
| **AR-REC-D** | R5–R6 | Governed decision submission + generic contextual UX | Existing ingress submission, contextual presentation patterns |
| **AR-REC-E** | R7–R10 | Marketplace scenario + cross-domain/lifecycle/attention | Verification scenarios, lifecycle, concurrency, attention |
| **AR-REC-F** | R11–R13 | Security, resilience, performance, production certification | Full security/resilience/performance evidence, production acceptance |

**There should be a review/freeze gate between every milestone.**

Most importantly, **AR-REC-A should not imply authorization for AR-REC-B.** The audit could discover Vestara already has 80% of this capability under another contract. In that case we adapt the plan rather than building duplicate infrastructure.

---

## Phase Detail

### Phase R0 — Existing Capability Audit

Do not implement another recommendation system before determining what Vestara already has.

- **REC-000** — Recommendation Contract Audit: search existing architecture for recommendations, suggestions, approvals, decisions, confirmations, attention items, workflow questions, human-in-the-loop requests, notifications, proposed actions, agent outputs, Activity records.
- **REC-001** — Governance Contract Audit: identify existing authorities for the chain `recommendation → human response → authorization → workflow → execution`.
- **REC-002** — Existing Ingress Audit: determine whether a structured human response can already travel through the canonical Activity Room/conversation ingress.
- **REC-003** — Existing Persistence Audit: determine whether recommendation/decision state already has an authoritative persistence location.
- **REC-004** — Existing Event Audit: identify events that could already represent recommendation created, decision requested, decision recorded, decision expired, resulting work started/completed/failed.
- **REC-005** — Gap Classification: classify every missing capability as REUSE, EXTEND, ADJACENT GAP, or BLOCKER.

**Exit gate:** architecture report establishes what can be reused and what genuinely does not exist.

### Phase R1 — Generic Recommendation Contract

- **REC-010** — Recommendation Identity: stable identity with `recommendationId`, `conversationId`, `sourceParticipantId`, `createdAt`.
- **REC-011** — Recommendation Content: generic `title?`, `message`, `summary?`, `context?`.
- **REC-012** — Decision Options: `DecisionOption { id, label, description?, presentation? }`. No `operation`, `command`, `handler`.
- **REC-013** — Recommendation State: `pending`, `responded`, `expired`, `withdrawn`, `superseded`. No invented lifecycle states.
- **REC-014** — Option Presentation: `primary`, `secondary`, `neutral`, `informational`. No `install`, `delete`, `deploy`, `rollback`.
- **REC-015** — Unknown Option Compatibility: new capabilities introduce choices without Activity Room source changes.

**Exit gate:** contract can represent arbitrary recommendations without understanding their domain.

### Phase R2 — Decision Response Contract

- **REC-020** — Decision Identity: `decisionId`, `recommendationId`, `optionId`, `decidedBy`, `decidedAt`.
- **REC-021** — No Executable Payload: reject `{ option, command, execute }` patterns.
- **REC-022** — Opaque Decision Reference: return selected option to canonical governed boundary.
- **REC-023** — Decision Provenance: preserve recommendation, conversation, proposing participant, deciding participant, selected option, timestamp.
- **REC-024** — Idempotency: no duplicate decisions from double-clicks/retries.
- **REC-025** — Replay Safety: historical UI cannot become executable.
- **REC-026** — Stale Decision Protection: downstream authority free to reject/re-evaluate.

**Exit gate:** decision can be recorded safely without Activity Room acquiring operational authority.

### Phase R3 — Shared UI Foundation

- **REC-030** — Shared UI Inventory: classify primitives as EXISTING, EXTENDABLE, MISSING, DOMAIN-SPECIFIC.
- **REC-031** — RecommendationCard: generic container with RecommendationContent, ContextSummary, DecisionGroup, DecisionState.
- **REC-032** — DecisionGroup: reusable container for options.
- **REC-033** — DecisionOption: accessible primitive that emits `optionId selected`.
- **REC-034** — DecisionState: resolved/pending/unavailable presentation.
- **REC-035** — Async Feedback: submitting, accepted, failure, retry, unavailable, stale.
- **REC-036** — Theme Compliance: existing Vestara theme primitives/tokens.
- **REC-037** — Accessibility: keyboard, focus, screen-reader, non-color-dependent state.

**Exit gate:** generic decision UI exists independently of Marketplace, Workflow, Agents or Activity Room-specific styling.

### Phase R4 — Activity Stream Integration

- **REC-040** — Recommendation Activity: natural stream appearance.
- **REC-041** — Source Identity: normal participant identity.
- **REC-042** — Historical Decision Presentation: resolved record, not unanswered prompt.
- **REC-043** — Result Separation: decision separate from subsequent execution/result.
- **REC-044** — Activity Correlation: resulting activity correlates back to originating recommendation/decision.
- **REC-045** — Stream Virtualization Compatibility: works with bounded history/virtualization.

**Exit gate:** recommendations behave like first-class Activity Room records without changing stream architecture.

### Phase R5 — Canonical Decision Submission

- **REC-050** — Existing Ingress Only: no browser-side execution dispatcher.
- **REC-051** — Minimal Submission: `recommendationId`, `optionId`, conversation context, actor identity.
- **REC-052** — Server-Side Validation: never trust client-supplied authority/permissions/validity.
- **REC-053** — Governance Re-entry: normal governance, no `activityRoomTrusted = true`.
- **REC-054** — Failure Handling: rejected decision remains understandable with authoritative options.
- **REC-055** — No Automatic Retry of Mutations: network retry must not repeat downstream operations.

**Exit gate:** decision submission is governed, idempotent and incapable of bypassing existing authority.

### Phase R6 — Contextual Recommendation Presentation

- **REC-060** — Simple Question: `[ Check it ] [ Continue ]`
- **REC-061** — Multiple Alternatives: `[ Compare ] [ Continue with current approach ]`
- **REC-062** — Existing Capability: `[ Use this option ] [ Show details ] [ Explore alternatives ]`
- **REC-063** — Conflict: `[ Review conflict ] [ Keep current setup ] [ Explore alternatives ]`
- **REC-064** — Efficiency Suggestion: `[ Review evidence ] [ Continue ]`

All use the same underlying Recommendation/Decision primitives.

**Exit gate:** multiple domains can produce useful interactions without domain-specific Activity Room code.

### Phase R7 — Marketplace Discovery Use Case

- **REC-070–076**: Marketplace becomes a verification scenario, not an Activity Room dependency. Complete flow without Activity Room importing Marketplace execution logic.

**Exit gate:** complete Marketplace recommendation flow without domain-specific code.

### Phase R8 — Cross-Domain Generality Verification

- **REC-080–084**: Use the exact same UI infrastructure for verification, database, deployment, agent, and unknown future scenarios.

**Exit gate:** zero domain-specific source modifications across scenarios.

### Phase R9 — Recommendation Lifecycle & Concurrency

- **REC-090–095**: Superseded, concurrent, multi-client, reconnect, duplicate submission, historical replay.

**Exit gate:** recommendation state remains coherent under realistic concurrency.

### Phase R10 — Attention & Notification Integration

- **REC-100–103**: Decision needed qualifies for attention. No attention spam. Resolved attention. No new notification authority.

**Exit gate:** important decisions are discoverable without turning suggestions into noise.

### Phase R11 — Security & Governance Verification

- **REC-110–116**: Forged option, expired recommendation, unauthorized actor, manipulated client, model hallucination, unknown recommendation, governance evidence.

**Exit gate:** hostile or malformed recommendation input cannot become unauthorized execution.

### Phase R12 — Performance & Resilience

- **REC-120–125**: Bounded payloads, lazy detail, stream performance, event burst, partial failure, memory.

**Exit gate:** recommendation UX remains cheap enough for a long-running Activity Room.

### Phase R13 — Production Acceptance

Deliberately demanding certification scenario. Start with "Build a new UI component for a dashboard." Prove all 18 acceptance criteria including: no keyword interpretation, no domain-specific code, provenance preserved, duplicate submission safe, governance evaluates intent, shared primitives follow theme, unrelated recommendation renders through same UI.

**Exit gate:** production-ready recommendation/decision surface.

---

## Backend Dependencies

| Existing System | Dependency |
|-----------------|------------|
| Activity Room Ingress | REC-002, REC-050–053 decision submission |
| Conversation/Message Service | REC-010 recommendation identity |
| Participant/Team Identity | REC-023 decision provenance |
| Governance/Authorization | REC-GOV-03, REC-053 governance re-entry |
| Engineering Events | REC-044 activity correlation |
| Attention System | REC-100–103 attention integration |
| Stream Virtualization | REC-045 virtualization compatibility |

No new backend services required. This milestone operates within existing Vestara infrastructure.

---

## Verification Strategy

1. **Contract Tests**: verify recommendation/decision contracts can represent arbitrary domains
2. **UI Component Tests**: verify shared primitives render correctly, are accessible, follow theme
3. **Integration Tests**: verify decision submission through existing ingress with governance
4. **Security Tests**: verify hostile input cannot bypass governance
5. **Concurrency Tests**: verify lifecycle correctness under realistic conditions
6. **Performance Tests**: verify bounded memory/render behavior with many recommendations
7. **Cross-Domain Tests**: verify marketplace, verification, database, deployment, agent scenarios all use same UI
8. **Production Acceptance**: the full certification scenario from Phase R13

---

## What's After This Milestone

Once AR-REC passes production certification:

- Community Feedback Integration (usage patterns, pain points, feature requests)
- Performance Optimization at Scale (large team sizes, high-frequency events)
- Advanced Recommendation Patterns (multi-step, conditional)
- Recommendation Analytics (decision patterns, outcomes)

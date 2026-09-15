# AR-GA-CORE-005 — Companion Coordination & Role-Scoped Session Workflow Refinement

**Program:** AR-GA-CORE — Activity Room + Global Assistant Convergence
**Depends On:** AR-GA-CORE-001 through 004 (baselined; this document refines but does not amend them)
**Status:** PROPOSED — documentation/milestone planning only. No runtime implementation authorized.
**Scope:** Roadmap refinement. No changes to runtime code, UI implementation, routing behavior,
OpenCode integration, workflow execution, Observer behavior, or Activity Room behavior.
**STOP for architecture review after this document.**

> **Placement note.** CORE-004's completion gate reads `READY FOR AR-GA-CORE-005`. This document
> fills that slot as the planning milestone. Implementation milestones proposed herein are numbered
> CORE-006/007 and AR-GA-009 so that no existing number is reused or redefined.

---

## 0. Inspected baseline (evidence, not claims)

### 0.1 Milestone/contract artifacts reviewed

| Artifact | State | What it owns (relevant to this refinement) |
|---|---|---|
| CORE-001 Authority & Contract Baseline (847 lines) | Baselined | Vertical slices (GA `adapter.ts → runAssistantOpenCodeTurn()`; AR `assistant-turn.ts → triggerAssistantTurn()`); authority matrix; **R12** (AR creates throwaway/ephemeral conversations per turn — known limitation); E.1/E.2 (GA owns conversation, AR owns activity stream; AR must not acquire domain authority); G target ownership (new leaf packages); J risk register |
| CORE-002 Canonical Domain Contracts (385 lines) | Baselined | `@vestara/agent-types` (AgentRole, 28 values — `'planning'` vs `'planner'` normalization), `@vestara/routing-types` (RoutingRole 6 values, RoutingCapability 14, RoleRoutingPolicy, RoutingAssignment — **provider/model routing, not conversational turn routing**), `@vestara/permission-contracts` (11 PermissionActions, PolicyDecision allow/ask/deny; Vestara owns authorization) |
| CORE-003 Execution Contract Baseline (738 lines) | Baselined | Identity hierarchy WorkflowRun → WorkflowTask → Execution → Turn → Operation; `Conversation ≠ Execution ≠ RuntimeSession` invariant chain (§4.3); execution lifecycle `requested → binding → ready → running → completed/failed/cancelled/timed_out`; ExecutionRequest (incl. `workflowRunId`, `workflowTaskId`, `conversationId` correlation); binding boundary; interruption-recovery future (workflow survives session loss) |
| CORE-004 Runtime Execution Boundary (534 lines) | Baselined | `RuntimeExecutionPort` (OpenCode proof adapter; `FakeRuntimeAdapter` proves portability); `ExecutionId ≠ RuntimeSessionId`; **one runtime session MAY serve multiple sequential executions** (§5.2); session create-or-reuse flow (§5.3); cancellation/timeout ownership (Vestara decides) |
| AR-GA-005 Activity Room Convergence Audit | Baselined | AR-GA-006 (human message → M9 ingestion), AR-GA-007 (context assembly), AR-GA-008 (Floating Assistant ↔ AR bridge); "What NOT to Rebuild" list; HOLDs (incl. "whether Activity Room should have its own conversation model or share Conversation service") |
| GA-006 Assistant Convergence Audit | Baselined | 006/007/008 dependency chain (006 → 007 → 008); cross-surface continuity gap |
| MILESTONES.md v5.3/v5.4 (workflow orchestration), v6.2 (assistant panel), AR-UI, v7.12/v7.17, GA-TERM-001 | Complete or Planned as marked | Assistant surfaces; workflow runtime (`@vestara/workflow-orchestrator` + PCS-025); no Companion milestone exists |
| `packages/activity-room/src/assistant-turn.ts` | Current code | Turn-capable role allowlist (`assistant, context, planner, developer, reviewer, verifier`); per-turn execution config (Vestara-owned limits); surface attribution informational-only |
| `packages/observer/src/` (`observer.ts`, `findings-lifecycle.ts`, `temporal-evidence.ts`) | Current code | Observer as background finding-lifecycle owner, separate from conversation |
| `packages/workspace/src/agents.registry.ts` + `.opencode/agents/vestara-*.md` | Current code | Canonical agent definitions (assistant, planner, developer, reviewer, verifier, browser, context) — the role-instruction source of truth |
| `packages/conversation-runtime` (`updateRuntimeSessionId`) | Current code | Conversation→runtime-session binding field already exists at persistence layer |

### 0.2 Negative findings (what does NOT exist — verified by search)

- **No Companion concept** in code or milestones (only MILESTONES.md v4.0 vision language: "AI engineering companion"). Assistant → Companion convergence is unconverged and unowned.
- **No MessageReaction** contract, store, or UI anywhere. Reactions are genuinely missing.
- **No per-role session persistence policy.** No frozen rule making "Developer durable but Planner/Reviewer ephemeral" was found in the CORE baselines or code. CORE-004 §5.2 *permits* session reuse across executions but assigns no per-role durability. The task's "existing design" premise is therefore treated as an open decision, not a rule to preserve (see §4.3).
- **No conversational turn-routing vocabulary.** CORE-002's routing vocabulary covers provider/model selection only. DIRECT/COORDINATED/INFERRED turn routing is new vocabulary (see §3.3).
- **No @mention parsing contract** found at the AR invocation layer (role targeting exists as `agentId` in `triggerAssistantTurn`; the `@role` surface convention has no defined parser/owner).
- **No RoleInstruction/TaskInstruction split.** Role behavior lives in agent definitions/registry + markdown agents; no instruction-layering contract exists.

---

## 1. Companion is the default human-facing coordinator

### 1.1 Target

The Activity Room "Assistant" role converges into **Companion**: the default recipient of ordinary
human messages, which understands intent, answers directly, asks clarification, delegates to
specialists, synthesizes results, and surfaces Observer findings — across Activity Room,
floating/full Companion app, voice, Telegram, and future surfaces.

### 1.2 Preserved separations (normative)

- **Companion ≠ Surface.** Companion is a coordination identity; Activity Room, floating app, voice,
  and Telegram are projections/surfaces. No surface owns Companion logic; all converge on the
  canonical coordination boundary (the existing `ConversationService` + routing/governance path per
  CORE-001 E.2, not a new subsystem).
- **Companion intelligence ≠ execution authority.** Companion understanding, delegating, or
  synthesizing never authorizes execution, mutation, or workflow transition. Execution authority
  flows only through the frozen governance boundary (permission-contracts PolicyDecision;
  milestone authorization; STOP/HOLD conditions).
- **Routing ≠ Authorization.** Companion's choice of *whom* to route to is not permission for the
  routed work to execute. Every delegated turn re-enters authorization independently.

### 1.3 Milestone ownership

- **Refine AR-GA-008** (Floating Assistant ↔ AR bridge): its "cross-surface continuity" objective
  becomes the Companion-continuity objective — one coordination identity across surfaces, with the
  existing isolation boundaries retained. **No new bridge program.**
- **Refine GA-006 scope**: the Assistant → Companion rename/convergence is recorded as a GA-006
  convergence item (rename `agent-assistant` display/contract role to Companion at the GA layer;
  AR display names follow through AgentDefinition, not a parallel rename).
- Owner of the rename itself: `packages/workspace/src/agents.registry.ts` (single source of truth)
  + `.opencode/agents/` mirrors. No other registry may coin a parallel "companion" identity.

---

## 2. Explicit @mentions remain direct role targeting

### 2.1 Preserved behavior + three routing modes

- Normal message → Companion. `@developer` → Developer, `@reviewer` → Reviewer, `@planner` → Planner
  (extending to the full `assistant-turn.ts` turn-capable allowlist).
- **DIRECT** — explicit `@role` mention; bypasses Companion inference, never bypasses governance.
- **COORDINATED** — human explicitly asks Companion to delegate ("have the reviewer check this");
  Companion selects the role but the delegation is human-authorized in-conversation.
- **INFERRED** — Companion determines the role from intent; lowest authority — inference may select a
  *responder*, never an *authorization*.

### 2.2 Convergence constraint

All three modes converge on the **existing canonical routing/governance boundary**
(ConversationService → adapter → RuntimeExecutionPort; permission-contracts PolicyDecision) rather
than separate implementations. The modes differ only in *who selects the role* (human token,
human instruction, Companion inference), recorded as turn attribution — not as separate code paths.

### 2.3 Milestone ownership

- **Refine AR-GA-006/007-adjacent AR work**: `@mention` parsing/normalization contract owner is
  assigned to the Activity Room milestone line (parser maps `@role` → turn-capable `agentId`;
  unknown mentions → Companion with clarification, never silent drop, never arbitrary agent).
  This closes the gap noted in §0.2 (allowlist exists, parser contract does not).
- No new routing subsystem. CORE-002 routing-types are explicitly **out of scope** for turn routing
  (provider/model concern; §0.1).

---

## 3. Role-scoped persistent runtime sessions

### 3.1 Target binding model

A WorkflowRun/program maintains isolated per-role runtime-session bindings:

```text
WorkflowRun
├── Companion / coordination context
├── Developer → RuntimeSession
├── Reviewer  → RuntimeSession
├── Planner   → RuntimeSession
└── other role → RuntimeSession
```

Subsequent turns routed to a role normally **resume** that role's bound session rather than creating
a new OpenCode session.

### 3.2 Preserved distinctions (normative — extends CORE-003 §4.3 / CORE-004 §5.2)

- WorkflowRun ≠ RuntimeSession. Conversation ≠ RuntimeSession. Role ≠ RuntimeSession.
  Developer session ≠ Reviewer session.
- **RuntimeSession continuity ≠ authority continuity.** Resuming a session resumes *context*, never
  *permission*: every turn re-enters authorization (permission-contracts; milestone/task envelope §6).
  A resumed session carries no ambient authority from prior turns.
- OpenCode session identity is runtime-native and stays behind the adapter (CORE-004 §2.3).
  The canonical binding key is `(WorkflowRunId, Role, RuntimeSessionId)` owned by Vestara —
  never the external session id.

### 3.3 Explicit reconciliation: ephemeral present vs persistent future (not silent)

Current state is CORE-001 **R12**: AR turns create throwaway conversations with no session reuse —
an accepted limitation, not a durability rule. §0.2 records that **no frozen per-role
durability rule exists** (neither "Developer durable" nor "Planner/Reviewer ephemeral" is baselined
anywhere). Therefore:

- R12 is **explicitly superseded** by the role-session binding milestone (§8, CORE-006): the
  `triggerAssistantTurn` throwaway path migrates to binding lookup/resume. R12 remains quoted in
  CORE-001 history; it is not edited out.
- The genuinely open decision — **binding scope for each role** (assignment-, milestone-,
  WorkflowRun-, or program-scoped) — is a HOLD-gated decision inside CORE-006 (§8, HOLD-3):
  default recommendation is **WorkflowRun-scoped bindings per role**, retired at WorkflowRun
  terminal state; program-scoped persistence (cross-run memory) is explicitly deferred to avoid
  creating an ungoverned cross-authority memory. Reviewer/Planner are NOT second-class ephemeral
  by default; any role-specific narrowing must be justified in the CORE-006 decision record.

---

## 4. Independent Reviewer isolation

Developer and Reviewer MUST NOT share a runtime session — enforced at the binding layer
(separate `(WorkflowRunId, Role)` keys; a bind-or-resume request for Reviewer can never resolve to
the Developer session and vice versa; violation is a BLOCKER-class defect in verification).

Reviewer input is authoritative artifacts + diffs + evidence + bounded review context —
**never the Developer's private reasoning transcript**. The task envelope for review (§6) carries
pointers to artifacts and the frozen authorization boundary, not session transcripts.

Preserved: Implementation context ≠ Review context. Developer reasoning ≠ Review evidence.

Milestone ownership: binding isolation is acceptance criteria of CORE-006; the review-context
envelope shape is defined in the TaskInstruction contract (§6, owned by the workflow milestone line
v5.4/PCS-025 refinement, not by the runtime).

---

## 5. Stable role instructions + bounded task envelopes

Two instruction layers, separately owned and versioned:

- **RoleInstruction** — persistent behavior/governance per role (Developer, Reviewer, Planner…).
  Source of truth: `agents.registry.ts` + `.opencode/agents/vestara-*.md` (existing). Changes are
  governance-visible and versioned; they are bound to the runtime session at creation/resume, not
  re-transmitted per turn.
- **TaskInstruction** — the current authorized delta only: milestone/delta id, frozen boundaries,
  verification requirements, HOLD conditions, STOP condition. Owned by the workflow orchestrator
  per WorkflowTask; transmitted per execution; discarded at task terminal state.

Goal: continuity without re-sending the Vestara architecture every turn; bounded envelopes keep
each execution least-privilege and reviewable.

Milestone ownership: instruction-layering contract is specified in CORE-006 (binding carries
RoleInstruction reference + TaskInstruction payload); the agent-definition source of truth stays
with the workspace agents registry (no duplicate role-prompt store).

---

## 6. Vestara owns workflow state

Runtime agents execute bounded work; orchestration stays with Vestara. The governed lifecycle is
conceptually:

```text
PLANNED → AUTHORIZED → IMPLEMENTING → AWAITING_REVIEW → REVIEWING → VERIFIED/FROZEN
```

with rejection/remediation returning work to the appropriate existing role session
(Reviewer rejects → Developer session resumes with the review verdict as new bounded input;
Developer never inherits Reviewer context and vice versa, §4).

Milestone ownership: this lifecycle refines the **existing** workflow line (v5.3/v5.4,
PCS-025, `@vestara/workflow-orchestrator` PlanStatus/TaskStatus/ProjectPhase) — a mapping
refinement, not a new state machine. The lifecycle states are Vestara-owned; runtime sessions
observe them via envelopes, never transition them.

---

## 7. Observer remains background intelligence

Observer is NOT the Companion and is normally NOT a conversational participant.
It watches structured system events/evidence: executions, workflows, runtime sessions,
duplicate/concurrent executions, CI, verification, resource/runtime anomalies, stalled work,
governance violations.

Preserved: Observer observes ≠ Companion coordinates ≠ Agent executes. Observation ≠ Authority.
Observer findings project to Activity Room and are surfaced *by Companion*; the Observer never
routes turns, never authorizes, never executes.

Milestone ownership: `packages/observer` (existing) remains the finding-lifecycle owner;
projection of findings into AR is existing 001F-pattern work. No Observer→Companion merge;
any proposal to make Observer conversational is out of scope for this program.

---

## 8. Activity Room is the collaboration/projection surface

Activity Room presents human messages, Companion coordination, specialist activity, workflow
progress, Reviewer verdicts, Observer findings, and evidence/status projections — while
authoritative state remains with the owning runtime/domain (CORE-001 E.2 preserved verbatim).

Activity Room must not become workflow or execution authority: no transition, approval,
authorization, or verification may originate from a projection affordance. This directly constrains
§9 (reactions) and any future AR controls.

Milestone ownership: AR-UI / AR-GA-006/007 line owns presentation; every new projected element
(verdicts, findings, reactions) ships with an explicit authority label ("projection — not authority").

---

## 9. Message reactions (genuinely missing → new milestone AR-GA-009)

Conceptual contract (domain shape; persistence/projection design belongs to implementation):

```text
MessageReaction {
  messageId
  actorId
  emoji
  createdAt
}
```

- Humans, Companion, and appropriately authorized agents may react without generating a turn.
- Reactions are Activity Room events/projections (append-only, attributable, replayable through the
  existing M9→M10→M11 pipeline).
- **Reaction ≠ Approval. Reaction ≠ Authorization.** A ✅ from anyone — including Companion or a
  specialist — is a lightweight acknowledgement (👍 / 👀 / ✅), never a verification verdict,
  workflow transition, or authorization grant. Any consumer that treats a reaction as approval is
  in BLOCKER-class violation.
- Scope guard: bounded emoji set, rate limits, and no reaction-triggered execution (reactions never
  invoke turns) are implementation acceptance criteria, not protocol extensions.

---

## 10. Session lifecycle (requirements for CORE-006)

The role-session binding milestone must define, per binding:

creation (bind-or-resume, single-flight so concurrent turns cannot fork a role session) ·
lookup/resume (canonical `(WorkflowRunId, Role)` key; external session id never the key) ·
single-flight protection · repository/workspace binding (session bound to the authorized workspace;
workspace change retires the binding) · health (liveness/stall detection feeding Observer) ·
cancellation (Vestara-decided; CORE-004 §12 ownership preserved) · restart/reconciliation
(interrupted session ≠ dead workflow — CORE-003 §17 future pattern: workflow survives) ·
context-pressure rollover (replacement session inherits binding key + evidence lineage; the retired
session's artifacts persist by reference) · explicit retirement (terminal WorkflowRun, workspace
change, governance revocation — never silent GC while work is in flight).

Rollover preserves workflow continuity and evidence lineage under Vestara ownership; external
OpenCode session identity is never equated with canonical workflow identity.

---

## 11. Provider neutrality

OpenCode is the proof runtime, not the architecture. Role-session bindings, envelopes, lifecycle,
and AR projections are specified against `RuntimeExecutionPort` (CORE-004) — a second
`RuntimeExecutionPort` implementation must be adoptable without changing Activity Room or workflow
semantics. Any OpenCode-shaped leakage in the new contracts (session ids, model names, tool names
as canonical values) is a BLOCKER-class defect; the CORE-002 normalization precedent
(OpenCode tools → `'other'`) applies.

---

## 12. Roadmap delta — ownership, order, HOLDs, verification

### 12.1 Responsibility → owning milestone (no parallel program)

| # | Responsibility | Owner | New or refine? |
|---|---|---|---|
| 1 | Companion coordination identity; Assistant→Companion convergence + rename | AR-GA-008 (bridge scope) + GA-006 (convergence scope); rename executed in agents registry | **Refine** 008/GA-006 |
| 2 | @mention parse contract; DIRECT/COORDINATED/INFERRED attribution on one governance path | AR milestone line (AR-GA-006-adjacent); modes recorded as attribution, not code paths | **Refine** (parser contract new-within-existing) |
| 3 | Role-scoped session bindings + persistence-scope decision | **CORE-006** (new implementation milestone, §10 requirements) | **Genuinely missing** |
| 4 | Reviewer isolation + review-context envelope (artifacts/diffs/evidence, no transcripts) | CORE-006 (binding) + v5.4/PCS-025 refinement (envelope shape) | **Refine** + missing part in 006 |
| 5 | RoleInstruction/TaskInstruction layering | CORE-006 (binding carries refs); registry stays source of truth | **Genuinely missing** (contract) |
| 6 | PLANNED→…→VERIFIED/FROZEN mapping onto orchestrator states | v5.4 / PCS-025 refinement | **Refine** |
| 7 | Observer background role; findings → AR → Companion surfacing | Existing observer + 001F-pattern projection | **Refine** (no merge) |
| 8 | AR as projection-only surface; authority labels | AR-UI / 006/007 line | **Refine** |
| 9 | MessageReaction contract + projection + acknowledgement semantics | **AR-GA-009** (new) | **Genuinely missing** |
| 10 | Session lifecycle (10 requirements, §10) | CORE-006 | **Genuinely missing** |
| 11 | Port-neutrality of all new contracts | Cross-cutting acceptance on 006/009 | Constraint, not milestone |

### 12.2 Resulting sequence (dependencies)

```text
AR-GA-006 → AR-GA-007 → AR-GA-008[+Companion refinement] → AR-GA-009 (reactions)
CORE-005 (this refinement, planning) → CORE-006 (bindings+envelopes+lifecycle) → CORE-007 (Companion coordination + 3-mode attribution)
v5.4/PCS-025 lifecycle-mapping refinement ∥ CORE-006 (converge before CORE-007)
GA-006 rename item ∥ AR-GA-008 refinement
```

AR-GA-009 depends only on 006/007 (reaction projection needs message ingestion + context, not the
008 bridge). CORE-007 (Companion turn orchestration) depends on CORE-006 bindings existing.
Nothing here reorders frozen work; 006/007/008 and v5.4 prerequisites stand.

### 12.3 Ownership conflicts

**None requiring arbitration.** Companion logic lands on the existing ConversationService path
(CORE-001 E.2); sessions on conversation-runtime + opencode-runtime registries; workflow on the
orchestrator; findings on observer; projection on activity-room. The one boundary at risk —
AR acquiring authority via new affordances (§8, §9) — is constrained by explicit non-authority
rules, not by moving ownership.

### 12.4 HOLD conditions

- **HOLD-1:** No CORE-006 implementation until this refinement passes architecture review.
- **HOLD-2:** No Assistant→Companion rename until GA-006/AR-GA-008 refinement scope is accepted
  (single-registry rename; no parallel identity).
- **HOLD-3:** No cross-WorkflowRun (program-scoped) session persistence until a governed memory
  proposal exists — WorkflowRun-scoped default only (scope decision recorded in CORE-006).
- **HOLD-4:** No reaction rendering without the Reaction≠Approval/≠Authorization consumer rule
  enforced in verification.
- **HOLD-5:** Any new contract leaking OpenCode-native identity into canonical shape BLOCKS its
  milestone (provider-neutrality gate, §11).

### 12.5 Verification / evidence requirements (for implementation milestones)

- Binding tests: resume-vs-create, Developer≠Reviewer session separation (adversarial: Reviewer
  request must never resolve Developer's session), single-flight (concurrent turns → one session),
  re-authorization on resume (no ambient authority), rollover lineage preservation — all against
  `FakeRuntimeAdapter` first (CORE-004 precedent), then OpenCode proof path.
- Attribution tests: DIRECT/COORDINATED/INFERRED turns converge on one governance path
  (identical authorization treatment; mode recorded as attribution only).
- Reaction tests: reaction creates no turn, grants nothing, projects through M9→M11; consumer
  misuse probe (reaction-as-approval) must fail closed.
- Instruction tests: RoleInstruction stability across turns (no per-turn retransmit of full
  architecture); TaskInstruction bounded to the authorized delta with HOLD/STOP present.
- Docs: CORE-006 decision record for binding scope (§3.3); envelope schema; lifecycle map
  (orchestrator states ↔ PLANNED→…→VERIFIED/FROZEN).

---

*End of AR-GA-CORE-005 refinement. STOP for architecture review — no implementation authorized.
Frozen baselines CORE-001…004, AR-GA-005/006/007/008 definitions, and MILESTONES.md are unmodified
by this document.*

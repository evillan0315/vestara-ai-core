# Vestara Intelligence Platform — Development Plan

**Date:** 2026-08-30
**Status:** Planning Complete — GA-4 Added
**Architecture Review:** `docs/blueprint/VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md`
**Track:** VESTARA-INTELLIGENCE
**Authoritative Repository:** `vestara-ai-core`
**Phase Count:** 40 leaf phases (+1 GA-4)
**Milestone Count:** 9 milestones (M-B1 through M-B8 + M-B1.5)

---

## Part I — Phase Inventory

### Corrected Count

| Program | Phases | IDs |
|---------|--------|-----|
| A — Global Access | 5 | GA-0, GA-1, GA-2, GA-3, GA-4 |
| B — Observability | 5 | OBS-0, OBS-1, OBS-2, OBS-3, OBS-4 |
| C — Diagnostics | 5 | DIAG-0, DIAG-1, DIAG-2, DIAG-3, DIAG-4 |
| D — Context Intelligence | 11 | CTX-0 through CTX-10 |
| E — Engineering Autonomy | 7 | ENG-0 through ENG-6 |
| F — Learning & Efficiency | 7 | EFF-0 through EFF-6 |
| **Total** | **40** | |

The initial proposal stated "26 phases." This is a counting inconsistency. The canonical count is 39.

---

## Part II — Dependency Graph

```
M-B1 ─── Foundation & Access ──────────────────────────────────────────┐
│  GA-0, GA-1, GA-2, GA-3, DIAG-0                                     │
│                                                                      │
├──→ M-B1.5 ── Global Agent Identity ─────────────────────────────────┤
│    │  GA-4                                                           │
│    │                                                                 │
│    ├──→ M-B2 ─── Diagnostics & Observability Foundation ────────────┤
│    │  DIAG-1, DIAG-2, DIAG-3, DIAG-4, OBS-0, OBS-1, OBS-4          │
│    │                                                                 │
│    ├──→ M-B3 ─── Temporal Evidence & Findings ──────────────────────┤
│    │    │  OBS-2, OBS-3, CTX-0                                       │
│    │    │                                                            │
│    │    ├──→ M-B4 ─── Context Intelligence Core ────────────────────┤
│    │    │    │  CTX-1, CTX-2, CTX-4, CTX-5, CTX-6, CTX-7, CTX-9   │
│    │    │    │                                                       │
│    │    │    ├──→ M-B5 ─── Context Advanced + Preflight ────────────┤
│    │    │    │    │  CTX-3, CTX-8, CTX-10, ENG-0, ENG-2             │
│    │    │    │    │                                                  │
│    │    │    │    ├──→ M-B6 ─── Engineering Autonomy Core ──────────┤
│    │    │    │    │    │  ENG-1, ENG-3, ENG-4, ENG-5                │
│    │    │    │    │    │                                             │
│    │    │    │    │    ├──→ M-B7 ─── Recovery & Efficiency ─────────┤
│    │    │    │    │    │    │  ENG-6, EFF-0, EFF-1, EFF-2, EFF-3    │
│    │    │    │    │    │    │                                        │
│    │    │    │    │    │    └──→ M-B8 ─── Knowledge & Certification ┘
│    │    │    │    │    │         EFF-4, EFF-5, EFF-6, GA-ACCEPT-001
```

### Critical Path

```
DIAG-0 → DIAG-1 → OBS-1 → CTX-1 → CTX-2 → CTX-3 → ENG-0 → ENG-1 → ENG-4 → EFF-6
```

### Parallelization Opportunities

- M-B3 and M-B4 partially overlap (CTX-0 starts in M-B3, CTX-1 depends on CTX-0).
- M-B7 and M-B8 partially overlap (EFF-0 through EFF-3 can start before EFF-4 through EFF-6).
- Program A (Global Access) can proceed independently after GA-0.

---

## Part III — Milestone Definitions

---

### M-B1 — Foundation & Access

**ID:** VESTARA-INTELLIGENCE-MB1
**Title:** Foundation & Access
**Objective:** Establish responsibility invariant contracts, complete authority audit, extend Global Assistant access surface, and define diagnostic contracts.
**Phases:** 5 (GA-0, GA-1, GA-2, GA-3, DIAG-0)

#### Phase Detail

| Phase | Program | Title | What | Depends On |
|-------|---------|-------|------|-----------|
| GA-0 | A | Authority audit | Complete audit of all existing Vestara authorities. Produce authority map documenting ownership, data flow, and forbidden responsibilities for each domain. | None |
| GA-1 | A | Floating Assistant | Extend M12 Contextual Assistant to floating position in workspace UI. Surface diagnostic findings, observer alerts, and context results. | GA-0 |
| GA-2 | A | Independent conversation | Extend Conversation Authority to support Activity Room as a conversation surface. Conversation state remains with Conversation Authority. | GA-0 |
| GA-3 | A | Surface Context | Compose existing data sources (Engineering Graph, Activity Projection, Evidence) at API boundary for Global Assistant consumption. No new persistence. | GA-0 |
| DIAG-0 | C | Diagnostic contract | Define Vestara-runtime diagnostic contracts: `DiagnosticSnapshot`, `DiagnosticIncidentBundle`, `DiagnosticCorrelation`, `DiagnosticIncidentTimeline`. Distinguish from existing OS-level diagnostics in `collect.ts`. | None |

#### Acceptance Gates

| Gate | Criterion | Verification |
|------|-----------|-------------|
| G-MB1-1 | Authority audit document produced with ownership matrix | Document exists, covers all AR-P1.5 authorities + new intelligence authorities |
| G-MB1-2 | GA-0 authority map is consistent with AR-P1.5 §8 authority matrix | Cross-reference check |
| G-MB1-3 | Floating Assistant renders in Activity Room with diagnostic/contextual data | Component test + visual verification |
| G-MB1-4 | Independent conversation uses Conversation Authority (not new ingress) | Code review: no new persistence, no new authority |
| G-MB1-5 | Surface Context composes existing data sources at API boundary | API test: GET endpoint returns composed data |
| G-MB1-6 | Diagnostic contract types defined and documented | TypeScript types exist, documented in architecture review |
| G-MB1-7 | All existing tests pass | `pnpm lint:check && pnpm build && pnpm test` |
| G-MB1-8 | **GA-ACCEPT-SELF-MAINTENANCE-001 relevance:** GA-0 audit documents the authorities that were manually consulted during the M11C WASM incident | Audit document references incident |

**Canonical scenario checkpoint:** GA-0 authority audit must document which authorities were consulted during the M11C incident and what evidence was available vs manually reconstructed.

---

### M-B1.5 — Global Agent Identity

**ID:** VESTARA-INTELLIGENCE-MB1.5
**Title:** Global Agent Identity & Assistant Registration
**Objective:** Establish Global Agent as Vestara's cross-workspace agent identity type. Register `agent-assistant` as the canonical system-owned Global Agent. Define lifecycle, conversation provenance, and workspace invocation binding. Must not create a new execution authority.
**Phases:** 1 (GA-4)
**Depends On:** M-B1 (GA-0 authority audit, GA-3 Surface Context)
**Blocks:** Authoritative Global Assistant AI-policy/runtime binding (not unrelated M4 work)

#### Phase Detail

| Phase | Program | Title | What | Depends On |
|-------|---------|-------|------|-----------|
| GA-4 | A | Global Agent Identity | Define `AgentScope` (workspace/registry) and `AgentOrigin` (system/user). Register `agent-assistant` as canonical system-owned Global Agent with `agentType: 'registry'`. Define system-agent lifecycle (deletion protection, identity mutation protection). Evaluate Conversation provenance representation (candidate: `agentId` on Conversation, open through preflight). Define workspace invocation binding. Design AI policy integration point (`assistant-default`). Prove genericity with arbitrary Global Agent fixtures (user-created, registry-scoped). Preserve agent identity vs runtime-agent identity distinction. | GA-0, GA-3 |

#### Acceptance Gates

| Gate | Criterion | Verification |
|------|-----------|-------------|
| G-MB15-1 | `AgentScope` and `AgentOrigin` types defined | Type test: types exist with correct values |
| G-MB15-2 | `agent-assistant` registered exactly once | Test: `listAgents()` returns exactly one `agent-assistant` |
| G-MB15-3 | `agent-assistant` has `agentType: 'registry'`, `origin: 'system'` | Type test: fields correct |
| G-MB15-4 | System agent deletion is rejected | Test: `deleteAgent('agent-assistant')` throws/rejects |
| G-MB15-5 | System agent `id` mutation is rejected | Test: `saveAgent({ ...agent, id: 'changed' })` rejects for system agents |
| G-MB15-6 | `agent-assistant` has NO hardcoded provider/model | Code review: `provider` and `model` are `undefined` |
| G-MB15-7 | Conversation provenance representation evaluated | Design doc: candidate representations assessed against existing actor/participant contracts |
| G-MB15-8 | Conversation provenance does not route through Harness | Code review: no Harness/AgentRuntime imports in ConversationService |
| G-MB15-9 | Registration causes 0 AI execution | Test: register/load/list agent → 0 provider requests, 0 sessions, 0 tool calls |
| G-MB15-10 | Genericity demonstrated by arbitrary Global Agent fixtures | Test: create user-created registry-scoped agent with `agentType: 'registry'`, `origin: 'user'`. NOT by registering `agent-observer` (conceptual candidate only, owned by future Observer milestone). |
| G-MB15-11 | Arbitrary Global Agent (user-created, registry scope) works | Test: create agent with `agentType: 'registry'`, `origin: 'user'` |
| G-MB15-12 | Existing workspace agents unchanged | Test: all 5 canonical workspace agents still function |
| G-MB15-13 | Activity Room participant model permits `agent-assistant` | Code review: `participantId` pattern works for registry agents |
| G-MB15-14 | AI policy integration point defined (type/interface only) | Type test: `assistant-default` policy type exists |
| G-MB15-15 | Agent identity vs runtime-agent identity preserved | Code review: no runtime identity created for `agent-assistant` in GA-4 |
| G-MB15-16 | All existing tests pass | `pnpm lint:check && pnpm build && pnpm test` |

#### Named Invariants

| ID | Invariant |
|----|-----------|
| GA-I1 | Global availability does not confer global authority. |
| GA-I2 | Registration establishes identity, not execution. |
| GA-I3 | Agent identity does not own provider credentials or transport. |
| GA-I4 | Global identity becomes workspace-scoped at invocation. |
| GA-I5 | System-agent behavior derives from policy, not frontend hardcoding. |

#### Slice Breakdown

| Slice | What | Evidence |
|-------|------|----------|
| GA-4.0 | Authority & existing-state audit | Audit document |
| GA-4.1 | `AgentScope`, `AgentOrigin` types | Type tests |
| GA-4.2 | `agent-assistant` registration + bootstrap | Registration tests |
| GA-4.3 | System-agent lifecycle (deletion/mutation protection) | Lifecycle tests |
| GA-4.4 | Conversation provenance evaluation | Design doc + type tests |
| GA-4.5 | AI policy integration type | Type tests |
| GA-4.6 | Genericity tests (arbitrary agents, fixtures) | Genericity tests |
| GA-4.7 | Non-execution verification | Zero-execution tests |

#### Relationship to Other Milestones

- **Extends M-B1:** GA-4 follows GA-0 (authority audit) and GA-3 (Surface Context). M-B1 phases are accepted and frozen; GA-4 does not modify them.
- **Blocks Assistant AI Configuration:** GA-4 establishes identity; AI Configuration resolves provider/model/transport for the Assistant specifically.
- **Does NOT block unrelated M4 work:** Provider catalog, credential management, routing infrastructure may proceed independently.
- **Independent from M-B2–M-B8:** Programs B–F do not depend on Global Agent identity.
- **Independent from Harness:** GA-4 does not modify AgentHarnessRuntime or agent execution.

---

### M-B2 — Diagnostics & Observability Foundation

**ID:** VESTARA-INTELLIGENCE-MB2
**Title:** Diagnostics & Observability Foundation
**Objective:** Build deterministic fact collection (Diagnostics) and event-driven awareness (Observer). Establish the unidirectional data flow: sources → Diagnostics → Observer.
**Phases:** 7 (DIAG-1, DIAG-2, DIAG-3, DIAG-4, OBS-0, OBS-1, OBS-4)

#### Phase Detail

| Phase | Program | Title | What | Depends On |
|-------|---------|-------|------|-----------|
| DIAG-1 | C | Snapshot | Collect Vestara runtime diagnostic snapshots: process health, memory, WASM state, SQLite store health, event loop status. Extends existing `collect.ts` with Vestara-specific metrics. | DIAG-0 |
| DIAG-2 | C | Bundle | Create `DiagnosticIncidentBundle` type: incident-scoped collection of snapshots, correlated events, evidence bundle references, hypothesis placeholder. References (not contains) `VerificationEvidenceBundle`. | DIAG-0 |
| DIAG-3 | C | Correlation | Add incident-scoped correlation to engineering event store. Link related events to incident IDs. | DIAG-0 |
| DIAG-4 | C | Incident timeline | Build incident timeline: ordered sequence of diagnostic events for a given incident. Query API for time-sliced incident history. | DIAG-3 |
| OBS-0 | B | Evidence topology | Extend PCS-026 Evidence Provenance with topology relationships: which evidence references which other evidence, temporal ordering, causal chains. | None |
| OBS-1 | B | Observer foundation | New Observer authority: subscribe to diagnostic output via EventBus, produce `ObserverFinding` records, store in `observer_findings` table. Read-only to all authority stores. | DIAG-1, DIAG-2 |
| OBS-4 | B | Health/degradation model | Build runtime degradation model: track metric trends over time, detect threshold crossings, produce degradation signals. | DIAG-1, OBS-1 |

#### Acceptance Gates

| Gate | Criterion | Verification |
|------|-----------|-------------|
| G-MB2-1 | Diagnostic snapshots collect Vestara runtime state (not just OS metrics) | Snapshot test: returns process, memory, WASM, SQLite, event loop data |
| G-MB2-2 | DiagnosticIncidentBundle references (not contains) evidence bundles | Type test: `evidenceBundleRefs` is FK array, not embedded bytes |
| G-MB2-3 | Incident correlation links related events to incident IDs | Correlation test: query by incidentId returns linked events |
| G-MB2-4 | Incident timeline returns ordered diagnostic events for an incident | Timeline test: time-sliced query returns correct ordering |
| G-MB2-5 | Observer subscribes to diagnostic output via EventBus | Integration test: Observer receives diagnostic events |
| G-MB2-6 | Observer findings stored in `observer_findings` table | Persistence test: write, restart, read back |
| G-MB2-7 | Observer does NOT write to any authority store | Code review: no writes to Workflow, Routing, Activity, Conversation stores |
| G-MB2-8 | Health model detects degradation from diagnostic metrics | Test: inject metric degradation, verify signal produced |
| G-MB2-9 | Unidirectional data flow verified: sources → Diagnostics → Observer | Code review + integration test |
| G-MB2-10 | All existing tests pass | `pnpm lint:check && pnpm build && pnpm test` |
| G-MB2-11 | **GA-ACCEPT-SELF-MAINTENANCE-001 relevance:** DIAG-1 snapshots would have captured the sql.js WASM memory state that was manually reconstructed during the incident | Scenario walkthrough: identify what DIAG-1 collects that was missing during incident |

---

### M-B3 — Temporal Evidence & Findings

**ID:** VESTARA-INTELLIGENCE-MB3
**Title:** Temporal Evidence & Findings
**Objective:** Build time-indexed evidence retrieval, analytical findings production, and evidence reference extensions for context retrieval.
**Phases:** 3 (OBS-2, OBS-3, CTX-0)

#### Phase Detail

| Phase | Program | Title | What | Depends On |
|-------|---------|-------|------|-----------|
| OBS-2 | B | Temporal evidence | Time-sliced evidence retrieval: given a time range, return evidence references with provenance. Distinct from Activity Room timeline (different query model, different data). | DIAG-4, OBS-0 |
| OBS-3 | B | Findings | Observer produces `ObserverFinding` records: analytical observations derived from diagnostic facts. Each finding references source evidence, carries confidence score, has lifecycle status (observation → hypothesis → diagnosis). | OBS-1 |
| CTX-0 | D | Evidence references | Extend PCS-026 EvidenceReference with context-relevance metadata: ranking score hint, budget allocation class, freshness indicator, source authority reference. | OBS-0 |

#### Acceptance Gates

| Gate | Criterion | Verification |
|------|-----------|-------------|
| G-MB3-1 | Temporal evidence returns time-sliced evidence for a given range | Test: query with time range, verify correct results |
| G-MB3-2 | Temporal evidence is distinct from Activity Room timeline | Type test: different query model, different output format |
| G-MB3-3 | Observer findings reference diagnostic facts (not duplicate them) | Code review: findings contain references, not copies |
| G-MB3-4 | Finding lifecycle supports observation → hypothesis → diagnosis transitions | State machine test |
| G-MB3-5 | CTX-0 evidence references include freshness and provenance | Type test: new fields present |
| G-MB3-6 | All existing tests pass | `pnpm lint:check && pnpm build && pnpm test` |
| G-MB3-7 | **GA-ACCEPT-SELF-MAINTENANCE-001 relevance:** OBS-2 temporal evidence would have returned the M9 state at incident time, showing 14 records intact | Scenario walkthrough: query temporal evidence at incident time |

---

### M-B4 — Context Intelligence Core

**ID:** VESTARA-INTELLIGENCE-MB4
**Title:** Context Intelligence Core
**Objective:** Build hybrid retrieval, context budgeting, ranking, minimum sufficient context assembly, provenance tracking, and change-aware retrieval.
**Phases:** 7 (CTX-1, CTX-2, CTX-4, CTX-5, CTX-6, CTX-7, CTX-9)

#### Phase Detail

| Phase | Program | Title | What | Depends On |
|-------|---------|-------|------|-----------|
| CTX-1 | D | Retrieval foundation | Core retrieval API: `retrieveContext(query) → ContextResult[]`. Interfaces for source adapters (Engineering Graph, Evidence, Diagnostics, Observer). | CTX-0, OBS-3 |
| CTX-2 | D | Hybrid retrieval | Implement retrieval across multiple sources: structured lookup (exact ID), Engineering Graph traversal, evidence provenance chains, Observer findings. NOT semantic/vector retrieval yet (deferred to post-M-B4 if needed). | CTX-1, Engineering Graph |
| CTX-4 | D | Context budgets | Token budget enforcement for context windows. Input token limits per retrieval query. Composes with existing Execution Policy token budgets. | CTX-1 |
| CTX-5 | D | Ranking | Score relevance of retrieval results. Ranking is advisory — does not influence Routing selection. | CTX-2 |
| CTX-6 | D | Minimum sufficient context | Enforce CTX-4 budgets + CTX-5 ranking to produce minimal sufficient context. Stop retrieval when budget exhausted or ranking threshold met. | CTX-4, CTX-5 |
| CTX-7 | D | Provenance | Track provenance for all context results: source authority, freshness, confidence, evidence references. | CTX-0 |
| CTX-9 | D | Change-aware retrieval | Add change-detection to graph traversal: given a diff or commit, retrieve context about what changed. | CTX-2, Engineering Graph |

#### Acceptance Gates

| Gate | Criterion | Verification |
|------|-----------|-------------|
| G-MB4-1 | Retrieval API returns results from multiple sources | Test: query returns results from Engineering Graph + Evidence + Diagnostics |
| G-MB4-2 | Structured lookup resolves exact IDs | Test: query by ID returns correct result |
| G-MB4-3 | Engineering Graph traversal returns graph-connected context | Test: query traverses relationships |
| G-MB4-4 | Context budgets enforce token limits | Test: query exceeding budget returns truncated results |
| G-MB4-5 | Ranking produces relevance scores | Test: results are ordered by relevance |
| G-MB4-6 | Minimum sufficient context respects budgets and ranking | Test: result set is minimal and relevant |
| G-MB4-7 | Provenance tracks source authority and freshness | Test: each result has provenance metadata |
| G-MB4-8 | Change-aware retrieval returns context for diffs | Test: given a diff, returns relevant context |
| G-MB4-9 | Context Intelligence does NOT call Routing, Workflow, or Governance | Code review: no imports or calls to authority stores |
| G-MB4-10 | All existing tests pass | `pnpm lint:check && pnpm build && pnpm test` |
| G-MB4-11 | **GA-ACCEPT-SELF-MAINTENANCE-001 relevance:** CTX-2 hybrid retrieval would have surfaced M9 database state + WASM health + event loop starvation evidence in a single query | Scenario walkthrough: construct query that would have returned relevant context |

---

### M-B5 — Context Intelligence Advanced + Developer Preflight

**ID:** VESTARA-INTELLIGENCE-MB5
**Title:** Context Intelligence Advanced + Developer Preflight
**Objective:** Build context orchestration, compression, historical incident retrieval, developer preflight, and resource budgets.
**Phases:** 5 (CTX-3, CTX-8, CTX-10, ENG-0, ENG-2)

#### Phase Detail

| Phase | Program | Title | What | Depends On |
|-------|---------|-------|------|-----------|
| CTX-3 | D | Context Assembler | Sequence retrieval across multiple sources, apply ranking and budgets, produce assembled context package. Renamed from "Context Orchestrator" to avoid confusion with Workflow Orchestrator. | CTX-6 |
| CTX-8 | D | Compression | Produce evidence-referencing summaries. Summaries reference original evidence bundles; they do not replace them. Lossy summaries must never replace authoritative evidence (INV-EVD-1). | CTX-6, CTX-7 |
| CTX-10 | D | Historical incident retrieval | Query diagnostic incident timeline for historical incidents. Returns incident knowledge with provenance and status. | DIAG-4, CTX-2 |
| ENG-0 | E | Developer preflight | Assemble context before agent execution: relevant code, evidence, incidents, graph relationships. Consumes CTX-3 output. | CTX-3 |
| ENG-2 | E | Resource budgets | Investigation-specific budgets: time limits, token limits, tool call limits for adaptive investigation. Composes with existing Execution Policy (ARX-015 §6). | CTX-4 |

#### Acceptance Gates

| Gate | Criterion | Verification |
|------|-----------|-------------|
| G-MB5-1 | Context Assembler sequences retrieval across sources | Test: assembler queries multiple sources in correct order |
| G-MB5-2 | Compression produces summaries that reference evidence (not replace) | Type test: summary contains `evidenceRefs[]`, not embedded bytes |
| G-MB5-3 | Historical incident retrieval returns incidents with provenance/status | Test: query returns incident with `status` and `confidence` fields |
| G-MB5-4 | Historical retrieval exposes hypothesis vs diagnosis distinction | Test: unverified hypotheses returned with `status: 'hypothesis'`, not `'diagnosis'` |
| G-MB5-5 | Developer preflight assembles context before execution | Integration test: preflight produces context package |
| G-MB5-6 | Resource budgets compose with existing Execution Policy | Test: budget limits are enforced alongside policy |
| G-MB5-7 | All existing tests pass | `pnpm lint:check && pnpm build && pnpm test` |
| G-MB5-8 | **GA-ACCEPT-SELF-MAINTENANCE-001 relevance:** ENG-0 preflight would have surfaced: (a) sql.js WASM degradation signals, (b) M9 database integrity status, (c) event loop starvation evidence, (d) similar historical incidents (if any) | Scenario walkthrough: construct preflight that surfaces incident-relevant context |

---

### M-B6 — Engineering Autonomy Core

**ID:** VESTARA-INTELLIGENCE-MB6
**Title:** Engineering Autonomy Core
**Objective:** Build adaptive investigation, governed escalation, correction proposal/preparation, and verification extension.
**Phases:** 4 (ENG-1, ENG-3, ENG-4, ENG-5)

#### Phase Detail

| Phase | Program | Title | What | Depends On |
|-------|---------|-------|------|-----------|
| ENG-1 | E | Adaptive investigation | Agent-directed evidence gathering. Reads Context Intelligence output, Observer findings, Diagnostics facts. Produces investigation records with evidence references. Read-only to authority stores. | ENG-0, OBS-3, CTX-3 |
| ENG-3 | E | Governed escalation | Agent-initiated request for broader authority. Uses existing Approval system (Workflow Authority). Escalation is a request, not a grant. | ENG-1, Approval system |
| ENG-4 | E | Correction proposal/preparation | Propose corrections to Workflow/Governance authority. Produces correction proposals (not direct mutations). Renamed from "Correction" to prevent semantic ambiguity with mutation authority. All mutations continue through existing Workflow/Governance authority. | ENG-1, ENG-3 |
| ENG-5 | E | Verification extension | Extend EvidencePipeline with adaptive verification: agent-directed verification runs that consume correction proposals and produce verification evidence. Complements existing orchestrator-directed verification. | ENG-1, EvidencePipeline |

#### Acceptance Gates

| Gate | Criterion | Verification |
|------|-----------|-------------|
| G-MB6-1 | Adaptive investigation reads from Context Intelligence, Observer, Diagnostics | Integration test: investigation consumes all three sources |
| G-MB6-2 | Adaptive investigation does NOT write to authority stores | Code review: no writes to Workflow, Routing, Activity, Conversation |
| G-MB6-3 | Investigation records have evidence references and confidence | Type test: investigation record contains `evidenceRefs[]` and `confidence` |
| G-MB6-4 | Governed escalation uses existing Approval system | Integration test: escalation produces approval request |
| G-MB6-5 | Escalation is a request, not a grant | Test: escalation does not automatically grant authority |
| G-MB6-6 | Correction proposal is submitted to Workflow/Governance (not direct mutation) | Code review: ENG-4 calls approval/workflow API, not task mutation directly |
| G-MB6-7 | Correction proposal contains: target, proposed change, evidence, confidence | Type test |
| G-MB6-8 | Verification extension produces verification evidence for corrections | Integration test: correction → verification → evidence bundle |
| G-MB6-9 | All existing tests pass | `pnpm lint:check && pnpm build && pnpm test` |
| G-MB6-10 | **GA-ACCEPT-SELF-MAINTENANCE-001 relevance:** ENG-4 would have proposed "restart API process" as a correction. ENG-5 would have verified: (a) restart restores endpoints, (b) M9 data preserved, (c) root cause remains indeterminate | Scenario walkthrough: construct correction proposal for restart |

---

### M-B7 — Recovery & Efficiency

**ID:** VESTARA-INTELLIGENCE-MB7
**Title:** Recovery & Efficiency
**Objective:** Build operational recovery, time/token analytics, and context/investigation efficiency measurement.
**Phases:** 5 (ENG-6, EFF-0, EFF-1, EFF-2, EFF-3)

#### Phase Detail

| Phase | Program | Title | What | Depends On |
|-------|---------|-------|------|-----------|
| ENG-6 | E | Operational recovery | Diagnostic-driven recovery selection. Uses existing Workflow resume/retry. Recovery may proceed without root-cause completion (INV-REC-1). Recovery actions are governed by existing Workflow/Governance authorities. | ENG-4, Workflow resume/retry |
| EFF-0 | F | Time analytics | Measure: time to detection, time to useful context, time to recovery, time to root cause, time to verified recovery. Read-only metrics. | ENG-1 |
| EFF-1 | F | Token analytics | Measure: discovery tokens, reasoning tokens, correction tokens, verification tokens. Reads from Token Budget data. | ENG-2 |
| EFF-2 | F | Context efficiency | Measure: context utilization ratio (tokens used / tokens available), relevance score distribution, budget exhaustion rate. | CTX-6 |
| EFF-3 | F | Investigation efficiency | Measure: investigation cost (tokens, time, tool calls) vs outcome (evidence produced, corrections proposed). | ENG-1 |

#### Acceptance Gates

| Gate | Criterion | Verification |
|------|-----------|-------------|
| G-MB7-1 | Operational recovery uses Workflow resume/retry (not new authority) | Code review: recovery calls existing orchestrator APIs |
| G-MB7-2 | Recovery proceeds without root-cause completion | Test: recovery succeeds when root cause is `indeterminate` |
| G-MB7-3 | Recovery actions are governed (not automatic) | Test: recovery requires approval for high-risk actions |
| G-MB7-4 | Time analytics measure all five time dimensions | Test: metrics include detection, context, recovery, root cause, verified recovery times |
| G-MB7-5 | Token analytics measure all four token dimensions | Test: metrics include discovery, reasoning, correction, verification tokens |
| G-MB7-6 | Context efficiency metrics are produced | Test: utilization ratio and relevance scores computed |
| G-MB7-7 | Investigation efficiency metrics are produced | Test: cost vs outcome ratio computed |
| G-MB7-8 | All efficiency metrics are advisory (not executive) | Code review: no metric triggers automatic action |
| G-MB7-9 | All existing tests pass | `pnpm lint:check && pnpm build && pnpm test` |
| G-MB7-10 | **GA-ACCEPT-SELF-MAINTENANCE-001 relevance:** EFF-0 would have measured: time to detection (~20h), time to useful context (manual reconstruction time), time to recovery (restart ~90s), time to root cause (indeterminate). EFF-1 would have measured: discovery tokens (manual investigation), reasoning tokens (analysis). ENG-6 would have selected "restart" as known safe recovery | Scenario walkthrough: compute metrics for the incident |

---

### M-B8 — Knowledge, Prediction & Certification

**ID:** VESTARA-INTELLIGENCE-MB8
**Title:** Knowledge, Prediction & Certification
**Objective:** Build incident knowledge accumulation, predictive health, and self-maintenance certification. Replay GA-ACCEPT-SELF-MAINTENANCE-001 as canonical end-to-end validation.
**Phases:** 4 (EFF-4, EFF-5, EFF-6, GA-ACCEPT-SELF-MAINTENANCE-001 scenario validation)

#### Phase Detail

| Phase | Program | Title | What | Depends On |
|-------|---------|-------|------|-----------|
| EFF-4 | F | Incident knowledge | Accumulate incident knowledge from diagnostic history. Lifecycle: observation → hypothesis → diagnosis → correction → verification → recovery → certified knowledge. Unverified hypotheses never become facts (INV-IK-1). | DIAG-4, EFF-0 |
| EFF-5 | F | Predictive health | Predictive models based on Observer findings: detect degradation trends, forecast incidents, recommend proactive actions. Advisory, not executive. | OBS-3, OBS-4 |
| EFF-6 | F | Self-maintenance certification | Validate the full loop: detect → diagnose → investigate → correct → verify → recover → learn. Certification scenario replays GA-ACCEPT-SELF-MAINTENANCE-001. | ENG-5, EFF-4 |
| — | — | **GA-ACCEPT-SELF-MAINTENANCE-001** scenario validation | End-to-end replay of the M11C WASM incident using the intelligence platform. Prove that the platform would have: (a) detected the degradation automatically, (b) collected diagnostic evidence, (c) assembled relevant context, (d) proposed recovery, (e) verified recovery, (f) accumulated incident knowledge. | EFF-6 |

#### Acceptance Gates

| Gate | Criterion | Verification |
|------|-----------|-------------|
| G-MB8-1 | Incident knowledge records have lifecycle status | Test: records transition through observation → hypothesis → diagnosis → certified |
| G-MB8-2 | Unverified hypotheses are exposed as hypotheses, not facts | Test: historical retrieval returns `status: 'hypothesis'` for unverified records |
| G-MB8-3 | Predictive health detects degradation trends | Test: inject trend data, verify prediction produced |
| G-MB8-4 | Predictive health is advisory (not executive) | Code review: no automatic actions triggered |
| G-MB8-5 | Self-maintenance certification validates full loop | Integration test: detect → diagnose → investigate → correct → verify → recover → learn |
| G-MB8-6 | **GA-ACCEPT-SELF-MAINTENANCE-001 complete replay:** | |
| G-MB8-6a | — Detection: Diagnostics collects WASM memory state automatically | Test: DIAG-1 snapshot includes WASM memory metrics |
| G-MB8-6b | — Diagnosis: Observer produces finding with evidence | Test: OBS-3 finding references DIAG snapshot |
| G-MB8-6c | — Context: Context Intelligence assembles relevant context | Test: CTX returns M9 state + WASM health + event loop status |
| G-MB8-6d | — Recovery: ENG-6 selects "restart" as known safe recovery | Test: recovery proposal matches restart action |
| G-MB8-6e | — Verification: ENG-5 verifies restart restores availability | Test: verification confirms endpoints restored, M9 preserved |
| G-MB8-6f | — Knowledge: EFF-4 accumulates incident record with status 'recovered' | Test: incident knowledge record exists with correct lifecycle status |
| G-MB8-6g | — Efficiency: EFF-0/1 metrics computed for the incident | Test: time and token metrics are non-zero |
| G-MB8-7 | Root cause remains `indeterminate` in the scenario (as in reality) | Test: incident knowledge record has `rootCause: 'indeterminate'` |
| G-MB8-8 | All existing tests pass | `pnpm lint:check && pnpm build && pnpm test` |

---

## Part IV — First Implementation Tranche

| Order | Milestone | Why First |
|-------|-----------|-----------|
| 1 | M-B1 — Foundation & Access | No dependencies. Authority audit is prerequisite for all other programs. |
| 2 | M-B2 — Diagnostics & Observability | Foundation for all intelligence capabilities. Establishes unidirectional data flow. |
| 3 | M-B3 — Temporal Evidence & Findings | Extends evidence model. Produces findings for Context Intelligence. |
| 4 | M-B4 — Context Intelligence Core | Core retrieval capability. Foundation for Engineering Autonomy. |

**Checkpoint after M-B4:** Review milestone boundaries. Verify authority invariants hold. Verify degraded-mode behavior. Verify GA-ACCEPT-SELF-MAINTENANCE-001 relevance at each gate.

---

## Part V — Non-Goals (Preserved from Architecture Review)

1. Do not rewrite Activity Room projection pipeline.
2. Do not rewrite Workflow Orchestrator.
3. Do not rewrite Agent domain.
4. Do not create parallel routing authority.
5. Do not allow Context Intelligence to own conversation state.
6. Do not duplicate telemetry collection in Observer.
7. Do not allow Observer findings to become source authority.
8. Do not allow unverified diagnoses to become historical knowledge.
9. Do not prematurely define optimization formulas.
10. Do not create vector database as sole retrieval mechanism.
11. Do not allow lossy summaries to replace authoritative evidence.
12. Do not conflate recovery with root-cause determination.

---

## Part VI — Rejected Alternatives (Preserved from Architecture Review)

See Architecture Review §16 for full list. Key rejections:

- Single monolithic intelligence service
- Observer as sole telemetry collector
- Context Intelligence as routing input
- Vector database as sole retrieval
- Context Intelligence as conversation authority
- ENG-4 as independent mutation authority
- Historical knowledge from unverified diagnoses
- Recovery requiring root-cause completion
- Efficiency optimization without measurement
- Placing this track under ARX-015

---

## Part VII — Implementation Progression

Sequential, one milestone at a time. No concurrent implementation.

```
M-B1 → verify/evidence → accept →
M-B1.5 → verify/evidence → accept →
M-B2 → verify/evidence → accept →
M-B3 → verify/evidence → accept →
M-B4 → integration checkpoint →
M-B5 → verify/evidence → accept →
M-B6 → verify/evidence → accept →
M-B7 → verify/evidence → accept →
M-B8 → final certification →
VESTARA-INTELLIGENCE COMPLETE
```

**Hermetic verification:** Ordinary unit/integration tests must remain hermetic. No real OpenCode sessions. No paid/live AI providers unless a test is explicitly classified as `live`.

---

*This Development Plan is a planning document. No production code was changed. All decisions are based on the Vestara Intelligence Architecture Review and source inspection of vestara-ai-core.*

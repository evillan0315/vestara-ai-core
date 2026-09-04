---
title: Vestara Intelligence Platform — Architecture Review
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Vestara Intelligence Platform — Architecture Review

**Date:** 2026-08-30
**Status:** Architecture Documentation — Accepted with UID Resolutions (frozen pending commit)
**Track:** VESTARA-INTELLIGENCE (cross-cutting platform capability)
**Predecessor:** ARX-015B Reconciliation Proposal
**Scope:** Architectural decisions, authority boundaries, responsibility invariants. No implementation. No code changes.
**Repository:** `vestara-ai-core` is the authoritative implementation target.

---

## 0. Track Naming Recommendation

**Recommended name: `VESTARA-INTELLIGENCE`**

Rationale:
- This track is cross-cutting platform intelligence: access, awareness, evidence, relevance, reasoning support, and efficiency measurement.
- It is not incident-derived (the M11C WASM incident was the catalyst, not the scope).
- It is not Activity Room-specific — Activity Room and Global Assistant are consumers.
- The name reflects the central objective: delivering minimum sufficient, highest-value evidence to the right reasoning capability at the right time.

**Rejected alternatives:**
- `ARX-015B` — ties the track to ARX-015 (Activity Room stabilization), which is incorrect scoping.
- `VESTARA-OBSERVABILITY` — too narrow; covers only Programs B and C.
- `VESTARA-CONTEXT` — too narrow; covers only Program D.
- `VESTARA-AI-INTELLIGENCE` — implies this is about AI model capabilities; it is about platform intelligence infrastructure.

---

## 1. Central Architecture Objective

> **Vestara should deliver the minimum sufficient, highest-value evidence to the right reasoning capability at the right time.**

---

## 2. Central Efficiency Principle

> **Vestara should not ask an AI model to discover information that Vestara can observe, correlate, retrieve and prove deterministically.**

---

## 3. Seven Responsibility Invariants

These invariants define the seven responsibilities of the Vestara Intelligence Platform. Each responsibility has a single owner, a single data flow direction, and explicit forbidden responsibilities.

| # | Responsibility | Owner | Purpose | Forbidden |
|---|---------------|-------|---------|-----------|
| **RI-1** | Assistant provides access | Global Assistant (extends M12) | User-facing access surface for intelligence capabilities | Must not own workflow, routing, governance, or evidence authority |
| **RI-2** | Observer provides awareness | Observer | Event-driven analysis and pattern detection over diagnostic output | Must not collect telemetry (Diagnostics owns collection). Must not own any authority store. Read-only. |
| **RI-3** | Diagnostics provides evidence | Diagnostics | Deterministic fact collection: snapshots, metrics, event correlation, incident timelines | Must not perform analysis (Observer owns analysis). Must not own workflow, routing, or governance state |
| **RI-4** | Context Intelligence provides relevance | Context Intelligence | Minimum sufficient context to the right reasoning capability | Must not own routing, execution, mutation, or authorization authority |
| **RI-5** | Workflow provides orchestration | Workflow Authority (existing, AR-P1.5 §4.3) | Task dispatch, approval, lifecycle | Already frozen. Intelligence Platform consumes, does not override. |
| **RI-6** | Agents perform bounded reasoning | Agent Harness + Runtime Session Authority (existing, AR-P1.5 §4.4) | Agent execution within policy boundaries | Already frozen. Intelligence Platform provides context, does not execute. |
| **RI-7** | Governance provides authority | Execution Policy + Permission architecture (existing, ARX-015 §6) | Authorization, permissions, policy enforcement | Already frozen. Intelligence Platform reads policy, does not set it. |

**Additional invariant:** Verification remains the authority for engineering acceptance and must not be subsumed by any of the seven responsibilities above.

---

## 4. Context Authority Invariants (New)

**INV-CTX-1:** Context relevance does not confer routing, execution, mutation, or authorization authority.

Context Intelligence selects and retrieves relevant evidence. Existing Routing, Workflow, Governance, and Verification authorities remain unchanged. Context output is consumed by agents (RI-6) and humans (via Activity Room / Global Assistant). Context output is never a direct input to Routing selection, Workflow mutation, or Governance enforcement.

**INV-CTX-2:** Cache validity cannot extend source-evidence validity.

Context cache reuse must respect source authority, freshness, scope, permissions, and relevant evidence/revision identity. A cached context result is valid only while its underlying source evidence remains valid. Cache TTL is a performance optimization, not a freshness guarantee.

**INV-CTX-3:** Context invalidation does not imply immediate context injection.

Observer cannot inject arbitrary context into agents. Material evidence changes may invalidate context dependencies. Context Intelligence/Orchestrator owns context-package validity and bounded refresh decisions. Refresh occurs at safe reasoning boundaries rather than continuously mutating an active model context. Agents may independently request additional evidence when unresolved uncertainty is discovered during reasoning. Refresh must remain budget-aware.

Context Intelligence owns relevance and validity of assembled context; reasoning consumers own interpretation and requests for additional uncertainty-reducing evidence.

---

## 5. Context Intelligence / Conversation Authority Boundary

### 5.1 Separation of Concerns

Three distinct concepts must be modeled separately:

| Concept | Owner | Scope | Contract |
|---------|-------|-------|----------|
| **Source Authority** | Various (Workflow, Evidence, Diagnostics, Engineering Graph) | The original data source | Each source owns its data, lifecycle, and write path |
| **Retrieval Consumer** | Various (Conversation Authority, Context Intelligence, agents, humans) | Who requests and uses context | Each consumer defines its own query model and usage pattern |
| **Context Query Model** | Context Intelligence | How context requests are structured and fulfilled | Bounded, reusable query capabilities that serve multiple consumers |

### 5.2 Conversation Authority Boundary

- **Conversation Authority** continues to own conversation state, history, continuity, and message lifecycle (AR-P1.5 §4.1).
- **Context Intelligence** must not become conversation authority. It must not own conversation state, message history, or conversation lifecycle.
- Context Intelligence provides reusable bounded context/query capabilities that may serve Conversation Authority as one consumer among many.

### 5.3 Context Intelligence Scope

Context Intelligence provides:
- Structured lookup (exact ID resolution, graph traversal)
- Semantic retrieval (similarity search over evidence/code)
- Historical incident retrieval (diagnostic timeline queries)
- Change-aware retrieval (diff-based context assembly)
- Ranking and budget enforcement
- Provenance tracking for all context results

Context Intelligence does NOT provide:
- Conversation state management
- Provider/model selection (Routing Authority)
- Task execution or lifecycle (Workflow Authority)
- Authorization or permission enforcement (Governance)

### 5.4 Consumers

```
Source Authorities                    Retrieval Consumers
┌─────────────────────┐              ┌──────────────────────────┐
│ Workflow Authority  │              │ Conversation Authority   │
│ Evidence Pipeline   │──retrieve──→│ Agent Harness            │
│ Diagnostics         │              │ Global Assistant         │
│ Engineering Graph   │              │ Engineering Investigations│
│ Activity Projection │              │ Future consumers         │
└─────────────────────┘              └──────────────────────────┘
                       ↑
              ┌────────┴────────┐
              │Context Intelligence│
              │ (query/rank/budget)│
              └─────────────────┘
```

---

## 6. Diagnostics / Observer Boundary

### 6.1 Data Flow (Single Direction)

```
Authoritative Sources/Telemetry → Diagnostics → Observer → Context Intelligence → Agents/Humans
         (collect)                  (analyze)      (retrieve)      (consume)
```

**Invariant:** Diagnostics collects facts. Observer analyzes facts. The flow is unidirectional. Observer never writes to Diagnostics.

### 6.2 Diagnostics Responsibility

- Collects deterministic facts: runtime snapshots, metrics, event correlation
- Owns incident diagnostic bundles
- Owns incident timelines
- Provides temporal evidence retrieval
- Does NOT perform pattern analysis, hypothesis generation, or degradation prediction

### 6.3 Observer Responsibility

- Subscribes to diagnostic output (read-only)
- Produces findings (analytical observations)
- Detects patterns and degradation trends
- Tracks health degradation models
- Findings are derived evidence/analysis and never become source authority
- Does NOT collect telemetry, own incident bundles, or own incident timelines

### 6.4 Invariant

**INV-OBS-1:** Observer findings are derived evidence/analysis and never become source authority. They reference diagnostic facts; they do not contain or duplicate them.

---

## 7. Canonical Scenario: GA-ACCEPT-SELF-MAINTENANCE-001

This scenario is preserved as the first canonical self-maintenance/efficiency validation. It is referenced throughout milestone acceptance, not deferred to final certification.

### 7.1 Scenario

The M11C WASM incident (2026-08-30): sql.js WASM `RuntimeError: memory access out of bounds` after ~20h uptime.

### 7.2 Demonstrated Results

1. **User-visible 0 records did not represent authoritative M9 state** — persisted M9 data remained intact (14 records, max sequence 14, sequence continuity preserved).
2. **Long-running runtime instance degraded while ordinary fresh-instance tests remained green** — root cause indeterminate after recovery.
3. **API restart restored availability** — all 7 endpoints returned HTTP 200, WS upgrade 101 subscribed, frontier=14.
4. **Recovery and root-cause investigation were separate concerns** — restart restored service while root cause remained unknown.
5. **Developer spent substantial investigation effort reconstructing evidence** — future Observer/Diagnostics should already possess this evidence.
6. **Continued speculative investigation was not economically justified** without new evidence.

### 7.3 Use Throughout Milestones

- **M-B2:** Diagnostics must collect the facts that were manually reconstructed during this incident.
- **M-B3:** Temporal evidence must support the time-sliced queries that would have expedited investigation.
- **M-B5:** Developer preflight must surface diagnostic context that was missing during the incident.
- **M-B7:** Operational recovery must support restart-as-recovery without requiring root-cause completion.
- **M-B8:** Final end-to-end certification replays the full scenario.

### 7.4 Recovery vs Root-Cause Distinction

**INV-REC-1:** Service recovery and root-cause determination are separate workflows.

- A known safe recovery (API restart) may restore availability while root cause remains indeterminate.
- Continued investigation after recovery requires new evidence, policy justification, or explicit authorization.
- Recovery actions are governed by existing Workflow/Governance authorities. Investigation is a read-only intelligence activity.

---

## 8. Historical Incident Knowledge Lifecycle

### 8.1 Lifecycle Stages

| Stage | Authority | Status | Trust Level | Can Become Knowledge? |
|-------|-----------|--------|-------------|----------------------|
| **Observation** | Diagnostics | Raw fact collected | Unverified | No — requires analysis |
| **Hypothesis** | Observer | Analytical inference from observations | Unverified | No — requires verification |
| **Diagnosis** | Observer (verified) | Confirmed root cause with evidence | Verified | Yes — when verification passes |
| **Correction** | ENG-4 (proposal) | Proposed fix submitted to Workflow/Governance | Proposed | No — requires approval + verification |
| **Verification** | EvidencePipeline | Correction verified against evidence | Verified | Partial — correction verified, not necessarily root cause |
| **Operational Recovery** | ENG-6 | Service restored via governed action | Operational | No — availability restored, root cause may remain unknown |
| **Certified Incident Knowledge** | Verification Authority | Full lifecycle complete: observation → diagnosis → correction → verification | Certified | Yes — historical retrieval exposes provenance/status |

### 8.2 Invariant

**INV-IK-1:** Unverified agent diagnoses must not become trusted historical incident knowledge. Historical retrieval must expose provenance and status so hypotheses cannot silently become facts.

### 8.3 Provenance Exposure

Every incident knowledge record must expose:
- `status: 'observation' | 'hypothesis' | 'diagnosis' | 'correction-proposed' | 'correction-verified' | 'recovered' | 'certified' | 'indeterminate'`
- `confidence: number` (0–1)
- `evidenceRefs: string[]` (FK to evidence bundles)
- `sourceAuthority: string` (which component produced this record)
- `verifiedBy?: string` (which verification run confirmed this)
- `supersedes?: string` (if this record corrects an earlier one)
- `certificationProvenance?: { verifiedBy: string, operationalRecoveryEvidenceRefs: string[], certifiedAt: string }` (when status is `certified` — links to verification and operational-recovery evidence)
- `rootCauseStatus: 'identified' | 'indeterminate' | 'partial'` (explicit status of root-cause determination)

Historical retrieval may return unresolved/indeterminate incidents. Their lifecycle and evidentiary status must remain explicit. An incident with `rootCauseStatus: 'indeterminate'` and `status: 'recovered'` is a valid record — availability was restored while root cause remained unknown.

---

## 9. Evidence / Provenance Model

### 9.1 Existing Foundation (Frozen)

PCS-026 defines `VerificationEvidenceBundle`, `EvidenceReference`, and `EvidenceProvenance`. These contracts are frozen and authoritative for verification evidence.

### 9.2 Extensions (New)

| Extension | Purpose | Consumed By |
|-----------|---------|-------------|
| **Incident Diagnostic Bundle** | Diagnostic-scoped evidence collection (snapshots, correlated events, hypothesis) | Observer, Context Intelligence, Historical Retrieval |
| **Context Reference** | Evidence reference with context-relevance metadata (ranking score, budget allocation) | Context Intelligence consumers |
| **Finding Reference** | Observer finding with provenance chain back to diagnostic facts | Context Intelligence, Historical Retrieval |

### 9.3 Invariant

**INV-EVD-1:** Retrieval results must preserve source authority, freshness, provenance, confidence, correlation, and evidence references. Lossy summaries must never replace authoritative evidence.

Freshness is defined by evidence class, not universal TTL. Evidence freshness dimensions:
- **Temporal freshness:** time since evidence was produced (seconds for runtime metrics, hours for build evidence, days for code changes)
- **Revision freshness:** evidence tied to a specific revision/commit; stale if source has since changed
- **Authority freshness:** evidence from a source that has since been updated or corrected
- **Scope freshness:** evidence relevant to a specific scope (file, module, workspace); stale if scope has changed
- **Lifecycle freshness:** evidence from a lifecycle stage that has since advanced (e.g., task status changed from `in-progress` to `completed`)

Retrieval results flag freshness violations rather than silently dropping stale evidence. Consumers decide whether to use, refresh, or discard stale results.

### 9.4 Dependency Order

Authoritative Evidence Reference/Provenance contracts must exist (M-B2/M-B3) before semantic/hybrid retrieval becomes foundational (M-B4). Retrieval is a consumer of evidence, not a producer.

---

## 10. Efficiency Measurement Model

### 10.1 Resource Dimensions

| Dimension | Type | Description |
|-----------|------|-------------|
| **Time** | User/economic | Wall-clock duration of engineering activities |
| **Tokens** | User/economic | AI model token consumption (discovery, reasoning, correction, verification) |
| **Compute** | Infrastructure | Runtime sessions, CPU, memory, storage |
| **Human Attention** | Cognitive | Developer interventions, context switches, review time |
| **Operational Risk** | Governance | Potential for incorrect action, data loss, service degradation |

### 10.2 Measurement Boundaries

| Metric | Start Event | End Event | Dimension |
|--------|------------|-----------|-----------|
| Time to detection | Incident occurs | Observer/Diagnostics produces first finding | Time |
| Time to useful context | Finding produced | Context Intelligence delivers relevant context to agent | Time |
| Time to recovery | Incident occurs | Service availability restored | Time |
| Time to root cause | Incident occurs | Verified diagnosis produced | Time |
| Time to verified recovery | Incident occurs | Recovery verified + certified | Time |
| Discovery tokens | Context query initiated | Context results returned | Tokens |
| Reasoning tokens | Agent reasoning begins | Agent reasoning completes | Tokens |
| Correction tokens | Correction proposal initiated | Correction verified | Tokens |
| Verification tokens | Verification run initiated | Verification complete | Tokens |
| Tool calls/retries | Investigation begins | Investigation complete | Compute |
| Runtime sessions/compute | Session created | Session destroyed | Compute |
| Human interventions | Developer attention required | Developer action complete | Human Attention |

### 10.3 Invariant

**INV-EFF-1:** Optimization formulas are not defined prematurely. Measurement boundaries are established first. Optimization is advisory (Observer/Context Intelligence output), not executive (Workflow/Routing authority).

---

## 11. Program Summaries

### Program A — Global Access (4 phases)

Provides user-facing access to intelligence capabilities. Extends M12 (Contextual Assistant) with floating position and broader context. Establishes authority audit as prerequisite for all other programs.

### Program B — Observability (5 phases)

Event-driven awareness through authorized telemetry subscriptions. Observer foundation subscribes to diagnostic output, produces findings, detects patterns, tracks degradation. Read-only initially.

### Program C — Diagnostics (5 phases)

Deterministic fact collection: runtime snapshots, incident diagnostic bundles, event correlation, incident timelines. Foundation for Observer analysis and Context Intelligence retrieval.

### Program D — Context Intelligence (11 phases)

Hybrid retrieval, ranking, budgeting, and context assembly. Provides minimum sufficient context to reasoning capabilities. Extends existing evidence/Engineering Graph infrastructure.

### Program E — Engineering Autonomy (7 phases)

Adaptive investigation, governed escalation, correction proposals, verification extension, and operational recovery. Consumes context from Program D, produces corrections through existing Workflow/Governance authority.

### Program F — Learning & Efficiency (7 phases)

Time/token analytics, context/investigation efficiency, incident knowledge accumulation, predictive health, and self-measurement certification. Advisory outputs, not executive authority.

---

## 12. Authority / Ownership Matrix

| Domain Fact | Authority | Store | Emits | Consumed By | Must NOT Be Written By |
|-------------|-----------|-------|-------|-------------|----------------------|
| Conversation state/history | Conversation Authority (AR-P1.5 §4.1) | `conversations.db` | `conversation.*` | Context Intelligence (as consumer) | Observer, Diagnostics, Context Intelligence |
| Routing selection/model | Routing Authority (AR-P1.5 §4.2) | `routing.json` | `routing.*` | Runtime Session | Context Intelligence, Observer |
| Workflow phase/task | Workflow Authority (AR-P1.5 §4.3) | `plans.db` | `project.*`, `task.*` | Activity Projection, evidence | Context Intelligence, Observer |
| Thread/turn lifecycle | Runtime Session Authority (AR-P1.5 §4.4) | `agent-harness.db` | `harness.*` | Activity, evidence | Context Intelligence, Observer |
| Activity history | Activity Projection (AR-P1.5 §4.5, derived) | `activity.db` | `activity.*` | UI, Context Intelligence | Workflow, Conversation, Routing |
| Evidence bundles | EvidencePipeline (PCS-026) | `evidence/` CAS | `harness.verification-bundle` | Activity `evidenceRefs`, Context Intelligence | Observer, Diagnostics |
| Diagnostic facts | Diagnostics (RI-3) | `diagnostic_incidents` | `diagnostic.*` | Observer, Context Intelligence, Historical Retrieval | Observer (no write), Workflow, Routing |
| Observer findings | Observer (RI-2) | `observer_findings` | `observer.finding.*` | Context Intelligence, EFF-5 | Diagnostics (no write), Workflow, Routing |
| Context results | Context Intelligence (RI-4) | `context_cache` (derived) | `context.assembled` | Agents, Global Assistant, Investigations | Routing, Workflow, Governance |
| Efficiency metrics | EFF program | `efficiency_metrics` | `efficiency.*` | Observer, Global Assistant | Workflow, Routing, Governance |
| Incident knowledge | Verification Authority (certified) | `incident_knowledge` | `incident.certified` | Historical Retrieval, EFF-4 | Observer (hypotheses not knowledge) |

---

## 13. Dependency Graph

```
Program A (Global Access)                  Program B (Observability)
  GA-0 Authority audit ─────────────┐        OBS-0 Evidence topology ─────────┐
  GA-1 Floating Assistant           │        OBS-1 Observer foundation ───┐   │
  GA-2 Independent conversation     │        OBS-2 Temporal evidence ──┐ │   │
  GA-3 Surface Context              │        OBS-3 Findings ────────┐ │ │   │
                                    │        OBS-4 Health model ──┐ │ │ │   │
                                    │                            │ │ │ │   │
                                    │  Program C (Diagnostics)   │ │ │ │   │
                                    │    DIAG-0 Contract ─────┐  │ │ │ │   │
                                    │    DIAG-1 Snapshot ────┐│  │ │ │ │   │
                                    │    DIAG-2 Bundle ────┐ ││  │ │ │ │   │
                                    │    DIAG-3 Correl ──┐ │ ││  │ │ │ │   │
                                    │    DIAG-4 Timeline  │ │ ││  │ │ │ │   │
                                    │                     ▼ ▼ ▼▼  ▼ ▼ ▼ ▼   │
                                    │           OBS-1 reads DIAG output      │
                                    │           OBS-2 reads DIAG timeline     │
                                    │           OBS-3 reads OBS-1 findings    │
                                    │           OBS-4 reads DIAG health       │
                                    │                    │                    │
                                    │  Program D (Context Intelligence)      │
                                    │    CTX-0 Evidence refs ────────────┐   │
                                    │    CTX-1 Retrieval foundation ──┐ │   │
                                    │    CTX-2 Hybrid retrieval ────┐ │ │   │
                                    │    CTX-3 Context Assembler ┐  │ │ │   │
                                    │    CTX-4 Context budgets ┐ │  │ │ │   │
                                    │    CTX-5 Ranking ──────┐ │ │  │ │ │   │
                                    │    CTX-6 Min suff ────┐│ │ │  │ │ │   │
                                    │    CTX-7 Provenance ─┐ ││ │ │  │ │ │   │
                                    │    CTX-8 Compression  │ ││ │ │  │ │ │   │
                                    │    CTX-9 Change-aware │ ││ │ │  │ │ │   │
                                    │    CTX-10 Historical  │ ││ │ │  │ │ │   │
                                    │                       ▼ ▼ ▼ ▼  ▼ ▼ ▼   │
                                    │          CTX reads: Eng Graph, Evidence,│
                                    │          Diagnostics, Observer findings  │
                                    │                    │                    │
                                    │  Program E (Engineering Autonomy)      │
                                    │    ENG-0 Preflight ── reads CTX output │
                                    │    ENG-1 Investigation ── reads CTX+OBS│
                                    │    ENG-2 Budgets ── extends Exec Policy │
                                    │    ENG-3 Escalation ── uses Approval   │
                                    │    ENG-4 Correction Prep ── proposes to │
                                    │    ENG-5 Verification ── extends Evid  │
                                    │    ENG-6 Recovery ── uses WF resume    │
                                    │                    │                    │
                                    │  Program F (Learning & Efficiency)     │
                                    │    EFF-0 Time analytics                │
                                    │    EFF-1 Token analytics               │
                                    │    EFF-2 Context efficiency            │
                                    │    EFF-3 Investigation efficiency      │
                                    │    EFF-4 Incident knowledge            │
                                    │    EFF-5 Predictive health             │
                                    │    EFF-6 Self-maint certification      │
                                    └────────────────────────────────────────┘
```

### Critical Path (Longest Dependency Chain)

```
DIAG-0 → DIAG-1 → OBS-1 → CTX-1 → CTX-2 → CTX-3 → ENG-0 → ENG-1 → ENG-4 → EFF-6
```

**Note:** GA-0 (authority audit) is a documentation/prerequisite activity, not a technical dependency for the critical path. Programs B, C, D, E, F do not depend on Global Assistant or Activity Room being operational.

---

## 14. Degraded-Mode Dependency Model

| Component Failure | Impact | Operational Fallback | Data Flow |
|-------------------|--------|---------------------|-----------|
| **Context Intelligence** unavailable | Agents lose contextual guidance | Agents fall back to deterministic telemetry (Diagnostics output) + manual investigation | Diagnostics → Agents (direct) |
| **Observer** unavailable | No pattern detection or degradation tracking | Diagnostics continues collecting. Findings stop. Manual monitoring required. | Diagnostics → (halted) |
| **Diagnostics** unavailable | No fact collection for Observer or Context Intelligence | Observer has no input. Context Intelligence has no diagnostic context. Agent investigation is blind. **Critical dependency.** | (halted) → (halted) |
| **Engineering Autonomy** unavailable | No adaptive investigation or correction | Manual governance. Existing Workflow approval gates continue. | Workflow → Agents (manual) |
| **Observer + Diagnostics** unavailable | System operates without intelligence layer | Existing Activity Room + Workflow continue normally. No intelligence augmentation. | (halted) → (halted) |
| **Context Intelligence + Observer** unavailable | No context or awareness | Agents operate on manual investigation + existing Workflow. No proactive intelligence. | Diagnostics → Agents (direct) |

### Degraded-Mode Invariant

**INV-DM-1:** Global Assistant, Activity Room, Workflow, Routing, and Governance must continue operating when any combination of Observer, Diagnostics, or Context Intelligence is unavailable. Intelligence capabilities degrade; core engineering capabilities do not.

### Critical Path Independence

Programs B (Observability), C (Diagnostics), D (Context Intelligence), E (Engineering Autonomy), and F (Learning & Efficiency) do not depend on Global Assistant (Program A) or Activity Room being operational. Global Assistant consumes intelligence capabilities; it does not provide them. The intelligence critical path runs through Diagnostics → Observer → Context Intelligence → Engineering Autonomy.

---

## 15. Explicit Non-Goals

1. **Do not rewrite Activity Room projection pipeline.** It is production-quality (AR-P1.5 §4.5).
2. **Do not rewrite Workflow Orchestrator.** It is mature and well-tested (AR-P1.5 §4.3).
3. **Do not rewrite Agent domain.** It has correct separation of concerns (AR-P1.5 §4.4).
4. **Do not create parallel routing authority.** Context Intelligence provides input to agents, not to Routing.
5. **Do not allow Context Intelligence to own conversation state.** Conversation Authority remains sole writer.
6. **Do not duplicate telemetry collection in Observer.** Diagnostics owns collection; Observer owns analysis.
7. **Do not allow Observer findings to become source authority.** Findings are derived analysis, never original facts.
8. **Do not allow unverified diagnoses to become historical knowledge.** Knowledge requires verification.
9. **Do not prematurely define optimization formulas.** Establish measurement first; optimize with evidence.
10. **Do not create vector database as sole retrieval mechanism.** Retrieval must be hybrid: structured, graph, semantic, historical, change-aware.
11. **Do not allow lossy summaries to replace authoritative evidence.** Summaries reference evidence; they do not replace it.
12. **Do not conflate recovery with root-cause determination.** They are separate workflows with separate authorization.

---

## 16. Rejected Alternatives

| Alternative | Rejection Reason |
|-------------|-----------------|
| Single monolithic intelligence service | Violates responsibility invariants. Each responsibility has distinct data flow, authority, and forbidden scope. |
| Observer as sole telemetry collector | Duplicates Diagnostics responsibility. Observer analyzes; Diagnostics collects. |
| Context Intelligence as routing input | Context relevance must not confer routing authority (INV-CTX-1). Context is consumed by agents, not by Routing. |
| Vector database as sole retrieval | Too narrow. Retrieval must be hybrid: structured, graph, semantic, historical, change-aware. |
| Context Intelligence as conversation authority | Violates Conversation Authority boundary (§5.2). Context is a query capability, not conversation state. |
| ENG-4 as independent mutation authority | Violates Workflow Authority boundary. Correction is proposal/preparation; mutation requires Workflow/Governance approval. |
| Historical knowledge from unverified diagnoses | Violates INV-IK-1. Hypotheses cannot silently become facts. |
| Recovery requiring root-cause completion | Violates INV-REC-1. Known safe recovery proceeds independently of root-cause investigation. |
| Efficiency optimization without measurement | Violates INV-EFF-1. Measurement boundaries established first; optimization is evidence-based. |
| Agents solely decide context refresh | Violates INV-CTX-3. Context Intelligence owns validity and bounded refresh; agents own interpretation and additional evidence requests. |
| Placing this track under ARX-015 | Incorrect scoping. ARX-015 is Activity Room stabilization. This is cross-cutting platform intelligence. |

---

## 17. Cross-References to Frozen Authorities

| Authority | Document | Status | This Track's Relationship |
|-----------|----------|--------|--------------------------|
| ARX-015 Architecture Review | `docs/activity-room/arx-015-architecture-review.md` | Frozen (Rev 2) | Consumed. Identity, event, policy, routing, session, workflow invariants are constraints. |
| ARX-015 Development Plan | `docs/activity-room/arx-015-development-plan.md` | Frozen (Rev 2) | Consumed. M1–M17 milestones are prerequisites or parallel work. |
| AR-REC Governed Decisions | `docs/activity-room/arx-015-recommendation-governed-decisions-milestone.md` | Approved, frozen | Consumed. REC-GOV-01 through REC-GOV-10 are hard constraints. |
| AR-P1.5 Authority Contracts | `docs/AR-P1.5-AUTHORITY-CONTRACTS.md` | Proposed (AR-P2 pending) | Consumed. Authority boundaries I-1 through I-6 are hard constraints. |
| PCS-026 Evidence Protocol | `packages/evidence/src/types.ts` | Frozen | Extended. Evidence bundles and provenance are foundation for DIAG-2, CTX-0, CTX-7. |
| Engineering Graph | `packages/engineering-graph/` | Active | Consumed. Graph traversal is foundation for CTX-2, CTX-9. |
| M12 Contextual Assistant | ARX-015 M12 (planned) | Planned | Extended by GA-1. Global Assistant extends M12 scope. |

---

## 18. Global Agent Identity — GA-4 Architecture

### 18.1 Objective

Establish Global Agent as Vestara's cross-workspace agent identity type and establish `agent-assistant` as the canonical system-owned Global Agent representing the Global Assistant.

**Canonical distinction:**

```
Global Agent     = identity + cross-workspace availability
Workspace Context = invocation scope
AI Configuration  = provider + model resolution
Governance        = permissions + capability authority
Runtime Adapter   = execution mechanism
```

**Primary invariant:** Global availability does not confer global authority.

### 18.2 Existing Contract Evidence

| Contract | Location | Current State |
|----------|----------|---------------|
| `AgentType` | `packages/workspace/src/types.ts:593` | `'workspace' \| 'registry'` — `registry` defined but unused |
| `AgentDefinition` | `packages/workspace/src/types.ts:595-615` | Has `agentType`, `provider`, `model`, `runtimeAgent`, `role`, `status` |
| `AgentStorage` | `packages/workspace/src/agent-storage.ts` | CRUD on `agents` table. Seeds `CANONICAL_AGENTS` when empty. |
| Canonical agents | `packages/workspace/src/agents.registry.ts` | 5 agents, all `agentType: 'workspace'`. No `registry` agents. |
| Conversation types | `packages/shared/src/conversation-types.ts` | No `agentId` field. Conversations are user-scoped. |
| Activity Room participant | `apps/api/src/routes/activity-room-m11a.ts:601` | `participantId = agent-${agent.id}` pattern |
| Agent execution resolution | `apps/api/src/workspace-context.ts:1580-1639` | Resolves by `id`, `runtimeAgent`, or `role` |

### 18.3 Scope vs Origin (Orthogonal Concepts)

```
AgentScope (existing AgentType)
├── workspace    — workspace-scoped availability
└── registry     — cross-workspace availability

AgentOrigin (new field)
├── system       — canonical Vestara-owned identity
├── user         — user-created identity
└── marketplace  — future (external marketplace agents)
```

**Semantic:** `scope ≠ ownership/origin`. A registry-scoped agent can be system-owned or user-owned. A workspace-scoped agent is always user-owned (or system-seeded workspace agents).

### 18.4 Canonical Vestara Assistant Identity

```typescript
{
  id: 'agent-assistant',       // canonical AgentDefinition.id (not runtime identity)
  name: 'Vestara Assistant',
  agentType: 'registry',      // cross-workspace availability
  origin: 'system',           // Vestara-owned canonical identity
  role: 'assistant',          // new role value
  status: 'active',
  capabilities: ['conversation', 'context-access', 'surface-context'],
  provider: undefined,        // resolved through AI Configuration + M4
  model: undefined,           // resolved through AI Configuration + M4
  runtimeAgent: undefined,    // reserved — do not create runtime identity prematurely
}
```

**Identity vs runtime-agent distinction:**

```
AgentDefinition.id    runtimeAgent
agent-developer   →   vestara-developer
agent-planner     →   vestara-planner
agent-assistant   →   (reserved, not created in GA-4)
```

Vestara agent identity and runtime-agent identity are separate authorities. GA-4 establishes the canonical agent identity (`agent-assistant`). A runtime representation (`vestara-assistant`) may later be created if an authorized runtime capability requires one. Do not create a runtime identity merely because the Assistant becomes a Global Agent.

**Explicitly NOT hardcoded:**
- `provider = opencode`
- `model = mimo-v2.5-free`
- API credentials
- `transport = runtime`

**Integration point:** `assistant-default` AI policy whose effective provider/model/transport is resolved through AI Configuration + M4.

### 18.5 System-Agent Lifecycle

| Property | Behavior | Derivation |
|----------|----------|------------|
| Deletion protection | System agents cannot be deleted | `origin === 'system'` → `deleteAgent()` rejects |
| Identity mutation | System agent `id` cannot change | `origin === 'system'` → `id` field immutable |
| Scope mutation | Scope can change (workspace ↔ registry) | Allowed with migration |
| Disable/enable | Allowed | `updateAgentStatus()` works for system agents |
| User-configurable fields | `color`, `status`, `capabilities` (additive) | Policy-defined subset |
| Bootstrap/reconciliation | Deterministic seeding when missing | `seedBuiltIn()` pattern extended |

**Invariant:** System-agent behavior derives from policy, not frontend hardcoding.

### 18.6 Conversation Identity

**Design question:** How do ordinary Global Assistant conversations reference `agent-assistant` for canonical identity/provenance while remaining owned by ConversationService?

**Candidate representation (not frozen):**

```typescript
// packages/shared/src/conversation-types.ts
interface Conversation {
  // ... existing fields ...
  agentId?: string;           // optional, references AgentDefinition.id
}
```

**Open through implementation preflight:** GA-4 must establish canonical Assistant provenance while evaluating whether the existing actor/participant identity contracts (Activity Room `ParticipantProjection`, `ActivityActor`) provide a more general representation. Do not broaden GA-4 into a Conversation redesign.

**Ownership invariant:** Conversation remains ConversationService-owned. Any provenance reference establishes identity, not execution authority.

```
ConversationService
  ↓ owns
Conversation
  ↓ references (provenance only)
agent-assistant (Global Agent identity)
  ↓ does NOT route through
AgentRuntime / Harness
```

**Explicitly rejected:**
```
Conversation → agent-assistant → AgentRuntime → Harness
```

Registration establishes identity, not execution.

### 18.7 Workspace Invocation Binding

A Global Agent becomes bounded when invoked:

```
agent-assistant
      ↓ invocation
      ├── workspaceId         (which workspace)
      ├── conversationId      (which conversation)
      ├── principal/human     (who invoked)
      ├── Surface Context     (what context is available)
      └── effective permissions (what is allowed)
```

**Invariant:** A Global Agent is globally available; its invocation is not globally authorized.

### 18.8 AI Policy Integration Boundary

```
agent-assistant
      ↓
assistant-default (AI policy reference)
      ↓
AI Configuration (M4)
      ↓
ResolvedAiBinding
      ↓
runtime/provider execution
```

**GA-4 establishes the identity.** The AI Configuration milestone resolves provider/model/transport. GA-4 must not create another routing authority.

### 18.9 Registration Non-Execution Invariant

Creating, registering, loading, or listing Global Agents causes:
- 0 WorkflowRuns
- 0 Harness executions
- 0 provider requests
- 0 OpenCode runtime sessions
- 0 tool executions

Reading/listing Global Agents must not initialize expensive execution infrastructure.

### 18.10 Canonical Bootstrap

| State | Behavior |
|-------|----------|
| Missing canonical identity | Create deterministically |
| Already correct | No-op |
| User-configurable state | Preserve according to policy |
| Incompatible identity | Explicit migration/conflict |

**Invariant:** No unconditional boot-time overwrite.

### 18.11 Genericity Analysis

The Global Agent mechanism must support arbitrary agents beyond `agent-assistant`:

- `agent-assistant` — canonical system assistant (production)
- `agent-observer` — **genericity fixture/conceptual candidate only.** NOT registered, bootstrapped, or persisted in GA-4. Observer identity remains owned by its future authorized implementation milestone.
- User-created workspace agents — existing behavior preserved
- Future marketplace agents — scope=registry, origin=marketplace

**GA-4 genericity evidence:** Must include arbitrary Global Agent fixtures (user-created, registry-scoped) so genericity is NOT demonstrated solely by another Vestara system-agent concept.

**Test:** If the mechanism only works for `agent-assistant`, it is insufficiently generic.

### 18.12 Activity Room Compatibility

The same canonical `agent-assistant` identity can later appear as an Activity Room participant without creating a second identity:

```typescript
// Activity Room participant
{
  participantId: 'agent-agent-assistant',  // follows existing pattern: agent-${agent.id}
  type: 'agent',
  displayName: 'Vestara Assistant',
  role: 'assistant',
  // ... membership, presence, workState
}
```

No Activity Room integration in GA-4. Prove the identity model permits it.

### 18.13 Named Invariants

| ID | Invariant | Scope |
|----|-----------|-------|
| **GA-I1** | Global availability does not confer global authority. | GA-4 universal |
| **GA-I2** | Registration establishes identity, not execution. | GA-4 universal |
| **GA-I3** | Agent identity does not own provider credentials or transport. | GA-4 + AI Configuration boundary |
| **GA-I4** | Global identity becomes workspace-scoped at invocation. | GA-4.7 |
| **GA-I5** | System-agent behavior derives from policy, not frontend hardcoding. | GA-4.4 |

### 18.14 Dependency on Future Milestones

```
M-B1 [FROZEN]
      ↓
M-B1.5 Global Agent Identity (GA-4)
      ↓
Assistant AI Configuration / M4 binding
      ↓
runtime-backed Assistant execution
```

**M-B1.5 blocks:** Authoritative Global Assistant AI-policy/runtime binding. The Assistant cannot receive provider/model/transport configuration until its identity is established.

**M-B1.5 does NOT block:** Unrelated M4 work (provider catalog, credential management, routing infrastructure) that does not depend on Assistant identity.

**GA-4 does NOT implement:**
- Provider/model resolution (AI Configuration milestone)
- Conversation → runtime transport (OpenCode runtime reconciliation)
- Direct Zen quarantine (provider/runtime concern)

**GA-4 establishes:**
- Identity model for `agent-assistant`
- Registration and lifecycle semantics
- Conversation provenance reference (representation open through preflight)
- Workspace invocation binding
- AI policy integration point

---

## 19. Unresolved Architectural Decisions

| ID | Question | Options | Recommendation | Blocks |
|----|----------|---------|---------------|--------|
| **UID-1** | Where does `observer_findings` table live? | (A) New `observer.db` (B) In `diagnostic_incidents` table | **DEFERRED** — Observer owns lifecycle of derived `ObserverFinding` records, never underlying telemetry/evidence. Findings retain references to authoritative evidence. Physical persistence to be determined during M-B2 preflight from lifecycle, concurrency, durability, query, and existing-store compatibility requirements. Do not select store solely for architectural separation. | OBS-3 |
| **UID-2** | Where does `context_cache` table live? | (A) New `context.db` (B) In-memory with TTL (C) Shared with evidence CAS | **RESOLVED: B** — In-memory with TTL as initial derived cache. See INV-CTX-2 for cache invariants. | CTX-3 |
| **UID-3** | Where does `incident_knowledge` table live? | (A) New `knowledge.db` (B) In `diagnostic_incidents` with certification status | **RESOLVED: B** — Extend `diagnostic_incidents` if ownership/schema reconciliation confirms compatibility. Certification must carry provenance to verification and operational-recovery evidence. Do not represent certification as an unsupported boolean. Historical retrieval may return unresolved/indeterminate incidents; their lifecycle/evidentiary status must remain explicit. | EFF-6 |
| **UID-4** | How does Context Intelligence handle stale evidence? | (A) TTL-based expiry (B) Source-authority freshness check (C) Both | **RESOLVED: C (refined)** — Freshness defined by evidence class, not universal TTL. Model temporal, revision, authority, scope, and lifecycle freshness where applicable. See INV-EVD-1 (refined). | CTX-5 |
| **UID-5** | Does Observer findings trigger Context Intelligence re-retrieval? | (A) Push: Observer emits event → CTX re-retrieves (B) Pull: CTX polls Observer findings (C) Neither: agents decide | **RESOLVED: Hybrid (replaces C)** — Observer cannot inject arbitrary context into agents. Material evidence changes may invalidate context dependencies. Context Intelligence/Orchestrator owns context-package validity and bounded refresh decisions. Refresh occurs at safe reasoning boundaries. Agents may independently request additional evidence when unresolved uncertainty is discovered. Refresh must remain budget-aware. See INV-CTX-3. | OBS-3, CTX-3 |

---

> **Architecture review complete. No production code, schema, persistence, API, UI, agent, workflow, provider/model, retrieval/vector DB, Observer, Diagnostics, or runtime behavior changes are authorized.**

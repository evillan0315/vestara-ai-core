# ARX-015B — Global Access, Observability & Intelligence Architecture Reconciliation

**Date:** 2026-08-30
**Status:** SUPERSEDED — Non-authoritative. Canonicalized into VESTARA-INTELLIGENCE architecture documents. Preserved for historical evidence only.
**Superseded By:** `docs/blueprint/VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md`, `docs/blueprint/VESTARA-INTELLIGENCE-DEVELOPMENT-PLAN.md`
**Input:** 6-Program Architecture Proposal (received from live Activity Room incident analysis)
**Reconciled Against:** ARX-015 M1–M17, AR-REC R0–R13, AR-P1.5 Authority Contracts, Activity Room ownership, M4/M5/M7/Workflow/Verification authorities, existing diagnostics/telemetry, Engineering Graph, Agent/Team authority, permission/governance architecture, canonical human ingress
**Purpose:** Reconciliation, authority collision resolution, corrected phase count, canonical structure, and implementation sequence proposal

---

## 0. Phase Count Discrepancy Report

The input proposal states "26 phases." Actual leaf-phase count by program:

| Program | Phases | IDs |
|---------|--------|-----|
| A — Global Access | 4 | GA-0, GA-1, GA-2, GA-3 |
| B — Observability | 5 | OBS-0, OBS-1, OBS-2, OBS-3, OBS-4 |
| C — Diagnostics | 5 | DIAG-0, DIAG-1, DIAG-2, DIAG-3, DIAG-4 |
| D — Context Intelligence | 11 | CTX-0 through CTX-10 |
| E — Engineering Autonomy | 7 | ENG-0 through ENG-6 |
| F — Learning & Efficiency | 7 | EFF-0 through EFF-6 |
| **Total** | **39** | |

**The actual count is 39 leaf phases, not 26.** The "26 phases" wording in the original proposal is a counting inconsistency. This reconciliation uses the corrected count of 39.

---

## 1. Track Classification

**This proposal belongs under a new architecture track, not under ARX-015.**

Rationale:
- ARX-015 is scoped to "Production Activity Room Stabilization" — identity, events, policy, routing, sessions, workflow, projection, Activity Room API/UI. It is frozen and partially implemented (M1–M11C complete, M12–M17 pending).
- This proposal introduces7 responsibility invariants that re-scope the entire platform architecture: Access, Awareness, Evidence, Relevance, Orchestration, Reasoning, Authority.
- The scope is larger than ARX-015 and broader than Activity Room — it covers the full engineering intelligence platform.
- Mixing this into ARX-015 would corrupt the existing milestone structure and freeze boundaries.

**Proposed track:** `ARX-015B` — or, if the Director prefers, a top-level `VESTARA-INTELLIGENCE` track.

---

## 2. Canonical Document Location/Name

| Document | Proposed Location |
|----------|------------------|
| Architecture reconciliation (this document) | `docs/blueprint/ARX-015B-RECONCILIATION-PROPOSAL.md` |
| Architecture review (input proposal canonicalized) | `docs/blueprint/ARX-015B-ARCHITECTURE-REVIEW.md` (after approval) |
| Development plan | `docs/blueprint/ARX-015B-DEVELOPMENT-PLAN.md` (after approval) |
| Milestone evidence | `docs/blueprint/arx-015b-*.md` (per-milestone, following ARX-015 convention) |

---

## 3. Seven Responsibility Invariants (Proposed)

These are the governing invariants from the input proposal, reconciled against existing authorities:

| # | Invariant | Meaning | Existing Authority Alignment |
|---|-----------|---------|------------------------------|
| **RI-1** | Assistant provides access | Global Assistant is the user-facing access surface | Extends M12 (Contextual Assistant). Must not duplicate Activity Room. |
| **RI-2** | Observer provides awareness | Broad awareness through authorized telemetry/event subscriptions | NEW. Reads from existing EventBus, Activity Projection, Engineering Events. Read-only initially. |
| **RI-3** | Diagnostics provides evidence | Deterministic fact collection before model reasoning | Extends existing `diagnostics.ts` routes + `collect.ts`. Must own incident evidence model. |
| **RI-4** | Context Intelligence provides relevance | Minimum sufficient context to the right reasoning capability | NEW. Consumes Engineering Graph, Evidence, Diagnostics. Must not become Routing authority. |
| **RI-5** | Workflow provides orchestration | Task dispatch, approval, lifecycle | Maps to existing Workflow Authority (AR-P1.5 §4.3). Already owns phase/task/artifact. |
| **RI-6** | Agents perform bounded reasoning and work | Agent execution within policy boundaries | Maps to existing Agent Harness + Runtime Session Authority (AR-P1.5 §4.4). |
| **RI-7** | Governance provides authority | Authorization, permissions, policy enforcement | Maps to existing Execution Policy (ARX-015 §6) + Permission/Governance architecture. |

**Additional constraint:** Verification remains the authority for engineering acceptance and must not be subsumed by any of the seven responsibilities above.

**Reconciliation note:** RI-5 (Workflow) and RI-7 (Governance) map directly to existing frozen authorities. RI-6 (Agents) maps to existing Agent Harness. RI-1 (Assistant) extends M12. RI-2 (Observer), RI-3 (Diagnostics), and RI-4 (Context Intelligence) are the genuinely new authorities.

---

## 4. Governing Principles (Reconciled)

| Principle | Reconciled With |
|-----------|----------------|
| Activity Room remains collaboration/control surface, not orchestration authority | **ALREADY FROZEN** — AR-REC REC-GOV-09, AR-P1.5 I-5. Activity Projection is derived/append-only. |
| Global Assistant must not become miniature Activity Room or execution authority | Extends M12 contract. Must not own workflow, routing, or governance. |
| Observer has broad awareness, remains read-only initially | NEW authority. Must subscribe to EventBus, not write to any authority store. |
| Observer findings are evidence/awareness, not commands or repair authority | Enforced by: Observer cannot call Workflow, Routing, or Runtime Session authorities. |
| Diagnostics should deterministically collect facts before expensive model reasoning | Extends existing `diagnostics.ts` collect functions. DIAG phases add Vestara-specific runtime diagnostics. |
| RAG/retrieval is mechanism under Context Intelligence, not execution authority | CTX retrieval must not call Routing, Workflow, or Runtime Session. It provides input to agents. |
| Context Intelligence provides minimum sufficient context, not maximum available | Enforced by CTX-4 (budgets) and CTX-6 (minimum sufficient). |
| Retrieval must be hybrid | CTX-2 defines hybrid retrieval: structured, exact correlation, Engineering Graph, semantic, historical, change-aware. |
| Evidence must retain authority, freshness, provenance, confidence | **ALREADY FROZEN** — PCS-026 EvidenceReference/Provenance contracts. EvidencePipeline owns bundles. |
| Lossy summaries must never replace authoritative evidence | Enforced by: CTX-8 (compression) must preserve evidence references, not replace them. |
| Engineering agents consume uncertainty rather than rediscover deterministic telemetry | Core principle of ENG-1 (adaptive investigation). Agents read Observer/Diagnostics output. |
| Investigation may be proactive while mutation remains governed | ENG-1 through ENG-6. Investigation is read-only; correction (ENG-4) requires governance. |
| Service recovery and root-cause investigation are separate workflows | ENG-6 (operational recovery) is separate from ENG-1 (investigation). Recovery may proceed without root cause. |
| Safe recovery without exhaustive root-cause analysis | ENG-6 must not require ENG-1 completion. Known governed recovery actions proceed independently. |
| Continued speculative investigation after recovery requires new evidence or authorization | Enforced by: ENG-1 must produce evidence or receive authorization to continue. |
| Vestara optimizes accepted engineering outcomes across time, tokens, compute, human attention, operational risk | EFF program. Optimization is advisory (Observer/Context Intelligence), not executive (Workflow/Routing). |

---

## 5. Reconciliation Matrix — Program × Existing Authority

### Program A — Global Access

| Phase | Classification | Existing Authority | Collision Risk | Notes |
|-------|---------------|-------------------|----------------|-------|
| GA-0 Authority audit | **NEW** (assessment) | All existing authorities | None — read-only audit | Produce authority map, not modify authorities |
| GA-1 Floating Assistant | **EXTEND** M12 | M12 Contextual Assistant | Low — must not duplicate Activity Room | M12 already has component + API. GA-1 extends to floating position + broader context. |
| GA-2 Independent conversation | **EXTEND** Conversation Authority | AR-P1.5 §4.1 Conversation Authority | Medium — must not create parallel ingress | Conversation Authority already owns conversationId/messageId. GA-2 adds Activity Room as a conversation surface, not a new authority. |
| GA-3 Surface Context | **EXTEND** Activity Projection + Engineering Graph | AR-P1.5 §4.5 Activity Projection, `@vestara/engineering-graph` | Low — read-only composition | Compose existing data sources at API boundary. No new persistence. |

### Program B — Observability

| Phase | Classification | Existing Authority | Collision Risk | Notes |
|-------|---------------|-------------------|----------------|-------|
| OBS-0 Evidence topology | **EXTEND** Evidence Provenance | PCS-026 EvidenceReference/EvidenceProvenance | Low — extends existing model | Add topology relationships to existing evidence provenance. |
| OBS-1 Observer foundation | **NEW** | None — new authority | **HIGH** — must not duplicate diagnostics | Observer is event subscription + analysis. Diagnostics is fact collection. Observer reads from Diagnostics output. |
| OBS-2 Temporal evidence | **NEW** | None — new capability | Medium — must not duplicate Activity Projection timeline | Temporal evidence is time-indexed evidence retrieval, not activity stream. Different query model. |
| OBS-3 Findings | **NEW** | None — new output type | Medium — must not duplicate workflow task creation | Findings are evidence/awareness, not commands. Must not trigger workflow mutations. |
| OBS-4 Health/degradation model | **EXTEND** Health checks | `diagnostics.ts` health checks, `collectHealth()` | Medium — must not duplicate diagnostics health | Observer's health model is runtime degradation tracking. Diagnostics health is system-level metrics. Different scope. |

### Program C — Diagnostics

| Phase | Classification | Existing Authority | Collision Risk | Notes |
|-------|---------------|-------------------|----------------|-------|
| DIAG-0 Diagnostic contract | **NEW** | `diagnostics.ts` (routes) + `collect.ts` (collectors) | Low — extends existing | Define Vestara-runtime diagnostic contracts (distinct from OS-level diagnostics already in collect.ts). |
| DIAG-1 Snapshot | **EXTEND** `collect.ts` snapshot | `diagnostics.ts` `/api/diagnostics/summary` | Medium — must not duplicate M11A snapshot | M11A snapshot is Activity Room state. DIAG-1 snapshot is runtime diagnostic state. Different domain. |
| DIAG-2 Bundle | **NEW** | EvidencePipeline bundles (PCS-026) | **HIGH** — must not duplicate EvidencePipeline | DIAG-2 diagnostic bundles are incident-scoped diagnostic data collections. EvidencePipeline bundles are verification evidence. Different purpose, different lifecycle. Diagnostic bundles reference evidence bundles, not replace them. |
| DIAG-3 Correlation | **EXTEND** Engineering Event correlation | Engineering Event Store correlation_id | Low — extends existing | Add incident-scoped correlation to existing event correlation model. |
| DIAG-4 Incident timeline | **NEW** | Activity Projection timeline (different) | Medium — must not duplicate Activity Room timeline | Incident timeline is diagnostic incident history. Activity Room timeline is activity stream. Different data model and query pattern. |

### Program D — Context Intelligence

| Phase | Classification | Existing Authority | Collision Risk | Notes |
|-------|---------------|-------------------|----------------|-------|
| CTX-0 Evidence references | **EXTEND** Evidence Provenance | PCS-026 EvidenceReference | Low — extends existing | Add context-reference semantics to existing evidence references. |
| CTX-1 Retrieval foundation | **NEW** | None — new capability | Medium — must not duplicate conversation context assembly | Conversation Authority assembles context for provider turns. CTX-1 assembles context for engineering agents. Different consumers. |
| CTX-2 Hybrid retrieval | **NEW** | Engineering Graph, EvidencePipeline, Activity Projection (consumers) | **HIGH** — must not become routing authority | Hybrid retrieval queries multiple sources. Must not call Routing, Workflow, or Runtime Session. Read-only. |
| CTX-3 Context Orchestrator | **NEW** | None — new capability | **HIGH** — must not duplicate Workflow Orchestrator | Context Orchestrator sequences retrieval and ranking. Workflow Orchestrator sequences task execution. Different domain. |
| CTX-4 Context budgets | **EXTEND** Token Budget | `TokenBudget` (M3 execution policy) | Medium — must not duplicate token budget | Context budgets are input token limits for context windows. Token budgets are execution cost limits. Different scope. |
| CTX-5 Ranking | **NEW** | None — new capability | Low — advisory only | Ranking is scoring relevance. Must not influence Routing selection directly. |
| CTX-6 Minimum sufficient context | **NEW** | None — new capability | Low — composition rule | Enforces CTX-4 budgets + CTX-5 ranking to produce minimal sufficient context. |
| CTX-7 Provenance | **EXTEND** Evidence Provenance | PCS-026 EvidenceProvenance | Low — extends existing | Add context-provenance to existing evidence provenance model. |
| CTX-8 Compression | **NEW** | None — new capability | Medium — must not replace evidence | Compression produces summaries that reference original evidence. Must not replace evidence bundles. |
| CTX-9 Change-aware retrieval | **EXTEND** Engineering Graph | `@vestara/engineering-graph` | Low — extends existing | Add change-detection to graph traversal. |
| CTX-10 Historical incident retrieval | **NEW** | DIAG incident timeline (dependency) | Low — reads from Diagnostics | Queries diagnostic incident history. Read-only. |

### Program E — Engineering Autonomy

| Phase | Classification | Existing Authority | Collision Risk | Notes |
|-------|---------------|-------------------|----------------|-------|
| ENG-0 Developer preflight | **NEW** | None — new capability | Medium — must not duplicate routing preflight | Preflight assembles context before execution. Routing resolves provider/model. Different scope. |
| ENG-1 Adaptive investigation | **NEW** | None — new capability | Medium — must not duplicate workflow investigation | Adaptive investigation is agent-directed evidence gathering. Workflow investigation is orchestrator-directed task analysis. |
| ENG-2 Resource budgets | **EXTEND** Execution Policy + Token Budget | ARX-015 §6 Execution Policy, Token Budget | Medium — must not duplicate budget authorities | ENG-2 adds investigation-specific budgets. Must compose with existing budgets, not replace. |
| ENG-3 Governed escalation | **NEW** | Approval system (Workflow Authority) | Medium — must not duplicate approval gates | Escalation is agent-initiated request for broader authority. Uses existing approval system, not new authority. |
| ENG-4 Correction | **NEW** | Workflow Authority (task status) | **HIGH** — must not own task mutation | Correction proposes changes. Workflow Authority executes mutations. Correction must not directly mutate task state. |
| ENG-5 Verification | **EXTEND** EvidencePipeline + Verifier | PCS-026 EvidencePipeline, Verifier Service | Low — extends existing | ENG-5 adds adaptive verification (agent-directed). Existing verification is orchestrator-directed. Complementary. |
| ENG-6 Operational recovery | **NEW** | Workflow Authority (resume/retry) | Medium — must not duplicate orchestrator recovery | Recovery uses existing orchestrator resume/retry. ENG-6 adds diagnostic-driven recovery selection. |

### Program F — Learning & Efficiency

| Phase | Classification | Existing Authority | Collision Risk | Notes |
|-------|---------------|-------------------|----------------|-------|
| EFF-0 Time analytics | **NEW** | None — new capability | Low — advisory only | Time analytics are read-only metrics. No authority collision. |
| EFF-1 Token analytics | **EXTEND** Token Budget | Token Budget (M3) | Low — extends existing | EFF-1 reads token usage data. Token Budget enforces limits. Different scope. |
| EFF-2 Context efficiency | **NEW** | None — new capability | Low — advisory only | Measures context utilization. Read-only. |
| EFF-3 Investigation efficiency | **NEW** | None — new capability | Low — advisory only | Measures investigation cost vs outcome. Read-only. |
| EFF-4 Incident knowledge | **NEW** | DIAG incident timeline (dependency) | Low — reads from Diagnostics | Accumulates incident knowledge from diagnostic history. Read-only. |
| EFF-5 Predictive health | **NEW** | Observer findings (dependency) | Low — reads from Observer | Predictive models based on observer findings. Read-only. |
| EFF-6 Self-maintenance certification | **EXTEND** Verification Authority | Verification (evidence pipeline) | Medium — must not subsume verification | Self-maintenance certification is a verification scenario, not a replacement for verification authority. |

---

## 6. Authority Collisions — Detailed Resolution

### Collision 1: Evidence Ownership (Diagnostics vs EvidencePipeline)

**Problem:** DIAG-2 wants diagnostic bundles. EvidencePipeline owns verification evidence bundles. Both use "bundle" terminology.

**Resolution:**
- EvidencePipeline remains the sole authority for **verification evidence bundles** (PCS-026 VerificationEvidenceBundle).
- Diagnostics owns **incident diagnostic bundles** — a new type: `DiagnosticIncidentBundle { incidentId, timestamp, diagnosticSnapshots[], evidenceBundleRefs[], correlatedEvents[], rootCauseHypothesis? }`.
- DiagnosticIncidentBundle **references** VerificationEvidenceBundle via `evidenceBundleRefs[]` (FK). It does not contain or duplicate evidence bytes.
- Context Intelligence queries both types through their respective APIs.

### Collision 2: Context Intelligence vs Routing Authority

**Problem:** Context Intelligence ranks context. Routing Authority selects provider/model. If context ranking influences model selection, CTX becomes a shadow routing authority.

**Resolution:**
- Context Intelligence provides **context as input** to agents. It does not select providers or models.
- Routing Authority remains the sole authority for provider/model selection (AR-P1.5 I-3).
- Context Intelligence output is consumed by agents (RI-6), not by Routing (RI-5/RI-7).
- If context complexity requires a more capable model, the agent (not CTX) requests escalation through governed escalation (ENG-3).

### Collision 3: Engineering Autonomy Correction vs Workflow Authority

**Problem:** ENG-4 wants to correct tasks. Workflow Authority owns task status mutations.

**Resolution:**
- ENG-4 produces a **correction proposal** — not a direct mutation.
- Correction proposals are submitted through the existing approval system (Workflow Authority §4.3).
- Workflow Authority evaluates the proposal and executes the mutation if approved.
- ENG-4 is the "suggestor," Workflow Authority is the "executor."

### Collision 4: Observer vs Diagnostics

**Problem:** Both collect telemetry and detect anomalies.

**Resolution:**
- Diagnostics (RI-3) owns **deterministic fact collection** — snapshots, metrics, event correlation, incident timelines. It is the "what happened" authority.
- Observer (RI-2) owns **awareness and analysis** — subscribes to diagnostic output, produces findings, detects patterns, tracks degradation. It is the "what it means" authority.
- Data flow: Diagnostics → Observer (Observer reads from Diagnostics, never writes to it).
- Observer findings reference diagnostic facts. They do not duplicate them.

### Collision 5: Context Intelligence vs Conversation Authority Context Assembly

**Problem:** Both assemble context for AI interactions.

**Resolution:**
- Conversation Authority assembles context for **provider turns** (chat messages, conversation history). This is the existing `sendMessage` path.
- Context Intelligence assembles context for **engineering agents** (relevant code, evidence, incidents, graph relationships). This is a new path.
- Different consumers, different query models, different output formats.
- Both may share underlying data sources (Engineering Graph, Evidence) but through different APIs.

---

## 7. Duplication Risks

| Risk | Mitigation |
|------|-----------|
| Observer + Diagnostics both collect telemetry | Diagnostics owns collection. Observer owns analysis. Single data flow direction. |
| CTX retrieval + Conversation context assembly | Different consumers (agents vs chat). Different query models. Shared data sources through existing APIs. |
| DIAG incident timeline + Activity Room timeline | Different data models. Incident timeline is diagnostic-scoped. Activity Room timeline is activity-stream-scoped. |
| ENG-5 verification + existing EvidencePipeline verification | ENG-5 is agent-directed adaptive verification. EvidencePipeline is orchestrator-directed verification. Complementary, not duplicative. |
| EFF token analytics + Token Budget tracking | EFF reads usage data. Token Budget enforces limits. Different scope. |
| DIAG-1 snapshot + M11A snapshot | DIAG-1 is runtime diagnostic state. M11A is Activity Room state. Different domain, different API. |

---

## 8. Circular Dependencies

| Cycle | Resolution |
|-------|-----------|
| Diagnostics → Context Intelligence → Engineering Autonomy → Observer → Diagnostics | Break at Observer: Observer reads Diagnostics output but does not write to Diagnostics. Observer findings feed Context Intelligence, not Diagnostics. Single data flow direction. |
| Observer → Findings → Context Intelligence → Agent → Correction → Workflow → New Incident → Diagnostics → Observer | This is a legitimate feedback loop, not a circular dependency. Each step is a separate authority boundary. The loop is asynchronous and governed. |

---

## 9. Degraded-Mode Dependencies

| Failure | Impact | Fallback |
|---------|--------|----------|
| Context Intelligence unavailable | Agents lose contextual guidance | Agents fall back to deterministic telemetry (Diagnostics output) + manual investigation |
| Observer unavailable | No pattern detection or degradation tracking | Diagnostics continues collecting. Findings stop. Manual monitoring required. |
| Diagnostics unavailable | No fact collection for Observer or Context Intelligence | Observer has no input. Context Intelligence has no diagnostic context. Agent investigation is blind. **Critical dependency.** |
| Engineering Autonomy unavailable | No adaptive investigation or correction | Manual governance. Existing Workflow approval gates continue. |
| Observer + Diagnostics both unavailable | System operates without awareness | Existing Activity Room + Workflow continue. No intelligence layer. |

**Critical path:** Diagnostics is the foundation for Observer and Context Intelligence. DIAG phases should be prioritized early in implementation.

---

## 10. Naming Conflicts

| Proposed Name | Existing Name | Conflict | Resolution |
|---------------|--------------|----------|-----------|
| Observer | Activity Projection | Both observe system state | Observer is analysis-awareness. Activity Projection is stream-display. Different scope. Keep both names. |
| Diagnostics | `diagnostics.ts` routes | Same name, different scope | Extend existing `diagnostics.ts` with Vestara-runtime diagnostics. Keep name. Route prefix `/api/diagnostics/` already exists. |
| Context Orchestrator | Workflow Orchestrator | "Orchestrator" overloading | Rename to **Context Assembler** or **Context Pipeline** to avoid confusion with Workflow Orchestrator. |
| Evidence Bundle | EvidencePipeline bundle | Same term, different types | Use `DiagnosticIncidentBundle` for diagnostic bundles. Keep `VerificationEvidenceBundle` for evidence. |
| Health Model | `collectHealth()` | Same concept, different depth | Extend existing health model. Keep name. |
| Findings | `Alert` in diagnostics.ts | Different concepts | Findings are analytical observations. Alerts are threshold-based warnings. Keep both. |

---

## 11. Dependency Graph (Corrected)

```
Program A (Global Access)
  GA-0 Authority audit ──────────────────────────────────┐
  GA-1 Floating Assistant ─── (extends M12)              │
  GA-2 Independent conversation ─── (extends Conv Auth)  │
  GA-3 Surface Context ─── (extends Eng Graph + AR)      │
                                                         │
Program B (Observability)                                │
  OBS-0 Evidence topology ─── (extends PCS-026)          │
  OBS-1 Observer foundation ─── NEW ─────────────────┐   │
  OBS-2 Temporal evidence ───────────────────────┐   │   │
  OBS-3 Findings ─────────────────────────────┐  │   │   │
  OBS-4 Health/degradation ────────────────┐  │  │   │   │
                                           │  │  │   │   │
Program C (Diagnostics)                    │  │  │   │   │
  DIAG-0 Diagnostic contract ──────────┐   │  │  │   │   │
  DIAG-1 Snapshot ─────────────────┐   │   │  │  │   │   │
  DIAG-2 Bundle ────────────────┐  │   │   │  │  │   │   │
  DIAG-3 Correlation ────────┐  │  │   │   │  │  │   │   │
  DIAG-4 Incident timeline ┐ │  │  │   │   │  │  │   │   │
                           │ │  │  │   │   │  │  │   │   │
                           ▼ ▼  ▼  ▼   ▼   ▼  ▼  ▼   ▼   ▼
                          ┌─────────────────────────────────┐
                          │   OBS-1 reads DIAG output       │
                          │   OBS-2 reads DIAG timeline     │
                          │   OBS-3 reads OBS-1 findings    │
                          │   OBS-4 reads DIAG health       │
                          └──────────────┬──────────────────┘
                                         │
Program D (Context Intelligence)         │
  CTX-0 Evidence references ─────────┐   │
  CTX-1 Retrieval foundation ─────┐  │   │
  CTX-2 Hybrid retrieval ──────┐  │  │   │
  CTX-3 Context Orchestrator ┐  │  │  │   │
  CTX-4 Context budgets ──┐  │  │  │  │   │
  CTX-5 Ranking ────────┐ │  │  │  │  │   │
  CTX-6 Min sufficient┐  │ │  │  │  │  │   │
  CTX-7 Provenance ─┐  │  │ │  │  │  │  │   │
  CTX-8 Compression  │  │  │ │  │  │  │  │   │
  CTX-9 Change-aware │  │  │ │  │  │  │  │   │
  CTX-10 Historical  │  │  │ │  │  │  │  │   │
                     ▼  ▼  ▼ ▼  ▼  ▼  ▼ ▼   ▼
                    ┌──────────────────────────┐
                    │ CTX reads: Eng Graph,    │
                    │ Evidence, Diagnostics,   │
                    │ Observer findings        │
                    └──────────┬───────────────┘
                               │
Program E (Engineering Autonomy)
  ENG-0 Developer preflight ─── reads CTX output
  ENG-1 Adaptive investigation ─── reads CTX + Observer + Diagnostics
  ENG-2 Resource budgets ─── extends Execution Policy
  ENG-3 Governed escalation ─── uses Approval system
  ENG-4 Correction ─── proposes to Workflow Authority
  ENG-5 Verification ─── extends EvidencePipeline
  ENG-6 Operational recovery ─── uses Workflow resume/retry

Program F (Learning & Efficiency)
  EFF-0 Time analytics ─── reads execution timestamps
  EFF-1 Token analytics ─── reads Token Budget data
  EFF-2 Context efficiency ─── reads CTX usage
  EFF-3 Investigation efficiency ─── reads ENG-1 metrics
  EFF-4 Incident knowledge ─── reads DIAG-4 timeline
  EFF-5 Predictive health ─── reads OBS-3 findings
  EFF-6 Self-maintenance certification ─── extends Verification
```

**Critical path (longest dependency chain):**
```
GA-0 → DIAG-0 → DIAG-1 → OBS-1 → CTX-1 → CTX-2 → CTX-3 → ENG-0 → ENG-1 → ENG-4 → EFF-6
```

---

## 12. Milestone Structure

39 phases grouped into 8 milestones. Milestones respect dependency order and the principle that deterministic foundations come before intelligence layers.

### M-B1 — Foundation & Access (5 phases)

**Objective:** Establish responsibility invariant contracts, authority audit, user access surface, and diagnostic contracts.

| Phase | Program | What | Depends On |
|-------|---------|------|-----------|
| GA-0 | A | Authority audit | None |
| GA-1 | A | Floating Assistant (extends M12) | GA-0 |
| GA-2 | A | Independent conversation (extends Conversation Authority) | GA-0 |
| GA-3 | A | Surface Context (extends Activity Room) | GA-0 |
| DIAG-0 | C | Diagnostic contract | None |

**Existing foundations consumed:** M12 (Contextual Assistant), Conversation Authority (AR-P1.5 §4.1), Activity Projection (AR-P1.5 §4.5), `diagnostics.ts` routes.

**Exit gate:** Authority audit complete. Floating Assistant renders in Activity Room. Diagnostic contract defined. All responsibility invariants documented.

### M-B2 — Diagnostics & Observability Foundation (7 phases)

**Objective:** Build deterministic fact collection (Diagnostics) and event-driven awareness (Observer).

| Phase | Program | What | Depends On |
|-------|---------|------|-----------|
| DIAG-1 | C | Snapshot (Vestara runtime diagnostics) | DIAG-0 |
| DIAG-2 | C | Bundle (incident diagnostic bundles) | DIAG-0 |
| DIAG-3 | C | Correlation (incident-scoped correlation) | DIAG-0 |
| DIAG-4 | C | Incident timeline | DIAG-3 |
| OBS-0 | B | Evidence topology (extends PCS-026) | None |
| OBS-1 | B | Observer foundation (event subscription + analysis) | DIAG-1, DIAG-2 |
| OBS-4 | B | Health/degradation model | DIAG-1, OBS-1 |

**Existing foundations consumed:** `diagnostics.ts` + `collect.ts` (system metrics), PCS-026 Evidence Provenance, Engineering Event Store, Activity Projection.

**Exit gate:** Diagnostic snapshots collect Vestara runtime state. Incident bundles reference evidence bundles. Observer subscribes to diagnostic output and produces findings. Health model tracks degradation.

### M-B3 — Temporal Evidence & Findings (3 phases)

**Objective:** Build time-indexed evidence retrieval and analytical findings.

| Phase | Program | What | Depends On |
|-------|---------|------|-----------|
| OBS-2 | B | Temporal evidence | DIAG-4, OBS-0 |
| OBS-3 | B | Findings | OBS-1 |
| CTX-0 | D | Evidence references (extends PCS-026) | OBS-0 |

**Existing foundations consumed:** PCS-026 EvidenceReference, Engineering Event Store timestamps, Activity Projection sequence.

**Exit gate:** Temporal evidence queries return time-sliced evidence. Findings are produced by Observer. Evidence references support context retrieval.

### M-B4 — Context Intelligence Core (7 phases)

**Objective:** Build hybrid retrieval, context orchestration, and ranking.

| Phase | Program | What | Depends On |
|-------|---------|------|-----------|
| CTX-1 | D | Retrieval foundation | CTX-0, OBS-3 |
| CTX-2 | D | Hybrid retrieval (structured, graph, semantic, historical, change-aware) | CTX-1, Engineering Graph |
| CTX-4 | D | Context budgets | CTX-1 |
| CTX-5 | D | Ranking | CTX-2 |
| CTX-6 | D | Minimum sufficient context | CTX-4, CTX-5 |
| CTX-7 | D | Provenance (extends PCS-026) | CTX-0 |
| CTX-9 | D | Change-aware retrieval | CTX-2, Engineering Graph |

**Existing foundations consumed:** `@vestara/engineering-graph` (in-memory relationship engine), PCS-026 Evidence Provenance, Activity Projection.

**Exit gate:** Hybrid retrieval queries multiple sources. Context budgets enforce token limits. Ranking produces relevance scores. Minimum sufficient context is assembled. Provenance tracks context origin.

### M-B5 — Context Intelligence Advanced + Developer Preflight (5 phases)

**Objective:** Build context orchestration, compression, historical retrieval, and developer preflight.

| Phase | Program | What | Depends On |
|-------|---------|------|-----------|
| CTX-3 | D | Context Orchestrator (rename: Context Assembler) | CTX-6 |
| CTX-8 | D | Compression | CTX-6, CTX-7 |
| CTX-10 | D | Historical incident retrieval | DIAG-4, CTX-2 |
| ENG-0 | E | Developer preflight | CTX-3 |
| ENG-2 | E | Resource budgets (extends Execution Policy) | CTX-4 |

**Existing foundations consumed:** Execution Policy (ARX-015 §6), Token Budget, Workflow Authority approval system.

**Exit gate:** Context Assembler sequences retrieval and ranking. Compression produces evidence-referencing summaries. Historical incident retrieval queries diagnostic timeline. Developer preflight assembles context before execution.

### M-B6 — Engineering Autonomy Core (4 phases)

**Objective:** Build adaptive investigation, governed escalation, correction proposals, and verification.

| Phase | Program | What | Depends On |
|-------|---------|------|-----------|
| ENG-1 | E | Adaptive investigation | ENG-0, OBS-3, CTX-3 |
| ENG-3 | E | Governed escalation | ENG-1, Approval system |
| ENG-4 | E | Correction (proposals to Workflow Authority) | ENG-1, ENG-3 |
| ENG-5 | E | Verification (extends EvidencePipeline) | ENG-1, EvidencePipeline |

**Existing foundations consumed:** Workflow Authority (AR-P1.5 §4.3), EvidencePipeline (PCS-026), Verifier Service, Approval system.

**Exit gate:** Adaptive investigation gathers evidence. Governed escalation requests broader authority. Correction proposes changes through approval system. Verification evaluates correction outcomes.

### M-B7 — Recovery & Efficiency (5 phases)

**Objective:** Build operational recovery, analytics, and efficiency measurement.

| Phase | Program | What | Depends On |
|-------|---------|------|-----------|
| ENG-6 | E | Operational recovery | ENG-4, Workflow resume/retry |
| EFF-0 | F | Time analytics | ENG-1 |
| EFF-1 | F | Token analytics | ENG-2 |
| EFF-2 | F | Context efficiency | CTX-6 |
| EFF-3 | F | Investigation efficiency | ENG-1 |

**Existing foundations consumed:** Workflow Authority resume/retry, Token Budget usage data.

**Exit gate:** Operational recovery uses diagnostic-driven recovery selection. Time/token analytics measure execution costs. Context/investigation efficiency metrics are produced.

### M-B8 — Knowledge, Prediction & Certification (4 phases)

**Objective:** Build incident knowledge, predictive health, and self-maintenance certification.

| Phase | Program | What | Depends On |
|-------|---------|------|-----------|
| EFF-4 | F | Incident knowledge | DIAG-4, EFF-0 |
| EFF-5 | F | Predictive health | OBS-3, OBS-4 |
| EFF-6 | F | Self-maintenance certification | ENG-5, EFF-4 |
| — | — | **GA-ACCEPT-SELF-MAINTENANCE-001** scenario validation | EFF-6 |

**Existing foundations consumed:** Verification Authority (evidence pipeline), Observer findings, Diagnostic incident timeline.

**Exit gate:** Incident knowledge accumulates from diagnostic history. Predictive health models detect degradation patterns. Self-maintenance certification validates the full loop: detect → diagnose → investigate → correct → verify → recover → learn. GA-ACCEPT-SELF-MAINTENANCE-001 (M11C WASM incident) is replayed as the canonical validation scenario.

---

## 13. Implementation Sequence (Recommended)

```
M-B1 (Foundation & Access)           ← No dependencies. Start here.
  │
  ▼
M-B2 (Diagnostics & Observability)   ← Depends on M-B1 (DIAG-0, GA-0).
  │
  ├──────────────────┐
  ▼                  ▼
M-B3 (Temporal)    [can start in parallel with M-B4]
  │                  │
  ▼                  ▼
M-B4 (Context Core) ← Depends on M-B3 (CTX-0).
  │
  ▼
M-B5 (Context Advanced + Preflight)  ← Depends on M-B4 (CTX-6).
  │
  ▼
M-B6 (Engineering Autonomy)          ← Depends on M-B5 (CTX-3, ENG-0).
  │
  ├──────────────────┐
  ▼                  ▼
M-B7 (Recovery & Efficiency)        [can start in parallel with M-B8]
  │                  │
  ▼                  ▼
M-B8 (Knowledge & Certification)     ← Depends on M-B7 (ENG-6) + M-B6 (ENG-5).
```

**Total estimated phases:** 39 (corrected from 26)
**Parallelization opportunity:** M-B3 and M-B4 partially overlap (CTX-0 starts in M-B3, CTX-1 depends on CTX-0). M-B7 and M-B8 partially overlap (EFF-0 through EFF-3 can start before EFF-4 through EFF-6).

---

## 14. Authority Matrix (Proposed)

| Responsibility | Authority | Owned Identity | Persistent Store | Emits | Consumed By | Must NOT Write |
|---------------|-----------|---------------|-----------------|-------|-------------|----------------|
| **Assistant** (RI-1) | GA (extends M12) | — (uses existing) | — (no new store) | — | Activity Room UI | Workflow, Routing, Governance state |
| **Observer** (RI-2) | OBS | findingId | New: `observer_findings` table | `observer.finding.created` | Context Intelligence, EFF-5 | Any authority store (read-only) |
| **Diagnostics** (RI-3) | DIAG | incidentId, snapshotId, bundleId | New: `diagnostic_incidents` table | `diagnostic.incident.*` | Observer, CTX-10, EFF-4 | Workflow, Routing, Activity state |
| **Context Intelligence** (RI-4) | CTX | contextId | New: `context_cache` table (derived) | `context.assembled` | ENG-0, ENG-1 | Routing selection, Workflow mutations |
| **Workflow** (RI-5) | Existing | workflowId, taskId, planId | `plans.db` + engineering events | `project.*`, `task.*` | Activity Projection, evidence, metrics | Activity, Conversation, Routing |
| **Agents** (RI-6) | Existing | threadId, turnId | `agent-harness.db` | `harness.*`, `runtime.session.*` | Activity, evidence, Engineering events | Activity, Routing, Workflow state |
| **Governance** (RI-7) | Existing | — | Execution Policy config | `policy.*` | Runtime adapters, agents | Activity, Workflow state |
| **Verification** (constraint) | Existing | evidenceBundleId, bundleId | Evidence CAS + `evidence/` | `harness.verification-bundle` | Activity `evidenceRefs`, EFF-6 | Any authority state |

---

## 15. Adjacent Findings (Not Actionable in This Scope)

| # | Finding | Classification | Evidence |
|---|---------|---------------|----------|
| 1 | `restoreActiveSessions()` blocks event loop for 67s on startup (767 threads × full table scan) | ADJACENT | `arx-015-startup-audit.md` — 87.7% of boot time |
| 2 | `engineering_events` table is 288MB with 181K rows — largest store | ADJACENT | Startup audit data scale |
| 3 | Root `vitest.config.ts` excludes 56/69 workspace `.test.tsx` files from discovery | ADJACENT | VCTRL-WORKSPACE-DISCOVERY-001 |
| 4 | sql.js WASM `RuntimeError: memory access out of bounds` after ~20h uptime | ADJACENT | M11C WASM incident — root cause indeterminate |
| 5 | `conversationId` and `workflowId` have zero FK relationship today | ADJACENT | AR-P1.5 audit §D — UD-2 addresses this |

---

## 16. What This Proposal Does NOT Modify

Per the authorization boundary, this document is a proposal only. The following existing documents remain authoritative and frozen:

- `docs/activity-room/arx-015-architecture-review.md` — Revision 2, frozen
- `docs/activity-room/arx-015-development-plan.md` — Revision 2, frozen
- `docs/activity-room/arx-015-recommendation-governed-decisions-milestone.md` — Approved, frozen
- `docs/activity-room/arx-015-r0-r13-reconciliation.md` — Complete, frozen
- `docs/AR-P1.5-AUTHORITY-CONTRACTS.md` — Proposed contracts (AR-P2 entry criteria apply)
- All ARX-015 M1–M11C evidence documents — Frozen at documented commits
- All AR-REC R0–R6 evidence documents — Frozen at documented commits

---

## 17. Recommended Next Steps (Awaiting Approval)

1. **Director review** of this reconciliation proposal
2. **Approve or修正** responsibility invariants (RI-1 through RI-7)
3. **Approve or修正** milestone structure (M-B1 through M-B8)
4. **Approve canonical document location** (`docs/blueprint/ARX-015B-*`)
5. **Approve track classification** (ARX-015B vs VESTARA-INTELLIGENCE)
6. After approval: canonicalize the input proposal into `ARX-015B-ARCHITECTURE-REVIEW.md`
7. After approval: create `ARX-015B-DEVELOPMENT-PLAN.md` with phase-level detail

**No code, tests, schemas, stores, routes, events, UI components, or behavioral changes are authorized until approval.**

---

> **Reconciliation complete. 39 phases identified (corrected from 26). 7 responsibility invariants reconciled against existing authorities. 5 authority collisions identified with resolutions. 8-milestone structure proposed. Awaiting Director approval before creating blueprint documents.**

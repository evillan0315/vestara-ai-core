---
title: VESTARA-INTELLIGENCE M-B1 — Preflight / Zero-Mutation Audit
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# VESTARA-INTELLIGENCE M-B1 — Preflight / Zero-Mutation Audit

**Date:** 2026-08-31
**Audit Type:** Zero-mutation preflight (no source, test, schema, persistence, API, UI, configuration, or behavior changes authorized)
**Governing Specification:** `VESTARA-INTELLIGENCE-ARCHITECTURE-REVIEW.md` (frozen at `2661a54`) + `VESTARA-INTELLIGENCE-DEVELOPMENT-PLAN.md` (frozen at `2661a54`)
**Baseline Commit:** `2661a5462fae569589f1a10f4aadbab142aab80c`

---

## A. Repository Baseline

### HEAD

```
2661a54 docs: freeze VESTARA-INTELLIGENCE architecture and development plan
```

### Working Tree State

```
On branch main, ahead of origin/main by 1 commit.
4 unstaged modifications (all from prior R6/M11C work, not part of this audit).
```

### Unstaged Modifications

| File | Lines Changed | Ownership/Workstream | M-B1 Overlap? |
|------|--------------|---------------------|---------------|
| `apps/api/src/routes/activity-room-m11a.ts` | +80 | M11C instrumentation (WASM health, retry fixes, submission dependency) | **No** — M11A read API is frozen transport layer. M-B1 does not modify Activity Room routes. |
| `apps/api/src/routes/diagnostics.ts` | +48 | M11A health endpoint (`GET /api/diagnostics/m11a-health`) | **No** — M-B1 DIAG-0 defines new diagnostic *contracts* (types), not new endpoints. The existing health endpoint is a source, not a target. |
| `apps/workspace/__tests__/r6-decision-loop.test.tsx` | +91 | R6 regression tests (retry key, submission dependency) | **No** — M-B1 has no test overlap. M-B1 acceptance tests are component/visual/API tests for new capabilities. |
| `apps/workspace/src/hooks/useM11CActivityRoom.ts` | +28 | R6 submission fixes (retryKey, submissionRef patterns) | **No** — M-B1 does not touch Activity Room hooks. Global Assistant uses separate hooks. |

**Assessment:** Zero overlap between unstaged R6/M11C modifications and any M-B1 candidate file. The dirty tree does not block M-B1 implementation. These changes should remain unstaged until their own freeze boundary.

---

## B. Exact Five M-B1 Phases

*Read directly from `VESTARA-INTELLIGENCE-DEVELOPMENT-PLAN.md` §M-B1 (lines 77–108).*

### Phase 1: GA-0 — Authority Audit

| Field | Value |
|-------|-------|
| **Phase ID** | GA-0 |
| **Program** | A (Global Assistant) |
| **Objective** | Complete audit of all existing Vestara authorities. Produce authority map documenting ownership, data flow, and forbidden responsibilities for each domain. |
| **Dependencies** | None |
| **Acceptance Gates** | G-MB1-1: Authority audit document produced with ownership matrix. G-MB1-2: Consistent with AR-P1.5 §8 authority matrix. G-MB1-8: References GA-ACCEPT-SELF-MAINTENANCE-001. |
| **Existing Implementation Candidates** | AR-P1.5 Authority Contracts (`docs/AR-P1.5-AUTHORITY-CONTRACTS.md`) — existing authority matrix covering Workflow, Routing, Governance, Verification, Activity Room. This audit extends it with intelligence-layer authorities. |
| **Missing Capability** | No audit document exists covering the full authority landscape including new intelligence authorities (Observer, Diagnostics, Context Intelligence, Global Assistant). |
| **Authority Affected** | None (documentation only). Produces an authoritative reference document. |
| **Persistence Affected** | None. |
| **API/UI/Runtime Impact** | None. |
| **Implementation Risk** | **Low** — Pure documentation/investigation. No code changes. |

### Phase 2: GA-1 — Floating Assistant

| Field | Value |
|-------|-------|
| **Phase ID** | GA-1 |
| **Program** | A (Global Assistant) |
| **Objective** | Extend M12 Contextual Assistant to floating position in workspace UI. Surface diagnostic findings, observer alerts, and context results. |
| **Dependencies** | GA-0 |
| **Acceptance Gates** | G-MB1-3: Floating Assistant renders in Activity Room with diagnostic/contextual data (component test + visual verification). |
| **Existing Implementation Candidates** | ShellLayout (`apps/workspace/src/layouts/ShellLayout.tsx`) — root layout with sidebar, header, content, and overlay slots. Existing floating infrastructure: `VestaraModal` (z-50), `Drawer` (z-80, resizable, localStorage-persistent sizing), `ToastProvider` (persistent across navigation), `GraphContext` + `Inspector` (persistent overlay pattern). Chat component library (24 files in `components/chat/`). |
| **Missing Capability** | No floating assistant button/FAB, no persistent chat widget, no cross-page assistant overlay. The chat system exists at `/chat` as a full-page route — it does not float. No M12 Contextual Assistant exists (confirmed: zero search results for `M12`, `m12`, `ContextualAssistant`). |
| **Authority Affected** | Global Assistant must not own workflow, routing, governance, or evidence authority (RI-1). |
| **Persistence Affected** | None. UI-only. |
| **API/UI/Runtime Impact** | New React component in `apps/workspace/`. Extends ShellLayout with floating overlay. |
| **Implementation Risk** | **Low–Medium** — UI component with clear boundary. Risk is in maintaining independence from Activity Room. |

### Phase 3: GA-2 — Independent Conversation

| Field | Value |
|-------|-------|
| **Phase ID** | GA-2 |
| **Program** | A (Global Assistant) |
| **Objective** | Extend Conversation Authority to support Activity Room as a conversation surface. Conversation state remains with Conversation Authority. |
| **Dependencies** | GA-0 |
| **Acceptance Gates** | G-MB1-4: Independent conversation uses Conversation Authority (not new ingress). Code review: no new persistence, no new authority. |
| **Existing Implementation Candidates** | `@vestara/conversation` package — `ConversationService` interface + `DefaultConversationService`. Manages message threads, SSE streaming, event lifecycle. `SqliteConversationStore` (`.vestara/conversations/conversations.db`). `DefaultConversationEngine` wraps service with profile enrichment. REST API at `POST /api/conversations/:id/messages` and `POST /api/conversations/:id/stream`. Activity Room message ingress at `POST /api/messages` (canonical human ingress, AAR-001E). |
| **Missing Capability** | Conversation Authority does not currently expose Activity Room as a conversation surface. The Activity Room and Chat are separate systems with separate state. |
| **Authority Affected** | Conversation Authority owns conversation state (AR-P1.5 §4.1). Must not create new ingress paths. |
| **Persistence Affected** | None. Reuses existing `SqliteConversationStore`. |
| **API/UI/Runtime Impact** | May require new route or adapter to bridge Activity Room messages into Conversation Authority threads. |
| **Implementation Risk** | **Low–Medium** — Existing ConversationService is reusable. Risk is in ensuring no new authority or ingress is created. |

### Phase 4: GA-3 — Surface Context

| Field | Value |
|-------|-------|
| **Phase ID** | GA-3 |
| **Program** | A (Global Assistant) |
| **Objective** | Compose existing data sources (Engineering Graph, Activity Projection, Evidence) at API boundary for Global Assistant consumption. No new persistence. |
| **Dependencies** | GA-0 |
| **Acceptance Gates** | G-MB1-5: Surface Context composes existing data sources at API boundary. API test: GET endpoint returns composed data. |
| **Existing Implementation Candidates** | Engineering Graph (`packages/engineering-graph/`) — in-memory adjacency store with traversal, search, insights, health. Activity Projection (`packages/activity-room/`) — projection chain with projectors, effective state, query. Evidence Pipeline (`packages/evidence/`) — PCS-026 `VerificationEvidenceBundle`, `EvidenceReference`, `EvidenceProvenance`. M11A Read API (`apps/api/src/routes/activity-room-m11a.ts`) — production read-only API over M9/M10. |
| **Missing Capability** | No unified API endpoint composes these sources for Global Assistant consumption. Each source has its own API surface; no composition layer exists. |
| **Authority Affected** | Composition is read-only. No new authority created. Must not become routing, workflow, or governance authority. |
| **Persistence Affected** | None. Composes existing read-only sources. |
| **API/UI/Runtime Impact** | New API endpoint (GET) that aggregates Engineering Graph, Activity Projection, and Evidence data. |
| **Implementation Risk** | **Low** — Read-only composition of existing APIs. No mutation, no new persistence. |

### Phase 5: DIAG-0 — Diagnostic Contract

| Field | Value |
|-------|-------|
| **Phase ID** | DIAG-0 |
| **Program** | C (Diagnostics) |
| **Objective** | Define Vestara-runtime diagnostic contracts: `DiagnosticSnapshot`, `DiagnosticIncidentBundle`, `DiagnosticCorrelation`, `DiagnosticIncidentTimeline`. Distinguish from existing OS-level diagnostics in `collect.ts`. |
| **Dependencies** | None |
| **Acceptance Gates** | G-MB1-6: Diagnostic contract types defined and documented. TypeScript types exist, documented in architecture review. |
| **Existing Implementation Candidates** | `collect.ts` (`apps/api/src/diagnostics/collect.ts`, 903 lines) — extensive OS-level collectors (CPU, memory, disk, GPU, Docker, git, processes, health). `M11AInstrumentation` interface (`activity-room-m11a.ts:112-142`) — WASM/sql.js health metrics. `GET /api/diagnostics/m11a-health` (`diagnostics.ts:214-259`) — health instrumentation endpoint. `GET /api/diagnostics/health` (`diagnostics.ts:164-186`) — comprehensive health checks. `HealthCheck` interface (`collect.ts:783-788`) — `{ id, name, status, detail }`. |
| **Missing Capability** | No Vestara-runtime diagnostic contracts exist. Current diagnostics are OS-level (CPU, memory, disk). Missing: process health, WASM state, SQLite store health, event loop status — the data that was manually reconstructed during the M11C WASM incident. |
| **Authority Affected** | Diagnostics owns evidence collection (RI-3). Must not perform analysis (Observer owns analysis). |
| **Persistence Affected** | Types only. No new stores. |
| **API/UI/Runtime Impact** | TypeScript type definitions. May inform future diagnostic collector extensions (M-B2). |
| **Implementation Risk** | **Low** — Pure type definitions. No runtime behavior. |

---

## C. Existing-Capability Audit

### Workspace Shell & Layout

| Capability | Status | Key Files | Reusable? |
|------------|--------|-----------|-----------|
| Shell layout (sidebar + header + content) | Exists | `ShellLayout.tsx` | Yes — mount floating assistant outside flex layout |
| Collapsible sidebar | Exists | `AppSidebar.tsx` | Yes |
| Sticky header | Exists | `AppHeader.tsx` | Yes — could host assistant toggle |
| Overlay infrastructure | Exists | `VestaraModal` (z-50), `Drawer` (z-80), `CommandPalette` (z-200) | Yes — Drawer is most reusable |
| Persistent overlay pattern | Exists | `GraphContext` + `Inspector` — context provider in ShellLayout, survives navigation | Yes — primary pattern for floating assistant |
| Toast provider | Exists | `ToastProvider` — persistent at App root | Yes — pattern reference |
| Floating assistant button/FAB | **Does not exist** | — | Must create |
| Persistent chat widget | **Does not exist** | — | Must create |

### Conversation & Chat Infrastructure

| Capability | Status | Key Files | Reusable? |
|------------|--------|-----------|-----------|
| ConversationService | Exists | `packages/conversation/src/index.ts` | Yes — primary abstraction |
| SqliteConversationStore | Exists | `packages/conversation-runtime/src/conversation-store.ts` | Yes |
| Chat components (24 files) | Exists | `apps/workspace/src/components/chat/` | Yes — MessageList, ChatComposer, AssistantMessage, etc. |
| SSE streaming | Exists | `useChat.ts` + `/api/conversations/:id/stream` | Yes |
| Chat page route | Exists | `/chat` — full-page, not floating | Partial — components reusable, layout not |
| Activity Room message ingress | Exists | `POST /api/messages` (AAR-001E canonical) | Yes — but GA-2 must not create parallel ingress |
| Interaction system | Exists | `packages/interaction-app/`, `packages/interaction-persistence/` | Yes — for structured decision points |

### Diagnostics & Health

| Capability | Status | Key Files | Reusable? |
|------------|--------|-----------|-----------|
| OS-level collectors | Exists | `collect.ts` (903 lines) | Yes — extend, don't duplicate |
| Health endpoint | Exists | `GET /api/diagnostics/health` | Yes |
| M11A health instrumentation | Exists | `GET /api/diagnostics/m11a-health` | Yes — WASM health model |
| HealthCheck contract | Exists | `{ id, name, status, detail }` | Yes |
| Vestara-runtime diagnostics | **Does not exist** | — | Must define (DIAG-0) |
| Process health / WASM state | **Does not exist** | — | Must define (M-B2 DIAG-1) |

### Request Correlation & Logging

| Capability | Status | Key Files | Reusable? |
|------------|--------|-----------|-----------|
| RequestId (AsyncLocalStorage) | Exists | `apps/api/src/http/request-context.ts` | Yes |
| TraceId / CorrelationId / ExecutionId | Exists | `packages/shared/src/events.ts` | Yes |
| RequestLogger (NDJSON) | Exists | `apps/api/src/http/request-logger.ts` | Yes |
| Kernel.logger | Exists | `packages/logger/src/index.ts` | Yes |
| httpMetrics | Exists | `apps/api/src/http/request-metrics.ts` | Yes |

### Evidence & Engineering Graph

| Capability | Status | Key Files | Reusable? |
|------------|--------|-----------|-----------|
| PCS-026 EvidencePipeline | Exists | `packages/evidence/src/pipeline.ts` | Yes — don't duplicate |
| VerificationEvidenceBundle | Exists | `packages/evidence/src/types.ts` | Yes — reference, don't copy |
| EvidenceReference / EvidenceProvenance | Exists | `packages/evidence/src/types.ts` | Yes — reuse for surface context |
| Engineering Graph | Exists | `packages/engineering-graph/src/graph.ts` | Yes — traversal, search, insights |
| Activity Projection | Exists | `packages/activity-room/` | Yes — query, effective state |
| M11A Read API | Exists | `apps/api/src/routes/activity-room-m11a.ts` | Yes — read-only composition source |

### Configuration & Provider Resolution

| Capability | Status | Key Files | Reusable? |
|------------|--------|-----------|-----------|
| WorkspaceManifest | Exists | `packages/workspace/src/workspace-manifest.ts` | Yes |
| RepositoryBinding | Exists | `packages/workspace/src/repository-binding.ts` | Yes |
| ProviderManager | Exists | `packages/provider-runtime/src/index.ts` | Yes — authority |
| EngineeringRoutingRuntime | Exists | `packages/provider-runtime/src/engineering-routing.ts` | Yes — authority |
| Conversation ProviderRouter | Exists | `packages/conversation-runtime/src/provider/router.ts` | Yes — online/offline failover |

### Auth & Governance

| Capability | Status | Key Files | Reusable? |
|------------|--------|-----------|-----------|
| Bearer token auth | Exists | `apps/api/src/auth.ts` | Yes |
| RBAC (8 roles) | Exists | `packages/permissions/src/index.ts` | Yes |
| WorkflowOrchestrator | Exists | `packages/workflow-orchestrator/src/orchestrator.ts` | Yes — authority |
| Execution Policy (M3) | Exists | `packages/agent-harness/src/execution-policy.ts` | Yes — authority |
| AI Invocation Guard (M4) | Exists | `packages/agent-harness/src/ai-invocation-guard.ts` | Yes — authority |
| Agent Harness Runtime | Exists | `packages/agent-harness/src/index.ts` | Yes |
| M12 Contextual Assistant | **Does not exist** | — | Must create (GA-1) |

### Degraded-Mode Infrastructure

| Capability | Status | Key Files | Reusable? |
|------------|--------|-----------|-----------|
| Runtime degraded state machine | Exists | `packages/runtime/src/index.ts` | Yes |
| Health propagation | Exists | `packages/workspace/src/runtime/health-aggregator.ts` | Yes |
| Provider health tracker | Exists | `packages/provider-runtime/src/provider-health-tracker.ts` | Yes |
| Conversation router fallback | Exists | `packages/conversation-runtime/src/provider/router.ts` | Yes |
| Fallback dispatcher | Exists | `packages/workflow-orchestrator/src/distributed/fallback-dispatcher.ts` | Yes |

---

## D. Authority Reconciliation

| Capability | Existing Owner | Authoritative State | Consumer | Proposed M-B1 Relationship | Classification |
|------------|---------------|---------------------|----------|---------------------------|----------------|
| **Authority audit (GA-0)** | Documentation | AR-P1.5 §8 authority matrix | All components | Extend with intelligence-layer authorities | **EXTEND** |
| **Floating Assistant UI (GA-1)** | ShellLayout | React component tree | Users | New component mounted in ShellLayout overlay slot | **NEW** |
| **Conversation state (GA-2)** | ConversationService (`@vestara/conversation`) | `SqliteConversationStore` | Chat, Activity Room | Extend to expose Activity Room as conversation surface | **EXTEND** |
| **Surface context composition (GA-3)** | Engineering Graph, Activity Projection, Evidence | Read-only queries | Context Intelligence (future) | New API endpoint composing existing read-only sources | **NEW** (API only) |
| **Diagnostic contracts (DIAG-0)** | Diagnostics (RI-3) | `collect.ts` OS-level collectors | Observer (future) | New TypeScript type definitions extending diagnostic model | **NEW** (types only) |
| **Activity Room state** | Activity Room (M9/M10) | `SqliteActivityStore`, M11A Read API | Activity Room UI | No change. Global Assistant consumes via GA-3 composition, not direct access. | **REUSE** |
| **Workflow Authority** | WorkflowOrchestrator | State machines, event-sourced | Task dispatch | No change. Global Assistant does not dispatch, approve, or mutate workflow. | **REUSE** |
| **Routing Authority** | EngineeringRoutingRuntime | Policy-based candidate evaluation | AI invocations | No change. Global Assistant uses M4 routing for AI calls, does not own routing. | **REUSE** |
| **Governance** | Execution Policy (M3) + AI Invocation Guard (M4) | Fail-closed guards | All AI invocations | No change. Global Assistant AI calls go through M4 guard. | **REUSE** |
| **Provider/model resolution** | ProviderManager + EngineeringRoutingRuntime | Three-layer resolution | AI invocations | No change. Global Assistant uses existing resolution, does not own it. | **REUSE** |
| **Human ingress** | Activity Room (`POST /api/messages`) | AAR-001E canonical | Humans | No change. GA-2 does not create new ingress. | **REUSE** |
| **Evidence bundles** | PCS-026 EvidencePipeline | `VerificationEvidenceBundle` | Verification | No change. GA-3 references evidence, does not create or own it. | **REUSE** |
| **Engineering Graph** | `@vestara/engineering-graph` | In-memory adjacency store | Traversal, search | GA-3 reads graph via existing API. No ownership change. | **REUSE** |

### Authority Conflicts

**None identified.** All M-B1 capabilities either extend existing authorities with clear boundaries or create new non-authoritative components (UI, types, API composition). No M-B1 component silently becomes authority for conversation, routing, workflow, execution, governance, verification, provider/model resolution, or Activity Room state.

---

## E. Global Assistant Boundary

### Minimum Architecture for Floating Global Assistant

The floating Global Assistant requires:

1. **A React component** (new) — floating panel/overlay rendered in `ShellLayout.tsx` outside the flex layout (same pattern as `Inspector`/`GraphSearch`).
2. **A context provider** (new) — manages open/close state, survives navigation (same pattern as `GraphContext`).
3. **An API endpoint** (new, GA-3) — composes existing data sources for the assistant to display.
4. **Conversation integration** (GA-2) — uses existing `ConversationService` for message threads.
5. **No new persistence** — conversation state lives in `SqliteConversationStore`. No new database.
6. **No new authority** — assistant reads from existing authorities, never writes to them.

### Verification Checklist

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Persists across Workspace navigation | ✅ | Mount in ShellLayout, state in context provider (proven pattern: GraphContext + Inspector) |
| Independent of Activity Room/M11C availability | ✅ | Separate component, separate API endpoint (GA-3). Activity Room downtime does not affect assistant. |
| Consumes bounded surface context | ✅ | GA-3 API endpoint composes Engineering Graph, Activity Projection, Evidence at bounded scope |
| Uses existing conversation/ingress authority | ✅ | GA-2 extends ConversationService, does not create new ingress |
| Uses M4 provider/model authority | ✅ | Assistant AI calls go through AiInvocationService → AI Invocation Guard → EngineeringRoutingRuntime |
| Submits intent through existing governed paths | ✅ | If assistant triggers actions, they go through Workflow/Governance (existing) |
| Non-authoritative for execution | ✅ | INV-CTX-1: context relevance does not confer execution authority. RI-1: assistant must not own workflow/routing/governance/evidence. |

### What Would Accidentally Make Global Assistant a Second Activity Room

| Anti-Pattern | Why It's Dangerous | M-B1 Prevention |
|-------------|-------------------|-----------------|
| Owns conversation state independent of Conversation Authority | Creates parallel conversation authority, violates AR-P1.5 §4.1 | GA-2 extends ConversationService, does not create new store |
| Dispatches tasks or approves workflows | Becomes workflow engine, violates Workflow Authority boundary | GA-1 is presentation-only; intent submission goes through existing governed paths |
| Routes provider/model selections | Becomes routing authority, violates RI-4/Routing boundary | AI calls use M4 AiInvocationService |
| Collects its own diagnostic data | Duplicates Diagnostics (RI-3), creates competing evidence sources | GA-3 reads from existing Diagnostics API |
| Maintains its own Activity Room state | Duplicates M9/M10 projection, creates competing activity authority | GA-3 composes read-only from existing M11A API |
| Interprets human choices as executable operations | Violates AAR-001E (human choice ≠ governance approval ≠ execution authorization) | GA-1 surfaces intent; execution goes through governed paths |

---

## F. Diagnostics Foundation

### Existing Diagnostic Mechanisms

| Mechanism | Scope | Data Collected | M-B1 Reuse? |
|-----------|-------|---------------|-------------|
| `collect.ts` (16 collectors) | OS-level | CPU, memory, disk, GPU, Docker, git, processes, versions, health | **Extend** — M-B2 DIAG-1 adds Vestara-runtime collectors |
| `GET /api/diagnostics/health` | Health checks | 10 health checks with readiness score | **Reuse** — GA-3 can compose for surface context |
| `GET /api/diagnostics/m11a-health` | WASM/sql.js | Watcher health, snapshot latency, process memory, persistence count | **Reuse** — model for future diagnostic contracts |
| `HealthCheck` interface | Contract | `{ id, name, status, detail }` | **Reuse** — extend for Vestara-runtime checks |
| `M11AInstrumentation` interface | Contract | Watcher, DB, snapshot, memory metrics | **Extend** — pattern for DiagnosticSnapshot |

### Reconciliation Against M-B1 DIAG-0

**DIAG-0 defines types, not implementations.** The existing mechanisms become sources behind the common contract:

| DIAG-0 Contract | Existing Source | Relationship |
|-----------------|----------------|-------------|
| `DiagnosticSnapshot` | `M11AInstrumentation` + future DIAG-1 collectors | New type; existing data flows into it |
| `DiagnosticIncidentBundle` | No existing equivalent | New type; references (not contains) `VerificationEvidenceBundle` |
| `DiagnosticCorrelation` | No existing equivalent | New type; links related events to incident IDs |
| `DiagnosticIncidentTimeline` | No existing equivalent | New type; ordered sequence of diagnostic events |

**Key decision:** DIAG-0 creates type definitions only. No new telemetry is created. No existing collectors are modified. The existing M11A instrumentation and health checks remain as-is and become data sources for DIAG-1 (M-B2) implementations.

### Authoritative Source Flow (Preserved)

```
Sources (collect.ts, M11A instrumentation)
    → Diagnostics (future DIAG-1, DIAG-2 implementations)
        → Observer (future OBS-0, OBS-1 — not M-B1)
```

**Observer implementation is not authorized in M-B1.** DIAG-0 defines the contracts that Observer will eventually consume.

---

## G. Evidence Boundary

### What M-B1 Actually Requires from Evidence-Reference Model

| M-B1 Need | Evidence Requirement | Source |
|-----------|---------------------|--------|
| GA-3 Surface Context | Read-only access to `VerificationEvidenceBundle` metadata (id, checks, confidence, evidence refs) | PCS-026 `EvidencePipeline` |
| GA-3 Surface Context | `EvidenceReference` for display (kind, summary, provenance) | PCS-026 `EvidenceReference` |
| GA-0 Authority Audit | Document which evidence authorities exist | Documentation only |
| DIAG-0 Diagnostic Contracts | `DiagnosticIncidentBundle` references (not contains) evidence bundles | New type; FK array to PCS-026 bundles |

### Reconciliation Against PCS-026

| PCS-026 Contract | M-B1 Usage | Action |
|------------------|-----------|--------|
| `VerificationEvidenceBundle` | GA-3 reads metadata; DIAG-0 references via FK | **REUSE** — no modification |
| `EvidenceReference` | GA-3 displays kind/summary/provenance | **REUSE** — no modification |
| `EvidenceProvenance` | GA-3 surfaces lineage | **REUSE** — no modification |
| `EvidencePipeline.collect()` | Not used in M-B1 | No action |
| `ContentAddressedEvidenceStore` | Not used in M-B1 | No action |
| `BundleStore` | Not used in M-B1 | No action |

### What M-B1 Must NOT Do

- **Do not create a second EvidencePipeline.** GA-3 reads from existing pipeline output.
- **Do not copy authoritative evidence into an intelligence-owned database.** Evidence remains in PCS-026 stores; intelligence layer references via FK.
- **Do not modify `VerificationEvidenceBundle` or `EvidenceReference` contracts.** These are frozen (PCS-026).
- **Do not create an "intelligence evidence store."** DIAG-0 types reference existing evidence via `evidenceBundleRefs: string[]`.

---

## H. Degraded-Mode Analysis

### Scenario 1: Activity Room Unavailable

| Component | Impact | Operational? |
|-----------|--------|-------------|
| Global Assistant (GA-1) | Independent component. Can render without Activity Room data. | ✅ Yes |
| Surface Context (GA-3) | Reads from Engineering Graph, Activity Projection, Evidence. If M11A API is down, GA-3 returns partial data. | ✅ Partial |
| Conversation (GA-2) | ConversationService is independent of Activity Room. | ✅ Yes |
| DIAG-0 (types) | Types only, no runtime. | ✅ Yes |
| GA-0 (audit) | Documentation only. | ✅ Yes |

**INV-DM-1 preserved:** Global Assistant and core workspace continue operating.

### Scenario 2: Global Assistant Unavailable

| Component | Impact | Operational? |
|-----------|--------|-------------|
| Activity Room | Independent. No dependency on Global Assistant. | ✅ Yes |
| Chat (`/chat`) | Independent. Separate route. | ✅ Yes |
| Workflow/Governance | Independent. | ✅ Yes |
| All other workspace | ShellLayout renders without floating assistant. | ✅ Yes |

**INV-DM-1 preserved:** Core engineering capabilities unaffected.

### Scenario 3: Diagnostics Source Unavailable

| Component | Impact | Operational? |
|-----------|--------|-------------|
| Global Assistant | Cannot surface diagnostic findings. Context results still available from other sources. | ✅ Partial |
| Surface Context (GA-3) | Returns data from Engineering Graph and Activity Projection; diagnostic data absent. | ✅ Partial |
| DIAG-0 (types) | Types only, no runtime. | ✅ Yes |
| All other workspace | No impact. Diagnostics is read-only consumer. | ✅ Yes |

**INV-DM-1 preserved:** Intelligence capabilities degrade; core capabilities unaffected.

### Scenario 4: AI Provider/Model Unavailable

| Component | Impact | Operational? |
|-----------|--------|-------------|
| Global Assistant UI | Renders, shows findings/context. Cannot generate AI responses. | ✅ Partial |
| Conversation (GA-2) | ConversationService fails gracefully (provider router fallback). | ✅ Partial |
| Surface Context (GA-3) | Composes read-only data. No AI dependency. | ✅ Yes |
| All other workspace | No impact for non-AI features. | ✅ Yes |

**INV-DM-1 preserved:** AI capabilities degrade; non-AI capabilities unaffected.

### Scenario 5: Context Intelligence Unavailable/Not Yet Implemented

| Component | Impact | Operational? |
|-----------|--------|-------------|
| Global Assistant | Renders with manually composed context (GA-3). No intelligent ranking. | ✅ Partial |
| Surface Context (GA-3) | Returns raw composed data. No intelligence layer. | ✅ Yes (raw) |
| Conversation (GA-2) | Works with existing ConversationService. No context enrichment. | ✅ Yes |
| All other workspace | No impact. Context Intelligence not yet built. | ✅ Yes |

**INV-DM-1 preserved:** Context Intelligence is additive; absence degrades intelligence, not core.

---

## I. Canonical Incident Mapping (GA-ACCEPT-SELF-MAINTENANCE-001)

### Incident Summary

The M11C WASM incident involved sql.js WASM memory corruption (`RuntimeError: memory access out of bounds`) after ~20h+ API uptime. The incident required manual diagnosis, restart, and evidence collection.

### What M-B1 Would Have Improved

| Capability | During Incident | With M-B1 | Gap Closed |
|------------|----------------|-----------|------------|
| **GA-0 Authority Audit** | Authorities consulted manually (which service owns what?) | Pre-existing authority map documents ownership, data flow, forbidden responsibilities | **Yes** — reduced diagnosis time |
| **GA-1 Floating Assistant** | Had to navigate to `/api/diagnostics/m11a-health` manually | Floating assistant surfaces diagnostic findings in-context | **Partial** — better visibility, not prevention |
| **GA-2 Conversation** | No structured conversation about incident | Conversation Authority tracks investigation thread | **Partial** — better documentation |
| **GA-3 Surface Context** | Had to manually correlate M11A health, process memory, DB state | Composed diagnostic + context data at API boundary | **Yes** — faster correlation |
| **DIAG-0 Diagnostic Contracts** | `M11AInstrumentation` existed but no incident-level contracts | `DiagnosticIncidentBundle` type enables structured incident recording | **Partial** — better structure for future incidents |

### What M-B1 Would NOT Have Improved

| Capability | Why Not | Belongs To |
|------------|---------|-----------|
| **Diagnostic snapshot collection** (WASM memory, process health) | M-B1 defines contracts (DIAG-0), not collectors | M-B2 DIAG-1 |
| **Degradation detection** (threshold crossings, trend analysis) | Requires diagnostic data collection first | M-B2 OBS-4 |
| **Automated recovery** (service restart, state restoration) | Requires diagnostics + observer + workflow integration | M-B7 ENG-6 |
| **Root cause analysis** (why did WASM corrupt?) | Requires observer analysis over time | M-B3 OBS-2, M-B4 CTX-1 |
| **Incident knowledge accumulation** (historical patterns) | Requires full diagnostic pipeline | M-B8 EFF-4 |

### Canonical Scenario Checkpoint

GA-0 authority audit must document:
1. Which authorities were manually consulted during the M11C incident (Diagnostics, Activity Room, API server)
2. What evidence was available vs manually reconstructed (M11A instrumentation existed but was not at fingertips)
3. What the authority boundaries were that constrained the response (Activity Room authority, API server lifecycle)
4. What would have been different with a pre-existing authority map (faster identification of responsible components)

---

## J. Proposed Bounded Implementation Decomposition

### Slice 1: GA-0 — Authority Audit (Documentation)

| Field | Value |
|-------|-------|
| **Capability** | Authority audit document covering all Vestara authorities |
| **Likely Files/Modules** | `docs/blueprint/VESTARA-INTELLIGENCE-AUTHORITY-AUDIT.md` (new) |
| **Authority Boundaries** | None. Documentation only. |
| **Dependencies** | None. Reads AR-P1.5, ARX-015, architecture review. |
| **Verification Strategy** | Cross-reference check against AR-P1.5 §8 authority matrix. Canonical scenario walkthrough. |
| **Acceptance Evidence** | Document exists with ownership matrix covering all authorities. References M11C incident. |
| **Estimated Risk** | **Low** — Pure documentation. No code. |

### Slice 2: DIAG-0 — Diagnostic Contracts (Types)

| Field | Value |
|-------|-------|
| **Capability** | TypeScript type definitions for `DiagnosticSnapshot`, `DiagnosticIncidentBundle`, `DiagnosticCorrelation`, `DiagnosticIncidentTimeline` |
| **Likely Files/Modules** | `packages/diagnostics/src/types.ts` (new package or extend `packages/types/src/`) |
| **Authority Boundaries** | Diagnostics (RI-3) owns collection. Types are shared contracts. |
| **Dependencies** | PCS-026 `EvidenceReference` (for FK references). |
| **Verification Strategy** | Type compilation test. No runtime behavior. |
| **Acceptance Evidence** | TypeScript types compile. Documented in architecture review. |
| **Estimated Risk** | **Low** — Pure types. No runtime. |

### Slice 3: GA-3 — Surface Context API (API Endpoint)

| Field | Value |
|-------|-------|
| **Capability** | GET endpoint composing Engineering Graph, Activity Projection, and Evidence data |
| **Likely Files/Modules** | `apps/api/src/routes/surface-context.ts` (new route) |
| **Authority Boundaries** | Read-only composition. No new authority. Consumes existing read-only APIs. |
| **Dependencies** | Engineering Graph API, Activity Projection query, M11A Read API, Evidence metadata. |
| **Verification Strategy** | API test: GET endpoint returns composed data. Verify no mutation side effects. |
| **Acceptance Evidence** | API test passes. Response includes data from all three sources. |
| **Estimated Risk** | **Low** — Read-only composition. No persistence, no mutation. |

### Slice 4: GA-2 — Independent Conversation (Adapter)

| Field | Value |
|-------|-------|
| **Capability** | Adapter or extension enabling Activity Room as a conversation surface via Conversation Authority |
| **Likely Files/Modules** | `apps/api/src/routes/conversations.ts` (extend) or new adapter in `packages/conversation/` |
| **Authority Boundaries** | Conversation Authority owns state. No new ingress. No new persistence. |
| **Dependencies** | `@vestara/conversation` ConversationService, Activity Room message model. |
| **Verification Strategy** | Code review: no new persistence, no new authority. Integration test: conversation thread persists across Activity Room sessions. |
| **Acceptance Evidence** | G-MB1-4 satisfied. No new ingress paths created. |
| **Estimated Risk** | **Low–Medium** — Requires careful boundary enforcement. |

### Slice 5: GA-1 — Floating Assistant (UI Component)

| Field | Value |
|-------|-------|
| **Capability** | Floating assistant panel in workspace UI, persistent across navigation |
| **Likely Files/Modules** | `apps/workspace/src/components/assistant/GlobalAssistant.tsx` (new), `apps/workspace/src/components/assistant/AssistantContext.tsx` (new), `apps/workspace/src/layouts/ShellLayout.tsx` (extend — mount assistant) |
| **Authority Boundaries** | Presentation-only. No workflow/routing/governance/evidence authority. AI calls through M4. |
| **Dependencies** | GA-3 API endpoint, ConversationService, existing chat components, ShellLayout overlay slot. |
| **Verification Strategy** | Component test: renders in ShellLayout. Visual test: floating position persists across navigation. Code review: no authority violations. |
| **Acceptance Evidence** | G-MB1-3 satisfied. Component renders with diagnostic/contextual data. |
| **Estimated Risk** | **Low–Medium** — UI component with clear boundaries. |

### Recommended Implementation Order

```
Slice 1 (GA-0) → Slice 2 (DIAG-0) → Slice 3 (GA-3) → Slice 4 (GA-2) → Slice 5 (GA-1)
```

**Rationale:**
- GA-0 (audit) is prerequisite for all other phases (per development plan)
- DIAG-0 (types) has no dependencies and enables M-B2 contracts
- GA-3 (API) provides the data surface that GA-1 (UI) consumes
- GA-2 (conversation) enables GA-1's conversation features
- GA-1 (UI) is last because it depends on all prior slices

### Recommended First Implementation Slice

**Slice 1: GA-0 — Authority Audit**

Zero code risk. Pure documentation. Establishes the authority map that all subsequent slices reference. Must complete before GA-1, GA-2, or GA-3 can be verified against authority boundaries.

---

## K. Stop Conditions

### Discoveries

| # | Classification | Description | Evidence |
|---|---------------|-------------|----------|
| 1 | **OBSERVATION** | M12 Contextual Assistant does not exist in the codebase. GA-1 creates it from scratch. | Zero search results for `M12`, `m12`, `ContextualAssistant` across entire repo. |
| 2 | **OBSERVATION** | Two distinct conversation subsystems exist: `@vestara/conversation` (free-form chat) and `@vestara/interaction-app` (structured decisions). GA-2 must correctly bridge to the former. | `packages/conversation/` vs `packages/interaction-app/` — different contracts, different persistence. |
| 3 | **OBSERVATION** | No floating/persistent UI infrastructure exists beyond Toast, Inspector, and GraphSearch. GA-1 must create the first floating assistant pattern. | `ShellLayout.tsx` has overlay slots but no FAB or persistent widget. |
| 4 | **OBSERVATION** | The `Drawer` component is the most reusable overlay primitive (resizable, position-configurable, localStorage sizing). Could be the foundation for the floating assistant panel. | `packages/workspace-ui/src/components/ui/Drawer.tsx` (239 lines). |
| 5 | **OBSERVATION** | Existing health checks are OS-level (10 checks in `collect.ts`). Vestara-runtime health (WASM, SQLite, event loop) does not exist. DIAG-0 defines the gap; M-B2 fills it. | `collect.ts` health checks cover workspace, filesystem, node, python, git, docker, gpu, memory, disk, dependencies. |
| 6 | **OBSERVATION** | The 4 unstaged R6/M11C modifications have zero overlap with M-B1 candidate files. Dirty tree does not block M-B1. | File-level analysis in §A. |
| 7 | **ADJACENT** | The anonymous auth fallback (`local-operator` with `admin` role) is a significant security posture. M-B1 Global Assistant should not weaken this but should be aware of it. | `apps/api/src/auth.ts` — unauthenticated local access is fully privileged. |
| 8 | **OBSERVATION** | Multiple RBAC systems coexist (core permissions, settings framework, OpenCode permissions, decision pipeline adapter). M-B1 does not need to reconcile them; this is an existing architectural pattern. | `packages/permissions/`, `packages/settings-framework/`, `packages/opencode-runtime/src/permissions/`. |

### Conflicts

**None.** The frozen architecture review is consistent with production reality. No modification to either side is required.

---

## Summary

| Field | Value |
|-------|-------|
| **Document Path** | `docs/blueprint/VESTARA-INTELLIGENCE-MB1-PREFLIGHT.md` |
| **Exact Five M-B1 Phases** | GA-0 (Authority Audit), GA-1 (Floating Assistant), GA-2 (Independent Conversation), GA-3 (Surface Context), DIAG-0 (Diagnostic Contract) |
| **Reuse/Extend/New Summary** | 8 REUSE, 3 EXTEND, 3 NEW (1 UI component, 1 API endpoint, 1 type package) |
| **Authority Conflicts** | None |
| **Dirty-Tree Overlap Assessment** | Zero overlap. 4 unstaged R6/M11C modifications do not touch any M-B1 candidate file. |
| **Recommended Implementation Slices** | 5 slices: GA-0 → DIAG-0 → GA-3 → GA-2 → GA-1 |
| **Blockers** | None |
| **Recommended First Implementation Slice** | GA-0 — Authority Audit (documentation only, zero code risk, prerequisite for all other slices) |

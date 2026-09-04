---
title: VESTARA-INTELLIGENCE M-B1 — GA-0 Authority Audit
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# VESTARA-INTELLIGENCE M-B1 — GA-0 Authority Audit

**Date:** 2026-08-31
**Phase:** GA-0 (Authority Audit)
**Status:** Complete — documentation only, no source/test/schema/persistence/API/UI/config/behavior changes
**Governing Specification:** VESTARA-INTELLIGENCE Architecture Review (frozen `2661a54`)

---

## 1. Authority Matrix

### 1.1 Conversation

| Field | Value |
|-------|-------|
| **Capability** | Free-form human-to-AI conversation (chat threads, message history, SSE streaming) |
| **Authority** | `ConversationService` (`packages/conversation/src/index.ts`) |
| **Authoritative State** | In-memory map + optional `ConversationStore` persistence. Single writer: all mutations flow through the service (lines 78–98). |
| **Persistence** | `SqliteConversationStore` → `.vestara/conversations/conversations.db` (`packages/conversation-runtime/src/conversation-store.ts`) |
| **Writer(s)** | `DefaultConversationService` (sole writer via `createConversation`, `sendMessage`, `sendMessageStream`, `closeConversation`) |
| **Reader(s)** | Conversations REST route (`apps/api/src/routes/conversations.ts`), `DefaultConversationEngine` (`packages/conversation-runtime/src/index.ts`), Global Assistant (future GA-2) |
| **Events/API** | `POST /api/conversations`, `GET /api/conversations`, `GET/DELETE /api/conversations/:id`, `POST /api/conversations/:id/messages`, `POST /api/conversations/:id/stream` |
| **M-B1 Relationship** | GA-2 extends ConversationService to expose Activity Room as a conversation surface. No new ingress, no new persistence. |
| **Forbidden Ownership** | Must not own workflow, routing, governance, evidence, or Activity Room state. |
| **Authority Claim** | `packages/conversation/src/index.ts` lines 78–98 (constructor, single-writer pattern). `apps/api/src/workspace-context.ts` lines 769–781 (composition wiring, independent of Activity Room). |

### 1.2 Human Ingress

| Field | Value |
|-------|-------|
| **Capability** | How humans initiate actions in the system |
| **Authority** | Activity Room message ingress (`apps/api/src/routes/activity-room.ts`) — AAR-001E canonical |
| **Authoritative State** | Human messages are conversation events, never authorized actions. Appended as `agent-message` activities with `actor.type = 'human'`. |
| **Persistence** | Activity Room activity store (M9 SQLite) |
| **Writer(s)** | `POST /api/messages` route handler (lines 280–340) |
| **Reader(s)** | Activity Room consumers, Workflow Orchestrator (for addressed messages) |
| **Events/API** | `POST /api/messages`, `POST /api/agents/:agentId/messages` |
| **M-B1 Relationship** | REUSE. GA-2 does not create new ingress. Global Assistant surfaces intent; execution goes through governed paths. |
| **Forbidden Ownership** | Human choice is NOT governance approval is NOT execution authorization (AAR-001E). |
| **Authority Claim** | `apps/api/src/routes/activity-room.ts` lines 280–340 (message append, AAR-001E boundary). |

### 1.3 Activity Room

| Field | Value |
|-------|-------|
| **Capability** | Live activity stream, participant visibility, workflow summary, interaction rendering |
| **Authority** | M9 Activity Store + M10 Projection + M11A Read API + M11B Realtime Transport |
| **Authoritative State** | Append-only M9 SQLite store (`DurableActivityStore`). M10 projection computes derived state. M11A serves read-only snapshots. M11B streams real-time updates. |
| **Persistence** | `.vestara/m9-activity.db` (M9), `.vestara/activity.db` (legacy, unused) |
| **Writer(s)** | M9 Ingestion Bridge (EventBus → M9), `InteractionEventBusAdapter` (interaction events → M9) |
| **Reader(s)** | M11A Read API, M11B WebSocket transport, Global Assistant (future GA-3 via composition) |
| **Events/API** | `GET /api/activity-room/v1/*`, `ws://.../ws/activity-room/v1` |
| **M-B1 Relationship** | REUSE. GA-3 composes M11A data at API boundary. Global Assistant is a sibling consumer, not an extension of Activity Room. |
| **Forbidden Ownership** | Must not become workflow engine, router, or execution service. Activity Room state is read-only for intelligence layer. |
| **Authority Claim** | `apps/api/src/routes/activity-room-m11a.ts` lines 144–151 (M11A state interface, read-only boundary). |

### 1.4 Workflow

| Field | Value |
|-------|-------|
| **Capability** | Task dispatch, approval, lifecycle (project/plan/task state machines) |
| **Authority** | `WorkflowOrchestrator` (`packages/workflow-orchestrator/src/orchestrator.ts`) |
| **Authoritative State** | Single writer of project/plan/task workflow state. State machine enforcement. Event-sourced. |
| **Persistence** | Workflow stores (project, plan, task, artifact, file-lock) |
| **Writer(s)** | `WorkflowOrchestrator` (sole writer via `createProject`, `startProject`, `approveProject`, `transitionTask`, etc.) |
| **Reader(s)** | Activity Room (workflow summary), agents (task assignments), Global Assistant (future GA-3 composition) |
| **Events/API** | `OrchestrationEvent` sink, `POST /api/workflows/*` routes |
| **M-B1 Relationship** | REUSE. Global Assistant reads workflow state via GA-3 composition. Does not dispatch, approve, or mutate. |
| **Forbidden Ownership** | Must not be overridden by intelligence layer. Orchestrator never executes agents directly (line 6–7). |
| **Authority Claim** | `packages/workflow-orchestrator/src/orchestrator.ts` lines 1–8 (docblock: "single writer of project/plan/task workflow state"). |

### 1.5 Routing

| Field | Value |
|-------|-------|
| **Capability** | Provider/model selection, candidate evaluation, health tracking |
| **Authority** | `EngineeringRoutingRuntime` (`packages/provider-runtime/src/engineering-routing.ts`) |
| **Authoritative State** | Policy-driven candidate evaluation and selection. `EngineeringProviderCatalog` owns provider registry. `ProviderHealthTracker` owns availability state. |
| **Persistence** | In-memory catalog + health state. `RoutingAssignment` with optimistic concurrency. |
| **Writer(s)** | `EngineeringProviderCatalog.register()` (sole provider registration path) |
| **Reader(s)** | `AiInvocationService` (M4), `GuardedAIProvider` (M4B), Global Assistant (future — via M4 routing for AI calls) |
| **Events/API** | `routing.selection-requested`, `routing.candidates-evaluated`, `routing.selection-resolved` events |
| **M-B1 Relationship** | REUSE. Global Assistant AI calls go through M4 routing. Does not own routing. |
| **Forbidden Ownership** | Routing decisions are not owned by Global Assistant, Activity Room, or intelligence layer. |
| **Authority Claim** | `packages/provider-runtime/src/engineering-routing.ts` lines 120–199 (resolve method, sole routing decision function). |

### 1.6 Agents/Teams

| Field | Value |
|-------|-------|
| **Capability** | Agent identity, team membership, role assignments |
| **Authority** | Agent/Team authority (`apps/api/src/routes/activity-room-m11a.ts` lines 180–199 — `composeParticipants()`) |
| **Authoritative State** | Agent/Team authority from config + M10 lifecycle projection. Participants composed from two authoritative sources. |
| **Persistence** | Agent storage (config), M10 projection |
| **Writer(s)** | Config (agent definitions), M10 projection (lifecycle state) |
| **Reader(s)** | M11A Read API (`composeParticipants()`), Activity Room UI |
| **Events/API** | `GET /api/activity-room/v1/participants` |
| **M-B1 Relationship** | REUSE. Global Assistant may display agent status via GA-3 composition. Does not own agent identity. |
| **Forbidden Ownership** | Agent identity is not owned by intelligence layer. |
| **Authority Claim** | `apps/api/src/routes/activity-room-m11a.ts` lines 180–199 (composeParticipants merges two authoritative sources). |

### 1.7 Provider/Model Resolution

| Field | Value |
|-------|-------|
| **Capability** | Three-layer provider/model resolution (ProviderManager → EngineeringRoutingRuntime → Provider-specific) |
| **Authority** | `ProviderManager` (`packages/provider-runtime/src/index.ts`) → `EngineeringRoutingRuntime` → Provider-specific routers |
| **Authoritative State** | Kernel-level lifecycle (register, load, unload, health). Policy-driven routing. Provider-specific failover. |
| **Persistence** | `WorkspaceManifest.providers` (provider config), in-memory health state |
| **Writer(s)** | `ProviderManager` (lifecycle), `EngineeringProviderCatalog` (registry), `ProviderHealthTracker` (health) |
| **Reader(s)** | `AiInvocationService` (M4), `GuardedAIProvider` (M4B), Conversation `ProviderRouter` |
| **Events/API** | Provider health events, routing resolution events |
| **M-B1 Relationship** | REUSE. Global Assistant uses existing resolution for AI calls. Does not own provider/model selection. |
| **Forbidden Ownership** | Provider/model resolution is not owned by intelligence layer. |
| **Authority Claim** | `packages/provider-runtime/src/index.ts` (ProviderManager is single entry point for provider lifecycle). |

### 1.8 Repository Binding

| Field | Value |
|-------|-------|
| **Capability** | Canonical repository identity resolution and confinement validation |
| **Authority** | `resolveRepositoryBinding()` (`packages/workspace/src/repository-binding.ts`) |
| **Authoritative State** | Single entry point for repository identity resolution. Strict precedence: env var → path → discovery → fail-closed. |
| **Persistence** | In-memory resolved binding |
| **Writer(s)** | `resolveRepositoryBinding()` (sole resolution function) |
| **Reader(s)** | `RuntimeSessionRegistry`, `GuardedAIProvider`, `AiInvocationService`, all execution contexts |
| **Events/API** | None (synchronous resolution) |
| **M-B1 Relationship** | REUSE. Global Assistant consumes resolved binding. Does not own repository identity. |
| **Forbidden Ownership** | Repository identity is not owned by intelligence layer. CWD is never silently authoritative (line 23–24). |
| **Authority Claim** | `packages/workspace/src/repository-binding.ts` lines 4, 12, 23–24, 108–120 (authoritative binding, fail-closed, single entry point). |

### 1.9 Runtime/Session Continuity

| Field | Value |
|-------|-------|
| **Capability** | Runtime lifecycle state machine, health, checkpoints, dependencies |
| **Authority** | `Runtime` class (`packages/runtime/src/index.ts`) |
| **Authoritative State** | Lifecycle state machine (created → initializing → running → suspended → degraded → recovering → quarantined → stopping → stopped → failed → destroyed). Every transition validated. |
| **Persistence** | In-memory state + optional checkpoint data |
| **Writer(s)** | `Runtime` instance (sole lifecycle transition authority via `initialize()`, `start()`, `suspend()`, `resume()`, `degrade()`, `recover()`, `stop()`, `destroy()`) |
| **Reader(s)** | Health aggregator, kernel, OS controller |
| **Events/API** | Runtime lifecycle events via EventBus |
| **M-B1 Relationship** | REUSE. Global Assistant consumes runtime health. Does not own lifecycle. |
| **Forbidden Ownership** | Runtime lifecycle is not owned by intelligence layer. |
| **Authority Claim** | `packages/runtime/src/index.ts` lines 35–47 (transition table), lines 198–203 (transition validation). |

### 1.10 Governance/Permissions

| Field | Value |
|-------|-------|
| **Capability** | Role-based authorization, execution policy enforcement, AI invocation guarding |
| **Authority** | `PermissionManager` (`packages/permissions/src/index.ts`) + `ExecutionPolicy` (`packages/agent-harness/src/execution-policy.ts`) + `AI Invocation Guard` (`packages/agent-harness/src/ai-invocation-guard.ts`) |
| **Authoritative State** | PermissionManager: role-based authorization (8 roles, 55 operations). ExecutionPolicy: three-tier execution modes (hermetic/governed/live), effective policy may become stricter never weaker. AI Invocation Guard: single choke point for all AI invocations, fail-closed. |
| **Persistence** | `InMemoryPermissionStore`, `BudgetState` (in-memory) |
| **Writer(s)** | `PermissionManager.grant()`/`revoke()` (permission grants), `ExecutionPolicy.resolveEffectivePolicy()` (pure function), `AI Invocation Guard.guardAiInvocation()` (pure validation) |
| **Reader(s)** | `Runtime.checkPermission()`, `GuardedAIProvider`, `AiInvocationService`, all execution contexts |
| **Events/API** | Permission check results, execution policy decisions |
| **M-B1 Relationship** | REUSE. Global Assistant AI calls go through M4 guard. Does not own governance. |
| **Forbidden Ownership** | Governance/permissions are not owned by intelligence layer. Policy can only strengthen, never weaken (line 7). |
| **Authority Claim** | `packages/agent-harness/src/execution-policy.ts` lines 1–9 ("never silently weaker"). `packages/agent-harness/src/ai-invocation-guard.ts` lines 1–16 ("single choke point for all AI invocations"). |

### 1.11 Verification/Evidence

| Field | Value |
|-------|-------|
| **Capability** | Evidence collection, content-addressing, bundle assembly, confidence derivation, verification verdicts |
| **Authority** | PCS-026 `EvidencePipeline` (`packages/evidence/src/pipeline.ts`) + `VerifierService` (`packages/evidence/src/verifier/verifier-service.ts`) |
| **Authoritative State** | Frozen PCS-026 contracts. Immutable bundles. Confidence derived never agent-assigned. Corrections link to originals, never mutate. |
| **Persistence** | `ContentAddressedEvidenceStore`, `ImmutableEvidenceManifestStore`, `BundleStore` (filesystem JSON) |
| **Writer(s)** | `EvidencePipeline.buildBundle()` (sole bundle assembly path), `VerifierService.verify()` (sole verification path) |
| **Reader(s)** | Activity Room (evidence refs), Global Assistant (future GA-3 composition), Historical Retrieval |
| **Events/API** | `harness.verification-bundle` events |
| **M-B1 Relationship** | REUSE. GA-3 reads evidence metadata. DIAG-0 references evidence bundles via FK. Does not create or own evidence. |
| **Forbidden Ownership** | Evidence bundles are not owned by intelligence layer. Confidence is derived never agent-assigned (types.ts line 6). |
| **Authority Claim** | `packages/evidence/src/types.ts` lines 1–9 (PCS-026 frozen contracts). `packages/evidence/src/pipeline.ts` lines 1–8 (pipeline authority). |

### 1.12 Engineering Graph

| Field | Value |
|-------|-------|
| **Capability** | Entity/relationship storage, traversal, search, insights, health |
| **Authority** | `EngineeringGraph` (`packages/engineering-graph/src/graph.ts`) |
| **Authoritative State** | Canonical relationship engine. No module owns relationship logic anymore (index.ts line 7). Event-sourced temporal state. |
| **Persistence** | In-memory adjacency store + `EngineeringEventStore` (event-sourced) |
| **Writer(s)** | `EntityRegistry` (hydration via `EntitySource`/`RelationshipSource` adapters), `EngineeringEventStore` (append-only events) |
| **Reader(s)** | Universal Inspector, search, traversal, insights, GA-3 (future) |
| **Events/API** | `entity-created`, `entity-updated`, `relationship-added`, `relationship-removed` events |
| **M-B1 Relationship** | REUSE. GA-3 reads graph via existing API. Does not own relationship logic. |
| **Forbidden Ownership** | Relationship logic is exclusively owned by this package (index.ts line 7). No other module may own it. |
| **Authority Claim** | `packages/engineering-graph/src/graph.ts` lines 1–7 ("pure, zero-dependency adjacency store"). `packages/engineering-graph/src/index.ts` lines 4–7 ("canonical relationship engine... no module owns relationship logic anymore"). |

### 1.13 Diagnostics

| Field | Value |
|-------|-------|
| **Capability** | System diagnostic data collection (CPU, memory, disk, GPU, Docker, git, processes, health) |
| **Authority** | `collect.ts` (`apps/api/src/diagnostics/collect.ts`) |
| **Authoritative State** | Pure Node.js data collection. Deliberately free of `@vestara` imports (line 8). Every collector degrades gracefully (lines 6–7). |
| **Persistence** | None (pure functions, no state) |
| **Writer(s)** | Collectors produce data; no persistent state is written |
| **Reader(s)** | `GET /api/diagnostics/*` routes, `GET /api/diagnostics/health`, `GET /api/diagnostics/m11a-health` |
| **Events/API** | 16+ diagnostic endpoints (`/api/diagnostics/summary`, `/cpu`, `/memory`, `/health`, etc.) |
| **M-B1 Relationship** | EXTEND. DIAG-0 defines Vestara-runtime diagnostic contracts (types). Existing OS-level collectors remain as data sources. |
| **Forbidden Ownership** | Must not perform analysis (Observer owns analysis). Must not import `@vestara/*` (line 8). Must not throw (lines 6–7). |
| **Authority Claim** | `apps/api/src/diagnostics/collect.ts` lines 1–9 (isolation boundary, graceful degradation). |

### 1.14 Logging/Telemetry

| Field | Value |
|-------|-------|
| **Capability** | Request-scoped structured logging, service-scoped structured logging, real-time agent telemetry |
| **Authority** | `RequestLogger` (`apps/api/src/http/request-logger.ts`) + `Kernel Logger` (`packages/logger/src/index.ts`) + `TelemetryRuntime` (`packages/telemetry/src/index.ts`) |
| **Authoritative State** | RequestLogger: NDJSON, request-scoped, sensitive redaction, must not crash requests (line 105). Kernel Logger: structured JSON, service-scoped, sink-based. TelemetryRuntime: in-memory agent state, ring buffer. |
| **Persistence** | RequestLogger → stdout. Kernel Logger → console/file sinks. TelemetryRuntime → in-memory. |
| **Writer(s)** | `RequestLogger.log()`, `Kernel Logger` methods, `TelemetryRuntime.track()` |
| **Reader(s**) | `/api/telemetry/*` routes, log consumers, UI telemetry panel |
| **Events/API** | `GET /api/telemetry`, `GET /api/telemetry/agents`, `GET /api/telemetry/events`, `GET /api/telemetry/http` |
| **M-B1 Relationship** | REUSE. Global Assistant may surface telemetry via GA-3 composition. Does not own logging. |
| **Forbidden Ownership** | Logging must not crash requests (RequestLogger line 105). Sink failures must not crash logger (Kernel Logger lines 109, 146). |
| **Authority Claim** | `apps/api/src/http/request-logger.ts` lines 1–7 (structured logging, isolation from global state). `packages/logger/src/index.ts` lines 1–11 (structured JSON, Universal Interface). |

### 1.15 Workspace Shell

| Field | Value |
|-------|-------|
| **Capability** | Application layout (sidebar, header, content area), navigation, overlays |
| **Authority** | `ShellLayout` (`apps/workspace/src/layouts/ShellLayout.tsx`) |
| **Authoritative State** | Root layout for all authenticated pages. Renders sidebar, header, content, and overlay slots. |
| **Persistence** | None (React component tree) |
| **Writer(s)** | React rendering engine |
| **Reader(s)** | All workspace pages, Global Assistant (future GA-1 mount point) |
| **Events/API** | None (UI component) |
| **M-B1 Relationship** | EXTEND. GA-1 mounts floating assistant in ShellLayout overlay slot. |
| **Forbidden Ownership** | Shell layout is not owned by intelligence layer. |
| **Authority Claim** | `apps/workspace/src/layouts/ShellLayout.tsx` lines 56–73 (layout structure with overlay slots). |

### 1.16 Configuration/Settings

| Field | Value |
|-------|-------|
| **Capability** | Workspace identity, analysis, knowledge state, provider config, settings framework |
| **Authority** | `WorkspaceManifest` (`packages/workspace/src/workspace-manifest.ts`) + Settings Framework (`packages/settings-framework/`) |
| **Authoritative State** | WorkspaceManifest: canonical persistence for `.vestara/workspace.json` (line 5: "canonical root for everything related to a repository"). Settings Framework: module-level RBAC (user/admin/superadmin). |
| **Persistence** | `.vestara/workspace.json`, settings stores |
| **Writer(s)** | `WorkspaceManifest` static methods (`create`, `updateKnowledge`, `cacheNarrative`, `touch`, `updateFiles`, `save`) |
| **Reader(s**) | All components reading workspace config |
| **Events/API** | None (synchronous file I/O) |
| **M-B1 Relationship** | REUSE. Global Assistant reads workspace config. Does not own configuration. |
| **Forbidden Ownership** | Configuration is not owned by intelligence layer. |
| **Authority Claim** | `packages/workspace/src/workspace-manifest.ts` lines 2–7 ("canonical root for everything related to a repository"). |

---

## 2. GA-2 Dependency Semantics

### Question

Is `ConversationService` independently composable, or does any production path require Activity Room/M11C?

### Evidence

| Component | File | Activity Room/M11 Dependency? | Independently Composable? |
|-----------|------|------------------------------|--------------------------|
| `DefaultConversationService` | `packages/conversation/src/index.ts` lines 78–98 | **NO** — imports only `@vestara/context`, `@vestara/event-bus`, `@vestara/logger`, `@vestara/shared`, `@vestara/stream` | **YES** |
| ConversationService wiring | `apps/api/src/workspace-context.ts` lines 769–781 | **NO** — receives `DefaultContextAssembler`, `ProviderExecutor`, `EventBus`, `Logger`, `ConversationStore` — all Activity Room-free | **YES** |
| Conversations route | `apps/api/src/routes/conversations.ts` | **NO** — uses only `ctx.conversationService` | **YES** |
| Activity Room route | `apps/api/src/routes/activity-room.ts` | N/A (this IS Activity Room) | N/A — does NOT use `conversationService` |
| M11A route | `apps/api/src/routes/activity-room-m11a.ts` | N/A (this IS M11A) | N/A — does NOT use `conversationService` |
| `DefaultConversationEngine` | `packages/conversation-runtime/src/index.ts` | **NO** — imports only `@vestara/conversation`, `@vestara/runtime`, `@vestara/event-bus`, `@vestara/logger`, `@vestara/shared` | **YES** |

### Topology

```
ConversationService (independent)
├──→ Chat UI (/chat route) — current consumer
├──→ Global Assistant (GA-2) — future consumer
└──→ (no Activity Room dependency)

Activity Room (independent)
├──→ Activity Room UI (/activity, /activity-v2) — current consumer
├──→ Global Assistant (GA-3) — future consumer (read-only composition)
└──→ (no ConversationService dependency)
```

### Conclusion

**ConversationService is fully independently composable.** There is strict bidirectional isolation:

1. ConversationService has **zero dependency** on Activity Room, M11A, M11B, or M11C — not in package source, runtime engine, or composition root wiring.
2. Activity Room has **zero dependency** on ConversationService — neither `activity-room.ts` nor `activity-room-m11a.ts` references `conversationService`.
3. The two systems share **only** `WorkspaceContext` as a common container (sibling fields at lines 150 and 161), with no cross-reference between them.
4. **No production path requires Activity Room/M11C to use ConversationService.** The `/api/conversations/*` routes work entirely through `ctx.conversationService`, backed by its own SQLite store, its own `DefaultContextAssembler`, and its own `ProviderExecutor`.

**GA-2 can compose ConversationService for Global Assistant without any Activity Room dependency.** The topology `ConversationAuthority → Global Assistant` and independently `ConversationAuthority → Activity Room` is architecturally clean. No BLOCKER.

---

## 3. DIAG-0 Classification Resolution

### Why DIAG-0 Appeared Under Both EXTEND and NEW

The preflight classified DIAG-0 as both EXTEND and NEW because:

| Aspect | Classification | Rationale |
|--------|---------------|-----------|
| **Type model** | **NEW** | `DiagnosticSnapshot`, `DiagnosticIncidentBundle`, `DiagnosticCorrelation`, `DiagnosticIncidentTimeline` do not exist as TypeScript types anywhere in the codebase |
| **Diagnostic sources** | **EXTEND** | Existing `collect.ts` (OS-level collectors), `M11AInstrumentation` interface, `HealthCheck` interface, and `GET /api/diagnostics/m11a-health` endpoint become data sources behind the new contract |
| **Common contract** | **NEW** | No existing type represents Vestara-runtime diagnostics (process health, WASM state, SQLite health, event loop status) |
| **Collection mechanism** | **NO CHANGE** | DIAG-0 defines types only. Existing collectors are not modified. No new telemetry is created. |

### Precise Classification

**DIAG-0 introduces new type definitions that EXTEND the existing diagnostic model.** Specifically:

| What Already Exists | Owner | What DIAG-0 Extends |
|---------------------|-------|---------------------|
| `collect.ts` (16 OS-level collectors) | Diagnostics (RI-3) | New Vestara-runtime collector types (DIAG-1 will implement) |
| `M11AInstrumentation` interface (lines 112–142 of `activity-room-m11a.ts`) | Activity Room (transport) | New `DiagnosticSnapshot` type that can represent M11A data |
| `HealthCheck` interface (lines 783–788 of `collect.ts`) | Diagnostics (RI-3) | New `DiagnosticIncidentBundle` that references health checks |
| `GET /api/diagnostics/m11a-health` endpoint | Diagnostics (RI-3) | New `DiagnosticCorrelation` type for incident-scoped correlation |

### Common Contract Feasibility

**Yes, a common contract can adapt existing diagnostic sources without creating a second diagnostics authority.** The approach:

1. `DiagnosticSnapshot` is a union type that can represent either OS-level data (from `collect.ts`) or Vestara-runtime data (from future DIAG-1 collectors).
2. `DiagnosticIncidentBundle` references (not contains) `VerificationEvidenceBundle` via FK — it does not duplicate evidence.
3. Existing `M11AInstrumentation` data flows into `DiagnosticSnapshot` as a data source — M11A ownership is not moved.
4. No new collection mechanism is created — DIAG-0 is types only.

### Preservation

```
Authoritative sources (collect.ts, M11A instrumentation)
    → Diagnostics (DIAG-0 types, future DIAG-1 implementations)
        → Consumers (Observer, Context Intelligence, Historical Retrieval)
```

DIAG-0 does not introduce duplicate telemetry collection. The existing sources remain authoritative. DIAG-0 defines the contract that DIAG-1 (M-B2) will implement.

---

## 4. M-B1 Dependency Boundaries

### GA-1 Floating Assistant

| Dependency Type | Dependency | Direction | Justification |
|----------------|-----------|-----------|---------------|
| **Hard** | ShellLayout | GA-1 mounts inside ShellLayout overlay slot | UI component requires layout host |
| **Hard** | React 19 | GA-1 is a React component | Runtime framework |
| **Hard** | GA-3 API endpoint | GA-1 consumes composed context data | Data source |
| **Hard** | ConversationService (GA-2) | GA-1 uses conversation for message threads | Conversation integration |
| **Optional** | Activity Room | GA-1 may display Activity Room data via GA-3 | Read-only composition, not operational dependency |
| **Forbidden** | WorkflowOrchestrator | GA-1 must not dispatch, approve, or mutate workflow | Violates Workflow Authority |
| **Forbidden** | EngineeringRoutingRuntime | GA-1 must not route provider/model selections | Violates Routing Authority |
| **Forbidden** | EvidencePipeline | GA-1 must not create or own evidence | Violates Evidence Authority |
| **Forbidden** | Activity Room state mutation | GA-1 must not write to M9/M10 | Violates Activity Room Authority |

### GA-2 Independent Conversation

| Dependency Type | Dependency | Direction | Justification |
|----------------|-----------|-----------|---------------|
| **Hard** | `@vestara/conversation` | GA-2 extends ConversationService | Core abstraction |
| **Hard** | `SqliteConversationStore` | GA-2 uses existing persistence | No new persistence |
| **Hard** | `DefaultContextAssembler` | GA-2 needs context for AI calls | Context assembly |
| **Hard** | ProviderExecutor | GA-2 needs AI provider access | AI execution |
| **Forbidden** | Activity Room | GA-2 must not depend on Activity Room availability | Bidirectional isolation confirmed |
| **Forbidden** | New ingress paths | GA-2 must not create new human ingress | Violates AAR-001E |
| **Forbidden** | New persistence stores | GA-2 must not create new conversation stores | Uses existing SqliteConversationStore |

### GA-3 Surface Context

| Dependency Type | Dependency | Direction | Justification |
|----------------|-----------|-----------|---------------|
| **Hard** | Engineering Graph | GA-3 reads graph via existing API | Data source |
| **Hard** | Activity Projection | GA-3 reads projection via existing query | Data source |
| **Hard** | M11A Read API | GA-3 reads activity stream data | Data source |
| **Hard** | Evidence metadata | GA-3 reads bundle metadata (not bundles) | Data source |
| **Forbidden** | EvidencePipeline | GA-3 must not create or own evidence | Read-only composition |
| **Forbidden** | EngineeringGraph mutation | GA-3 must not add entities or relationships | Read-only composition |
| **Forbidden** | Activity Store mutation | GA-3 must not append activities | Read-only composition |

### DIAG-0 Diagnostic Contract

| Dependency Type | Dependency | Direction | Justification |
|----------------|-----------|-----------|---------------|
| **Hard** | PCS-026 `EvidenceReference` | DIAG-0 types reference evidence via FK | Type dependency |
| **Optional** | `M11AInstrumentation` | DIAG-0 `DiagnosticSnapshot` can represent M11A data | Data source, not ownership transfer |
| **Optional** | `collect.ts` types | DIAG-0 can reference existing collector output types | Data source |
| **Forbidden** | New collection mechanisms | DIAG-0 must not create duplicate telemetry | Types only |
| **Forbidden** | Observer authority | DIAG-0 must not perform analysis | Observer owns analysis (RI-2) |

### Sibling Consumer Topology

```
                    ┌─────────────────────────┐
                    │    WorkspaceContext      │
                    │  (composition root)      │
                    └────────┬────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
    │ Conversation│  │ Activity    │  │ Global      │
    │ Service     │  │ Room        │  │ Assistant   │
    │ (GA-2)      │  │ (existing)  │  │ (GA-1, GA-3)│
    └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
           │                │                │
           ▼                ▼                ▼
    ConversationDB    M9 ActivityDB    Reads from both
    (own store)       (own store)      (read-only)
```

**Activity Room and Global Assistant are sibling consumers.** Neither is operational infrastructure for the other. Global Assistant reads from Activity Room via GA-3 composition (read-only), but Activity Room does not depend on Global Assistant for any operation.

---

## 5. Degraded-Mode Authority Validation

### Scenario 1: Activity Room Fails

| Capability | Authority Status | What Remains Authoritative |
|------------|-----------------|---------------------------|
| ConversationService | Independent. Zero Activity Room dependency. | ✅ Full authority |
| Global Assistant | Independent component. May lose Activity Room data via GA-3. | ✅ Full authority (partial data) |
| WorkflowOrchestrator | Independent. No Activity Room dependency. | ✅ Full authority |
| Routing | Independent. | ✅ Full authority |
| Governance | Independent. | ✅ Full authority |
| Diagnostics | Independent. | ✅ Full authority |

**No capability gains additional authority when Activity Room fails.**

### Scenario 2: Global Assistant Fails

| Capability | Authority Status | What Remains Authoritative |
|------------|-----------------|---------------------------|
| Activity Room | Independent. No Global Assistant dependency. | ✅ Full authority |
| ConversationService | Independent. | ✅ Full authority |
| WorkflowOrchestrator | Independent. | ✅ Full authority |
| All other capabilities | Independent. | ✅ Full authority |

**No capability gains additional authority when Global Assistant fails.**

### Scenario 3: Diagnostics Fails

| Capability | Authority Status | What Remains Authoritative |
|------------|-----------------|---------------------------|
| Global Assistant | May lose diagnostic data via GA-3. | ✅ Full authority (partial data) |
| ConversationService | Independent. | ✅ Full authority |
| Activity Room | Independent. | ✅ Full authority |
| WorkflowOrchestrator | Independent. | ✅ Full authority |
| Observer (future) | Cannot receive diagnostic input. | ⚠️ Authority exists but no data |

**No capability gains additional authority when Diagnostics fails.**

### Scenario 4: AI Provider/Model Unavailable

| Capability | Authority Status | What Remains Authoritative |
|------------|-----------------|---------------------------|
| Global Assistant UI | Renders, shows findings/context. Cannot generate AI responses. | ✅ Full authority (UI only) |
| ConversationService | Provider router falls back to any registered provider. | ✅ Full authority (degraded) |
| WorkflowOrchestrator | Independent. | ✅ Full authority |
| All non-AI capabilities | Independent. | ✅ Full authority |

**No capability gains additional authority when AI provider is unavailable.**

### Scenario 5: Context Intelligence Unavailable (Future)

| Capability | Authority Status | What Remains Authoritative |
|------------|-----------------|---------------------------|
| Global Assistant | Renders with manually composed context (GA-3). No intelligent ranking. | ✅ Full authority (raw data) |
| ConversationService | Independent. | ✅ Full authority |
| Activity Room | Independent. | ✅ Full authority |
| All other capabilities | Independent. | ✅ Full authority |

**No capability gains additional authority when Context Intelligence is unavailable. INV-DM-1 preserved: intelligence capabilities degrade; core capabilities do not.**

---

## 6. M11A Diagnostic Instrumentation Reconciliation

### Existing M11A Instrumentation

| Component | File | Lines | Data Collected |
|-----------|------|-------|---------------|
| `M11AInstrumentation` interface | `activity-room-m11a.ts` | 112–142 | Watcher health (poll count, error count, latency), DB operations (exec read/write, persist), snapshot serving (fetch count, latency), process memory (heap, RSS) |
| `GET /api/diagnostics/m11a-health` | `diagnostics.ts` | 214–259 | Exposes M11A instrumentation + WASM corruption correlation note |
| Background watcher | `activity-room-m11a.ts` | 299–353 | Polls M9 store every 500ms, updates instrumentation counters |

### How DIAG-0 Represents/References M11A Without Moving Ownership

| DIAG-0 Type | M11A Data | Relationship |
|-------------|-----------|-------------|
| `DiagnosticSnapshot` | `M11AInstrumentation` fields | **Data source.** M11A instrumentation data can be included in a `DiagnosticSnapshot` as a snapshot source. M11A ownership is NOT moved — the data is read from the existing instrumentation object. |
| `DiagnosticIncidentBundle` | M11A health endpoint data | **Reference.** An incident bundle can reference M11A health data as a correlated event. The data remains in M11A; the bundle references it. |
| `DiagnosticCorrelation` | M11A watcher error patterns | **Source.** Correlation rules can identify M11A watcher errors as correlated events. The data flows from M11A → Diagnostics, not the reverse. |
| `DiagnosticIncidentTimeline` | M11A timestamped events | **Input.** M11A watcher events (error timestamps, latency spikes) can be included in an incident timeline. |

### Preservation

```
M11A Instrumentation (existing, unchanged)
    → DIAG-0 types (new contract, reads from M11A)
        → DIAG-1 collectors (future, will collect Vestara-runtime data)
            → Consumers (Observer, Context Intelligence)
```

**M11A ownership is not moved.** DIAG-0 defines types that can represent M11A data. The existing `GET /api/diagnostics/m11a-health` endpoint remains the authoritative source for M11A health data. DIAG-0 does not duplicate, replace, or modify M11A instrumentation.

---

## 7. Canonical Scenario Mapping (GA-ACCEPT-SELF-MAINTENANCE-001)

### Incident: M11C WASM Memory Corruption

**Original failure:** `RuntimeError: memory access out of bounds` in sql.js WASM after ~20h+ API uptime. Process restart restored function. M9 data preserved.

### Authority Map During Incident

| Authority | Status During Incident | Evidence |
|-----------|----------------------|----------|
| **Activity Room (M9/M10)** | Degraded (WASM corruption) but data preserved | M9 database intact (61KB, 14 records). Read API returned 500 errors. |
| **ConversationService** | Healthy (independent store) | `conversations.db` unaffected. Chat at `/chat` operational. |
| **WorkflowOrchestrator** | Healthy | Workflow state in separate stores. No dependency on sql.js WASM. |
| **Routing** | Healthy | Provider/model resolution in-memory. No sql.js dependency. |
| **Governance** | Healthy | Permission checks in-memory. No sql.js dependency. |
| **Diagnostics** | Healthy | `collect.ts` collectors are pure Node.js. No sql.js dependency. |
| **M11A Instrumentation** | Partially degraded | Instrumentation counters continued updating but health endpoint returned errors due to WASM corruption. |
| **Evidence** | Healthy | PCS-026 evidence bundles in separate stores. No sql.js dependency. |
| **Engineering Graph** | Healthy | In-memory adjacency store. No sql.js dependency. |

### What GA-0 Changes

**Nothing operational.** GA-0 produces a documentation artifact (this authority audit). It does not modify any runtime behavior, API, UI, persistence, or configuration.

### What Later M-B1 Capabilities Would Be Permitted to Observe/Communicate

| Capability | Permitted | Forbidden |
|------------|-----------|-----------|
| **GA-1 (Floating Assistant)** | Display diagnostic findings from GA-3 composition. Surface M11A health status. | Must not attempt to fix WASM, restart services, or modify Activity Room state. |
| **GA-2 (Conversation)** | Track investigation thread via ConversationService. Document incident analysis. | Must not create new ingress, override Activity Room authority, or modify evidence. |
| **GA-3 (Surface Context)** | Compose M11A health data, diagnostic findings, and context results at API boundary. | Must not modify M11A instrumentation, create new diagnostic collectors, or own evidence. |
| **DIAG-0 (Types)** | Define `DiagnosticSnapshot` types that can represent WASM memory state. Define `DiagnosticIncidentBundle` for incident recording. | Must not implement collectors (M-B2), perform analysis (Observer), or modify M11A. |

### What Later M-B1 Capabilities Would Explicitly Remain Forbidden From Doing

| Forbidden Action | Reason | Owner |
|-----------------|--------|-------|
| Restarting the API process | Workflow/Governance authority | WorkflowOrchestrator + Governance |
| Modifying sql.js WASM state | Evidence authority | PCS-026 EvidencePipeline |
| Collecting diagnostic snapshots | Diagnostics authority (RI-3) | `collect.ts` + future DIAG-1 |
| Detecting degradation patterns | Observer authority (RI-2) | Future OBS-0, OBS-1 |
| Triggering operational recovery | Workflow authority | Future ENG-6 |
| Analyzing root cause | Observer authority (RI-2) | Future OBS-2 |
| Accumulating incident knowledge | Observer + Verification authority | Future EFF-4, EFF-6 |

### M-B1 Boundary

M-B1 establishes the authority map (GA-0), floating assistant UI (GA-1), conversation integration (GA-2), surface context API (GA-3), and diagnostic type contracts (DIAG-0). It does not implement diagnostic collection, degradation detection, recovery, root cause analysis, or incident knowledge accumulation. Those belong to M-B2 through M-B8.

---

## 8. Discoveries

| # | Classification | Description | Evidence |
|---|---------------|-------------|----------|
| 1 | **OBSERVATION** | ConversationService and Activity Room are fully bidirectionally isolated. GA-2 composition is architecturally clean. | Zero cross-references in package source, runtime engine, or composition wiring. |
| 2 | **OBSERVATION** | The WorkspaceContext contains both `conversationService` (line 150) and `activityRoomStreams` (line 161) as sibling fields with no cross-reference. | `apps/api/src/workspace-context.ts` lines 150, 161. |
| 3 | **OBSERVATION** | M12 Contextual Assistant does not exist. GA-1 creates it from scratch. | Zero search results for `M12`, `m12`, `ContextualAssistant`. |
| 4 | **OBSERVATION** | The 4 unstaged R6/M11C modifications have zero overlap with M-B1 candidate files. | File-level analysis in M-B1 preflight §A. |
| 5 | **ADJACENT** | The anonymous auth fallback (`local-operator` with `admin` role) means unauthenticated local access is fully privileged. Global Assistant should be aware of this posture but not weaken it. | `apps/api/src/auth.ts`. |
| 6 | **OBSERVATION** | Multiple RBAC systems coexist (core permissions, settings framework, OpenCode permissions, decision pipeline adapter). This is an existing architectural pattern; M-B1 does not need to reconcile them. | `packages/permissions/`, `packages/settings-framework/`, `packages/opencode-runtime/src/permissions/`. |
| 7 | **OBSERVATION** | `collect.ts` is deliberately free of `@vestara` imports (line 8). DIAG-0 types must not break this isolation boundary. | `apps/api/src/diagnostics/collect.ts` line 8. |
| 8 | **OBSERVATION** | The `InProcess EventBus` pattern-matching uses dots (`harness.*`) not colons (`harness:*`). `agent.*` does NOT match `agent:started`. Event naming conventions must be respected. | `packages/event-bus/src/index.ts`. |

---

## 9. Verification Performed

| Check | Result |
|-------|--------|
| GA-0 authority audit document produced with ownership matrix | ✅ This document covers all 16 capability areas |
| Cross-reference against AR-P1.5 §8 authority matrix | ✅ All authorities consistent with AR-P1.5 boundaries |
| GA-1, GA-2, GA-3, DIAG-0 dependency directions verified | ✅ No forbidden dependencies identified |
| Degraded-mode authority validated for 5 failure scenarios | ✅ INV-DM-1 preserved in all scenarios |
| M11A instrumentation reconciliation complete | ✅ DIAG-0 can reference M11A data without moving ownership |
| Canonical scenario (GA-ACCEPT-SELF-MAINTENANCE-001) mapped | ✅ M-B1 capabilities and forbidden actions documented |
| No source, test, schema, persistence, API, UI, config, or behavior changes | ✅ Documentation only |

---

## 10. Summary

| Field | Value |
|-------|-------|
| **Document Path** | `docs/blueprint/VESTARA-INTELLIGENCE-GA0-AUTHORITY-AUDIT.md` |
| **Authority Matrix** | 16 capability areas, each with authority, state, persistence, writers, readers, events, M-B1 relationship, forbidden ownership, and authority claim citations |
| **GA-2 Dependency Conclusion** | ConversationService is fully independently composable. Bidirectional isolation confirmed. No BLOCKER. |
| **DIAG-0 EXTEND/NEW Resolution** | DIAG-0 introduces new type definitions (NEW) that extend the existing diagnostic model (EXTEND). No duplicate telemetry. |
| **M-B1 Dependency Topology** | Activity Room and Global Assistant are sibling consumers. No operational dependency between them. |
| **Blockers** | None |
| **Adjacent Findings** | Anonymous auth fallback (§8 #5), multiple RBAC systems (§8 #6) |
| **Files Changed** | None (documentation only) |
| **Recommended Next Slice** | DIAG-0 — Diagnostic Contract (TypeScript types only, no runtime behavior, prerequisite for M-B2) |

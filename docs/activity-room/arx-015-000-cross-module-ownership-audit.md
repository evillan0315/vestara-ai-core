---
title: "ARX-015-000: Cross-Module Ownership Audit"
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# ARX-015-000: Cross-Module Ownership Audit

**Date:** 2026-08-27
**Status:** Audit Complete — Awaiting Architectural Review
**Scope:** Zero-mutation architecture audit of current working source tree
**Baseline:** Local working tree (post-ARX-014D changes), not GitHub `813fdf4`

---

## Executive Findings

The repository already has substantial, well-structured infrastructure across Activity Room, Workflow, Agent, AI, CAR/OpenCode, Project/Repository, Verification, and Browser domains. The architecture is more mature than expected. **The primary gaps are not missing modules but missing bindings between existing modules.**

### Top-Level Conclusions

1. **Do not rebuild Provider/Model from scratch.** The AI domain already separates providers, models, capabilities, routing, and usage. The routing system (`EngineeringRoutingRuntime`) is architecturally complete but entirely disconnected from agent execution.

2. **Do not rebuild Activity Room from scratch.** The projection pipeline, append-only store, WebSocket streaming, and effective-state derivation are production-quality. The gap is a governed execution runner and command/event separation.

3. **Do not rebuild Agent from scratch.** The canonical agent registry, permission engine, capability system, and harness execution are well-structured. The gap is static model binding — agents hardcode their model instead of using the routing system.

4. **The critical missing primitive is `ResolvedAiBinding`** — an immutable record of which provider/model was selected for which agent/task execution, with full routing provenance. Without this, Activity Room cannot explain *why* a model was chosen.

5. **Identity fragmentation is the deepest architectural issue.** Three parallel event envelope types exist with incompatible field sets. `correlationId` is overloaded. `providerId`/`modelId` are not event-sourced. `runtimeId` is lost in the engineering event store.

6. **No `WorkflowRun`, `DevelopmentPlan`, or `DevelopmentPlanTask` types exist.** The orchestrator tracks `WorkflowPlan` and `WorkflowTask` but has no per-run execution abstraction.

7. **Telegram integration does not exist.** The architecture (EventBus, bridges, ActivityStreamHub) is ready for it.

8. **No `ExecutionPolicy` type exists.** The hermetic/governed/live boundary is implicit through package design, not explicit in code.

---

## 1. Current Architecture Map

### 1.1 Activity Room

```
packages/activity-projection/
├── contracts.ts          — ActivityRecord types (10 kinds, discriminated union)
├── source-event.ts       — Normalizes subsystem events → ActivitySourceEvent
├── projector.ts          — Projector interface + registry
├── projectors/           — 6 projectors (workflow, task, agent-message, test, verification, organizational)
├── redactor.ts           — Sensitive value redaction (22 keys, 6 regex patterns)
├── sequence.ts           — Monotonic sequence allocator
├── store.ts              — ActivityStore interface + InMemoryActivityStore
├── store-sqlite.ts       — SQLite-backed ActivityStore (.vestara/activity.db)
├── migrations.ts         — Schema DDL (activity_events table)
├── effective-state.ts    — Pure projection: corrections, open items, unit state
├── severity.ts           — Pure projection: info/success/warning/error
├── batch.ts              — Ordered record batching
├── stream.ts             — WebSocket hub: exactly-once, in-order delivery
└── service.ts            — Projection pipeline orchestrator

apps/api/src/
├── activity-room.ts      — Singleton lifecycle (createActivityRoom, initActivityRoom, getActivityRoom)
├── routes/activity-room.ts — HTTP API (9 endpoints)
├── bridges/activity-room-organizational-bridge.ts — EventBus → projection
├── message-receipts.ts   — Human-to-agent trust model (in-memory only)
└── server.ts             — WebSocket handler (/ws/activity)

apps/workspace/src/
├── hooks/useActivityStream.ts       — WebSocket + history + optimistic sends
├── hooks/useActivityRoomModel.ts    — Auxiliary sources (participants, receipts, state)
├── lib/activity.ts                  — HTTP + WebSocket client layer
└── pages/activity/                  — 16 component/type files
```

**Disposition:** KEEP core. EXTEND for governed execution, command/event separation, receipt persistence.

### 1.2 Workflow

```
packages/workflow-orchestrator/
├── src/types.ts          — Core domain types (OrchestratedProject, WorkflowPlan, WorkflowTask, OrchestrationEvent)
├── src/orchestrator.ts   — WorkflowOrchestrator (1174 lines, single writer of all state)
├── src/state-machines.ts — 3 state machines (project: 10 phases, plan: 8 statuses, task: 15 statuses)
├── src/task-graph.ts     — DAG: topological sort, wave computation, cycle detection
├── src/stores/           — 6 SQLite stores (project, plan, task, artifact, file-lock, parent-project)
├── src/policies.ts       — ApprovalPolicy + TokenBudget
├── src/retry-policy.ts   — Bounded retry/revision (3 attempts, 3 revisions)
├── src/worker-pool.ts    — Bounded concurrency + round-robin dispatch
├── src/subprocess-dispatcher.ts — Fork-based task isolation
├── src/multi-repo.ts     — Parent/child multi-repo orchestration
├── src/ids.ts            — ID generation (prefix-timestamp-seq)
├── src/db.ts             — Parameterized SQL helpers
├── src/orchestration-migrations.ts — 9 tables across 3 migrations
├── src/distributed/      — Worker cluster (scheduler, registry, lease, transport, execution-attempt)
└── src/observation/      — Shadow-mode workflow observer (10 files)

packages/workflow-projections/
├── src/types.ts          — AgentWorkflowProjection (8 stages, swimlanes, approvals)
├── src/project.ts        — Projects thread replay + events → projection
├── src/derive.ts         — Deterministic stage inference from structural signals
├── src/multithread.ts    — Multi-thread stage merging
├── src/events.ts         — Incremental workflow events via diffing
└── src/swimlanes.ts      — Agent swimlane derivation
```

**Gap:** `WorkflowRun`, `DevelopmentPlan`, `DevelopmentPlanTask` types do not exist. Two disconnected projection systems (orchestrator observation vs. workflow-projections UI).

**Disposition:** KEEP core. EXTEND for run tracking, bridge between projection systems.

### 1.3 Agent

```
packages/workspace/src/
├── agents.registry.ts       — CANONICAL_AGENTS (5 agents, single source of truth)
├── agent-runtime.ts         — Thin adapter → harness execution
├── agent-storage.ts         — SQLite persistence (agents, executions, teams, schedules, memory)
├── agent-service.ts         — Business logic (validation, permissions, events, stats)
├── agent-permission.ts      — (resource, action) permission checking
├── agent-capability.ts      — 12 filesystem capabilities
├── agent-capability-manager.ts — Permission-gated filesystem bridge
├── harness-session.ts       — Durable harness thread orchestration
├── harness-task-dispatcher.ts — TaskDispatcher → harness adapter
└── types.ts                 — AgentDefinition, CanonicalAgent, AgentExecution, etc.

packages/agent-harness/src/index.ts — Durable multi-turn execution loop
```

**Gap:** Agent-to-model binding is static (hardcoded `model: 'mimo-v2.5-free'`). `resolveAgentExecution` callback exists but is never wired.

**Disposition:** KEEP core. EXTEND for dynamic model routing.

### 1.4 AI

```
packages/shared/src/provider.ts      — AIProvider interface, AIModel, CompletionRequest/Response
packages/provider-runtime/src/
├── index.ts                          — ProviderManager (lifecycle + routing integration)
├── engineering-routing.ts            — EngineeringRoutingRuntime (capability-based model selection)
├── routing-types.ts                  — 14 capabilities, 6 roles, routing constraints, decision evidence
├── routing-profiles.ts              — 6 profiles (local, balanced, best-quality, fast, strict-engineering, manual)
├── routing-assignments.ts           — File-persisted assignment store with optimistic concurrency
├── routing-state.ts                 — Versioned routing selection persistence
└── provider-health-tracker.ts       — Failure tracking, cooldown, rate limiting

packages/providers/opencode/src/
├── index.ts                          — OpenCode HTTP provider (5 free models)
└── runtime-provider.ts              — Headless runtime provider (session lifecycle)
```

**Gap:** Routing system is architecturally complete but entirely disconnected from agent execution. No `AiUsageRecord`, `AiModelSelector`, or cost estimation types. No structured `src/ai/` domain directory.

**Disposition:** KEEP routing infrastructure. EXTEND for agent execution binding, usage tracking.

### 1.5 CAR / Developer Runtime

```
packages/external-runtime/src/
├── adapter.ts          — ExternalRuntimeAdapter interface
├── registry.ts         — Runtime registry (register, resolve, lifecycle)
├── correlation.ts      — Execution correlation tracking
├── redaction.ts        — Sensitive value redaction
├── safe-process.ts     — Secure child process execution
├── types.ts            — Runtime types (session, event, capability)
└── adapters/
    ├── opencode.ts     — OpenCode adapter
    ├── claude-code.ts  — Claude Code adapter
    ├── openai-codex.ts — OpenAI Codex adapter
    ├── gemini.ts       — Gemini adapter
    └── opencode-config.ts — OpenCode config resolution
```

**Disposition:** KEEP. Clean adapter protocol with zero runtime dependencies.

### 1.6 OpenCode Integration

```
packages/opencode-runtime/src/
├── client/opencode-http-client.ts    — HTTP client (Basic auth, SSE)
├── config.ts                          — Config resolution (server, auth, workspace)
├── permissions/permission-registry.ts — In-memory permission governance
└── scripts/generate-contracts.ts      — OpenAPI contract generation

packages/providers/opencode/src/runtime-provider.ts — Headless runtime provider

apps/api/src/
├── opencode-runtime-service.ts        — Server lifecycle, session management
├── routes/opencode.ts                 — 15+ endpoints (health, sessions, messages, agents, providers)
└── external-runtime/service.ts        — External runtime service
```

**Gap:** Session registry and permission registry are in-memory (lost on restart). OpenCode treats server/project/directory/session as a single context, not separate resources.

**Disposition:** KEEP integration surface. EXTEND for session persistence.

### 1.7 Project / Repository

```
packages/workspace/src/
├── workspace-runtime.ts           — WorkspaceRuntime (canonical root = .vestara/)
├── workspace-runtime-service.ts   — Runtime lifecycle
├── workspace-context-provider.ts  — Context assembly
├── workspace-index.ts             — File indexing
├── workspace-migrations.ts        — Schema evolution
├── project-profile.ts             — Project identity
├── repository-intelligence.ts     — Repository analysis
├── dual-path.ts                   — Path resolution
├── path-security.ts               — Workspace confinement, home dir protection
└── fs-service.ts                  — Filesystem service
```

**Canonical root:** `<repo-root>/.vestara/` with `workspace.json` manifest (schema version 1).

**Disposition:** KEEP. Well-structured with path security and confinement.

### 1.8 Verification / Evidence

```
packages/verification/src/              — Verification engine (build, test, lint, custom runners)
packages/verification-evidence/src/     — Domain-agnostic evidence kernel (snapshot, comparator, conclusion)
packages/evidence/src/                  — Evidence pipeline (collectors, bundles, confidence, visual comparison, baseline governance)
apps/api/src/evidence/                  — Playwright screenshot source adapter
```

**Gap:** `VerificationEvidenceBundle` not projected to Activity Room (only pass/fail events reach it).

**Disposition:** KEEP all three layers. EXTEND for bundle-to-Activity-Room projection.

### 1.9 Browser

```
packages/tools/browser/src/
├── session.ts   — Per-agent:task isolation, origin policy, information governance (ENG-007), replay traces
└── tools.ts     — 6 governed tools (navigate, snapshot, screenshot, click, type, close)

apps/workspace/tests/visual/ — Playwright visual regression infrastructure
```

**Gap:** No browser session persistence. No real-time screenshot streaming to Activity Room.

**Disposition:** KEEP. EXTEND for Live Visual Browser.

### 1.10 Telegram

**Does not exist.** Zero Telegram-related code, configuration, or references.

**Disposition:** ADD. Architecture (EventBus, bridges, ActivityStreamHub) is ready.

---

## 2. Ownership Matrix

| Subsystem | Package | Owner | Responsibility | Persisted State |
|-----------|---------|-------|----------------|-----------------|
| Activity Records | `@vestara/activity-projection` | Core types + projection pipeline | Typed, immutable, append-only activity records | None (pure types) |
| Activity Store | `@vestara/activity-projection` | SQLite-backed append-only store | Durable activity persistence | `.vestara/activity.db` |
| Activity Stream | `@vestara/activity-projection` | WebSocket hub | Exactly-once, in-order broadcast | In-memory connections |
| Activity Service | `@vestara/activity-projection` | Projection pipeline orchestrator | Event → projector → redact → persist → broadcast | Indirect |
| Activity API | `apps/api` | HTTP routes + WebSocket handler | History, state, messaging, receipts, visual config | `.vestara/visual-config.json` |
| Activity Bridge | `apps/api` | Organizational bridge | EventBus → projection normalization | None |
| Message Receipts | `apps/api` | In-memory receipt tracker | Human-to-agent trust model | **NONE (volatile)** |
| Workflow Orchestrator | `@vestara/workflow-orchestrator` | Single writer of all project/plan/task state | Lifecycle, execution, verification, recovery | 9 SQLite tables |
| Workflow State Machines | `@vestara/workflow-orchestrator` | Transition validation | Project (10 phases), Plan (8 statuses), Task (15 statuses) | None (pure logic) |
| Workflow Observation | `@vestara/workflow-orchestrator` | Shadow-mode observer | Deterministic state projection, convergence detection | In-memory store |
| Workflow Projections | `@vestara/workflow-projections` | UI projection from thread replay | Stage inference, swimlane derivation, incremental events | None |
| Agent Registry | `@vestara/workspace` | Canonical agent definitions | Single source of truth for 5 built-in agents | `plans.db` agents table |
| Agent Runtime | `@vestara/workspace` | Execution adapter | Thin bridge to harness | `agent_executions` table |
| Agent Storage | `@vestara/workspace` | SQLite persistence | Agents, executions, teams, schedules, memory | 6 SQLite tables |
| Agent Service | `@vestara/workspace` | Business logic | Validation, permissions, events, stats | None |
| Agent Permission | `@vestara/workspace` | Permission engine | (resource, action) checking | None |
| Agent Capability | `@vestara/workspace` | Filesystem bridge | Permission-gated file operations | None |
| Harness Session | `@vestara/workspace` | Durable execution sessions | Thread linking, replay projection | `execution_sessions` table |
| Agent Harness | `@vestara/agent-harness` | Multi-turn execution loop | Tool calling, verification, steering | Thread store |
| AI Provider Interface | `@vestara/shared` | Universal AI contract | Provider/model types, completion API | None |
| Provider Runtime | `@vestara/provider-runtime` | Provider lifecycle + routing | Register, load, unload, health, routing | In-memory + file routing state |
| Engineering Routing | `@vestara/provider-runtime` | Capability-based model selection | Resolve provider+model per role/constraints | `.vestara/routing/*.json` |
| OpenCode Provider | `@vestara/provider-opencode` | HTTP provider implementation | Direct AI completion via OpenCode API | None |
| OpenCode Runtime Provider | `@vestara/provider-opencode` | Headless runtime provider | Session-based agent turns | None |
| OpenCode Runtime | `@vestara/opencode-runtime` | OpenCode server integration | Client, config, permissions, events | In-memory registries |
| External Runtime | `@vestara/external-runtime` | CAR adapter protocol | Runtime selection, session management | None |
| Workspace Runtime | `@vestara/workspace` | Project identity + confinement | Canonical root, path security | `.vestara/workspace.json` |
| Verification Engine | `@vestara/verification` | Check orchestration | Build, test, lint, custom runners | None |
| Verification Evidence | `@vestara/verification-evidence` | Evidence kernel | Snapshot, comparison, conclusion | None |
| Evidence Pipeline | `@vestara/evidence` | Bundle assembly | Collect, content-address, manifest, confidence | Filesystem JSON bundles |
| Browser Tools | `@vestara/tools-browser` | Governed browser tools | Navigate, snapshot, screenshot, click, type | In-memory sessions |

---

## 3. Identity / Correlation Graph

### 3.1 Branded ID Types (`@vestara/types`)

```
RuntimeId, JobId, WorkerId, IntentId, EventId, ResourceId, PlanId,
SessionId, CheckpointId, LockId, PermissionId, RoleId, RegistryId,
CapabilityId, WorkerGroupId, FailureBudgetId, RecoveryId, VerificationId,
TrustRecordId, CorrelationId, CausationId, TaskThreadId, AgentTurnId,
ThreadItemId, AgentEnvironmentId, ToolCallId, ApprovalRequestId
```

### 3.2 ID Flow Diagram

```
USER / CLI / UI
    │
    │  process.cwd() → workspace path
    │  requestId (UUID) → HTTP context
    ▼
API LAYER
    │  requestId (X-Request-Id header)
    │  runtimeId = 'api-runtime'
    │  sessionId = conversation/opencode session
    │
    ├──────────────────────────────┐
    ▼                              ▼
EVENT BUS (InProcess)         BRIDGES
    │  VestaraEvent              │  orchestration → engineering
    │  id: evt-*                 │  harness → engineering
    │  correlationId             │  change → engineering
    │                            │  activity → activity-log
    ▼                            ▼
ENGINEERING EVENT STORE (.vestara/events.db)
    │  seq, id, type, source, actor_id, authority,
    │  workspace_id, environment_id, task_id, thread_id,
    │  turn_id, tool_call_id, verification_run_id,
    │  correlation_id, causation_id, payload_json,
    │  previous_hash, hash
    │
    ├──────────┬──────────┬────────────┐
    ▼          ▼          ▼            ▼
THREAD     ACTIVITY   MEMORY      WORKFLOW
STORE      PROJECTION PROJECTION  PROJECTIONS

EVIDENCE STORE (content-addressed, immutable)
    │  Keyed by executionId / runId / SHA-256

ROUTING STATE (file-based, not event-sourced)
    │  .vestara/routing/assignments.json
    │  Keyed by taskId, carries providerId + modelId
```

### 3.3 ID Propagation Gaps

| ID | Created | Propagated To | Lost In |
|----|---------|---------------|---------|
| `executionId` | Action runtime (`act-*`), evidence, distributed worker | Evidence bundles, worker leases, TUI stream gate | Engineering event store (action runtime) |
| `workflowRunId` | **DOES NOT EXIST** | — | — |
| `developmentPlanId` | **DOES NOT EXIST** | — | — |
| `milestoneId` | **DOES NOT EXIST** | — | — |
| `workflowStepId` | Legacy workspace types only | — | Not connected to orchestrator |
| `agentRunId` | **DOES NOT EXIST** (covered by `runId` in harness) | — | — |
| `agentAssignmentId` | Plain string in `AgentAssignment.id` | — | Not event-sourced |
| `projectId` | Orchestrator, workspace | OrchestrationEvent, engineering store (as workspace_id) | EventEnvelope (encoded as correlationId) |
| `repositoryId` | Workspace runtime | Documentation, evidence snapshots | EventEnvelope, engineering store |
| `runtimeId` | Runtime construction | EventEnvelope | **Engineering event store** (no column) |
| `runtimeSessionId` | Conversation runtime, OpenCode | Activity log, session stream | EventEnvelope |
| `providerId` | Provider registration | Routing assignments, event payloads | **EventEnvelope** (not event-sourced) |
| `modelId` | Provider registration | Routing assignments, event payloads | **EventEnvelope** (not event-sourced) |
| `requestId` | HTTP request context | X-Request-Id header, history records | **All event systems** (request-scoped only) |
| `traceId` | Policy audit only | AuditRecord only | **Everywhere else** (extremely limited) |
| `correlationId` | Event factory, bridges | Engineering store, thread items, activity records | **Overloaded** (projectId, sessionId, threadId, or counter) |
| `causationId` | Event factory, harness | Engineering store, thread items | **Many event sites** (defaults to null) |
| `eventId` | Event factory | EventEnvelope, engineering store | **Different schemes** across subsystems |

### 3.4 Three Parallel Event Envelope Systems

| System | Location | Fields |
|--------|----------|--------|
| `@vestara/types` EventEnvelope | `packages/types/src/events.ts` | eventId, timestamp, source, runtimeId, jobId, intentId, type, payload, correlationId, parentId, severity, metadata |
| `@vestara/events` EventEnvelope | `packages/events/src/envelope/envelope.ts` | id, timestamp, type, version, source, runtimeId, jobId, intentId, correlationId, causationId, payload, severity, metadata |
| `@vestara/shared` VestaraEvent | `packages/shared/src/events.ts` | id, type, version, timestamp, source, actor, payload, metadata (correlationId, causationId, retryCount, ttl) |
| `EngineeringTruthEvent` | `packages/engineering-event-store/src/index.ts` | id, seq, at, type, source, actorId, authority, workspaceId, environmentId, taskId, threadId, turnId, toolCallId, verificationRunId, correlationId, causationId, payload, previousHash, hash |

**Critical gap:** These four systems have overlapping but non-identical field sets. No single source of truth for event identity.

---

## 4. Provider / Model Assessment

### 4.1 What Already Exists

| Primitive | Status | Location |
|-----------|--------|----------|
| Provider registry | ✅ Complete | `ProviderManager` in `@vestara/provider-runtime` |
| Model registry/catalog | ✅ Complete | `AIProvider.models`, `EngineeringProviderCatalog` |
| Capability-based model selection | ✅ Complete | `EngineeringRoutingRuntime.resolve()` with 14 capabilities |
| Routing profiles | ✅ Complete | 6 profiles (local, balanced, best-quality, fast, strict-engineering, manual) |
| Routing constraints | ✅ Complete | locality, dataPolicy, costPolicy, maxCost, maxLatency |
| Routing decision evidence | ✅ Complete | `RoutingDecisionEvidence` with decisionId, selected ref, reason codes, rejected candidates |
| Routing assignments (persisted) | ✅ Complete | `FileRoutingAssignmentStore` with optimistic concurrency |
| Provider health tracking | ✅ Complete | `ProviderHealthTracker` with cooldown, rate limiting |
| AI usage/cost accounting | ⚠️ Partial | `CompletionResponse.usage` exists but tokens always returned as zeros from OpenCode |
| Agent-to-model requirements | ❌ Static | Agents hardcode `model: 'mimo-v2.5-free'` |
| Workflow-to-agent assignment | ✅ Complete | `requiredCapabilities` on `WorkflowTask`, capability matching in `HarnessTaskDispatcher` |
| Immutable resolved binding | ❌ Missing | No `ResolvedAiBinding` type exists |

### 4.2 The Critical Gap: Routing → Execution

```
CURRENT STATE:

Agent (hardcoded model) → Harness → OpenCode Runtime Provider → OpenCode Server
                                                  ↓
                                         ProviderResolution (preferred/explicit/default)
                                                  ↓
                                         OpenCode session with fixed model


TARGET STATE:

Agent (modelRequirements) → Harness → resolveAgentExecution() → EngineeringRoutingRuntime.resolve()
                                                                      ↓
                                                             RoutingResolution { candidate, evidence }
                                                                      ↓
                                                             ResolvedAiBinding (immutable, persisted)
                                                                      ↓
                                                             OpenCode Runtime Provider → OpenCode Server
                                                                      ↓
                                                             UsageRecord (tokens, cost, latency)
```

The `resolveAgentExecution` callback already exists in `AgentHarnessOptions` (agent-harness, line 82) but is never wired in production.

---

## 5. Agent / Workflow Assessment

### 5.1 Agent Lifecycle

| Phase | Mechanism | Gap |
|-------|-----------|-----|
| Registration | `POST /api/agents` | None |
| Seeding | `AgentStorage.seedBuiltIn()` | None |
| Activation | `status: 'active'` | None |
| Deactivation | `PUT /api/agents/:id` with `status: 'disabled'` | None |
| Model Update | `AgentStorage.updateAgentModel()` exists | **No API endpoint exposes it** |
| Execution | `POST /api/agents/:id/run` → harness | Model routing not wired |
| Sync | `POST /api/agents/sync` → `.opencode/agents/*.md` | None |
| Deletion | `DELETE /api/agents/:id` | None |

### 5.2 Workflow State Machines

**Project (10 phases):**
```
draft → analyzing → planning → architecture → pending-approval → executing → verifying → completed → archived
                    ↑                    ↑                          ↑
                    | (violations)       | (cancel)                 | (cancel)
                    +--------------------+                          +----→ cancelled
```

**Task (15 statuses):**
```
pending → ready → assigned → in-progress → needs-review → reviewing → approved → testing → completed
              ↑                          ↑                              ↑
              | (changes-requested)      | (retrying)                   | (changes-requested)
              +--------------------------+                              |
                       ↑                                                |
                       +----------- assigned ←---------------------------+
```

**Gap:** Plan transitions are defined but never validated (`canTransitionPlan` exists but is never called).

### 5.3 Two Disconnected Projection Systems

1. **`workflow-orchestrator` observation** — shadow-mode observer over `ProjectSnapshot`, emits `WorkflowObservation` with recommended state/action
2. **`workflow-projections` UI** — derives stages from thread replay + engineering events, produces `AgentWorkflowProjection`

These are parallel systems with no bridge. The orchestrator's `ProjectSnapshot` and the UI's `AgentWorkflowProjection` are unrelated types.

---

## 6. CAR / OpenCode Session Assessment

### 6.1 OpenCode Resource Model

OpenCode exposes these as separate resources:
- **Server** (`http://127.0.0.1:4096`) — headless HTTP server
- **Project** — git repository root
- **Directory** — working directory for file operations
- **Session** — conversation thread (`ses_xxx`)
- **Agent** — named agent configuration
- **Provider/Model** — AI backend selection

Vestara's current treatment:
- Server: ✅ Managed via `opencode-runtime-service.ts`
- Project: ⚠️ Partially managed — `workspace.json` provides canonical root, but OpenCode directory is often `process.cwd()`
- Directory: ⚠️ Conflated with project root in many cases
- Session: ⚠️ In-memory registry, lost on restart
- Agent: ✅ Synced via `POST /api/agents/sync`
- Provider/Model: ⚠️ Discovered at runtime but not durably correlated

### 6.2 Session Ownership

```
Vestara creates session → InMemorySessionRegistry → enforces ownership
OpenCode can contain sessions Vestara didn't create → UNMANAGED

Current: No detection of unmanaged sessions
Needed: RuntimeSessionRegistry with managed/unmanaged classification
```

### 6.3 AI Invocation vs. Runtime Session

A single OpenCode coding session may contain multiple AI invocations (planner turn, developer turn, reviewer turn, verifier turn). These are NOT the same:

```
Runtime Session (OpenCode ses_xxx)
    ├── AI Invocation 1 (planner, Muse Spark)
    ├── AI Invocation 2 (developer, DeepSeek)
    ├── AI Invocation 3 (reviewer, Muse Spark)
    └── AI Invocation 4 (verifier, another model)
```

Currently, there is no distinction. The session is the only tracking unit.

---

## 7. Activity Room Event / Projection Assessment

### 7.1 What Exists

| Component | Status | Quality |
|-----------|--------|---------|
| Activity record types (10 kinds) | ✅ Complete | Excellent — discriminated union with exhaustive types |
| 6 projectors | ✅ Complete | Clean pure functions, testable |
| Redaction | ✅ Complete | 22 sensitive keys, 6 regex patterns |
| SQLite store | ✅ Complete | Append-only, sequence-ordered |
| WebSocket streaming | ✅ Complete | Exactly-once, in-order, resync |
| Effective state projection | ✅ Complete | Pure recomputation from history |
| Severity derivation | ✅ Complete | Pure projection |
| Message receipts | ⚠️ In-memory | Lost on restart |
| Visual edit subsystem | ✅ Complete | VE-1 through VE-6 pipeline |
| 16 UI components | ✅ Complete | Well-structured |

### 7.2 What's Missing

| Missing | Impact |
|---------|--------|
| `GovernedActivityRunner` | No controlled execution with audit/approval gates |
| Command/event separation | Control commands mixed into messaging route |
| Attention engine | No urgency/risk/incident projection |
| Evidence bundle projection | Detailed evidence only available via filesystem |
| Receipt persistence | Receipt state lost on restart |

---

## 8. Project / Repository Authority Assessment

### 8.1 Canonical Root

- **Always `<repo-root>/.vestara/`** (`workspace-runtime.ts:98`)
- **Manifest:** `.vestara/workspace.json` (schema version 1)
- **Path security:** Workspace confinement, home dir protection, sensitive file blocking

### 8.2 Confinement

- `path-security.ts` enforces workspace boundaries
- `safe-process.ts` (external-runtime) enforces exec array security, workspace-bounded paths
- `BrowserSession` enforces origin policy and information classification

### 8.3 Gaps

| Gap | Impact |
|-----|--------|
| `process.cwd()` used in 51 locations | Silent misdirection if CWD differs from workspace |
| Repository ID not on EventEnvelope | Cross-system correlation requires encoding |
| No `RepositoryBinding` type | Concept exists implicitly but not as a first-class object |

---

## 9. Verification / Hermetic Boundary Assessment

### 9.1 Three-Layer Architecture

```
Layer 1 (Hermetic Kernel):
  packages/verification-evidence/ — Pure functions, no IO
  packages/evidence/src/verifier/ — Renderer-free

Layer 2 (Pipeline):
  packages/evidence/src/pipeline.ts — Bundle assembly
  packages/verification/src/ — Check orchestration (spawns processes)

Layer 3 (Integration):
  apps/api/src/evidence/ — Playwright screenshot source
  apps/api/src/bridges/ — Event projection to Activity Room
```

### 9.2 Hermetic Boundary

The hermetic boundary is **implicit** through package design (leaf packages with no IO dependencies). There is no explicit `ExecutionPolicy` type with `hermetic/governed/live` modes.

### 9.3 Evidence Flow to Activity Room

```
Orchestrator → verification.passed/failed event
    → orchestration-event-bridge → EventBus
    → activity-room-organizational-bridge → ActivitySourceEvent
    → VerificationProjector → VerificationActivity record

Bundle contents: NOT projected (available only via BundleStore filesystem read)
```

---

## 10. Browser / Telegram Integration Readiness

### 10.1 Browser

| Capability | Status |
|------------|--------|
| Agent-driven browsing | ✅ 6 governed tools |
| Per-agent:task isolation | ✅ sessionKey(agentId, taskId) |
| Information governance (ENG-007) | ✅ Classification levels, redaction |
| Replay traces | ✅ PCS-026 compatible |
| Visual regression testing | ✅ Playwright infrastructure |
| Session persistence | ❌ In-memory only |
| Activity Room streaming | ❌ Data URLs returned inline |
| Live Visual Browser | ❌ Does not exist |

### 10.2 Telegram

| Capability | Status |
|------------|--------|
| Code | ❌ Does not exist |
| Config | ❌ Does not exist |
| EventBus ready | ✅ Pattern subscription |
| Bridge pattern | ✅ 3 existing bridges demonstrate pattern |
| ActivityStreamHub ready | ✅ WebSocket → could add Telegram sink |

---

## 11. KEEP / EXTEND / REFACTOR / DEPRECATE / ADD Matrix

### Activity Room

| Component | Disposition | Rationale |
|-----------|-------------|-----------|
| `@vestara/activity-projection` (core) | **KEEP** | Foundational type contracts, well-structured |
| 6 projectors | **KEEP** | Clean pure functions |
| Redactor | **KEEP** | Critical security boundary |
| SQLite store | **KEEP** | Minimal, correct |
| WebSocket stream | **KEEP** | Well-designed delivery |
| Effective state | **KEEP** | Clean Direction 2 projection |
| Activity singleton | **KEEP** | Clean lifecycle |
| Organizational bridge | **KEEP** | Clean bridge pattern |
| HTTP API routes | **EXTEND** | Factor out control commands from messaging |
| Message receipts | **EXTEND** | Must be persisted for production |
| ActivityRoomPage | **KEEP** | Well-structured composition |
| All 16 UI components | **KEEP** | Well-structured |
| `useActivityStream` hook | **KEEP** | Clear ownership boundaries |
| `useActivityRoomModel` hook | **KEEP** | Clean auxiliary source management |
| `GovernedActivityRunner` | **ADD** | Does not exist; needed for controlled execution |

### Workflow

| Component | Disposition | Rationale |
|-----------|-------------|-----------|
| `types.ts` | **KEEP** | Canonical domain types |
| `orchestrator.ts` | **KEEP** | Mature, well-tested core |
| `state-machines.ts` | **EXTEND** | Wire plan transition validation |
| `task-graph.ts` | **EXTEND** | Wire cycle detection |
| All 6 stores | **KEEP** | Functional persistence |
| `policies.ts` | **KEEP** | Clean approval/budget |
| `retry-policy.ts` | **KEEP** | Correct bounded retry |
| `worker-pool.ts` | **KEEP** | Simple bounded concurrency |
| `subprocess-dispatcher.ts` | **KEEP** | Good isolation |
| `multi-repo.ts` | **EXTEND** | Add per-repo approval gating |
| `distributed/*` (8 files) | **KEEP** | Well-structured distributed execution |
| `observation/*` (10 files) | **KEEP** | Elegant shadow-mode observation |
| `workflow-projections/*` (6 files) | **EXTEND** | Create bridge to orchestrator state |
| `HarnessTaskDispatcher` | **KEEP** | Critical integration point |

### Agent

| Component | Disposition | Rationale |
|-----------|-------------|-----------|
| `agents.registry.ts` | **KEEP** | Single-source-of-truth is correct |
| `agent-runtime.ts` | **EXTEND** | Remove unused provider field, add routing |
| `types.ts` (AgentDefinition) | **EXTEND** | Add structured model requirements |
| `agent-storage.ts` | **EXTEND** | Expose model update, add versioning |
| `agent-service.ts` | **EXTEND** | Implement RBAC |
| `agent-permission.ts` | **EXTEND** | Add role inheritance, caching |
| `agent-capability*.ts` | **KEEP** | Clean permission-gated filesystem |
| `harness-session.ts` | **KEEP** | Well-structured projection |
| `agent-harness` | **EXTEND** | Wire `resolveAgentExecution` |
| Agent API routes | **EXTEND** | Add model routing context |
| Agent UI components | **EXTEND** | Connect model selection to routing |

### AI

| Component | Disposition | Rationale |
|-----------|-------------|-----------|
| `shared/provider.ts` | **EXTEND** | Add model selector, usage, cost types |
| `providers/opencode` | **KEEP** | Clean provider implementation |
| `runtime-provider.ts` | **EXTEND** | Extract usage from runtime |
| `provider-runtime` | **KEEP** | Solid lifecycle management |
| `engineering-routing.ts` | **KEEP** | Complete routing algorithm |
| `routing-types.ts` | **KEEP** | Comprehensive type system |
| `routing-profiles.ts` | **KEEP** | Well-defined profiles |
| `routing-assignments.ts` | **KEEP** | Good persistence with conflict detection |
| `provider-health-tracker.ts` | **KEEP** | Clean health tracking |
| `AIProvidersSettings.tsx` | **REFACTOR** | Replace hardcoded providers with dynamic API |
| `providers.ts` (API) | **EXTEND** | Propagate to routing, encrypt credentials |
| `ResolvedAiBinding` | **ADD** | Immutable resolved provider/model binding |
| `AiUsageRecord` | **ADD** | Usage tracking with cost estimation |
| `src/ai/` domain directory | **ADD** | Structured AI domain (currently scattered) |

### CAR / OpenCode

| Component | Disposition | Rationale |
|-----------|-------------|-----------|
| `external-runtime/*` (13 files) | **KEEP** | Clean adapter protocol |
| `opencode-runtime/*` | **KEEP** | Comprehensive integration |
| Session registry | **EXTEND** | Persist to survive restarts |
| Permission registry | **EXTEND** | Persist to survive restarts |
| Unmanaged session detector | **ADD** | Does not exist |

### Project / Repository

| Component | Disposition | Rationale |
|-----------|-------------|-----------|
| `workspace-runtime.ts` | **KEEP** | Canonical root is correct |
| `path-security.ts` | **KEEP** | Workspace confinement |
| `RepositoryBinding` type | **ADD** | First-class repository identity |

### Verification / Evidence

| Component | Disposition | Rationale |
|-----------|-------------|-----------|
| `verification-evidence/*` | **KEEP** | Excellent hermetic kernel |
| `evidence/*` (pipeline) | **KEEP** | Well-structured bundle assembly |
| `verification/*` | **KEEP** | Clean check orchestration |
| Bundle → Activity Room projection | **ADD** | Currently not projected |
| `ExecutionPolicy` type | **ADD** | Explicit hermetic/governed/live modes |

### Browser / Telegram

| Component | Disposition | Rationale |
|-----------|-------------|-----------|
| `tools/browser/*` | **KEEP** | Mature, well-governed |
| Browser session persistence | **EXTEND** | For Live Visual Browser |
| Live Visual Browser | **ADD** | Does not exist |
| Telegram integration | **ADD** | Does not exist; architecture ready |
| Attention engine | **ADD** | Does not exist |

---

## 12. Architectural Conflicts

### 12.1 Three Parallel Event Envelope Systems

`@vestara/types` EventEnvelope, `@vestara/events` EventEnvelope, and `@vestara/shared` VestaraEvent have different field sets and are not interchangeable. This creates integration complexity and identity fragmentation.

**Recommendation:** Consolidate into a single event envelope type with all required fields.

### 12.2 Two Disconnected Workflow Projection Systems

`workflow-orchestrator` observation and `workflow-projections` UI are parallel systems with no bridge. The orchestrator's `ProjectSnapshot` and the UI's `AgentWorkflowProjection` are unrelated types.

**Recommendation:** Create a bridge adapter or merge the two systems.

### 12.3 `correlationId` Overloading

`correlationId` is used as projectId, sessionId, threadId, or generated counter depending on context. This makes cross-system queries unreliable.

**Recommendation:** Introduce dedicated `executionId` and use `correlationId` consistently for execution grouping.

### 12.4 `process.cwd()` as Implicit Context

51 instances of `process.cwd()` used for workspace path resolution. If the process CWD differs from the intended workspace, operations silently target the wrong directory.

**Recommendation:** Replace implicit `process.cwd()` with explicit `RepositoryBinding` resolution.

---

## 13. Missing Production Primitives

| Primitive | Status | Priority |
|-----------|--------|----------|
| `ResolvedAiBinding` | ❌ Missing | **Critical** |
| `ExecutionPolicy` (hermetic/governed/live) | ❌ Missing | High |
| `ExecutionBudget` (unified) | ⚠️ Partial (TokenBudget + ObservationPolicy) | High |
| `ExecutionCorrelationEnvelope` | ❌ Missing | **Critical** |
| `RuntimeSessionRegistry` (durable) | ❌ Missing (in-memory only) | High |
| Unmanaged session detector | ❌ Missing | High |
| `GovernedActivityRunner` | ❌ Missing | Medium |
| Command/event separation | ❌ Missing | Medium |
| Attention engine | ❌ Missing | Medium |
| `RepositoryBinding` type | ❌ Missing | Medium |
| `AiUsageRecord` | ❌ Missing | Medium |
| `WorkflowRun` type | ❌ Missing | Low |
| Receipt persistence | ❌ Missing (in-memory) | High |
| Telegram gateway | ❌ Missing | Low |
| Live Visual Browser | ❌ Missing | Low |
| Resource/concurrency governor | ⚠️ Partial (WorkerPool + FailureBudget) | Low |

---

## 14. Dependency Ordering

```
Phase 0 (Prerequisites):
  ARX-014D-003B stabilization

Phase 1 (Foundation):
  ARX-015-000 Audit (this document)
  → Architectural review
  → ARX-015-001 Execution Correlation Contract
    → Unify event envelope types
    → Introduce ExecutionCorrelationEnvelope
    → Wire correlationId consistently

Phase 2 (Binding):
  ARX-015-002 AI Provider/Model Binding & Resolution
    → Wire resolveAgentExecution to EngineeringRoutingRuntime
    → Introduce ResolvedAiBinding
    → Add AiUsageRecord
    → Persist routing assignments to engineering event store

Phase 3 (Policy):
  ARX-015-003 Execution Policy + Budget
    → Introduce ExecutionPolicy type (hermetic/governed/live)
    → Unify TokenBudget + ObservationPolicy budget
    → Add ExecutionBudget

Phase 4 (Authority):
  ARX-015-004 Repository Authority & Confinement
    → Introduce RepositoryBinding type
    → Replace process.cwd() with explicit resolution
    → Add unmanaged session detection

Phase 5 (Session):
  ARX-015-005 Runtime Session Manager
    → Persist session registry
    → Distinguish AI invocation from runtime session
    → One workflow continuity scope → one coding-runtime session

Phase 6 (Runtime):
  ARX-015-006 OpenCode Adapter V2
    → Separate project/directory/session as distinct resources
    → Session reuse/resume semantics

Phase 7 (Events):
  ARX-015-007 Canonical Activity Event Protocol
    → Command/event separation
    → Canonical event types for all subsystems

Phase 8 (Storage):
  ARX-015-008 Durable Event Store + Recovery
    → Extend engineering event store with missing fields
    → Durable receipt persistence

Phase 9 (Projection):
  ARX-015-009 Projection + Attention Engine
    → Attention/incident projection
    → Evidence bundle projection to Activity Room

Phase 10-18: UI, API, Assistant, Controls, Analytics, Telegram, Visual Browser, Recovery, Production Gate
```

---

## 15. Explicit Non-Goals

1. **Do not rewrite the Activity Room projection pipeline.** It is production-quality.
2. **Do not rewrite the Workflow Orchestrator.** It is mature and well-tested.
3. **Do not rewrite the Agent domain.** It has correct separation of concerns.
4. **Do not create a second Provider/Model architecture alongside the existing AI domain.** Extend what exists.
5. **Do not conflate AI invocation sessions with CAR/OpenCode runtime sessions.** They are distinct.
6. **Do not automatically adopt unmanaged OpenCode sessions.** Ownership must be explicit.
7. **Do not modify ARX-014D behavior.** ARX-014D-003B remains the prerequisite stabilization stream.
8. **Do not implement ARX-015 functionality from this audit.** This is evidence for the Planner.

---

## 16. Recommended ARX-015 Milestone Decomposition

| Milestone | Title | Dependencies |
|-----------|-------|-------------|
| ARX-015-000 | Cross-Module Ownership Audit | — |
| ARX-015-001 | Execution Correlation Contract | 000 + review |
| ARX-015-002 | AI Provider/Model Binding & Resolution | 001 |
| ARX-015-003 | Execution Policy + Budget | 001 |
| ARX-015-004 | Repository Authority & Confinement | 001 |
| ARX-015-005 | Runtime Session Manager | 001, 002 |
| ARX-015-006 | OpenCode Adapter V2 | 004, 005 |
| ARX-015-007 | Canonical Activity Event Protocol | 001 |
| ARX-015-008 | Durable Event Store + Recovery | 007 |
| ARX-015-009 | Projection + Attention Engine | 007, 008 |
| ARX-015-010 | Activity Room API V2 | 007, 008, 009 |
| ARX-015-011 | Activity Room UI V2 | 010 |
| ARX-015-012 | Contextual Floating AI Assistant | 002, 011 |
| ARX-015-013 | Governed Interactive Controls | 010, 011 |
| ARX-015-014 | Usage / Cost / Provider Analytics | 002, 008 |
| ARX-015-015 | Telegram Gateway | 007, 010 |
| ARX-015-016 | Live Visual Browser | 005, 010 |
| ARX-015-017 | Durable Recovery / Runtime Reconciliation | 005, 008 |
| ARX-015-018 | Production Readiness Gate | All |

---

*This audit is a read-only architecture assessment. No production source was mutated. All findings are based on static/source inspection of the current working tree.*

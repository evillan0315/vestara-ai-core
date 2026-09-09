# AR-GA-CORE-001 — Authority & Contract Baseline

**Program:** AR-GA-CORE — Activity Room + Global Assistant Convergence
**Milestone:** 001 — AUDIT ONLY. Zero mutation.
**Date:** 2026-09-09
**Commit:** `8dcd5602ecef3a8dc0288e4fd07df143b310927a`
**Repository state:** Pre-audit working tree (uncommitted changes present — `.github/workflows/ci.yml`, agent files, workspace components, docs). The audit document is the only permitted mutation.

---

## Table of Contents

- [A. Current Vertical Slice](#a-current-vertical-slice)
- [B. Authority Matrix](#b-authority-matrix)
- [C. Duplicate and Collision Register](#c-duplicate-and-collision-register)
- [D. Runtime Boundary](#d-runtime-boundary)
- [E. Global Assistant vs Activity Room](#e-global-assistant-vs-activity-room)
- [F. Package Boundary Map](#f-package-boundary-map)
- [G. Target Ownership Model](#g-target-ownership-model)
- [H. Ordered Contract Baseline](#h-ordered-contract-baseline)
- [I. Migration/Compatibility Map](#i-migrationcompatibility-map)
- [J. Risk Register](#j-risk-register)
- [K. CORE-002 Gate](#k-core-002-gate)

---

## A. Current Vertical Slice

### A.1 End-to-End Call Graph — Global Assistant

```
┌─────────────────────────────────────────────────────────────────────┐
│ BROWSER (apps/workspace)                                            │
│                                                                      │
│ ConversationPanel.handleSend(text)                    [:839]         │
│   └─ useAssistantConversation.sendMessage(text,opts)  [:757]         │
│        ├─ Optimistic projection (sync)                               │
│        ├─ Auto-create conversation if needed                         │
│        └─ runTurn(convId,text,clientTurnId,ctx,bind) [:511]          │
│             └─ fetch POST /api/conversations/:id/stream [:537]       │
│                  └─ SSE reader loop (delta/status/tool/done/error)    │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP POST + SSE response
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ API SERVER (apps/api)                                                │
│                                                                      │
│ handleConversationsRoute POST .../stream              [:242]         │
│   ├─ resolveExecutionBinding(ctx,body)                [:17]          │
│   │   └─ AssistantBindingResolver.resolve()           [:49-121]      │
│   │       └─ Validates against OpenCode provider catalog             │
│   ├─ Write SSE headers                                           │
│   └─ for await chunk of:                                            │
│       ctx.conversationService.sendMessageStream(                    │
│         conversationId, message, {model,provider,ctx,signal})       │
│                                                                      │
│ DefaultConversationService.sendMessageStream()        [conversation/ │
│   │                                                   index.ts:286] │
│   ├─ Load conversation from store                                    │
│   ├─ Persist user Message to SQLite                                 │
│   ├─ contextAssembler.buildContext()               [context/:49]    │
│   ├─ providerExecutor.stream(request)                               │
│   ├─ Persist assistant Message to SQLite                            │
│   ├─ Update runtimeSessionId if changed                             │
│   └─ Yield StreamChunk('complete')                                  │
│                                                                      │
│ ProviderExecutor = createAssistantOpenCodeExecutor() [adapter:655]  │
│   └─ stream(request)                                 [:728]          │
│        ├─ resolveSession(request)                    [:667]          │
│        │   └─ AssistantConversationSessionRegistry.acquire()         │
│        └─ runAssistantOpenCodeTurn(opts,request,sess) [:169]         │
│             ├─ resolveProviderModel(model,provider)  [:182]          │
│             ├─ client.openEventStream()              [:193]          │
│             ├─ client.sendMessageAsync(sessionId,..) [:236]          │
│             ├─ Event loop: classify + project events [:259-583]     │
│             ├─ Turn-end enrichment (diffs,todos)     [:587-630]     │
│             └─ Cleanup: abort if not natural         [:631-647]     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP to localhost:4096
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ OPENCODE HEADLESS SERVER (127.0.0.1:4096)                           │
│                                                                      │
│ OpenCodeHttpClient.sendMessageAsync()             [http-client:308] │
│   POST /session/:id/prompt_async?directory=...                      │
│   Body: {parts, agent:'vestara-assistant', model, system, tools}    │
│                                                                      │
│ OpenCodeHttpClient.openEventStream()              [http-client:727] │
│   GET /event?directory=... (SSE)                                    │
│                                                                      │
│ OpenCode session state machine:                                      │
│   idle → running → idle | error | cancelled                          │
│                                                                      │
│ OpenCode owns:                                                      │
│   - Tool execution (read/write/bash/etc.)                            │
│   - Permission event emission                                        │
│   - Provider/model routing to LLM APIs                              │
│   - Git, filesystem, shell operations                               │
└─────────────────────────────────────────────────────────────────────┘
```

### A.2 Transition Inventory

| # | Transition | Entry Point | Owning Package | Input Contract | State Read | State Mutated | Persistence Authority | Event Emitted | Sync/Async | Auth vs Derived |
|---|-----------|-------------|----------------|----------------|------------|---------------|----------------------|---------------|------------|-----------------|
| 1 | UI → sendMessage | `ConversationPanel.handleSend` `[:839]` | `@vestara/workspace-ui` | `text: string` | React state (input, surface, providerSettings) | `optimisticTurns`, `streamState` | None | None | Sync | Derived |
| 2 | sendMessage → runTurn | `useAssistantConversation.runTurn` `[:511]` | `@vestara/workspace-ui` | `convId, text, clientTurnId, surfaceContext, executionBinding` | React state (conversations, selectedId) | `optimisticTurns`, `streamState` | None | None | Sync | Derived |
| 3 | runTurn → HTTP | `useAssistantConversation.runTurn` `[:537]` | `@vestara/workspace-ui` | `POST /api/conversations/:id/stream` body | None | None | None | None | Async (SSE) | Boundary |
| 4 | HTTP → Route handler | `handleConversationsRoute` `[:242]` | `@vestara/api` | `conversationId, message, surfaceContext, provider, model` | `conversationService`, `assistantBindingResolver` | None | None | SSE frames | Async | Authoritative |
| 5 | Route → BindingResolver | `resolveExecutionBinding` `[:17]` | `@vestara/api` | `{providerId?, modelId?}` | OpenCode runtime provider catalog | None | None | None | Async | Authoritative |
| 6 | Route → ConversationService | `DefaultConversationService.sendMessageStream` `[conversation/:286]` | `@vestara/conversation` | `conversationId, content, SendOptions` | In-memory Map + SQLite store | `conversation.messages`, `updatedAt`, `runtimeSessionId`, `title` | SQLite (conversations.db) | `conversation:message.sent`, `conversation:response.completed` | Async gen | Authoritative |
| 7 | ConversationService → ContextAssembler | `DefaultContextAssembler.buildContext` `[context/:49]` | `@vestara/context` | `Conversation, userMessage, ContextOptions` | `conversation.messages` (last 20) | None | None | None | Sync | Authoritative |
| 8 | ConversationService → ProviderExecutor | `ProviderExecutor.stream` `[adapter:728]` | `@vestara/api` (adapter) | `CompletionRequest` | None | None | None | None | Async gen | Boundary |
| 9 | ProviderExecutor → SessionRegistry | `resolveSession` `[adapter:667]` | `@vestara/api` | `CompletionRequest` | `AssistantConversationSessionRegistry` (in-memory Map) | Session binding (created or reused) | None | None | Async | Authoritative |
| 10 | ProviderExecutor → OpenCodeTurn | `runAssistantOpenCodeTurn` `[adapter:169]` | `@vestara/api` | `options, request, sessionId` | None | None | None | None | Async gen | Boundary |
| 11 | Turn → OpenCodeClient.sendMessageAsync | `OpenCodeHttpClient.sendMessageAsync` `[http-client:308]` | `@vestara/opencode-runtime` | `sessionId, {parts, agent, model, system, tools}` | None | None | None | None | Async (fire-and-forget) | Boundary |
| 12 | Turn → OpenCodeClient.openEventStream | `OpenCodeHttpClient.openEventStream` `[http-client:727]` | `@vestara/opencode-runtime` | `context, signal` | None | None | None | `OpenCodeEvent` stream | Async gen | Boundary |
| 13 | Turn → Permission intercept | `evaluatePermission` `[adapter:373]` | `@vestara/api` | `OpenCodePermissionRequest` | `AssistantCapabilityPolicy` | `PermissionRegistry` (in-memory) | None | Permission decision response to OpenCode | Async | Authoritative |
| 14 | Turn → Event normalization | `project*()` functions `[adapter:259-583]` | `@vestara/api` | `OpenCodeEvent` | None | None | None | `StreamChunk` yields | Sync (within gen) | Derived |
| 15 | Turn end → Enrichment | `client.getSessionDiff/getSessionTodos` `[adapter:587-630]` | `@vestara/api` | `sessionId` | OpenCode session state | None | None | Status chunks | Async | Derived |

### A.3 Vertical Slice — Activity Room

```
┌─────────────────────────────────────────────────────────────────────┐
│ BROWSER (apps/workspace)                                            │
│                                                                      │
│ ActivityComposer.submit()                           [:93-110]       │
│   └─ useActivityStream.sendMessage()                  [:143-185]     │
│        ├─ Optimistic projection (sync)                               │
│        └─ deliver(tempId, optimistic)                 [:115-141]     │
│             └─ postActivityMessage()                  [activity.ts:68]│
│                  └─ fetch POST /api/messages                         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTP POST
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│ API SERVER (apps/api)                                                │
│                                                                      │
│ handleActivityRoomRoute POST /api/messages           [ar-route:175] │
│   ├─ handleMessageCommand() (if /resume,/verify,etc.) [:283-314]   │
│   ├─ sendActivityMessage()                            [:344-458]    │
│   │   ├─ Validate content + targets + refs                         │
│   │   ├─ Build AgentMessageActivity record                          │
│   │   ├─ room.service.appendActivity(record)                        │
│   │   └─ Seed delivery receipts                                    │
│   ├─ maybeWakeAddressedAgent()                                       │
│   └─ triggerAssistantTurn() (if agent-targeted)      [:182-189]     │
│                                                                      │
│ ActivityProjectionService.appendActivity()       [service.ts:87-93] │
│   ├─ Redact record                                                  │
│   ├─ Allocate monotonic sequence                                    │
│   ├─ Append to ActivityStore                                        │
│   └─ Broadcast via onAppended callback                              │
│                                                                      │
│ triggerAssistantTurn()                 [assistant-turn.ts:122-222]   │
│   ├─ Resolve agent-assistant AgentDefinition                        │
│   ├─ Create EPHEMERAL conversation via ConversationService          │
│   ├─ Send message through ConversationService                       │
│   ├─ Persist assistant response into ActivityRoom                   │
│   └─ Return AssistantTurnResult                                     │
│                                                                      │
│ ActivityRoom singleton                 [activity-room.ts:25-29]      │
│   ├─ store: SqliteActivityStore (.vestara/activity.db)              │
│   ├─ service: ActivityProjectionService                             │
│   └─ hub: ActivityStreamHub (WebSocket broadcast)                   │
└─────────────────────────────────────────────────────────────────────┘
```

### A.4 Key Asynchronous Boundaries

| Boundary | Protocol | Location | Implication |
|----------|----------|----------|-------------|
| Browser → API | HTTP POST | `useAssistantConversation.ts:537` | Request/response; server holds connection for SSE |
| API → OpenCode | HTTP POST (fire-and-forget) + SSE | `http-client.ts:308,727` | Two connections per turn; events arrive on separate stream |
| API → Browser | SSE (text/event-stream) | `conversations.ts:259-323` | Long-lived connection; chunks streamed as they arrive |
| Activity Room → Browser | WebSocket | `activity-room-m11b.ts` + `activity.ts:244-347` | Persistent bidirectional; subscribe + receive |
| Permission resolution | Promise bridge | `assistant-interaction-broker.ts:43-128` | Turn suspends; browser decision resolves via HTTP callback |

---

## B. Authority Matrix

### B.1 Domain Responsibilities

| Responsibility | Current Owner | Competing/Duplicate Owners | Desired Canonical Owner | Persistence Owner | Public Contract | Classification | Evidence |
|---------------|---------------|---------------------------|------------------------|-------------------|-----------------|----------------|----------|
| **Agent definition** | `@vestara/workspace` (types.ts:599-631, agents.registry.ts:78-541) | None authoritative, but `@vestara/workspace-ui` hardcodes role strings in `AgentProjectionDrawer.tsx:78-90` | `@vestara/workspace` (or extracted) | In-memory (workspace state) | `AgentDefinition`, `CanonicalAgent`, `AgentRole` | **ADAPT** — AgentRole must be extracted to a leaf package | `workspace/src/types.ts:456-484` |
| **AgentRole vocabulary** | `@vestara/workspace` types.ts:456 (28 values) | `@vestara/agent-performance` (6 values, different names), `@vestara/provider-runtime` (6 values, `EngineeringAgentRole`), `apps/workspace` (local copy of 28 hardcoded strings), `@vestara/api` chat.ts (normalization bridge) | Single canonical source | N/A (type-only) | `AgentRole` union | **REBUILD** — Extract to `@vestara/types` or new leaf | See C.1 below |
| **AgentCapability (domain)** | `@vestara/workspace` types.ts:513-556 (42+ values) | `CAPABILITY_DESCRIPTIONS` in agent-service.ts:17-56 (37 entries), `EngineeringCapability` in provider-runtime routing-types.ts:1 (14 values) | `@vestara/workspace` (domain vocabulary) | N/A | `AgentCapability` union | **ADAPT** — Domain caps and routing caps are different concepts | See C.2 |
| **AgentCapabilityName (filesystem)** | `@vestara/workspace` agent-capability.ts:17-29 (12 filesystem ops) | `CAPABILITY_PERMISSION` in agent-capability-manager.ts:32-45 | `@vestara/workspace` | In-memory | `AgentCapabilityName`, `AgentCapabilityDefinition` | **KEEP** — Well-scoped filesystem capability vocabulary | `workspace/src/agent-capability.ts:17-29` |
| **Conversation** | `@vestara/shared` conversation-types.ts:11-22 | `@vestara/state-runtime` (older, simpler interface), `@vestara/workspace-ui` chat/types.ts (presentation model) | `@vestara/shared` | SQLite (conversations.db via `@vestara/conversation-runtime`) | `Conversation`, `ConversationSummary`, `ConversationStatus` | **KEEP** — Clean authoritative source | `shared/src/conversation-types.ts:11-22` |
| **Message** | `@vestara/shared` conversation-types.ts:24-35 | `@vestara/workspace-ui` chat/types.ts (ChatMessage — presentation), `@vestara/activity-room` contracts.ts (AgentMessageActivity — domain event) | `@vestara/shared` | SQLite (conversation_messages) | `Message`, `MessageRole` | **KEEP** — Clean authoritative source | `shared/src/conversation-types.ts:24-35` |
| **ConversationStore** | `@vestara/conversation` index.ts:39-48 (interface) | `@vestara/state-runtime` index.ts:32-38 (different interface), `@vestara/conversation-runtime` conversation-store.ts (SQLite impl) | `@vestara/conversation` | SQLite | `ConversationStore` interface | **ADAPT** — state-runtime is obsolete; retire | See C.3 |
| **Participant** | `@vestara/types` activity.ts:42-60 | `@vestara/activity-room` projection-types.ts:111-176 (enriched), `@vestara/api` participants.ts (workflow-specific) | `@vestara/types` | None (projection) | `Participant` | **KEEP** — Clean leaf definition | `types/src/activity.ts:42-60` |
| **Global Assistant** | `@vestara/api` (routes, adapter, policy, broker) + `@vestara/workspace-ui` (UI panel) | None — no duplicate "Global Assistant" concept | `@vestara/api` (execution) + `@vestara/workspace-ui` (presentation) | ConversationService (messages), AssistantConversationSessionRegistry (sessions) | Multiple (adapter, policy, broker, hook) | **ADAPT** — Compose into coherent subsystem | See E.1 |
| **Activity projection** | `@vestara/activity-room` (projection-types.ts, service.ts, projector.ts) | `@vestara/workspace-ui` activity/activity-types.ts (UI-local projections) | `@vestara/activity-room` | SQLite (.vestara/activity.db) | `ActivityRoomProjection`, `StreamItem`, `ParticipantProjection` | **KEEP** — Well-designed projection pipeline | `activity-room/src/projection-types.ts` |
| **Intent** | `@vestara/types` intent.ts:29-41 + `@vestara/intent` intent.ts:37-178 + `@vestara/understanding` planning-context.ts:41-56 | Three different `Intent` concepts in three packages | Three separate concerns | N/A | `IntentInfo` (types), `Intent` class (intent pkg), `Intent` (understanding) | **KEEP** — Three different abstractions sharing a word; see C.4 | See C.4 |
| **Workflow (orchestration)** | `@vestara/workflow-orchestrator` types.ts:31-43 + `@vestara/types` workflow.ts:140-223 | `@vestara/workspace` types.ts:773-1014 (simpler model), `@vestara/workspace` multi-agent-workflow.ts (template system) | `@vestara/workflow-orchestrator` (runtime) + `@vestara/types` (shared IDs) | SQLite (workflow state) | `OrchestratedProject`, `WorkflowRun`, `WorkflowPlan` | **ADAPT** — workspace's simpler models are scaffolding; retire when orchestrator is primary | See C.5 |
| **Task** | `@vestara/workflow-orchestrator` types.ts:89-114 (15 statuses) | `@vestara/workspace` types.ts:188-198 (4 statuses), `@vestara/kernel` task-scheduler.ts (6 statuses), `@vestara/activity-room` contracts.ts:80-94 (mirrors orchestrator) | `@vestara/workflow-orchestrator` | SQLite (workflow state) | `WorkflowTask`, `TaskStatus` | **ADAPT** — Orchestrator's TaskStatus is canonical; activity-room mirrors legitimately | See C.6 |
| **Provider** | `@vestara/shared` provider.ts:7-20 | `@vestara/provider-runtime` index.ts:28-40 (manager), `@vestara/workspace` types.ts (provider config), `@vestara/opencode-runtime` config.ts (runtime config) | `@vestara/shared` (interface) + `@vestara/provider-runtime` (lifecycle) | WorkspaceManifest (config), provider-credentials.json (secrets) | `AIProvider`, `AIModel`, `ProviderStatus` | **KEEP** — Clean separation | `shared/src/provider.ts:7-20` |
| **Model** | `@vestara/shared` provider.ts:27-45 (`AIModel`) | `@vestara/provider-runtime` routing-types.ts (routing model), `apps/workspace` routing.ts (UI-local) | `@vestara/shared` | None | `AIModel` | **KEEP** | `shared/src/provider.ts:27-45` |
| **Credentials** | Vestara: `apps/api/src/routes/providers.ts:11-14` (provider-credentials.json), env vars | OpenCode: manages its own LLM credentials internally | Vestara: `@vestara/api` (file store), OpenCode: external | Disk (provider-credentials.json, 0o600) | `readCredentials()`/`writeCredentials()` | **KEEP** — Correct split; see D | `apps/api/src/routes/providers.ts:11-14` |
| **Runtime (base class)** | `@vestara/runtime` index.ts:74-437 | None | `@vestara/runtime` | None | `Runtime` class | **KEEP** — Clean lifecycle state machine | `runtime/src/index.ts:74-437` |
| **RuntimeBinding** | `@vestara/opencode-runtime` runtime-session-types.ts:78-117 | `@vestara/api` assistant-conversation-sessions.ts:32-36 (simpler, GA-specific) | `@vestara/opencode-runtime` | In-memory (process) | `RuntimeSessionBinding` | **ADAPT** — GA sessions are a subset; see D | See D.3 |
| **RuntimeSession** | `@vestara/opencode-runtime` runtime-session-registry.ts:37-301 | `@vestara/api` assistant-conversation-sessions.ts:58-157 | `@vestara/opencode-runtime` (M7) | In-memory | `RuntimeSessionRegistry`, `AssistantConversationSessionRegistry` | **ADAPT** — GA registry should delegate to M7 | See D.4 |
| **Permission** | `@vestara/api` assistant-capability-policy.ts (Vestara-side) + `@vestara/opencode-runtime` permissions/ (OpenCode-side) | `@vestara/workspace` agent-permission-engine (agent-level), `@vestara/permission` (general) | `@vestara/api` (policy) + `@vestara/opencode-runtime` (OpenCode bridge) | In-memory (PermissionRegistry) | `AssistantCapabilityPolicy`, `OpenCodePermissionRecord` | **ADAPT** — Policy is authoritative; bridge is necessary | See D.5 |
| **Tool** | `@vestara/shared` tool.ts (definition) + `@vestara/tool-runtime` index.ts (execution) | `@vestara/workspace` agent-capability-manager.ts (filesystem tools) | `@vestara/shared` (definition) + `@vestara/tool-runtime` (execution) | None | `ToolDefinition`, `VestaraTool`, `ToolRuntime` | **KEEP** — Clean split | `shared/src/tool.ts:1-56` |
| **Approval** | `@vestara/api` assistant-capability-policy.ts + `@vestara/api` assistant-interaction-broker.ts | None | `@vestara/api` | None (async promise) | `PolicyDecision`, `AssistantPermissionDecision` | **ADAPT** — Currently tightly coupled to GA | See E.1 |
| **Execution** | `@vestara/api` assistant-opencode-adapter.ts (GA) + `@vestara/workflow-orchestrator` (multi-agent) | `@vestara/workspace` session-orchestrator.ts (legacy) | `@vestara/api` (GA) + `@vestara/workflow-orchestrator` (workflow) | In-memory (adapter state), SQLite (workflow state) | `runAssistantOpenCodeTurn`, `TaskDispatcher` | **ADAPT** — Two execution paths need convergence | See E.2 |
| **ExecutionResult** | `@vestara/shared` assistant-execution.ts (browser projection) + `@vestara/opencode-runtime` execution-normalizer.ts (normalization) | `@vestara/shared` provider.ts (CompletionResponse — LLM response) | `@vestara/shared` (projection) + `@vestara/opencode-runtime` (normalization) | None | `AssistantExecutionDetail`, `VestaraExecutionState` | **KEEP** — Clean layered design | `shared/src/assistant-execution.ts` |
| **Verification** | `@vestara/workspace` verification-service.ts | `@vestara/workflow-orchestrator` (verification stage) | `@vestara/workspace` or `@vestara/workflow-orchestrator` | None | Verification types | **ADAPT** — Needs consolidation | TBD |
| **Evidence** | `@vestara/opencode-runtime` evidence/execution-evidence.ts + `@vestara/workspace` evidence types | None | `@vestara/opencode-runtime` (runtime evidence) | None | `OpenCodeExecutionEvidence` | **KEEP** — Well-scoped | `opencode-runtime/src/evidence/execution-evidence.ts` |

---

## C. Duplicate and Collision Register

### C.1 AgentRole Vocabulary Divergence

| Location | Type Name | Values | Package |
|----------|-----------|--------|---------|
| `packages/workspace/src/types.ts:456-484` | `AgentRole` | 28 values: `'architect' \| 'developer' \| 'verifier' \| 'documenter' \| 'security' \| 'devops' \| 'testing' \| 'ux' \| 'performance' \| 'database' \| 'release' \| 'governance' \| 'conversation' \| 'planning' \| 'refactoring' \| 'custom' \| 'dashboard-curator' \| 'frontend' \| 'analyst' \| 'reviewer' \| 'tester' \| 'continuous-tester' \| 'security-agent' \| 'performance-agent' \| 'documentation-agent' \| 'refactoring-agent' \| 'release-agent' \| 'context'` | `@vestara/workspace` |
| `packages/agent-performance/src/performance-types.ts:10` | `AgentRole` | 6 values: `'architect' \| 'planner' \| 'engineer' \| 'reviewer' \| 'verifier' \| 'documentation'` | `@vestara/agent-performance` |
| `packages/provider-runtime/src/routing-types.ts:20` | `EngineeringAgentRole` | 6 values: `'planner' \| 'architect' \| 'developer' \| 'reviewer' \| 'verifier' \| 'documentation'` | `@vestara/provider-runtime` |
| `apps/workspace/src/lib/routing.ts:1` | `EngineeringAgentRole` | 6 values: identical to provider-runtime | `@vestara/workspace-ui` (local copy) |
| `packages/workspace/src/types.ts:221-232` | (inline in `AgentAssignment.role`) | 9 values: `'architect' \| 'planner' \| 'developer' \| 'reviewer' \| 'tester' \| 'verifier' \| 'documentation' \| 'security' \| 'performance'` | `@vestara/workspace` |
| `packages/workspace/src/execution-planner.ts:140-150` | `roleToAgentRole` (Record) | Maps assignment roles to workspace AgentRole strings | `@vestara/workspace` |
| `packages/workflow-orchestrator/__tests__/e2e-support/real-agent/profile.ts:12` | `RealAgentRole` | 4 values: `'planner' \| 'engineer' \| 'reviewer' \| 'verifier'` | test-only |

**Classification:** **Conflicting authority + semantic drift.**

Three distinct role vocabularies exist with incompatible value sets:
- `'developer'` (workspace, provider-runtime) vs `'engineer'` (agent-performance)
- `'documenter'` (workspace) vs `'documentation'` (provider-runtime, agent-performance)
- `'planning'` (workspace) vs `'planner'` (provider-runtime, agent-performance)

The chat route (`apps/api/src/routes/chat.ts:164-165`) contains a normalization bridge:
```typescript
const normalizedAgentRole =
  agent?.role === 'documenter' ? 'documentation' : agent?.role === 'planning' ? 'planner' : agent?.role;
```

This is a **compatibility adapter** that bridges workspace vocabulary to routing vocabulary at the API boundary.

**Root cause:** Three packages independently defined overlapping role sets without a shared canonical source. The workspace role set is the broadest (28 values) and represents user-facing agent classification. The provider-runtime and agent-performance role sets are narrower routing/analysis subsets. They are conceptually different (user-facing role vs routing bucket) but share the same word.

**Recommendation:** Extract a `RoutingRole` (6 values) as a separate type from `AgentRole` (28 values). The normalization in chat.ts should be removed; instead, the agent definition should carry a `routingRole` field that maps to the canonical routing vocabulary.

### C.2 Capability Fragmentation

| Location | Type Name | Concept | Values |
|----------|-----------|---------|--------|
| `packages/workspace/src/types.ts:513-556` | `AgentCapability` | Domain capability classification (open-ended) | 42+ values: `'architecture-analysis' \| 'code-generation' \| 'testing' \| ... \| (string & {})` |
| `packages/workspace/src/agent-service.ts:17-56` | `CAPABILITY_DESCRIPTIONS` | Human-readable descriptions of domain capabilities | 37 entries (subset of AgentCapability) |
| `packages/workspace/src/agent-capability.ts:17-29` | `AgentCapabilityName` | Filesystem operation permissions | 12 values: `'filesystem.read' \| 'filesystem.write' \| ... \| 'filesystem.references'` |
| `packages/workspace/src/agent-capability-manager.ts:32-45` | `CAPABILITY_PERMISSION` | Permission gates per filesystem capability | Maps 12 filesystem ops to `{resource, action}` |
| `packages/provider-runtime/src/routing-types.ts:1-18` | `EngineeringCapability` | Routing-level capability classification | 14 values: `'conversation' \| 'planning' \| 'implementation' \| ... \| 'image-understanding'` |

**Classification:** **Legitimate specialization (partially) + semantic drift.**

Three distinct concepts currently sharing the word "capability":

1. **Domain capabilities** (`AgentCapability`): User-facing agent classification labels. Open-ended, many values, used for agent definition and UI display.
2. **Filesystem capabilities** (`AgentCapabilityName`): Concrete, bounded filesystem operations with risk/permission metadata. Well-structured, closed vocabulary.
3. **Routing capabilities** (`EngineeringCapability`): Provider-routing-level capability buckets for model selection. Different granularity and purpose from domain capabilities.

The first two are in the same package but serve different purposes. The `AgentService.listCapabilities()` method (`agent-service.ts:110`) merges them — it iterates `CAPABILITY_DESCRIPTIONS` and appends filesystem capabilities from `AgentCapabilityManager`, presenting a unified list to the UI. This conflation hides the architectural distinction.

**Recommendation:** The routing capabilities (`EngineeringCapability`) are a legitimate separate concept. The domain capabilities and filesystem capabilities are related but should not be conflated in a single API surface.

### C.3 ConversationStore Duplication

| Location | Interface | Methods | Package |
|----------|-----------|---------|---------|
| `packages/conversation/src/index.ts:39-48` | `ConversationStore` | `create`, `get`, `list(userId)`, `addMessage`, `setStatus`, `updateTitle`, `updateRuntimeSessionId`, `remove` | `@vestara/conversation` |
| `packages/state-runtime/src/index.ts:32-38` | `ConversationStore` | `saveConversation`, `getConversation`, `listConversations(limit)`, `deleteConversation`, `saveMessage` | `@vestara/state-runtime` |

**Classification:** **Obsolete compatibility layer.**

The `@vestara/state-runtime` interface is older, simpler, and lacks: `runtimeSessionId` support, `cost` on messages, `updateTitle`, `remove`, and userId-filtered listing. The `@vestara/conversation` interface is strictly more capable. `@vestara/state-runtime` is still referenced by `WorkspacePersistence` but is effectively unused for conversation operations.

### C.4 Intent Concept Overlap

| Location | Type | Purpose | Package |
|----------|------|---------|---------|
| `packages/types/src/intent.ts:29-41` | `IntentInfo` | Domain intent record with lifecycle (submitted→planning→executing→completed) | `@vestara/types` |
| `packages/intent/src/intent.ts:37-178` | `Intent` class | State-machine-driven intent lifecycle with observer pattern | `@vestara/intent` |
| `packages/understanding/src/planning-context.ts:41-56` | `Intent` | Classification of user request intent (explore/plan/implement/etc.) with confidence | `@vestara/understanding` |
| `packages/shared/src/router.ts:59-66` | `ConversationIntent` | Conversation-level intent for model routing (greeting/plan/implement/etc.) | `@vestara/shared` |

**Classification:** **Legitimate specialization (four different abstractions).**

These are four different concepts that happen to share the word "intent":
1. **Domain intent** (`IntentInfo`): A trackable entity with goals, constraints, success criteria, and lifecycle.
2. **Intent state machine** (`Intent` class): The runtime lifecycle manager for a domain intent.
3. **Understanding intent** (understanding): Classification of what the user wants to do — feeds into planning.
4. **Conversation intent** (`ConversationIntent`): Routing signal for model selection.

None of these are duplicates. They represent different architectural layers (domain → understanding → routing). The naming overlap is unfortunate but not a collision.

### C.5 Workflow Model Overlap

| Location | Type | Status Set | Package |
|----------|------|------------|---------|
| `packages/workspace/src/types.ts:1003-1014` | `Workflow` | `'not-started' \| 'in-progress' \| 'completed' \| 'cancelled'` (4 values) | `@vestara/workspace` |
| `packages/workflow-orchestrator/src/types.ts:57-67` | `WorkflowPlan` | (structurally different) | `@vestara/workflow-orchestrator` |
| `packages/types/src/workflow.ts:140-161` | `WorkflowPlan` | (shared contract) | `@vestara/types` |
| `packages/types/src/workflow.ts:181-223` | `WorkflowRun` | `WorkflowRunStatus` with richer lifecycle | `@vestara/types` |
| `packages/workflow-projections/src/types.ts:11-18` | `WorkflowStatus` | `'idle' \| 'running' \| 'awaiting-approval' \| 'blocked' \| 'completed' \| 'failed' \| 'cancelled'` | `@vestara/workflow-projections` |
| `packages/activity-room/src/m9-types.ts:34-60` | `ActivityType` | 30+ activity types for workflow events | `@vestara/activity-room` |

**Classification:** **Legitimate specialization + scaffolding.**

The workspace `Workflow` type (4 statuses) is a simplified scaffolding model from early development. The `@vestara/workflow-orchestrator` + `@vestara/types` combination is the authoritative runtime model. The workspace `MultiAgentWorkflowOrchestrator` (`multi-agent-workflow.ts:301`) uses the richer types internally but exposes the simpler type externally.

### C.6 TaskStatus Multiplicity

| Location | Values | Count | Package |
|----------|--------|-------|---------|
| `packages/workspace/src/types.ts:188` | `pending \| in-progress \| completed \| blocked` | 4 | `@vestara/workspace` |
| `packages/workflow-orchestrator/src/types.ts:89` | `pending \| ready \| awaiting-approval \| assigned \| in-progress \| needs-review \| reviewing \| changes-requested \| testing \| approved \| retrying \| blocked \| failed \| cancelled \| completed` | 15 | `@vestara/workflow-orchestrator` |
| `packages/kernel/src/task-scheduler.ts:6` | `pending \| queued \| running \| completed \| failed \| cancelled` | 6 | `@vestara/kernel` |
| `packages/activity-room/src/contracts.ts:80-94` | Mirrors workflow-orchestrator (15 values) | 15 | `@vestara/activity-room` |

**Classification:** **Legitimate specialization (activity-room mirrors orchestrator) + scaffolding (workspace).**

The activity-room's `TaskActivityStatus` is a deliberate mirror of the workflow-orchestrator's status set — it needs to represent all possible task states in the activity stream. The workspace's 4-value set is a simplified early model. The kernel's 6-value set is for internal scheduling only.

### C.7 Participant Type Overlap

| Location | Interface | Fields | Package |
|----------|-----------|--------|---------|
| `packages/types/src/activity.ts:42-60` | `Participant` | `participantId, type, displayName, membership, presence, workState` | `@vestara/types` |
| `packages/activity-room/src/projection-types.ts:111-176` | `ParticipantProjection` | Extends Participant semantics + `modelId, providerId, teamId, currentAssignment` | `@vestara/activity-room` |
| `apps/api/src/participants.ts:16-24` | `WorkflowParticipant` | `workflowId, role, agentId, threadId, executionState` | `@vestara/api` |

**Classification:** **Legitimate specialization.**

`Participant` is the cross-domain identity. `ParticipantProjection` is the Activity Room's enriched read model. `WorkflowParticipant` is the workflow-specific binding. These are three layers of the same concept at different granularities.

---

## D. Runtime Boundary

### D.1 Where Vestara Ends and OpenCode Begins

```
VESTARA DOMAIN                                    OPENCODE DOMAIN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
User intent                    │
Canonical domain state         │
Agent identity/configuration   │
Workflow/orchestration         │
Governance/policy              │
Permissions/approvals          │
Runtime selection/binding      │
Execution lifecycle            │
Conversation/session semantics │
Evidence/verification          │
                               │
───────────────────────────── BOUNDARY ───────────────────────────
                               │
                               │  Session creation (when asked)
                               │  Execution inside sessions
                               │  Tool execution internals
                               │  Permission event emission
                               │  Provider/model routing to LLMs
                               │  Git, filesystem, shell operations
                               │  SSE event stream
                               │  Provider credential management
```

### D.2 Runtime Selection Authority

| Authority | Owner | Location | Evidence |
|-----------|-------|----------|----------|
| Which runtime to use | Vestara | `workspace-context.ts:808-822` — adapter factory is hardcoded to OpenCode | `createAssistantOpenCodeExecutor()` |
| OpenCode base URL | Vestara | `opencode-runtime/src/config.ts:58-73` — resolved from env/config | `OPENCODE_SERVER_URL` default `127.0.0.1:4096` |
| OpenCode server auth | Vestara | `opencode-runtime/src/config.ts:63-66` — HTTP Basic Auth | `OPENCODE_SERVER_PASSWORD` |

### D.3 Provider/Model Selection Authority

| Authority | Owner | Location | Evidence |
|-----------|-------|----------|----------|
| Provider catalog discovery | Vestara queries OpenCode | `opencode-runtime-service.ts:49` → `GET /provider` | Runtime returns available providers |
| User model selection (UI) | Vestara UI | `ProviderModelPicker.tsx:139` — user clicks a model | `onChange(provider.id, model.id)` |
| Selection validation | Vestara API | `assistant-binding-resolver.ts:94-121` — validates against runtime catalog | Server-authoritative |
| Execution binding to OpenCode | Vestara API | `assistant-opencode-adapter.ts:182` — resolved before prompt | Sent in `prompt_async` body |
| OpenCode internal routing | OpenCode | OpenCode routes to actual LLM provider | Beyond Vestara boundary |

### D.4 Credential Authority

| Credential Type | Owner | Storage | Location |
|----------------|-------|---------|----------|
| OpenCode server password | Vestara | `.env` → `OPENCODE_SERVER_PASSWORD` | `config.ts:66` |
| Vestara provider API keys (direct path) | Vestara | `provider-credentials.json` (0o600) | `routes/providers.ts:11-14,64-76` |
| Vestara provider API keys (env path) | Vestara | `process.env[apiKeyEnv]` | `routes/providers.ts:269-276` |
| OpenCode-internal LLM credentials | **OpenCode** | OpenCode's own storage | Beyond Vestara boundary |
| Workspace manifest (provider config) | Vestara | `.vestara/workspace.json` | `routes/providers.ts:128-134` |

**Critical distinction:** Vestara owns the credentials for its direct-provider path (when `@vestara/provider-runtime` makes API calls directly). OpenCode owns its own LLM credentials for the runtime path. The UI acknowledges this at `ProviderModelPicker.tsx:184-186`:
```typescript
// OpenCode-runtime-sourced providers handle auth internally --
// a missing user-supplied key does not mean the provider is unusable.
isRuntimeManaged: providerSource === 'opencode-runtime',
```

### D.5 Permission/Tool Authority

| Authority | Owner | Location | Mechanism |
|-----------|-------|----------|-----------|
| Policy definition (what's allowed) | Vestara | `assistant-capability-policy.ts:77-120` | `AssistantCapabilityPolicy` (ALLOW/ASK/DENY rules) |
| Pre-execution gating (tool availability) | Vestara | `assistant-opencode-adapter.ts:250-254` | `buildToolsMap()` sent in `prompt_async` body |
| Runtime permission interception | Vestara | `assistant-opencode-adapter.ts:359-488` | `evaluatePermission()` on each `permission.asked` event |
| User approval (ASK decisions) | User via browser | `assistant-interaction-broker.ts:43-128` | Promise bridge; 10min timeout, fail-safe reject |
| Permission response to OpenCode | Vestara | `http-client.ts:368-388` | `respondToPermission()` translates to OpenCode format |
| Tool execution enforcement | OpenCode | OpenCode runtime | Executes or blocks based on response |
| Agent-level permission grant | Vestara (config) | `agents.registry.ts:362-418` | `ASSISTANT_GRANT` — all `allow` (maximally permissive; real enforcement via policy) |

### D.6 Session Creation & Lifecycle

| Operation | Owner | Location | Mechanism |
|-----------|-------|----------|-----------|
| Conversation creation | Vestara | `conversation/src/index.ts:120-152` | `ConversationService.createConversation()` |
| OpenCode session creation | Vestara requests, OpenCode executes | `adapter.ts:187-191` → `http-client.ts:createSession()` | `POST /session` |
| Session reuse decision | Vestara | `adapter.ts:667-695` → `AssistantConversationSessionRegistry` | Single-flight acquisition; verify preferred session |
| M7 workflow session binding | Vestara | `runtime-session-registry.ts:136-301` | `RuntimeSessionRegistry.acquire()` |
| Session lifecycle (idle/running/error) | OpenCode | OpenCode runtime state machine | SSE events `session.status`, `session.idle`, `session.error` |
| Session abort (unnatural end) | Vestara | `adapter.ts:631-647` | `client.abortSession()` on timeout/non-idle completion |

### D.7 Execution Request Construction

| Aspect | Owner | Location | Detail |
|--------|-------|----------|--------|
| User message content | Vestara | `adapter.ts:176` | Extracted from `request.messages` |
| Agent identifier | Vestara | `adapter.ts:237` | Hardcoded `'vestara-assistant'` |
| Model binding | Vestara | `adapter.ts:182,244` | `resolveProviderModel()` → `{providerId, modelId}` |
| System prompt / surface context | Vestara | `adapter.ts:249` | `normalizeSurfaceContext()` from browser |
| Tool availability map | Vestara | `adapter.ts:250-254` | `buildToolsMap()` from policy |
| Conversation history | Vestara | `context/src/index.ts:59-66` | Last 20 messages |
| Execution request format | OpenCode | `http-client.ts:314-321` | OpenCode's `prompt_async` body schema |

### D.8 Result/Event Ingestion

| Event Type | Source | Normalization | Projection | Consumer |
|-----------|--------|---------------|------------|----------|
| `session.next.text.delta` | OpenCode SSE | `adapter.ts:275` | `StreamChunk('text', ...)` | Browser SSE stream |
| `message.part.updated` | OpenCode SSE | `adapter.ts:293` | `StreamChunk('tool_call'\|'tool_result', detail)` | Browser SSE stream |
| `permission.asked` | OpenCode SSE | `adapter.ts:359` | Policy evaluation → ALLOW/ASK/DENY | Permission broker / OpenCode response |
| `question.asked` | OpenCode SSE | `adapter.ts:497` | Interactive broker or status chunk | Browser / OpenCode response |
| `session.status.idle` | OpenCode SSE | `adapter.ts:562` | Turn completion signal | Stream termination |
| `session.error` | OpenCode SSE | `adapter.ts:576` | `StreamChunk('error', ...)` | Browser SSE stream |
| Activity Room events | Internal | `activity-room/src/source-event.ts` | `ActivityProjector` → `ActivityRecord` | Activity Stream Hub → WebSocket → Browser |

### D.9 Cancellation & Timeout

| Scenario | Owner | Location | Mechanism |
|----------|-------|----------|-----------|
| Browser disconnects | Vestara | `conversations.ts:281-283` | `AbortController` on response `close`; signal passed to adapter |
| Adapter turn timeout | Vestara | `adapter.ts:631-647` | If not completed naturally, `client.abortSession()` |
| Permission timeout | Vestara | `assistant-interaction-broker.ts:37` | 10-minute timeout; fail-safe reject |
| OpenCode execution timeout | OpenCode | OpenCode runtime | Internal timeout; emits `session.error` |

---

## E. Global Assistant vs Activity Room

### E.1 Responsibility Comparison

| Responsibility | Global Assistant | Activity Room | Duplication? | Canonical Owner |
|---------------|-----------------|---------------|--------------|-----------------|
| Conversation ownership | `ConversationService` → `conversations.db` | `ActivityStore` → `activity.db` | **Yes** — separate persistence for messages | GA: `@vestara/conversation`, AR: `@vestara/activity-room` |
| Agent invocation | `adapter.ts` → `runAssistantOpenCodeTurn()` | `assistant-turn.ts` → `triggerAssistantTurn()` | **Yes** — AR creates ephemeral conversations to invoke agents | Both delegate to `ConversationService`, but AR discards the conversation |
| Runtime invocation | `adapter.ts` → OpenCode HTTP | AR does not directly invoke OpenCode; delegates through `ConversationService` | **Partial** — AR间接 uses the same path | `@vestara/api` (adapter) |
| Session state | `AssistantConversationSessionRegistry` (in-memory) | None — AR creates throwaway conversations | **No** — AR has no session persistence | `@vestara/api` |
| Provider/model resolution | `AssistantBindingResolver` validates against runtime | AR uses `agent-assistant` AgentDefinition defaults | **No** — different resolution paths | `@vestara/api` (binding resolver) |
| Permissions | `AssistantCapabilityPolicy` + `AssistantInteractionBroker` | AR uses same `triggerAssistantTurn()` which goes through the same adapter | **Shared** — AR inherits GA's permission model transitively | `@vestara/api` |
| Message persistence | `ConversationService` (ordered turns, `Conversation` entity) | `ActivityStore` (append-only `ActivityRecord` stream) | **Yes** — two fundamentally different persistence models | GA: `@vestara/conversation`, AR: `@vestara/activity-room` |
| Execution state | SSE stream with structured events (`AssistantExecutionDetail`) | `ActivityProjectionService` → `ActivityRoomProjection` | **Yes** — two parallel projection systems | GA: `@vestara/shared` (execution types), AR: `@vestara/activity-room` |
| Activity/event state | No native activity model; relies on `StreamChunk` status events | `ActivityProjectionService` → `ActivityStore` → `ActivityStreamHub` | **No** — AR has richer activity model | `@vestara/activity-room` |
| Realtime transport | SSE (HTTP long-poll, unidirectional) | WebSocket (bidirectional) | **Yes** — two realtime mechanisms | GA: SSE, AR: WebSocket |

### E.2 What Is Canonical Domain vs UI/Projection

| Concept | Domain (authoritative state) | UI/Projection (derived) |
|---------|------------------------------|------------------------|
| Agent identity/config | `@vestara/workspace` types + registry | UI display (AgentDrawer, ProviderModelPicker) |
| Conversation/message | `@vestara/shared` types + `@vestara/conversation` service | `useAssistantConversation` hook, `ConversationPanel` |
| Activity records | `@vestara/activity-room` contracts + store | `ActivityRoomProjection`, `StreamItem`, `ParticipantProjection` |
| Execution events | `@vestara/opencode-runtime` execution-normalizer (normalized from OpenCode) | `AssistantExecutionDetail` (browser projection in `@vestara/shared`) |
| Permission decisions | `AssistantCapabilityPolicy` + `AssistantInteractionBroker` | Floating permission prompt in UI |
| Workflow state | `@vestara/workflow-orchestrator` types | `WorkflowProjection` (TUI + Workspace UI) |

**Key finding:** Activity Room should NOT acquire domain authority simply because it exposes controls. Currently, AR's `triggerAssistantTurn()` creates ephemeral conversations through `ConversationService` — it does not own conversation semantics. The human message goes directly to `ActivityStore`, never touching `ConversationService`. This is correct architecture: AR owns the activity stream; GA owns the conversation.

### E.3 Areas Requiring Convergence

1. **Execution event projection:** GA uses `StreamChunk` → `AssistantExecutionDetail`; AR uses `ActivityRecord` → `StreamItem`. These represent overlapping information with different schemas. A unified execution event model would allow both surfaces to consume the same normalized events.

2. **Agent invocation:** AR's `triggerAssistantTurn()` creates a throwaway conversation each time. This is wasteful and loses context. If AR needs persistent agent interaction, it should route through the conversation system with proper session reuse.

3. **Realtime transport:** GA uses SSE (unidirectional); AR uses WebSocket (bidirectional). For convergence, a single realtime mechanism would simplify the client.

---

## F. Package Boundary Map

### F.1 Dependency Graph (Vertical Slice)

```
LAYER 0 (Leaf, zero @vestara/* deps):
  @vestara/shared
  @vestara/types
  @vestara/policy-types
  @vestara/sqlite-migrations

LAYER 1 (Single dep):
  @vestara/event-bus         ← shared
  @vestara/logger             ← shared
  @vestara/context            ← shared
  @vestara/configuration      ← shared
  @vestara/permission         ← shared
  @vestara/media-runtime      ← shared
  @vestara/events             ← types

LAYER 2:
  @vestara/runtime            ← types, event-bus, state-machine, registry, permissions, events
  @vestara/policy-engine      ← policy-types
  @vestara/stream             ← shared, event-bus, logger
  @vestara/provider-runtime   ← event-bus, logger, shared

LAYER 3:
  @vestara/filesystem-runtime ← policy-engine, policy-types, permission, shared
  @vestara/tool-runtime       ← filesystem-runtime, shared, types
  @vestara/conversation       ← shared, context, stream, event-bus, logger
  @vestara/opencode-runtime   ← events, event-bus, runtime, types
  @vestara/intent             ← types
  @vestara/understanding      ← shared, types

LAYER 4:
  @vestara/conversation-runtime ← runtime, shared, conversation, event-bus, logger,
                                   opencode-runtime, sqlite-migrations
  @vestara/activity-room       ← event-bus, media-runtime, shared, sqlite-migrations, types
  @vestara/workflow-orchestrator ← types, event-bus, opencode-runtime, ...

LAYER 5 (Facade):
  @vestara/workspace ← 20 internal deps (action, agent-harness, capabilities, context,
                        conversation, conversation-runtime, configuration, event-bus,
                        filesystem-runtime, knowledge, logger, memory, opencode-runtime,
                        runtime, shared, sqlite-migrations, thread-runtime, types,
                        understanding, workflow-orchestrator)

LAYER 6 (Applications):
  @vestara/api          ← 48 internal deps
  @vestara/workspace-ui ← 8 internal deps (activity-room, configuration, design-system,
                           execution-center, media-conference, settings-framework, shared, types)
```

### F.2 Illegal Dependencies

**None found.** No `packages/*` imports from `apps/*`. The `workspace-architecture.mjs` guard enforces this.

### F.3 Duplicated Contracts from Package Boundaries

| Contract | Defined In | Duplicated In | Reason |
|----------|-----------|---------------|--------|
| `AgentRole` (28 values) | `@vestara/workspace` types.ts:456 | `apps/workspace` AgentProjectionDrawer.tsx:78-90 (hardcoded strings) | UI cannot depend on `@vestara/workspace` (too heavy) |
| `EngineeringAgentRole` (6 values) | `@vestara/provider-runtime` routing-types.ts:20 | `apps/workspace` lib/routing.ts:1 (identical copy) | UI cannot depend on `@vestara/provider-runtime` |
| `Conversation`/`Message` | `@vestara/shared` conversation-types.ts | `apps/workspace` chat/types.ts (ChatMessage — presentation variant) | Presentation model intentionally differs from domain |
| `TaskStatus` | `@vestara/workflow-orchestrator` types.ts:89 | `@vestara/activity-room` contracts.ts:80-94 (mirror) | Legitimate mirror for activity projection |

### F.4 Dependency Inversion Opportunities

1. **`AgentRole` extraction:** The 28-value `AgentRole` union should be extracted from `@vestara/workspace` into `@vestara/types` (or a new `@vestara/agent-types` leaf). This would allow `@vestara/workspace-ui` to import it without depending on the heavy workspace facade. This is the root cause of the hardcoded string copies.

2. **`EngineeringAgentRole` extraction:** Similarly, the 6-value routing role set should live in a shared package (e.g., `@vestara/types`) rather than being duplicated in `@vestara/provider-runtime` and `apps/workspace`.

3. **`AssistantExecutionDetail` location:** Currently in `@vestara/shared` (a leaf package), which is correct. The normalization lives in `@vestara/opencode-runtime`. This is a clean dependency inversion — the projection contract is in the leaf, the normalization is in the runtime.

### F.5 Contracts Requiring Extraction

| Current Location | Contract | Target Package | Rationale |
|-----------------|----------|----------------|-----------|
| `@vestara/workspace` types.ts:456-484 | `AgentRole` | `@vestara/types` | Enables UI to import without heavy dependency |
| `@vestara/workspace` types.ts:486-512 | `AgentType` | `@vestara/types` | Same reasoning |
| `@vestara/workspace` types.ts:513-556 | `AgentCapability` | `@vestara/types` | Same reasoning |
| `@vestara/workspace` types.ts:599-631 | `AgentDefinition`, `CanonicalAgent` | `@vestara/types` (interfaces only) | Lighter coupling; implementation stays in workspace |
| `@vestara/provider-runtime` routing-types.ts:1-20 | `EngineeringCapability`, `EngineeringAgentRole` | `@vestara/types` | Eliminates UI duplication |

---

## G. Target Ownership Model

### G.1 Proposed Boundaries

Only boundaries justified by evidence from this vertical slice are proposed.

#### Boundary 1: `@vestara/agent-types` (NEW leaf package)

| Aspect | Detail |
|--------|--------|
| **Responsibility** | Canonical agent vocabulary types (AgentRole, AgentType, AgentCapability, AgentDefinition interface) |
| **Contracts owned** | `AgentRole` (28 values), `AgentType`, `AgentCapability`, `AgentDefinition` (interface), `CanonicalAgent` (interface), `AgentMode`, `OpenCodePermissions` |
| **State owned** | None (type-only package) |
| **Dependencies allowed** | None (leaf) |
| **Dependencies forbidden** | Everything |
| **Rationale** | Breaks the `@vestara/workspace` → UI dependency bottleneck. The UI can import agent vocabulary without depending on the 20-dependency workspace facade. |

#### Boundary 2: `@vestara/routing-types` (NEW leaf package, or add to `@vestara/types`)

| Aspect | Detail |
|--------|--------|
| **Responsibility** | Provider routing vocabulary (EngineeringAgentRole, EngineeringCapability, RoleRoutingPolicy) |
| **Contracts owned** | `EngineeringAgentRole`, `EngineeringCapability`, `EngineeringRoutingPolicy`, `RoutingAssignment` |
| **State owned** | None (type-only) |
| **Dependencies allowed** | None (leaf) |
| **Dependencies forbidden** | Everything |
| **Rationale** | Eliminates the duplicated `EngineeringAgentRole` between `@vestara/provider-runtime` and `apps/workspace`. |

#### Boundary 3: `@vestara/permission-contracts` (NEW leaf, or add to `@vestara/types`)

| Aspect | Detail |
|--------|--------|
| **Responsibility** | Permission vocabulary shared between Vestara policy and OpenCode bridge |
| **Contracts owned** | `OpenCodePermissionAction`, `OpenCodePermissionRisk`, `PolicyDecision`, `VestaraPermissionDecision` |
| **State owned** | None (type-only) |
| **Dependencies allowed** | None (leaf) |
| **Dependencies forbidden** | Everything |
| **Rationale** | The policy engine in `@vestara/api` and the OpenCode permission bridge in `@vestara/opencode-runtime` both need these types. Currently they live in opencode-runtime, forcing the API to depend on the runtime for types. |

### G.2 Existing Boundaries to Preserve

| Package | Responsibility | Keep As-Is? |
|---------|---------------|-------------|
| `@vestara/shared` | Universal leaf types (Conversation, Message, Provider, Stream, Execution) | **Yes** — clean leaf |
| `@vestara/types` | Cross-domain branded IDs and primitives | **Yes** — clean leaf; absorb agent-types if feasible |
| `@vestara/conversation` | Conversation service boundary (in-memory + store interface) | **Yes** — clean service boundary |
| `@vestara/conversation-runtime` | SQLite persistence for conversations + sessions | **Yes** — clean persistence boundary |
| `@vestara/activity-room` | Activity projection pipeline (event → projector → store → hub) | **Yes** — clean domain boundary |
| `@vestara/opencode-runtime` | OpenCode HTTP client, session registry, permissions bridge | **Yes** — clean runtime boundary |
| `@vestara/provider-runtime` | Provider lifecycle management | **Yes** — but extract routing types |
| `@vestara/workspace` | Integration facade (currently 20 deps) | **ADAPT** — extract types, reduce coupling |

---

## H. Ordered Contract Baseline

### H.1 Contract Implementation Order

Contracts must be defined in dependency order. The following order is required before AR-GA-CORE-002 begins.

| Order | Contract | Purpose | Canonical Owner | Consumers | Dependencies | Classification | Migration Risk |
|-------|----------|---------|----------------|-----------|-------------|----------------|----------------|
| 1 | `AgentRole`, `AgentType`, `AgentCapability` | Agent vocabulary types | NEW `@vestara/agent-types` (or `@vestara/types`) | `@vestara/workspace`, `@vestara/workspace-ui`, `@vestara/api`, `@vestara/provider-runtime`, `@vestara/agent-performance` | None (leaf) | **REBUILD** — extract from workspace | Low — type-only, no runtime impact |
| 2 | `EngineeringAgentRole`, `EngineeringCapability` | Routing vocabulary types | NEW `@vestara/routing-types` (or `@vestara/types`) | `@vestara/provider-runtime`, `@vestara/workspace-ui`, `@vestara/api` | None (leaf) | **REBUILD** — extract from provider-runtime | Low — type-only |
| 3 | `OpenCodePermissionAction`, `PolicyDecision` | Permission vocabulary | `@vestara/types` (or `@vestara/permission-contracts`) | `@vestara/api`, `@vestara/opencode-runtime`, `@vestara/workspace` | None (leaf) | **ADAPT** — move from opencode-runtime to leaf | Low — re-export shim needed |
| 4 | `Conversation`, `Message`, `ConversationStore` | Conversation domain model | `@vestara/shared` + `@vestara/conversation` | `@vestara/conversation-runtime`, `@vestara/api`, `@vestara/workspace`, `@vestara/workspace-ui` | None | **KEEP** — already clean | None |
| 5 | `ActivityRecord`, `ActivityStore`, `ActivityProjectionService` | Activity domain model | `@vestara/activity-room` | `@vestara/api`, `@vestara/workspace-ui` | `@vestara/shared`, `@vestara/types` | **KEEP** — already clean | None |
| 6 | `AssistantCapabilityPolicy`, permission evaluation | Vestara authorization policy | `@vestara/api` (or extract to `@vestara/policy`) | `@vestara/api` (adapter) | `@vestara/types` (permission contracts) | **ADAPT** — extract from api to standalone package | Medium — api imports change |
| 7 | `RuntimeSessionBinding`, `RuntimeSessionRegistry` | M7 session continuity | `@vestara/opencode-runtime` | `@vestara/api`, `@vestara/workspace` | `@vestara/types` (IDs) | **KEEP** — already well-designed | None |
| 8 | `AssistantConversationSessionRegistry` → delegate to M7 | GA session binding convergence | `@vestara/api` → `@vestara/opencode-runtime` | `@vestara/api` (adapter) | `@vestara/opencode-runtime` | **ADAPT** — GA registry should delegate to M7 registry | Medium — behavior change |
| 9 | Unified execution event model | Shared execution projection | `@vestara/shared` (types) + `@vestara/opencode-runtime` (normalization) | `@vestara/api`, `@vestara/workspace-ui`, `@vestara/activity-room` | `@vestara/types` | **ADAPT** — extend existing types | Medium — both GA and AR consume |
| 10 | `WorkflowRun`, `WorkflowTask` (canonical) | Workflow runtime model | `@vestara/types` + `@vestara/workflow-orchestrator` | `@vestara/workspace`, `@vestara/activity-room`, `@vestara/api` | `@vestara/types` (IDs) | **KEEP** — already well-designed | None |

### H.2 Prerequisites for AR-GA-CORE-002

Before convergence implementation begins, contracts 1-3 MUST be defined. These eliminate the vocabulary duplication that currently prevents clean cross-package type sharing. Contracts 4-5 are already clean and need no changes. Contracts 6-10 can be addressed during convergence.

---

## I. Migration/Compatibility Map

### I.1 Component Classification

| Component | Location | Classification | Rationale |
|-----------|----------|----------------|-----------|
| `AgentRole` (28-value union) | `workspace/src/types.ts:456-484` | **REBUILD** | Extract to leaf package; current location causes UI duplication |
| `AgentRole` (hardcoded in UI) | `workspace-ui/AgentProjectionDrawer.tsx:78-90` | **RETIRE** | Replace with import from extracted type package |
| `EngineeringAgentRole` (local copy in UI) | `workspace-ui/lib/routing.ts:1` | **RETIRE** | Replace with import from extracted type package |
| Normalization bridge in chat route | `api/routes/chat.ts:164-165` | **RETIRE** | Remove when agent definitions carry `routingRole` field |
| `AgentCapability` (domain) | `workspace/src/types.ts:513-556` | **ADAPT** | Keep in workspace or extract; clarify relationship with routing caps |
| `CAPABILITY_DESCRIPTIONS` | `workspace/src/agent-service.ts:17-56` | **KEEP** | Metadata for domain capabilities; well-scoped |
| `AgentCapabilityName` (filesystem) | `workspace/src/agent-capability.ts:17-29` | **KEEP** | Closed, well-structured vocabulary |
| `Conversation`/`Message` | `shared/src/conversation-types.ts` | **KEEP** | Clean authoritative source |
| `ConversationStore` (workspace version) | `conversation/src/index.ts:39-48` | **KEEP** | Clean interface |
| `ConversationStore` (state-runtime) | `state-runtime/src/index.ts:32-38` | **RETIRE** | Superseded by conversation-runtime |
| `Participant` | `types/src/activity.ts:42-60` | **KEEP** | Clean leaf definition |
| `ParticipantProjection` | `activity-room/src/projection-types.ts:111-176` | **KEEP** | Legitimate enriched read model |
| `ActivityRecord` | `activity-room/src/contracts.ts:177-183` | **KEEP** | Clean domain model |
| `ActivityProjectionService` | `activity-room/src/service.ts` | **KEEP** | Well-designed projection pipeline |
| `AssistantCapabilityPolicy` | `api/src/assistant-capability-policy.ts` | **ADAPT** | Extract to standalone package for reuse |
| `AssistantInteractionBroker` | `api/src/assistant-interaction-broker.ts` | **ADAPT** | Currently GA-specific; may become shared |
| `AssistantConversationSessionRegistry` | `api/src/assistant-conversation-sessions.ts` | **ADAPT** | Should delegate to M7 `RuntimeSessionRegistry` |
| `AssistantBindingResolver` | `api/src/assistant-binding-resolver.ts` | **KEEP** | Clean validation boundary |
| `OpenCodeAdapter` (`runAssistantOpenCodeTurn`) | `api/src/assistant-opencode-adapter.ts` | **ADAPT** | Core execution path; may be shared by AR and GA |
| `triggerAssistantTurn` | `activity-room/src/assistant-turn.ts` | **ADAPT** | Creates throwaway conversations; needs session reuse |
| `RuntimeSessionRegistry` (M7) | `opencode-runtime/src/sessions/runtime-session-registry.ts` | **KEEP** | Well-designed; GA should adopt |
| `OpenCodeHttpClient` | `opencode-runtime/src/client/opencode-http-client.ts` | **KEEP** | Clean HTTP boundary |
| `Workflow` (simplified, 4 statuses) | `workspace/src/types.ts:1003-1014` | **RETIRE** | Superseded by orchestrator types |
| `Task` (simplified, 4 statuses) | `workspace/src/types.ts:188-198` | **RETIRE** | Superseded by orchestrator types |
| `MultiAgentWorkflowOrchestrator` | `workspace/src/multi-agent-workflow.ts:301` | **ADAPT** | Template system useful; implementation may shift to orchestrator |
| `SessionOrchestrator` | `workspace/src/session-orchestrator.ts` | **RETIRE** | Legacy orchestration; superseded by workflow-orchestrator |
| `AgentRole` in agent-performance | `agent-performance/src/performance-types.ts:10` | **ADAPT** | Use `RoutingRole` from extracted type |
| `RealAgentRole` in test | `workflow-orchestrator/__tests__/e2e-support/real-agent/profile.ts:12` | **RETIRE** | Test-only; update to use canonical types |

### I.2 Temporary Adapters to Maintain During Convergence

| Adapter | Location | Purpose | Retirement Condition |
|---------|----------|---------|---------------------|
| `chat.ts` normalization bridge (`'documenter' → 'documentation'`) | `api/routes/chat.ts:164-165` | Bridges workspace role → routing role | When AgentDefinition carries `routingRole` field |
| `execution-planner.ts` roleToAgentRole mapping | `workspace/src/execution-planner.ts:140-150` | Maps assignment roles → workspace roles | When single canonical role vocabulary exists |
| `ProviderModelPicker.tsx` `isRuntimeManaged` flag | `workspace-ui/ProviderModelPicker.tsx:184-186` | Acknowledges OpenCode manages its own credentials | When credential authority is formalized in contracts |
| `AgentProjectionDrawer.tsx` hardcoded role list | `workspace-ui/AgentProjectionDrawer.tsx:78-90` | UI-local copy of AgentRole | When `@vestara/agent-types` exists |
| `lib/routing.ts` EngineeringAgentRole copy | `workspace-ui/lib/routing.ts:1` | UI-local copy of routing types | When `@vestara/routing-types` exists |

### I.3 Agent Drawer Role/Capability Option Lists

The current Agent drawer in `AgentProjectionDrawer.tsx` uses hardcoded string literals for role and capability options. Per the audit directive, these are **temporary UI adapters**. The audit confirms this classification:

- The hardcoded `ALL_ROLES` array (line 78-90) is a synchronization copy of `AgentRole` from `@vestara/workspace`, necessitated by the dependency boundary.
- The hardcoded capabilities list (if present) would be a similar copy.
- These should be replaced with imports once the type extraction (contract order 1-2) is complete.

---

## J. Risk Register

### J.1 Architectural Risks

| # | Risk | Impact | Migration Difficulty | Classification | Evidence |
|---|------|--------|---------------------|----------------|----------|
| R1 | **Split authority: AgentRole vocabulary** — Three incompatible role vocabularies across workspace, agent-performance, and provider-runtime. Normalization bridge in chat.ts masks the divergence. | HIGH — Every cross-package role comparison is fragile; new packages will copy the wrong vocabulary | LOW — Type extraction is mechanical | BLOCKER for convergence | C.1 |
| R2 | **Duplicate persistence: Conversation vs Activity** — GA messages persist in `conversations.db`; AR messages persist in `activity.db`. No shared message model. | HIGH — Convergence requires unified message semantics; two persistence paths means two consistency guarantees | MEDIUM — Requires unified message contract | ADJACENT — Known design difference | E.1 |
| R3 | **Session ownership ambiguity** — `AssistantConversationSessionRegistry` (API-level, in-memory) and `RuntimeSessionRegistry` (M7, in-memory) are separate registries for similar concerns. GA does not use M7. | MEDIUM — Two registries can diverge; session reuse across GA and workflow is impossible | MEDIUM — GA adapter must adopt M7 | ADJACENT — Known gap | D.6 |
| R4 | **Provider/model authority leakage** — UI sends provider/model selection; API validates against OpenCode runtime; but OpenCode may override at execution time. Vestara does not control the final routing. | LOW — OpenCode is the execution runtime; Vestara validates feasibility, not final routing | LOW — Accept by design | OBSERVATION — Vestara validates, OpenCode routes | D.3 |
| R5 | **Permission/tool authority leakage** — `agent-assistant` grants ALL permissions at OpenCode level (`ASSISTANT_GRANT`); real enforcement is Vestara's `AssistantCapabilityPolicy`. If the policy is bypassed or misconfigured, the model has unrestricted access. | HIGH — Policy is the only enforcement layer; misconfiguration = full access | LOW — Policy is well-designed; ensure it cannot be bypassed | ADJACENT — Known design; policy is authoritative | D.5 |
| R6 | **Runtime-specific abstractions in core contracts** — `OpenCodePermissionAction`, `OpenCodePermissionRisk`, `OpenCodePermissionRequest` are OpenCode-specific types that have become part of Vestara's permission vocabulary. They appear in `@vestara/opencode-runtime` but are consumed by `@vestara/api` policy engine. | MEDIUM — If a new runtime (Codex, Claude Code) is added, its permission model must be normalized to OpenCode's vocabulary | MEDIUM — Requires runtime-agnostic permission vocabulary | ADJACENT — Known tech debt | D.5 |
| R7 | **UI becoming domain authority** — `AgentProjectionDrawer.tsx` hardcodes role/capability lists. If these drift from the canonical source, the UI becomes an accidental authority for what roles exist. | LOW — Currently supervised by comment "Values from packages/workspace/src/types.ts"; drift is detectable | LOW — Fixed by type extraction | OBSERVATION — Temporary adapter | I.3 |
| R8 | **Event projection becoming persistence authority** — Activity Room's `ActivityStore` is append-only and reconstructable. If consumers begin depending on projection state rather than the durable store, the projection becomes an accidental persistence authority. | LOW — Current architecture explicitly separates domain state from projection | LOW — Already designed correctly | OBSERVATION — Architecture is sound | A.3 |
| R9 | **Compatibility adapters becoming permanent architecture** — The normalization bridge in `chat.ts:164-165` and the role mapping in `execution-planner.ts:140-150` were intended as temporary bridges. If not retired, they become the de facto role resolution mechanism. | MEDIUM — Adapters mask the vocabulary divergence; retiring them requires the extraction work | LOW — Once types are extracted, adapters are trivially removed | ADJACENT — Known tech debt | C.1 |
| R10 | **Unused dependency: `@vestara/conversation-runtime` in workspace** — `packages/workspace/package.json` declares `@vestara/conversation-runtime` but source code has zero imports. This is a phantom dependency that inflates the workspace facade's dependency count. | LOW — No runtime impact; increases workspace dependency count from 19 to 20 | LOW — Remove from package.json | OBSERVATION — Wasteful but harmless | F.1 |
| R11 | **`@vestara/state-runtime` ConversationStore** — Older, simpler interface coexists with the canonical `@vestara/conversation` interface. If any code path still uses the state-runtime version, it lacks `runtimeSessionId` support and will fail for session continuity. | LOW — Appears unused for conversation operations; but not verified as fully retired | LOW — Verify and retire | ADJACENT — Potential dead code | C.3 |
| R12 | **GA creates throwaway conversations in AR** — `triggerAssistantTurn()` creates ephemeral conversations via `ConversationService`, sends one message, then persists the response in ActivityStore. The ConversationService conversation is never used again. | MEDIUM — Wastes resources; loses context for multi-turn agent interaction in AR | MEDIUM — Requires session reuse design | ADJACENT — Known limitation | E.1 |

---

## K. CORE-002 Gate

### Recommendation: **READY FOR AR-GA-CORE-002**

### Rationale

The authority and contract baseline is established. The following conditions are met:

1. **Vertical slice is fully traced.** The end-to-end call graph from UI to OpenCode and back is documented with exact file paths and line numbers.

2. **Authority is classified.** Every domain responsibility has a current owner, desired owner, and classification (KEEP/ADAPT/REBUILD/RETIRE).

3. **Duplicates are identified.** The three AgentRole vocabularies, the capability fragmentation, the ConversationStore duplication, and the TaskStatus multiplicity are all documented with evidence and recommendations.

4. **Runtime boundary is explicit.** The Vestara/OpenCode boundary is traced across all dimensions: session, provider, credential, permission, execution, and event ingestion.

5. **GA vs AR divergence is mapped.** The two systems use different persistence, different realtime transports, and different execution paths. The convergence points are identified.

6. **Package boundaries are clean.** No illegal dependencies exist. The dependency graph is acyclic and well-layered.

7. **Contract order is defined.** Ten contracts in dependency order, with prerequisites for CORE-002 clearly stated.

8. **Risks are classified.** Twelve risks with impact, migration difficulty, and evidence.

### Required Evidence Before CORE-002 Implementation Begins

1. **Contract 1-3 extraction plan** — The specific files and types to extract into leaf packages, with migration strategy for existing consumers.

2. **Session convergence design** — How `AssistantConversationSessionRegistry` will delegate to or be replaced by `RuntimeSessionRegistry` (M7). This affects the GA adapter significantly.

3. **Unified execution event contract** — Whether GA's `StreamChunk` + `AssistantExecutionDetail` and AR's `ActivityRecord` → `StreamItem` can share a common event model, or whether they remain separate projections.

### What CORE-002 Should NOT Do

- Do not redesign the entire provider/model system
- Do not refactor the workspace facade's 20 dependencies (that's a separate workstream)
- Do not add new Activity Room features
- Do not modify OpenCode permission behavior
- Do not extract the Agent Control Marketplace

---

## Appendix: Source Location Reference

### Key Source Files

| File | Package | Role in Vertical Slice |
|------|---------|----------------------|
| `packages/shared/src/conversation-types.ts` | `@vestara/shared` | Authoritative Conversation, Message types |
| `packages/shared/src/provider.ts` | `@vestara/shared` | Authoritative AIProvider, AIModel types |
| `packages/shared/src/tool.ts` | `@vestara/shared` | Authoritative ToolDefinition types |
| `packages/shared/src/assistant-execution.ts` | `@vestara/shared` | Browser projection contract for execution |
| `packages/shared/src/stream.ts` | `@vestara/shared` | StreamChunk (SSE wire format) |
| `packages/workspace/src/types.ts` | `@vestara/workspace` | AgentRole (28), AgentCapability, AgentDefinition, Workflow |
| `packages/workspace/src/agents.registry.ts` | `@vestara/workspace` | CANONICAL_AGENTS, ASSISTANT_GRANT |
| `packages/workspace/src/agent-capability.ts` | `@vestara/workspace` | AgentCapabilityName (filesystem) |
| `packages/workspace/src/agent-capability-manager.ts` | `@vestara/workspace` | CAPABILITY_PERMISSION, AgentCapabilityManager |
| `packages/workspace/src/agent-service.ts` | `@vestara/workspace` | CAPABILITY_DESCRIPTIONS |
| `packages/workspace/src/multi-agent-workflow.ts` | `@vestara/workspace` | MultiAgentWorkflowOrchestrator, templates |
| `packages/workspace/src/session-orchestrator.ts` | `@vestara/workspace` | SessionOrchestrator (legacy) |
| `packages/conversation/src/index.ts` | `@vestara/conversation` | ConversationStore, ConversationService, DefaultConversationService |
| `packages/conversation-runtime/src/conversation-store.ts` | `@vestara/conversation-runtime` | SqliteConversationStore |
| `packages/context/src/index.ts` | `@vestara/context` | DefaultContextAssembler |
| `packages/activity-room/src/contracts.ts` | `@vestara/activity-room` | ActivityRecord, ActivityKind, ActivityActor |
| `packages/activity-room/src/projection-types.ts` | `@vestara/activity-room` | ActivityRoomProjection, StreamItem, ParticipantProjection |
| `packages/activity-room/src/service.ts` | `@vestara/activity-room` | ActivityProjectionService |
| `packages/activity-room/src/store.ts` | `@vestara/activity-room` | ActivityStore, InMemoryActivityStore |
| `packages/activity-room/src/assistant-turn.ts` | `@vestara/activity-room` | triggerAssistantTurn() |
| `packages/opencode-runtime/src/client/opencode-http-client.ts` | `@vestara/opencode-runtime` | OpenCodeHttpClient (HTTP boundary) |
| `packages/opencode-runtime/src/client/opencode-types.ts` | `@vestara/opencode-runtime` | OpenCodeSessionBinding, VestaraPermissionDecision |
| `packages/opencode-runtime/src/config.ts` | `@vestara/opencode-runtime` | OpenCodeRuntimeConfig, resolveOpenCodeConfig |
| `packages/opencode-runtime/src/sessions/runtime-session-types.ts` | `@vestara/opencode-runtime` | RuntimeSessionBinding, ContinuityPolicy |
| `packages/opencode-runtime/src/sessions/runtime-session-registry.ts` | `@vestara/opencode-runtime` | RuntimeSessionRegistry (M7) |
| `packages/opencode-runtime/src/permissions/permission-types.ts` | `@vestara/opencode-runtime` | OpenCodePermissionAction, normalizePermissionRequest |
| `packages/opencode-runtime/src/permissions/permission-registry.ts` | `@vestara/opencode-runtime` | PermissionRegistry |
| `packages/opencode-runtime/src/execution-normalizer.ts` | `@vestara/opencode-runtime` | VestaraExecutionState, VestaraExecutionEvent |
| `packages/provider-runtime/src/routing-types.ts` | `@vestara/provider-runtime` | EngineeringAgentRole, EngineeringCapability |
| `packages/agent-performance/src/performance-types.ts` | `@vestara/agent-performance` | AgentRole (6 values, 'engineer') |
| `packages/types/src/activity.ts` | `@vestara/types` | Participant, MembershipState, PresenceState, WorkState |
| `packages/types/src/workflow.ts` | `@vestara/types` | WorkflowRun, WorkflowTask, WorkflowPlan |
| `packages/types/src/intent.ts` | `@vestara/types` | IntentInfo, IntentStatus |
| `packages/intent/src/intent.ts` | `@vestara/intent` | Intent state machine |
| `packages/understanding/src/planning-context.ts` | `@vestara/understanding` | Intent (classification) |
| `apps/api/src/routes/conversations.ts` | `@vestara/api` | Conversation route handlers |
| `apps/api/src/routes/providers.ts` | `@vestara/api` | Provider/credential routes |
| `apps/api/src/assistant-opencode-adapter.ts` | `@vestara/api` | GA execution adapter (742 lines) |
| `apps/api/src/assistant-capability-policy.ts` | `@vestara/api` | Vestara permission policy |
| `apps/api/src/assistant-interaction-broker.ts` | `@vestara/api` | Permission/question async bridge |
| `apps/api/src/assistant-conversation-sessions.ts` | `@vestara/api` | GA session registry |
| `apps/api/src/assistant-binding-resolver.ts` | `@vestara/api` | Provider/model validation |
| `apps/api/src/workspace-context.ts` | `@vestara/api` | Composition root (wiring) |
| `apps/api/src/activity-room.ts` | `@vestara/api` | ActivityRoom singleton |
| `apps/api/src/routes/activity-room.ts` | `@vestara/api` | Activity Room message routes |
| `apps/workspace/src/hooks/useAssistantConversation.ts` | `@vestara/workspace-ui` | GA client-side hook |
| `apps/workspace/src/components/assistant/ConversationPanel.tsx` | `@vestara/workspace-ui` | GA conversation panel |
| `apps/workspace/src/components/ui/agents/ProviderModelPicker.tsx` | `@vestara/workspace-ui` | Model selection UI |
| `apps/workspace/src/pages/activity/AgentProjectionDrawer.tsx` | `@vestara/workspace-ui` | Agent drawer (hardcoded roles) |
| `apps/workspace/src/lib/routing.ts` | `@vestara/workspace-ui` | Local EngineeringAgentRole copy |
| `apps/workspace/src/lib/activity.ts` | `@vestara/workspace-ui` | Activity Room client API |
| `apps/workspace/src/hooks/useActivityStream.ts` | `@vestara/workspace-ui` | Activity stream hook |

# AR-P1 — Production Activity Room Ownership Audit (AUDIT ONLY)

> **Constraint:** No Activity Room, workflow, agent, provider/model, OpenCode runtime, conversation, participant, or execution behavior was modified. This document establishes the authoritative ownership map required before restructuring.
> **Date:** 2026-08-26
> **Scope:** Human/UI → API → intent/routing → workflow → agent → provider/model → OpenCode session → execution events → workflow state → Activity Room projection → UI stream
> **Codebase snapshot:** `vestara-ai-core` at `apps/api/src/workspace-context.ts:897` / `packages/*`

---

## A. Current Architecture Map

### Layer Diagram (authoritative stores underlined)

```
Human/UI (browser workspace, console, curl)
  │
  ├─ HTTP REST  ──────────────────────────────────────────┐
  └─ WebSocket (/ws, /ws/activity, /ws/worker)           │
          │                                              │
   ┌──────▼──────────────────────────────────────────────┐ │
   │  apps/api (gateway)                                 │ │
   │  server.ts: createServer() + broadcastRaw()         │ │
   │  routes/* (activity-room, conversations, orchestration, │ │
   │           agents, providers, routing, opencode, ...)│ │
   │  activity-room.ts (initActivityRoom → activity.db) │ │
   └──────┬──────────────────────────────────────────────┘ │
          │ wires                                        │
┌─────────▼──────────────────────────────────────────────────────────────┐
│  WorkspaceContext (apps/api/src/workspace-context.ts) – composition root │
│  Kernel + HostRuntime + BootRuntime + WorkspaceRuntime                  │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  Provider substrate                                               │ │
│  │  provider-runtime (DefaultProviderManager, EngineeringRoutingRuntime,  │
│  │                     FileRoutingStore ~/routing.json)              │ │
│  │  provider-opencode (OpenCodeProvider, OpenCodeGoProvider, OpenAIProvider,│
│  │                     OpenCodeRuntimeProvider → opencode-runtime)  │ │
│  │  opencode-runtime (OpenCodeHttpClient, OpenCodeRuntime,         │ │
│  │                    InMemorySessionRegistry, config)              │ │
│  ├──────────────────────────────────────────────────────────────────┤ │
│  │  Execution substrate                                               │ │
│  │  agent-harness (AgentHarnessRuntime, HarnessSession)              │ │
│  │  thread-runtime (FileThreadStore → .vestara/*/threads/*.db)       │ │
│  │  workflow-orchestrator (WorkflowOrchestrator → plans.db)          │ │
│  │  worktree-runtime, worker/* (remote dispatch)                     │ │
│  ├──────────────────────────────────────────────────────────────────┤ │
│  │  Conversation substrate                                            │ │
│  │  conversation (DefaultConversationService – in-memory + events)   │ │
│  │  conversation-runtime (SqliteConversationStore/ SessionStore →    │ │
│  │                         conversations/{conversations,saved-chats}.db)│
│  │  intent (IntentManager, Planner) – currently NOT wired in chat path│
│  ├──────────────────────────────────────────────────────────────────┤ │
│  │  Knowledge / Memory                                                │ │
│  │  context (DefaultContextAssembler), memory (DefaultMemoryRuntime) │ │
│  │  knowledge, evidence, verification                                │ │
│  ├──────────────────────────────────────────────────────────────────┤ │
│  │  Activity / Observability substrate (PROJECTION, NOT SOURCE)      │ │
│  │  activity-projection (ActivityProjectionService, ActivityStreamHub,│
│  │                       SqliteActivityStore → activity.db)         │ │
│  │  activity-log (ActivityService → activity_log.db – legacy)       │ │
│  │  engineering-event-store (SqliteEngineeringEventStore → engineering-events.db)│
│  │  events / event-bus (InProcessEventBus, WsServerMessage)          │ │
└──┬──────────────────────────────────────────────────────────────────┘ │
   │ bridges / events                                                    │
   ▼                                                                     │
  EventBus  ──►  bridges/*  ──►  Activity Room projection ──►  Hub/broadcast
   │              (harness-engineering, orchestration,                   │
   │               activity-room-organizational)                         │
   └────► engineeringEvents, workflowOrchestrator, changeProjector ◄─────┘
```

**Key boundary note:** Activity Room is **never on the write path** for workflow/orchestration/agent decisions. It subscribes to `eventBus:*` via `startActivityRoomOrganizationalBridge` and projects a **derived** durable stream. The authoritative writers are `WorkflowOrchestrator` (plans.db), `FileThreadStore` (threads.db), `FileRoutingStore` (routing.json), `ProviderManager`/OpenCode runtime (provider registry), and `ConversationStore` (conversations.db).

---

## B. Runtime Call Graph (10-column per transition)

Legend: **Dependency = direct call | event | bridge | projection** | **Ownership = authoritative (A) = single writer, persisted | derived (D) = projection/cache/broadcast**

### T1 — Human/UI Input → API Ingress

| # | Field | Value |
|---|-------|-------|
| 1 | Entry point/file | `apps/workspace/src/lib/api.ts` (fetch), `apps/workspace/src/lib/ws.ts` (`/ws`, `/ws/activity`), curl; also `apps/api/src/routes/activity-room.ts:175 POST /api/messages`, `:agents/:id/messages`, `POST /api/conversations/:id/messages` |
| 2 | Owning service/module | `apps/api/src/server.ts:createServer()` (http + WebSocket upgrade, streaming prefixes, broadcastRaw) |
| 3 | State created/mutated | Ephemeral `http.IncomingMessage` / WS frame → parsed body. No durable state yet. `messageReceipts` registry seeded in-memory (see T2). |
| 4 | Persistence authority | None at ingress. Validation only. |
| 5 | Event emitted | None directly; route handler synchronously validates and calls downstream. |
| 6 | Downstream consumer | Route dispatchers (`handleActivityRoomRoute`, `handleConversationsRoute`, `handleOrchestrationRoute`) |
| 7 | Dependency | **direct call** (HTTP) / **bridge** (WS upgrade → hub attach) |
| 8 | Ownership | **A** for transport, but not for domain state |
| 9 | Duplicate/ambiguous | `POST /api/messages` vs `POST /api/agents/:id/messages` vs `POST /api/conversations/:id/messages` – three ingresses for logically same human utterance, with different validation (MessageTarget vs conversationId). No canonical chat entry. |
| 10 | Production risk | **Medium**: ingress forks before ownership is assigned; a UI bug can append to Activity Room without a workflowId and bypass receipt/routing, producing orphan `agent-message` records. |

### T2 — API → Activity Room Message Append (human message)

| # | Field | Value |
|---|-------|-------|
| 1 | Entry point/file | `apps/api/src/routes/activity-room.ts:327 sendActivityMessage()` |
| 2 | Owning service/module | `ActivityProjectionService.appendActivity()` → `SqliteActivityStore.append()` |
| 3 | State created/mutated | `AgentMessageActivity` (id `activity:msg:${uuid}`, sequence monotonic, `actor.type=human`, `agentId=all-agents|<id>`, optional `workflowId`) |
| 4 | Persistence authority | **Authoritative**: `SqliteActivityStore` → `.vestara/activity.db` via `ACTIVITY_MANIFEST` migrations. Idempotent on `id`, sequence allocated by `MonotonicSequence`. `isDirty` semantics irrelevant – append-only. |
| 5 | Event emitted | `hub.broadcast(record)` (ActivityStreamHub) + derived `activity.appended` WS message. No `eventBus` event for human messages (proceeds directly to store). |
| 6 | Downstream consumer | `message-receipts.ts:58 registerMessage()` (in-memory), `ActivityStreamHub` subscribers (UI timeline), harness context assembler (next agent turn observes message) |
| 7 | Dependency | **projection** (store → hub is callback `onAppended`) is synchronous after persist; **direct call** to receipt registry |
| 8 | Ownership | **A** for `agent-message` record content + sequence; **D** for `hasDetails` preview truncation (`projectActivity`) and receipts |
| 9 | Duplicate/ambiguous | `messageReceipts` is **in-memory only** (Map), not durable; participants derived from `FileThreadStore.listThreads()` metadata. If process restarts, receipts vanish even though messages persist – unread badges silently reset. |
| 10 | Production risk | **High**: durability split (message durable, receipt ephemeral). Restart or horizontal scale loses attention state. Also no idempotency key from client. |

### T3 — API → Intent/Routing Layer

| # | Field | Value |
|---|-------|-------|
| 1 | Entry point/file | `POST /api/routing/preview`, `POST /api/routing/selection`, `GET /api/routing/catalog` → `apps/api/src/routes/routing.ts` |
| 2 | Owning service/module | `provider-runtime: EngineeringRoutingRuntime.resolve()` + `FileRoutingStore` + `FileRoutingAssignmentStore` |
| 3 | State created/mutated | `VersionedRoutingSelection` (`revision`, `profileId`, `roles->{provider/model}`) and `RoutingDecisionEvidence` (ephemeral proof object) |
| 4 | Persistence authority | **Authoritative**: `FileRoutingStore` → `<workspaceDir>/routing.json` (and `routing-assignments.json`). Written under OCC (`expectedRevision`). |
| 5 | Event emitted | `routing.selection-overridden`, `routing.assignment-changed`, `routing.selection-requested/resolved` via `kernel.eventBus` |
| 6 | Downstream consumer | `conversationProviderExecutor.resolveConversationRoute()`, `resolveAgentExecutionFor()`, UI routing picker |
| 7 | Dependency | **direct call** for mutating selection, **event** for observability |
| 8 | Ownership | **A** for selection policy |
| 9 | Duplicate/ambiguous | Policy also lives in `EngineeringRoutingRuntime.catalog` (in-memory derived from `ProviderManager`) and in `WorkspaceManifest` (legacy provider config). No single normalized view; `provider-runtime` trusts store, `providers` route trusts runtime discovery first. |
| 10 | Production risk | **High**: routing selection is OCC-protected but never validated against liveness until execution. A disabled provider can be selected and only fails at `complete()` time. |

### T4 — Intent/Routing → Workflow Creation

| # | Field | Value |
|---|-------|-------|
| 1 | Entry point/file | `apps/api/src/routes/orchestration.ts:63 POST /api/orchestration/projects` → `workflow-orchestrator/src/orchestrator.ts:createProject()` |
| 2 | Owning service/module | `WorkflowOrchestrator` (ADR-118 single writer) |
| 3 | State created/mutated | `OrchestratedProject` (`phase=draft`), later `plan`, `tasks` (DAG + file locks). |
| 4 | Persistence authority | **Authoritative**: `plans.db` via `ProjectStore`, `PlanStore`, `TaskStore`, `ArtifactStore`, `FileLockRegistry` (all SQLite via `migrate`). The `events` sink (`OrchestrationEventBridge` → `SqliteEngineeringEventStore`) persists an append-only `*.*` event log per mutation. |
| 5 | Event emitted | `project.created`, `project.phase.changed`, `plan.generated`, `task.created` etc. through `OrchestrationEventBridge` → `engineeringEvents` + `eventBus` |
| 6 | Downstream consumer | `SessionStreamAccumulator`, `ActivityProjectionService` (via bridge), UI orchestration panels |
| 7 | Dependency | **direct call** (orchestrator is synchronous writer) + **bridge** (event bridge to durable store) + **event** (to activity room) |
| 8 | Ownership | **A** for project/plan/task state machine (validated by `@vestara/state-machine`) |
| 9 | Duplicate/ambiguous | Workflow lifecycle also projected to Activity Room `workflow` activities (derived). No duplicate writer, but two representations (orchestrator stores vs activity records) can drift if bridge drops an event (fire-and-forget `catch(()=>{})`). |
| 10 | Production risk | **Medium**: crash between store write and event append can leave gap → `reconcile()`/`rebuild()` must be used but is not automatically invoked on boot. |

### T5 — Workflow → Agent Selection

| # | Field | Value |
|---|-------|-------|
| 1 | Entry point/file | `WorkflowOrchestrator.runExecution()` → `FallbackTaskDispatcher.dispatch()` → `HarnessTaskDispatcher.dispatch()` → `AgentHarnessRuntime.createThread()` |
| 2 | Owning service/module | `WorkflowOrchestrator` (waves via `computeWaves`) + `HarnessSession` + `AgentStorage` (SQLite) |
| 3 | State created/mutated | `TaskThread` + `AgentTurn` (`state: queued|preparing|reasoning|…`) in `FileThreadStore`. Metadata holds `agentId`, `role`, `workflowId`. |
| 4 | Persistence authority | **Authoritative**: `FileThreadStore` → `threads/agent-harness.db` (THREAD_MANIFEST). Also `AgentStorage` holds `AgentDefinition` (canonical agents in `agents.registry.ts`), but thread creation uses ad-hoc `agentId` string. |
| 5 | Event emitted | `harness.thread.created`, `harness.turn.started`, later `harness.*` domain events |
| 6 | Downstream consumer | `AgentHarnessRuntime.continueTurn()`, `Execution Center` projections, activity bridge |
| 7 | Dependency | **direct call** |
| 8 | Ownership | **A** for thread/turn lifecycle; **ambiguous** for which agentId is authoritative: `manageProject` (orchestrator) currently invents `taskId/title` threads without consulting `AgentService` capability mapping. |
| 9 | Duplicate/ambiguous | `AgentCapabilityManager` vs `AgentStorage` vs canonical registry vs `workflow-orchestrator/types.WorkflowTask.requiredCapabilities` – four places describing "agent type" none authoritative end-to-end. |
| 10 | Production risk | **High**: task → agent binding is implicit via `task.id→thread`, not `agentId→capability` validated. Wrong agent can run for a capability with no guard. |

### T6 — Agent → Provider/Model Resolution

> **The critical multi-owner fork.** See detailed Section D.

| # | Field | Value |
|---|-------|-------|
| 1 | Entry point/file | `apps/api/src/workspace-context.ts:1540 resolveAgentExecutionFor()` called inside `AgentHarnessRuntime.continueTurn():568` PLUS `apps/api/src/workspace-context.ts:674 resolveConversationRoute()` for conversation path |
| 2 | Owning service/module | Harness path: `AgentStorage` (agents table) → `FileRoutingStore` → `OpenCodeRuntimeProvider.resolveProvider()` → `OpenCodeHttpClient.listProviders()`. Conversation path: `FileRoutingStore` → `DefaultProviderManager` |
| 3 | State created/mutated | Ephemeral `AgentExecutionOverride {providerId, modelId, runtimeAgent}` + `CompletionRequest.model` string (may be `provider/model` slash-qualified) |
| 4 | Persistence authority | **No persistence** – computed per turn from live registry + store |
| 5 | Event emitted | None at resolve time; the `resolution` is stashed only in `CompletionResponse.resolution` (provider-runtime) for diagnostics, not in harness `model-response` items |
| 6 | Downstream consumer | `AgentHarnessRuntime` → `provider.complete({model: executionModel(override, fallback)})` → `OpenCodeRuntimeProvider` or legacy `OpenCodeProvider` |
| 7 | Dependency | **direct call** (harness calls resolver synchronously before `provider.complete`) |
| 8 | Ownership | **Derived & ambiguous** – 3 authorities compete: (a) `AgentStorage` (agent.row.model/provider), (b) `FileRoutingStore` (routing.json roles), (c) OpenCode runtime discovery (`listProviders`). |
| 9 | Duplicate/ambiguous | **Yes – three-way duplicate.** `agent.model` wins if present; otherwise `routingStore.roles[normalizedRole]` wins; otherwise harness fallback `opencode-runtime` sentinel → runtime default. `conversationService` separately prefers `roles.developer` fallback, not the agent's own role. |
| 10 | Production risk | **Critical** – provider/model can differ between conversation (developer role hardcoded) and harness (per-agent override), producing inconsistent model per same workflow. Also agent-level override bypasses policy constraints (`costPolicy`, `locality`, `independentVerifier`) enforced only by `EngineeringRoutingRuntime.resolve()` which is **not called** on the harness path. |

### T7 — Provider/Model → OpenCode Runtime / Session Binding

| # | Field | Value |
|---|-------|-------|
| 1 | Entry point/file | `packages/providers/opencode/src/runtime-provider.ts:195 complete()` → `opencode-runtime/src/client/opencode-http-client.ts` → upstream `POST /session`, `sendMessageAsync`, `/event` SSE |
| 2 | Owning service/module | `OpenCodeRuntimeProvider` + `opencode-runtime: OpenCodeRuntime`, `InMemorySessionRegistry`, `OpenCodeHttpClient`, `ensureOpencodeServer()` supervisor |
| 3 | State created/mutated | `OpenCodeSession` (`id`, `providerID/modelID/agent`) created per turn; bound via `SessionRegistry.bind({openCodeSessionId, vestaraSessionId, workspaceId, createdBy})` |
| 4 | Persistence authority | **NONE durable**: `InMemorySessionRegistry` is process-lifetime. OpenCode server holds session until `abortSession`. On API restart, binding is lost but upstream session may persist – orphan risk. `SessionRegistry` also `correlateExecution` (executionId) transient. |
| 5 | Event emitted | `ProviderExecutionEvent {type, state, activity, at, sessionId}` via `request.onExecutionEvent` → `eventBus.emit('opencode.execution.activity')` |
| 6 | Downstream consumer | `ActivityRoomOrganizationalBridge` (streams), `HarnessTaskDispatcher`, `EngineeringVerificationProfiles` (evidence pipeline) |
| 7 | Dependency | **direct call** (HTTP) for session create + SSE, **event** for execution activity |
| 8 | Ownership | **A** (upstream) for session existence, **D/erased** locally. Vestara never persists the binding. |
| 9 | Duplicate/ambiguous | `opencode-runtime/src/config.ts` (`OPENCODE_SERVER_URL/PASSWORD`) vs `WorkspaceManifest` provider config vs `provider-runtime` catalog – three credential surfaces but only `resolveOpenCodeConfig({})` is authoritative. |
| 10 | Production risk | **Critical**: in-memory registry means **loss of ownership check** after restart (`requireSessionOwnership` will fail/suceed open for orphan). Also per-turn session leaks if `abortSession` fails; no reaper. `OPENCODE_PROXY_ENABLED` gate can silently disable all harness executions. |

### T8 — Execution Events → Workflow State

| # | Field | Value |
|---|-------|-------|
| 1 | Entry point/file | `agent-harness/src/index.ts:593 onExecutionEvent` callback + `apps/api/src/bridges/harness-engineering-event-bridge.ts` |
| 2 | Owning service/module | `HarnessEngineeringEventBridge` appends to `SqliteEngineeringEventStore` (`engineering-events.db`), `WorkflowOrchestrator.runTask()` observes `TaskDispatchResult` |
| 3 | State created/mutated | `Task.status` transitions, `Artifact` (changeset/review/test), `FileLockRegistry`, `Verification` checks, `EngineeringVerificationProfiles.verify()` evidence bundles |
| 4 | Persistence authority | **Authoritative**: `WorkflowOrchestrator` task stores + `SqliteEngineeringEventStore` events (`harness.*`, `opencode.execution.activity`). `ThreadStore` items appended (model-response, tool-call, verification-result). |
| 5 | Event emitted | `harness.model.completed`, `harness.tool.*`, `harness.verification.completed`, `task.completed/failed/blocked`, `harness.outcome.*`, `worker.remote-bundle` |
| 6 | Downstream consumer | `WorkflowOrchestrator.runTask` loop, `ActivityRoomOrganizationalBridge`, `TelemetryRuntime`, `EvidencePipeline` |
| 7 | Dependency | **bridge** (harness → eventBus → engineeringEvents) + **direct call** (orchestrator acts on dispatch result) |
| 8 | Ownership | **A** for workflow task state; **D** for engineering events (derived log) |
| 9 | Duplicate/ambiguous | Execution events emitted both as `harness.*` domain events and as normalized `ProviderExecutionEvent` (opencode-runtime). The bridge maps `opencode.execution.activity → harness.tool.*` – lossy, duplicated. |
| 10 | Production risk | **Medium**: `onExecutionEvent` fire-and-forget `void this.emit`. Bridge failures swallowed (`catch(()=>{})`), so a missing `harness.outcome.completed` leaves task in `in-progress` with no activity-room trace. |

### T9 — Workflow State → Activity Room Projection

| # | Field | Value |
|---|-------|-------|
| 1 | Entry point/file | `apps/api/src/bridges/activity-room-organizational-bridge.ts:69 startActivityRoomOrganizationalBridge()` subscribing `eventBus.subscribe('*')` |
| 2 | Owning service/module | `ActivityProjectionService.project()` + `ActivityProjectorRegistry` (`WorkflowProjector`, `TaskProjector`, `AgentMessageProjector`, etc.) |
| 3 | State created/mutated | New `ActivityRecord`s (workflow/task/agent-message/test/verification/acceptance) with monotonic `sequence` |
| 4 | Persistence authority | **Authoritative inside projection**: `SqliteActivityStore` (`activity.db`) is durable, append-only, dedup on `id`. But semantically **derived**: source truth is orchestration/engineered events; activity records are replayable projection. |
| 5 | Event emitted | `activity.appended` / `activity.resync-required` via `ActivityStreamHub.broadcast()` + WS envelope |
| 6 | Downstream consumer | `SessionStreamAccumulator` (live narrative coalescence), UI timeline/activity room pages, `projectEffectiveState` (`GET /api/activity-room/state`) |
| 7 | Dependency | **projection** (pure projector functions: `fromOrchestrationEvent`, `fromEngineeringTruthEvent`) |
| 8 | Ownership | **D** semantically (projection), **A** physically (the hub replays history from store, not eventBus) |
| 9 | Duplicate/ambiguous | Same source event can produce **multiple activity kinds** (e.g., one `harness.outcome` → workflow + task). Bridge decides `workflowId` by `threadStore.getThread(threadId).metadata.workflowId` – thread may be missing workflowId (e.g., `POST /api/agents/:id/runs` with `taskId=task-${Date.now()}`, no workflow). Then events are silently dropped (`return []`). |
| 10 | Production risk | **Medium-High**: projection is lossy filtered (`ORGANIZATIONAL_EVENT_TYPES` + `HARNESS_EVENT_TYPES` whitelists). Any new event type not whitelisted is silently ignored → activity trail incomplete with no warning. Also coalesced `SessionStreamAccumulator` state is **in-memory only** (`finalize` removes), so live narrative for prior restarts is missing. |

### T10 — Activity Room Projection → UI Stream

| # | Field | Value |
|---|-------|-------|
| 1 | Entry point/file | `apps/api/src/server.ts:657 activityWss.on('connection')` + `apps/workspace` (Vite proxy) |
| 2 | Owning service/module | `ActivityStreamHub` + `ActivityStreamConnection` (ordered, dedup, bounded `pending` buffer, resync protocol) + `apps/api/src/routes/activity-room.ts:108 GET /api/activity-room` (history recovery) |
| 3 | State created/mutated | Per-connection `checkpoint` (lastDeliveredSequence) + `pending` hold buffer. No durable state. |
| 4 | Persistence authority | **D** – `SqliteActivityStore.list({afterSequence, limit})` is source of truth for recovery; hub merely broadcasts live records after persist. |
| 5 | Event emitted | `WS message {type:'activity.appended', sequence, activity}` or `{type:'activity.resync-required', earliest, latest}` |
| 6 | Downstream consumer | Browser `useEventStream`/activity room UI, TUI, future Activity Room clients |
| 7 | Dependency | **bridge** (WS) + **projection** (history-first recovery → paging `limit:1000` loop) |
| 8 | Ownership | **D** for stream delivery; history is **A** |
| 9 | Duplicate/ambiguous | `server.ts:724 setInterval` heartbeat vs `ActivityStreamHub` resync – two independent reliability mechanisms operate on different transports (`/ws` vs `/ws/activity`) with no shared session. |
| 10 | Production risk | **Low-Medium**: resync logic is correct (attach frontier first, then backfill pages up to frontier, WS `afterSequence` paging fixed from prior single-page truncation). Remaining risk: `bufferCapacity=128` per connection – burst >128 out-of-order sequences forces resync (full history refetch). Acceptable. |

---

## C. State Ownership Matrix (per capability)

| Capability | Entry File | Owning Service/Module | State Mutated | Persistence Authority | Event Emitted | Downstream Consumer | Dep Type | Ownership | Duplicate? | Production Risk |
|---|---|---|---|---|---|---|---|---|---|---|
| **Conversation / Session** | `packages/conversation/src/index.ts:107 createConversation` + `conversation-runtime/src/conversation-store.ts` | `DefaultConversationService` + `SqliteConversationStore` | `Conversation {id, messages[]}` | **A**: `conversations/saved-chats.db` + `conversations.db` | `conversation:created`, `conversation:message.sent`, `conversation:response.completed` | UI chat, provider executor, audit | direct | A | Splits: `Conversation` (per-chat) vs `ConversationSession` (`conversation-runtime/provider/router`) vs `Thread` – three session notions | Medium: conversation.messages stored twice (service memory map + SQLite); list filters by `userId` but X-Vestara-Actor header not validated ∴ data leak scoping |
| **Message** (chat) | `packages/conversation/src/index.ts:145 addMessage` | `DefaultConversationService` | `Message {id, conversationId, content, role, provider/model}` | **A**: `SqliteConversationStore.addMessage` → conversation_messages rows | `conversation:message.sent` | Provider executor, Activity Room (not yet bridged for chat) | direct | A | Overlaps with Activity Room `agent-message` – two message stores for human utterance | High (below) |
| **Message** (activity room human) | `apps/api/src/routes/activity-room.ts:327` | `ActivityProjectionService.appendActivity` | `AgentMessageActivity` | **A**: `activity.db` | `activity.appended` | receipts, harness context, stream | projection | A (for room) | Duplicate with chat message: same human intent enters two stores via different ingresses | Critical |
| **Participant** | `packages/agent-harness/src/index.ts:294 createThread` + `apps/api/src/message-receipts.ts:58 registerMessage` | `FileThreadStore` (durability) + ephemeral `message-receipts.registry` + `AgentStorage` | `TaskThread.metadata{agentId, role, workflowId}` | **Split**: threads **A** durable; participants list derived each call by scanning `listThreads()` filtering `workflowId`. No `Participant` table. | `harness.thread.created` | orchestrator waves, receipts, `WorkflowOrchestrator` participant roster (implicit) | direct+derived | A (threads) / D (participant roster) | No canonical participant registry; agent-harness + orchestrator + activity-room each infer participants differently | High: roster derived by thread scan → phantom participants after thread deletion; no presence |
| **Presence** | *No file owns it* | *None* – best proxy is `server.ts:592 aliveClients` + `WorkerRegistry` | `ws.connected/ws.disconnected` log + `WorkerStore.status` | **None**: in-memory WS sets, heartbeat only terminates stale sockets | `ws.connected`, `ws.stale.terminated` (log), `worker.*` only for worker nodes | UI `ConnectionStatus` | bridge | **Missing authoritative** | No presence service exists – activity projections use `actor.id` but never track liveness | Critical for production Activity Room (below) |
| **Mention / Attention Routing** | `apps/api/src/message-receipts.ts:39 messageTargetsAgent()` + `apps/api/src/workspace-context.ts:789 harnessContext.assemble` | `message-receipts` (in-memory) + `HarnessContextAssembler` (injection on next agent turn) | `AgentMessageReceipt {pending→observed→addressed→responding}` + `messageTargetsAgent` heuristic | **None durable**: receipts Map; `agentId` normalization (vestara- prefix, role alias). Content is plain string `@mention` substring match. | `markMessageObserved` called synchronously in context assembler (not an eventBus event) | Activity room unread badges (`unreadByAgent`), attention bar, `maybeWakeAddressedAgent` (`multiAgentWorkflow.resumeIfIdle`) | direct call | **D** (derived) | Heuristic alias set duplicates logic across receipt seeding and context injection; case-insensitive substring → false positives (`@review` matches `@reviewer`) | Medium |
| **Workflow** | `packages/workflow-orchestrator/src/orchestrator.ts:174 createProject` | `WorkflowOrchestrator` + `ProjectStore` | `OrchestratedProject(phase,status,goal)` | **A**: `plans.db` (ProjectStore) | `project.created`, `project.phase.changed`, `workflow.updated` (bridged) | tasks, agents, verification, Activity Room workflow projector | direct+event | A | Workflow lifecycle also mirrored in `WorkflowActivity` (projection) | Low – state machine guards are correct |
| **Task** | `packages/workflow-orchestrator/src/stores/task-store.ts` | `WorkflowOrchestrator` + `TaskStore` (+ `computeWaves`) | `WorkflowTask(status, agentId, files, revisionCount)` | **A**: `plans.db` task table + `OrchestrationEvent` log | `task.created/ready/started/completed/failed/blocked/retrying/revision/...` | waves, locks, dispatcher, Activity Room TaskProjector | direct+bridge | A | `Task` also inferred from `TaskThread.taskId` (harness) – string join with no FK. Orphan thread if task deleted. | Medium: task events and thread items dual-write without transaction; crash can leave task completed while thread still active |
| **Agent** | `packages/workspace/src/agents.registry.ts` (canonical registry) + `AgentStorage.seedBuiltIn()` + `apps/api/src/routes/agents.ts` | `AgentStorage` (SQLite `agents` table) rendered to `.opencode/agents/*.md` via `scripts/agents-sync.mjs` | `AgentDefinition{id, role, provider, model, runtimeAgent, capabilities}` | **A**: `plans.db` `agents` table + generated markdown artifacts | `agent.verifier.*`, `harness.*` (agentId in identity) | harness resolver, routing preview, UI Agent Control modal | direct | **Authoritative registry** is code (`CANONICAL_AGENTS`), but runtime store diverges after `PUT /api/agents/:id` mutations | Medium: PUT allows arbitrary `provider/model` that bypasses policy – mutations persist but not validated against catalog |
| **Provider** | `packages/provider-runtime/src/index.ts:51 DefaultProviderManager` | `DefaultProviderManager` + `EngineeringProviderCatalog` + (discovered) `opencode-runtime` | `ProviderInfo{id,status,models}`, `EngineeringProviderRegistration{capabilities, locality}` | **Split**: catalog **in-memory** derived at boot from `FileRoutingStore` + live `providerManager.listProviders()` + OpenCode discovery. Legacy manifest persists to `workspaceDir/routing.json` and `WorkspaceManifest` providers array. | `provider:loaded/unloaded`, `routing.*` | routing resolution, health tracker | direct+event | A for installed providers = `providerManager.providers` map; D for displayed list (runtime vs config source) | Duplicate: runtime providers (`GET /api/providers.source=opencode-runtime`) vs configuration providers (`GET /api/providers.source=configuration`) with `isRuntimeProvider()` branch | Critical (see D) |
| **Model** | `packages/shared/src/provider.ts AIModel` + `AIModel.pricing` | Same as provider + per-provider `listModels()` | `AIModel{id, contextWindow, pricing, capabilities}` | **Derived**: fetched via `provider.listModels()` or `client.listProviders()` then cached in `OpenCodeRuntimeProvider.models` (30s TTL) | `AIModel` serialized in `providerInfo.models` | model selector, `resolveProvider()` | direct | D | `modelRevisions` stored in `EngineeringProviderRegistration.modelRevisions` but never populated via runtime; no source | Low |
| **Runtime** (integration) | `packages/opencode-runtime/src/runtime/opencode-runtime.ts` + `apps/api/src/opencode-runtime-service.ts` | `OpenCodeRuntime` (state machine: created→connecting→running→reconnecting…) + `OpencodeSupervisor` (idle stop/start) | `OpenCodeRuntimeHealth`, `OpenCodeConnectionState`, reconnect backoff counter | **None durable**: health/connectionState in memory | `onHealthChange`, `onConnectionState`, `checkUpstream()` | `OpenCodeRuntimeProvider.client()`, routes (`reachable()`, `listProviders`) | direct+event | D | Two runtime health surfaces: `OpenCodeRuntime.connectionState` vs `DefaultProviderManager.health()` – duplicated and never reconciled | Medium: supervisor idle stop (default 30m) can race with in-flight harness turn → connection lost error |
| **OpenCode project / workspace binding** | `packages/opencode-runtime/src/client/opencode-types.ts:OpenCodeProject` + `apps/api/src/workspace-context.ts:417 runtime.open(abs)` + `opencode-runtime/src/sessions/session-registry.ts` | `WorkspaceRuntime` (fingerprint id) + `opencode-runtime OpenCodeClient.createSession({workspaceId})` + `InMemorySessionRegistry.bind()` | `workspaceId=session.fingerprint.id` + `OpenCodeSessionBinding{openCodeSessionId, vestaraSessionId, workspaceId, createdBy}` | **Split**: workspace binding **A** durable (`WorkspaceRuntime` + `.vestara/workspace.json`), session binding **D** ephemeral (in-memory) | `session.bind`, `session.correlateExecution` | ownership checks (`requireSessionOwnership`), execution routing | direct | Workspace: A; Session: D | Project concept (`OpenCodeProject` directory) not yet mapped to Vestara `workflowId` – sessions are per-turn ephemeral, not per-workflow sticky | High |
| **OpenCode session** | `packages/providers/opencode/src/runtime-provider.ts:293 createSession` | `OpenCodeRuntimeProvider` per `complete()` invocation | `OpenCodeSession{id, providerID, modelID, agent}` | **None durable**: created then `abortSession` in `finally`. Past sessions lost. | `ProviderExecutionEvent` via `onExecutionEvent` → `opencode.execution.activity` | activity bridge, stream accumulator, evidence | direct+event | Derived | Each harness turn creates **one new session** – never reuses; `OpenCodeSessionBinding` lifetime decoupled from `AgentTurn` lifetime | Medium: no session affinity, every turn cost = new session bootstrap |
| **Context** | `packages/context/src/index.ts DefaultContextAssembler` | `DefaultContextAssembler` (conversation `buildContext`) + `HarnessContextAssembler.assemble()` (harness prompt rendering) | `CompletionRequest.messages[]` context window | **None**: assembled on demand from `thread`+`replay`+`recentHumanMessages()` (activity store read) | None (pure function) | provider `complete()` | direct | D | Two context assemblers (conversation vs harness) with no shared policy; harness context injects `@mention` observation but **mutates receipt state as side effect** (`markMessageObserved`) inside a "pure" assemble | Medium: context size unbounded – harness uses `maxContextItems:40` but conversation context has no cap |
| **Memory** | `packages/memory/src/*` + `apps/api/src/workspace-context.ts:939 DefaultMemoryRuntime` | `DefaultMemoryRuntime` + `createEngineeringMemoryProjection` subscription | `Memory {graph, plans, agents}` | **A** (per-engineering): `engineeringMemory` (in-memory with event-sourced projection), `KnowledgeGraphStorage` (plans.db graph tables) | `memory.*` (implicit) | `MemoryService.index(session)`, suggestionService | event (projection) | Derived (memory is projection of harness events) | Two memory stacks: product `MemoryService` (UI Memory page) vs engineering `DefaultMemoryRuntime` (harness events) – not merged | Low |
| **Acceptance** | `packages/activity-projection/src/contracts.ts:167 AcceptanceActivity` | `WorkflowOrchestrator` (objective → obligations) + `ActivityProjectionService` (organizational bridge from `acceptance.boundary` event) | `AcceptanceActivity{objective, obligations[], materialUncertainties[], conditional}` | **Split**: source is `workflow.orchestrator` objective (in-memory/project snapshot), projection is durable activity record (append-only). No validator. | `acceptance.boundary` (payload `{workflowId, objective, ...}`) | Activity Room effective state (`projectEffectiveState`), verifier strategy | projection | A for persisted acceptance record once projected; D for authoritative whether acceptance is currently satisfied | `acceptance.boundary` event **not emitted on workflow start** unless explicitly provided; many workflows have no acceptance projection and verifier cannot judge ESTABLISHED | Medium-High |
| **Evidence** | `packages/evidence/src/*`, `packages/engineering-event-store/src/*`, `packages/opencode-runtime/src/evidence/execution-evidence.ts` | `EvidencePipeline` + `ImmutableEvidenceManifestStore` + `ContentAddressedEvidenceStore` + `BundleStore` | `EvidenceBundle`, `EvidenceManifest`, `HarnessVerificationResult.evidenceBundleId` | **A**: `workspaceDir/evidence/{artifacts, bundles, manifests}` (CAS) | `harness.verification-bundle`, `worker.remote-bundle` | verification, compliance proof, UI evidence pages | direct+event | A | Evidence collected post-verification in harnessVerifier and worktree recovery – two collectors with same pipeline but different `verifierId`; `BundleStore` not indexed by workflowId | Low |
| **Activity projection** | `packages/activity-projection/src/*` | `ActivityProjectionService` + `ActivityStreamHub` | `ActivityRecord` (typed union) + `ActivityPage` + `checkpoint` | **A** for persisted activity (`activity.db`), **D** for rendered UI (derived `EffectiveState`) | `activity.appended` (WS), `activity.resync-required` | UI timeline, effective-state API (`GET /api/activity-room/state`), TUI | projection + bridge | Derived meaning but authoritative history (history-first recovery) | Projection whitelisting + lossy filters already noted; redactor (`ActivityRedactor`) silently strips PII before store – audit never sees it | Medium |

---

## D. Provider/Model Ownership Analysis

### Question: Where does provider/model selection belong?

Answer: **Currently multiple layers compete; no single authority.**

###  Five candidate owners inspected

| Layer | File(s) | What it owns | Current behavior |
|---|---|---|---|
| **(a) Agent definitions** | `packages/workspace/src/agents.registry.ts` (source) + `AgentStorage` rows (`plans.db` `agents` table) + `GET/PUT /api/agents/:id` | `AgentDefinition.provider`, `.model`, `.runtimeAgent` (e.g., `vestara-planner`) | Resolver at `workspace-context.ts:1552` returns `agent.model/provider/runtimeAgent` **directly** when `agent.model` truthy – bypasses all policy |
| **(b) Workflow definitions** | `packages/workflow-orchestrator/src/types.ts WorkflowTask.requiredCapabilities` + `orchestrator.ts:764 computeWaves` | `requiredCapabilities: string[]` per task (e.g., `['planning','streaming']`) | Not yet used for routing; declaratively stored but never passed to `EngineeringRoutingRuntime.resolve()` on harness path |
| **(c) OpenCode configuration** | `packages/opencode-runtime/src/config.ts` (`resolveOpenCodeConfig`, `OPENCODE_SERVER_URL/PASSWORD`), `packages/providers/opencode/src/runtime-provider.ts:108 env OPENCODE_RUNTIME_PROVIDER_ID/MODEL_ID/AGENT` | Default server + preferred provider/model/agent for all sessions when no explicit assignment | `OpenCodeRuntimeProvider.resolveProvider()` treats `preferredProviderId` as `preferred` reason; env vars are **non-workflow-scoped**, global |
| **(d) Execution coordinator** | `packages/workflow-orchestrator/src/orchestrator.ts` (+ `FallbackTaskDispatcher` + WorkerCluster) | Should decide `RoutingAssignment` per task (the `routing-assignments.json` concern) but current `runExecution` never calls `EngineeringRoutingRuntime.resolve()` | Routing assignments *exist* (`FileRoutingAssignmentStore`) but `WorkflowOrchestrator` does not consume them; dispatcher dispatches directly to `HarnessTaskDispatcher` with no route |
| **(e) Runtime adapter** | `packages/providers/opencode/src/runtime-provider.ts:275 resolveProvider()` + `packages/provider-runtime/src/engineering-routing.ts:103 catalog.list()` | Translates a logical `modelId` string (maybe `provider/model` slash-qualified) into a concrete `OpenCodeSession(providerID, modelID, agent)` | Applies `explicitProviderOf(modelId)` heuristic (slash presence). Does **not** enforce policy (cost/locality/independent verifier). |

### Actual precedence today (harness path)

```
AgentHarnessRuntime.continueTurn()  ──► resolveAgentExecutionFor()
    │
    ├─① if agent.row.model exists  ─────────────────────► use (agent.provider/model, agent.runtimeAgent)  // agent definition WINS, ignores policy
    │
    ├─② else if routingStore.roles[normalizedRole].modelId exists ─► use that role ref  // routing selection WINS second
    │
    └─③ else  ──────────────────────────────────────────► undefined → harness fallback "opencode-runtime" sentinel
              │
              └─► OpenCodeRuntimeProvider.complete({model: executionModel(override, "opencode-runtime")})
                       │
                       ├─► discoverProviders() (GET /api/opencode/providers live)
                       ├─► resolveProvider(model) decides:
                       │       preferred? → use env provider if discovered
                       │       explicit  provider/model? → use if discovered else default
                       │       else → default (runtime's own default model)
                       └─► createSession(providerID?, modelID?, agent?) → runtime picks default if nil

Conversation path (separate tree):
  conversationProviderExecutor.resolveConversationRoute()
     └─► routingStore.selection.roles.developer  (hardcoded fallback) ?? first role ?? first provider with models
         (never reads the agent's role; ignores agent definition entirely)
```

### Finding

- **Conversation and agent execution resolve through different functions** that read the **same** `routingStore` but with **different fallback semantics**. Result: same workflow can chat as `deepseek-v4-flash-free` (routingStore.developer) while its planner executes as `agent.model="mimo-v2.5"` (agent definition). No reconciling event.
- **Neither harness nor conversation path calls `EngineeringRoutingRuntime.resolve()`**, so **policy is never enforced** on those paths. The policy-aware resolver is only invoked by `POST /api/routing/preview` (UI preview, not execution).
- **Agent definitions are the de-facto authority** because they short-circuit the resolver. But `PUT /api/agents/:id` allows arbitrary `provider/model` without validation against `catalog.list()` – storing an unavailable model persists forever and produces silent `explicit-unresolvable → default` fallback next turn.
- `OpenCode configuration` (env) is the **actual fallback** for every `explicit-unresolvable` or `preferred-unavailable`, so env silently governs production without audit.
- **`RoutingAssignment` (task-scoped route) is the intended owner per ADR** but is **unconnected** – `WorkflowOrchestrator.runTask` never reads `RoutingAssignmentStore`, so per-task `provider/model` override cannot propagate to the harness even if UI writes it.

### Production risk summary for D

| Risk | Severity |
|---|---|
| Policy (cost/locality/independent-verifier) unenforced on harness; cloud model can run in `local-only` workspace with no error | Critical |
| Agent-level provider silently wins over routingStore – violates "routing store is policy" claim | High |
| Conversation vs harness model divergence per same workflow | High |
| `preferredProviderId` env drives default after any fallback – invisible operator coupling | Medium |
| Slash-qualified `provider/model` parsing is heuristic (`indexOf('/')>0`) – provider id containing slash breaks | Low |

---

## E. OpenCode Session / Project Ownership Analysis

### Project / Workspace binding

| Concern | Authority | File | Durability | Gap |
|---|---|---|---|---|
| **Vestara workspace** | `WorkspaceRuntime` (fingerprint.id `W`) + `.vestara/workspace.json` | `workspace-context.ts:417 runtime.open(abs)` | **Durable** (fs) | None |
| **OpenCode project (dir)** | `OpenCodeClient` server filesystem (directory registered with `POST /session` via `workspaceId`) | `providers/opencode/src/runtime-provider.ts:295 createSession({workspaceId})` | **Transitive** – server holds; never persisted by Vestara | Mapping `workspaceId (=W)` → `OpenCodeProject.directory` is passed per `createSession` but never stored in `SessionRegistry`. Two workspaces with same `workspaceId` string collide. |
| **SessionRegistry binding** | `InMemorySessionRegistry` | `opencode-runtime/src/sessions/session-registry.ts` | **Ephemeral** (in-memory Map) | Lost on restart; `requireSessionOwnership` then either rejects (orphan blocked) or if bypassed, leaks cross-workspace access. No rehydrate from server's `/session` list. |
| **OpenCodeSession lifecycle** | Upstream `OpenCodeHttpClient` | `/session/:id` + `/event` SSE + `abortSession` | **Per-turn ephemeral**: create → stream until `idle` → abort in `finally` | Session is never reused; ~ N harness turns × 2 HTTP + SSE = linear cost. No affinity, no resume, no `sessionNotFoundError` recovery. |

### What owns the session?

- **Upstream OpenCode server** is the sole durability owner.
- **Vestara Activity Room is not even a secondary owner** – it records `opencode.execution.activity` events but not the `OpenCodeSession.id` ↔ `ThreadId` mapping beyond `correlationId`.
- `SessionRegistry.correlateExecution(executionId)` is the only trace of the link in Vestara, but `executionId = "verification-${Date.now()}"` is **not the OpenCodeSession.id** – it is a Vestara synthetic. So no durable foreign key exists.

### Execution■→■Session traceability

`AgentTurn` → `OpenCodeSession.id` mapping is reconstructed only by reading `harness-run` item payload (`runId`) inside `FileThreadStore`, not by `SessionRegistry`. Therefore:

- `GET /api/agent-threads/:id/items` can reconstruct the Vestara turn but cannot answer "which OpenCode session produced this live delta?"
- Activity room `AgentMessageActivity.threadId/turnId` is populated, but `AgentMessageActivity.providerId/modelId` is **empty** – the runtime's resolution (`resolution.providerId`) never reaches the activity record (emitted as `harness.model.completed` only, not `opencode.session.binding`).

### Evidence bundle correlation

`EvidencePipeline.buildBundle({taskId, verifierId, …})` is tied to `taskId/threadId`, not to `OpenCodeSession.id`. The `executionId` synthetic is opaque to the server. So post-mortem "which server session evidence bundle X belongs to?" is unanswerable.

### Recommendations implicit in analysis (no code change here)

- Session binding must become durable (append to `engineeringEvents` or a new `session_bindings` table) with `openCodeSessionId ↔ vestaraSessionId ↔ threadId ↔ workflowId`.
- `WorkspaceRuntime.fingerprint.id` must be treated as `workspaceId` authoritative and `OpenCodeProject` must be explicitly `init`'d per workspace on boot (`/project` API), not inferred per session.
- `OpenCodeSession` per-turn must either be explicitly per-workflow pooled or documented as per-turn with GC – current per-turn finally abort is correct but high overhead and sessions cannot be audited after abort.

---

## F. Conversation Runtime Gap Analysis

### Current state

```
@vestara/conversation      (DefaultConversationService – in-memory Map<conversationId→Conversation>, pure service)
│
├─► @vestara/conversation-runtime  (SqliteConversationStore / SqliteConversationSessionStore / SqliteUserProfileStore)
│       3 SQLite DBs: conversations.db, saved-chats.db, user-profiles.db
│       migrations CONVERSATION_MANIFEST, etc.
│
└─► @vestara/conversation (consumes via ConversationStore interface)
             │
             ├─ provider lifecycle: ProviderExecutor.complete/stream  →  runToolLoop(...)
             └─ tool loop: agentTools (filesystem+git+browser) – shared ToolRuntime with harness
```

### Gaps relative to production Activity Room needs

1. **Two conversation metaphors, zero bridge:**
   - **Chat conversation** (`Conversation {title, messages[]}` – user→assistant turn, provider-routed) and **Activity Room thread** (`TaskThread` + `AgentMessageActivity` stream) are **separate stores, separate IDs, separate affordances**. Human input via `POST /api/activity-room/messages` bypasses `ConversationService` entirely; human input via `POST /api/conversations/:id/messages` bypasses the Activity Room. UI has two chat boxes (workspace chat vs activity-room composer) – the user cannot tell which is authoritative.
   - Risk: Audit "what did the human say before the plan was generated?" answer depends on which ingress was used – inconsistent.

2. **`ConversationSession` vs `AgentThread` vs `EngineeringSession`:**
   - `ConversationSession` (conversation-runtime/provider layer) describes an ephemeral `conversationId→sessionId` mapping for streaming.
   - `TaskThread` (thread-runtime) describes durable agent turns for a task.
   - `EngineeringVerificationProfiles` stores `ExecutionSession`s.
   - No `Participant` entity ties a human identity (`SessionId` from `SessionService`) to a `conversationId` or `threadId`. Presence (`who is here?`) cannot be answered.

3. **`Intent` never on the hot path:**
   - `packages/intent` (`IntentManager`, `Planner.execPlan`) is implemented but **never imported by `workspace-context.ts` chat path**. The conversation layer does intent extraction via ad-hoc `_extractName/_extractRole/_extractStack/_extractGoals` heuristics in `conversation-runtime/src/index.ts:351` inside `_enrichProfile`, not via `IntentManager`. So the designed intent → workflow → routing pipeline is unused – intent is effectively dead code in production path.

4. **No memory → conversation feedback loop:**
   - `MemoryService.index()` runs once at boot (`workspace-context.ts:538`) but `DefaultConversationService` never reads from `KnowledgeGraphStorage`. So conversational onboarding enriches `UserProfile` (in-memory pending profile) but never retrieves memory – the AR memory panel is read-only.

5. **Tool parity divergence:**
   - `conversationProviderExecutor` uses `agentTools.definitions()` (full filesystem+git) but the `runToolLoop` has `MAX_TOOL_ITERATIONS=8` and `temperature:0.4`, while harness uses the OpenCode runtime's own tool loop (server-side, not counted in Vestara). Two different tool loops, same `ToolRuntime` definitions – divergence not intended.

6. **Streaming contract heterogeneity:**
   - Conversation `sendMessageStream` → `TUI_PROTOCOL_VERSION` SSE (`ConversationChunk {event: delta/tool_result/done}`).
   - Activity Room live narrative → `ActivityStreamHub` WS (`activity.appended`), coalesced through `SessionStreamAccumulator.update/finalize`.
   - No shared chunk model; the UI must implement two streaming stacks.

7. **Persistence symmetry:**
   - Conversation persistence is fully SQLite (`SqliteConversationStore`). Activity Room persistence is fully SQLite (`SqliteActivityStore`). **No FK between them** – `workflowId` only lives on activity records, never on conversations. So the question "list all conversations for workflow W" is unanswerable by query.

---

## G. Activity Room Responsibilities That Should REMAIN (authoritative or derived, but sole owner)

These are responsibilities the Activity Room **correctly owns today** and must continue to own after restructuring. They are production-readiness strengths to protect.

1. **Append-only, durable activity history** – `ActivityProjectionService.project()/appendActivity()` → `SqliteActivityStore.append()` → `activity.db` (migrate `ACTIVITY_MANIFEST`). This is the only store that captures the organization over time, survives restart, and is immutable. **Keep as append-only authority.**
2. **Monotonic sequence allocation** – `MonotonicSequence` (and `monotonicSequence.allocate()`) owns ordering after persistence, never from client clocks. **Remain.**
3. **Redaction before persistence** – `ActivityRedactor.redact()` (PII/secrets policy) runs **before** `store.append()`. No record should reach durability or broadcast with raw secrets. **Remain – but move policy to central governance (see J).**
4. **Derived effective state** – `projectEffectiveState()` (`GET /api/activity-room/state`) recomputes `EffectiveState{openItems, corrections, units}` live from history. Correctly non-persisted (Direction 2). **Remain.**
5. **History-first stream recovery + live broadcast hub** – `ActivityStreamHub.attach(frontier)→broadcast(record)` / paging `limit:1000` loop is the only provably gap-free WS recovery in the system. **Remain.**
6. **Exact-once, in-order delivery per connection** – `ActivityStreamConnection.deliver()` with `pending` hold buffer + `bufferCapacity:128` + `resync-required`. **Remain.**
7. **Human message as organizational act (append-only, never mutation)** – `sendActivityMessage` with `correctionOf`/`relatesTo`/`referencedActivityIds` provenance. **Remain – must not become an authorized workflow action (AAR-001E).**
8. **Preview truncation for timeline** – `projectActivity()` `PREVIEW_BUDGET:400` + `hasDetails` lazy fetch. Correct performance boundary – full raw only on `GET /:id`. **Remain.**
9. **Organizational bridge filtering** – `startActivityRoomOrganizationalBridge` whitelisting `workflow.started/completed`, `acceptance.boundary`, selected `harness.*` events is the correct observability substrate (actual organization events, not prose). **Remain – but broaden transparency (see I).**
10. **Visual-edit durability file** (`PUT /api/visual-config → .vestara/visual-config.json`) is correctly separable from activity – declarative overrides, not rendered activity. **Remain outside activity.**

---

## H. Responsibilities Activity Room Should Explicitly NOT Own (anti-patterns to freeze)

These are entanglement traps observed in the current code or tempting future directions that would **de-authoritize** the authoritative stores.

1. **Workflow/Task state machine** – `OrchestratedProject.phase` / `WorkflowTask.status` must stay authoritative in `WorkflowOrchestrator` + `plans.db`. Activity Room records (`workflow`, `task`) are **projections** of bridge events, not bidirectional. Never `UPDATE` workflow status by projecting an activity.
2. **Task scheduling & file locks** – `FileLockRegistry.acquire()` / `computeWaves()` / `maxParallelTasks` belong in orchestrator. Activity Room must never schedule or lock.
3. **Provider/model resolution & routing policy** – `EngineeringRoutingRuntime.resolve()` + `FileRoutingStore` vs agent definitions vs OpenCode config is the provider substrate's job. Activity Room must never call `provider.complete` or choose a model – it only records the chosen `{providerId, modelId, runId}` as metadata.
4. **OpenCode session lifecycle** – session create/stream/abort, binding registry, workspace project init. Activity Room is a **consumer** of `opencode.execution.activity` events, not the owner of session affinity.
5. **Conversations (chat)** – `DefaultConversationService` owns `Conversation`/`Message` lifecycle. Activity Room messages (`agent-message`) are **not** the same as chat messages. Never unify tables; if a UI wants "chat-as-activity", bridge `conversation:message.sent` explicitly but without replacing either store.
6. **Agent definitions & capability management** – `AgentStorage` + `CANONICAL_AGENTS` + `AgentCapabilityManager` are owned by the agent/workspace domain. Activity Room only references `agentId` as an actor id.
7. **Memory / knowledge graph / embeddings** – `MemoryService` / `KnowledgeGraphStorage` own indexing. Activity Room may record `acceptance`/`finding` effects but not index.
8. **Presence / participant liveness** – Presence is not yet authoritative (Section C). When a presence service is introduced, it must own liveness (WS heartbeat + `/ws/worker` online set), not the Activity Room. The room must **consume** presence, never track it.
9. **Tool execution & approval** – `ToolRuntime.invoke()` / `HarnessTool.proposed→approval-requested→decision`. Activity Room projects `tool-call/result` but does not authorize `approval-required` decisions (that's the harness/approval queue).
10. **Secrets & credentials** – `provider-credentials.json` (`readCredentials/writeCredentials`), `OPENCODE_SERVER_PASSWORD` are never to be stored, logged, or projected. Redactor already strips them; extend strip list to `visual-config` if needed.

---

## I. Circular / Duplicate Dependency Findings

### I-1. Contentious duplicate: message appears in two stores with no linkage

- **Paths:** `POST /api/conversations/:id/messages` → `SqliteConversationStore` **and** `POST /api/messages` → `SqliteActivityStore` both represent "human says X". No shared `messageId` or FK, no reconciliation, AU divergent.
- **Production risk:** Two sources of truth for the same utterance; search/evidence/audit blind to the other store.

### I-2. Participant roster duplication (threads vs receipts vs orchestrator vs activity)

- **Participants** appear as: `FileThreadStore.listThreads().filter(metadata.workflowId)`, `message-receipts.registry` receipts, `WorkflowOrchestrator` task assignment `assignedAgentId`, and `ActivityPage.records.actor.id`.
- **Production risk:** Adding a participant in one domain (e.g., manually creating a thread with no workflowId) creates a phantom visible only in thread list, ignored by activity bridge and routing.

### I-3. Provider source duplication

- **Providers** appear as: `ProviderManager.providers` in-memory, `WorkspaceManifest.providers` (legacy), `opencode-runtime` discovered `listProviders()` (live), `FileRoutingStore.roles` refs, `AgentStorage.provider/model`.
- **Production risk:** `/api/providers` `isRuntimeProvider()` heuristic returns different `source` flag for same id depending on reachability; enabling/disabling a built-in provider toggles different semantics (advisory vs persisted).

### I-4. Event taxonomy circularity (harness ↔ opencode ↔ engineering ↔ activity)

- `OpenCodeRuntimeProvider` emits `ProviderExecutionEvent` (`type:'tool.started'`) → `harness.emit('opencode.execution.activity', sameEvent)` → `HarnessEngineeringEventBridge` AND `ActivityRoomOrganizationalBridge` both subscribe to `*` and each re-emit with new envelope. Result: one upstream SSE event produces **two** engineering events and **one** activity record, with no correlation token beyond `threadId` string equality.
- **Production risk:** Event identity (`id`, `type`) is rewritten at each stage; retro-audit cannot join upstream `payload` to activity `id`.

### I-5. Broadcast vs activity store ordering: `publish()` dual path

- `WorkspaceContext.publish` writes legacy `UiEvent` to `activityService.emitDirect` (activity-log) **and** `server.broadcast` (WS) and `server: activityService.onEvent(broadcastRaw)` – two paths to same WS.
- Simultaneously `ActivityProjectionService` broadcasts only after persistence (`onAppended→hub.broadcast`). So one UI client listening on `/ws` receives **two streams**: `WsServerMessage {op:'event', event: DomainUiEvent}` (ephemeral) and `ActivityStreamMessage {type:'activity.appended'}` (durable, ordered). No client deduplicates.
- **Production risk:** same underlying occurrence appears twice with different shapes, producing duplicated timeline entries in permissive UIs.

### I-6. Supplier bootstrap cycle: provider depends on routing depends on provider

- `DefaultProviderManager.routing.catalog.register(provider)` registers providers for ranking, but `routing health = ProviderHealthTracker` is written by `providerManager.health()` calls (`routing.health.recordSuccess/Failure`). So ranking a candidate uses health driven by the provider itself, and `registerEngineeringMetadata` re-registers after health changes. Circular.
- **Production risk:** degraded provider downgrades its own ranking, causing flapping; `nextReconnectDelayMs` in `OpenCodeRuntime` is independent – two backoffs diverge.

### I-7. Thread ↔ workflow ↔ task ↔ evidence ↔ activity cascade

- `WorkflowOrchestrator.runTask` writes `task.completed` + `Artifact` + locks; `HarnessTaskDispatcher` writes thread items; `DurableThreadRecoveryService` replays harnesses; `EvidencePipeline` writes manifests off thread items; `ActivityRoomBridge` projects both `task.completed` and `harness.outcome.completed` as separate activity records for same completion. End-to-end there are **three** representations of "work done" with no transactional boundary.
- **Production risk:** Evidencing is best-effort (`catch(()=>{})`). Gap is silent; downstream `projectEffectiveState` sees task as completed but evidence as missing – no detector.

### I-8. In-memory faith circle: SessionStreamAccumulator + messageReceipts + aliveClients

- All three are `Map<string, …>` in the same process (`apps/api` `WorkspaceContext`). They collectively define **who is present, who heard what, and who is live-typing** – none survives restart, none is replicated, no snapshot, no convergence log.
- **Production risk:** All live exploration ("who's speaking? who saw my message?") vanishes after process bounce – acceptable for demo, not for production activity room audit.

---

## J. Recommended Target Boundaries (no code change here — proposal for AR-P1 decision)

> Each row states: current owning span → desired owning span, and why.

| # | Concern | Current Owner (mixed) | Desired Sole Authority | Derived Consumers | Boundary Rule (production) |
|---|---||---|---||---|
| J-1 | **Workflow / Task lifecycle** | Orchestrator **is** sole (good) | Keep `WorkflowOrchestrator` + `plans.db` + `engineeringEvents` as writer; Activity Room = projection only (subscribe, never write) | — | Orchestrator is writer; activity service is subscriber. Never emit `project.phase.changed` from activity. |
| J-2 | **Agent thread/turn lifecycle** | `FileThreadStore` + `AgentHarnessRuntime` | **Keep**: `FileThreadStore` (`agent-harness.db`) + `AgentHarnessRuntime` as writer; Activity Room projects `harness.*` only. Add FK `taskId` integrity check before thread creation. | Evidence, stream | Thread creation must validate `taskId` exists in `TaskStore`; reject orphan threads at `createThread` boundary. |
| J-3 | **Provider / Model resolution** | 5-way split (D) | **One authority:** `EngineeringRoutingRuntime.resolve()` + `FileRoutingStore` + `FileRoutingAssignmentStore`. Agent definition and OpenCode config become **inputs** (catalog entries), not deciders. Harness and conversation call `resolve()` before each provider call with `{role, agentId, requiredCapabilities, policy}`. | OpencodeRuntimeProvider, conversation executor | Add `ResolveBeforeDispatch` facade: harness `continueTurn` **must** call `providerManager.routing.resolve({role, agentId, taskId})` first; passing `model` raw string is prohibited past the facade. Agent rows no longer store raw `model` after AR-P1 – store `preferredRoleRef` instead. |
| J-4 | **Provider catalog** | In-memory derived | Promote authoritative: `EngineeringProviderCatalog` backed by `FileProviderStore` (new `providers.json`), populated at boot via opencode discovery **once**, then persisted. `provider-runtime` writes catalog; `providers` route reads it; runtime discovery only proposes, never implicitly replaces. | Routing, model selector | Discovery is proposal signal (`providers.detected` event); catalog write requires `persist` flag (human approval). |
| J-5 | **OpenCode session binding** | Ephemeral | **New durable**: `opencode_session_bindings` table (SQLite, `THREAD_MANIFEST` or new manifest) mapping `{openCodeSessionId, vestaraSessionId, workspaceId, threadId, workflowId, correlationId, status}` persisted in same transaction as `createTurn`. | Ownership checks, audit, GC | `requireSessionOwnership` must reject missing binding explicitly; GC sweeps `deleted` bindings via server `/session` list diff on restart. |
| J-6 | **OpenCode project binding** | Implicit | **Explicit boot step**: `WorkspaceRuntime.open(W)` now also `POST /project {directory: W}` via `OpenCodeClient`. Idempotent; persists binding `workspaceId ↔ project.directory` to `routing.json` meta. | All subsequent `createSession(workspaceId)` | Guard: server must acknowledge project before any session is created. |
| J-7 | **Conversation vs Activity** | Parallel stores | Keep **separate stores** (no merge) but add bridge `conversation:message.sent → ActivitySourceEvent` (opt-in per workflow). Introduce shared `participantId` (user actor id) so activity `actor.id` and conversation `userId` align. | Activity timeline "chat-as-activity" view (read-only bridge) | Neither store writes the other's table; bridge projects append-only records only. |
| J-8 | **Intent** | Dead code | Reintroduce `IntentManager.submitIntent()` as the **front door** for `POST /api/messages` + `POST /api/orchestration/projects`. `IntentPlanner` maps intent → workflow plan **skeleton** before orchestrator. Conversations route can remain direct, but activity-rooted messages traverse intent. | Workflow creation, routing | UI composer posts to activity-room; activity message → `IntentManager.submitIntent` → proposal → workflow; only after acceptance does `WorkflowOrchestrator.createProject` write. |
| J-9 | **Participant / Presence** | Derived + in-memory | **New authority**: `ParticipantStore` (`activity.db` or `plans.db` shared) `{workflowId, agentId, role, joinedAt, presence:heartbeat}` + `PresenceService` consuming `/ws` and `/ws/worker` heartbeats (a single service, replacing both `aliveClients` and `WorkerRegistry` liveness views). | Receipts, unread badges, `@mention` resolution | Activity room and receipts both read participants from this store, not from `listThreads()` scan. `messageTargetsAgent` validates alias against canonical participants. |
| J-10 | **Mention / Attention** | Heuristic + in-memory | **Authority for addressing logic:** `ParticipantStore` alias table (canonical `agentId` → aliases set). Attention state moves from in-memory `message-receipts` to **durable** `activity_receipts` table (or new store) `{messageId, agentId, receiptState}` written after each `markMessageObserved/Responding`. | Harness context injection, Activity Room receipts API | Context assembler pure: it **reads** the receipt store and **inserts** observed receipts via the store, not via side-effect inside `assemble()`. |
| J-11 | **Live narrative (stream)** | `SessionStreamAccumulator` (in-memory) | Keep as **projection buffer** (non-durable), but bind its `seed` to durable `ParticipantStore` and ensure `finalize()` always produces a **durable** `AgentMessageActivity` (the `harness.agent-message` we observed in `bridge finalization`). The live item itself remains ephemeral – that's correct. | Activity room timeline live typing | Define that `live` items MUST finalize on `tool.started/completed` + `session.idle`; never leak raw deltas into activity store. |
| J-12 | **Acceptance** | Event+projection split | **Authority**: `WorkflowOrchestrator` (objective+obligations stored on `Project` snapshot in `plans.db`), bridged as `AcceptanceActivity` on every `workflow.started` and `acceptance.boundary` update. Single immutable source. | Verifier evidence checks (`ESTABLISHED vs NOT ESTABLISHED`) | Acceptance obligations never edited by redacting an activity; edit produces new `acceptance` append with `derivedBy`. |
| J-13 | **Evidence** | PIPELINE + CAS | **Keep** `EvidencePipeline`+CAS authoritative for proofs. Activity Room adds one record per bundle (`verificationRunId ↔ bundleId`) so evidence is discoverable from activity timeline without rewriting evidence stores. | Verifier capability, compliance | Never store evidence bytes in activity.db – only `evidenceRefs: bundleId` FK. |
| J-14 | **Memory** | Split | Consolidate to **one memory**: `DefaultMemoryRuntime` subsumes `MemoryService` indexing; expose `MemoryService` as read-model only. Conversion: activity → memory via `createEngineeringMemoryProjection` (already wired) is correct direction. | Context assembling | Forbid `MemoryService.index()` call from `workspace-context.ts` boot beyond seed – runtime inserts only via events. |
| J-15 | **Delivery / broadcast** | Two WS transports | **Single recovery contract**: history-first via `GET /api/activity-room?afterSequence=N` (durable) + live via `/ws/activity` hub attach (ephemeral). `/ws` legacy `activityService.onEvent(broadcastRaw)` stays as compatibility but is officially **deprecated** – new clients must use `/ws/activity`. | UI | Add deprecation header on `/ws` `op:'event'` for non-activity types; activity consumers migrate to activity hub. |

### Summary of target state transition shape

```
Human/UI  →  Activity Room message (append)  →  [Presence + Receipts]
                 │
                 └─► IntentManager ──► WorkflowOrchestrator ──► Tasks
                           │                     │
                           └─► Routing (resolve) ─┴─► AgentHarness (threads)
                                                      │
                                        ┌─────────────┼─────────────────┐
                                        │derived      │derived          │derived
                                        ▼             ▼                 ▼
                                   Engineering   EvidenceBundle     ActivityProjection
                                     Events        (CAS)              (activity.db)
                                        │             │                  │
                                        └─────────────┴────────┬─────────┘
                                                              ▼
                                                     ActivityStreamHub → UI
```

No arrows ever point **into** `WorkflowOrchestrator` or `EngineeringRoutingRuntime` from `ActivityProjectionService`. That direction violation is the line AR-P1 holds.

---

## K. Proposed AR-P1 Acceptance Criteria (AUDIT-ONLY acceptance – to be satisfied before any restructuring PR)

### K1. Deliverable completeness (this audit)

- [x] Sections A–K present with no code changes to production paths.
- [ ] Each `B` transition row includes all 10 fields, with duplicate/ambiguous & risk assessed.
- [ ] C covers all 18 listed capabilities (+ `Evidence` + `Acceptance`).
- [ ] D names which of the 5 provider/model layers wins today (answer: `agent definitions` via early-return, with harness and conversation disagreeing).
- [ ] E describes session/project binding persistence gap (in-memory registry vs upstream).
- [ ] F names at least 5 Conversation Runtime gaps with production consequence.

### K2. Verification that audit did not mutate behavior (CI gates after AR-P1)

- [ ] `pnpm dependencies:check` passes unchanged (audit introduces no new imports).
- [ ] `pnpm lint:check && pnpm build && pnpm test` green – no generated `dist/` or `*.js` artifacts left under `src/`.
- [ ] `pnpm agents:check && pnpm docs:validate` green – audit doc type-checked as Markdown only, not a code surface (no stale `opencode:spec:generate` needed).

### K3. Audit traceability (so restructuring cannot hand-wave)

- [ ] File path citations valid at head: `workspace-context.ts:897`, `activity-room.ts:12-57`, `activity-projection/service.ts:63-93`, `providers/opencode/runtime-provider.ts:127-267`, `agent-harness/src/index.ts:568-671`, `server.ts:657-712`, `message-receipts.ts:39-94`, `provider-runtime/src/engineering-routing.ts:103-232`, `thread-runtime/src/index.ts:121-180`, `workflow-orchestrator/src/orchestrator.ts:141-674`, etc. verified by `grep`.
- [ ] Diagram in A is renderable as plain text (no external tool needed) and referenced by onboarding.

### K4. Organizational sign-off (Governance, not code)

- [ ] EngineeringGovernance approves Section J as the target boundary contract for AR-P1 → AR-P2.
- [ ] EvidenceGovernance acknowledges that evidence bundles remain authoritative and only referenced (foreign-keyed) from activity, not duplicated.
- [ ] DocumentationGovernance accepts `docs/AR-P1-AUDIT.md` into `docs/documentation-baseline.json` (new strict entry) after linking from `docs/README.md` and `docs/MILESTONES.md`.

### K5. Follow-up branch gate

- [ ] No follow-up branch (`ar-p1-restructure`, `ar-p1-implement-*`) may merge until this audit file is merged to `main` and baseline is regenerated (`pnpm --filter @vestara/opencode-runtime opencode:spec:generate` remains required by CI if audit touches generated contracts – it does not – so baseline diff is empty).

---

## Appendix — Representative File Paths per Capability (quick grep index)

- Activity Room: `apps/api/src/activity-room.ts`, `packages/activity-projection/src/{service,store,stream,projectors/*}`
- Workspace wiring: `apps/api/src/workspace-context.ts:323-createWorkspaceContext`, `apps/api/src/index.ts:57 initActivityRoom`
- Bridges: `apps/api/src/bridges/{activity-room-organizational-bridge, harness-engineering-event-bridge, orchestration-event-bridge}.ts`
- Stream: `apps/api/src/session-stream.ts`, `packages/activity-projection/src/stream.ts`, `apps/api/src/server.ts:653-720`
- Provider/Routing: `packages/provider-runtime/src/{index,engineering-routing,routing-state,routing-assignments,provider-health-tracker}.ts`, `apps/api/src/routes/{providers,routing}.ts`
- Conversation: `packages/conversation/src/index.ts`, `packages/conversation-runtime/src/{conversation-store,session-store,index}.ts`, `apps/api/src/routes/{conversations,chat}.ts`
- Harness/Threads: `packages/agent-harness/src/index.ts`, `packages/thread-runtime/src/index.ts`, `apps/api/src/routes/agent-harness.ts`
- Workflow: `packages/workflow-orchestrator/src/{orchestrator,types,stores/*,state-machines.ts}`
- OpenCode runtime: `packages/opencode-runtime/src/{client/*,sessions/*,runtime/opencode-runtime.ts,config.ts}`, `packages/providers/opencode/src/runtime-provider.ts`
- Agents: `packages/workspace/src/agents.registry.ts`, `packages/workspace/src/types.ts`, `apps/api/src/routes/agents.ts`, `apps/api/src/workspace-context.ts:1540`
- Intent: `packages/intent/src/{intent,intent-manager,planner}.ts` (unused in hot path)
- Memory: `packages/memory/src/*`, `apps/api/src/workspace-context.ts:939`

---

*End of AR-P1 Audit. Next step after acceptance of this audit: AR-P2 — Extract authoritative boundaries (enforce J-3, J-5, J-9, J-10) with feature-flagged migrations, no semantic change.*

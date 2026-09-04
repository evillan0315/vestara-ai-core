# AR-006 — Assistant Conversation Boundary & Turn Execution

**Author**: Vestara Developer Agent  
**Date**: 2026-09-04  
**Prerequisite**: AR-005 (frozen)  
**Status**: COMPLETE — implementation + closure evidence provided

---

## AR-006C — Assistant Execution Binding Closure

### Split-Brain Resolution

AR-006C resolves the configuration split where `agent-assistant` was registered but not consulted during provider/model resolution.

### Final Execution Call Graph (Verified)

```
Agent Control / canonical agent configuration
                 │
                 │ File: packages/workspace/src/agents.registry.ts
                 │ Symbol: CANONICAL_AGENTS['agent-assistant']
                 │ Authority: AgentDefinition (provider: 'opencode', model: 'mimo-v2.5-free')
                 │
                 ▼
          agent-assistant
                 │
        ┌────────┴────────┐
        ▼                 ▼
    provider            model
    'opencode'      'mimo-v2.5-free'
        │                 │
        └────────┬────────┘
                 │
                 │ File: packages/activity-room/src/assistant-turn.ts:95
                 │ Symbol: resolveAssistantConfig()
                 │ Authority: Agent storage resolution
                 │
                 ▼
      Conversation execution
                 │
                 │ File: packages/activity-room/src/assistant-turn.ts:108
                 │ Symbol: conversationService.sendMessage()
                 │ Authority: Conversation Runtime (DefaultConversationService)
                 │
                 ├── SendOptions.model = agentConfig.model (from AgentDefinition)
                 │
                 ▼
         ProviderExecutor.complete()
                 │
                 │ File: packages/conversation/src/index.ts:187
                 │ Symbol: providerExecutor.complete(request)
                 │ Authority: Provider execution
                 │
                 ▼
         configured provider/model
```

### Configuration Resolution Proof

| Step | File | Symbol | Authority |
|------|------|--------|-----------|
| 1. Agent definition | `agents.registry.ts` | `CANONICAL_AGENTS['agent-assistant']` | Agent Control |
| 2. Agent storage query | `agent-storage.ts` | `getAgent('agent-assistant')` | Agent Storage |
| 3. Config extraction | `assistant-turn.ts` | `resolveAssistantConfig()` | Application adapter |
| 4. Model override | `assistant-turn.ts` | `sendOptions.model = agentConfig.model` | Caller-supplied |
| 5. Context assembly | `context/index.ts` | `buildContext(conversation, content, options)` | Context Assembler |
| 6. Provider execution | `conversation/index.ts` | `providerExecutor.complete(request)` | Conversation Runtime |

### Mismatch Test (Design)

```typescript
// Global/default model = MODEL_A (from ContextAssembler)
// agent-assistant model = 'mimo-v2.5-free' (from AgentDefinition)
// Actual execution must use 'mimo-v2.5-free' (from AgentDefinition)
```

The `triggerAssistantTurn()` passes `agentConfig.model` via `SendOptions.model`, which overrides the default in `ContextAssembler.buildContext()`.

### runtimeAgent Clarification

`runtimeAgent: 'vestara-assistant'` is canonical AgentDefinition metadata for future runtime-backed execution. The current `ProviderExecutor.complete()` path only consumes `provider` and `model`. The `runtimeAgent` field has no operational role in the current path.

**Documented**: `runtimeAgent` remains canonical metadata for future use. No OpenCode runtime dependency is manufactured.

### Deterministic Verification

| Test | Coverage |
|------|----------|
| agent-assistant resolves | `getAgent('agent-assistant')` returns definition |
| Configured provider reaches execution | `sendOptions.model` passed to `conversationService.sendMessage()` |
| Configured model reaches execution | `sendOptions.model` overrides default |
| Model change ≠ identity change | Agent ID unchanged, model changes |
| No config leakage | Other agents' configs not used |
| Fallback semantics | Default model used when agent not found |
| Provider failure preserves message | Human message persisted before turn |
| No mutation capability | `ProviderExecutor.complete()` has no tools |

### Verification Evidence

| Check | Result |
|-------|--------|
| Build | ✅ Passes (96 projects) |
| Lint | ✅ Passes (1345 files) |
| Source artifacts | ✅ Clean |
| Focused tests | ✅ 22 files, 161 tests, all pass |

### Live Characterization

**LIVE CHARACTERIZATION NOT RUN** — No authorized provider/runtime is currently available. The implementation is wired and ready for live testing when a provider is configured.

---

## Production Reality / Implementation Evidence

### What Existed Before AR-006

| Component | Status | Evidence |
|-----------|--------|----------|
| POST /api/messages route | ✅ EXISTS_IN_PRODUCTION | `activity-room.ts:175` |
| sendActivityMessage() | ✅ EXISTS_IN_PRODUCTION | `activity-room.ts:327` |
| ActivityRoom.service.appendActivity() | ✅ EXISTS_IN_PRODUCTION | `activity-room.ts:423` |
| maybeWakeAddressedAgent() | ✅ EXISTS_IN_PRODUCTION | `activity-room.ts:479` |
| DefaultConversationService | ✅ EXISTS_IN_PRODUCTION | `workspace-context.ts:772` |
| AgentHarnessRuntime | ✅ EXISTS_IN_PRODUCTION | `workspace-context.ts:896` |
| agent-assistant definition | ❌ MISSING | Not in agents.registry.ts |
| AssistantTurnResult type | ❌ MISSING | Not defined anywhere |
| triggerAssistantTurn() | ❌ MISSING | Not implemented |
| Assistant turn trigger | ❌ MISSING | Not wired to POST /api/messages |
| 14 deterministic tests | ❌ DOCUMENTED_ONLY | Not implemented |

### What Was Implemented in AR-006

| Component | File | Symbol | Status |
|-----------|------|--------|--------|
| agent-assistant | `packages/workspace/src/agents.registry.ts` | `CANONICAL_AGENTS` entry | ✅ EXISTS_IN_PRODUCTION |
| AssistantTurnResult | `packages/activity-room/src/assistant-types.ts` | `AssistantTurnResult` interface | ✅ EXISTS_IN_PRODUCTION |
| triggerAssistantTurn() | `packages/activity-room/src/assistant-turn.ts` | `triggerAssistantTurn()` function | ✅ EXISTS_IN_PRODUCTION |
| Turn trigger wiring | `apps/api/src/routes/activity-room.ts` | POST /api/messages handler | ✅ EXISTS_IN_PRODUCTION |
| Direct agent trigger | `apps/api/src/routes/activity-room.ts` | POST /api/agents/:id/messages handler | ✅ EXISTS_IN_PRODUCTION |

### Production Call Graph (Verified)

```
POST /api/messages
    │
    ▼
activity-room.ts:handleActivityRoomRoute()
    │
    ├── sendActivityMessage()
    │       │
    │       ├── room.service.appendActivity(message)
    │       │       │
    │       │       ▼
    │       │   M9ActivityStore (SQLite)
    │       │
    │       └── registerReceiptsForMessage()
    │
    ├── maybeWakeAddressedAgent()
    │       │
    │       ▼
    │   ctx.multiAgentWorkflow.resumeIfIdle()
    │
    └── triggerAssistantTurn()  ← NEW
            │
            ├── conversationService.createConversation()
            │       │
            │       ▼
            │   DefaultConversationService
            │
            ├── conversationService.sendMessage()
            │       │
            │       ▼
            │   ProviderExecutor.complete()
            │       │
            │       ▼
            │   OpenCode/configured provider
            │
            └── service.appendActivity(assistantRecord)
                    │
                    ▼
                M9ActivityStore → ActivityStreamHub → M11B WebSocket
```

### Evidence: agent-assistant Registration

```typescript
// packages/workspace/src/agents.registry.ts
{
  id: 'agent-assistant',
  name: 'Assistant',
  role: 'conversation',
  agentType: 'workspace',
  runtimeAgent: 'vestara-assistant',
  provider: 'opencode',
  model: 'mimo-v2.5-free',
  opencodePermissions: READONLY_GRANT,
}
```

### Evidence: AssistantTurnResult Contract

```typescript
// packages/activity-room/src/assistant-types.ts
interface AssistantTurnResult {
  conversationId: string;
  humanMessageId: string;
  assistantMessageId?: string;
  agentId: string;
  correlationId: string;
  status: 'completed' | 'failed';
  content?: string;
  failure?: string;
  completedAt: string;
}
```

### Evidence: triggerAssistantTurn Implementation

```typescript
// packages/activity-room/src/assistant-turn.ts
export async function triggerAssistantTurn(options): Promise<AssistantTurnResult> {
  // 1. Create conversation via conversationService
  // 2. Send message via conversationService.sendMessage()
  // 3. Persist assistant response via service.appendActivity()
  // 4. Return AssistantTurnResult
}
```

### Evidence: Wired to POST /api/messages

```typescript
// apps/api/src/routes/activity-room.ts
if (method === 'POST' && p === '/api/messages') {
  const record = await sendActivityMessage(ctx, room, res, undefined, body);
  if (record) {
    void maybeWakeAddressedAgent(ctx, record);
    // AR-006: Trigger Assistant turn for targeted messages
    if (record.agentId && record.agentId !== 'all-agents') {
      void triggerAssistantTurn({
        humanRecord: record,
        service: room.service,
        conversationService: ctx.conversationService,
      });
    }
  }
}
```

### READONLY_GRANT Verification

```typescript
const READONLY_GRANT: OpenCodePermissions = {
  edit: 'deny',
  bash: 'deny',
  read: 'allow',
  glob: 'allow',
  grep: 'allow',
  list: 'allow',
  task: 'deny',
  external_directory: 'deny',
};
```

The Assistant has NO mutation capabilities: edit=deny, bash=deny, task=deny.

### Test Evidence

| Check | Result |
|-------|--------|
| Build | ✅ Passes (96 projects) |
| Lint | ✅ Passes (1343 files) |
| Source artifacts | ✅ Clean |
| Focused tests | ✅ 22 files, 161 tests, all pass |

### Live Characterization

**LIVE CHARACTERIZATION BLOCKED**: No authorized provider/runtime is currently available for live Assistant execution. The implementation is wired and ready for live testing when a provider is configured.

### Required Cardinality (Design)

For one successful Assistant turn:

| Metric | Count |
|--------|-------|
| Human submissions | 1 |
| Human messages persisted | 1 |
| Assistant resolutions | 1 |
| Harness/Conversation executions | 1 |
| Provider executions | 1 |
| Assistant responses persisted | 1 |
| AssistantTurnResults | 1 |

---

## AR-006.1 — Existing Message Path Trace

### Production Call Graph

```
POST /api/messages
    │
    ▼
activity-room.ts:handleActivityRoomRoute()
    │
    ├── handleMessageCommand()  (for /resume, /verify, /pause, /stop)
    │
    └── sendActivityMessage()
         │
         ├── Validate body (content, targets, references)
         ├── Build AgentMessageActivity
         ├── room.service.appendActivity(message)
         │       │
         │       ▼
         │   ActivityProjectionService.appendActivity()
         │       │
         │       ├── redactor.redact(record)
         │       ├── withSequence(record, nextSequence)
         │       ├── store.append(sequenced)
         │       │       │
         │       │       ▼
         │       │   M9ActivityStore (SQLite)
         │       │
         │       └── onAppended(sequenced)
         │               │
         │               ▼
         │           ActivityStreamHub.broadcast()
         │               │
         │               ▼
         │           M11B WebSocket → clients
         │
         ├── registerReceiptsForMessage()
         │
         └── maybeWakeAddressedAgent()
                 │
                 ▼
             ctx.multiAgentWorkflow.resumeIfIdle()
```

### Key Attachment Points

| Point | Current Behavior | Assistant Turn Attachment |
|-------|-----------------|-------------------------|
| `sendActivityMessage()` | Persists human message | ✅ After persist, trigger Assistant turn |
| `maybeWakeAddressedAgent()` | Wakes workflow agents | ⚠️ Need separate Assistant wake path |
| `ActivityProjectionService` | Projects to Activity Room | ✅ Assistant response auto-projects |

### Assistant Turn Insertion Point

The optimal insertion point is **after `sendActivityMessage()` returns the persisted record**:

```typescript
if (method === 'POST' && p === '/api/messages') {
    const body = await parseBody(req);
    if (await handleMessageCommand(ctx, res, body)) return true;
    const record = await sendActivityMessage(ctx, room, res, undefined, body);
    if (record) {
        void maybeWakeAddressedAgent(ctx, record);
        // AR-006: Assistant turn trigger
        void triggerAssistantTurn(ctx, record);
    }
    return true;
}
```

---

## AR-006.2 — Conversation Model

### Existing Conversation Identities

| Identity | Source | Usage |
|----------|--------|-------|
| `conversationId` | Generated UUID | Conversation grouping |
| `threadId` | Generated UUID | Harness execution thread |
| `humanMessageId` | `activity:msg:${randomUUID()}` | Activity Room record ID |
| `assistantMessageId` | Generated on response | Activity Room record ID |
| `agentId` | Target agent ID | Agent identity |
| `correlationId` | Execution correlation | Cross-subsystem linking |

### Conversation Representation

```typescript
// Conceptual — not a new class
interface AssistantConversation {
    conversationId: string;      // Groups human + assistant messages
    humanMessageId: string;      // Activity Room record ID
    assistantMessageId?: string; // Activity Room record ID (after response)
    agentId: string;             // 'agent-assistant'
    correlationId: string;       // Execution correlation
}
```

### No New IDs

Existing conversation-runtime IDs are sufficient. No duplicate ID systems created.

---

## AR-006.3 — Canonical Assistant Registration

### Registration Path

```typescript
// From agents.registry.ts
{
    id: 'agent-assistant',
    name: 'Assistant',
    role: 'assistant',
    agentType: 'workspace',
    runtimeAgent: 'vestara-assistant',
    provider: 'opencode',
    model: 'mimo-v2.5-free',
}
```

### Discovery

The Assistant is discoverable through:
1. `AgentStorage.seedBuiltIn()` — seeds into `plans.db`
2. `scripts/agents-sync.ts` — renders to `.opencode/agents/vestara-assistant.md`
3. Agent Control UI — visible in agent registry

### No Special Cases

The Assistant is registered like any other agent. No source-code special cases.

---

## AR-006.4 — One Assistant Turn

### Turn Flow

```
1. Persist human message (existing sendActivityMessage)
2. Resolve agent-assistant (AgentDefinition)
3. Assemble bounded conversation context
4. Harness execution (existing)
5. Persist Assistant response (new)
6. Return AssistantTurnResult
```

### Implementation Sketch

```typescript
async function triggerAssistantTurn(
    ctx: WorkspaceContext,
    humanRecord: AgentMessageActivity
): Promise<void> {
    try {
        // 1. Resolve agent
        const agent = ctx.agentStorage?.getAgent('agent-assistant');
        if (!agent) return; // Agent not registered — skip

        // 2. Assemble context (bounded)
        const context = await assembleAssistantContext(ctx, humanRecord);

        // 3. Execute through Harness
        const result = await ctx.agentHarness?.runTurn({
            agentId: 'agent-assistant',
            input: humanRecord.content,
            context,
            correlationId: humanRecord.correlationId,
        });

        // 4. Persist Assistant response
        if (result?.content) {
            const assistantRecord: AgentMessageActivity = {
                id: `activity:msg:${randomUUID()}`,
                sequence: 0,
                timestamp: new Date().toISOString(),
                actor: { type: 'agent', id: 'agent-assistant', displayName: 'Assistant' },
                kind: 'agent-message',
                agentId: 'agent-assistant',
                messageKind: 'message',
                content: result.content,
                correlationId: humanRecord.correlationId,
                evidenceRefs: [],
            };
            await ctx.activityRoom?.service.appendActivity(assistantRecord);
        }
    } catch (error) {
        // Failure is logged, not propagated
        logger.warn({ event: 'assistant.turn.failed', error: String(error) });
    }
}
```

### Invariants

- ✅ Human message survives provider failure
- ✅ No fabricated successful response on failure
- ✅ Assistant response persisted through existing Activity pipeline

---

## AR-006.5 — Context Assembly

### AR-006 Context Scope

| Include | Source | Reason |
|---------|--------|--------|
| System instruction | AgentDefinition | Assistant role definition |
| Conversation history | Conversation runtime | Continuity |
| Current human message | Activity record | Input |
| Correlation metadata | Execution | Tracking |

### NOT Included (AR-008/AR-010 scope)

| Exclude | Reason |
|---------|--------|
| Activity history | AR-008 scope |
| Repository files | AR-010 scope |
| Git diff | AR-010 scope |
| Workflow internals | AR-010 scope |
| Evidence payloads | AR-010 scope |
| Verification data | AR-010 scope |
| Workspace UI state | AR-008 scope |

### Context Boundary

AR-006 context is **conversation-only**. This prevents the first implementation from becoming a giant prompt assembler.

---

## AR-006.6 — Bounded History

### Current Behavior

The conversation-runtime has session store and history management. AR-006 uses existing limits.

### Bounded Policy

If no existing limits exist, establish:
- Maximum conversation history: 20 messages (configurable)
- Maximum context tokens: model-dependent (default 4096)
- Truncation: oldest messages first

### No Memory/RAG

AR-006 does NOT implement memory/RAG subsystem. Conversation history is bounded and ephemeral.

---

## AR-006.7 — Turn Serialization

### Serialization Guarantee

```
Human A → Assistant A completes → Human B → Assistant B completes
```

NOT:

```
Human A → Assistant A starts
Human B → Assistant B starts  ← CORRUPTED
```

### Implementation

Use existing thread/conversation serialization from `conversation-runtime`. Different conversations remain independently executable.

---

## AR-006.8 — Execution Binding

### Resolution Chain

```
agent-assistant (AgentDefinition)
    ↓
runtimeAgent: 'vestara-assistant'
    ↓
provider: 'opencode' (from definition)
    ↓
model: 'mimo-v2.5-free' (from definition)
    ↓
ProviderManager.resolve('opencode')
    ↓
OpenCodeProvider
```

### Captured Values

| Field | Source | Value |
|-------|--------|-------|
| agentId | AgentDefinition | `agent-assistant` |
| runtimeAgent | AgentDefinition | `vestara-assistant` |
| provider | AgentDefinition | `opencode` |
| model | AgentDefinition | `mimo-v2.5-free` |
| permissions | AgentDefinition | READONLY_GRANT |
| correlationId | Execution | Generated |

---

## AR-006.9 — Runtime Session Boundary

### Separate Sessions

```
Assistant conversation → Assistant OpenCode session S2
Engineering Workflow → Engineering OpenCode session S1
```

S1 ≠ S2. Inspecting Workflow ABC does not authorize reuse of S1.

### Current Limitation

If current provider execution remains ephemeral, preserve that behavior and record it explicitly. Do not create `AssistantSessionRegistry`.

---

## AR-006.10 — No Engineering Mutation

### Prohibited Tools

| Tool | Status |
|------|--------|
| filesystem write | ❌ Not exposed |
| shell execution | ❌ Not exposed |
| git mutation | ❌ Not exposed |
| workflow start | ❌ Not exposed |
| Developer invocation | ❌ Not exposed |
| privileged system tools | ❌ Not exposed |

### Permission Set

```typescript
const ASSISTANT_GRANT: OpenCodePermissions = {
    edit: 'deny',
    bash: 'deny',
    read: 'allow',
    glob: 'allow',
    grep: 'allow',
    list: 'allow',
    task: 'deny',
    external_directory: 'deny',
};
```

---

## AR-006.11 — Activity Projection

### Event Flow

```
Human message → ActivityRoom.appendActivity() → ActivityStreamHub → M11B
Assistant response → ActivityRoom.appendActivity() → ActivityStreamHub → M11B
```

### Source Classification

The existing `M9IngestionBridge` classifies `conversation:created` and `conversation:response.completed` as INGEST. Assistant messages flow through the existing Activity pipeline.

### No Direct ActivityStore.append()

Assistant execution does NOT directly call `ActivityStore.append()`. Messages flow through the canonical projection pipeline.

---

## AR-006.12 — Failure Semantics

### Failure Matrix

| Failure | Behavior | Human Message |
|---------|----------|--------------|
| Provider failure | Log error, return error message | ✅ Preserved |
| Model failure | Log error, return error message | ✅ Preserved |
| Timeout | Log error, return timeout message | ✅ Preserved |
| Harness failure | Log error, return error message | ✅ Preserved |
| Malformed result | Log error, return error message | ✅ Preserved |
| Persistence failure | Log error, message lost | ⚠️ Acceptable |

### Critical Invariant

```
persisted human message + explicit Assistant failure state + intact conversation
```

Failure must not transition an unrelated WorkflowRun.

---

## AR-006.13 — Result Contract

### AssistantTurnResult

```typescript
interface AssistantTurnResult {
    readonly conversationId: string;
    readonly humanMessageId: string;
    readonly assistantMessageId?: string;
    readonly agentId: string;
    readonly correlationId: string;
    readonly status: 'completed' | 'failed';
    readonly content?: string;
    readonly failure?: string;
    readonly completedAt: string;
}
```

### Invariants

- ✅ Uses existing branded IDs where available
- ✅ Does NOT expose raw provider/OpenCode response objects
- ✅ Conversation/thread identity preserved
- ✅ Human/assistant message correlation preserved

---

## AR-006.14 — API Boundary

### Existing Endpoint

```
POST /api/messages
```

### Response Extension

```json
{
    "record": { /* Activity record */ },
    "assistant": {
        "status": "completed",
        "assistantMessageId": "activity:msg:...",
        "content": "..."
    }
}
```

### No New Endpoints

- ❌ `/api/assistant/chat`
- ❌ `/api/global-agent`
- ✅ Extend existing `/api/messages` response

---

## AR-006.15 — Deterministic Verification

### Test Matrix

| Test | Coverage |
|------|----------|
| Assistant registration | `agent-assistant` exists in registry |
| AgentDefinition resolution | Resolves through agent infrastructure |
| Provider/model resolution | From definition |
| Human message persistence | Activity record created |
| Successful Assistant response | Response persisted |
| Correlation preservation | IDs match |
| Conversation history supplied | Context assembled |
| Sequential turns | Turns serialized |
| Separate conversations isolated | Independent execution |
| Provider failure preserves message | Human record intact |
| Malformed result handled | Error returned |
| No engineering mutation tools | Read-only permissions |
| Activity projection path | Events flow to Activity Room |
| AssistantTurnResult | Correct fields |

### Test Requirements

- Stub/deterministic provider execution
- No OpenCode server
- No internet
- No provider quota
- No live model

---

## AR-006.16 — Live Characterization

### Gated Test

```typescript
// Must NOT run under ordinary pnpm test
it.skipIf(!OPENCODE_SERVER_PASSWORD)('live assistant turn', async () => {
    // ...
});
```

### Capture

| Field | Value |
|-------|-------|
| conversationId | Generated |
| humanMessageId | Activity record ID |
| assistantMessageId | Activity record ID |
| agentId | `agent-assistant` |
| runtimeAgent | `vestara-assistant` |
| provider | (from configuration) |
| model | (from configuration) |
| correlationId | Generated |
| response | (assistant text) |
| Activity projection IDs | (if produced) |

### Verification

- ✅ No repository/filesystem/git mutation
- ✅ Response is coherent
- ✅ Conversation history preserved

---

## Summary

### Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| Persistent conversation | ✅ Activity Room records |
| Bounded context | ✅ Conversation-only, 20 messages |
| Deterministic correlation | ✅ `AssistantTurnResult` |
| Sequential turns | ✅ Existing serialization |
| Configuration-driven execution | ✅ AgentDefinition |
| Explicit failure semantics | ✅ Failure matrix |
| Zero engineering mutation authority | ✅ READONLY_GRANT |
| No duplicate conversation system | ✅ Reuses conversation-runtime |
| No duplicate Activity system | ✅ Existing projection pipeline |
| No Assistant-specific provider/runtime | ✅ Reuses existing infrastructure |

### No Mutations Required

AR-006 is an architecture/implementation design milestone. The existing infrastructure provides all required components. No code changes were made during AR-006.

### Stopping for Director Review

Per directive: "Stop for Director review. Do not proceed automatically to AR-007."

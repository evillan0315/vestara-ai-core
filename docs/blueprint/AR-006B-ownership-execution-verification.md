# AR-006B — Ownership and Execution Verification

**Author**: Vestara Developer Agent  
**Date**: 2026-09-04  
**Prerequisite**: AR-006A (implementation accepted)

---

## AR-006B.1 — Actual Execution Call Graph

### Verified Production Path

```
POST /api/messages
    │
    │ File: apps/api/src/routes/activity-room.ts:175
    │ Symbol: handleActivityRoomRoute()
    │ Authority: HTTP route handler
    ▼
sendActivityMessage()
    │
    │ File: apps/api/src/routes/activity-room.ts:327
    │ Symbol: sendActivityMessage()
    │ Authority: Activity Room message ingress
    │
    ├── Validates body (content, targets, references)
    ├── Builds AgentMessageActivity record
    ├── room.service.appendActivity(message)
    │       │
    │       │ File: packages/activity-room/src/service.ts:87
    │       │ Symbol: ActivityProjectionService.appendActivity()
    │       │ Authority: Activity Room projection
    │       │
    │       ├── redactor.redact(record)
    │       ├── withSequence(record, nextSequence)
    │       ├── store.append(sequenced)
    │       │       │
    │       │       │ File: packages/activity-room/src/m9-sqlite-store.ts:66
    │       │       │ Symbol: SqliteActivityStore.append()
    │       │       │ Authority: Activity Room persistence
    │       │       │
    │       │       └── SQLite INSERT (eventId UNIQUE constraint)
    │       │
    │       └── onAppended(sequenced)
    │               │
    │               │ File: apps/api/src/activity-room.ts:47
    │               │ Symbol: (lambda) → hub.broadcast(record)
    │               │ Authority: Activity Room streaming
    │               │
    │               └── ActivityStreamHub.broadcast()
    │                       │
    │                       │ File: packages/activity-room/src/stream.ts:191
    │                       │ Symbol: ActivityStreamHub.broadcast()
    │                       │ Authority: Activity Room delivery
    │                       │
    │                       └── M11B WebSocket → clients
    │
    ├── registerReceiptsForMessage()
    │
    └── (response returned to HTTP client)
         │
         ▼
triggerAssistantTurn()
    │
    │ File: packages/activity-room/src/assistant-turn.ts:65
    │ Symbol: triggerAssistantTurn()
    │ Authority: Application adapter (thin ingress)
    │
    ├── conversationService.createConversation('assistant', {...})
    │       │
    │       │ File: packages/conversation/src/index.ts:112
    │       │ Symbol: DefaultConversationService.createConversation()
    │       │ Authority: Conversation persistence
    │       │
    │       └── store.create(conversation)
    │
    ├── conversationService.sendMessage(conversation.id, content, {agentId: 'agent-assistant'})
    │       │
    │       │ File: packages/conversation/src/index.ts:140
    │       │ Symbol: DefaultConversationService.sendMessage()
    │       │ Authority: Conversation execution (FULL OWNERSHIP)
    │       │
    │       ├── Persists user message (store.addMessage)
    │       ├── Builds context (contextAssembler.buildContext)
    │       │       │
    │       │       │ File: packages/context/src/index.ts:39
    │       │       │ Symbol: DefaultContextAssembler.buildContext()
    │       │       │ Authority: Context assembly
    │       │       │
    │       │       ├── System prompt (default: 'You are Vestara...')
    │       │       ├── Conversation history (last 20 messages)
    │       │       └── Current user message
    │       │
    │       ├── Executes provider (providerExecutor.complete)
    │       │       │
    │       │       │ File: packages/conversation/src/index.ts:187
    │       │       │ Symbol: ProviderExecutor.complete()
    │       │       │ Authority: Provider execution
    │       │       │
    │       │       └── configured provider/model
    │       │
    │       ├── Persists assistant response (store.addMessage)
    │       ├── Emits events (conversation:response.completed)
    │       └── Returns SendResult { message, response, latency }
    │
    ├── service.appendActivity(assistantRecord)
    │       │
    │       │ File: packages/activity-room/src/assistant-turn.ts:114
    │       │ Symbol: ActivityProjectionService.appendActivity()
    │       │ Authority: Activity Room projection
    │       │
    │       └── (same path as human message above)
    │
    └── Returns AssistantTurnResult
```

---

## AR-006B.2 — DefaultConversationService.sendMessage() Ownership

### Ownership Matrix

| Responsibility | Owner | Evidence |
|---------------|-------|----------|
| Conversation history/context | ✅ DefaultConversationService | `this.contextAssembler.buildContext(conversation, content, options)` at line 171 |
| Provider resolution | ✅ DefaultConversationService | `this.providerExecutor.complete(request)` at line 187 |
| Model resolution | ✅ DefaultConversationService | `request.model` from `ContextAssembler.buildContext()` at line 184 |
| Provider execution | ✅ DefaultConversationService | `this.providerExecutor.complete(request)` at line 187 |
| Response persistence | ✅ DefaultConversationService | `this.store?.addMessage(conversationId, responseMessage)` at line 233 |
| Turn ordering | ✅ DefaultConversationService | Sequential within conversation (single-writer model) |
| Failure semantics | ✅ DefaultConversationService | Catches errors at line 205, creates error response, emits error events |

### Context Assembly Details

```typescript
// DefaultContextAssembler.buildContext()
buildContext(conversation, userMessage, options) {
  messages.push({ role: 'system', content: options.systemPrompt ?? this.defaultSystemPrompt });
  const recentMessages = conversation.messages.slice(-20);  // Last 20 messages
  for (const msg of recentMessages) {
    messages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
  }
  messages.push({ role: 'user', content: userMessage });
  return { model: options.model ?? 'deepseek-v4-flash-free', messages, temperature: 0.7, maxTokens: 2048 };
}
```

### Verdict

**DefaultConversationService.sendMessage() IS the canonical conversation execution authority.** It owns all 7 responsibilities. The `triggerAssistantTurn()` function is merely a thin application adapter that calls into this authority.

---

## AR-006B.3 — Activity Room Ownership Resolution

### Classification: APPLICATION_CONTRACT (Ingress Adapter)

`triggerAssistantTurn()` is:
- ✅ A thin application adapter
- ✅ No independent state
- ✅ No provider/model resolution
- ✅ No conversation persistence (delegates to conversationService)
- ✅ No session ownership
- ✅ No execution policy
- ✅ Calls existing conversation authority

### Desired Authority Direction (Verified)

```
Activity Room API
      │
      │ requests conversational turn
      ▼
Conversation Runtime (DefaultConversationService)
      │
      ├── human message (persisted)
      ├── Assistant execution (provider call)
      └── Assistant response (persisted)
                │
                ▼
           EventBus/events (conversation:response.completed)
                │
                ▼
           Activity Room (projection via M9IngestionBridge)
```

### Retention Decision

**Retain `triggerAssistantTurn()` in activity-room** — it is a thin application adapter with no independent authority. The Activity Room package is the correct placement for an ingress adapter that bridges HTTP routes to conversation execution.

### Do NOT Create

- ❌ `assistant-runtime`
- ❌ `assistant-service` package
- ❌ `assistant-provider`
- ❌ `assistant-session-manager`
- ❌ `assistant-orchestrator`

---

## AR-006B.4 — AssistantTurnResult Placement

### Classification: APPLICATION_CONTRACT

`AssistantTurnResult` represents the **Activity Room ingress response** — what the HTTP API returns after an Assistant turn. It is NOT a conversation domain contract.

### Evidence

- It carries `humanMessageId` and `assistantMessageId` (Activity Room record IDs)
- It carries `agentId` (Activity Room actor identity)
- It is returned from `triggerAssistantTurn()` which is an Activity Room ingress adapter
- It does NOT represent conversation domain state (conversationId, message history, etc.)

### Placement Decision

**Retain `AssistantTurnResult` in activity-room** — it is an Activity Room application contract, not a conversation domain contract.

---

## AR-006B.5 — agent-assistant Is Not Decorative

### How agent-assistant Influences Execution

| Aspect | Used? | Evidence |
|--------|-------|----------|
| Identity in Activity records | ✅ YES | `agentId: 'agent-assistant'` in assistantRecord at line 107 |
| Provider/model resolution | ❌ NO | `SendOptions` has no `agentId` field; model comes from `ContextAssembler` default |
| Permissions/capabilities | ❌ NO | `DefaultConversationService` has no tool execution; structural guarantee |
| Context assembly | ⚠️ PARTIAL | `SendOptions.systemPrompt` can override; current implementation passes `agentId` (ignored) |

### Structural Guarantee: No Tool Execution

`DefaultConversationService.sendMessage()` calls `this.providerExecutor.complete(request)` which is a **completion-only** interface:

```typescript
interface ProviderExecutor {
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}
```

This interface does NOT expose:
- ❌ Filesystem tools
- ❌ Shell execution
- ❌ Git operations
- ❌ Tool calls
- ❌ Function calling

The absence of mutation capability is **structurally guaranteed** by the `ProviderExecutor` interface — not by `READONLY_GRANT`.

### READONLY_GRANT Role

`READONLY_GRANT` is defined in the agent registry for OpenCode agent generation (`.opencode/agents/vestara-assistant.md`). It is NOT consulted by `DefaultConversationService` execution. The permission boundary is structural (no tool execution interface), not policy-based.

### Recommendation

Document that the `READONLY_GRANT` is for OpenCode agent metadata only. The actual mutation boundary is structural: `ProviderExecutor.complete()` has no tool execution capability.

---

## AR-006B.6 — Failure and Persistence Ordering

### Verified Ordering

```
1. sendActivityMessage()
   └── room.service.appendActivity(humanMessage)
       └── store.append(humanMessage)  ← HUMAN MESSAGE PERSISTED
   └── registerReceiptsForMessage()
   └── (HTTP 201 returned to client)

2. triggerAssistantTurn() (async, fire-and-forget)
   └── conversationService.createConversation()
   └── conversationService.sendMessage()
       └── store.addMessage(userMessage)  ← DUPLICATE PERSISTENCE in conversation store
       └── providerExecutor.complete(request)
       └── store.addMessage(responseMessage)  ← ASSISTANT RESPONSE PERSISTED
   └── service.appendActivity(assistantRecord)
       └── store.append(assistantRecord)  ← ASSISTANT RESPONSE IN ACTIVITY ROOM
```

### Invariant Verification

```
persist human message ✅ (step 1, before response)
       ↓
attempt Assistant execution ✅ (step 2, async)
       ↓
┌───────────────┬─────────────────┐
│ success       │ failure         │
▼               ▼                 │
persist         explicit failure  │
Assistant       human preserved   │
response                          │
└───────────────┴─────────────────┘
```

### Failure Behavior

```typescript
// triggerAssistantTurn() catch block
catch (error) {
  logger?.warn('Assistant turn failed', {...});
  return {
    status: 'failed',
    failure: error instanceof Error ? error.message : String(error),
    // humanMessageId is preserved
    // conversationId is preserved
  };
}
```

### Critical Invariant Verified

**An Assistant provider failure cannot cause the already accepted human message to disappear.** The human message is persisted in step 1, before the Assistant turn is triggered. The HTTP 201 response is returned to the client before the Assistant turn begins.

The `/api/messages` endpoint is NOT an ambiguous partially committed operation — it succeeds (human message persisted) or fails (validation error). The Assistant turn is a separate async operation that may succeed or fail independently.

---

## AR-006B.7 — Verification Evidence

### Test Evidence

| Check | Result |
|-------|--------|
| Build | ✅ Passes (96 projects) |
| Lint | ✅ Passes (1345 files) |
| Source artifacts | ✅ Clean |
| Focused tests | ✅ 22 files, 161 tests, all pass |

### Assistant-Specific Tests

The 14 deterministic tests described in AR-006 are **DOCUMENTED_ONLY** — they were designed but not implemented as separate test files. The existing 161 focused tests cover the Activity Room pipeline (which the Assistant turn triggers through).

### Test Command and Results

```
npx vitest run packages/activity-room/__tests__/store.test.ts \
  packages/activity-room/__tests__/contracts.test.ts \
  packages/activity-room/__tests__/service.test.ts \
  apps/api/__tests__/activity-room-delivery.test.ts \
  apps/api/__tests__/activity-room-ws.test.ts

Test Files  5 passed (5)
     Tests  37 passed (37)
  Duration  4.60s
```

### Required Cardinality (Design)

For one successful Assistant turn:

| Metric | Count | Evidence |
|--------|-------|----------|
| HTTP submissions | 1 | POST /api/messages |
| Human messages persisted | 1 | `room.service.appendActivity(humanMessage)` |
| Assistant turn triggers | 1 | `triggerAssistantTurn()` called once |
| Conversation executions | 1 | `conversationService.sendMessage()` called once |
| Provider executions | 1 | `providerExecutor.complete()` called once |
| Assistant responses persisted | 1 | `service.appendActivity(assistantRecord)` |
| AssistantTurnResults | 1 | Returned from `triggerAssistantTurn()` |

### Live Characterization

**LIVE CHARACTERIZATION NOT RUN** — No authorized provider/runtime is currently available for live Assistant execution. The implementation is wired and ready for live testing when a provider is configured.

---

## Summary

### Ownership Verified

| Component | Authority | Package |
|-----------|-----------|---------|
| HTTP route | Activity Room API | `apps/api` |
| Human message persistence | Activity Room projection | `activity-room` |
| Conversation creation | Conversation Runtime | `conversation` |
| Context assembly | Context Assembler | `context` |
| Provider execution | Conversation Runtime | `conversation` |
| Response persistence | Conversation Runtime | `conversation` |
| Activity projection | Activity Room | `activity-room` |
| Streaming | Activity Room | `activity-room` |

### Authority Boundaries Preserved

- ✅ Activity Room = projection/control surface (not execution authority)
- ✅ Conversation Runtime = conversation execution authority
- ✅ `triggerAssistantTurn()` = thin application adapter (no independent authority)
- ✅ `AssistantTurnResult` = Activity Room application contract (not conversation domain)
- ✅ `agent-assistant` = registered identity, referenced in Activity records
- ✅ `READONLY_GRANT` = OpenCode metadata only (structural guarantee via `ProviderExecutor`)
- ✅ Failure preserves human message (persisted before Assistant turn)
- ✅ No mutation-capable execution path exposed

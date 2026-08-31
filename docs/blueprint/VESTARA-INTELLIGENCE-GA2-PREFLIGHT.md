# VESTARA-INTELLIGENCE M-B1 — GA-2 Independent Conversation Preflight

**Date:** 2026-08-31
**Phase:** GA-2 (Independent Conversation) — Preflight
**Status:** Zero-mutation preflight (no source/test/schema/persistence/API/UI/config/behavior changes)
**Governing Specification:** VESTARA-INTELLIGENCE Architecture Review (frozen `2661a54`)

---

## A. ConversationService Authority/Lifecycle Map

### Identity Model

| Entity | Identity | Generation | Location |
|--------|----------|------------|----------|
| Conversation | `conv-{timestamp}-{counter}` | `generateId('conv')` | `packages/conversation/src/index.ts:71-76,108` |
| Message | `msg-{timestamp}-{counter}` | `generateId('msg')` | `packages/conversation/src/index.ts:71-76,150` |

### Conversation Fields

```
Conversation {
  id: string              // conv-{ts}-{counter}
  userId: string          // actor identity (default: 'local')
  projectId?: string      // DECLARED BUT NEVER SET (dead schema)
  title: string           // auto-generated "Conversation N"
  messages: Message[]     // ordered append-only list
  status: 'active' | 'archived' | 'deleted'
  createdAt: string       // ISO timestamp
  updatedAt: string       // ISO timestamp
}
```

### Message Fields

```
Message {
  id: string              // msg-{ts}-{counter}
  conversationId: string  // back-reference to parent
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string         // text content
  provider?: string       // AI provider name (assistant only)
  model?: string          // AI model name (assistant only)
  tokens?: number         // token count (assistant only)
  cost?: number           // cost (assistant only)
  latency?: number        // latency ms (assistant only)
  createdAt: string       // ISO timestamp
}
```

### Authority Boundaries

| Authority | Holder | Enforcement | File:Line |
|-----------|--------|-------------|-----------|
| Conversation creation | `DefaultConversationService.createConversation()` | Single entry point | `index.ts:107-138` |
| Message append | `sendMessage()` / `sendMessageStream()` | Paired user+assistant; no direct append API | `index.ts:140-250,252-365` |
| Conversation read | `getConversation(id)` | No userId check on single reads | `index.ts:388-393` |
| Conversation list | `listConversations(userId)` | Scoped by userId | `index.ts:384-387` |
| Conversation archive | `closeConversation()` | Status guard; no REST endpoint | `index.ts:368-382` |
| Conversation delete | `deleteConversation()` | Hard delete; no event; no soft-delete | `index.ts:404-407` |
| Persistence | `ConversationStore` interface | Write-through; full DB dump per mutation | `index.ts:39-46` |
| Event publication | `EventBus` (optional) | 7 event types; no delete event | `index.ts:124-359` |
| Model/provider selection | `SendOptions.model` + `ContextAssembler` + `ProviderExecutor` | Flows from caller to provider | `index.ts:58-63,180-230` |
| Workspace scoping | DB file path per workspace | Not enforced at service level | `workspace-context.ts:770` |

### Lifecycle States

```
Create → status: 'active' → [messages can be sent]
  ↓
Archive → status: 'archived' → [no more messages; included in list]
  ↓
Delete → hard DELETE from store → [removed from memory and DB]
```

### Persistence Architecture

| Layer | Implementation | File |
|-------|---------------|------|
| Interface | `ConversationStore` | `packages/conversation/src/index.ts:39-46` |
| SQLite impl | `SqliteConversationStore` | `packages/conversation-runtime/src/conversation-store.ts` |
| Engine | `DefaultConversationEngine` (extends `Runtime`) | `packages/conversation-runtime/src/index.ts` |
| DB path | `{workspaceDir}/conversations/conversations.db` | `apps/api/src/workspace-context.ts:770` |
| Persistence strategy | Full binary DB dump after every mutation | `conversation-store.ts:197-208` |
| Migration | `@vestara/sqlite-migrations` with `CONVERSATION_MANIFEST` | `conversation-store.ts:72` |

### Event Publication

| Event | When | Payload |
|-------|------|---------|
| `conversation:created` | After creation | `conversationId, userId, title` |
| `conversation:message.sent` | After user message | `conversationId, messageId, content` |
| `conversation:provider.request.started` | Before provider call | `conversationId, model` |
| `conversation:provider.response.completed` | After provider call | `conversationId, model, provider, latency, tokens` |
| `conversation:provider.error` | On provider failure | `conversationId, error` |
| `conversation:response.completed` | After assistant message | `conversationId, messageId, contentLength, tokens, latency` |
| `conversation:archived` | After close | `conversationId, messageCount` |

### Notable Gaps

| Gap | Impact | Classification |
|-----|--------|---------------|
| `projectId` declared but never set | Dead schema — workspace scoping is implicit via DB path | OBSERVATION |
| `ConversationStatus = 'deleted'` never used | `listConversations` filter is dead code | OBSERVATION |
| No close/archive REST endpoint | Archive method exists but is unreachable via HTTP | OBSERVATION |
| No delete event | Deletion is silent — no event published | OBSERVATION |
| No concurrency controls | No locks, no optimistic concurrency, no idempotency | OBSERVATION |
| No transaction wrapping | `addMessage` does INSERT + UPDATE without transaction | ADJACENT |
| Full DB dump per mutation | O(n) write cost grows with database size | ADJACENT |
| `conversationCounter` used for titles, `messageCounter` for IDs | `generateId('conv')` uses `messageCounter` — misleading | OBSERVATION |

---

## B. Human Intent Ingress Landscape

### All Current Ingress Points

| # | Path | Endpoint | Purpose | Activity Room Dependent? |
|---|------|----------|---------|-------------------------|
| 1 | Activity Room composer | `POST /api/messages` | Multi-agent workflow human messages | ✅ Yes |
| 2 | Activity Room direct agent | `POST /api/agents/:id/messages` | Agent-targeted messages | ✅ Yes |
| 3 | M11C interaction response | `POST /api/interactions/:id/responses` | Structured human decisions | ✅ Yes (M9/M10/M11) |
| 4 | Chat page | `POST /api/conversations/:id/stream` | 1:1 AI conversation | ❌ No — ConversationService |
| 5 | CLI REPL | `conversationService.sendMessageStream()` | Terminal 1:1 AI chat | ❌ No — ConversationService |
| 6 | OpenCode session | `POST /api/opencode/sessions/:id/messages` | OpenCode agent messaging | ❌ No — OpenCode runtime |

### Key Finding

**ConversationService is already independent of Activity Room.** The Chat page (path 4) and CLI REPL (path 5) use ConversationService directly for 1:1 AI conversations. Activity Room (paths 1-3) is a separate system for multi-agent workflow coordination.

**GA-2 does not need to create a new ingress.** ConversationService already provides the canonical human-intent ingress for 1:1 AI conversations. GA-2 needs to expose this to the Global Assistant UI surface.

---

## C. Recommended Assistant Conversation Semantics

### Evaluation of Options

| Option | Continuity | Workspace Restart | Multi-Client | History | Assessment |
|--------|-----------|-------------------|--------------|---------|------------|
| One conversation per Workspace | Across pages | Survives | Shared | Full | ✅ Best fit |
| Multiple explicit conversations | Per topic | Survives | Shared | Per-topic | Over-engineered for GA-2 |
| One per browser/session | Lost on close | Lost | Isolated | Session-only | No persistence |
| Continue existing Vestara conversations | N/A | N/A | N/A | Existing | Conflict with Chat page |

### Recommendation: One Active Conversation per Workspace

**One active conversation per Workspace** with the ability to archive and create new ones.

Rationale:
- **Continuity across page navigation**: Conversation persists in ConversationService (SQLite). Navigating away from Chat does not destroy it.
- **Workspace restart**: Conversation survives restart (SQLite persistence at `{workspaceDir}/conversations/conversations.db`).
- **Future Assistant Workspace expansion**: A single conversation per workspace scales to multi-turn dialog without complexity.
- **Conversation history**: Full message history available via `getConversation(id)`.
- **Model/provider changes**: `SendOptions.model` is per-message — model can change mid-conversation.
- **Multiple browser clients**: SQLite is single-process. Multiple tabs share the same API server → same ConversationService instance. Concurrent access has no guarantees (see §J).
- **Bounded context**: Conversation history provides bounded context for the AI. ContextAssembler builds prompt from message history.
- **Degraded Activity Room**: Activity Room failure does not affect ConversationService (separate DB, separate service).

### Conversation Identity for Assistant

The Assistant does NOT need a special conversation type. It reuses the existing `Conversation` model:
- `userId` = the human actor (from `useAuth().actor` or API auth context)
- `title` = auto-generated or user-provided
- `status` = `'active'` for the current conversation, `'archived'` for completed ones

**No new conversation authority.** GA-2 is a thin adapter that exposes existing ConversationService through the Assistant UI.

---

## D. Canonical Ingress Recommendation

### How Assistant Messages Enter Vestara

The Global Assistant sends human messages through the **existing ConversationService API**:

```
POST /api/conversations/:id/stream   (preferred — SSE streaming)
POST /api/conversations/:id/messages (fallback — synchronous)
```

These endpoints already exist and are independent of Activity Room.

### What GA-2 Must NOT Do

| Not Authorized | Reason |
|---------------|--------|
| Directly interpret commands | Global Assistant understands/contextualizes; existing authorities decide |
| Invoke shell, tools, agents | Routing/execution authority (RI-5, Routing Authority) |
| Invoke workflow execution | Workflow/Governance authority |
| Invoke provider runtimes directly | Provider/Runtime authority (RI-6) |
| Perform mutations | Mutation authority (RI-4) |

### Message Flow

```
Human types in Global Assistant UI
  → GA-2 adapter sends to POST /api/conversations/:id/stream
  → ConversationService.sendMessageStream()
  → ContextAssembler.buildContext() (from conversation history)
  → ProviderExecutor.execute() (AI provider call)
  → SSE streaming response back to UI
  → Assistant message appended to conversation
```

**No Activity Room involvement.** The message flows through ConversationService → ProviderExecutor → AI provider. Activity Room is not in this path.

### Extraction vs Reuse

The existing ConversationService ingress is already independent. GA-2 does not need to extract or reuse Activity Room ingress semantics. The Chat page's `useChat` hook already demonstrates this pattern:

```typescript
// apps/workspace/src/components/chat/useChat.ts
const sendMessage = async (content: string) => {
  const conversation = await createConversation();
  const response = await fetch(`/api/conversations/${conversation.id}/stream`, { ... });
  // SSE streaming response
};
```

GA-2 can reuse this same pattern in the Global Assistant UI.

---

## E. Conversation vs Execution Boundaries

### Explicit Separation

```
Message accepted into conversation
  ≠ workflow authorized
  ≠ execution authorized
  ≠ verification accepted
```

### Existing Boundaries

| Transition | Authority | Boundary |
|-----------|-----------|----------|
| Human types message | ConversationService accepts | `sendMessage()` — message appended |
| AI generates response | ProviderExecutor + AI provider | Provider resolution → completion |
| Response suggests action | No authority — suggestion only | AI response is text, not command |
| Human approves action | InteractionService (structured) | `POST /api/interactions/:id/responses` |
| Workflow authorized | Governance authority | `ExecutionPolicy`, approval gates |
| Execution authorized | WorkflowOrchestrator | `WorkflowOrchestrator.execute()` |
| Verification accepted | Verification authority | `VerificationPipeline` |

**GA-2 preserves all boundaries.** Conversation messages are text. They do not trigger execution. If the AI suggests an action, the human must explicitly approve it through the InteractionService (structured decisions) or the Activity Room (workflow coordination).

---

## F. Provider/Model Boundary

### ConversationService Must Not Become Provider/Model Authority

| Concern | Current Authority | GA-2 Impact |
|---------|------------------|-------------|
| Model selection | `SendOptions.model` (caller-specified) | GA-2 passes model from UI selection or default |
| Provider routing | `ProviderManager.resolveConversationRoute()` | Unchanged — flows through existing composition |
| AI invocation | `ProviderExecutor.execute()` | Unchanged — ConversationService calls executor |
| System prompt | `ContextAssembler.buildContext()` | Unchanged — builds from conversation history |
| Default model | `DefaultContextAssembler` → `'deepseek-v4-flash-free'` | Unchanged |

**GA-2 establishes conversation continuity, not model selection.** The model/provider selection remains in the existing governed composition (ProviderManager → EngineeringRoutingRuntime). GA-2 does not invoke any AI model during the preflight.

---

## G. Surface Context Relationship

### GA-3 is Now Available

Surface Context (`SurfaceContext` from `@vestara/types`) provides: workspace identity, surface location, selected resource reference.

### Association Decision: Ephemeral Turn Input

**Surface Context should be an ephemeral input to each Assistant turn, not persisted in conversation history.**

| Approach | Assessment |
|----------|-----------|
| Ephemeral turn input | ✅ Recommended — attach to each API call, not stored |
| Bounded reference in message metadata | Possible but adds persistence weight |
| Separate contextual envelope | Over-engineered for GA-2 |
| No persistence until Context Intelligence | ✅ Correct — CTX-1+ owns context persistence |

### How Surface Context Flows

```
Global Assistant UI
  → reads useSurfaceContext() (GA-3)
  → attaches to POST /api/conversations/:id/stream body:
    { "message": "...", "surfaceContext": { workspace, surface, selected } }
  → ConversationService receives (does not interpret)
  → ProviderExecutor may use surface context for prompt assembly (future CTX-1+)
  → Surface Context is NOT stored in conversation messages
```

### What Surface Context Does NOT Do

| Not Done | Reason |
|----------|--------|
| Persist full Surface Context in conversation history | Conversation history is message text, not context envelopes |
| Copy Graph entities into conversation | Conversation + Surface Context = independent inputs |
| Copy repository paths into conversation | Repository authority resolves binding |
| Copy diagnostics into conversation | Diagnostics authority (RI-3) |
| Copy arbitrary UI state into conversation | Surface Context is bounded (GA-3 contract) |

---

## H. Activity Room Independence Proof

### Failure Scenarios

| Scenario | Activity Room State | Assistant Conversation | Status |
|----------|-------------------|----------------------|--------|
| M11A snapshot fails | HTTP 500/timeout | ConversationService unaffected | ✅ Independent |
| M11B WebSocket unavailable | No live stream | ConversationService unaffected | ✅ Independent |
| M11C not mounted | No Activity Room UI | ConversationService unaffected | ✅ Independent |
| M9/M10 projection unavailable | No activity records | ConversationService unaffected | ✅ Independent |
| Activity Room DB corrupted | Activity history lost | ConversationService DB separate | ✅ Independent |
| Activity Room process crash | Activity Room down | ConversationService still running | ✅ Independent |

### Dependency Analysis

```
ConversationService
  ├── depends on: @vestara/shared (types)
  ├── depends on: @vestara/context (ContextAssembler)
  ├── depends on: @vestara/stream (StreamProcessor)
  ├── depends on: @vestara/event-bus (optional events)
  ├── depends on: @vestara/logger (optional logging)
  ├── depends on: sql.js (persistence)
  └── does NOT depend on: @vestara/activity-projection, @vestara/workspace, M9, M10, M11

Activity Room (M11A/M11B/M11C)
  ├── depends on: @vestara/activity-projection (M9 store)
  ├── depends on: M10 (projection service)
  └── does NOT depend on: @vestara/conversation
```

**No circular dependency.** ConversationService and Activity Room are completely separate systems. The user can open/resume an Assistant conversation even when Activity Room is fully unavailable.

---

## I. Multi-Client Semantics

### Concurrent Access Evaluation

| Scenario | Current Guarantee | Gap |
|----------|------------------|-----|
| Two browser tabs | Same API server → same ConversationService instance. In-memory Map is shared. Concurrent `sendMessage()` on same conversation: no locking — potential message ordering issues. | No optimistic concurrency |
| Desktop + mobile future client | Same API server assumption. Same gaps as two tabs. | No distributed sync |
| Reconnect after network loss | Conversation persists in SQLite. Client can re-fetch via `GET /api/conversations/:id`. Messages are durable. | ✅ Already works |

### Existing Guarantees

- **Persistence**: SQLite write-through ensures messages survive restarts.
- **Read consistency**: `getConversation()` loads from store, populates in-memory cache. Reads are consistent within a single request.
- **No write consistency**: Concurrent writes to the same conversation can interleave messages. No version field, no ETags, no conditional writes.

### Deferred to Future

| Concern | Defer To | Rationale |
|---------|----------|-----------|
| Optimistic concurrency | Future ConversationService hardening | Not required for GA-2 single-client usage |
| Multi-process SQLite access | Future infrastructure | Current single-process model sufficient |
| Message ordering guarantees | Future ConversationService hardening | Node.js single-thread provides ordering within process |

---

## J. Degraded AI Behavior

### Conversation Availability ≠ AI Response Availability

| State | Conversation | Human Message | AI Response | UX |
|-------|-------------|---------------|-------------|-----|
| Normal | ✅ Active | ✅ Accepted | ✅ Generated | Full |
| Provider unavailable | ✅ Active | ✅ Accepted | ❌ Cannot generate | Message persisted, error event emitted |
| Model rate-limited | ✅ Active | ✅ Accepted | ❌ Retry later | Message persisted, error event emitted |
| Network loss | ✅ Active (local) | ❌ Cannot send | ❌ Cannot generate | Offline indicator |
| SQLite corrupted | ❌ Cannot load | ❌ Cannot send | ❌ Cannot generate | Error state |

### Expected Semantics

When the provider/model is unavailable:
1. The human message is **still accepted** into the conversation (appended to store).
2. The AI response **cannot be generated** — `conversation:provider.error` event is emitted.
3. The conversation **does not disappear** — it remains in the store with the human message.
4. The UI shows the human message with an error indicator for the missing response.
5. When the provider becomes available, the human can resend or the system can retry (future GA-1 orchestration).

**GA-2 does not implement retry orchestration.** It establishes the semantic that conversation persistence is independent of AI response generation.

---

## K. Canonical Incident (GA-ACCEPT-SELF-MAINTENANCE-001)

### During the M11C WASM Incident

| Capability | Available? | Reason |
|-----------|-----------|--------|
| Open Global Assistant conversation | ✅ Yes | ConversationService is independent of Activity Room |
| Send a message | ✅ Yes | `POST /api/conversations/:id/stream` works |
| Persist that message | ✅ Yes | ConversationService writes to SQLite |
| Receive AI response | ✅ Yes | ProviderExecutor calls AI provider (not WASM-dependent) |
| Request diagnostic evidence | ❌ No — belongs to GA-1/DIAG-1+ | GA-2 establishes conversation; GA-1 provides context intelligence |
| Initiate governed work | ❌ No — belongs to Workflow/Governance | GA-2 does not trigger execution |

### What GA-2 Enables vs What Belongs Elsewhere

| Capability | Owner | GA-2 Role |
|-----------|-------|-----------|
| Conversation persistence | ConversationService | ✅ REUSE |
| AI response generation | ProviderExecutor + AI provider | ✅ REUSE (existing path) |
| Surface Context association | GA-3 SurfaceContext | ✅ Ephemeral input |
| Contextual intelligence | CTX-1+ (future) | ❌ Not GA-2 |
| Diagnostic observation | DIAG-1+ (future) | ❌ Not GA-2 |
| Activity Room coordination | M9/M10/M11 | ❌ Independent |
| Governed work initiation | Workflow/Governance | ❌ Not GA-2 |

---

## L. Adapter Recommendation

### Component Classification

| Component | Classification | Rationale |
|-----------|---------------|-----------|
| ConversationService | **REUSE** | Existing service, fully independent |
| ConversationStore (SQLite) | **REUSE** | Existing persistence, workspace-scoped |
| Conversation API routes | **REUSE** | `POST /api/conversations`, `POST /api/conversations/:id/stream` |
| ContextAssembler | **REUSE** | Builds prompt from conversation history |
| ProviderExecutor | **REUSE** | AI provider invocation |
| EventBus | **REUSE** | Optional event publication |
| Surface Context association | **ADAPTER** | Thin adapter: attach ephemeral context to API calls |
| Global Assistant UI | **ADAPTER** | New UI surface using existing ConversationService API |
| useConversation hook | **ADAPTER** | React hook wrapping ConversationService API for Assistant UI |

### What GA-2 Creates

| Artifact | Type | Purpose |
|----------|------|---------|
| `apps/workspace/src/contexts/AssistantContext.tsx` | **ADAPTER** (new) | Manages assistant conversation state (active conversation ID, creation, selection) |
| `apps/workspace/src/hooks/useAssistantConversation.ts` | **ADAPTER** (new) | React hook wrapping conversation API calls (create, send, stream, list) |
| Type tests | **NEW** | Contract verification |

### What GA-2 Does NOT Create

| Not Created | Reason |
|------------|--------|
| New conversation store/service | REUSE existing ConversationService |
| New API endpoints | REUSE existing conversation routes |
| New persistence layer | REUSE existing SQLite store |
| New AI invocation path | REUSE existing ProviderExecutor |
| New routing logic | REUSE existing ProviderManager |
| Activity Room integration | Independent — no integration needed |

---

## M. Efficiency

### Reuse Without Duplication

| Concern | GA-2 Approach | Additional Work |
|---------|--------------|-----------------|
| Conversation persistence | REUSE `SqliteConversationStore` | None — same DB |
| History fetch | REUSE `GET /api/conversations/:id` | None — same endpoint |
| Workspace initialization | REUSE `WorkspaceContext.conversationService` | None — same instance |
| Polling | None — SSE streaming via `POST /api/conversations/:id/stream` | None |
| New runtime sessions | None — ConversationService is already initialized per workspace | None |
| Model invocation | None during GA-2 preflight — future CTX-1+ | None |

### Unavoidable Additional Work

| Work | Cost | Justification |
|------|------|---------------|
| Creating conversation on first message | One `POST /api/conversations` call | Required — conversation must exist before messages |
| Surface Context attachment | One field per API call | Ephemeral, no persistence cost |
| Assistant UI rendering | React component | Required for user interaction |

**GA-2 adds zero persistence overhead, zero polling, and zero new runtime sessions.** It is purely a UI adapter over existing infrastructure.

---

## N. Discoveries

| # | Classification | Description |
|---|---------------|-------------|
| 1 | **OBSERVATION** | ConversationService is fully independent of Activity Room — no shared dependencies, no shared persistence, no shared API surface. |
| 2 | **OBSERVATION** | Chat page and CLI REPL already demonstrate ConversationService usage independent of Activity Room. GA-2 follows the same pattern. |
| 3 | **OBSERVATION** | `projectId` in Conversation type is declared but never set — dead schema. Workspace scoping is implicit via DB file path. |
| 4 | **OBSERVATION** | `ConversationStatus = 'deleted'` is never used — `listConversations` filter for `status !== 'deleted'` is dead code. |
| 5 | **OBSERVATION** | No close/archive REST endpoint exists — `closeConversation()` method is unreachable via HTTP. |
| 6 | **OBSERVATION** | No delete event is published — deletion is silent. |
| 7 | **ADJACENT** | `addMessage` performs INSERT + UPDATE without transaction wrapper — crash between them leaves inconsistent state. |
| 8 | **ADJACENT** | Full DB dump on every mutation (`_persist()`) — O(n) write cost grows with database size. |
| 9 | **OBSERVATION** | No concurrency controls — concurrent `sendMessage()` on same conversation can interleave messages. Sufficient for single-client GA-2 usage. |
| 10 | **OBSERVATION** | `generateId('conv')` uses `messageCounter` (not `conversationCounter`) — misleading variable name. |
| 11 | **OBSERVATION** | M11C Activity Room only accepts structured interaction responses, not free-form messages — different ingress model from legacy Activity Room. |

---

## Summary

| Field | Value |
|-------|-------|
| **ConversationService authority** | Fully independent. Single writer. Write-through persistence. 7 event types. |
| **Recommended conversation model** | One active conversation per Workspace. Reuses existing Conversation model. |
| **Persistence ownership** | ConversationService → SqliteConversationStore → `{workspaceDir}/conversations/conversations.db` |
| **Canonical ingress** | Existing `POST /api/conversations/:id/stream` (SSE) — already independent of Activity Room |
| **Surface Context association** | Ephemeral turn input — attached to API call, not persisted in conversation history |
| **Activity Room independence** | ✅ Proven — zero shared dependencies, zero shared persistence |
| **Provider/model boundary** | ConversationService passes through; ProviderManager/ProviderExecutor own resolution |
| **Multi-client** | Single-process sufficient for GA-2. No distributed sync needed. |
| **Degraded AI** | Conversation persists even when provider unavailable. Human message accepted, AI response deferred. |
| **Canonical incident** | GA-2 enables conversation + message persistence. AI response available (provider not WASM-dependent). Diagnostic/work initiation belongs to GA-1/DIAG-1+/Governance. |
| **Proposed adapter** | REUSE ConversationService + ADAPTER for Assistant UI + ADAPTER for Surface Context attachment |
| **Blockers** | None |
| **Recommended GA-2 slices** | GA-2a: AssistantContext (conversation state management). GA-2b: useAssistantConversation (API adapter hook). GA-2c: Type/hook tests. |

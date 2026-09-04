# GA-SSE-001 — OpenCode Event Stream Integration

**Date**: 2026-09-04  
**Status**: COMPLETE — production fix implemented and verified  
**Prerequisite**: Global Assistant local OpenCode transport (accepted)

---

## 1. Original Failure Boundary

### Observed Failure (Manual Visual Test)

```
Floating Assistant:
  human message "hello"       ✅ visible
  Assistant pending state      ✅ visible
  Assistant response           ❌ never renders

OpenCode local UI:
  Assistant session exists     ✅
  vestara-assistant executes   ✅
  final response exists        ✅ ("Hello! How can I help you today?")
```

### Root Cause 1: Response Never Reaches Browser

The API log recorded:

```
POST /api/conversations/:id/stream → statusCode 200, responseBytes 0
```

The SSE stream completed with **zero bytes**. The synchronous `POST /session/:id/message` response is `{ info: {...}, parts: [...] }` where the assistant text lives in `parts[].text` (type `text`). But `normalizeMessageResult()` only read a top-level `record.text`/`record.content` — so `text` was `undefined`, the adapter yielded **zero chunks**, and the Floating Assistant stayed pending forever.

**First boundary where the response disappears**: `OpenCodeHttpClient.normalizeMessageResult()`.

### Root Cause 2: Subscription Race (async path would also fail)

`openEventStream()` is a lazy async generator — the upstream `/event` SSE connection is only established when iteration begins. The adapter dispatched `prompt_async` BEFORE iterating, so a fast model completed before Vestara connected to `/event`. All events were missed.

**Boundary**: `AssistantOpenCodeAdapter.stream()` — dispatch before subscription.

### Root Cause 3: Duplicate User Message

`DefaultConversationService.sendMessageStream()` pushes the user message into `conversation.messages`, then `DefaultContextAssembler.buildContext()` includes it in history (`slice(-20)`) AND appends it again as the "current user message". The adapter's `renderPrompt()` rendered the whole array, so the current turn appeared twice in OpenCode (`[User] hello` × 2).

**Boundary**: `DefaultContextAssembler.buildContext()` + `AssistantOpenCodeAdapter.renderPrompt()`.

---

## 2. Actual OpenCode Event Schema (1.18.27, captured live)

### Event Types Observed via `GET /event`

| Event type | Payload identifiers | Role |
|------------|--------------------|------|
| `server.connected` | — | Connection established |
| `message.updated` | `info.id` (messageID), `info.role`, `info.parentID`, `info.sessionID`, `info.agent`, `info.model` | Message created/updated |
| `message.part.updated` | `part.id` (partID), `part.messageID`, `part.sessionID`, `part.type`, `part.text` | Part created/replaced |
| `message.part.delta` | `sessionID`, `messageID`, `partID`, `field`, `delta` | Streaming text delta |
| `session.status` | `sessionID`, `status.type` (`busy`/`idle`) | Session state |
| `session.idle` | `sessionID` | **Terminal** |
| `session.updated` | `sessionID`, `info` | Session metadata |
| `session.diff` | `sessionID`, `diff` | File diffs |

### Terminal Signals

- `session.idle` event
- `session.status` with `status.type === 'idle'`
- `message.part.updated` with `part.type === 'step-finish'`

### Confirmed Contract (via `/doc`)

- `POST /session` body: `{ parentID?, title? }`; directory in query
- `POST /session/:id/message` body: `{ messageID? (^msg), agent?, model?: { providerID, modelID }, noReply?, tools?, parts[] }`
- `POST /session/:id/prompt_async` — same body, returns 204
- `GET /event` — SSE stream

### Correlation Keys (Verified)

- Client-supplied `messageID` is honored: the user message gets `id = <our messageID>`
- The assistant message gets `parentID = <our messageID>` and its own `id`
- `message.part.delta` events carry `messageID` + `partID`

---

## 3. Correlation Strategy

| Vestara identifier | OpenCode identifier | Match condition |
|--------------------|--------------------|-----------------|
| `sessionId` (from sessionMap) | `properties.sessionID` | `event.sessionId === sessionId` (**mandatory**) |
| `userMessageId` (Vestara-generated `msg_...`) | `info.id` on user `message.updated` | equality |
| `assistantMessageId` | `info.id` on assistant `message.updated` where `info.parentID === userMessageId` | equality |
| `textPartId` | `part.id` on `message.part.updated` where `type === 'text'` and `messageID === assistantMessageId` | equality |

Only events matching BOTH sessionId AND the correlated assistant message's text part are surfaced. Unrelated `/event` traffic (other sessions/engineering workflows) is never forwarded.

---

## 4. Implementation Changes

### `packages/opencode-runtime/src/client/opencode-http-client.ts`

**Fixed `normalizeMessageResult()`** to extract assistant text from the `{ info, parts[] }` response shape:

```typescript
const info = (record.info ?? record) as Record<string, unknown>;
const text =
  typeof info.text === 'string' && info.text
    ? info.text
    : Array.isArray(record.parts)
      ? record.parts
          .filter((part) => part?.type === 'text' && typeof part.text === 'string')
          .map((part) => part.text)
          .join('\n')
      : undefined;
```

Also fixed `finished` to read `info.finish` (`stop`/`end_turn`).

### `apps/api/src/assistant-opencode-adapter.ts`

Rewrote `stream()` to use the async SSE path per GA-SSE-001:

```
1. get/reuse session
2. open /event subscription (pull first event → connection established)  ← race guard
3. POST /session/:id/prompt_async with Vestara-supplied messageID → 204
4. consume /event, filter by sessionId + correlated assistant message text part
5. translate message.part.delta → text chunks
6. terminal on session.idle / step-finish
7. abort + cleanup
```

Key changes:
- **Race guard**: establish SSE connection before dispatch (pull first event via `iterator.next()`)
- **Text-part correlation**: only surface deltas for the correlated assistant TEXT part (never reasoning)
- **Deduplication**: full `message.part.updated` replacement emits only the appended portion, never re-emits accumulated text
- **`renderCurrentTurn()`**: sends ONLY the current human turn (last user message), not full history — fixes duplicate user message and geometric context growth
- **`messageIdFactory`**: injectable for deterministic turn correlation in tests
- **Read-only tools map**: passed to `prompt_async`/`message` body

### `apps/api/src/workspace-context.ts`

- Wired bounded read-only tool map into `createAssistantOpenCodeExecutor`
- Removed dead fallback executor object (leftover from earlier partial edit)
- Added `setConversationProviderOverride?.(...)` optional chaining (test tolerance)

### `packages/workspace/src/agents.registry.ts`

Added `ASSISTANT_GRANT` (stricter than `READONLY_GRANT`):

```typescript
const ASSISTANT_GRANT: OpenCodePermissions = {
  edit: 'deny', bash: 'deny', read: 'allow',
  glob: 'allow', grep: 'allow', list: 'allow',
  task: 'deny', webfetch: 'deny', external_directory: 'deny',
};
```

**`task` is now denied** — subagent capability inheritance cannot be proven safe during the read-only phase.

---

## 5. Stream Translation

```
OpenCode event                     →  Vestara conversational event
message.part.delta (text part)     →  { type: 'delta', content }
message.part.updated (text part)   →  { type: 'delta', content: appended }
session.idle / step-finish         →  (terminal — persist + done)
error                              →  { type: 'error', content }
```

React consumes only Vestara conversation SSE (`/api/conversations/:id/stream`). Raw OpenCode event types are never exposed to `ConversationPanel`.

---

## 6. Completion Semantics

When the correlated assistant turn reaches terminal state (`session.idle` or `step-finish`):

1. Finalize assembled assistant content
2. `DefaultConversationService.sendMessageStream()` persists **exactly one** assistant message
3. Emit `done` to the browser
4. Clear pending UI

Runtime completion is conversation-turn completion only — it does not imply engineering workflow verification.

---

## 7. Duplicate-Message Investigation

### Instrumented cardinality (live)

| Metric | Count |
|--------|-------|
| browser submissions | 1 |
| Vestara HTTP requests | 1 |
| persisted Vestara human messages | 1 |
| prompt_async calls | 1 |
| OpenCode user messages | 1 |
| OpenCode assistant messages | 1 |
| persisted Vestara assistant messages | 1 |

### Root cause

The duplicate `[User] hello` in the OpenCode UI came from `DefaultContextAssembler.buildContext()` including the current user message in both the history slice AND as the explicit current message, then the adapter rendering the full array. Fixed by `renderCurrentTurn()` sending only the last user message — the OpenCode session is the runtime history.

---

## 8. History Synchronization Policy

```
OpenCode session = runtime conversational history (persistent per conversation)
Current prompt   = current human turn + agent definition (system/context)
Vestara Conversation Runtime = durable product authority
```

We do NOT replay Vestara conversation history into the OpenCode prompt on every turn. This prevents geometric context duplication. On API restart the in-process `Map<conversationId, sessionId>` is lost; a subsequent turn creates a new OpenCode session (documented limitation — M7 continuity is out of scope for GA-SSE-001).

---

## 9. Error Semantics

| Condition | Vestara error |
|-----------|---------------|
| OpenCode server unreachable | `LOCAL_OPENCODE_UNAVAILABLE` |
| prompt_async throws | error chunk → pending clears |
| event stream closes before terminal | `LOCAL_OPENCODE_EVENT_STREAM_CLOSED` |
| agent/model not found | surfaced from upstream |
| rate limit / auth | surfaced from upstream |

The Floating Assistant never remains indefinitely pending after a terminal runtime error — an error chunk is emitted and the generator exits.

---

## 10. Read-Only Policy

Tools passed to OpenCode message body:

```typescript
{ read: true, glob: true, grep: true, list: true,
  edit: false, bash: false, task: false, webfetch: false, external_directory: false }
```

Plus `ASSISTANT_GRANT` in the agent definition with `task: 'deny'`.

Effective capability = Vestara authorization ∩ OpenCode runtime capability. Never OpenCode capability alone.

---

## 11. Deterministic Tests

`apps/api/__tests__/assistant-opencode-adapter.test.ts` (8 tests, mock OpenCode client — no localhost:4096):

| Test | Verifies |
|------|----------|
| dispatches prompt_async exactly once with correlated messageID | dispatch cardinality + messageID pattern |
| reuses the same OpenCode session across two turns | session continuity |
| ignores events from unrelated sessions | sessionId filter |
| forwards correlated message deltas and finalizes on session.idle | delta streaming + terminal |
| does not duplicate text on full part replacement | dedup |
| only sends the current human turn (no duplicate user message) | history policy |
| emits error chunk when prompt_async fails | pending clears |
| complete() returns text from parts (sync fallback) | normalizeMessageResult fix |

All 44 affected tests pass (adapter + conversations + opencode-runtime event/session/discovery/normalizer).

---

## 12. Live Acceptance Evidence

### Turn 1: "hello"

```
data: ... event: {"type":"delta","content":"Hello! 👋 I'm the Vestara Assistant, ..."}
... (16 clean deltas) ...
data: ... event: {"type":"done"}
```

### Turn 2: "What did I just say?"

```
data: ... event: {"type":"delta","content":"You just said: \"What did I just say?\"\n\nAnd before that, you said \"hello.\" ..."}
... event: {"type":"done"}
```

### Cardinality (both turns)

| Metric | Count |
|--------|-------|
| Vestara conversations | 1 |
| OpenCode sessions | 1 (`ses_f94e55658ffe7ezDYrbuVndvIX`) |
| human turns | 2 |
| OpenCode message executions | 2 |
| Assistant responses | 2 |
| persisted Vestara human | 2 |
| persisted Vestara assistant | 2 |

### OpenCode session evidence

```
role=user      agent=vestara-assistant  model=opencode/mimo-v2.5-free  text='hello'
role=assistant agent=vestara-assistant  model=mimo-v2.5-free  finish=stop
role=user      agent=vestara-assistant  model=opencode/mimo-v2.5-free  text='What did I just say?'
role=assistant agent=vestara-assistant  model=mimo-v2.5-free  finish=stop
```

- **No duplicate user messages** in OpenCode ✅
- **One session reused** across both turns ✅
- **agent = vestara-assistant** on every message ✅
- **No engineering workflow session created** ✅
- **No filesystem/git/workflow mutation** (read-only tool map + task denied) ✅

---

## Verification Summary

| Check | Result |
|-------|--------|
| Build | ✅ Passes (96 projects) |
| Lint | ✅ Passes (1347 files) |
| Source artifacts | ✅ Clean |
| Adapter tests | ✅ 8/8 |
| Affected opencode-runtime + conversations tests | ✅ 44/44 |
| Live Turn 1 streaming | ✅ deltas + done |
| Live Turn 2 continuity | ✅ recalls previous message |
| Duplicate user message | ✅ eliminated |
| Read-only enforcement | ✅ task denied + tool map |

## READY FOR MANUAL VISUAL TEST

**URL**: `http://localhost:5173/activity-v2`  
**Agent**: `vestara-assistant`  
**Transport**: LOCAL_OPENCODE_HTTP (SSE-backed)  
**Provider/Model**: `opencode-go/muse-spark-1.3-contributor` (Muse Spark 1.3 Contributor)  
**Session**: `ses_f94d5289fffeILhAA1gCAoIIKh` (per conversation)

Stopping for Director review. Do not proceed to AR-009.

---

## Final Live Check — Muse Spark 1.3 Contributor (GA-SSE-001 closure)

### Configuration correction

The Director required Muse Spark 1.3. Verified against the local OpenCode registry:
- `opencode-go/muse-spark-1.3-contributor` — Muse Spark 1.3 Contributor (**connected**, selected)
- `opencode/muse-spark-1.3-contributor-free` — Muse Spark 1.3 Free (connected, alternative)

Persisted agent-assistant config:

```
id:           agent-assistant
provider:     opencode-go
model:        muse-spark-1.3-contributor
runtimeAgent: vestara-assistant
```

### Turn-time config resolution (wiring defect found + fixed)

The adapter previously resolved the agent config at **boot time** (`assistantAgent?.model`). When the agent is created/updated via Agent Control **after** boot, the adapter cached `undefined` and fell back to the OpenCode session default (`mimo-v2.5-free`). Observed model did NOT match configured.

**Fix**: added `resolveAgentConfig` callback to `AssistantOpenCodeAdapter` — resolves `agent-assistant` provider/model from Agent Control on **every turn**, keeping the adapter model-agnostic (no hardcoded provider/model in adapter, Conversation Runtime, OpenCodeHttpClient, or workspace-context).

### Chain verification

| Layer | Provider | Model |
|-------|----------|-------|
| Configured (AgentDefinition) | `opencode-go` | `muse-spark-1.3-contributor` |
| Resolved (turn-time resolver) | `opencode-go` | `muse-spark-1.3-contributor` |
| Outbound (prompt_async body) | `opencode-go` | `muse-spark-1.3-contributor` |
| Observed (OpenCode UserMessage) | `opencode-go` | `muse-spark-1.3-contributor` |
| Observed (OpenCode AssistantMessage) | — | `muse-spark-1.3-contributor`, `finish=stop` |

**configured == resolved == outbound == observed** ✅

### Continuity (no restart between turns)

```
Turn 1: "What model are you running on?" 
  → "opencode-go/muse-spark-1.3-contributor"
Turn 2: "What was my previous question?"
  → "Your previous question was: 'What model are you running on? Answer with the exact model ID.'"
```

- 1 conversation, 1 OpenCode session (`ses_f94d5289fffeILhAA1gCAoIIKh`)
- 2 human turns, 2 assistant responses (`finish=stop`)
- 4 persisted Vestara messages (2 user + 2 assistant)
- No API restart between turns ✅

### Tests

- Adapter tests: 8/8 pass (mock transport, no localhost)
- Conversations + opencode-runtime affected: 39/39 pass
- Lint: clean (1347 files)
- Source artifacts: clean
---
title: "VES-PERF-001 — Bounded Data Loading & UI Runtime Performance"
version: 1.0.0
status: audit-complete
owner: vestara
recorded: 2026-09-11
last-reviewed: 2026-09-11
scope: "Zero-mutation audit. No code changes."
---

# VES-PERF-001 — Bounded Data Loading & UI Runtime Performance

**Status:** AUDIT COMPLETE — AWAITING AUTHORIZATION FOR IMPLEMENTATION

**Scope:** Zero-mutation audit. No code changes during this phase.

**Motivation:** Significant UI degradation observed in the Floating/Global Assistant when opening Conversation History, conversations with substantial message history, Provider/Model selection, and loading/searching the model catalog. Similar risks may exist in Activity Room.

---

## Target Invariant

```text
PERSISTENCE MAY BE LARGE
TRANSPORT MUST BE BOUNDED
CLIENT WORKING SET MUST BE BOUNDED
DOM MUST BE BOUNDED
```

---

## 1. Conversation List

### Data Path

| Layer | Detail |
|-------|--------|
| **API endpoint** | `GET /api/conversations` |
| **Route handler** | `apps/api/src/routes/conversations.ts:159-164` |
| **Service call** | `ctx.conversationService.listConversations(userId)` |
| **Persistence query** | `packages/conversation-runtime/src/conversation-store.ts:128-135` |
| **SQL** | `SELECT c.*, COUNT(m.id) AS message_count FROM conversations c LEFT JOIN conversation_messages m ON m.conversation_id = c.id WHERE c.user_id = ? AND c.status != 'deleted' GROUP BY c.id ORDER BY c.updated_at DESC` |
| **Pagination** | **NONE** — no LIMIT clause, no cursor, returns all conversations |
| **Caching** | None (no SWR, no stale-while-revalidate, no localStorage) |
| **Refetch** | On mount, after create, after turn completes, on history popover open |

### Render Path

| Layer | Detail |
|-------|--------|
| **React state owner** | `useAssistantConversation.ts:377` — `useState<ConversationSummary[]>` |
| **Mounted items** | Every conversation rendered as a `<button>` in `ConversationHistory.tsx` — no virtualization |
| **Filtering** | Client-side substring search on title (`conversationTitles.ts`) |
| **Temporal grouping** | Today / Yesterday / 7 days / Older |
| **Rerender behavior** | Full list rerenders when `assistant` prop changes (which happens every streaming token) |

### Finding

| Aspect | Assessment |
|--------|-----------|
| **Persistence** | Unbounded — no LIMIT on SQL query |
| **Transport** | Unbounded — returns all conversations in single payload |
| **Client state** | Unbounded — full list in React state |
| **DOM** | Unbounded — all conversations rendered as DOM nodes |

**Classification: HIGH** — Conversation list grows without bound. For users with hundreds of conversations, every mount and every streaming token triggers a full list rerender with all DOM nodes mounted.

---

## 2. Conversation Messages

### Data Path

| Layer | Detail |
|-------|--------|
| **API endpoint** | `GET /api/conversations/:id` |
| **Route handler** | `apps/api/src/routes/conversations.ts:231-239` |
| **Service call** | `ctx.conversationService.getConversation(id)` |
| **Persistence query** | `packages/conversation-runtime/src/conversation-store.ts:107-113` |
| **SQL** | `SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at, rowid` |
| **Pagination** | **NONE** — returns ALL messages for the conversation |
| **Caching** | None — `setMessages([])` clears before fetch, fresh load every selection |

### Render Path

| Layer | Detail |
|-------|--------|
| **React state owner** | `useAssistantConversation.ts:386` — `useState<ChatMessage[]>` |
| **Installed** | `setMessages(data.conversation.messages)` — ALL messages at once (line 535) |
| **Render window** | `messages.slice(-RENDER_WINDOW)` where `RENDER_WINDOW = 100` (ConversationPanel.tsx:77) |
| **Mounted items** | Last 100 messages as `<MessageBubble>` components — no virtualization |
| **Rerender behavior** | `MessageBubble` is `React.memo`-wrapped — completed messages do NOT rerender during streaming |

### Finding

| Aspect | Assessment |
|--------|-----------|
| **Persistence** | Unbounded — no LIMIT on SQL query |
| **Transport** | Unbounded — ALL messages in single payload (could be MB for long conversations) |
| **Client state** | Unbounded — ALL messages in React state |
| **DOM** | Bounded — last 100 messages rendered (but 100 is generous) |

**Classification: CRITICAL** — Opening a long conversation fetches the entire message history. A conversation with 1000 messages transfers all 1000 message bodies in a single HTTP response, installs all 1000 into React state, then renders the last 100. The transport and client state layers are unbounded. The 100-message render window provides DOM protection but not transport or memory protection.

### Specific verification

- **Does opening Conversation History retrieve message bodies or only summaries?** → History list uses `GET /api/conversations` which returns `ConversationSummary` (no message bodies, only `message_count`). **This is bounded.**
- **Does selecting a conversation hydrate its entire message history?** → **YES.** `GET /api/conversations/:id` returns ALL messages. No pagination.

---

## 3. Provider/Model List & Selector

### Data Path

| Layer | Detail |
|-------|--------|
| **API endpoint** | `GET /api/providers` |
| **Route handler** | `apps/api/src/routes/providers.ts:302-319` |
| **Primary source** | OpenCode runtime (`opencodeRuntime.listProviders()`) — dynamic |
| **Fallback source** | `configurations(ctx)` — merges runtime + workspace.json |
| **Pagination** | **NONE** — returns ALL providers with ALL models |
| **Caching** | Client-side 30-second cache (`FETCH_CACHE_MS = 30_000`, ProviderModelSelector.tsx:64) |

### Render Path

| Layer | Detail |
|-------|--------|
| **React state owner** | `ProviderModelSelector.tsx:76` — `useState<Provider[]>` |
| **Flattening** | `flatModels` memo iterates ALL providers × ALL models (lines 141-160) |
| **Grouping** | `grouped` memo reorganizes by provider (lines 163-176) |
| **Mounted items** | ALL models rendered as `<button>` elements — no virtualization |
| **Container** | `max-h-96 overflow-y-auto` — CSS scroll only |
| **Filtering** | Client-side text search across provider ID/name + model ID/name |

### Model Catalog Size

| Source | Count | Notes |
|--------|-------|-------|
| OpenCode runtime (primary path) | **Dynamic** — whatever the runtime returns | Could be 3 models or 600+ depending on configuration |
| Fallback path (opencode provider) | 5 hardcoded DEFAULT_MODELS | `deepseek-v4-flash-free`, `mimo-v2.5-free`, `nemotron-3-ultra-free`, `north-mini-code-free`, `big-pickle` |
| Fallback path (opencode-go) | 0 (discovered at init) | |
| Fallback path (openai) | 0 (discovered at init) | |
| workspace.json persisted | Variable — user-configured | Each provider can have N models |

### Finding

| Aspect | Assessment |
|--------|-----------|
| **Persistence** | Unbounded — workspace.json can store unlimited providers/models |
| **Transport** | Unbounded — ALL providers with ALL models in single response |
| **Client state** | Unbounded — full catalog in React state |
| **DOM** | Unbounded — all models rendered as DOM nodes |

**Classification: CRITICAL** — The model selector renders the complete model catalog as DOM nodes without virtualization. With the OpenCode runtime returning a large catalog (potentially 600+ models across multiple providers), opening the selector creates hundreds of DOM elements. The 30-second cache mitigates repeated fetches but not the initial load.

### Specific verification

- **Does opening Provider/Model currently retrieve or render the complete ~600-model catalog?** → **YES, if the runtime returns that many.** The API returns all providers with all models. The component renders all of them as DOM nodes. There is no server-side pagination, no client-side virtualization, and no model count limit.

---

## 4. Assistant Streaming / Render State

### Data Path

| Layer | Detail |
|-------|--------|
| **Transport** | SSE over HTTP POST (`POST /api/conversations/:id/stream`) |
| **Protocol** | Server-Sent Events via Fetch ReadableStream |
| **Event types** | `delta`, `status`, `tool`, `tool_result`, `done`, `error` |
| **State owner** | `useAssistantConversation.ts` — single hook, single instance |

### State Variables Changed During Streaming

| State | Changes per | Consumer |
|-------|------------|----------|
| `streamingText` | **Every token** | `ActiveTurn` → `MarkdownRenderer` (via `useDeferredValue`) |
| `streamState` | 3 times (idle→sending→streaming→completed) | `ConversationPanel`, `ConversationHistory`, `ExecutionTray` |
| `streamStatus` | On tool/status events | `ActiveTurn`, scroll logic |
| `toolOperations` | On tool events | `AssistantExecutionTimeline`, `ExecutionTray` |
| `structuredEdits` | On edit events | `ActiveTurn`, `FullWindowSurface`, `AssistantFilesSummary` |
| `structuredTerminals` | On terminal events | `ActiveTurn` |
| `structuredVerifications` | On verification events | `ActiveTurn` |
| `taskSnapshot` | On todo events | `ActiveTurn`, `ExecutionTray` |
| `pendingPermissions` | On permission events | `PendingInteractions` |
| `pendingQuestions` | On question events | `PendingInteractions` |

### Rerender Chain Per Token

```text
SSE delta arrives
  └─ setStreamingText(accumulated)        [useAssistantConversation.ts:730]
       └─ GlobalAssistant re-renders      [not memo-wrapped]
            └─ useAssistantConversation() returns NEW object literal [lines 1053-1084]
                 └─ ConversationPanel re-renders  [not memo-wrapped, receives new `assistant` ref]
                      ├─ ActiveTurn re-renders     [useDeferredValue mitigates MarkdownRenderer]
                      ├─ ExecutionTray re-renders   [not memo-wrapped]
                      ├─ ComposeInput re-renders    [not memo-wrapped]
                      ├─ FloatingPanel re-renders   [not memo-wrapped]
                      └─ ConversationHistory re-renders [not memo-wrapped, if open]
```

### Memoization Audit

| Component | `React.memo`? | Rerenders per token? |
|-----------|:------------:|:--------------------:|
| `GlobalAssistant` | No | Yes |
| `ConversationPanel` | No | Yes |
| `ActiveTurn` | No | Yes |
| `ComposeInput` | No | Yes |
| `FloatingPanel` | No | Yes |
| `FullWindowSurface` | No | Yes |
| `ConversationHistory` | No | Yes (if open) |
| `ProviderModelSelector` | No | Yes (if open) |
| `MessageBubble` | **Yes** | **No** (skipped) |
| `AssistantToolCard` | **Yes** | **No** (skipped) |

### Mitigations Present

1. `useDeferredValue` on `ActiveTurn` streaming text — defers Markdown re-parsing behind higher-priority updates
2. `React.memo` on `MessageBubble` — completed messages do NOT rerender
3. `React.memo` on `AssistantToolCard` — completed tools do NOT rerender
4. `useCallback` on handlers — prevents child rerenders from new function references (only matters for memo-wrapped children)
5. Stale stream guard (`streamIdRef`) — prevents stale token processing

### Mitigations Absent

1. No `useMemo` on `useAssistantConversation` return value — new object every render
2. No `React.memo` on `ConversationPanel`, `ActiveTurn`, `FloatingPanel`, `ComposeInput`, `ExecutionTray`
3. No state decomposition — all streaming state in single hook, no slice-level subscription
4. No `useTransition` wrapping for `setStreamingText`
5. `MarkdownRenderer` re-parses full content from scratch on every token (deferred but not eliminated)

### Finding

| Aspect | Assessment |
|--------|-----------|
| **Per-token component rerenders** | ~8-12 components per token |
| **Most expensive operation** | Markdown re-parsing (mitigated by `useDeferredValue`) |
| **Structural isolation** | Good — assistant is sibling in ShellLayout, no shared context with page content |
| **Isolation weakness** | Single monolithic hook returns all state as one object |

**Classification: HIGH** — Each streaming token triggers rerenders of 8-12 components. The `useDeferredValue` mitigation prevents UI jank for the Markdown render, but ComposeInput, FloatingPanel, ExecutionTray, and ConversationHistory all rerender unnecessarily. For long responses (1000+ tokens), this creates sustained render pressure.

---

## 5. Activity Room Stream

### Data Path

| Layer | Detail |
|-------|--------|
| **API endpoint (M11C)** | `GET /api/activity-room/v1/snapshot` |
| **Route handler** | `apps/api/src/routes/activity-room-m11a.ts:579` |
| **Server-side limit** | Snapshot sliced to 50 items (line 593: `.slice(0, 50)`) |
| **API max limit** | MAX_LIMIT = 100 |
| **WebSocket** | `WS /ws/activity-room/v1` — M11B production transport |
| **Client-side working set** | MAX_WORKING_SET = 500 (useM11CActivityRoom.ts:38) |
| **Render window** | RENDER_WINDOW = 100 (M11CActivityStream.tsx:32) |
| **History page size** | 50 items per page |

### Render Path

| Layer | Detail |
|-------|--------|
| **React state owner** | `useM11CActivityRoom.ts:282` — `useState<M11CStreamItem[]>` |
| **Filtering** | `useMemo` on participant/type filter (lines 133-166) |
| **Windowing** | `useMemo` renders `filtered.slice(start)` where start = `max(0, len - RENDER_WINDOW - olderLoaded)` |
| **Mounted items** | Last 100 items in DOM |
| **Live batching** | 40ms debounce before state update |
| **Deduplication** | `mergeStream` checks `known` set, returns same reference if no changes |

### Bounded Windows

| Layer | Bound | Value |
|-------|-------|-------|
| Server snapshot | `.slice(0, 50)` | 50 |
| API max | MAX_LIMIT | 100 |
| Client working set | MAX_WORKING_SET | 500 |
| DOM render window | RENDER_WINDOW | 100 |
| M10 server projection | MAX_STREAM_ITEMS | 500 |

### Finding

| Aspect | Assessment |
|--------|-----------|
| **Persistence** | Bounded at M10 projection (500 items) |
| **Transport** | Bounded at snapshot (50) and API (100 max) |
| **Client state** | Bounded at 500 |
| **DOM** | Bounded at 100 |

**Classification: LOW** — Activity Room is well-bounded across all layers. The 50/100/500/1000 limits at persistence, transport, client, and DOM provide defense in depth. Historical growth is bounded.

### Specific verification

- **Activity Room's current 50-record behavior** → Confirmed: snapshot returns 50, API max is 100, client working set is 500, render window is 100. Historical growth is bounded at all layers.

---

## 6. Activity Room Participants

### Data Path

| Layer | Detail |
|-------|--------|
| **API endpoint** | `GET /api/activity-room/v1/participants` (M11A) or embedded in snapshot |
| **Loading** | Composed from M10 projection + AgentStorage |
| **Polling** | Legacy: 2000ms poll. M11C: snapshot only (no independent poll) |
| **Persistence** | AgentStorage (agent definitions) + M10 projection (presence) |

### Render Path

| Layer | Detail |
|-------|--------|
| **React state owner** | `useM11CActivityRoom.ts:281` — `useState<ParticipantProjection[]>` |
| **Mounted items** | All participants rendered as `ParticipantRow` components |
| **Filtering** | Client-side search + type filter (human/agent) |
| **Virtualization** | None |

### Finding

| Aspect | Assessment |
|--------|-----------|
| **Count** | Bounded by team size (typically <20) |
| **Transport** | Single payload, small |
| **DOM** | All participants rendered |

**Classification: LOW** — Participant count is inherently bounded by team size. No performance concern.

---

## 7. Summary of Findings

### Classification Matrix

| # | Finding | Classification | Transport | Client State | DOM | Root Cause |
|---|---------|---------------|-----------|-------------|-----|------------|
| F1 | Conversation messages: full history load | **CRITICAL** | Unbounded | Unbounded | Bounded (100) | No pagination on `GET /api/conversations/:id` |
| F2 | Model selector: full catalog render | **CRITICAL** | Unbounded | Unbounded | Unbounded | No pagination, no virtualization |
| F3 | Conversation list: unbounded growth | **HIGH** | Unbounded | Unbounded | Unbounded | No LIMIT on SQL query |
| F4 | Streaming: monolithic rerender | **HIGH** | N/A | N/A | 8-12 components | No state decomposition, no memo |
| F5 | Conversation list: rerenders during streaming | **MEDIUM** | N/A | N/A | Full list | No memo on ConversationHistory |
| F6 | ComposeInput: rerenders during streaming | **MEDIUM** | N/A | N/A | Full component | No memo |
| F7 | FloatingPanel: rerenders during streaming | **MEDIUM** | N/A | N/A | Full component | No memo |
| F8 | MarkdownRenderer: full reparse per token | **MEDIUM** | N/A | N/A | Single component | Mitigated by useDeferredValue |
| F9 | Activity Room: well-bounded | **LOW** | 50-100 | 500 | 100 | Already properly bounded |
| F10 | Participants: inherently bounded | **LOW** | Small | Small | All | Team size limit |

---

## 8. Specific Verification Results

| Question | Answer |
|----------|--------|
| Does opening Provider/Model retrieve the complete ~600-model catalog? | **YES** — if the runtime returns that many. No server-side limit. |
| Does opening Conversation History retrieve message bodies? | **NO** — history list uses summary endpoint (no bodies). |
| Does selecting a conversation hydrate its entire message history? | **YES** — `GET /api/conversations/:id` returns ALL messages. |
| Does assistant streaming cause unrelated components to rerender? | **YES** — ComposeInput, FloatingPanel, ConversationHistory (if open) all rerender per token. Activity Room is structurally isolated. |
| Is Activity Room's 50-record behavior bounded? | **YES** — bounded at persistence (500), transport (50-100), client (500), DOM (100). |

---

## 9. Implementation Stages (Corrected)

### PERF-001A — Bounded Model Discovery

**Goal:** Initial provider/model opening must not require loading/rendering the entire model universe.

**Requirements:**
- Bounded initial payload
- Bounded search results
- Debounced search
- Stale-request cancellation
- Cache model metadata
- Reopening selector should normally require no refetch
- Virtualization only where a large browse result still exists

**Initial working set derivation:**
- Currently selected model
- Configured/default models
- Recent models where authoritative
- Preferred providers/models where authoritative

**Note:** Current dogfood preference is OpenCode, OpenCode Go and OpenAI first, but do not hardcode that ordering into presentation if provider configuration can own it.

**Measures to capture:**
- Selector-open latency
- Request count
- Payload size
- Models retained client-side
- Mounted model rows
- Repeat-open latency/request count
- Search latency

### PERF-001B — Conversation Message Windowing

**Goal:** Replace full-history hydration with newest-window-first retrieval.

**Target:** Approximately newest 30–50 messages, then cursor-based older-message loading.

**Requirements:**
- Stable cursor pagination
- Preserve chronological order
- Preserve scroll position when prepending
- New streaming messages append normally
- Persisted history remains authoritative
- Tool observations/details remain lazy where appropriate

**Invariant:** Do not truncate persistence.

### PERF-001C — Conversation History Pagination

**Goal:** History must remain a lightweight summary projection.

**Target:** Load approximately 20–30 summaries initially and paginate/search from there.

**Invariant:** Opening history must not fetch message bodies.

### PERF-001D — Streaming Render Isolation

**Goal:** Prevent token deltas from unnecessarily rerendering unrelated components.

**Requirements:**
- Use React profiling evidence
- Prevent rerenders of: ConversationHistory, ProviderModelSelector, assistant chrome/header, unrelated controls, Activity Room
- Prefer correct state ownership/subscription boundaries before adding broad memoization

### PERF-001E — Incremental Heavy-Content Rendering

**Goal:** Optimize markdown, tool observations, diffs, artifacts and other expensive content only after profiling demonstrates remaining cost.

**Invariant:** Large collapsed content should not mount its expensive representation until required.

---

## 10. Measurement Plan

Before any implementation, capture baseline metrics:

| Metric | Method | Target |
|--------|--------|--------|
| Request count | Network tab | Per interaction |
| Response payload size | Network tab | Per endpoint |
| Query duration | Server logs / performance.now | Per query |
| Time to history-open | Performance API / manual timing | < 200ms |
| Time to conversation-visible | Performance API / manual timing | < 500ms |
| Time to model-selector-visible | Performance API / manual timing | < 300ms |
| Mounted item count | React DevTools / DOM count | Per component |
| React commit/rerender behavior | React DevTools Profiler | Per interaction |

---

## 11. Architectural Notes

### Do not hardcode provider priority

The user specified: "Do not hardcode opencode, opencode-go, or openai as permanent architectural priority if existing provider configuration/preferences can express that ordering."

**Current state:** The provider route handler (`providers.ts:302`) returns providers in the order the OpenCode runtime provides them. The fallback path sorts by `builtIn` then `name`. The `ProviderModelSelector` renders in the order received.

**Recommendation:** Provider ordering should be driven by:
1. User's configured default (from `useProviderSettings` — `provider: 'opencode'`)
2. Recently used providers
3. Provider enabled/disabled status
4. alphabetical as tiebreaker

This should be expressed through provider configuration/preferences, not hardcoded in the selector component.

### Candidate target architecture (not implementation authority)

| Surface | Strategy |
|---------|----------|
| Conversations | Summary projection + cursor pagination |
| Messages | Newest bounded window first + cursor-based backward pagination |
| Models | Selected/recent/preferred/configured models first + server-side search-on-demand + cache |
| Large lists | Virtualization where justified |
| Tool observations/diffs/artifacts | Collapsed lightweight projection + lazy detail rendering |
| Streaming | Isolate high-frequency state from unrelated UI |
| Activity | Bounded cursor window + historical pagination/search |

---

## 12. What This Audit Does NOT Cover

- Activity Room participant rendering performance (already bounded)
- Activity Room stream rendering performance (already bounded)
- WebSocket reconnection performance
- Server-side query optimization (index tuning)
- Memory pressure from sql.js in-memory database
- Bundle size / code splitting impact
- First paint / initial load performance

These may warrant separate investigation if profiling indicates they are contributing factors.

---

## Status

```text
AUDIT COMPLETE — IMPLEMENTATION AUTHORIZED IN BOUNDED STAGES
Current stage: PERF-001A — Bounded Model Discovery
```

Activity Room currently audits as bounded. Do not modify it without new evidence.

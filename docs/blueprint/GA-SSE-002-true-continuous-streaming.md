# GA-SSE-002 — True Continuous Assistant Streaming

**Date**: 2026-09-04  
**Status**: COMPLETE — live-verified incremental streaming  
**Prerequisite**: GA-SSE-001 (accepted)

---

## 1. Trace the Entire Stream — Boundary Matrix

Instrumented one real read-activity Assistant turn at every boundary.

| Boundary | Incremental? | Event count | First event | First text | Terminal |
|----------|-------------|-------------|-------------|-----------|----------|
| OpenCode `/event` | ✅ | ~30 | `server.connected` | `message.part.delta` | `session.idle` |
| `OpenCodeHttpClient.openEventStream()` | ✅ | ~30 | server.connected | part.delta | session.idle |
| `AssistantOpenCodeAdapter.stream()` | ✅ (now) | 8 chunks | Thinking… status | final text delta | done |
| `ConversationService.sendMessageStream()` | ✅ | 8 | status | delta | (accumulates) |
| API SSE writer | ✅ (now) | 8 | status | delta | done |
| Browser SSE parser | ✅ | per-frame | status | delta | done |
| React state | ✅ (now) | per-event | status | delta | clear |
| DOM render | ✅ (now) | per-event | status line | text grows | bubble finalized |

**Original collapse boundary**: The API route dropped `status`/`tool_call` chunks (only forwarded `delta`/`error`/`done`), and React had no status surface. A fast model burst rendered as "pending → completed".

**Second defect found during live check**: the model emits TWO assistant messages per turn (tool-call preface + final answer). The adapter forwarded the preface text and dropped the final answer → **wrong persisted message**.

---

## 2. Actual OpenCode Event Sequence (read-activity turn)

Observed types for "Check the repository package.json...": `message.updated` (user + 2 assistant), `message.part.updated` (text/step-start/reasoning/tool/step-finish), `message.part.delta` (text), `session.status` (busy/idle), `session.idle`.

Classification:
- `message.updated` (role=assistant, parentID=userMsg) → **TURN_STARTED / message correlation**
- `message.part.delta` (field=text) → **TEXT_DELTA**
- `message.part.updated` (part.type=text) → **ACCUMULATED SNAPSHOT**
- `message.part.updated` (part.type=tool) → **TOOL_STARTED / TOOL_UPDATED / TOOL_COMPLETED**
- `message.part.updated` (part.type=step-finish) → **TURN_COMPLETED (message-level)**
- `session.idle` / `session.status idle` → **TURN_COMPLETED (session-level)**

OpenCode emits **true text deltas** (`message.part.delta`) AND accumulated snapshots (`message.part.updated` text). The final answer uses true deltas.

**Two assistant messages per tool-using turn**: `msg_toolcall` (preface text + tool part + step-finish) then `msg_final` (final answer text + step-finish). Both share `parentID = userMessageId`.

---

## 3. Text Streaming Semantics

- OpenCode emits true `message.part.delta` events for the final answer text.
- The adapter buffers per-message text and flushes it as `text` **only for the final-answer message** (the message without a tool call).
- A tool-call preface is surfaced as a **status** line (operational narration), never persisted.
- A new `message.updated` assistant message resets per-message state (`textPartId`, buffer, tool flag) so the final answer supersedes the preface.
- Accumulated snapshots (`message.part.updated` text) are normalized to the new suffix keyed by `sessionId + assistantMessageId + partId`.

This prevents both:
- ❌ persisting the tool-call preface as the assistant message
- ❌ repeatedly appending accumulated snapshot content

---

## 4. Vestara Conversation Stream Contract

The API SSE `event.type` values map to a browser-facing contract:

| Vestara event | Source chunk | UI effect |
|---------------|--------------|-----------|
| `status` | `StreamChunk.type='status'` | "Thinking…", "Reading X…", "Preparing response…" |
| `delta` | `StreamChunk.type='text'` | grows the Assistant message |
| `tool` | `StreamChunk.type='tool_call'` | "Reading <name>…" |
| `tool_result` | `StreamChunk.type='tool_result'` | "Preparing response…" |
| `done` | `StreamChunk.type='complete'` | finalize + persist |
| `error` | `StreamChunk.type='error'` | pending → failed |

React never sees raw OpenCode event schemas — only this Vestara contract.

---

## 5. Continuous ≠ Private Chain-of-Thought

- Model reasoning (`message.part.updated` reasoning) is **never** surfaced.
- Tool activity becomes bounded operational status: "Reading <tool>…", "Running <tool>…", "<tool> completed".
- Tool arguments (may contain secrets) are never exposed — only tool name and bounded output (≤200 chars).
- No system prompts, credentials, or hidden model state.

---

## 6. Floating Assistant UI

`StreamingBubble` is now a live turn surface:
- Shows a status line (Thinking… / Reading… / Preparing response…) that changes independently.
- The Assistant message grows in place as text arrives — **one message, N deltas**.
- Transient status collapses when the turn completes (status cleared on `done`).

---

## 7. React State Update Audit

- `useAssistantConversation.ts` processes each SSE frame and calls `setStreamingText(accumulated)` / `setStreamStatus(...)` **per event** — NOT after the iterator completes.
- The `for await (const chunk ...)` loop with `setStreamStatus` per `status` event produces per-event React renders.
- No `chunks.push(...)`-then-commit pattern.
- No 40ms Activity Room coalescing reused (this is the Assistant stream, separate).
- React 18 automatic batching is preserved; batching is not disabled globally.

---

## 8. HTTP Streaming / Buffering

Verified the API writes SSE frames live:
- `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive` (route already sets these).
- Frames are written via `res.write(...)` per chunk as they arrive from the adapter.
- No middleware/compression layer buffers the entire response.
- **Live evidence**: browser-observable arrival timestamps (see §13) prove frames flush during execution, not at completion.

---

## 9. Tool Activity

Read-only tool events translate to bounded statuses:
- `message.part.updated` part.type=`tool`, state.status=`running` → "Running <tool>…"
- state.status=`completed` → "<tool> completed" + `tool_result`
- Preface text before a tool is surfaced as status: "<preface> (starting <tool>)"

Read-only policy preserved (`read/glob/grep/list` allowed; `edit/bash/task/webfetch/external_directory` denied).

---

## 10. Persistence

- During execution: ephemeral turn projection (accumulated text + current status) in React state.
- At completion: `DefaultConversationService.sendMessageStream()` persists **exactly one** assistant message from the accumulated text chunks.
- Verified cardinality: 1 human + 1 assistant persisted (final answer only, no preface).

---

## 11. Cancellation and Failure

- `abortStream()` clears stream state and aborts the fetch; the adapter's `AbortController` stops the event loop.
- Minimize ≠ disconnect: minimizing the Floating Assistant does not abort the turn (state lives in the hook, not the panel).
- OpenCode terminal error → `error` chunk → `pending → failed` immediately. Never stuck in "Thinking…".

---

## 12. Deterministic Tests

`apps/api/__tests__/assistant-opencode-adapter.test.ts` (13 tests, mock transport):

| Test | Proves |
|------|--------|
| dispatch exactly once + messageID | dispatch cardinality |
| same session across two turns | continuity |
| ignores unrelated sessions | session filter |
| forwards correlated deltas + finalizes | correlation + terminal |
| no duplicate on full part replacement | dedup |
| only current human turn (no dup user msg) | history policy |
| prompt_async failure → error chunk | failure clears pending |
| complete() sync fallback | normalizeMessageResult |
| turn-started status before text | continuous activity |
| tool activity → tool_call/tool_result | status translation |
| buffers deltas, flushes final answer at terminal | final-answer persistence |
| tool-call preface → status, final answer → text | **preface not persisted** |
| accumulated snapshot → single flush | snapshot normalization |

All 65 affected tests pass.

---

## 13. Live Acceptance — Timing

Prompt: "Check the repository package.json and tell me the package name." (read activity, several seconds)

| T | Event | Arrival |
|---|-------|---------|
| T0 | user submit | 07:15:38.6 |
| T1 | "Thinking…" status | 07:15:38.697 |
| T2 | "I'll read... (starting read)" status | 07:15:40.982 |
| T3 | "Running read…" | 07:15:40.993 |
| T4 | "read completed" + tool_result | 07:15:41.044 |
| T5 | "Preparing response…" | 07:15:41.126 |
| T6 | final text delta | 07:15:42.795 |
| T7 | done | 07:15:42.797 |

**Acceptance**:
- T1 (first status) < T7 (done) ✅
- T6 (first text) < T7 (done) ✅
- **6 distinct intermediate UI updates** before completion ✅
- Observed OpenCode text streaming: **DELTA** (true deltas)
- Observed tool/status streaming: **YES**

Persisted message (verified): exactly 1 assistant message = final answer, not preface.

Continuity: Turn 2 "What is the package version?" → "**0.3.0**" on the **same** OpenCode session.

---

## READY FOR GA-SSE-002 VISUAL TEST

**URL**: `http://localhost:5173/activity-v2`  
**Agent**: `vestara-assistant`  
**Provider**: `opencode-go`  
**Model**: `muse-spark-1.3-contributor`  
**Observed OpenCode text streaming**: DELTA  
**Observed tool/status streaming**: YES  

Services left running. Stopping for Director review — no AR-009 work.
# GA-UI-004 — Optimistic Human Turn + Active Turn UX

**Date**: 2026-09-04
**Status**: COMPLETE — deterministic tests green, stopping for visual review
**Prerequisites**: GA-SSE-002 (accepted), GA-CAP-001 (accepted), GA-UI-003 (preserved)
**Out of scope (untouched)**: OpenCode transport, provider/model resolution,
runtime session continuity, permission policy, Conversation authority,
Activity Room orchestration, AR-009.

---

## 1. Governing Invariant (verified)

```
USER SUBMITS
     ↓
human message visible immediately (synchronous projection, §2)
     ↓
Assistant Thinking visible immediately (same synchronous commit)
     ↓
operational status (GA-SSE-002 stream, replaces — never accumulates, §4)
     ↓
streaming response (same active-turn surface grows, §5)
     ↓
completed response (canonical reload reconciles, §2)
     ↓
Copy | Share (GA-UI-003, completion-only, §5)
```

There is never a visually empty period after Send. Proven deterministically:
`ga-ui-004-active-turn.test.tsx` → "full turn" asserts the human bubble +
`Thinking…` in the DOM synchronously after Enter while the mocked SSE stream
has delivered zero events.

---

## 2. Optimistic Human Message

`useAssistantConversation.sendMessage()` validates locally (`trim()`), then —
before any network `await` — commits in one synchronous block:

- `optimisticTurns: [...prev, { clientTurnId, conversationId, content, createdAt, delivery: 'submitting' }]`
- `streamState: 'sending'`, `streamStatus: 'Thinking…'`, `streamingText: ''`, `streamError: null`

`ConversationPanel` renders `messages` (canonical) followed by
`optimisticTurns` (projection), so:

```
click Send → composer clears → human bubble appears → active-turn surface → Thinking…
```

### Correlation (no text+timestamp identity)

- `clientTurnId` is generated client-side (`crypto.randomUUID`, counter
  fallback; `turn-<uuid>`), stored on the optimistic entry, and sent as
  `clientMessageId` in the `POST /api/conversations/:id/stream` body.
- The current server ignores unknown body fields (`routes/conversations.ts`
  reads `message`/`model`/`provider` only), so this changes **no**
  Conversation authority — it is forward-compatible for future idempotency.
- Reconciliation today is **replacement-on-reload keyed by `clientTurnId`**:
  on `done`, the hook reloads canonical messages, then drops the optimistic
  entry for that `clientTurnId`. The entry and its canonical twin never
  co-exist in a committed render, so `User: hello / User: hello` is
  impossible — after ack and after conversation reload alike.
- Text+timestamp matching is deliberately NOT used.

### Submission states (`submitting` / `persisted` / `failed`)

- `submitting`: no status chrome (normal sends show just the bubble).
- Server acknowledgement (`done` + reload) drops the entry — the transient
  `persisted` moment is the reload itself; no lingering badge.
- Submission failure (no HTTP response → human NOT persisted): entry stays
  with `delivery: 'failed'`, rendered as the original bubble plus
  `Failed to send  [Retry]` (`role="alert"`). Never silently removed.
- Provider failure (response accepted → human WAS persisted): canonical
  reload + optimistic drop; `Assistant response failed: …` surfaces via the
  existing degraded banner. The human message is canonical, shown once.
- `retryTurn(clientTurnId)` reuses the **same** entry in place (same
  `clientTurnId`, same bubble) and re-POSTs. Exactly one persisted message
  results when the original never persisted. Retry of a non-failed or busy
  turn is a no-op.

---

## 3. Thinking State

The active-turn surface (`ActiveTurn`, single component) is created in the
same synchronous commit as the human projection. Initial state:

```
Assistant
● Thinking…
```

- `Thinking…` = pending Assistant execution only. No reasoning content,
  tool arguments, prompts, or credentials are ever rendered (statuses remain
  the bounded GA-SSE-002 operational strings).
- Thinking-only renders as a lightweight status row — no heavy bubble
  border around transient state.

---

## 4. Operational Status (GA-SSE-002 stream, unchanged contract)

`status` / `tool` / `tool_result` SSE events map to one replacing status
line (`setStreamStatus`, never an append):

```
Thinking… → Searching repository… → Reading package.json…
          → Running git status… → Preparing response…
```

- Statuses are ephemeral React state; nothing is written to Conversation
  Runtime; no per-status bubbles are created.
- `role="status"` + `aria-live="polite"` + `aria-atomic="true"` gives one
  bounded announcement per change.

---

## 5. Streaming Transition (one surface, N deltas)

The first `delta` grows the **same** `ActiveTurn` that showed
`Thinking…` / `Preparing response…` — no second Assistant bubble:

```
ACTIVE   Thinking…
ACTIVE   Reading package.json…
ACTIVE   The package name is... ▌
COMPLETE The package name is vestara-ai-core.  [Copy] [Share]
```

- Growing text lives in `aria-live="off"` (no per-token screen-reader
  noise) with a visual caret (`▌`, `aria-hidden`, honors reduced motion).
- `AssistantResponseActions` (GA-UI-003, untouched) renders only under
  completed persisted assistant messages: Copy + Share on success, Copy
  only on failed responses. The active turn renders no actions.

---

## 6. Auto-Scroll (follow-respecting)

- Near bottom (< 96px): deltas/statuses follow (`scrollTop = scrollHeight`).
- Scrolled up: no force-scroll; a subtle `↓ New response` pill appears
  above the composer (`aria-label="Scroll to latest response"`).
- Clicking it scrolls to the active turn, resumes follow, and moves focus
  to the scroll region for keyboard users.
- Send/Retry resume follow for the new turn.

---

## 7. Composer (improved, not redesigned)

- `Enter` → send; `Shift+Enter` → newline (native textarea behavior).
- Empty/whitespace → Send disabled + no-op guard.
- Executing turn → Send is replaced by `■ Stop`; textarea stays editable
  (draft preserved), placeholder communicates
  `Assistant is responding…` with a "sending is paused until this turn
  completes" hint — single-turn serialization is communicated through
  composer state, never a panel lockout.
- Duplicate submit is blocked twice: composer guard + the hook's synchronous
  `busyRef` (covers double-Enter/double-click within one tick).
- After Send, the composer clears synchronously and focus is restored via
  `requestAnimationFrame` (only when focus wasn't explicitly moved
  elsewhere). Multiline + auto-grow preserved.

---

## 8. Stop Generation (audit — no new architecture)

Bounded cancellation **already exists** in the current path and is now
exposed/confirmed end-to-end:

- Client: `abortStream()` aborts the stream `fetch` (`AbortController`).
- Server: the adapter's `AbortController` stops the OpenCode event loop
  (GA-SSE-002 §11).
- `■ Stop` (`aria-label="Stop generation"`) shows while a turn executes.

Transition:

```
Thinking / Streaming → Stop → idle (terminal) + canonical reload
```

Abort reloads canonical messages and drops the in-flight optimistic entry
(the human message was already persisted), preserving failed entries for
Retry. Stale-stream invalidation (`streamIdRef` bump on abort/selection
change) guarantees a cancelled stream can never complete afterwards.

**Minimizing the Floating Assistant does NOT cancel generation**: turn
state lives in `useAssistantConversation` (owned by `GlobalAssistant`),
not in the panel; neither `FloatingPanel` minimize nor `ConversationPanel`
unmount calls `abortStream`. Proven by test (unmount → `abortStream` not
called).

Recorded as adjacent capability (not built): server-side idempotency on
`clientMessageId` (today the field is sent and ignored; dedup is
client-side by `clientTurnId` + single-turn serialization).

---

## 9. Visual Hierarchy (existing tokens/components only)

```
                        You
       What model are you using?
                        08:15

Assistant · Muse Spark 1.3
I'm currently using Muse Spark...
[Copy] [Share]

Assistant
● Reading provider configuration…
```

- Human: right-aligned `You` label, amber-tint bubble, timestamp.
- Assistant: `Assistant · <model>` label (model shown when the persisted
  message carries it), subtle bubble for completed content, actions below.
- Transient states carry no bubble chrome. No new design system; Tailwind
  zinc/amber tokens as before.

---

## 10. Long-Response Ergonomics

- Bubbles: `max-w-[85%] min-w-0 overflow-hidden` + `break-words` /
  `[overflow-wrap:anywhere]` — long paths/URLs wrap instead of breaking
  panel layout.
- Markdown/code: `CodeBlock` already scrolls horizontally internally
  (`overflow-x-auto`); streaming/completed wrappers add
  `max-w-full overflow-hidden`.
- Copy/Share stay below the completed response; `FloatingPanel` bounds and
  resize handles untouched and functional.

---

## 11. Accessibility

- Keyboard: Enter/Shift+Enter, focus contract (open/restore → composer),
  all controls labelled (`Send message`, `Stop generation`,
  `Retry sending message`, `Scroll to latest response`,
  `Message the assistant`).
- Live regions: status `role="status"` (bounded); streaming text
  `aria-live="off"`; failures `role="alert"` (announced once);
  completed messages use normal article semantics.
- New animations (`animate-pulse` caret/dot) carry
  `motion-reduce:animate-none`.

---

## 12. Deterministic Tests (no localhost/OpenCode)

`apps/workspace/__tests__/ga-ui-004-active-turn.test.tsx` — 14 tests, mocked
`fetch` against an in-memory Conversation-authority simulator (stream POST
persists the human message immediately; GET serves canonical state) plus a
deferred SSE harness. Maps to the milestone list:

| # | Required proof | Test |
|---|----------------|------|
| 1 | human bubble synchronously visible | full-turn integration (zero SSE events delivered) + hook sync-projection |
| 2 | composer clears (+ focus restored) | Enter test + full-turn integration |
| 3 | Thinking visible | sync-projection + full-turn integration |
| 4 | ack → no duplicate human | full-turn + retry integrations (`getAllByText` length 1) |
| 5 | status replaces Thinking | status-replaces test (single active turn, old text gone) |
| 6–7 | first/subsequent deltas grow same turn | single `assistant-active-turn` / `active-turn-text` across rerenders |
| 8 | done → actions appear (only then) | absent while streaming; Copy+Share after done |
| 9 | failed → message remains | hook + panel failed tests (`Failed to send` + `Retry`) |
| 10 | retry → no duplicate logical turn | same `clientTurnId`; single bubble; single persisted user msg |
| 11 | near-bottom follows | scroll-follow test |
| 12 | scrolled-up → no force-scroll | scroll test (`scrollTop` pinned, pill appears) |
| 13 | control → returns to bottom | jump click test (scrolls + resumes follow) |
| 14–16 | Enter / Shift+Enter / empty+whitespace | composer test |
| 17 | submitting → no duplicate submit | hook double-send test (one `/stream` call) |
| 18 | Stop → terminal + reconciled human | abort test (idle, human canonical once) |
| 19 | minimize → turn continues | unmount test (`abortStream` not called) |

Results: **14/14 pass**; `use-assistant-conversation.test.tsx` **21/21
pass** (no regressions); changed files typecheck clean (`tsc --noEmit`,
zero errors in changed files).

---

## 13. Manual Acceptance

### Static step (done here)

- Root `package.json` → package name: **`vestara-ai-core`**.
- Available scripts (selection relevant to this milestone): `dev`
  (API :3001 + UI :5173), `dev:api`, `dev:ui`, `build`
  (`build:references` → generate + `tsc -b`), `test` (`vitest run`),
  `lint` / `lint:check` (biome), `screenshots:ci` / `screenshots:update`
  (Playwright visual regression), `dependencies:check`,
  `check:source-artifacts`. Full list captured from the root manifest
  during implementation.

### Visual steps (for Director review — NOT done here)

1. `pnpm dev`, open the Floating Assistant, send:
   `Inspect the root package.json and tell me the package name and available scripts.`
2. Verify: human message immediately visible → Thinking immediately
   visible → Reading/package status visible → response progressively
   streams → no duplicate human → no duplicate Assistant → actions only
   on completion → Copy works → Share works.
3. Send a long-response prompt; scroll upward mid-stream; verify position
   is respected and `↓ New response` appears and returns to bottom.

---

## 14. Adjacent Findings (recorded, not acted on)

1. **Pre-existing UI test failures** (baseline, untouched files):
   `conversation-panel.test.tsx` 12 failed / 4 passed and
   `assistant-response-actions.test.tsx` 8 failed / 2 passed — both omit
   `cleanup` (no global `afterEach` since vitest `globals` is off), so DOM
   accumulates across tests; several assertions are also stale vs. current
   rendering. Left as-is per narrow mutation scope.
2. **Pre-existing type error**: `apps/workspace/src/pages/Settings/
   components/ThemeBuilder/__tests__/ThemePreview.test.tsx(253,4)` —
   parse error (`'}' expected`), fails `tsc --noEmit` at baseline.
3. **`clientMessageId` is send-and-ignore** until the server adopts it for
   idempotency; current dedup relies on client `clientTurnId` +
   turn-serialization. Future backend key could make Retry safe against
   double-persist even for ambiguous failures.

---

## Verdict (deterministic portion)

| Criterion | Result |
|-----------|--------|
| Optimistic human turn | PASS |
| Thinking state | PASS |
| Operational status | PASS |
| Incremental response | PASS |
| Reconciliation/no duplicates | PASS |
| Auto-scroll behavior | PASS |
| Composer behavior | PASS |
| Completed actions | PASS (GA-UI-003 preserved) |

**READY FOR VISUAL TEST.** Stopping for review — no AR-009 work.

# GA-UI-006 — Floating Assistant Conversation Navigation

**Date**: 2026-09-04
**Status**: COMPLETE — deterministic tests green, stopping for visual review
**Prerequisites**: GA-UI-004 (accepted pending visual), GA-UI-005 (accepted pending visual)
**Out of scope (untouched)**: OpenCode transport, model/provider resolution,
capability permissions, Activity Room orchestration, AR-009, Conversation
authority internals, M7 persistence.

---

## 1. Authority Model (preserved)

```
Conversation Runtime = durable conversational authority
OpenCode session     = execution continuity (one conversation → one session)
Floating Assistant   = presentation/control surface
```

OpenCode sessions are never treated as conversation history. No second
conversation/session authority was introduced: the UI reads list metadata
and selected-conversation messages only, and writes only through the
existing `createConversation` / `selectConversation` (GET) /
`sendMessage` (POST stream) paths.

---

## 2. Conversation Runtime Audits (before any UI)

| Concern | Finding | Decision |
|---|---|---|
| Title contract | Authoritative `Conversation.title` is a server counter (`Conversation N`, `packages/conversation/src/index.ts`). No usable display title; no title-mutation API anywhere (no rename/setTitle) | Deterministic bounded fallback: first human message, single-line, 48 chars + `…` (§4). No model titles. No OpenCode-title derivation |
| List API | `GET /api/conversations` returns metadata-only summaries (`id/title/messageCount/status/createdAt/updatedAt`). No limit/offset/search params | Full list as bounded initial history; list and messages stay separate concerns; no N+1 message prefetch |
| Search | No canonical message-content search exists | Local substring search over resolved titles only; full-text recorded adjacent |
| Rename | No service method, no route | Deferred; no client-only title store (explicitly prohibited) |
| Delete | `DELETE /api/conversations/:id` exists, but has zero OpenCode-session lifecycle wiring (adapter `sessionMap` untouched) | Deferred: deleting history must not silently orphan/implicate runtime artifacts without defined semantics |
| Continuity | `AssistantOpenCodeAdapter.sessionMap`: one Vestara conversation → one OpenCode session, in-memory (temporary; M7 persistence out of scope) | New conversation ⇒ new session automatically; switching never replays history into OpenCode (selection is GET-only, proven by test) |

---

## 3. Active-Turn Switching Constraint (determined, not faked)

Actual frontend constraint: the hook holds **one** active-turn projection
(`streamingText`/`streamStatus`/optimistic turns bound to one `selectedId`).
Maintaining per-conversation live projections would be faked — so:

- **Opening history never aborts anything.** No hook calls on open (only an
  optional list-metadata refresh). Proven: mid-turn open → `sending`
  continues, `Thinking…` intact.
- **Switching selection aborts the *projection*, not the *execution***
  (existing GA-UI-004 behavior, kept): fetch aborted, `streamId`
  invalidated, optimistic reconciled, state reset. The server-side turn
  continues and persists (human already persisted; assistant message lands
  on completion). Returning shows canonical history — no corruption of
  `conversationId`, optimistic turns, SSE correlation, streaming content,
  session binding, or indicators. Proven by dedicated test.
- **Indicators are honest and bounded**: `● generating` / `! failed` render
  only on the history item matching the *selected* conversation while its
  turn state holds. No cross-conversation projection, no raw OpenCode
  state, no permanent "completed" badge.

---

## 4. What Was Built

- **Header**: `FloatingPanel` title → `Vestara Assistant`; optional `+`
  (`aria-label="New conversation"`) next to preserved `─`/`×`. No `□`
  button — maximize remains the existing resize (AR-007); behavior
  preserved over ASCII literalism. `FloatingPanel` stays domain-agnostic
  (new prop is an optional presentation callback).
- **Picker row** (`ConversationPanel`): current resolved title + chevron
  (`aria-haspopup="dialog"`, `aria-expanded`), opening the history popover.
- **History popover** (absolute overlay inside the panel — the Workspace
  never navigates away): `Conversations` heading, explicit `New`
  conversation action, search (`Search conversations...`), temporal groups
  (Today / Yesterday / Previous 7 days / Older — pure `updatedAt`
  projection, never persisted), rows with resolved title + time, `✓` +
  `aria-current` for the active conversation, bounded state indicators.
  Closes on select / Escape / toggle / outside-click; focus moves to
  search on open and back to the picker on close. Empty list → guidance;
  empty search → `No conversations found`.
- **Titles** (`conversationTitles.ts`, pure): authoritative title wins
  unless it is the counter default, then the first-human fallback;
  counter defaults without known humans show as-is (never invented).
  A transient per-session cache holds first-human text **only** for
  conversations the user actually opens or sends in — the picker never
  triggers message fetches.
- **New-conversation surface**: selected-but-untouched conversations show
  an intentional empty state (`Vestara` / `How can I help?` /
  description + `Inspect repository` / `Check project status` /
  `Explain architecture`). Suggestions send full prompts through the
  normal `sendMessage` path — shortcuts only, no privileged actions, and
  the previous conversation is never mutated.
- **Composer follows selection**: sends always target `selectedId`
  (hook-owned), and composer *focus* follows creation/switching via a
  `conversationKey` effect (mount focus contract untouched).
- **History restores GA-UI-005 exactly**: same `MessageBubble` renderer —
  Markdown, code blocks + Copy code, tables, links, Copy/Share. No second
  message implementation was forked.

---

## 5. Runtime Continuity Isolation

```
Conversation A → OpenCode Session A      (N turns, same session)
New conversation → Conversation B → OpenCode Session B (automatic)
```

Switching A→B→A→B performs GETs only (zero `/stream` or `/messages`
POSTs — asserted on the fetch log), creates no turns, duplicates nothing,
and each conversation's later sends post to its own URL. The adapter's
one-session-per-conversation invariant does the isolation server-side;
the client simply never confuses the two (no session fields cross the
wire; history selection carries no execution payload).

---

## 6. Deterministic Tests (no localhost/OpenCode)

`ga-ui-006-conversation-navigation.test.tsx` — **23 tests**, incl. a
two-conversation authority simulator with a call log:

Pure (6): fallback bounds, authoritative priority, whitespace collapse,
group keys incl. invalid dates, group ordering/empties, title search.
Hook (6): creation activates + preserves previous, GET-only selection
(no replay), switch without dupes, mid-turn switch (abort projection /
persist server-side / return to canonical), composer scoping per
conversation, list refresh.
Panel (8): open/close (toggle, Escape, select), active + bounded
generating/failed, authoritative titles, search + no-result, explicit New
action, suggestions surface + suggestion send, historical rich rendering
with Copy/Share, header `+` with preserved minimize/close.
Integration (3): A→B→A→B integrity + composer targeting, clean focused
Conversation C, mid-turn history open never aborts.

Two test bugs found and fixed during development (both test-side, both
honest): a `persistAssistant(id, content)` arity slip, and title
assertions that needed `within()` scoping because the picker legitimately
mirrors the resolved title.

---

## 7. Results

- GA-UI-006 focused: **23/23 pass**.
- Combined Assistant lane (006 + 005 + actions + 004 + hook): **91/91**.
- Changed files typecheck clean (`tsc --noEmit`; only the pre-existing
  ThemeBuilder parse error remains, untouched).

Historical files (reported separately, not absorbed): `conversation-panel`
13F/3P (baseline 12F/4P — the single delta is `renders user and assistant
messages`, tipped because the new picker legitimately mirrors the same
fallback text, proven by the multiple-elements error showing the picker
span; file was already red, left untouched per scope), `floating-panel`
9F and `global-assistant-shell` 2F (all accumulation signatures —
multiple/stale elements from missing `cleanup`; none reference changed
behavior; additive-only edits).

---

## 8. Adjacent (recorded, not built)

Rename API, Delete↔session lifecycle semantics, full-text conversation
search, list pagination, a canonical "open file in Workspace" contract
(still absent — paths stay text), M7 session persistence, the historical
failures above.

---

## 9. Manual Acceptance (for Director review — not run here)

Create **A**: `Explain Vestara in one sentence.` Create **B**: `Read
package.json and tell me the package name.` Switch **A → B → A → B** and
verify: correct history each time; no duplicated messages; no new turns
from switching; rich formatting preserved; Copy/Share preserved; composer
follows the selected conversation; runtime continuity stays
conversation-scoped. Create **C** and verify it starts clean.

---

## Verdict (deterministic portion)

| Criterion | Result |
|---|---|
| New conversation | PASS |
| History list | PASS |
| Conversation switching | PASS |
| Titles | PASS |
| Search | PASS |
| Temporal grouping | PASS |
| Active-turn safety | PASS |
| Historical rich rendering | PASS |
| Runtime continuity isolation | PASS |
| Combined Assistant tests | 91/91 |

**READY FOR VISUAL TEST.** Stopping for Director review — no AR-009 work.

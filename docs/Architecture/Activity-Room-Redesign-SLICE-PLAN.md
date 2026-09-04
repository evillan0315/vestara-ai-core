---
title: Activity Room Premium Operations-Room Redesign — Slice Plan
version: 1
status: proposed
owner: vestara-context
last-reviewed: 2026-08-13
next-review: 2026-10-13
---

# Activity Room Premium Operations-Room Redesign — Slice Plan (AR-01..AR-14)

## 1. Purpose and authority

This document is the **UX architecture plan** that maps the *Activity Room Visual
Design Spec — Premium Operations-Room*
(`docs/UI/activity-room-visual-design-spec.md`, "the spec") onto the existing
component tree and decomposes the redesign into **fourteen independently
verifiable slices** (AR-01..AR-14).

- **The spec is the contract.** Its section 5 color mapping, section 6
  breakpoints, and section 7 protected behaviors are authoritative. Where this
  plan proposes anything that conflicts with the spec, the spec wins.
- **The architecture plan is the context.** `docs/Architecture/Activity-Room-UI-UX-ARCHITECTURE-PLAN.md`
  describes the incremental composition and state-model refactor this redesign
  builds on. This slice plan supersedes its delivery phases with a
  wireframe-bound, slice-verified sequence.
- **The objective is unconditional.** The premium operations-room presentation
  is delivered without trading any of the twelve protected behaviors.

Each slice below declares **scope**, **files**, **protected behaviors**, and
**acceptance criteria**. Acceptance criteria are written so a verifier can
prove them (tests, screenshots, Playwright, or direct source inspection) — no
slice is "done" on prose intent alone.

## 2. VisualDesignSpec → component tree mapping

The target arrangement (spec section 2) is a command center: persistent command
bar on top, then a region set that re-arranges across viewports, canonically
`participant-rail | workflow-browser | stream-main` with a docked `inspector`
at ≥1440px.

### 2.1 Current tree (as built)

```
ActivityRoomPage  (apps/workspace/src/pages/activity/ActivityRoomPage.tsx)
├── header                eyebrow "Live operations" · h1 "Activity Room" ·
│                         scope label + record count · connection chip ·
│                         Visual Edit toggle · Pause/Resume · Clear ·
│                         Participants button (lg:hidden)        [→ command-bar]
├── stream.error banner   retry history                                  [→ command-bar]
├── control deck          ActivityScopeSelector · density toggle ·
│                         agent-filter label                              [→ command-bar / workflow-browser]
├── ExecutionPulse        stage lifecycle indicator                        [→ workflow-browser]
├── auxiliary banner      participants/live/context loading-stale-error    [→ model (AR-01)]
├── body  lg:flex-row
│   ├── aside             "Participants" + ActivitySidebar                [→ participant-rail]
│   │    └── ActivitySidebar
│   │         ├── summary row (active · waiting)
│   │         ├── participant buttons (one per thread) / AgentListItem
│   │         │    presence groups (active/waiting/idle/failed)
│   │         └── unreadByAgent badges
│   └── main  flex-1
│        ├── region label + buffered state                                [→ stream-main]
│        ├── ActivityStatePanel          effective state attention bar    [→ stream-main attention-bar]
│        ├── Live Now inline strip       per-thread narrative (may stack) [→ live-now]
│        ├── ActivityStream  role=log
│        │    ├── bounded window (RENDER_WINDOW=50) + load-older
│        │    ├── AggregatedToolRow | ActivityItem
│        │    │    ├── chat/event variants · preview ≤400 · Markdown
│        │    │    ├── MessageReceipts (addressed/observed/pending)
│        │    │    └── inspect · reference · correct actions
│        │    └── jump-to-latest FAB + record-count footer
│        └── ActivityComposer             target · effect · mention ·
│                                         reference · send · failed-retry  [→ composer]
├── participants bottom sheet  (lg:hidden)                                [→ participant-rail sheet]
├── ActivityDetailModal     centered VestaraModal (lazy hasDetails)       [→ inspector]
├── ActivityCorrectionDialog modal (append-only; stays modal)             [→ inspector launch]
└── VisualEditMode          VE-1/2/5/6 overlay                             [→ command-bar]
```

### 2.2 Region → slice ownership

| Spec region | Current home | New/target home | Primary slices |
|---|---|---|---|
| `command-bar` | `ActivityRoomPage` header + control deck | persistent masthead (consolidated) | AR-11, AR-13 |
| `participant-rail` | `aside` + `ActivitySidebar` + `AgentListItem` | 248px identity rail; drawer 768–1023; sheet <768 | AR-05, AR-11 |
| `workflow-browser` | *does not exist* (scope selector + ExecutionPulse scattered) | ~280px unit/scope/health column | AR-02, AR-03, AR-11 |
| `stream-main` | `main` (state panel + live strip + stream + composer) | attention-bar → live-now → stream → composer | AR-04, AR-06, AR-07, AR-11 |
| `live-now` | inline strip in `ActivityRoomPage` (stacks per thread) | 48–64px strip, one projection per agent | AR-06 |
| `inspector` | `ActivityDetailModal` (centered modal) | docked ≥1440 / right drawer / bottom sheet | AR-09 |
| `composer` | `ActivityComposer` | same surface, sticky at handheld, receipts split | AR-10 |

## 3. The fourteen slices

Execution order is topological; each slice builds on the data architecture
(AR-01) and leaves the room in a verifiable state. Slices are independent in
the sense that each has its own acceptance test, but AR-01 must land first.

---

### AR-01 — Workflow-scoped data architecture

**Scope.** Establish the page-level room model that every other slice reads:
a `useActivityRoomModel` composition hook around `useActivityStream` plus
explicit auxiliary fetch state. Make workflow-scoped data (participants, live
narrative, message receipts, effective state) a first-class, cancellable,
stateful source with `idle | loading | ready | stale | error`, reset-before-
replacement on scope change, visibility-aware polling, and scoped effective
state. Preserve the WebSocket/sequence/resync ownership inside
`useActivityStream` (architecture plan §5).

**Files.**
- New: `apps/workspace/src/hooks/useActivityRoomModel.ts`
- New (if tests require a seam): `apps/workspace/src/hooks/useActivityRoomModel.test.ts(x)`
- Edit: `apps/workspace/src/pages/activity/ActivityRoomPage.tsx` (consume the model; delete inline polling/state)
- Edit: `apps/workspace/src/pages/activity/activity-types.ts` (`AuxiliarySource` status union, `RoomModel` snapshot type)
- Edit: `apps/workspace/src/lib/activity.ts` (typed fetch helpers return the error string instead of hiding it; keep signature-compatible for existing tests)
- Edit: `apps/workspace/src/pages/activity/ActivityStatePanel.tsx` (use scoped state from the model, AR-04 restyles)
- Tests: `apps/workspace/__tests__/activity-hardening.test.tsx`, new `apps/workspace/__tests__/activity-room-model.test.tsx`

**Protected behaviors.** HISTORY-AUTHORITATIVE (dedupe by id, scope change
resets the window before replacement — never appends foreign scope),
STREAM-CONTROL, RESYNC, URL-SCOPE, STREAM-PERF-001 (no eager hydration).

**Acceptance criteria.**
- Scope change resets the record snapshot and the auxiliary sources before any
  new-scope data applies; superseded scoped responses are ignored (race guard).
- Each auxiliary source exposes `{ status, data, error, updatedAt }`; a failed
  refresh after a successful one surfaces `stale`, never silently stale data
  labeled current.
- Polling runs only while `document.visibilityState === 'visible'` and shares
  one cadence; manual retry exists at the failed region and room level.
- `useActivityStream` still owns socket lifecycle, sequence recovery, optimistic
  sends, and append-only identity (no duplication).
- Existing scope tests (`activity-scope.test.tsx`) and hardening tests pass
  unmodified in behavior (markup may change with AR-11).
- `pnpm --filter @vestara/workspace-ui test -- activity` passes.

---

### AR-02 — Workflow Browser (lightweight summaries only)

**Scope.** New `workflow-browser` region (~280px ±16px) as the navigation and
health plane: a **unit list** of active workflows/sessions (identity, latest
disposition, event count, last activity), the scope selector, and the compact
execution pulse folded in. It must render **lightweight summaries only — never
full activity per workflow**. Selecting a unit scopes the stream via the
existing URL-scope path.

**Files.**
- New: `apps/workspace/src/pages/activity/ActivityWorkflowBrowser.tsx`
- New: `apps/workspace/src/pages/activity/ActivityWorkflowBrowser.test.tsx`
- Edit: `apps/workspace/src/pages/activity/ActivityRoomPage.tsx` (render region; relocate scope selector + `ExecutionPulse` into it at ≥lg)
- Edit: `apps/workspace/src/pages/activity/ExecutionPulse.tsx` (adopt the browser's unit row or remain as the pulse strip inside it)
- Edit: `apps/workspace/src/pages/activity/ActivityScopeSelector.tsx` (reusable; rendered in command-bar and browser per spec)
- Edit: `apps/workspace/src/lib/activity.ts` (typed `fetchEffectiveState` reuse for unit dispositions)

**Protected behaviors.** URL-SCOPE (selection writes `workflowId`/`sessionId`
via `replaceState`), HISTORY-AUTHORITATIVE (derived unit state never persisted),
STREAM-PERF-001 (browser never fetches full activity per unit).

**Acceptance criteria.**
- Renders one row per active unit with latest disposition, event count, and
  relative last activity — **no activity records, previews, or raw content
  anywhere in the region**.
- Clicking a unit scopes the stream and the URL; the browser reflects the
  active scope (gold selection treatment).
- Unit data derives from effective-state units/participants/records; a unit
  with no data shows a clear empty state, never stale rows from another scope.
- Rendered at ~280px (within 264–296) at ≥768px; becomes a bottom sheet <768px
  (AR-11).
- `pnpm --filter @vestara/workspace-ui test -- ActivityWorkflowBrowser` passes.

---

### AR-03 — Selected workflow header + lifecycle

**Scope.** A compact header above the timeline for the **selected** workflow:
identity, lifecycle disposition (stage progression), acceptance status from the
participants projection (`acceptanceState.status`), and participant counts.
Shows loading/stale/error states; hides entirely when scope is global or the
workflow has no context (does not fabricate a header for "All activity").

**Files.**
- New: `apps/workspace/src/pages/activity/WorkflowContextHeader.tsx`
- New: `apps/workspace/src/pages/activity/WorkflowContextHeader.test.tsx`
- Edit: `apps/workspace/src/pages/activity/ActivityRoomPage.tsx` (mount under command-bar/above stream-main)
- Edit: `apps/workspace/src/hooks/useActivityRoomModel.ts` (expose participants + acceptance projection)

**Protected behaviors.** HISTORY-AUTHORITATIVE (header state is derived, never
persisted), STREAM-CONTROL (pause state stays legible), URL-SCOPE.

**Acceptance criteria.**
- With a scoped workflow: shows name/id, lifecycle disposition, acceptance
  status (`satisfied`/`not-satisfied`/`conditional`/`indeterminate`/`unset`),
  and active/waiting counts — all readable at a glance.
- Global scope renders **no** workflow header (no placeholder).
- Loading → skeleton; stale/error → copy plus retry; never shows previous
  workflow identity as current.
- `pnpm --filter @vestara/workspace-ui test -- WorkflowContextHeader` passes.

---

### AR-04 — Health/attention strip

**Scope.** Evolve `ActivityStatePanel` into the spec's attention bar atop
stream-main: the positive state "Nothing needs your attention" is healthy (not
empty), attention/approval tones map to the authoritative semantic roles, and
the scoped label is honest. Add the participant summary row (active/waiting
counts) to the participant rail in AR-05 using the same counts source.

**Files.**
- Edit: `apps/workspace/src/pages/activity/ActivityStatePanel.tsx` (attention-bar restyle; tone mapping; retain expandable details)
- Edit: `apps/workspace/src/pages/activity/activity-formatters.ts` (severity/tone accent helpers if centralized)
- Edit: `apps/workspace/src/hooks/useActivityRoomModel.ts` (scoped effective state + loading/stale/error)
- Tests: `apps/workspace/__tests__/activity-room.test.tsx` (effective-state block), new attention-bar assertions

**Protected behaviors.** HISTORY-AUTHORITATIVE (derived state never persisted;
scoped state labeled scoped), ACCESSIBILITY (aria-live polite for the summary).

**Acceptance criteria.**
- Healthy, attention-required, approval-required, and unavailable tones render
  with the spec's green/amber/blue/red roles (verified via computed style).
- "Nothing needs your attention" renders as a positive state with zero
  `needsAttention` — never an empty-looking region.
- Scoped attention labels the scope; global labels global; a scoped response is
  never implied to be global.
- Loading, stale, and error have distinct copy and a retry path where recoverable.
- `pnpm --filter @vestara/workspace-ui test -- activity-room` passes.

---

### AR-05 — Participant projections (one current projection per agent)

**Scope.** The identity rail: **one current projection per agent, never stacked
messages/rows for the same agent across threads**. Presence groups
(active/waiting/idle/failed), execution-state coloring per the semantic mapping,
last activity, per-agent unread badges, selection filters the stream, and
selection/active-filter use the gold identity treatment. A real-participant
view when scoped, with the agent-catalog fallback only when unscoped/empty.

**Files.**
- Edit: `apps/workspace/src/pages/activity/ActivitySidebar.tsx` (dedupe by agentId → one projection; presence coloring; gold selected)
- Edit: `apps/workspace/src/pages/activity/AgentListItem.tsx` (presence colors, unread badge, 44px target)
- Edit: `apps/workspace/src/pages/activity/activity-formatters.ts` (presence → role color helper)
- Edit: `apps/workspace/src/pages/activity/ActivityRoomPage.tsx` (region dims; sheet stays reference pattern)
- Tests: `apps/workspace/__tests__/activity-room.test.tsx` (agent filter), new participant-projection assertions

**Protected behaviors.** RECEIPTS-WAKE (unread badges count pending receipts),
ACCESSIBILITY (44px targets, `aria-pressed` selection, focus-visible),
URL-SCOPE (agent filter remains local selection state; scope stays in URL).

**Acceptance criteria.**
- Exactly one row per agent id in every mode (multi-thread workflows collapse
  to the agent's current projection).
- Presence colors match the spec mapping (active → blue, waiting/queued →
  amber/dim, failed → red, completed → green).
- Unread badges appear only when pending receipts exist and clear on addressing.
- Selecting an agent filters the stream; selected row is gold
  (accent-border + accent-bg, `aria-pressed`).
- Rail renders at 230–260px at ≥1024px; drawer at 768–1023; bottom sheet <768.
- `pnpm --filter @vestara/workspace-ui test -- activity-room` passes.

---

### AR-06 — Live Now bar (48–64px, no raw transcripts)

**Scope.** The live narrative strip becomes a bounded 48–64px region: per-agent
projection (role, "Live" badge, trailing narrative text, pulsing green marker).
**One projection per agent**, no stacked messages. At <768px it collapses to a
single truncated line. The strip must never render raw transcripts — narrative
text only (the existing server-side `.slice(-160)` trailing window is the
narrative extraction; keep it, formalize it, and move it off the page).

**Files.**
- New: `apps/workspace/src/pages/activity/LiveNowStrip.tsx`
- New: `apps/workspace/src/pages/activity/LiveNowStrip.test.tsx`
- Edit: `apps/workspace/src/hooks/useActivityRoomModel.ts` (live narrative source with status)
- Edit: `apps/workspace/src/pages/activity/ActivityRoomPage.tsx` (remove inline strip)
- Edit (server, if narrative extraction should move): `apps/api/src/routes/workflow.ts` (`/live-stream` — keep shape; only content truncation policy)

**Protected behaviors.** STREAM-PERF-001 (narrative bounded; never full
content), RECEIPTS-WAKE (unrelated to receipts), ACCESSIBILITY (the region is a
status region, not the live log; the log remains `role="log"`).

**Acceptance criteria.**
- Strip height is 48–64px at ≥768px (measured via Playwright bounding box);
  at <768px it is one truncated line.
- Renders one row per agent with role, Live badge, narrative text, and pulsing
  green marker — no agent appears twice.
- No raw reasoning/transcript content in the strip; content is bounded trailing
  narrative text only.
- Handles empty, loading, and stale states with clear copy.
- `pnpm --filter @vestara/workspace-ui test -- LiveNowStrip` passes.

---

### AR-07 — Operational activity projection (never raw agent reasoning inline)

**Scope.** The timeline becomes an **operational projection**: human-readable
summaries first; organizational events carry effect/severity/category accents
per the authoritative mapping; tool runs aggregate; and raw agent
reasoning/model-response transcripts are never rendered inline — they resolve
into the inspector (AR-09) with the preview budget intact. Conversation lines
(human ↔ agent chat) remain readable inline per AAR-001E. Preserve density
modes and tool-run collapsing.

**Files.**
- Edit: `apps/workspace/src/pages/activity/ActivityStream.tsx` (projection rules; keep bounded window + load-older)
- Edit: `apps/workspace/src/pages/activity/ActivityItem.tsx` (operational presentation; inline reasoning gated by messageKind; keep `data-ve-*`)
- Edit: `apps/workspace/src/pages/activity/activity-formatters.ts` (category/effect/severity accents per AR-13 mapping; messageKind → operational projection helper)
- Tests: `apps/workspace/__tests__/activity-room.test.tsx`, `activity-messaging.test.tsx` (chat preview intact), new operational-projection assertions

**Protected behaviors.** STREAM-PERF-001 (preview ≤400, `hasDetails` lazy via
inspector — never fetch full content to inline it), AAR-001E (human messages
stay conversation events with optimistic/receipt rendering), DENSITY-MODES,
VISUAL-EDIT-SCOPE (`data-ve-target`/`data-ve-name`/`data-ve-instance` must
survive on stream/message/event surfaces).

**Acceptance criteria.**
- Raw model-reasoning rows (`messageKind: model-response` and similar) do not
  render their full transcript inline; they project operationally and link to
  the inspector.
- Human and agent chat messages render as readable conversation lines (existing
  messaging tests still pass).
- Tool-run aggregation, density filtering, and collapsing behave identically.
- A row is never taller than a bounded operational line; long content is
  previewed at ≤400 chars with "View full output →" resolving into the inspector.
- `pnpm --filter @vestara/workspace-ui test -- activity-messaging activity-room` passes.

---

### AR-08 — Filtering / date / sorting that change server query scope

**Scope.** Wire real server-scoped filtering into the model and URL: agent,
kind, severity, **date range**, and **sort** become query parameters on
`GET /api/activity-room` rather than client-side masking. The server's
`parseActivityQuery` gains `from`/`to` (ISO timestamps) and `sort`; existing
params stay. `sort` is explicit and its default preserves the current contract
(ascending sequence, with the client rendering the latest bounded window).
Filters live in the URL alongside `workflowId`/`sessionId` so scope is
shareable and reversible.

**Files.**
- Edit: `apps/api/src/routes/activity-room.ts` (`parseActivityQuery` + list handler: `from`, `to`, `sort`; validate and clamp)
- Edit: `packages/activity-room/src/store.ts` and `store-sqlite.ts` (timestamp range + sort pass-through or reject-with-error)
- Edit: `apps/workspace/src/lib/activity.ts` (`ActivityHistoryParams` + `fetchActivityHistory`)
- Edit: `apps/workspace/src/hooks/useActivityStream.ts` / `useActivityRoomModel.ts` (filter params in fetch + URL read/write)
- Edit: `apps/workspace/src/pages/activity/ActivityRoomPage.tsx` (filter/date/sort controls in command-bar/browser)
- Tests: `apps/api/__tests__/` activity-room query tests; `apps/workspace/__tests__/activity-scope.test.tsx` extended

**Protected behaviors.** URL-SCOPE (filters serialize into the URL; a filter
change resets the stream window exactly as scope change does), STREAM-CONTROL,
HISTORY-AUTHORITATIVE (dedupe/ordering by sequence preserved), DENSITY-MODES
(density stays a client presentation choice — it is not a server filter).

**Acceptance criteria.**
- Changing agent/kind/severity/date/sort issues a new `GET /api/activity-room`
  request carrying the params; the response replaces the window (no stale rows).
- Server validates `from ≤ to`; the default sort preserves the current
  ascending-sequence contract; limits stay clamped 1–1000.
- URL reflects every active filter; removing all filters restores the default
  latest-window query.
- Existing scope and hardening tests pass with the new params.
- `pnpm test -- apps/api` and `pnpm --filter @vestara/workspace-ui test -- activity-scope` pass.

---

### AR-09 — Event inspector (contextual, collapsible)

**Scope.** Evolve `ActivityDetailModal` into the **contextual inspector** with
three presentations: docked column at ≥1440px (300–340px), right drawer at
1024–1439px and 768–1023px, bottom sheet at <768px. Contextual to selection
(record, participant, or open effective-state item), collapsible/closeable
(Escape, scrim, close button), with lazy `hasDetails` hydration preserved. The
correction flow stays a modal dialog launched from the inspector. Focus trap,
initial focus, and return focus are required.

**Files.**
- New: `apps/workspace/src/pages/activity/ActivityInspector.tsx` (three presentations, shared content)
- Edit: `apps/workspace/src/pages/activity/ActivityDetailModal.tsx` (content extracted/adapted; modal path retained for correction launch)
- Edit: `apps/workspace/src/pages/activity/ActivityRoomPage.tsx` (host inspector; selection state)
- Edit: `apps/workspace/src/pages/activity/ActivityCorrectionDialog.tsx` (launched from inspector)
- Tests: `apps/workspace/__tests__/activity-detail-modal.test.tsx` (must keep passing: dialog semantics, evidence, raw payload, Escape), new inspector tests

**Protected behaviors.** STREAM-PERF-001 (lazy `GET /api/activity-room/:id` only
for `hasDetails`), APPEND-ONLY-CORRECTION (correction remains a modal; original
never mutated), ACCESSIBILITY (dialog semantics, focus trap/return, Escape,
44px targets), URL-SCOPE (selection is local state — no new route).

**Acceptance criteria.**
- At ≥1440px the inspector docks at the right edge (300–340px); at 1024–1439 and
  768–1023 it is a right drawer over an overlay; at <768 a bottom sheet.
- Selecting a record/participant/open item opens contextual content; closing
  restores the prior selection on reopen.
- Lazy hydration still fetches the full record only for `hasDetails`; failure
  falls back to the projected record.
- The existing detail-modal tests (dialog role, Evidence references, Raw
  payload, Escape) pass against the inspector's dialog presentation.
- `pnpm --filter @vestara/workspace-ui test -- activity-detail-modal` passes.

---

### AR-10 — Functional composer + message receipts (broadcast vs addressed)

**Scope.** The composer keeps all current semantics (target, effect, mention
listbox, reference chip, char count, send, failed-retry, 4000 cap,
control-plane interception) and becomes **sticky above the viewport bottom at
<768px**. The receipts line distinguishes **broadcast observed** from
**@mention addressed** explicitly (e.g. "2 agents observed (broadcast)" vs
"@developer — addressed"), with pending surfaced separately.

**Files.**
- Edit: `apps/workspace/src/pages/activity/ActivityComposer.tsx` (sticky wrapper; keep `data-ve-target="composer"`)
- Edit: `apps/workspace/src/pages/activity/ActivityItem.tsx` (`MessageReceipts` split: broadcast-observed vs @mention-addressed)
- Edit: `apps/workspace/src/pages/activity/ActivityRoomPage.tsx` (composer placement in stream column)
- Tests: `apps/workspace/__tests__/activity-messaging.test.tsx` extended (receipt copy), `activity-room.test.tsx`

**Protected behaviors.** AAR-001E (optimistic temp-id, ack replace, failed +
retry, target validation), RECEIPTS-WAKE (wake only when idle; never
interrupts; addressing follows @mentions), CONTROL-COMMANDS (`/resume`
`/verify` `/pause` `/stop` intercepted server-side), ACCESSIBILITY.

**Acceptance criteria.**
- Composer remains at the bottom of the stream column at ≥768px and is sticky
  above the viewport bottom at <768px (measured via Playwright at 375px).
- Receipts visually separate broadcast-observed from @mention-addressed; pending
  is distinct; addressed emphasizes the @mentioned agents.
- All messaging tests (optimistic, mention, reference, effect, failed retry,
  correction, control commands) pass unchanged.
- `pnpm --filter @vestara/workspace-ui test -- activity-messaging` passes.

---

### AR-11 — Responsive behavior

**Scope.** Implement the spec breakpoint matrix exactly. ≥1440px: three columns
+ docked inspector. 1024–1439px: three columns, inspector as right drawer.
768–1023px: two columns (`workflow-browser | stream-main`), participant rail and
inspector as drawers. <768px: single column, participant rail / workflow
browser / inspector as bottom sheets, composer sticky, Live Now collapsed. No
page-level horizontal scroll at any viewport. Drawers/sheets close on Escape,
scrim, and selection; reopening restores the prior selection.

**Files.**
- Edit: `apps/workspace/src/pages/activity/ActivityRoomPage.tsx` (responsive shell; replace `lg`-only logic)
- New: `apps/workspace/src/pages/activity/ResponsiveRegions.tsx` (or equivalent shared drawer/sheet/breakpoint boundary)
- Edit: `apps/workspace/src/styles/index.css` (only if a custom breakpoint/theme key is required; prefer Tailwind arbitrary `min-[1440px]:` variants)
- Edit: `apps/workspace/tests/visual/config.ts` (only if a 1440px boundary viewport is missing from the matrix)
- Visual: `apps/workspace/tests/visual/activity-room-layout.spec.ts` expanded to the four breakpoints

**Protected behaviors.** ACCESSIBILITY (Escape closes overlays; focus-visible
ring; focus returns), URL-SCOPE (scope state preserved across reflow),
STREAM-CONTROL, VISUAL-EDIT-SCOPE.

**Acceptance criteria.**
- Breakpoint table of spec section 6 matches measured layout at 1920, 1440,
  1366, 1024, 820, 768, 412, 375 (grid columns, drawer/sheet presence, sticky
  composer) — Playwright bounding-box assertions.
- No horizontal scroll at any viewport; interactive targets ≥44px.
- Escape/scrim/selection close drawers and sheets; reopen restores the prior
  selection; the command bar never scrolls away.
- `pnpm screenshots:ci` passes for the activity route across the viewport
  matrix (baselines updated intentionally in AR-13/AR-14).
- `pnpm --filter @vestara/workspace-ui test` passes.

---

### AR-12 — Performance verification

**Scope.** Prove the redesign preserved STREAM-PERF-001 and introduced no
unbounded rendering or request growth. Verify bounded windows (initial 100,
history 250, render 50, preview 400, lazy `hasDetails`), coalesced auxiliary
polling, bounded per-message receipt lookups, and no eager full-history
hydration anywhere in the new regions.

**Files.**
- Tests: `apps/workspace/__tests__/activity-hardening.test.tsx` extended (render-window bound, request coalescing)
- New: `apps/workspace/__tests__/activity-room-performance.test.tsx` (row-mount count ≤ window + olderLoaded; receipts fetched once per message; no repeated `/api/activity-room/:id` for non-hasDetails)
- Edit (only if evidence demands): `apps/workspace/src/hooks/useActivityRoomModel.ts`

**Protected behaviors.** STREAM-PERF-001, RESYNC, HISTORY-AUTHORITATIVE.

**Acceptance criteria.**
- Seeding ≥1000 records renders at most `RENDER_WINDOW + olderLoaded` mounted
  rows (asserted via DOM node count).
- The page issues at most one `/api/activity-room/:id` fetch per `hasDetails`
  selection and never for non-hasDetails records.
- Auxiliary polling is single-cadence and pauses when the document is hidden.
- No endpoint returns an unbounded record set from the new regions.
- `pnpm --filter @vestara/workspace-ui test -- activity-hardening activity-room-performance` passes.

---

### AR-13 — Visual convergence

**Scope.** Apply the spec's typography ramp, 4px spacing grid, surface rules,
focus ring, and the **authoritative semantic color mapping** (section 5):
introduce `--vestara-cyan` for tools/files; VERIFY → green; TOOL → cyan;
HUMAN → gold; PLAN → `--vestara-purple` (resolved, not the `--vestara-violet`
fallback); presence active → blue / completed → green; approval →
amber; severity roles unchanged. Nothing renders below 10px effective. Preserve
`data-ve-*` attributes so the Visual Edit contract survives.

**Files.**
- Edit: `apps/workspace/src/styles/index.css` (add `--vestara-cyan` + light-theme deep variant; token corrections)
- Edit: `apps/workspace/src/pages/activity/activity-formatters.ts` (accent helpers per mapping; resolve violet → `--vestara-purple`; fix missing `acceptance` severity case to match `packages/activity-room/src/severity.ts`)
- Edit: all `apps/workspace/src/pages/activity/*.tsx` (class/type ramp, surfaces, 10px floor)
- Visual: `apps/workspace/tests/visual/activity-room.spec.ts` + `activity-room-layout.spec.ts` updated; baselines regenerated deliberately with `pnpm screenshots:update` after review

**Protected behaviors.** DENSITY-MODES, VISUAL-EDIT-SCOPE (VE-6 DOM
verification and `data-ve-*` targets intact), ACCESSIBILITY (AA contrast for
status/attention tones, focus-visible), STREAM-PERF-001.

**Acceptance criteria.**
- Semantic mapping matches the spec section 5 table exactly, verified by
  computed-style assertions for category, effect, severity, presence, unread,
  and approval surfaces (dark and light themes).
- `--vestara-cyan` exists in both themes with readable deep variants.
- No effective font size below 10px on any rendered surface.
- `data-ve-target`/`data-ve-name`/`data-ve-instance` remain on stream, message,
  event, and composer surfaces; `visual-edit.spec.ts` passes.
- Contrast checks (axe) pass for status/attention tones.
- `pnpm screenshots:ci` passes with the approved baselines.
- `pnpm lint:check && pnpm build && pnpm test` passes.

---

### AR-14 — Final integrated verification

**Scope.** Full-gate verification of the integrated redesign: lint, ordered
build, unit suite, API tests, docs validation, Playwright visual matrix across
viewports × themes, accessibility checks, and a re-run of every protected
behavior. Produce the acceptance evidence named in section 4.

**Files.**
- No new implementation beyond fixes surfaced by verification.
- Evidence: test reports, `tests/visual/.artifacts/` outputs, `docs/generated/validation.json`

**Protected behaviors.** All twelve.

**Acceptance criteria.**
- `pnpm lint:check && pnpm build && pnpm test` green.
- `pnpm test -- apps/api` green (server query scope, AR-08).
- `pnpm docs:validate` reports no errors for the touched docs.
- Playwright visual suite (`pnpm screenshots:ci`) green across the viewport ×
  theme matrix with approved baselines; `visual-edit.spec.ts` green.
- A checkable matrix proving each of the twelve protected behaviors is intact
  (test references or verifier evidence per behavior).
- Spec section 8 acceptance criteria all satisfied: regions render at target
  dimensions, the authoritative color mapping is applied, responsive behavior
  matches the breakpoint table, and no protected behavior is weakened.

## 4. Acceptance boundary

### 4.1 Observable obligations (what must be provable after the work)

1. **Command-center layout.** At ≥1440px the room is a persistent command bar
   plus `participant-rail | workflow-browser | stream-main` and a docked
   inspector; every viewport follows the spec section 6 matrix exactly, with no
   horizontal scroll and a never-scrolling command bar.
2. **Workflow Browser** renders summaries only — never full activity — and
   scopes the stream on selection.
3. **Live Now** is a 48–64px strip, one projection per agent, narrative text
   only, collapsing at <768px.
4. **Participant rail** shows one current projection per agent with presence,
   unread, and gold selection; the stream filters on selection.
5. **Attention bar** shows scoped, honest health/attention with the positive
   empty state and the spec's tone roles.
6. **Semantic color mapping** (spec section 5) is applied across category,
   effect, severity, presence, unread, and approval surfaces in both themes,
   including the new cyan role.
7. **Inspector** is contextual and collapsible with dock/drawer/sheet
   presentations and preserved lazy hydration.
8. **Composer receipts** distinguish broadcast-observed from @mention-addressed;
   the composer is sticky at handheld.
9. **Server-scoped filters** (agent/kind/severity/date/sort) change the query
   scope and live in the URL.
10. **All twelve protected behaviors** pass their verification references.
11. **Gates green:** `pnpm lint:check`, `pnpm build`, `pnpm test`, `pnpm test --
    apps/api`, `pnpm docs:validate`, `pnpm screenshots:ci`, `visual-edit.spec.ts`.

### 4.2 Material uncertainties (decisions that must resolve during execution)

1. **AR-08 server contract.** Date range and sort require new
   `GET /api/activity-room` parameters and store-level range support. Default:
   additive params (`from`, `to`, `sort`), validated and clamped; unknown params
   remain ignored for backward compatibility. The existing query tests must be
   extended, and the server store (`store.ts`, `store-sqlite.ts`) must agree —
   divergence between the in-memory and sql.js stores is a known risk area.
2. **Breakpoint implementation.** Tailwind v4 has no `1440` default; the plan
   prefers arbitrary `min-[1440px]:` variants, but a CSS-first `@theme`
   breakpoint or explicit media queries in `index.css` may prove cleaner. This
   affects only AR-11 mechanics, not the observable matrix.
3. **`--vestara-cyan` scope.** The spec mandates the token be introduced. Open:
   static per-theme token vs. themeable `ACCENT_PALETTES` member. Default:
   static `#22D3EE`/deep `#0891B2` in `index.css` with light-theme deep variant
   (`#0891B2`), not themeable, matching the spec's hexes.
4. **"Raw agent reasoning" boundary (AR-07).** Which `messageKind`s count as raw
   reasoning (`model-response`, `invocation`?) vs. operational (`tool-call`,
   `tool-result`, status events). The invariant is: no transcript renders inline;
   conversation lines stay readable; density modes survive. The exact
   messageKind allowlist is an implementation decision with a default
   (`model-response` and `invocation` project operationally; `tool-call/result`
   aggregate; `message`/`steering`/`approval-*` stay lines).
5. **Live-now narrative extraction.** Whether the trailing-narrative truncation
   stays client-side (`text.slice(-160)`, current) or moves server-side into
   `/live-stream`. Default: keep client-side and formalize; server change only
   if "narrative vs transcript" proves undistinguishable client-side.
6. **Scope selector duplication.** The spec lists the scope selector in both the
   command bar and the workflow browser. Default: one shared component mounted in
   both regions at ≥1024px and in the browser sheet below, to avoid two
   independent scope controls on small screens.
7. **Existing test churn.** AR-09 (modal → inspector) and AR-11 (breakpoints)
   will change markup; the existing `activity-*` tests must be updated for new
   selectors **without weakening assertions**. This is expected churn, not
   behavior change; the verifier must confirm the behavioral intent (dialog
   semantics, Escape, focus) survives.
8. **Light theme.** Color roles must remain readable in light mode (deep
   variants per spec). The visual suite covers light; convergence (AR-13) must
   not regress light-theme contrast.

## 5. Verification commands (run from `vestara-ai-core/`)

```bash
pnpm lint:check
pnpm build
pnpm test                          # full Vitest suite (activity slices included)
pnpm test -- apps/api              # server query scope (AR-08)
pnpm docs:validate                 # governed docs (this plan + spec touched)
pnpm screenshots:ci                # visual regression matrix (baselines approved via pnpm screenshots:update)
pnpm --filter @vestara/workspace-ui test -- activity          # page-level slices
pnpm --filter @vestara/workspace-ui test -- activity-messaging # AAR-001E / receipts
pnpm --filter @vestara/workspace-ui test -- activity-scope     # URL scope / filters
pnpm --filter @vestara/workspace-ui test -- activity-hardening # bounded windows
pnpm --filter @vestara/workspace-ui test -- activity-detail-modal # inspector dialog contract
```

Per-slice tests are listed in each slice's acceptance criteria; AR-14 is the
integrated gate.

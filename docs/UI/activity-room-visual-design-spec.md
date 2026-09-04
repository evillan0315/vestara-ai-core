---
title: Activity Room Visual Design Spec — Premium Operations-Room
version: 1
status: proposed
owner: vestara-context
last-reviewed: 2026-08-13
next-review: 2026-10-13
---

# Activity Room — Visual Design Spec (Premium Operations-Room)

The Activity Room is the live operations room of the workspace: the human Director
monitors a durable, append-only activity projection, observes the executing
organization in real time, and steers it with conversational messages. This spec
redesigns the presentational layer toward a premium operations-room wireframe while
treating the room's behavioral invariants as immutable.

This document is **the contract** for the redesign. It defines:

1. Layout regions and their target dimensions.
2. The component inventory and the region each component belongs to.
3. Typography, spacing, and surface rules.
4. Semantic color roles (authoritative mapping).
5. Responsive behavior across breakpoints.
6. Protected behaviors that must never change.

It does **not** prescribe implementation details (no component architecture, no
migration steps, no code changes). It describes the *target visual state* only.

## 0. Scope and authority

**Applies to** (implementation target `vestara-ai-core`):

- `apps/workspace/src/pages/activity/*` (page, stream, composer, sidebar, items,
  state panel, scope selector, execution pulse, detail, correction, visual edit).
- `apps/workspace/src/hooks/useActivityStream.ts`, `apps/workspace/src/lib/activity.ts`.
- `apps/api/src/routes/activity-room.ts`, and the participants/live-stream routes in
  `apps/api/src/routes/workflow.ts`.
- `packages/activity-room/src/*` (contracts, severity, effective-state, stream).

**Authority:** where the target wireframe constraints (sections 2–5) conflict with
current styling, the spec wins. Section 6 (protected behaviors) is absolute — nothing
in this redesign may weaken or remove those behaviors. The redesign objective is
**unconditional**: acceptance is not conditional on any trade of behavior for visual
outcome.

## 1. Machine-readable data block

This block is the authoritative machine-readable form of the spec. The prose sections
that follow are the human-readable expansion. Key = `activity-room.visual.design.spec`.

```yaml
spec:
  id: activity-room-visual-design-spec
  version: 1
  surface: activity-room
  status: proposed
  objective: "Redesign the Activity Room toward the premium operations-room wireframe"
  acceptance: unconditional

viewports:
  - id: command-center        # >= 1440px
    min-width: 1440
    description: "Three-column primary grid with a docked inspector on the right"
    grid-columns: [participant-rail, workflow-browser, stream-main]
    docked: [inspector]
  - id: workspace             # 1024 - 1439px
    min-width: 1024
    max-width: 1439
    description: "Inspector collapses to a right-side drawer"
    grid-columns: [participant-rail, workflow-browser, stream-main]
    drawers: [inspector]
  - id: tablet                # 768 - 1023px
    min-width: 768
    max-width: 1023
    description: "Participants collapse to a drawer; two-column grid remains"
    grid-columns: [workflow-browser, stream-main]
    drawers: [inspector, participant-rail]
  - id: handheld              # < 768px
    max-width: 767
    description: "Single column; auxiliary regions become bottom sheets; composer is sticky"
    grid-columns: [stream-main]
    sheets: [participant-rail, workflow-browser, inspector]
    sticky: [composer]

regions:
  - id: command-bar
    role: persistent masthead and control deck
    placement: top, full width
    min-height: 48
    target-height: 52
    content: [ops-title, connection-chip, scope-selector, density-toggle, visual-edit-toggle, pause-resume, clear, drawer-launchers]
  - id: participant-rail
    role: identity rail; participants, presence, unread, stream filter
    placement: left column (grid col 1), full height
    target-width: 248
    min-width: 230
    max-width: 260
    content: [participant-summary, participant-list, agent-groups]
    viewport-behavior:
      command-center: column
      workspace: column
      tablet: drawer
      handheld: bottom sheet
  - id: workflow-browser
    role: workstream browser; active workflows/sessions, scope tree, unit state
    placement: center-left column (grid col 2), full height
    target-width: 280
    tolerance: "~280px (+/- 16px)"
    content: [unit-list, scope-selector, execution-pulse]
    viewport-behavior:
      command-center: column
      workspace: column
      tablet: column
      handheld: bottom sheet
  - id: stream-main
    role: primary activity timeline + attention + composer
    placement: center-right column (grid col 3), flex remainder
    min-width: 480
    content: [attention-bar, live-now, activity-stream, composer]
    viewport-behavior:
      command-center: column
      workspace: column
      tablet: column
      handheld: single column
  - id: live-now
    role: live narrative strip for the active workflow
    placement: top of stream-main, above activity-stream
    target-height: 56
    min-height: 48
    max-height: 64
    content: [live-now-items]
    viewport-behavior:
      command-center: strip
      workspace: strip
      tablet: strip
      handheld: collapsed strip (one-line, truncating)
  - id: inspector
    role: contextual inspector; selected record/participant/open-item detail
    placement: right edge, docked at command-center; drawer below
    target-width: 320
    min-width: 300
    max-width: 340
    content: [record-detail, participant-detail, effective-state-detail, receipts, evidence, correction-target]
    viewport-behavior:
      command-center: docked column
      workspace: right drawer (overlay, closeable)
      tablet: right drawer
      handheld: bottom sheet
  - id: composer
    role: conversational steering composer
    placement: bottom of stream-main; sticky at handheld
    target-height: "auto (2 rows, growing)"
    content: [composer-input, mention-popover, effect-select, target-line, reference-chip, send, failed-send-retry]
    viewport-behavior:
      command-center: docked
      workspace: docked
      tablet: docked
      handheld: sticky above viewport bottom

colors:
  roles:
    - role: identity
      token: gold
      hex: "#C9A84C"
      hex-light: "#FCF6BA"
      hex-dark: "#B38728"
      semantic: "the Director's identity, the room's identity, selection, focus, active filter"
      current-token: "--vestara-gold, --vestara-accent-*"
    - role: execution
      token: blue
      hex: "#60A5FA"
      hex-light: "#93C5FD"
      hex-dark: "#3B82F6"
      semantic: "workflow execution, running stages, executive actions (authorization, decision), info"
      current-token: "--vestara-blue"
    - role: tools-files
      token: cyan
      hex: "#22D3EE"
      hex-light: "#67E8F9"
      hex-dark: "#0891B2"
      semantic: "tool calls/results, file operations, evidence artifacts"
      current-token: "none (must be introduced)"
    - role: planning
      token: purple
      hex: "#A78BFA"
      hex-light: "#C4B5FD"
      hex-dark: "#8B5CF6"
      semantic: "plans, tasks in planning, findings, recommendations"
      current-token: "--vestara-purple (referenced as --vestara-violet in code)"
    - role: success
      token: green
      hex: "#4ADE80"
      hex-light: "#86EFAC"
      hex-dark: "#22C55E"
      semantic: "completion, passed tests, passed verification, evidence confirmed, closure, healthy state"
      current-token: "--vestara-green"
    - role: review-waiting
      token: amber
      hex: "#F59E0B"
      hex-light: "#FCD34D"
      hex-dark: "#D97706"
      semantic: "reviews, approval requests, holds, interventions, waiting/queued states, warnings, risk"
      current-token: "--vestara-amber"
    - role: failure
      token: red
      hex: "#F87171"
      hex-light: "#FCA5A5"
      hex-dark: "#EF4444"
      semantic: "failures, errors, failed tests/verification/tasks, blocked/cancelled, critical risk"
      current-token: "--vestara-red"

breakpoints:
  - id: bp-xl
    min-width: 1440
    layout: "three columns (participant-rail | workflow-browser | stream-main) + docked inspector"
  - id: bp-lg
    min-width: 1024
    max-width: 1439
    layout: "three columns; inspector as right drawer"
  - id: bp-md
    min-width: 768
    max-width: 1023
    layout: "two columns (workflow-browser | stream-main); inspector and participant-rail drawers"
  - id: bp-sm
    max-width: 767
    layout: "single column; sheets for participant-rail/workflow-browser/inspector; sticky composer"

typography:
  base-font: "var(--vestara-font-family)"
  ramp:
    - { name: page-title,   size: 18, weight: 700, usage: "page title 'Activity Room'" }
    - { name: section-title,size: 13, weight: 600, usage: "region headings" }
    - { name: item-title,   size: 12, weight: 600, usage: "participant names, item titles, unit names" }
    - { name: body,         size: 12, weight: 400, usage: "record content, narrative text" }
    - { name: meta,         size: 11, weight: 400, usage: "timestamps, context lines, counts" }
    - { name: micro,        size: 10, weight: 500, usage: "eyebrows, chips, badges, buttons" }
    - { name: label,        size: 10, weight: 600, uppercase: true, tracking: "0.14em", usage: "region/eyebrow labels" }
  scale: "px as authored; must remain legible at minimum 10px on all surfaces"
  code: "ui-monospace stack for ids, hashes, raw payloads"

spacing:
  grid: 4
  gaps:
    page-columns: [12, 16]
    stacked-regions: [8, 12]
  padding:
    region-panel: [8, 12]
    cell: [4, 8]
  touch-target-min: 44

surfaces:
  - id: page
    fill: "var(--color-zinc-950)"
    rule: "single canvas; no page chrome noise"
  - id: panel
    fill: "var(--vestara-accent-bg) or zinc-900"
    border: "1px var(--vestara-accent-border)"
    radius: "var(--vestara-radius-lg)"
  - id: panel-raised
    fill: "zinc-950/95 with shadow-2xl"
    border: "1px var(--vestara-accent-border)"
    usage: "drawers, sheets, popovers, dialogs"
  - id: hairline
    rule: "separators 1px, color var(--vestara-accent-border) or color-mix of zinc-700"
  - id: hover
    rule: "border → var(--vestara-accent-border-hover); tinted fill var(--vestara-accent-bg)"
  - id: selected
    rule: "gold identity treatment (accent border + accent-bg fill); aria-pressed state"
  - id: focus-ring
    rule: "2px outline var(--vestara-accent), offset 2px"
  - id: stream-message
    fill: "none; hover surface only; 2px left severity/effect accent for chat lines"

components:
  inventory:
    - { id: ActivityRoomPage,             file: "pages/activity/ActivityRoomPage.tsx",          region: command-bar,        role: "page scaffold and control deck wiring" }
    - { id: ActivityScopeSelector,        file: "pages/activity/ActivityScopeSelector.tsx",     region: [command-bar, workflow-browser], role: "scope to workflow/session/all" }
    - { id: ActivitySidebar,              file: "pages/activity/ActivitySidebar.tsx",           region: participant-rail,   role: "participant list, presence groups, unread badges, stream filter" }
    - { id: AgentListItem,                file: "pages/activity/AgentListItem.tsx",             region: participant-rail,   role: "agent row in presence groups" }
    - { id: ExecutionPulse,               file: "pages/activity/ExecutionPulse.tsx",            region: workflow-browser,   role: "compact stage lifecycle indicator" }
    - { id: ActivityStatePanel,           file: "pages/activity/ActivityStatePanel.tsx",        region: stream-main,        role: "attention bar + effective state" }
    - { id: ActivityStream,               file: "pages/activity/ActivityStream.tsx",            region: stream-main,        role: "bounded activity timeline" }
    - { id: AggregatedToolRow,            file: "pages/activity/ActivityStream.tsx",            region: stream-main,        role: "collapsed consecutive tool rows" }
    - { id: ActivityItem,                 file: "pages/activity/ActivityItem.tsx",              region: stream-main,        role: "activity row (chat/organizational event variants)" }
    - { id: MessageReceipts,              file: "pages/activity/ActivityItem.tsx",              region: stream-main,        role: "delivery/observation receipts on human messages" }
    - { id: ActivityComposer,             file: "pages/activity/ActivityComposer.tsx",          region: composer,           role: "conversational steering composer" }
    - { id: ActivityDetailModal,          file: "pages/activity/ActivityDetailModal.tsx",       region: inspector,          role: "record detail (lazy-hydrated); migrates to inspector" }
    - { id: ActivityCorrectionDialog,     file: "pages/activity/ActivityCorrectionDialog.tsx",  region: inspector,          role: "append-only correction; remains a modal dialog" }
    - { id: VisualEditMode,               file: "pages/activity/VisualEditMode.tsx",            region: command-bar,        role: "VE-1/2/5/6 visual manipulation surface" }
    - { id: LiveStreamItems,              file: "pages/activity/ActivityRoomPage.tsx",          region: live-now,           role: "per-participant live narrative strip" }
    - { id: ParticipantsSheet,            file: "pages/activity/ActivityRoomPage.tsx",          region: participant-rail,   role: "bottom sheet at <768px" }

protected-behaviors:
  - { id: STREAM-PERF-001, summary: "bounded windows; never full-history eager hydration", details: "initial limit 100; history window 250; render window 50; preview budget 400; full record lazy via GET /api/activity-room/:id (hasDetails)" }
  - { id: AAR-001E, summary: "human message is a conversation event, never an authorized action", details: "optimistic temp-id send, replace on ack, failed state + retry; 4000 char cap; target validation" }
  - { id: APPEND-ONLY-CORRECTION, summary: "corrections never mutate originals", details: "correctionOf links a new record; original preserved; effective attribution from latest correction" }
  - { id: HISTORY-AUTHORITATIVE, summary: "history authoritative; derived state never persisted", details: "effective state recomputed; scope resets stream; records deduplicated by id" }
  - { id: STREAM-CONTROL, summary: "pause/buffer/unread/jump semantics unchanged", details: "pause buffers live arrivals + unread at receipt; resume applies pending; jump-to-latest clears unread; at-bottom tracking" }
  - { id: URL-SCOPE, summary: "scope lives in URL", details: "workflowId/sessionId read and written via replaceState; scope change resets window" }
  - { id: RESYNC, summary: "reconnect/resync recovery preserved", details: "subscribe from last seen sequence; resync-required → history recovery from checkpoint then re-subscribe" }
  - { id: RECEIPTS-WAKE, summary: "@mention wake and delivery receipts preserved", details: "addressing follows @mentions; receipts pending/observed/addressed/responding; wake only when idle, never interrupts" }
  - { id: CONTROL-COMMANDS, summary: "control-plane commands never become messages", details: "/resume /verify /pause /stop intercepted server-side; resume/verify require workflowId" }
  - { id: VISUAL-EDIT-SCOPE, summary: "visual edit is instance-scope only", details: "refusal for non-instance targets; DOM-based verification (VE-6); durable visual-config persistence; undo" }
  - { id: DENSITY-MODES, summary: "summary/operational/raw density preserved", details: "density filtering and tool-run collapsing unchanged" }
  - { id: ACCESSIBILITY, summary: "log semantics, focus, touch, keyboard preserved", details: "role=log + aria-live; 44px touch targets; Escape closes dialogs/drawers; focus-visible ring" }

acceptance-criteria:
  - "Regions render at the target dimensions within the stated tolerances at each viewport"
  - "Semantic color roles are applied per the authoritative mapping"
  - "Responsive behavior matches the breakpoint table exactly"
  - "All protected behaviors remain intact; none weakened"
```

## 2. Layout regions

The room is a **command center**: a persistent command bar on top, and beneath it the
region set that re-arranges across viewports. The canonical arrangement is three grid
columns (`participant-rail | workflow-browser | stream-main`) with a docked
`inspector` on the right edge at ≥1440px.

### 2.1 Command bar (persistent masthead)

Full-width strip at the top. Contains the ops identity block (eyebrow "Live
operations", title "Activity Room", scope label + record count), the connection-state
chip, the scope selector, the density toggle (summary / operational / raw), the Visual
Edit toggle, Pause/Resume, Clear, and the launchers that open the inspectors/drawers
(participants, inspector). The command bar persists identically at every breakpoint;
it never scrolls away.

### 2.2 Participant rail (230–260px)

The **identity rail**: who is in the room. Hosts the participant summary row
(active/waiting counts) and the participant/agent list with presence groups (active,
waiting, idle, failed), execution state coloring, last-activity, and per-agent unread
human-message badges. Selecting a participant filters the stream; selection is the
gold identity treatment. Target width **248px**, bounds **230–260px**. Full height.

### 2.3 Workflow browser (~280px)

The **workstream browser**: what is running and where. Hosts the unit list (active
workflows/sessions with latest disposition, event counts, last activity), the scope
selector (workflow/session/all), and the compact execution pulse. It is the
navigation plane for scope and the at-a-glance health of every workstream. Target
width **~280px** (±16px). At <768px it becomes a bottom sheet.

### 2.4 Stream main (primary column)

The primary activity timeline. Column order top-to-bottom: **attention bar** (effective
state; "Nothing needs your attention" is a positive state, not empty) → **Live Now
strip** → **activity stream** → **composer**. Flexes to fill; minimum ~480px.

### 2.5 Live Now (48–64px strip)

A thin live-narrative strip atop the stream. Renders the per-participant live output
(role, "Live" badge, trailing narrative text) with a pulsing green marker. Target
height **56px**, bounds **48–64px**. At <768px it collapses to a single truncated line.

### 2.6 Inspector (300–340px)

The **contextual inspector**: the detail plane for whatever the Director selects — a
record, a participant, or an open effective-state item. Hosts record detail (with
lazy hydration for `hasDetails`), participant detail, effective-state detail,
corrections, related activity, receipts, and evidence references. Target width
**320px**, bounds **300–340px**. Docked column at ≥1440px; right-side drawer at
1024–1439px and 768–1023px; bottom sheet at <768px. The correction flow remains a
modal dialog and is launched from the inspector.

### 2.7 Composer

Docked at the bottom of the stream column at ≥768px; **sticky** above the viewport
bottom at <768px. Unchanged semantics: target line, effect selector, character
counter, @mention listbox, reference chip, send, failed-send retry.

## 3. Component inventory

| Component | File | Region | Role in the operations room |
|-----------|------|--------|------------------------------|
| `ActivityRoomPage` | `pages/activity/ActivityRoomPage.tsx` | command-bar | Scaffold; control deck wiring; region orchestration |
| `ActivityScopeSelector` | `pages/activity/ActivityScopeSelector.tsx` | command-bar / workflow-browser | Scope to workflow / session / all |
| `ActivitySidebar` | `pages/activity/ActivitySidebar.tsx` | participant-rail | Participants, presence, unread, filter |
| `AgentListItem` | `pages/activity/AgentListItem.tsx` | participant-rail | Presence-group agent rows |
| `ExecutionPulse` | `pages/activity/ExecutionPulse.tsx` | workflow-browser | Compact stage lifecycle indicator |
| `ActivityStatePanel` | `pages/activity/ActivityStatePanel.tsx` | stream-main | Attention bar + effective state |
| `ActivityStream` | `pages/activity/ActivityStream.tsx` | stream-main | Bounded timeline |
| `AggregatedToolRow` | `pages/activity/ActivityStream.tsx` | stream-main | Collapsed consecutive tool rows |
| `ActivityItem` | `pages/activity/ActivityItem.tsx` | stream-main | Activity row (chat / event variants) |
| `MessageReceipts` | `pages/activity/ActivityItem.tsx` | stream-main | Delivery/observation receipts |
| `ActivityComposer` | `pages/activity/ActivityComposer.tsx` | composer | Conversational steering |
| `ActivityDetailModal` | `pages/activity/ActivityDetailModal.tsx` | inspector | Record detail (migrates into the inspector region) |
| `ActivityCorrectionDialog` | `pages/activity/ActivityCorrectionDialog.tsx` | inspector | Append-only correction (stays a modal) |
| `VisualEditMode` | `pages/activity/VisualEditMode.tsx` | command-bar | VE-1/2/5/6 visual manipulation |
| Live stream items | `pages/activity/ActivityRoomPage.tsx` | live-now | Per-participant live narrative |
| Participants sheet | `pages/activity/ActivityRoomPage.tsx` | participant-rail | Bottom sheet at <768px |

## 4. Typography, spacing, surface rules

### 4.1 Typography

Ramp (px, as authored):

| Name | Size | Weight | Tracking | Usage |
|------|------|--------|----------|-------|
| page-title | 18 | 700 | – | "Activity Room" masthead |
| section-title | 13 | 600 | – | Region headings |
| item-title | 12 | 600 | – | Participant names, item titles, unit names |
| body | 12 | 400 | – | Record content, narrative |
| meta | 11 | 400 | – | Timestamps, context, counts |
| micro | 10 | 500 | – | Chips, badges, buttons, receipt lines |
| label | 10 | 600 | 0.14em uppercase | Eyebrows and region labels |

Base font is `var(--vestara-font-family)`; mono stack for ids, hashes, and raw
payloads. Nothing renders below 10px effective.

### 4.2 Spacing

4px grid. Page-column gaps 12px (tablet/handheld) to 16px (command-center); stacked
region gaps 8px to 12px. Panel padding 8–12px; cells 4–8px. Minimum interactive
target 44px.

### 4.3 Surfaces

- **page**: `--color-zinc-950` canvas.
- **panel**: `--vestara-accent-bg` or zinc-900 fill, `1px --vestara-accent-border`,
  `--vestara-radius-lg`.
- **panel-raised**: zinc-950/95 with `shadow-2xl` — drawers, sheets, popovers, dialogs.
- **hairline**: 1px separators in `--vestara-accent-border` (or a zinc-700 mix).
- **hover**: border → `--vestara-accent-border-hover`, tinted `--vestara-accent-bg`.
- **selected**: gold identity treatment; `aria-pressed` semantics.
- **focus-ring**: 2px outline `--vestara-accent`, offset 2px.
- **stream-message**: no container box; 2px left accent by severity/effect; hover
  surface only.

## 5. Semantic colors (authoritative)

| Role | Token | Dark base | Semantics | Current token |
|------|-------|-----------|-----------|---------------|
| identity | gold | `#C9A84C` | Director identity, room identity, selection, focus, active filter | `--vestara-gold`, `--vestara-accent-*` |
| execution | blue | `#60A5FA` | Workflow execution, running stages, authorization/decision, info | `--vestara-blue` |
| tools/files | cyan | `#22D3EE` | Tool calls/results, file operations, evidence artifacts | *none — must be introduced* |
| planning | purple | `#A78BFA` | Plans, planning tasks, findings, recommendations | `--vestara-purple` (code: `--vestara-violet` fallback) |
| success | green | `#4ADE80` | Completion, passed tests, passed verification, closure, healthy | `--vestara-green` |
| review/waiting | amber | `#F59E0B` | Reviews, approval requests, holds, interventions, waiting/queued, warnings, risk | `--vestara-amber` |
| failure | red | `#F87171` | Failures, errors, failed tests/verification/tasks, blocked/cancelled, critical | `--vestara-red` |

The redesign realigns existing presentational accents to these roles. The target
mapping of existing categories/effects/severities:

| Current presentational use | Current accent | Target role |
|----------------------------|----------------|-------------|
| WORKFLOW category | blue | execution (blue) |
| PLAN category | violet/purple | planning (purple) |
| TOOL category | text-dim | tools/files (cyan) |
| TEST category | green | success (green) |
| REVIEW category | amber | review/waiting (amber) |
| VERIFY category | blue | success (green) — verification is a success/failure signal |
| EVIDENCE category | green | success (green) |
| HUMAN category | accent-text | identity (gold) |
| AGENT category | text-2 | neutral (no role color) |
| effect authorization/decision | blue | execution (blue) |
| effect finding/recommendation | violet/purple | planning (purple) |
| effect hold/intervention | amber | review/waiting (amber) |
| effect closure | green | success (green) |
| severity info | blue | execution (blue) |
| severity success | green | success (green) |
| severity warning | amber | review/waiting (amber) |
| severity error | red | failure (red) |
| tool-call/tool-result messageKind | (implicit) | tools/files (cyan) |
| approval-request/approval-decision | amber | review/waiting (amber) |
| presence active | green | execution/success — active running work is blue, completed is green |
| presence waiting/queued | amber/text-dim | review/waiting (amber) |
| presence failed | red | failure (red) |
| unread badge | amber | review/waiting (amber) |

Light theme must keep each role readable: deep variants (blue `#2563EB`, cyan
`#0891B2`, purple `#7C3AED`, green `#16A34A`, amber `#B45309`, red `#DC2626`, gold
`#B8860B`) on light surfaces.

## 6. Responsive behavior

| Viewport | Columns | Inspectors/drawers | Sheets | Sticky |
|----------|---------|--------------------|--------|--------|
| ≥1440px | participant-rail \| workflow-browser \| stream-main | inspector **docked** (300–340px) | none | none |
| 1024–1439px | participant-rail \| workflow-browser \| stream-main | inspector **drawer** (right, overlay) | none | none |
| 768–1023px | workflow-browser \| stream-main | inspector **drawer**, participant-rail **drawer** | none | none |
| <768px | stream-main (single column) | none docked | participant-rail, workflow-browser, inspector as **bottom sheets** | **composer** |

The Live Now strip (48–64px) remains in stream-main at every breakpoint; at <768px it
collapses to a single truncated line. The command bar never collapses. Drawers and
sheets close on Escape, on scrim click, and on selection; reopening restores the prior
selection. The existing participant bottom sheet (`rounded-t-2xl`, `max-h-[78vh]`,
scrim overlay) is the reference pattern for all handheld sheets.

## 7. Protected behaviors (must never change)

1. **STREAM-PERF-001 — bounded windows.** Initial limit 100, history window 250,
   render window 50, preview budget 400. Full records load lazily via
   `GET /api/activity-room/:id` only when flagged `hasDetails`. Never hydrate
   full history eagerly.
2. **AAR-001E — a human message is a conversation event, never an authorized
   action.** Optimistic temp-id send; replaced by the server record on ack; failed
   state surfaces retry; 4000-char cap; target/reference/correction validation.
3. **Append-only corrections.** A correction links a new record via `correctionOf`;
   the original is never mutated. Effective attribution comes from the latest
   correction.
4. **History is authoritative; derived state is never persisted.** Effective state is
   recomputed. Records are deduplicated by id and ordered by sequence.
5. **Stream control semantics.** Pause buffers live arrivals and counts unread at
   receipt; resume applies pending and clears unread; jump-to-latest clears unread;
   at-bottom tracking drives unread accounting.
6. **Scope lives in the URL** (`workflowId`/`sessionId` via `replaceState`); a scope
   change resets the stream window.
7. **Reconnect/resync recovery.** Subscribe from the last seen sequence;
   `resync-required` recovers history from the checkpoint then re-subscribes.
8. **@mention wake + delivery receipts.** Addressing follows @mentions; receipts are
   pending/observed/addressed/responding; waking happens only when the chain is
   idle and never interrupts a running turn.
9. **Control-plane commands never become messages.** `/resume`, `/verify`, `/pause`,
   `/stop` are intercepted server-side; `/resume` and `/verify` require a
   workflowId.
10. **Visual edit is instance-scope only.** Non-instance targets are refused, never
    silently broadened; verification reads the DOM (VE-6); visual configuration is
    durable; undo is available.
11. **Density modes preserved.** summary / operational / raw, with consecutive-tool
    collapsing.
12. **Accessibility.** `role="log"` + `aria-live` for the stream; 44px touch
    targets; Escape closes dialogs/drawers/sheets; visible `focus-visible` ring.

## 8. Acceptance criteria

- Regions render within the stated target dimensions and tolerances at each viewport.
- The authoritative semantic color mapping (section 5) is applied consistently across
  categories, effects, severities, and presence states.
- Responsive behavior matches the breakpoint table (section 6) exactly.
- All twelve protected behaviors (section 7) remain intact; the redesign weakens none.
- The objective is unconditional: a premium operations-room presentation is delivered
  without trading any protected behavior.

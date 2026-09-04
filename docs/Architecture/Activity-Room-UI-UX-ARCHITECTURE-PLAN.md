---
title: Activity Room UI/UX Architecture Plan
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Activity Room UI/UX Architecture Plan

## 1. Purpose

Improve the Activity Room from a dense event console into a readable, responsive
control surface for answering three questions quickly:

1. What is happening now?
2. What needs my attention?
3. What evidence or context explains this activity?

The Activity Room remains a projection over durable activity history. It must not
become the authoritative owner of workflow state, agent state, or integrations.

## 2. Existing Surface

The current implementation is centered at
`apps/workspace/src/pages/activity/ActivityRoomPage.tsx` and already provides:

- Durable history through `GET /api/activity-room`.
- Live append-only updates through `/ws/activity`, with replay and sequence
  recovery.
- Workflow/session URL scope through `useActivityStream` and
  `ActivityScopeSelector`.
- Agent filtering through `ActivitySidebar`.
- Derived effective state through `GET /api/activity-room/state`.
- Workflow participants and live narrative through the workflow endpoints.
- Optimistic messaging, references, corrections, retry, and detail inspection.
- A bounded render window and visual regression coverage.

The architecture plan is therefore an incremental composition and state-model
refactor, not a new activity system.

The checkout also contains partial, uncommitted UX hardening in the activity
surface: scoped history is reset before replacement, effective state receives
the active scope, Markdown is rendered for chat content, mobile participant
controls use a bottom sheet, and item actions meet the larger touch-target
requirement. Those changes are treated as implementation in progress, not as
the completed architecture boundary; the phases below identify the remaining
work and the tests needed to make the behavior durable.

### Verified gaps in the current composition

- The baseline `useActivityStream.applyScope` behavior appended newly fetched
  scoped history to the existing in-memory records. The current worktree resets
  the snapshot and ignores superseded responses, but this needs dedicated tests
  and a model-level contract so future composition changes do not regress it.
- The baseline `ActivityStatePanel` requested global effective state. The current
  worktree passes scope parameters and labels the result as scoped, but loading,
  unavailable, stale, and retry states still need to move into the room model.
- Workflow participants and live narrative are polled directly by
  `ActivityRoomPage`, with no loading, stale, or error representation and no
  explicit reset before a workflow changes.
- `fetchActivityHistory` converts HTTP and network failures into an empty
  response. The room cannot currently distinguish an empty history from an
  unavailable history, which weakens recovery copy and testing.
- `VestaraModal` provides dialog semantics and Escape/backdrop close, but not a
  focus trap or return-focus contract. The baseline activity actions were 32px
  controls and some were revealed only on hover; the current worktree improves
  touch sizing and mobile visibility, but the inspector and item action surfaces
  still need a complete accessibility pass.
- The baseline page used a desktop-like rail that moved above the timeline on
  narrow screens. The current worktree starts the participant bottom-sheet
  direction; it still needs a reusable responsive boundary, focus management,
  and coverage across viewport sizes.

## 3. UX Requirements

### R1. Orient the user immediately

The first viewport must show the current scope, connection state, attention
summary, and the latest meaningful activity without requiring the user to inspect
raw sequence numbers or record IDs.

### R2. Separate monitoring from investigation

The default view should be a calm live timeline. Filters, effective-state details,
and technical payloads should be available without competing with the timeline.
Selecting an item should open an inspectable detail surface that preserves the
timeline position and supports related activity navigation.

### R3. Make scope explicit and reversible

Global, workflow, and session scope must be visually distinct. Changing scope must
not leave stale records or participant data visible as if they belong to the new
scope. The active scope must be represented in the URL and have a clear reset
action.

### R4. Make live behavior predictable

Live, connecting, reconnecting, offline, paused, and resynchronizing states need
distinct copy and actions. Pausing must explain what is buffered; resuming must
make the pending count visible. Scrolling away from the bottom must stop forced
autoscroll and expose a persistent jump-to-latest affordance.

### R5. Work on mobile and desktop

Desktop uses a rail-plus-timeline layout. Tablet and mobile use one primary
timeline with the participant/filter controls in a drawer or sheet. No page-level
horizontal scroll is permitted, and interactive targets must be at least 44px.

### R6. Preserve provenance without overwhelming the reader

Conversation-style messages and organizational events should remain visually
different. Human-readable summaries come first; actor, effect, scope, sequence,
evidence, and raw payload remain available in details.

### R7. Meet accessibility expectations

The room must support keyboard-only navigation, visible focus, semantic live-log
behavior, reduced motion, dialog focus management, and WCAG AA contrast for
status and attention tones.

## 4. Information Architecture

```text
ActivityRoomPage
└── ActivityRoomShell
    ├── RoomHeader
    │   ├── title + scope breadcrumb
    │   ├── attention summary
    │   └── connection / pause / view actions
    ├── RoomContextBar
    │   ├── active scope
    │   ├── agent filter
    │   └── clear filters
    ├── ActivityRoomBody
    │   ├── ParticipantRail (desktop) / ParticipantSheet (mobile)
    │   └── TimelinePane
    │       ├── EffectiveStateSummary
    │       ├── LiveSessionPanel (when applicable)
    │       ├── ActivityTimeline
    │       └── ActivityComposer
    └── ActivityInspector (dialog on desktop, bottom sheet on mobile)
```

The page owns orchestration only. Presentational components receive a view model
and callbacks; they should not fetch activity data or read URL state directly.

## 5. Component Boundaries

### `ActivityRoomPage`

- Calls the room view-model hook.
- Owns inspector, correction, and visual-edit overlays.
- Maps route-level errors to retryable page states.
- Does not contain layout-specific activity rendering.

### `useActivityRoomModel`

Create a page-level composition hook around the existing `useActivityStream` and
workflow data loading. It should expose:

- `scope`, `agentFilter`, and derived visible records.
- `connection`, `paused`, `unread`, `pending`, and `error` state.
- Participants, live session items, effective state, and their loading/error
  states.
- Actions for scope/filter changes, pause/resume, refresh/retry, send, inspect,
  reference, correction, and jump-to-latest.

`useActivityStream` remains responsible for socket lifecycle, sequence recovery,
optimistic sends, and append-only record identity. The composition hook should not
duplicate those responsibilities.

### `ActivityRoomShell`

Provides responsive layout, shared spacing, and the room landmark structure. It
must not encode record-kind presentation rules.

### `RoomHeader` and `RoomContextBar`

Move the current title, status pill, pause/resume, clear-local-view, scope, and
filter controls into two stable regions. Use a compact header on mobile and move
secondary actions into an overflow menu if they do not fit.

### `ParticipantRail` / `ParticipantSheet`

Reuse `ActivitySidebar` data and selection behavior, but provide a shared
participant view model. Show active, waiting, idle, and failed counts; distinguish
real workflow participants from the telemetry fallback; provide loading, empty,
and unavailable states.

### `ActivityTimeline`

Extract the current bounded-window, scroll anchoring, unread, older-records, and
empty-state behavior from `ActivityStream`. Keep `ActivityItem` as the record
renderer, but make action visibility keyboard- and touch-friendly rather than
hover-dependent.

### `EffectiveStateSummary` and `LiveSessionPanel`

Keep derived state and live narrative visually subordinate to the timeline. Both
must expose explicit loading, unavailable, and stale timestamps. Effective state
must display the active scope when it is scoped; it must not imply that a global
derived response describes a workflow unless that is true of the API response.

### `ActivityInspector`

Evolve `ActivityDetailModal` into an inspector contract with:

- Human-readable summary at the top.
- Related/correction links that can select another record.
- Collapsed technical details and raw payload.
- Focus trap, initial focus, return focus, and Escape/backdrop close behavior.
- Desktop dialog and mobile bottom-sheet presentation using the same content.

### `ActivityComposer`

Preserve current message, mention, effect, reference, optimistic-send, and retry
contracts. Improve target visibility, validation/error copy, mobile keyboard
layout, and disabled/read-only messaging for recorded workflow views.

## 6. State and Data Flow

```text
URL scope ───────────────┐
                         v
History API ───────> useActivityStream ─────> room model ───> timeline
WebSocket replay/live ──┘                         │
                                                 ├── participant API -> rail
                                                 ├── live-stream API -> live panel
                                                 └── effective-state API -> summary
```

### Scope semantics

- Keep `workflowId` and `sessionId` in the URL as the canonical navigation state.
- On scope change, replace the visible history snapshot before applying new live
  records, or maintain separate scoped snapshots. Do not append a newly fetched
  scope into the prior scope's display without a clear boundary.
- Reset or revalidate participant and live-stream requests whenever scope changes.
- Keep the WebSocket subscription global if that is required by the existing
  protocol; apply scope filtering in the model/timeline. If server-side scoped
  subscriptions are later added, treat them as an optimization, not a UI
  contract.

### Fetch states

Represent each auxiliary source as `{ status, data, error, updatedAt }` with
`idle | loading | ready | stale | error`. This avoids silently retaining data from
the previous workflow when a refresh fails.

### Refresh behavior

- Initial history loads once, then the socket owns incremental updates.
- Effective state and workflow metadata refresh on a shared, visibility-aware
  cadence; pause polling when the document is hidden.
- Manual retry is available at the failed region and at the room level.
- Show the last successful update time for non-stream data.

## 7. Visual System

- Continue using Vestara CSS variables and shared status semantics; do not add
  page-specific hardcoded colors.
- Increase body text and control density from the current 8–11px-heavy treatment
  for primary content; retain small uppercase labels only for metadata.
- Use one surface for the shell, one elevated surface for secondary panels, and
  one accent treatment for attention/action states.
- Keep chat messages asymmetric and organizational events centered, but add a
  compact event-type legend or accessible labels so shape/color are not the only
  distinction.
- Respect `prefers-reduced-motion` for pulse, transitions, and live insertion.

## 8. Delivery Phases

### Phase 0: Baseline and contract tests

- Capture current desktop, tablet, mobile, dark, and light screenshots.
- Add tests for scope switching, stale-data prevention, reconnecting/offline,
  paused buffering, empty states, and failed auxiliary requests.
- Record accessibility findings before visual changes.

### Phase 1: View-model and state hardening

- Add `useActivityRoomModel` and explicit loading/error/stale state.
- Correct scope replacement and auxiliary-data cancellation.
- Preserve existing public API and activity projection contracts.

### Phase 2: Responsive shell

- Extract header/context/body components.
- Implement desktop rail and mobile participant/filter sheet.
- Make the composer and timeline usable at narrow widths.

### Phase 3: Investigation workflow

- Implement the inspector focus contract and related-record navigation.
- Improve effective-state and live-session summaries with timestamps and scope.
- Add persistent filter and jump-to-latest affordances.

### Phase 4: Accessibility and visual quality gate

- Add axe assertions for key room states.
- Test keyboard navigation, focus return, reduced motion, and 44px targets.
- Expand Playwright coverage across viewport and theme matrix, then update
  baselines only after review.

## 9. Acceptance Criteria

- A user can identify active scope, connection state, and attention count from the
  first viewport.
- Switching workflow/session scope never displays records, participants, or live
  narrative from the previous scope as current data.
- New activity does not move the viewport when the user is reading older records;
  unread count and jump-to-latest remain available.
- The room is usable without horizontal scroll at mobile, tablet, and desktop
  viewports.
- Loading, empty, offline, reconnecting, stale, and error states each have clear
  copy and a recovery path where recovery is possible.
- Activity details are keyboard accessible, trap focus correctly, and return focus
  to the invoking control.
- Existing append-only provenance, optimistic messaging, retry, correction, and
  sequence recovery behavior remains intact.
- Vitest, workspace build, lint, Playwright visual tests, and the accessibility
  checks pass before release.

## 10. Risks and Decisions

| Risk | Mitigation |
| --- | --- |
| Scope refactor changes live-stream behavior | Keep socket lifecycle in `useActivityStream`; add model tests around replacement and deduplication. |
| More responsive states increase visual permutations | Use a fixed state matrix: global/scoped x loading/live/offline/empty x mobile/desktop. |
| Inspector becomes a second navigation system | Keep record selection local and use explicit related-record callbacks; do not add a new route until deep linking is required. |
| Polling creates unnecessary traffic | Refresh only when visible, share one cadence, and show stale data instead of hiding it. |
| Existing visual-edit overrides conflict with new layout | Preserve semantic `data-ve-*` targets and apply overrides at component boundaries. |

### Open decisions before implementation

1. Should the default room be global activity or the most recent workflow?
2. Is the light theme a release requirement for this improvement?
3. Should mobile participant controls use a drawer or a bottom sheet according to
   the established workspace navigation pattern?
4. Is deep-linking directly to an activity record required, or is local inspector
   selection sufficient for the first release?

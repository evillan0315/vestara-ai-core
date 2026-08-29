---
title: Vestara TUI Implementation Plan
version: 1
status: proposed
owner: vestara
last-reviewed: 2026-08-04
next-review: 2026-09-04
---

# Vestara TUI Implementation Plan

## Purpose

This is the executable implementation plan for PCS-TUI-004. It converts the
approved UX, visual, component, and state architecture into dependency-aware
engineering work.

Approved inputs:

- `docs/TUI-UX-SPECIFICATION.md`;
- `docs/TUI-VISUAL-SPECIFICATION.md`;
- `docs/TUI-COMPONENT-ARCHITECTURE.md`;
- `docs/TUI-STATE-ARCHITECTURE.md`.

No UX, visual language, component hierarchy, or state architecture decisions
are made here. Where the current implementation conflicts with an approved
artifact, this plan defines the migration path and compatibility boundary.

## Cross-document decisions

The four approved artifacts consistently establish these decisions:

1. The TUI is a calm, keyboard-first terminal counterpart of the Workspace.
2. The shell is two-column: main workspace left, contextual sidebar right.
3. Composer and status strip remain fixed at the bottom.
4. `Ctrl+P` opens a reusable command palette modal.
5. `Ctrl+R` opens a reusable runtime configuration modal.
6. OpenTUI remains behind `@vestara/tui-renderer`.
7. Visual tokens come from `@vestara/design-system`; gold is restrained identity emphasis.
8. Components consume projections and view models, not controllers or transports.
9. Modal and focus state are globally coordinated; view filters, selection, scroll,
   drafts, and expansion state remain local.
10. Runtime, conversation, execution, workflow, provider, and connection state
    preserve service ownership and reject stale events before rendering.
11. The normal UI renders interpreted outcomes and evidence, not raw DSML or
    anonymous tool lifecycle labels.
12. Existing Workspace services, Event Bus, Marketplace, provider registry,
    configuration system, telemetry, and renderer abstraction remain intact.

## Resolved planning inconsistencies

### Current navigation is incomplete

The current implementation exposes Chat, Sessions, Plans, Graph, Execution,
Workflow, and Logs. The approved UX also requires Artifacts and Settings.

Plan: extend the navigation/view registry and command palette with Artifacts and
Settings. Do not remove existing destinations or rename their domain meanings.

### Current runtime configuration is absent

The current tree contains routing commands and credential methods in the
controller but no approved `Ctrl+R` modal implementation.

Plan: preserve controller/service behavior and add the modal/form adapter above
it. The modal owns drafts; the routing/provider services own persistence.

### Current command palette is not a modal system

The current palette is a direct overlay with local input handling.

Plan: migrate its result/query behavior into the approved reusable modal host,
focus scope, search box, grouped results, and footer contracts.

### Current stream events are insufficient for stale-event safety

Current conversation events carry an assistant ID but do not consistently expose
conversation ID, request ID, execution ID, or sequence to the TUI projection.

Plan: add an adapter boundary for execution identity and ordering. Do not make
components infer freshness from timestamps or assistant IDs.

### Current TUI files are not yet in the approved folder architecture

The current tree has `app.tsx`, `components/*`, `hooks/*`, `controller.ts`, and
`types.ts`, while the approved architecture defines shell, modal, sidebar,
view, shared, projection, and service boundaries.

Plan: migrate incrementally with compatibility exports and preserve the TUI
launch contract at every phase.

## Implementation status (2026-08-04)

The first UI/UX milestone is substantially implemented in the working tree:

- **Two-column shell**: header, main workspace, contextual sidebar, fixed
  bottom composer/status, and connection banner.
- **Contextual sidebar**: Session, Context, Agent, Model, Files, Tools, and
  Quick Actions cards derived from live routing/telemetry/workspace data.
- **Navigation**: all nine destinations (Chat, Sessions, Plans, Graph,
  Execution, Workflow, Logs, Artifacts, Settings) via keyboard digits 1–9 and
  Tab.
- **Reusable modal framework**: `ModalProvider`, `ModalLayer`, `ModalFrame`
  (viewport-aware), `ModalHost`, and `FocusScope`-style keyboard ownership.
- **Command Palette** (Ctrl+P) and **Runtime Configuration** (Ctrl+R) built on
  the modal framework; runtime config wires provider/model/API-key save to the
  existing controller routing + credential services.
- **Keyboard routing**: single centralized router with modal > input > view >
  global priority (`useKeyboardRouter`), replacing three competing handlers.
- **Connection state machine**: connecting / connected / disconnected / degraded
  / error with a presentation model and recoverable banner.
- **Stale-event protection**: execution-identity stream gate rejects stale,
  cancelled, and out-of-order stream events.
- **Execution outcome projection**: chat renders interpreted conclusion,
  observations, evidence, unresolved, and next-action sections on completion.
- **Responsive layout**: breakpoint-based shell + viewport-clamped modal bounds.
- **Shared primitives**: Card, Section, Badge, Chip, Divider, Input, Button,
  List, Table, EmptyState, LoadingIndicator, ProgressIndicator, StatusMessage.

Not yet implemented: centralized focus-scope registration beyond keyboard
ownership, full per-view projection adapters for Execution/Workflow/Verification,
and final visual/PTY verification matrix across all color modes.

# 1. Current-State Inventory

| Area | Current implementation | Classification | Reason |
|---|---|---|---|
| Entry/runtime bootstrap | `packages/tui/src/index.tsx`, `root.tsx` | Preserve | Owns isolated Bun/OpenTUI launch and teardown |
| Renderer boundary | `packages/tui-renderer/src/*` | Preserve/extend | Existing OpenTUI isolation is an approved platform boundary |
| Design tokens | `packages/design-system/src/index.ts` | Preserve/extend | Existing semantic palettes and navigation metadata are authoritative |
| Shell | `packages/tui/src/app.tsx` | Refactor/replace incrementally | Current file owns layout, subscriptions, keyboard handling, and view routing together |
| Header | Inline in `app.tsx` | Extract | Preserve content; move to approved `Header` contract |
| Navigation | `components/navigation.tsx`, `TUI_NAVIGATION` | Extend/refactor | Preserve existing views; add Artifacts and Settings; move state to NavigationProvider |
| Main view routing | Conditional branches in `app.tsx` | Refactor | Replace inline branching with view registry and `MainWorkspace` |
| Chat | `components/chat.tsx`, `hooks/use-chat.ts` | Refactor/extend | Preserve conversation behavior; add projection, execution identity, outcome, evidence, stale-event rejection |
| Composer | Inline in `ChatView` | Replace with approved `BottomComposer` | Must be fixed at shell bottom and separated from Chat view |
| Status | `components/status-bar.tsx` | Refactor/extend | Preserve status data; add provider/model/context/outcome semantics |
| Sidebar | No approved contextual sidebar currently | Create | Required by UX and visual specifications |
| Sidebar cards | None | Create | Required reusable contextual cards |
| Command palette | `components/command-palette.tsx`, local `paletteOpen` state | Replace incrementally | Preserve command sources; move to ModalProvider and focus trap |
| Runtime configuration | Routing methods in `controller.ts`; no modal | Create | Add provider/model/API-key draft form over existing services |
| Modal infrastructure | None | Create | Required for current and future dialogs |
| Focus management | Renderer keyboard hooks only | Create | Need scope registration, trapping, restoration, disabled traversal |
| Keyboard routing | `useKeyboard` in `app.tsx` and `chat.tsx` | Replace | Current global and chat handlers can conflict and duplicate events |
| Runtime projection | Controller events and local shell state | Refactor | Preserve service source; centralize derived runtime view models |
| Conversation projection | `use-chat.ts` + controller stream | Refactor/extend | Preserve message accumulation; add request/execution/sequence identity |
| Workflow/execution | Controller polling/push plus basic view placeholders | Extend | Preserve existing projections; expose them through feature view adapters |
| Logs | `components/logs.tsx` | Refactor | Preserve bounded data; add structured outcome/evidence and local filters |
| Sessions | `components/sessions.tsx` | Refactor | Preserve summaries; add selection/focus/scroll behavior |
| Plans/Graph | `ListView` placeholders | Replace incrementally | Preserve data source; implement approved feature views and view models |
| Artifacts | No current view branch | Create | Use existing evidence/artifact services through projection adapter |
| Settings | No current view branch | Create | Use existing configuration service; local draft only |
| Controller | `packages/tui/src/controller.ts` | Preserve/refactor boundary | Keep HTTP/WS and existing command integrations; remove rendering responsibilities |
| Normalization | `normalize.ts` | Preserve/extend | Keep protocol scrubbing at adapter boundary; add structured event projection |
| Extensions | `extensions.ts` | Preserve/extend | Keep descriptor-only Marketplace contribution boundary |
| Theme helper | `theme.ts` with local VDS colors | Refactor/remove after migration | Replace local color metadata with design-system semantic tokens |
| Package tests | Vitest pure tests and Bun renderer smoke test | Extend | Preserve existing tests; add state, focus, modal, resize, and PTY seams |
| Obsolete Ink paths | Deleted Ink components and old renderer imports | Remove | Do not reintroduce parallel renderer or component trees |

# 2. PCS-TUI-004 Scope

## Included

- Two-column responsive shell.
- Main workspace left and contextual sidebar right.
- Fixed bottom composer and status strip.
- Header extraction.
- Navigation provider and complete view registry.
- Contextual sidebar and reusable information cards.
- Reusable modal provider, modal layer, modal frame, focus scopes, and footer.
- `Ctrl+P` command palette migration.
- `Ctrl+R` runtime configuration modal.
- Keyboard routing and priority/conflict handling.
- Focus trapping, traversal, disabled controls, and restoration.
- Terminal resize and viewport retention.
- Design-system token integration and fallback behavior.
- Projection boundaries for runtime, conversation, execution, workflow,
  verification, files, Marketplace, and configuration events.
- Stale-event protection and ordered stream application.
- Empty, loading, offline, degraded, cancelled, completed, and error states.
- Accessibility behavior defined by the approved specifications.
- Visual and behavioral verification at required terminal sizes and color modes.

## Explicitly out of scope

- Redesigning the approved UX or visual system.
- Replacing OpenTUI or changing the renderer abstraction.
- Replacing the Event Bus, runtime lifecycle, Marketplace, provider registry,
  configuration system, or workspace services.
- Building a second API client or a second provider/model registry.
- Native package installation or lifecycle; owned by PCS-PLATFORM-001/PCS-TUI-003.
- Major conversation execution coordinator implementation beyond the TUI
  projection/identity/stale-event boundary. Runtime cancellation propagation
  belongs to the conversation/execution platform milestone.
- New domain capabilities for Graph, Plans, Workflow, Artifacts, or Verification.
- Workspace web UI component reuse beyond shared semantic tokens and contracts.
- Marketplace executable packaging changes.

# 3. Dependency Graph

```text
Approved UX + visual + component + state specifications
                          ↓
Phase 0: repository inventory and baseline capture
                          ↓
Design-system token audit and renderer capability audit
                          ↓
Shared layout primitives + projection contracts
              ┌───────────┴───────────┐
              ↓                       ↓
Modal/focus primitives        Projection/state adapters
              ↓                       ↓
        Application shell ←───────────┘
              ↓
      Sidebar + composer + status
              ↓
       Command Palette
              ↓
   Runtime Configuration modal
              ↓
 Keyboard/focus integration hardening
              ↓
 Responsive terminal behavior
              ↓
 Error/offline/accessibility states
              ↓
 Visual, behavioral, PTY, and performance verification
```

## Sequential dependencies

- Modal consumers depend on ModalProvider, ModalFrame, and FocusScope.
- Sidebar cards depend on projection/view-model contracts.
- Runtime Configuration depends on routing/provider/credential action contracts.
- Focus integration depends on the final component registration points.
- Responsive verification depends on shell geometry and modal bounds.
- Final visual verification depends on all visual states being available.

## Parallel work

After Phase 0 and token audit:

- Shared primitives and projection adapters may proceed in parallel.
- Modal infrastructure and sidebar card primitives may proceed in parallel.
- Feature view adapters may proceed in parallel with shell extraction if they
  preserve the existing view interface.
- Command Palette content projection and Runtime Configuration data adapters may
  proceed in parallel after the modal contract exists.
- Test fixtures, evidence capture, and PTY harness preparation may proceed in parallel.

# 4. Implementation Phases

## Phase 0 — Repository Inventory and Baseline Capture

### Objective

Capture current behavior and establish migration boundaries before changing the
render tree.

### Prerequisites

- Approved artifacts available.
- Current build and test environment available.

### Files likely created

- `packages/tui/test/fixtures/*` for stable event and view-model fixtures.
- `docs/evidence/tui-004/baseline/*` or the repository's approved evidence location.

### Files likely modified

- None required for the first commit; only test fixtures/evidence may be added.

### Components/state involved

- Existing shell, ChatView, navigation, command palette, controller, use-chat.

### Service integrations

- Existing API/WS controller.
- Existing routing/provider endpoints.
- Existing workflow/execution endpoints.

### Tests

- Existing full suite.
- Current Bun renderer smoke tests.
- Manual/PTY capture of current launch and teardown.

### Evidence

- Baseline screenshots or PTY recordings at 80×24, 100×30, 120×40, 160×50.
- Existing navigation list and shortcut snapshot.
- Existing command palette behavior record.
- Existing routing/provider behavior record.
- Current test/build/lint/docs results.

### Rollback/recovery

- No production code changes.
- Baseline artifacts remain available for comparison.

### Completion criteria

- Current behavior is recorded.
- Every current component is classified as preserve/extend/refactor/replace/remove.
- No implementation task starts from an unverified assumption.

## Phase 1 — Shared Layout and Modal Primitives

### Objective

Create the minimum visual and interaction primitives required by the approved
shell and modal architecture without mounting them into the full application yet.

### Prerequisites

- Phase 0 complete.
- `@vestara/tui-renderer` and `@vestara/design-system` audited.

### Files likely created

- `packages/tui/src/shared/Card.tsx`
- `Section.tsx`, `Badge.tsx`, `Chip.tsx`, `Divider.tsx`
- `Input.tsx`, `Button.tsx`, `List.tsx`, `Table.tsx`
- `EmptyState.tsx`, `LoadingIndicator.tsx`, `ProgressIndicator.tsx`
- `EvidenceLink.tsx`, `FocusMarker.tsx`, `ShortcutLegend.tsx`
- `packages/tui/src/modals/ModalProvider.tsx`
- `ModalLayer.tsx`, `ModalFrame.tsx`, `ModalFooter.tsx`, `FocusScope.tsx`
- Primitive and modal test fixtures.

### Files likely modified

- `packages/tui/src/types.ts` for renderer-neutral contracts only.
- `packages/tui/src/hooks/index.ts` if approved hook exports need a local adapter.

### Components involved

- All shared primitives.
- Modal framework primitives.

### State involved

- Modal stack.
- Focus scopes.
- Terminal capabilities.
- Reduced-motion/fallback preferences.

### Service integrations

- None beyond renderer capabilities and design tokens.

### Tests

- Primitive state variants.
- Modal open/close/replace/stack behavior.
- Focus trap and restoration.
- Disabled control traversal.
- Reduced-motion transition behavior.

### Evidence

- Primitive state matrix.
- Modal stack trace.
- Focus transition trace.
- Screenshots of neutral, focused, selected, disabled, and error primitives.

### Rollback/recovery

- New primitives are not wired into the shell until they pass tests.
- Existing shell remains the active composition.

### Completion criteria

- Modal consumers can mount without adding modal lifecycle logic.
- Shared components use only design-system semantic tokens.
- Feature components can consume primitives without importing OpenTUI.

## Phase 2 — Two-Column Application Shell

### Objective

Extract the shell geometry while retaining existing feature views behind a
compatibility active-view slot.

### Prerequisites

- Phase 1 layout primitives.
- Baseline captures.

### Files likely created

- `packages/tui/src/app/application.tsx`
- `app/providers.tsx`, `app/state.ts`, `app/view-models.ts`
- `shell/TuiShell.tsx`, `shell/ShellBody.tsx`, `shell/BottomArea.tsx`
- `layout/Header.tsx`, `layout/MainWorkspace.tsx`, `layout/ResponsiveLayout.ts`
- `layout/ScrollRegion.tsx`

### Files likely modified

- `packages/tui/src/app.tsx` becomes a compatibility composition wrapper or is retired after all imports migrate.
- `packages/tui/src/index.tsx` mounts the new application root.

### Components involved

- `TuiApplication`, `TuiShell`, `Header`, `ShellBody`, `MainWorkspace`, `BottomArea`.

### State involved

- Workspace/session projection.
- Current view.
- Layout snapshot.
- Terminal capabilities.
- Modal layer placeholder.

### Service integrations

- Existing `TuiHostHandle.subscribe` through an application adapter.
- Existing controller events normalized into projections.

### Tests

- Shell composition.
- Fixed bottom-region geometry.
- Active-view slot preservation.
- Wide/medium/narrow layout calculations.

### Evidence

- Screenshots at all four required dimensions.
- Shell region measurement trace.
- Existing view render smoke test under the new shell.

### Rollback/recovery

- Keep the old `TuiShell` entry behind a temporary composition switch until
  the new shell renders every existing view.

### Completion criteria

- TUI launches with the new shell.
- Existing Chat, Sessions, Plans, Graph, Execution, Workflow, and Logs remain mountable.
- Composer/status placeholders remain fixed.
- No feature view imports OpenTUI directly.

## Phase 3 — Right Contextual Sidebar

### Objective

Add the contextual sidebar and card projections without duplicating domain state.

### Prerequisites

- Phase 2 shell.
- Projection contracts from the state architecture.

### Files likely created

- `sidebar/ContextSidebar.tsx`
- `SidebarSection.tsx`
- `SessionCard.tsx`, `ContextCard.tsx`, `FilesInContextCard.tsx`
- `AgentCard.tsx`, `RuntimeCard.tsx`, `ModelCard.tsx`
- `ToolCard.tsx`, `QuickActionCard.tsx`
- `projections/sidebar-projection.ts`

### Files likely modified

- `packages/tui/src/types.ts` for sidebar view models.
- `packages/tui/src/controller.ts` only where normalized events are missing for an existing projection; no new service client.

### Components involved

- Sidebar and all contextual cards.

### State involved

- Session, context usage, files, agent, runtime route, tool status, attention items.

### Service integrations

- Existing telemetry agents.
- Existing routing selection/catalog/providers.
- Existing sessions, graph/files, workflow/execution projections.

### Tests

- Each card's view-model states.
- Sidebar updates only affected card.
- Empty section omission.
- Attention indicator derivation.

### Evidence

- Sidebar snapshots with connected, active, degraded, offline, and empty states.
- Event-to-card update trace.

### Rollback/recovery

- Sidebar may be hidden behind the existing responsive fallback while projection bugs are corrected.

### Completion criteria

- Sidebar is contextual and secondary.
- No card fetches independently.
- No duplicate provider/model/session truth exists.

## Phase 4 — Fixed Composer and Status Strip

### Objective

Extract the composer from ChatView and make composer/status geometry permanent.

### Prerequisites

- Phase 2 shell.
- Conversation and runtime projections available.

### Files likely created

- `composer/BottomComposer.tsx`
- `composer/ComposerHint.tsx`
- `composer/composer-model.ts`
- `status/StatusStrip.tsx`
- `status/ConnectionStatus.tsx`
- `status/ExecutionStatus.tsx`
- `status/ShortcutLegend.tsx`

### Files likely modified

- `components/chat.tsx` to remove composer ownership and retain message/execution presentation.
- `hooks/use-chat.ts` only if submission state must move to the conversation coordinator adapter.

### Components involved

- BottomComposer, Input, StatusStrip, StatusChip/Badge.

### State involved

- Composer local input/cursor.
- Conversation lifecycle.
- Runtime route and connectivity.
- Execution lifecycle/outcome.

### Service integrations

- Existing conversation controller execution action.
- Existing runtime/provider/routing projections.

### Tests

- Composer editing and submission.
- Busy/cancel/offline/disabled states.
- Lifecycle versus outcome rendering.
- Composer remains visible while the main region scrolls.

### Evidence

- PTY input capture.
- Fixed-row measurements at short terminal heights.
- Status state matrix.

### Rollback/recovery

- Keep a temporary ChatView composer adapter until new composer submit/cancel behavior is equivalent.

### Completion criteria

- Composer is fixed and usable in all supported sizes.
- Status strip has one authoritative runtime/execution model.

## Phase 5 — Command Palette

### Objective

Migrate current palette behavior into the reusable modal framework.

### Prerequisites

- Phase 1 modal/focus primitives.
- Phase 2 shell.
- Command registry and navigation provider.

### Files likely created

- `command-palette/CommandPaletteModal.tsx`
- `SearchBox.tsx`, `RecentItems.tsx`, `ResultGroups.tsx`
- `SearchResult.tsx`, `PaletteFooter.tsx`
- `projections/palette-results.ts`

### Files likely modified

- `components/command-palette.tsx` becomes a compatibility export or is retired.
- `app.tsx`/new application root registers `Ctrl+P` through the command system.
- `extensions.ts` if contributed commands/views need palette descriptors.

### Components involved

- ModalFrame, FocusScope, CommandPaletteModal and child result components.

### State involved

- Modal stack.
- Palette query.
- Selected result.
- Recent items.
- Local result scroll.

### Service integrations

- `TuiCommandRegistry`.
- Navigation registry.
- Session, plan, file, artifact, and settings selectors.

### Tests

- Open/toggle/close.
- Query filtering and grouped results.
- Recent/suggested state.
- Keyboard selection and action dispatch.
- Focus restoration.

### Evidence

- PTY `Ctrl+P` recording.
- Screenshots with empty, recent, filtered, selected, and no-result states.

### Rollback/recovery

- Keep command registry entries stable while switching the renderer of the palette.

### Completion criteria

- `Ctrl+P` works from every non-modal state.
- No palette code directly calls the controller.

## Phase 6 — Runtime Configuration

### Objective

Implement the approved `Ctrl+R` modal using existing routing, provider, and
credential services.

### Prerequisites

- Phase 1 modal/focus primitives.
- Phase 3 RuntimeCard/ModelCard contracts.
- Existing routing and credential controller methods.

### Files likely created

- `runtime-config/RuntimeConfigurationModal.tsx`
- `RuntimeSettings.tsx`, `ProviderSelector.tsx`, `ModelSelector.tsx`
- `ApiKeyInput.tsx`
- `projections/runtime-config-model.ts`
- `services/runtime-actions.ts`

### Files likely modified

- Existing `controller.ts` only to expose typed action results or existing methods through an action adapter.
- `types.ts` for provider/model/API-key view models.

### Components involved

- ModalFrame, RuntimeSettings, ProviderSelector, ModelSelector, ApiKeyInput, ModalFooter.

### State involved

- Committed routing selection.
- Modal draft selection.
- Credential configured/validating/invalid state.
- Save validation and pending state.

### Service integrations

- Existing `/api/routing/catalog` and `/api/routing/selection`.
- Existing `/api/providers` and credential endpoint.
- Existing revision/optimistic-concurrency behavior.

### Tests

- Provider changes filter models.
- Missing credentials require key entry.
- Existing credentials skip unnecessary entry.
- Mask/reveal behavior.
- Save/cancel/error/revision conflict.
- Secret non-persistence and non-rendering.

### Evidence

- Redacted configuration snapshot.
- Provider/model change event trace.
- Screenshot of configured, unconfigured, invalid, and saved states.

### Rollback/recovery

- Draft cancellation leaves committed route untouched.
- Save failure restores the draft's previous field validity without changing committed state.

### Completion criteria

- `Ctrl+R` opens a reusable modal.
- Provider/model/API-key flow uses existing services and has no second routing source.

## Phase 7 — Keyboard, Focus, and Modal Integration

### Objective

Replace competing `useKeyboard` handlers with centralized priority routing and
focus scopes.

### Prerequisites

- Phases 1, 2, 5, and 6.

### Files likely created

- `app/keyboard-router.ts`
- `app/shortcut-registration.ts`
- `modals/focus-scope.ts` or the approved FocusScope implementation.
- `tests/fixtures/keyboard-harness.ts`.

### Files likely modified

- `app.tsx`/new application root.
- `components/chat.tsx` to remove global keyboard ownership.
- `components/command-palette.tsx` compatibility path.

### Components involved

- TuiApplication, ModalProvider, FocusScope, BottomComposer, Navigation, Lists, modals.

### State involved

- Active region, focus ring, modal stack, command enablement.

### Service integrations

- `TuiCommandRegistry` and renderer keyboard hooks only.

### Tests

- Priority ordering.
- Shortcut conflicts.
- Input ownership.
- Modal trapping and restoration.
- Ctrl+C cancellation priority.
- Disabled elements skipped.

### Evidence

- Focus-transition trace.
- Shortcut dispatch trace showing consumed scope.
- Modal stack/focus recording.

### Rollback/recovery

- Keep legacy key handling behind a temporary adapter until all global shortcuts are registered centrally.

### Completion criteria

- One keyboard routing path exists.
- No duplicate global and ChatView handlers remain.

## Phase 8 — Responsive Terminal Layouts

### Objective

Implement approved wide, medium, narrow, short, resize, and fallback behavior.

### Prerequisites

- Shell, sidebar, composer, status, modal, and focus integration.

### Files likely created

- `layout/responsive-layout.ts`
- `layout/fallback-policy.ts`
- `tests/fixtures/viewport-matrix.ts`.

### Files likely modified

- `TuiShell`, `ShellBody`, `ModalLayer`, `MainWorkspace`, `ContextSidebar`, `BottomArea`.

### Components involved

- All shell/layout components; modal and scroll regions.

### State involved

- Terminal dimensions/capabilities.
- Sidebar collapsed state as derived layout.
- Modal bounds.
- Scroll/focus retention.

### Service integrations

- `@vestara/tui-renderer` viewport/capability hooks.

### Tests

- 80×24, 100×30, 120×40, 160×50.
- Resize during chat, list, composer, and modal.
- Sidebar collapse and restoration.
- Unicode/ASCII capability changes.

### Evidence

- Screenshot matrix.
- Resize recording with focus and scroll IDs.

### Rollback/recovery

- Keep a deterministic responsive layout adapter; no feature component should calculate widths independently.

### Completion criteria

- Composer/status never clip.
- Modals remain usable.
- Focus and scroll retain identity across resize.

## Phase 9 — Error, Offline, Degraded, and Loading States

### Objective

Complete all approved state presentations without duplicating service state.

### Prerequisites

- Projection adapters and shell regions.

### Files likely created

- `views/state-placeholders.tsx` or feature-local state views.
- `projections/health-projection.ts`.
- `shared/StatusMessage.tsx`.

### Files likely modified

- Chat, sidebar cards, runtime modal, Logs, Execution, Workflow, Sessions, and shell status components.

### Components involved

- EmptyState, LoadingIndicator, StatusMessage, StatusChip, ExecutionSummary.

### State involved

- Loading, offline, degraded, error, cancelled, superseded, completed.

### Service integrations

- Existing connection, runtime, provider, execution, workflow, verification, and configuration adapters.

### Tests

- State matrix for every major region.
- Provider/network/stream failures.
- Recovery action outcomes.
- No false sent/complete/success claims.

### Evidence

- State screenshots and event traces.
- Redacted error/evidence examples.

### Rollback/recovery

- State renderers can fall back to neutral text-only messages without changing domain state.

### Completion criteria

- Every approved non-happy state is intentional, readable, and actionable.

## Phase 10 — Accessibility and Interaction Hardening

### Objective

Verify keyboard-first behavior, non-color state communication, fallback modes,
secret handling, and reduced motion.

### Prerequisites

- All interaction and state paths complete.

### Files likely created

- Accessibility and interaction test fixtures.
- Keyboard/Unicode/ANSI capability fixtures.

### Files likely modified

- Shared primitives and state renderers only where verification exposes a gap.

### Components involved

- All focusable controls, cards, modals, status components, and fallback components.

### State involved

- Focus, disabled, selected, degraded, error, masked secret, reduced motion.

### Service integrations

- Renderer capability state and configuration preferences.

### Tests

- Keyboard-only navigation.
- Focus restoration.
- No-color and ASCII/Unicode fallbacks.
- Reduced-motion behavior.
- Secret non-persistence.

### Evidence

- Accessibility review checklist.
- PTY recordings for keyboard-only paths.
- ANSI/Unicode screenshots.

### Rollback/recovery

- Accessibility fixes must remain within approved tokens and component contracts.

### Completion criteria

- The TUI remains understandable without color, mouse, Unicode, or animation.

## Phase 11 — Visual and Behavioral Verification

### Objective

Demonstrate that the implementation matches the approved UX, visual, component,
and state architecture.

### Prerequisites

- All previous phases complete.

### Files likely created

- Evidence bundle under the approved evidence location.
- Visual comparison report.

### Files likely modified

- None unless a verification finding requires a bounded fix.

### Components involved

- Complete application.

### State involved

- Full state and interaction matrix.

### Service integrations

- Live API/WS connection, routing/provider services, telemetry, workflow,
  execution, verification, configuration, and renderer lifecycle.

### Tests

- Full build and test suite.
- Bun renderer tests.
- PTY launch/resize/Ctrl+C/restore tests.
- Modal/focus/keyboard integration tests.
- Stale-event rejection.
- Provider configuration persistence.

### Evidence

- Screenshots at 80×24, 100×30, 120×40, 160×50.
- True color, ANSI-256, ANSI-16, monochrome.
- Unicode and ASCII.
- Runtime-event traces.
- Focus-transition traces.
- Provider-change and redacted config traces.
- Stale-event rejection trace.
- Build/test/lint/docs results.

### Rollback/recovery

- Any failed gate returns to the last phase commit; no final rollout occurs.

### Completion criteria

- All release gates pass and evidence supports every claim.

# 5. File-Level Change Plan

## Proposed tree

```text
packages/tui/src/
├── app/
│   ├── application.tsx                 create
│   ├── providers.tsx                   create
│   ├── state.ts                         create
│   ├── view-models.ts                   create
│   ├── keyboard-router.ts               create
│   └── shortcut-registration.ts         create
├── shell/
│   ├── TuiShell.tsx                     create/refactor from app.tsx
│   ├── ShellBody.tsx                    create
│   ├── BottomArea.tsx                   create
│   └── layout-model.ts                  create
├── layout/
│   ├── Header.tsx                       extract
│   ├── MainWorkspace.tsx                create/extract
│   ├── ResponsiveLayout.ts              create
│   ├── fallback-policy.ts               create
│   └── ScrollRegion.tsx                 create
├── navigation/
│   ├── NavigationProvider.tsx           create
│   ├── Navigation.tsx                   refactor existing navigation
│   ├── NavigationItem.tsx               create
│   ├── navigation-model.ts              create
│   └── view-registry.ts                 create
├── sidebar/
│   ├── ContextSidebar.tsx                create
│   ├── SidebarSection.tsx                create
│   ├── SessionCard.tsx                   create
│   ├── ContextCard.tsx                   create
│   ├── FilesInContextCard.tsx            create
│   ├── AgentCard.tsx                     create
│   ├── RuntimeCard.tsx                   create
│   ├── ModelCard.tsx                     create
│   ├── ToolCard.tsx                      create
│   └── QuickActionCard.tsx               create
├── composer/
│   ├── BottomComposer.tsx                create/extract from chat
│   ├── ComposerHint.tsx                  create
│   └── composer-model.ts                 create
├── status/
│   ├── StatusStrip.tsx                   create/refactor status-bar
│   ├── ConnectionStatus.tsx              create
│   ├── ExecutionStatus.tsx               create
│   └── ShortcutLegend.tsx                create
├── modals/
│   ├── ModalProvider.tsx                 create
│   ├── ModalLayer.tsx                    create
│   ├── ModalFrame.tsx                    create
│   ├── ModalFooter.tsx                   create
│   ├── FocusScope.tsx                    create
│   └── modal-types.ts                    create
├── command-palette/
│   ├── CommandPaletteModal.tsx           replace current overlay
│   ├── SearchBox.tsx                     create
│   ├── RecentItems.tsx                   create
│   ├── ResultGroups.tsx                  create
│   ├── SearchResult.tsx                  create
│   ├── PaletteFooter.tsx                 create
│   └── palette-results.ts                create
├── runtime-config/
│   ├── RuntimeConfigurationModal.tsx    create
│   ├── RuntimeSettings.tsx              create
│   ├── ProviderSelector.tsx             create
│   ├── ModelSelector.tsx                create
│   ├── ApiKeyInput.tsx                  create
│   └── runtime-config-model.ts          create
├── views/
│   ├── ChatView.tsx                     migrate current chat
│   ├── SessionsView.tsx                 migrate current sessions
│   ├── PlansView.tsx                    replace ListView branch
│   ├── GraphView.tsx                    replace current placeholder branch
│   ├── ExecutionView.tsx                replace current placeholder branch
│   ├── WorkflowView.tsx                 migrate current workflow projection
│   ├── LogsView.tsx                     migrate current logs
│   ├── ArtifactsView.tsx                create
│   └── SettingsView.tsx                 create
├── execution/
│   ├── ExecutionSummary.tsx             create
│   ├── ExecutionActivity.tsx             create
│   ├── ObservationList.tsx              create
│   └── EvidenceList.tsx                 create
├── projections/
│   ├── conversation-projection.ts       create/extend use-chat boundary
│   ├── execution-projection.ts          create
│   ├── workflow-projection.ts           create
│   ├── evidence-projection.ts           create
│   ├── runtime-projection.ts            create
│   └── sidebar-projection.ts            create
├── services/
│   ├── navigation-actions.ts            create
│   ├── runtime-actions.ts               create
│   ├── conversation-actions.ts          create
│   └── notification-actions.ts          create
├── shared/
│   ├── Card.tsx                         create
│   ├── Section.tsx                      create
│   ├── Badge.tsx                        create
│   ├── Chip.tsx                         create
│   ├── Divider.tsx                      create
│   ├── Input.tsx                        create
│   ├── Button.tsx                       create
│   ├── List.tsx                         create
│   ├── Table.tsx                        create
│   ├── EmptyState.tsx                   create
│   ├── LoadingIndicator.tsx             create
│   ├── ProgressIndicator.tsx            create
│   ├── EvidenceLink.tsx                 create
│   └── FocusMarker.tsx                  create
├── controller.ts                        preserve/refactor transport boundary
├── normalize.ts                         preserve/extend projection boundary
├── host.ts                              preserve/refactor host composition
├── types.ts                             extend view-model/event contracts
├── extensions.ts                        preserve/extend contribution descriptors
├── configuration.ts                     preserve as config contract
├── bootstrap.ts                         preserve
├── modes.ts                             preserve
├── root.tsx                             preserve/refactor root lifecycle
└── index.tsx                            preserve entry; mount application root
```

## File change rules

- Create a file only when it owns a distinct responsibility from existing code.
- Move current components only after the compatibility shell can import the new location.
- Preserve `controller.ts`, `normalize.ts`, `bootstrap.ts`, `configuration.ts`,
  `modes.ts`, and renderer startup behavior unless a phase explicitly requires
  a boundary refinement.
- Retire `app.tsx` only after the new `TuiApplication` has passed all feature
  view, modal, and launch tests.
- Retire old component files only after imports and tests have migrated.
- Do not create a second controller, provider registry, runtime service, or API client.

# 6. Component Implementation Order

1. `TuiApplication` and providers.
2. `ResponsiveLayout` and layout model.
3. Shared `Card`, `Section`, `Divider`, `Badge`, `Chip`.
4. `FocusScope` and `ModalProvider`.
5. `TuiShell`, `ShellBody`, `Header`, `MainWorkspace`.
6. `NavigationProvider`, `Navigation`, `NavigationItem`, view registry.
7. `ContextSidebar`, `SidebarSection`, and sidebar cards.
8. `BottomComposer`, `StatusStrip`, and status subcomponents.
9. `Input`, `Button`, `List`, `EmptyState`, `LoadingIndicator`, `ProgressIndicator`.
10. `CommandPaletteModal` and its result components.
11. `RuntimeConfigurationModal`, `ProviderSelector`, `ModelSelector`, `ApiKeyInput`.
12. Feature views: Chat, Sessions, Plans, Graph, Execution, Workflow, Logs,
    Artifacts, Settings.
13. Projection adapters and action services where each view requires them.
14. Keyboard router integration and global shortcut registration.
15. Resize, fallback, error, offline, degraded, and accessibility hardening.

## Minimum contract before each component implementation

Before implementing a component, the following must exist:

- approved public props/view model;
- owning state domain;
- event/action inputs and outputs;
- renderer/design-system dependency boundary;
- focus behavior if interactive;
- empty/loading/error states;
- unit/component test seam;
- rollback path to the compatibility component.

No component begins implementation with an implicit data-fetching or command-dispatch responsibility.

# 7. State and Interaction Integration

## Modal state

- `ModalProvider` owns stack, lifecycle, opener focus, and top-modal routing.
- Modal content owns only draft values and local validation display.
- Runtime Configuration commits through `runtime-actions`.
- Command Palette dispatches through the command registry.

## Focus registration

- Every interactive component registers a stable focus ID with the nearest scope.
- Lists register item IDs, not numeric positions.
- Modal open records the opener focus ID.
- Responsive collapse removes hidden controls from active traversal.

## Keyboard registration

- Application commands register once at root composition.
- Modal commands register on modal mount and dispose on close.
- Focused inputs consume text-editing keys before global handlers.
- Duplicate same-priority bindings fail during registration.

## Provider/model selection

- Runtime Configuration receives committed routing and provider projections.
- It creates a draft and validates provider/model compatibility locally from supplied data.
- Save calls the existing routing/credential action service.
- The service response updates the routing projection; the modal does not mutate it directly.

## Secret references

- Global state contains credential status/reference, never raw API keys.
- The modal may hold the active input value only for the duration of the draft interaction.
- Action service submits the secret to the existing provider credential service.

## Conversation streaming

- `conversation-actions` starts execution through the existing controller/service boundary.
- `conversation-projection` applies events only when conversation/request/execution
  identity and sequence are current.
- Chat receives a derived message/activity view model.
- ExecutionSummary receives interpreted outcomes and evidence, not raw stream frames.

## Stale-event rejection

- The coordinator maintains current conversation ID, request ID, execution ID, and last sequence.
- The projection rejects mismatched identities before notifying consumers.
- Cancellation/supersession closes the old projection's acceptance window.
- Reconnect deduplicates by sequence and correlation identity.

## Sidebar projections

- A single normalized event enters the projection store.
- Sidebar selectors read affected slices.
- Cards do not independently poll or subscribe.

## Resize

- Renderer dimensions update the layout snapshot.
- Shell derives widths/heights.
- Modal layer derives modal bounds.
- Scroll/focus stores use IDs to retain position.

## Offline/degraded states

- Connection adapter owns connectivity transitions.
- Runtime projection distinguishes connection, provider, and workspace-runtime health.
- Views consume derived state and render approved messages/actions.

# 8. Migration Strategy

## Strategy

Use incremental replacement with a compatibility shell. The TUI must remain
launchable and existing views must continue functioning after every merged phase.

## Compatibility shims

- Keep `packages/tui/src/index.tsx` and `runTui` unchanged at the public boundary.
- Make the existing `TuiShell` a temporary adapter that mounts the new
  `TuiApplication` behind the same host/controller props.
- Preserve `TuiEvent` normalization while projection adapters are introduced.
- Preserve existing command names and slash-command behavior.
- Preserve `TuiExtensionRegistry` descriptor semantics.

## Feature flags

Use only a temporary development/configuration flag if required:

- `tui.shellArchitecture=legacy|approved`.

The flag must not alter runtime service behavior or protocol contracts. Remove
it after Phase 11; do not ship two permanent shells.

## Retirement order

1. Inline shell layout from `app.tsx`.
2. Inline global keyboard routing.
3. Chat-local composer.
4. Simple command-palette overlay.
5. Placeholder list branches.
6. Old local VDS status color helper after design-system status selectors migrate.
7. Compatibility feature flag and old shell imports.

## Rollback points

Each phase must leave one of these safe states:

- existing shell with new primitives unused;
- new shell with legacy active-view slot;
- new shell with one migrated region and legacy fallback;
- new shell with all feature views but legacy keyboard/modal fallback;
- final approved shell.

The TUI executable launch, renderer teardown, controller connection, and existing
command behavior must remain operational at every point.

## Migration completion criteria

- No component imports the legacy shell for normal execution.
- No duplicate global key handler remains.
- No direct controller access remains in feature components.
- All views are registered through the approved view registry.
- Old compatibility files are removed only after tests and evidence confirm replacement.

# 9. Test Plan

## Unit tests

Add tests for:

- shell layout calculations;
- sidebar selectors;
- status selectors;
- navigation registration and conflicts;
- modal stack transitions;
- focus traversal/restoration;
- keyboard priority resolution;
- provider/model validation;
- configuration draft state;
- conversation/execution projection reducers;
- runtime/connectivity transitions;
- stale-event and sequence rejection;
- bounded buffers and batching decisions.

## Component tests

Cover:

- Header states.
- Navigation active/selected/attention states.
- Sidebar cards with complete, empty, degraded, and error data.
- Composer idle/focused/busy/offline/disabled states.
- StatusStrip lifecycle/outcome distinctions.
- Command Palette empty/recent/search/selected states.
- Runtime Configuration provider/model/API-key flows.
- Modal focus trap, stack, close, replace, and restoration.
- EmptyState, LoadingIndicator, ProgressIndicator, and semantic status components.

## Integration tests

Verify:

- `Ctrl+P` open, query, navigate, execute, close.
- `Ctrl+R` open, provider/model selection, validation, save, close.
- Focus restoration after both modals.
- Streaming while sidebar cards update.
- Stale event rejection after cancellation or newer request.
- Reconnect without duplicate messages or activity.
- Resize during active conversation and modal interaction.
- Configuration persistence with secrets redacted/non-persisted.
- Existing routing, approval, execution, workflow, and navigation commands remain functional.

## Pseudo-terminal tests

Verify:

- Normal keyboard input and submit.
- `Ctrl+P`, `Ctrl+R`, `Esc`, Tab, Shift+Tab, arrows, PageUp, PageDown, Home, End, Space, Enter.
- `Ctrl+C` cancellation and exit policy.
- SIGTERM and normal exit.
- Interrupted exit restores terminal state.
- Resize events preserve focus and composer.

## Visual verification matrix

Capture all approved visual states at:

- 80×24;
- 100×30;
- 120×40;
- 160×50.

Run with:

- true color;
- ANSI-256;
- ANSI-16;
- monochrome;
- Unicode;
- ASCII fallback.

States:

- normal shell;
- active execution;
- command palette;
- runtime configuration;
- empty session;
- loading;
- offline;
- degraded provider;
- failed execution;
- completed execution with evidence;
- narrow/collapsed sidebar;
- short-height terminal.

# 10. Evidence Plan

Every phase must produce more than a test result.

| Phase | Required evidence |
|---|---|
| 0 | Baseline screenshots, PTY recording, current test/build results |
| 1 | Primitive state matrix, modal stack trace, focus trace |
| 2 | Shell screenshots and layout measurements |
| 3 | Sidebar state matrix and event-to-card trace |
| 4 | Composer input recording and fixed-row measurement |
| 5 | Ctrl+P PTY recording and result-state screenshots |
| 6 | Redacted provider change/configuration snapshot and modal trace |
| 7 | Keyboard dispatch and focus restoration traces |
| 8 | Resize recordings and viewport screenshot matrix |
| 9 | Offline/degraded/error/recovery state evidence |
| 10 | Accessibility checklist, no-color/ASCII/Unicode recordings |
| 11 | Final visual report, behavioral report, build/test/docs evidence |

Evidence records must include:

- timestamp;
- terminal size and capability mode;
- active view/session/execution where relevant;
- configuration redaction state;
- command or action performed;
- observed outcome;
- artifact path.

# 11. Performance Budgets

These are engineering budgets, not release guarantees.

| Area | Budget |
|---|---|
| Cold TUI shell first usable frame | ≤ 1.0 s after renderer readiness |
| Modal open | ≤ 50 ms from shortcut event |
| Command palette filtering | ≤ 16 ms for local result set up to 2,000 items |
| Keyboard response | ≤ 50 ms for local focus/selection changes |
| Stream delta presentation | Batch within one render frame; no unbounded per-token shell rerender |
| Sidebar update frequency | Coalesce telemetry bursts to at most 10 visible updates/sec unless state changes require immediate update |
| Terminal resize response | Layout snapshot within 100 ms |
| Modal resize response | Bounds/focus update within 100 ms |
| Notification buffer | Maximum 3 visible transient notifications |
| Log/activity buffer | Bounded at configured maximum; default 500 projection items |
| Conversation rendering | Render only changed message/activity subtrees |
| Raw output | Lazy/expanded and bounded; never render unbounded stdout in the main frame |

Performance verification must record actual measurements and terminal conditions.

# 12. Risk Register

| Risk | Likelihood | Impact | Detection | Mitigation | Rollback |
|---|---|---|---|---|---|
| OpenTUI focus/modal limitations | Medium | High | Focus and PTY tests | Keep FocusScope/modal contract behind renderer adapter | Retain compatibility modal path |
| Shortcut conflicts | High | Medium | Registration unit tests | Priority scopes and duplicate-binding errors | Restore legacy command path per action |
| Renderer redraw cost | Medium | High | Frame timing and stream stress | Projection boundaries, batching, incremental rendering | Disable low-priority updates |
| Stale stream events | High | Critical | Identity/sequence tests | Coordinator stale gate and cancellation window | Reject late events; preserve prior projection |
| Provider list latency | Medium | Medium | Modal timing tests | Cache catalog projection, show loading state | Keep committed route unchanged |
| Secret handling | Medium | Critical | Redaction tests and config inspection | Draft-only secret, credential service, no logs/argv | Cancel draft and clear field |
| Compact terminal behavior | High | High | Size matrix | Derived responsive layout and drawer fallback | Restore previous layout policy |
| Unicode width issues | Medium | Medium | ASCII/Unicode PTY matrix | Capability-based fallback and stable markers | Force ASCII fallback |
| Existing navigation regression | Medium | High | Navigation integration tests | View registry compatibility aliases | Re-enable legacy active-view adapter |
| Accessibility limits of terminals | Medium | High | Keyboard/no-color review | Text labels, focus markers, reduced motion | Degrade decoration, preserve semantics |
| Controller becomes a hidden service dependency | Medium | High | Dependency review | Projection/action adapters | Restore adapter boundary before merge |
| Duplicate runtime/provider state | Medium | Critical | State ownership review | Selectors over service truth | Remove local copy and resync |
| Modal state lost on resize | Medium | Medium | Resize integration tests | Stable IDs and draft ownership in modal | Preserve modal or show explicit degraded state |

# 13. Release Gates

PCS-TUI-004 cannot be considered complete until all gates pass:

- architecture conforms to the four approved documents;
- strict TypeScript build passes;
- Biome/lint checks pass for touched files;
- unit tests pass;
- component tests pass;
- integration tests pass;
- pseudo-terminal tests pass;
- accessibility review passes;
- visual verification matrix passes;
- terminal cleanup is verified for normal, Ctrl+C, SIGTERM, and interrupted exits;
- no raw DSML leaks into normal rendering;
- no stale previous-request response renders in the active conversation;
- configuration and secret handling are verified;
- `docs:validate --strict` passes;
- phase evidence is complete and attributable.

# 14. Definition of Done

PCS-TUI-004 is complete only when:

1. The two-column layout works across supported terminal sizes.
2. The right sidebar remains contextual and secondary.
3. The bottom composer remains fixed and usable.
4. `Ctrl+P` opens a usable command palette modal.
5. `Ctrl+R` opens provider/model/API-key configuration.
6. Secrets are never stored in ordinary configuration or emitted in diagnostics.
7. Focus is trapped and restored correctly.
8. Keyboard shortcuts resolve deterministically.
9. Stale events cannot update the active conversation.
10. Offline, degraded, loading, empty, cancelled, completed, and error states are represented.
11. Implementation uses shared Vestara design tokens.
12. Feature code does not import OpenTUI.
13. Existing TUI views and runtime commands continue to function.
14. Visual and behavioral evidence supports the release claim.

# 15. Execution Batches

## Batch 1 — Capture baseline and introduce shared contracts

**Commit objective**: establish fixtures, view-model contracts, and projection/action boundaries without changing the active shell.

**Files**: Phase 0 fixtures, `types.ts` extensions, projection contracts.

**Tests**: selector, stale-event, view-model, and baseline tests.

**Validation**: `pnpm build`; `pnpm test`; existing Bun smoke test.

**Evidence**: baseline screenshots, PTY capture, event/state fixtures.

**Dependencies**: none.

**Rollback**: revert new contracts/fixtures; active shell remains unchanged.

## Batch 2 — Shared primitives and modal foundation

**Commit objective**: add shared components, focus scopes, and modal lifecycle without changing navigation.

**Files**: `shared/*`, `modals/*`.

**Tests**: primitive states, modal stack, focus trap/restoration.

**Validation**: package tests, Bun renderer smoke tests, Biome.

**Evidence**: primitive matrix and modal/focus traces.

**Dependencies**: Batch 1.

**Rollback**: primitives are unused; current UI still runs.

## Batch 3 — Shell extraction and two-column layout

**Commit objective**: replace inline shell composition while preserving the active-view slot.

**Files**: `app/*`, `shell/*`, `layout/*`, `index.tsx` composition.

**Tests**: shell, fixed bottom geometry, breakpoint calculations.

**Validation**: build, tests, PTY launch, four-size screenshots.

**Evidence**: shell layout report and baseline comparison.

**Dependencies**: Batch 2.

**Rollback**: compatibility flag/old shell adapter.

## Batch 4 — Navigation, sidebar, composer, and status

**Commit objective**: migrate persistent shell regions and add contextual sidebar.

**Files**: `navigation/*`, `sidebar/*`, `composer/*`, `status/*`, feature view registry.

**Tests**: navigation, cards, composer, status, sidebar synchronization.

**Validation**: build, tests, PTY input, state matrix screenshots.

**Evidence**: sidebar and bottom-region evidence.

**Dependencies**: Batch 3.

**Rollback**: retain legacy region adapters behind shell compatibility path.

## Batch 5 — Modal consumers

**Commit objective**: deliver Command Palette and Runtime Configuration on the reusable modal framework.

**Files**: `command-palette/*`, `runtime-config/*`, action services.

**Tests**: Ctrl+P, Ctrl+R, validation, save/cancel, secret redaction, focus restoration.

**Validation**: build, tests, PTY modal recordings, visual matrix.

**Evidence**: modal/focus/provider traces and redacted configuration snapshot.

**Dependencies**: Batch 2, Batch 4 for shell mounting.

**Rollback**: existing palette/command behavior remains available until integration gate.

## Batch 6 — Keyboard, projection, stale-event, and resilience integration

**Commit objective**: centralize keyboard routing and wire all state/projection adapters.

**Files**: `app/keyboard-router.ts`, `projections/*`, `services/*`, feature views.

**Tests**: state machines, stale events, reconnect, offline/degraded/error, keyboard priority.

**Validation**: full build/test, PTY stress, stream stress.

**Evidence**: event ordering, stale rejection, focus, and recovery traces.

**Dependencies**: Batches 1–5.

**Rollback**: compatibility action adapters and legacy event projection.

## Batch 7 — Accessibility, responsive hardening, and verification

**Commit objective**: complete fallback behavior, resize retention, accessibility, and visual/behavioral evidence.

**Files**: `layout/*`, shared fallback components, tests/evidence.

**Tests**: full release gate matrix.

**Validation**: `pnpm build`; `pnpm test`; `pnpm biome check <touched-files>`; Bun smoke; PTY matrix; `docs:validate --strict`.

**Evidence**: final evidence bundle and visual report.

**Dependencies**: Batch 6.

**Rollback**: revert Batch 7 while retaining the integrated shell and modal implementation.

# 16. Final Self-Review

### Does the plan preserve the approved architecture?

Yes. It adds projection, action, modal, focus, and shell coordination without
changing the approved UX, visuals, component hierarchy, or existing runtime services.

### Was the current implementation inspected?

Yes. The plan explicitly classifies the current shell, controller, navigation,
ChatView, command palette, use-chat, theme helper, extensions registry, tests,
and renderer boundary as preserve/extend/refactor/replace/remove.

### Is any task ambiguous?

No implementation task may begin without a view model, owner, action contract,
focus behavior, state matrix, and test seam. Remaining domain behavior is
explicitly assigned to existing services or future conversation/execution work.

### Is any phase too large?

The phases are split into seven commit-sized batches. Shell, sidebar, modal
consumers, keyboard/projection integration, and verification are independently
reviewable.

### Are dependencies ordered correctly?

Yes. Primitives and modal/focus contracts precede consumers; shell precedes
persistent regions; projections/actions precede feature integration; final
verification follows all state and responsive behavior.

### Can the TUI remain operational during migration?

Yes. The public launcher, renderer startup, controller, existing views, and
compatibility active-view slot remain in place until replacement gates pass.

### Does every phase have tests and evidence?

Yes. Each phase specifies tests, evidence, validation, and rollback.

### Is any state duplicated?

No. Domain truth remains in services; projections are centralized; local state
is limited to interaction state.

### Is any component importing infrastructure directly?

No. Feature components consume projection view models and action callbacks.
Renderer access remains behind `@vestara/tui-renderer`.

### Does the plan reduce cognitive maintenance?

Yes. It removes competing keyboard handlers, transport access from components,
duplicate domain state, and unbounded raw rendering. It makes ownership and
rollback explicit.

### What is missing?

The only intentionally deferred item is the deeper conversation execution
coordinator: cancellation propagation, execution ownership, and model/tool
stream admission belong to the conversation/execution platform. PCS-TUI-004
defines the TUI projection and stale-event boundary so that work can proceed
without incorrectly reimplementing that runtime service.

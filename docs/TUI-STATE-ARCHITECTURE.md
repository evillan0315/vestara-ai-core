---
title: Vestara TUI State Architecture
version: 1
status: proposed
owner: vestara
last-reviewed: 2026-08-04
next-review: 2026-09-04
---

# Vestara TUI State Architecture

## Purpose

This document defines the runtime state, interaction, and event architecture
for implementing the approved Vestara TUI UX, visual, and component
specifications:

- `docs/TUI-UX-SPECIFICATION.md`;
- `docs/TUI-VISUAL-SPECIFICATION.md`;
- `docs/TUI-COMPONENT-ARCHITECTURE.md`.

It does not redefine UX, visual language, component hierarchy, runtime
services, Event Bus behavior, Marketplace behavior, provider registry behavior,
or renderer abstractions.

The TUI is a projection and interaction client. Existing platform services own
domain truth. TUI state exists to:

- assemble current domain projections;
- coordinate local interaction state;
- reject stale events;
- route user intent to existing services;
- preserve focus, modal, scroll, and layout behavior;
- expose clear lifecycle and outcome states.

## Architectural Invariants

### Existing services remain authoritative

The TUI must consume, not duplicate:

- runtime lifecycle and health;
- Event Bus events;
- telemetry;
- workspace services;
- provider registry and routing selection;
- conversation and execution services;
- workflow and verification projections;
- Marketplace installation state;
- configuration persistence;
- renderer lifecycle and terminal capabilities.

### Components do not own domain truth

Components receive read-only view models and emit explicit intents. They do not:

- fetch the API;
- subscribe directly to WebSocket transport;
- parse Event Bus envelopes;
- parse DSML or provider protocol;
- write configuration files;
- persist API keys;
- mutate runtime services directly.

### State has one owner

Each state value must have one authoritative owner. Other consumers receive a
derived selector or immutable view model. No component may create a second
copy of active session, provider, model, connection, or execution truth.

### State is either canonical, derived, or local

Every value must be classified:

| Classification | Meaning | Example |
|---|---|---|
| Canonical | Owned by an existing service or durable store | Provider credential state, session record |
| Derived | Computed from canonical state and current UI context | Sidebar runtime card, active status chip |
| Local | Exists only for an interaction or view | Palette query, selected result, scroll offset |

When a value can be derived, it must not become a separately stored global
value.

### Renderer isolation remains absolute

The state architecture consumes renderer-neutral hooks from
`@vestara/tui-renderer`. OpenTUI objects do not enter application state,
projection state, modal descriptors, or feature view models.

# 1. Global State

Global state is state shared by multiple regions or required to preserve the
current TUI interaction. Global state is not automatically persistent.

## Global state registry

| State object | Owner | Lifetime | Source | Consumers | Persistence | Synchronization |
|---|---|---|---|---|---|---|
| Workspace context | Workspace/application state adapter | TUI process | Workspace service/bootstrap | Header, views, sidebar | Workspace service | Initial load + workspace events |
| Active session | Session/conversation adapter | TUI process or restored session | Conversation/session service | Header, Chat, sidebar, command palette | Conversation service | Session events and explicit selection |
| Current view | Navigation controller | TUI process | User navigation/config | Shell, navigation, command palette | Optional last-view config | Local action dispatch |
| Navigation registry | Navigation provider | TUI process | Design system + contributions | Navigation, palette, shortcuts | No | Registration lifecycle |
| Selected agent | Runtime routing adapter | TUI process/session | Routing selection/agent registry | Sidebar, status strip, runtime modal | Routing service | Routing events and saves |
| Active provider | Runtime routing adapter | TUI process/session | Routing selection/provider registry | Sidebar, status strip, runtime modal | Routing configuration | Routing events and saves |
| Active model | Runtime routing adapter | TUI process/session | Routing selection/provider registry | Sidebar, status strip, runtime modal | Routing configuration | Routing events and saves |
| Runtime state | Runtime projection adapter | TUI process | Runtime lifecycle/health events | Header, sidebar, status, error states | Runtime service | Event Bus/WS projection |
| Connectivity | Connection adapter | TUI process | HTTP/WS connection lifecycle | Header, sidebar, composer, status | No | Connection state machine |
| Conversation projection | Conversation coordinator | Active session lifetime | Conversation API/SSE/service | Chat, composer, execution summary | Conversation service | Ordered stream events |
| Active execution | Execution coordinator/projection | Execution lifetime | Harness/execution/workflow events | Chat, Execution, Workflow, sidebar, status | Harness/event store | Execution-scoped events |
| Workflow projection | Workflow projection adapter | Selected workflow lifetime | Workflow service/events | Workflow view, sidebar, status | Workflow service | Push events + bounded refresh |
| Verification projection | Evidence/verification adapter | Selected execution lifetime | Verification/evidence services | Execution, Artifacts, sidebar | Evidence service | Verification events |
| Theme | Theme adapter | TUI process | Configuration/design system | All visual components | User/workspace config | Config update event |
| Terminal capabilities | Renderer adapter | TUI process | `@vestara/tui-renderer` | Shell, fallback components | No | Renderer startup/resize |
| Modal stack | Modal provider | TUI process | User actions | Modal layer, focus manager | No | Modal lifecycle actions |
| Focus region | Focus manager | TUI process | Keyboard/focus actions | Shell, modal layer, controls | No | Focus transitions |
| Notifications | Notification store/service | TUI process, bounded | Runtime/event/action results | Notification surface, logs | No, unless promoted to evidence | Event/action dispatch |
| Command registry | Host command registry | TUI process | Application and contributions | Palette, shortcut manager | No | Registration/disposal |

## Global state ownership rules

- Workspace/session state is never copied into each view as independent truth.
- Provider, model, and agent selection are one routing projection. Cards and
  modals select from it; they do not maintain competing selections.
- Runtime and connectivity are separate states. A healthy API connection does
  not imply a healthy provider or active execution.
- Modal and focus state are global only because they affect the complete shell.
- Scroll, query, and selected-row state remain local unless the UX explicitly
  requires restoration across view changes.
- Notifications are bounded and ephemeral. Important failures become execution
  observations, logs, or evidence rather than remaining only as toasts.

## Global selectors

Consumers should use derived selectors such as:

- `selectHeaderModel()`;
- `selectSidebarModel(view, session, execution)`;
- `selectStatusStripModel()`;
- `selectActiveRuntimeRoute()`;
- `selectAttentionItems()`;
- `selectAvailableActions()`;
- `selectCurrentViewAvailability()`.

Selectors are pure. They do not trigger network requests or mutate state.

# 2. View State

View state is local to a view instance and should be discarded when the view is
unmounted unless the approved UX requires restoration.

## Local view state

### Chat view

- Composer text.
- Cursor position and editing mode.
- Conversation scroll offset.
- Expanded execution activity IDs.
- Expanded evidence/output IDs.
- Local display filter, if offered.
- Temporary pending-submit indicator.
- Local retry/cancel affordance state.

Canonical messages, execution identity, stream status, and outcomes do not
belong to ChatView local state.

### Sessions view

- Search text.
- Selected session ID.
- List scroll offset.
- Sort/filter selection.
- Focused action.

Session records remain owned by the session projection.

### Plans view

- Selected plan ID.
- Selected task ID.
- Expanded plan/task IDs.
- Filter and sort state.
- Scroll offset.

Plan/task status remains projection state.

### Graph view

- Selected entity ID.
- Search/filter text.
- Graph/list mode selection.
- Inspector visibility.
- Scroll or viewport position.

Graph entities and relationships remain owned by the graph projection.

### Execution view

- Selected execution activity.
- Expanded stdout/stderr/evidence sections.
- Selected evidence reference.
- Activity filter.
- Scroll offset.

Execution lifecycle, outcome, exit code, and evidence are canonical projection
data, not local state.

### Workflow view

- Selected stage.
- Selected agent swimlane.
- Expanded stage details.
- Scroll offset.
- Optional density/detail preference.

Workflow stage status and metrics remain workflow projection state.

### Logs view

- Query text.
- Severity/source filter.
- Selected event.
- Scroll offset.
- Raw-detail expansion.

Logs are bounded in the view model and sourced from existing telemetry/event
adapters.

### Artifacts view

- Selected artifact.
- Artifact type filter.
- Search text.
- Expanded metadata.
- Scroll offset.

Artifact identity, checksum, and evidence state remain evidence service data.

### Settings view

- Selected settings section.
- Draft form values.
- Dirty state.
- Field validation state.
- Focused setting.

Settings persistence belongs to the existing configuration system. The view
owns only the draft and validation display.

## Local state lifecycle

1. Create when the view mounts.
2. Initialize from canonical state or route parameters.
3. Update through local user interactions.
4. Emit explicit actions for domain changes.
5. Reset on view identity change when the state no longer applies.
6. Preserve only when the navigation controller explicitly supports restoration.

# 3. Modal State

## Modal descriptor

The modal manager owns descriptors with:

- stable modal ID;
- modal type;
- opener focus ID;
- close policy;
- size/layout policy;
- initial focus ID;
- transition lifecycle;
- parent modal ID when stacked;
- content view model reference;
- optional modal-scoped command registrations.

Modal content owns its draft data. The modal manager owns only lifecycle,
stacking, focus restoration, and overlay behavior.

## Modal stack

```text
ModalStack
  ├── Base application shell
  ├── Parent modal, optional
  └── Top modal, receives focus and keyboard events
```

Rules:

- New modals append to the stack.
- The top modal has the highest z-order and exclusive focus.
- Background and lower modals cannot receive input.
- `Esc` closes only the top modal unless that modal explicitly disables escape.
- Closing a child restores focus to the parent modal's previous focus target.
- Closing the last modal restores focus to the opener in the shell.
- A modal may replace itself with another modal while preserving the opener chain.
- Modal transitions are stateful but must not block input longer than necessary.
- Reduced-motion mode skips animated transition states while preserving lifecycle callbacks.

## Modal lifecycle

```text
closed
  ↓ open
opening
  ↓ ready
open
  ├── close request → closing → closed
  ├── replace       → opening(next)
  └── error         → open with validation/error state
```

## Modal consumers

### Command Palette

Owns query, result grouping, selected result, and recent-item presentation.
Dispatches a selected action through the command registry.

### Runtime Configuration

Owns draft provider/model/API-key values and validation. It commits through the
existing routing and provider credential services only after explicit Save.

### Future consumers

The same modal framework supports Marketplace dialogs, confirmations,
inspectors, diff viewers, approval prompts, theme selection, and diagnostics.
No modal-framework change should be required for those consumers.

# 4. Keyboard Architecture

## Event routing layers

Keyboard events flow through priority layers:

```text
Renderer keyboard event
        ↓
System safety layer
        ↓
Top modal scope
        ↓
Active focus scope
        ↓
Active view scope
        ↓
Shell/global shortcut scope
        ↓
Ignored
```

The first layer that handles an event stops propagation unless it explicitly
allows bubbling.

## Shortcut registration

Commands register through the existing `TuiCommandRegistry`. Keybindings are
separate from command definitions:

- command: what the action does;
- binding: how the current scope invokes it;
- visibility: whether it appears in the palette;
- enabled state: whether it can currently run;
- conflict policy: how collisions are resolved.

Components may declare local bindings through a focus scope, but global
commands remain registered at application composition time.

## Priority and conflict resolution

Priority, highest first:

1. Safety controls: process shutdown, active execution cancellation.
2. Top modal controls.
3. Focused input controls.
4. Active view controls.
5. Shell/global navigation.
6. Passive shortcuts.

Conflict rules:

- A focused text input owns printable characters, Backspace, Delete, and cursor movement.
- A modal owns `Esc`, navigation, submit, and modal actions while open.
- `Ctrl+P` and `Ctrl+R` are global only when no text input is actively consuming the same sequence.
- A duplicate binding at the same priority is a registration error, not a runtime tie-break.
- A lower-priority binding never steals an event from a higher-priority scope.

## Required key behavior

| Key | Routing rule |
|---|---|
| `Ctrl+P` | Open/toggle Command Palette when no higher-priority modal/input owns it |
| `Ctrl+R` | Open Runtime Configuration when no higher-priority modal/input owns it |
| `Esc` | Close top modal, cancel transient interaction, then clear local focus state |
| `Tab` | Move focus within active modal/region; shell navigation only when no focus scope consumes it |
| `Shift+Tab` | Reverse focus traversal |
| Arrows | Move within focused list/select/table; never change view accidentally |
| `PageUp`/`PageDown` | Scroll active scroll region or move a page in a list |
| `Home`/`End` | Move to first/last item or scroll boundary within active scope |
| `Ctrl+C` | Cancel active execution first; exit only when no cancellable work exists and policy permits |
| `Enter` | Submit/activate focused control |
| `Space` | Toggle focused checkbox/action where the control declares it |

## Bubbling

An event may bubble only when the focused scope returns `unhandled`. It must not
bubble after a control has changed its value or performed an action.

# 5. Focus Management

## Active region

The focus manager tracks:

- active region: shell, navigation, main, sidebar, composer, modal;
- focus scope ID;
- focused control ID;
- focus history stack;
- disabled controls;
- restoration target.

## Focus ring

The focus ring is visual and semantic:

- focused control uses `borderActive`, `focus`, marker, attribute, or cursor;
- selected control remains visually selected when focus moves;
- disabled controls are removed from traversal and receive an explicit reason;
- focus must never be communicated through gold or color alone.

## Traversal

- Focusable elements register with their nearest scope.
- Traversal follows visual order within that scope.
- `Tab` wraps within a modal scope.
- Shell traversal moves between composer, main, sidebar, and navigation only when those regions expose focusable controls.
- Hidden or collapsed regions are removed from traversal.
- A control that becomes disabled moves focus to the next valid target, then previous, then the scope itself.

## Restoration

Every modal stores the opener focus ID. On close:

1. Restore opener if still mounted and enabled.
2. Restore the parent modal's last focus if stacked.
3. Otherwise focus the active view's primary control.
4. Otherwise focus the composer.

Resize must preserve the focus ID when possible, not merely the numeric index.

# 6. Runtime State

## Runtime state model

Runtime state is a projection of existing provider, routing, connection, and
runtime services. It is not a new runtime service.

```text
RuntimeState
├── route
│   ├── provider
│   ├── model
│   ├── agent
│   └── credentialState
├── lifecycle
│   ├── idle
│   ├── loading
│   ├── streaming
│   ├── reconnecting
│   ├── offline
│   ├── degraded
│   └── error
└── health
    ├── connection
    ├── provider
    └── workspace runtime
```

## Runtime transitions

```text
created → loading → idle
                    ├── streaming
                    ├── reconnecting
                    └── degraded

streaming → idle
          ├── error
          ├── reconnecting
          └── offline

reconnecting → idle
             ├── degraded
             └── offline

offline → reconnecting
        └── idle

degraded → idle
         ├── reconnecting
         └── error

error → idle
      └── reconnecting
```

Transitions are driven by existing service/event results. The UI must not infer
provider health merely from a rendered response.

## Provider/model/API-key state

- Provider and model are committed routing state.
- Runtime Configuration owns a draft copy while the modal is open.
- API-key state contains only `configured`, `not-configured`, `validating`, or
  `invalid`; it never contains a raw secret in global state.
- Save emits an explicit routing/configuration action.
- A failed save leaves the committed route unchanged and updates modal validation.

# 7. Conversation State

## Conversation ownership

The conversation coordinator owns the active conversation and execution stream.
The TUI consumes a normalized projection. Existing conversation services remain
the durable source of messages and history.

## Conversation model

```text
Conversation
├── identity
│   ├── conversationId
│   ├── sessionId
│   └── selectedExecutionId
├── messages
├── activeStream
├── pendingRequest
├── outcome
└── evidence
```

Each stream event must carry or be associated with:

- conversation ID;
- request ID;
- execution ID;
- monotonic sequence;
- event type;
- timestamp.

The TUI must reject events that are not for the active conversation/execution
or have already been applied.

## Conversation state machine

```text
idle
  ↓ submit
pending
  ↓ admitted
streaming
  ├── completed
  ├── cancelled
  ├── failed
  ├── interrupted
  └── superseded

failed/interrupted/cancelled → retry → pending
```

## Streaming behavior

- Add a user message only after request admission succeeds, or label it queued.
- Create one assistant stream projection per execution ID.
- Append deltas only when conversation ID, request ID, and execution ID match.
- Apply only monotonic sequence numbers; duplicate or late sequences are ignored.
- Tool activity is represented as structured lifecycle events, not raw protocol text.
- On cancellation, stop accepting deltas for that execution immediately.
- On completion, derive conclusion, observations, outcome, evidence, unresolved items, and next actions.
- On interruption, preserve partial content as interrupted and expose retry/reconnect actions.
- A retry creates a new request/execution ID and never mutates the old execution history.

# 8. Sidebar Synchronization

## Synchronization source

The sidebar consumes one derived `SidebarViewModel` assembled from global
projections. It does not subscribe independently to each service.

```text
normalized event
      ↓
application projection store
      ↓
sidebar selector
      ↓
ContextSidebar and cards
```

## When the sidebar updates

Update the affected slice when:

- session selection changes;
- workspace identity changes;
- routing selection changes;
- provider credential state changes;
- agent status/activity changes;
- context usage changes materially;
- files-in-context changes;
- execution/workflow state changes;
- connection or runtime health changes;
- attention items are created or resolved.

## Prevent unnecessary refreshes

- Normalize events before projection.
- Update only the affected projection slice.
- Select each card's view model separately.
- Preserve referential identity when a card's inputs did not change.
- Batch bursts of telemetry and stream events before notifying the shell.
- Do not rerender all cards for one agent or tool update.
- Do not poll when an authoritative push event has recently updated the same data.

# 9. Event Architecture

The TUI does not redesign or replace the Event Bus. It consumes existing events
through the controller/application adapter and normalizes them into UI actions.

## Event flow

```text
Event Bus / service / API / WebSocket
              ↓
Transport adapter
              ↓
Event normalizer
              ↓
Event sequence and stale-event gate
              ↓
Projection store
              ↓
Derived selectors
              ↓
UI dispatch / component state
```

## Event categories

| Category | Projection owner | UI consumers |
|---|---|---|
| Telemetry | Telemetry projection | Agent card, status, Logs |
| Runtime | Runtime projection | Header, Runtime card, status |
| Filesystem | Artifact/files projection | Files card, Artifacts, execution |
| Marketplace | Marketplace projection | Settings, command palette, notifications |
| Workflow | Workflow projection | Workflow, execution, sidebar |
| Execution | Execution projection | Chat, Execution, status, sidebar |
| Verification | Verification/evidence projection | Execution, Artifacts, next actions |
| Configuration | Configuration/routing projection | Runtime modal, Runtime card, status |

## Event handling rules

- A raw event is normalized once.
- Events are assigned a correlation and execution context where available.
- Events with stale execution/request IDs are rejected before projection.
- Events with duplicate sequence numbers are ignored.
- Events that affect multiple projections are applied in one logical batch.
- UI notifications are derived from state transitions, not emitted by every component.
- Raw payloads are retained only in diagnostics/evidence paths, not normal view models.

# 10. Terminal Resize

## Resize state

The renderer adapter is the source of terminal dimensions and capabilities. A
resize produces a layout snapshot containing:

- viewport columns and rows;
- wide/medium/narrow breakpoint;
- sidebar visibility and width;
- main workspace width/height;
- composer height;
- status strip height;
- modal bounds;
- fallback mode.

## Recalculation rules

- Recalculate layout from dimensions, not prior pixel/cell values.
- Reserve header, composer, and status rows before sizing the main workspace.
- Keep sidebar width stable within the selected breakpoint.
- Recompute modal width/height and clamp it to the viewport.
- Reduce secondary metadata before hiding primary content.

## Retention rules

- Preserve scroll anchor by item ID where possible.
- Preserve input text and cursor position.
- Preserve selected result/item by ID, not index.
- Preserve focused control by focus ID.
- If a focused control disappears, restore focus using the normal focus fallback chain.
- If a modal no longer fits, keep it open with reduced content or a scroll region.

# 11. Error Recovery

## Provider unavailable

- Runtime projection enters degraded or error provider state.
- Active conversation remains readable.
- Runtime Configuration exposes provider/model alternatives.
- Retry and change-provider actions remain available.
- No new request is presented as sent until admission succeeds.

## Network disconnected

- Connectivity enters offline/reconnecting.
- Existing projections remain visible.
- Composer is disabled or explicitly queues input.
- Reconnect uses bounded backoff from the connection adapter.
- Reconnection does not replay already-applied events.

## Invalid configuration

- Modal retains draft values.
- Field-level validation identifies the invalid field.
- Save is disabled.
- Committed routing/configuration state remains unchanged.

## Stream interrupted

- Active execution becomes interrupted.
- Partial content is retained and labeled.
- Retry starts a new request/execution identity.
- Late events from the interrupted execution are ignored.

## Stale execution

- Newer request becomes the active execution according to coordinator policy.
- Prior execution is marked cancelled or superseded.
- Its future events are rejected by the stale-event gate.
- The UI explains why prior work stopped.

## Unexpected renderer failure

- Renderer lifecycle reports failure through the renderer abstraction.
- Application state remains recoverable independently of the renderer.
- A bounded error path attempts terminal cleanup.
- The CLI/runtime process manager owns restart or exit policy.

## Resize during modal

- Preserve modal draft state.
- Recalculate bounds.
- Preserve focus and selected item.
- Convert dense sections to scrollable regions before closing anything.
- If the modal cannot remain usable, present an explicit degraded layout state.

# 12. Configuration Persistence

## Persisted

Persist only through the existing configuration system:

- selected theme and appearance preferences;
- default view;
- density, reduced motion, and border fallback preferences;
- connection mode and non-secret endpoint configuration;
- last selected provider/model reference where approved;
- user/workspace sidebar and navigation preferences if supported.

## Not persisted in UI state

- raw API keys;
- transient modal drafts;
- cursor position;
- selected result;
- scroll position unless explicitly configured as a UX preference;
- active stream buffers;
- ephemeral notifications;
- OpenTUI objects or renderer handles;
- raw transport payloads.

## Update timing

- Draft settings update local modal state immediately.
- Durable settings update only after explicit Save.
- A successful save updates the configuration service and emits a configuration event.
- Failed persistence leaves the prior committed setting active.
- Startup loads persisted settings before creating derived view models.

## Security

- API keys never enter React state beyond the active input field, if possible.
- Keys are masked and submitted only through the existing credential service.
- Keys do not appear in commands, process arguments, logs, notifications, events, or evidence.
- Clipboard actions require explicit user intent and should not default to copying secrets.

# 13. Performance

## Expensive render boundaries

Keep independent subscriptions for:

- Chat message stream.
- Sidebar runtime/session context.
- Main feature view.
- Status strip.
- Modal stack.
- Navigation.

The entire shell must not rerender for each telemetry event.

## Memoization and derivation

Memoize or structurally share:

- sidebar card view models;
- navigation items;
- command-palette search indexes;
- visible list rows;
- layout snapshots;
- status models;
- evidence summaries.

Do not memoize values solely because they are objects. Memoize at projection and
selector boundaries where it prevents actual subtree work.

## Batching

- Batch telemetry bursts into a bounded projection update.
- Apply stream deltas in ordered batches when the transport delivers multiple frames together.
- Coalesce repeated connection or progress events that do not change visible state.
- Use bounded buffers for logs, activity, notifications, and raw diagnostic output.

## Incremental rendering

- Append conversation deltas only to the active execution projection.
- Update only changed activity rows.
- Render expanded stdout/stderr/evidence lazily.
- Render large sessions, files, artifacts, and logs through bounded/virtualized scroll regions where supported.
- Defer low-priority sidebar metadata while the main stream is actively changing.

## Stale event rejection

Every stream-capable projection uses:

- active execution ID;
- request ID;
- sequence number;
- cancellation state;
- last applied sequence.

An event that fails any identity or ordering check is discarded before state
notification. This is both a correctness and performance requirement.

# 14. Testing Seams

## Unit tests

Test pure functions and selectors:

- global-state selectors;
- sidebar view-model derivation;
- status-strip derivation;
- navigation registry;
- command filtering/grouping;
- modal stack transitions;
- focus traversal and restoration;
- layout breakpoint calculation;
- configuration draft validation;
- stale-event and sequence rejection;
- conversation projection reducers;
- runtime state transitions;
- status/outcome mapping.

## Integration tests

Test application adapters against stubbed existing services:

- controller event normalization;
- telemetry to agent/sidebar updates;
- routing update to runtime card and status strip;
- conversation stream to Chat and Execution projections;
- workflow/verification events to feature views;
- configuration save through existing configuration/provider services;
- Marketplace events to Settings/notifications/command palette.

## Interaction tests

Test with renderer-neutral keyboard and focus fixtures:

- Ctrl+P opening, filtering, selection, and close;
- Ctrl+R draft flow, validation, save, cancel, and secret masking;
- modal stacking and focus restoration;
- Tab/Shift+Tab traversal;
- arrow/PageUp/PageDown/Home/End list behavior;
- Ctrl+C cancellation priority;
- disabled-control skipping;
- action conflict resolution.

## Terminal resize tests

Test wide, medium, narrow, and very short dimensions:

- sidebar visibility and width;
- fixed composer/status rows;
- modal clamping;
- scroll anchor retention;
- selected item and focus retention;
- ASCII/Unicode capability changes.

## State-machine tests

Each machine gets transition tests for valid and invalid transitions:

- Runtime.
- Conversation.
- Modal.
- Focus.
- Streaming.
- Provider Configuration.

## Failure tests

- Provider unavailable.
- HTTP/WS disconnect.
- Reconnect replay and duplicate events.
- Stream interruption.
- Stale execution event after supersession.
- Invalid configuration.
- Modal resize failure.
- Renderer destroy/failure.
- Very large output and bounded-buffer behavior.

# 15. State Machines

## Runtime machine

```text
created
  ↓ load
loading
  ↓ connected
idle
  ├── submit → streaming
  ├── reconnect → reconnecting
  ├── provider problem → degraded
  └── fatal problem → error

reconnecting ──connected──→ idle
reconnecting ──failure──→ offline
offline ──retry──→ reconnecting
degraded ──recovery──→ idle
error ──retry──→ reconnecting
```

## Conversation machine

```text
idle
  ↓ user submit admitted
pending
  ↓ execution started
streaming
  ├── normal done → completed
  ├── user cancel → cancelled
  ├── newer request → superseded
  ├── transport close → interrupted
  └── provider/tool error → failed

completed/cancelled/superseded/interrupted/failed
  └── retry → pending with a new request and execution ID
```

## Modal machine

```text
closed → opening → open
open → closing → closed
open → replacing → opening(next)
open → validation-error → open
```

Only the top modal in the stack can transition through user actions.

## Focus machine

```text
unfocused
  ↓ region activated
focused(scope, control)
  ├── Tab → next control
  ├── Shift+Tab → previous control
  ├── modal open → trapped modal scope
  ├── control disabled → next valid control
  ├── modal close → opener restoration
  └── region unmounted → focus fallback chain
```

## Streaming machine

```text
not-started
  ↓ request admitted
opening
  ↓ stream connected
receiving
  ├── delta sequence → apply if current
  ├── duplicate/late sequence → discard
  ├── cancellation → cancelling
  ├── stream end → completed
  ├── transport error → interrupted
  └── protocol/tool error → failed

cancelling → cancelled
```

## Provider Configuration machine

```text
closed
  ↓ Ctrl+R
editing(provider)
  ↓ provider selected
editing(model)
  ↓ model requires credential
editing(api-key)
  ├── invalid → validation-error
  ├── cancel → closed without mutation
  └── valid save → saving

saving ──success──→ committed → closed
saving ──failure──→ validation-error
```

# Final Architecture Review

## 1. Have I duplicated existing runtime state?

No. Runtime, provider, model, workspace, telemetry, workflow, Marketplace,
configuration, and evidence data remain service-owned. The TUI stores only
projections and local interaction state.

## 2. Have I introduced unnecessary global state?

No. Search text, selected rows, scroll positions, draft forms, expansion state,
and cursor positions remain local. Global state is limited to cross-region
coordination and stable projections.

## 3. Can any state become local?

Yes, and the architecture requires it. Modal drafts, view filters, expanded
cards, focus IDs, and scroll anchors are local unless explicit restoration is
needed.

## 4. Can any state become derived?

Yes. Sidebar cards, status strip, attention indicators, layout decisions, and
available actions are derived selectors rather than stored parallel state.

## 5. Is ownership explicit?

Yes. Service truth, projection state, application coordination, local view state,
modal state, and renderer state have separate owners.

## 6. Will it remain understandable after five years?

The architecture uses a small number of state domains, explicit selectors,
projection boundaries, and named state machines. Components cannot silently
reach transport or domain services. That keeps the system explainable as more
views and Marketplace applications are added.

## 7. Does every decision reduce cognitive maintenance?

The design removes duplicate state, centralizes keyboard/modal ownership,
rejects stale events before rendering, and gives every failure a recovery path.
Those choices reduce both user and maintainer uncertainty.

## 8. Has existing Vestara architecture been preserved?

Yes. The architecture consumes the existing runtime lifecycle, Event Bus,
telemetry, controller, provider registry, routing, configuration, Marketplace,
workspace services, and renderer abstraction. It adds TUI projections and
interaction coordination rather than replacements.

## 9. Can another engineer implement this without assumptions?

Yes. Component ownership is defined by the approved component architecture;
state ownership, event flow, focus priority, modal lifecycle, transitions,
fallbacks, and testing seams are specified here.

## 10. What is still intentionally deferred?

- The concrete implementation of deterministic conversation execution and
  cancellation propagation belongs to the conversation/execution runtime, not
  to presentational components.
- Exact API payload shapes remain owned by existing service contracts and
  projection adapters.
- Renderer-specific primitives remain behind `@vestara/tui-renderer`.

These are deliberate boundaries, not missing decisions in the TUI state model.

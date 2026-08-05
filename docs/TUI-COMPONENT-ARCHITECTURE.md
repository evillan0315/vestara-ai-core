---
title: Vestara TUI Component Architecture
version: 1
status: proposed
owner: vestara
last-reviewed: 2026-08-04
next-review: 2026-09-04
---

# Vestara TUI Component Architecture

## Purpose

This document defines the component architecture for implementing:

- `docs/TUI-UX-SPECIFICATION.md`;
- `docs/TUI-VISUAL-SPECIFICATION.md`.

It does not redesign the approved UX or visual system. It defines ownership,
composition, public contracts, state boundaries, and dependency direction for
the React + TypeScript TUI built on `@vestara/tui-renderer` and
`@vestara/design-system`.

The architecture must preserve:

- the existing TUI controller and API/WS integration;
- runtime telemetry and workflow projections;
- existing navigation destinations;
- provider/model/routing behavior;
- Marketplace and native application lifecycle boundaries;
- OpenTUI isolation behind `@vestara/tui-renderer`.

## Architectural Principles

### Renderer isolation

Feature components must not import `@opentui/core` or `@opentui/react`.

Allowed renderer access:

```text
TUI feature components
        ↓
@vestara/tui-renderer
        ↓
OpenTUI React binding and native renderer
```

Feature components may consume renderer-neutral hooks and contracts exported by
`@vestara/tui-renderer`, including terminal dimensions, keyboard events, focus,
paste, and renderer lifecycle.

### Design-system authority

Visual components consume semantic tokens and presentation metadata from
`@vestara/design-system`. Components must not define local colors, status maps,
spacing systems, or alternate gold treatments.

### Domain state is not component state

API, telemetry, conversation, routing, workflow, evidence, and execution data
belong to application state and projection adapters. Components render those
values and emit user intents. They do not fetch APIs, parse WebSocket payloads,
or interpret model protocol.

### One owner per responsibility

- The shell owns layout regions and global composition.
- The navigation model owns destination definitions.
- The modal manager owns modal lifecycle and focus trapping.
- The controller/application adapter owns transport and command execution.
- Feature views own feature-specific presentation.
- Shared components own reusable visual primitives only.

### Explicit data flow

```text
TuiController / service clients
            ↓
Application state and projections
            ↓
Shell view model
            ↓
Feature views and cards
            ↓
Shared visual primitives
            ↓
@vestara/tui-renderer
```

Events flow upward through explicit callbacks or action dispatch. Visual
components never mutate service state directly.

## Package Boundaries

### `@vestara/tui`

Owns the TUI application composition, feature views, shell state, modal
definitions, command registration, and TUI-specific view models.

### `@vestara/tui-renderer`

Owns the renderer contract and renderer-backed hooks:

- renderer lifecycle;
- terminal viewport and capabilities;
- keyboard and paste events;
- focus and resize behavior;
- JSX runtime boundary;
- renderer teardown.

It does not own Vestara navigation, session state, provider routing, or visual
domain concepts.

### `@vestara/design-system`

Owns:

- semantic palettes;
- Vestara Gold tokens;
- status tones;
- entity presentation metadata;
- navigation metadata that is intentionally renderer-neutral.

It does not own React components, terminal layout, or modal state.

### Platform services

The TUI consumes services and projections through adapters. It must not depend
on Marketplace installation paths, native package journals, or OpenTUI internals.

## Application State Ownership

The application root should compose a small number of state domains:

| State domain | Owner | Consumers |
|---|---|---|
| Workspace/session identity | Application state adapter | Header, sidebar, main views |
| Conversation messages | Conversation state adapter | Main workspace, composer, execution summary |
| Execution/workflow projection | Execution projection adapter | Main workspace, sidebar, status strip |
| Routing selection | Runtime routing adapter | Runtime card, configuration modal, status strip |
| Connection/health | Connection state adapter | Header, sidebar, status strip, empty/error states |
| Navigation | Navigation controller | Shell, navigation, command palette |
| Modal stack | Modal manager | Shell overlay, modal consumers |
| Focus | Modal manager or local focus scope | Shell regions, forms, lists |
| Notifications | Notification service | Status/notification surface |
| Terminal capabilities | Renderer adapter | Responsive layout, fallback components |

Components receive stable view models rather than the full controller or host.
This prevents hidden dependencies and makes feature views reusable in a future
Workspace or Marketplace application.

# 1. Application Shell

## Hierarchy

```text
TuiApplication
└── TuiApplicationProviders
    ├── ApplicationStateProvider
    ├── NavigationProvider
    ├── ModalProvider
    ├── NotificationProvider
    └── TuiShell
        ├── Header
        ├── ShellBody
        │   ├── Navigation
        │   ├── MainWorkspace
        │   │   └── ActiveView
        │   └── ContextSidebar
        ├── BottomArea
        │   ├── BottomComposer
        │   └── StatusStrip
        └── ModalLayer
            └── ActiveModalStack
```

The root composition owns providers and lifecycle. `TuiShell` owns geometry.
The shell does not know the internal rendering details of Chat, Plans, Graph,
or Runtime Configuration.

## `TuiApplication`

**Responsibility**

- Create the application composition boundary.
- Receive the existing `TuiHostHandle`, controller, and endpoint context.
- Start and dispose the application state subscription.
- Register global commands and shortcuts through the host.

**Public props**

- `host`: renderer-neutral TUI host handle.
- `initialView`: optional configured default view.
- `workspaceContext`: optional bootstrap workspace identity.

**Dependencies**

- `@vestara/tui-renderer` for lifecycle hooks.
- `@vestara/design-system` for the active semantic palette.
- Application state adapters.
- Navigation and modal providers.

**Children**

- Exactly one `TuiShell`.

**Ownership**

- Owns application lifecycle and provider composition.
- Does not own feature layout or direct API calls.

## `TuiShell`

**Responsibility**

- Compose Header, Navigation, Main Workspace, Context Sidebar, Composer,
  Status Strip, and Modal Layer.
- Calculate responsive regions from terminal dimensions.
- Keep composer and status regions fixed.
- Provide the active view and current sidebar model to child regions.

**Public props**

- `layoutModel`: responsive shell measurements and visibility decisions.
- `activeView`: current navigation destination.
- `onNavigate`: navigation intent callback.
- `children`: optional active-view slot and modal layer slot.

**Dependencies**

- `useTerminalDimensions` and resize capability from `@vestara/tui-renderer`.
- Navigation state.
- Modal manager.
- Design-system semantic tokens.

**Children**

- `Header`
- `ShellBody`
- `BottomArea`
- `ModalLayer`

**Ownership**

- Owns region composition and geometry.
- Does not own session, execution, or provider business logic.

## `Header`

**Responsibility**

- Communicate Vestara identity, workspace, session, connection, and active
  execution context.

**Public props**

- `workspace`: workspace summary.
- `session`: session summary.
- `connection`: connection view model.
- `execution`: optional active execution summary.
- `capabilities`: terminal capability view model.

**Dependencies**

- Design-system text, accent, status, and spacing tokens.
- No controller or network dependency.

**Children**

- `BrandMark`
- `WorkspaceIdentity`
- `ConnectionIndicator`
- optional `ExecutionIndicator`

**Ownership**

- Owns only header presentation and header-level action affordances.

## `ShellBody`

**Responsibility**

- Arrange Navigation, Main Workspace, and Context Sidebar.
- Apply wide, medium, and narrow terminal layout decisions.

**Public props**

- `navigation`: navigation view model.
- `main`: active main-workspace element.
- `sidebar`: contextual sidebar element.
- `layout`: responsive layout model.

**Dependencies**

- Renderer viewport capability.
- Design-system spacing and surface tokens.

**Children**

- `Navigation`
- `MainWorkspace`
- `ContextSidebar`

**Ownership**

- Owns column layout only.

## `MainWorkspace`

**Responsibility**

- Provide the primary scrollable content region.
- Mount the active feature view.
- Preserve scroll and focus when switching supporting views.

**Public props**

- `activeView`: current view identifier.
- `viewModel`: active view data.
- `onAction`: feature action dispatcher.
- `children`: active view.

**Dependencies**

- Feature view registry.
- Scroll and viewport hooks from `@vestara/tui-renderer`.

**Children**

- One active feature view: Chat, Sessions, Plans, Graph, Execution, Workflow,
  Logs, Artifacts, or Settings.

**Ownership**

- Owns the main viewport and active-view slot, not feature data.

## `ContextSidebar`

**Responsibility**

- Render contextual information that explains the current main workspace.
- Collapse to a drawer/context modal at narrow widths.

**Public props**

- `model`: contextual sidebar view model.
- `visibleSections`: section visibility decisions.
- `onAction`: quick-action dispatcher.
- `collapsed`: responsive state.

**Dependencies**

- Sidebar card components.
- Design-system semantic tokens.
- Modal manager for narrow-terminal drawer behavior.

**Children**

- `SidebarSection` instances containing Session, Context, Files, Agent, Runtime,
  Tools, and Quick Actions cards.

**Ownership**

- Owns sidebar composition and section ordering.
- Does not fetch data or duplicate primary navigation.

## `BottomArea`

**Responsibility**

- Keep the composer and status strip fixed at the bottom.

**Public props**

- `composerModel`.
- `statusModel`.
- `onSubmit`, `onCancel`, and status action callbacks.

**Dependencies**

- `BottomComposer`.
- `StatusStrip`.
- Design-system surface and border tokens.

**Children**

- `BottomComposer`
- `StatusStrip`

**Ownership**

- Owns fixed bottom geometry only.

## `BottomComposer`

**Responsibility**

- Render and own user message input presentation.
- Communicate idle, focused, busy, disabled, offline, and cancellation states.

**Public props**

- `value`.
- `placeholder`.
- `state`: idle, focused, busy, disabled, offline, or error.
- `disabledReason`.
- `onChange`.
- `onSubmit`.
- `onCancel`.
- `contextSummary`.

**Dependencies**

- Renderer keyboard, paste, focus, and input primitives through
  `@vestara/tui-renderer`.
- `Input` shared primitive.
- Conversation action interface; never the raw controller.

**Children**

- `Input`.
- Optional `ComposerHint`.
- Optional `ContextIndicator`.

**Ownership**

- Owns composer-local input state and editing focus.
- The conversation coordinator owns submission and execution state.

## `StatusStrip`

**Responsibility**

- Render high-value connection, agent, provider/model, context, session, and
  execution state.
- Distinguish lifecycle completion from operation outcome.

**Public props**

- `connection`.
- `agent`.
- `provider`.
- `model`.
- `contextUsage`.
- `sessionStatus`.
- `executionStatus`.
- `shortcutHints`.

**Dependencies**

- `StatusChip`.
- `Badge`.
- Design-system status tones.

**Children**

- Status chips and shortcut legend.

**Ownership**

- Owns compact status presentation, not status computation.

# 2. Navigation Architecture

## `NavigationProvider`

**Responsibility**

- Maintain active view, history, and navigation actions.
- Register the existing view destinations and future contributed destinations.

**Public contract**

- `activeView`.
- `items`.
- `navigate(view)`.
- `back()` and `forward()` where supported.
- `registerContribution(item)`.

**Dependencies**

- Renderer-neutral navigation definitions from `@vestara/design-system`.
- Command registry from `@vestara/tui-renderer`.

**Children**

- `Navigation` and command-palette navigation actions.

**Ownership**

- Owns navigation state and registration, not rendering.

## `Navigation`

**Responsibility**

- Render primary destinations and active/attention states.

**Public props**

- `items`.
- `activeId`.
- `attentionById`.
- `collapsed`.
- `onNavigate`.

**Dependencies**

- `NavigationItem`.
- `Badge` or `StatusChip` for attention indicators.
- Design-system navigation metadata.

**Children**

- `NavigationItem` list.

**Ownership**

- Owns navigation presentation only.

## `NavigationItem`

**Responsibility**

- Render one destination with label, icon fallback, shortcut, active, focused,
  and attention states.

**Public props**

- `id`, `label`, `icon`.
- `shortcut`.
- `active`, `focused`.
- `attention`.
- `onSelect`.

**Dependencies**

- `Badge` or `StatusChip` when needed.
- Design-system tokens.

**Children**

- None by default; optional trailing content slot.

**Ownership**

- Owns one navigation row.

# 3. Feature View Architecture

Every view is a feature adapter mounted by `MainWorkspace`. Feature views
receive projections and action contracts, not the controller or renderer.

## View contract

Each feature view has:

- `viewModel` containing read-only display data;
- `state` for loading, empty, offline, degraded, and error states;
- `onAction` for explicit user intents;
- optional `focusScope` or focus restoration key.

### Required views

| View | Responsibility | Primary content |
|---|---|---|
| `ChatView` | Conversation and interpreted execution results | Messages, observations, conclusions, evidence, approvals |
| `SessionsView` | Browse/resume sessions | Session list, status, recent activity |
| `PlansView` | Inspect plans | Goals, tasks, progress, blockers |
| `GraphView` | Browse engineering relationships | Entities, relationships, selected node details |
| `ExecutionView` | Inspect operation lifecycle | Intent, activity, outcome, stdout/stderr summaries, evidence |
| `WorkflowView` | Inspect stage and agent progress | Stages, swimlanes, approvals, verification |
| `LogsView` | Inspect diagnostics and event summaries | Structured logs, filters, evidence links |
| `ArtifactsView` | Browse evidence and produced artifacts | Files, screenshots, manifests, diffs |
| `SettingsView` | Configure TUI and platform settings | Configuration sections and validation |

Feature views may compose shared cards and lists, but they do not create new
visual primitives or alter the shell.

# 4. Modal System

## `ModalProvider`

**Responsibility**

- Own a stack of modal descriptors.
- Open, close, replace, and dismiss modals.
- Track the opener focus key.
- Define modal-level keyboard handling and escape policy.

**Public contract**

- `open(descriptor)` returns a modal identifier.
- `close(id)`.
- `closeTop()`.
- `replace(id, descriptor)`.
- `stack` read model.
- `registerModalType(type, renderer)` for future modal families.

**Dependencies**

- `@vestara/tui-renderer` keyboard, focus, resize, and terminal capability hooks.
- `ModalLayer`.
- `FocusScope`.

**Children**

- `ModalLayer` provider boundary.

**Ownership**

- Owns modal lifecycle, stack order, opener restoration, and global modal shortcuts.
- Does not own field values inside modal content.

## `ModalLayer`

**Responsibility**

- Render the modal stack above the application shell.
- Dim the background.
- Prevent background interaction.
- Recalculate modal bounds on resize.

**Public props**

- `stack`.
- `overlay` configuration.
- `onClose`.

**Dependencies**

- `ModalFrame`.
- `ModalFocusScope`.
- Renderer viewport and transition capability.

**Children**

- One or more `ModalFrame` instances in stack order.

**Ownership**

- Owns overlay composition, not modal-specific content.

## `ModalFrame`

**Responsibility**

- Provide the reusable visual and interaction frame for all modals.
- Render title, shortcut, body, validation area, and footer slots.

**Public props**

- `title`.
- `shortcut`.
- `size`: compact, standard, or wide.
- `onRequestClose`.
- `closeOnEsc`.
- `children`.
- `footer`.
- `validation`.

**Dependencies**

- `FocusScope`.
- `Section`.
- `ModalFooter`.
- Design-system surface, border, spacing, and semantic tokens.

**Children**

- Modal-specific content and footer actions.

**Ownership**

- Owns reusable modal layout and visual treatment.

## `FocusScope`

**Responsibility**

- Trap focus within a shell region or modal.
- Handle Tab/Shift+Tab cycling.
- Restore focus to the opener on close.

**Public props**

- `scopeId`.
- `initialFocusId`.
- `restoreFocusId`.
- `children`.

**Dependencies**

- Focus hooks from `@vestara/tui-renderer`.
- Focusable child registration.

**Children**

- Any focusable region.

**Ownership**

- Owns focus order and restoration, not control styling.

## `ModalFooter`

**Responsibility**

- Render modal actions and keyboard hints consistently.

**Public props**

- `actions`.
- `focusedActionId`.
- `onAction`.
- `hints`.

**Dependencies**

- `Button`.
- `ShortcutLegend`.

**Children**

- Buttons and hints.

**Ownership**

- Owns action alignment and modal-footer hierarchy.

## Modal transitions and stacking

- Modal opening and closing use a renderer-neutral transition state: opening,
  open, closing, closed.
- Reduced-motion mode renders state changes without animation.
- Only the top modal receives keyboard focus and action events.
- A child modal may open over a parent modal without destroying parent state.
- `Esc` closes the top modal only.
- Closing the top modal restores the parent modal's focus.
- A modal may declare `closeOnEsc: false` for unsaved or approval-critical states.
- Background notifications may be queued or rendered in a safe non-interactive
  region, but cannot steal focus.

## Future modal support

The framework must support future types such as:

- Session picker.
- Approval review.
- Artifact inspector.
- Diff viewer.
- Theme selector.
- Help modal.
- Diagnostics detail.

Future modals should consume `ModalFrame`, `FocusScope`, `ModalFooter`, and
shared primitives without modifying the modal framework.

# 5. Sidebar Information Cards

## `SidebarSection`

**Responsibility**

- Group related contextual cards under one concise heading.

**Public props**

- `title`.
- `collapsed`.
- `priority`.
- `children`.

**Dependencies**

- `Section`.
- Design-system spacing and text tokens.

**Children**

- One or more sidebar cards.

**Ownership**

- Owns grouping and density, not card-specific content.

## `SessionCard`

**Responsibility**

- Show current session identity and lifecycle state.

**Public props**

- `title`.
- `sessionId`.
- `status`.
- `updatedAt`.
- `executionId`.

**Dependencies**

- `StatusChip`.
- `Card`.

**Children**

- Optional metadata rows and quick action slot.

**Ownership**

- Owns session presentation only.

## `ContextCard`

**Responsibility**

- Show context/token usage, buffering, compaction, and truncation state.

**Public props**

- `used`.
- `limit`.
- `percentage`.
- `state`.
- `messageCount`.

**Dependencies**

- `ProgressIndicator`.
- `StatusChip`.
- `Card`.

**Children**

- Optional details slot.

**Ownership**

- Owns context visualization, not token calculation.

## `FilesInContextCard`

**Responsibility**

- Show files currently supplied to the agent and their status.

**Public props**

- `files`.
- `totalCount`.
- `onOpen`.
- `onRemove` where supported.

**Dependencies**

- `Card`.
- `List`.
- `Badge` or status treatment.

**Children**

- File rows.

**Ownership**

- Owns compact file-context presentation and intents.

## `AgentCard`

**Responsibility**

- Show active agent identity, role, activity, and stage.

**Public props**

- `agent`.
- `role`.
- `status`.
- `activity`.
- `progress`.

**Dependencies**

- `Card`.
- `StatusChip`.
- `ProgressIndicator` when progress is meaningful.

**Children**

- Optional agent action slot.

**Ownership**

- Owns agent context presentation, not agent lifecycle.

## `RuntimeCard`

**Responsibility**

- Show connection and runtime health.

**Public props**

- `connectionState`.
- `runtimeState`.
- `healthMessage`.
- `onRetry`.
- `onOpenLogs`.

**Dependencies**

- `Card`.
- `StatusChip`.
- `Button`.

**Children**

- Health detail and action slot.

**Ownership**

- Owns runtime health presentation only.

## `ModelCard`

**Responsibility**

- Show active provider/model route and credential state.

**Public props**

- `providerName`.
- `modelName`.
- `credentialState`.
- `onChange`.

**Dependencies**

- `Card`.
- `Badge`.
- `Button`.

**Children**

- Optional route metadata.

**Ownership**

- Owns route summary, not routing mutation.

## `ToolCard`

**Responsibility**

- Show enabled tools, approval mode, and attention state.

**Public props**

- `tools`.
- `approvalMode`.
- `attention`.
- `onOpenDetails`.

**Dependencies**

- `Card`.
- `List`.
- `StatusChip`.

**Children**

- Tool rows or grouped tool summary.

**Ownership**

- Owns tool-context presentation, not tool execution.

## `QuickActionCard`

**Responsibility**

- Expose only contextually useful next actions.

**Public props**

- `actions`.
- `onAction`.

**Dependencies**

- `Card`.
- `Button`.
- `ShortcutLegend`.

**Children**

- Action rows or compact buttons.

**Ownership**

- Owns action grouping; commands remain in the command registry.

# 6. Command Palette Architecture

## Hierarchy

```text
CommandPaletteModal
└── ModalFrame
    ├── SearchBox
    ├── PaletteBody
    │   ├── RecentItems
    │   └── ResultGroups
    │       └── SearchResult
    └── PaletteFooter
        └── ShortcutLegend
```

## `CommandPaletteModal`

**Responsibility**

- Adapt the command registry and searchable resources into the reusable modal framework.

**Public props**

- `initialQuery`.
- `commands`.
- `resources`.
- `recentItems`.
- `onSelect`.
- `onClose`.

**Dependencies**

- `ModalFrame`.
- `SearchBox`.
- `ResultGroups`.
- `CommandRegistry` adapter.

**Children**

- `SearchBox`, `RecentItems`, `ResultGroups`, `PaletteFooter`.

**Ownership**

- Owns palette-local query and selection state.
- Does not own global navigation or command implementation.

## `SearchBox`

**Responsibility**

- Render the focused palette query field.

**Public props**

- `value`.
- `placeholder`.
- `onChange`.
- `onClear`.
- `focusId`.

**Dependencies**

- Shared `Input`.

**Children**

- None.

**Ownership**

- Owns search-field presentation; palette owns the query state.

## `ResultGroups`

**Responsibility**

- Group filtered results by category and preserve result order.

**Public props**

- `groups`.
- `selectedId`.
- `onSelect`.
- `onHover`.

**Dependencies**

- `Section`.
- `SearchResult`.
- `EmptyState`.

**Children**

- `SearchResult` rows grouped under headings.

**Ownership**

- Owns grouping and list presentation, not fuzzy-search logic.

## `RecentItems`

**Responsibility**

- Render recent and suggested actions when the query is empty.

**Public props**

- `items`.
- `selectedId`.
- `onSelect`.

**Dependencies**

- `SearchResult`.
- `Section`.

**Children**

- Search results.

**Ownership**

- Owns recent-item presentation only.

## `SearchResult`

**Responsibility**

- Render one command, session, plan, file, artifact, or settings result.

**Public props**

- `id`.
- `title`.
- `category`.
- `description`.
- `shortcut`.
- `status`.
- `selected`.
- `onSelect`.

**Dependencies**

- `Badge` or `StatusChip` when relevant.
- Design-system entity presentation.

**Children**

- Optional trailing metadata slot.

**Ownership**

- Owns one result row and its visual states.

## `PaletteFooter` and `ShortcutLegend`

**Responsibility**

- Communicate `Enter`, `Esc`, navigation, and available shortcuts without competing with results.

**Public props**

- `hints`.
- `selectedAction`.

**Dependencies**

- Shared `ShortcutLegend` primitive.

**Children**

- None by default.

**Ownership**

- Owns footer hint presentation only.

# 7. Runtime Configuration Architecture

## Hierarchy

```text
RuntimeConfigurationModal
└── ModalFrame
    ├── RuntimeSettings
    │   ├── ProviderSelector
    │   ├── ModelSelector
    │   └── ApiKeyInput
    └── ModalFooter
```

## `RuntimeConfigurationModal`

**Responsibility**

- Coordinate provider/model/API-key editing as one transactional form.
- Keep draft state separate from committed routing state.
- Validate before save and report save failures in place.

**Public props**

- `initialSelection`.
- `providers`.
- `models`.
- `credentials`.
- `onSave`.
- `onCancel`.

**Dependencies**

- `ModalFrame`.
- `RuntimeSettings`.
- Routing and credential action interfaces.

**Children**

- `RuntimeSettings` and `ModalFooter`.

**Ownership**

- Owns draft form lifecycle and validation orchestration.
- Does not persist credentials directly.

## `RuntimeSettings`

**Responsibility**

- Arrange provider, model, and API-key fields in the approved order.

**Public props**

- `draft`.
- `validation`.
- `onChange`.
- `focusId`.

**Dependencies**

- `ProviderSelector`.
- `ModelSelector`.
- `ApiKeyInput`.
- `Section`.

**Children**

- The three runtime controls.

**Ownership**

- Owns form layout, not individual field state or persistence.

## `ProviderSelector`

**Responsibility**

- Select an available provider and expose credential requirements.

**Public props**

- `options`.
- `value`.
- `focused`.
- `onChange`.
- `disabled`.

**Dependencies**

- `Select` shared primitive.
- `Badge` for credential state.

**Children**

- Provider options through the shared select contract.

**Ownership**

- Owns provider selection presentation only.

## `ModelSelector`

**Responsibility**

- Select a model filtered by the selected provider.

**Public props**

- `options`.
- `value`.
- `focused`.
- `onChange`.
- `disabled`.
- `emptyReason`.

**Dependencies**

- `Select` shared primitive.
- `StatusChip` for availability.

**Children**

- Model options.

**Ownership**

- Owns model selection presentation; provider/model compatibility is supplied by the view model.

## `ApiKeyInput`

**Responsibility**

- Render masked API-key entry and reveal/hide action.

**Public props**

- `value`.
- `configured`.
- `masked`.
- `focused`.
- `validationMessage`.
- `onChange`.
- `onToggleVisibility`.

**Dependencies**

- `Input` shared primitive.
- `Button` or action primitive for reveal/hide.

**Children**

- Input and helper/validation text.

**Ownership**

- Owns local masking and field presentation.
- Never logs, persists, or exposes the secret.

# 8. Shared Components

Shared components are visual primitives with narrow contracts. They do not
know about sessions, providers, workflows, or Marketplace packages.

## `Card`

**Responsibility**: Provide neutral grouping, active, focused, and semantic state surfaces.

**Public props**: `title`, `subtitle`, `state`, `selected`, `focused`, `padding`, `children`, `footer`.

**Dependencies**: Design-system surface, border, spacing, and status tokens.

**Children**: Arbitrary presentational content.

**Ownership**: Shared visual primitive package.

## `Section`

**Responsibility**: Group content with a quiet heading and optional collapse affordance.

**Public props**: `title`, `description`, `collapsed`, `onToggle`, `children`.

**Dependencies**: Text hierarchy, spacing, and optional `Divider`.

**Children**: Section content.

**Ownership**: Shared visual primitive package.

## `Badge`

**Responsibility**: Display compact stable metadata.

**Public props**: `label`, `tone`, `icon`, `emphasis`.

**Dependencies**: Semantic status and entity tokens.

**Children**: None by default.

**Ownership**: Shared visual primitive package.

## `Chip`

**Responsibility**: Display compact operational state.

**Public props**: `label`, `tone`, `lifecycle`, `outcome`, `focused`.

**Dependencies**: `toneForStatus` and status tokens.

**Children**: Optional detail slot.

**Ownership**: Shared visual primitive package.

## `Divider`

**Responsibility**: Provide structural separation without adding a card.

**Public props**: `orientation`, `tone`, `length`.

**Dependencies**: Border tokens and ANSI/Unicode capability model.

**Children**: None.

**Ownership**: Shared visual primitive package.

## `Input`

**Responsibility**: Shared text entry with label, placeholder, cursor, masking, validation, and focus treatment.

**Public props**: `value`, `placeholder`, `type`, `disabled`, `focused`, `validation`, `onChange`, `onSubmit`.

**Dependencies**: Renderer input/focus hooks; design-system input tokens.

**Children**: Optional prefix, suffix, or helper slots.

**Ownership**: Shared primitive; form owns semantics.

## `Button`

**Responsibility**: Render primary, secondary, destructive, disabled, and focused actions.

**Public props**: `label`, `variant`, `disabled`, `focused`, `shortcut`, `onPress`.

**Dependencies**: `ShortcutLegend`, semantic tokens, focus scope.

**Children**: Optional icon or trailing detail.

**Ownership**: Shared primitive; parent owns action meaning.

## `List`

**Responsibility**: Provide keyboard-navigable selection and scrolling behavior.

**Public props**: `items`, `selectedId`, `focused`, `emptyState`, `onSelect`, `onMove`.

**Dependencies**: `FocusScope`, `EmptyState`, renderer scroll/keyboard hooks.

**Children**: Row render slot.

**Ownership**: Shared primitive owns selection mechanics, parent owns row meaning.

## `Table`

**Responsibility**: Align structured tabular data for Logs, Artifacts, Plans, or diagnostics.

**Public props**: `columns`, `rows`, `selectedId`, `sort`, `onSelect`, `emptyState`.

**Dependencies**: `List`, `EmptyState`, terminal width model.

**Children**: Cell render slots.

**Ownership**: Shared primitive owns alignment and selection; parent owns data.

## `EmptyState`

**Responsibility**: Explain absence of content and expose the next action.

**Public props**: `title`, `description`, `action`, `tone`.

**Dependencies**: Text hierarchy, `Button` or action link.

**Children**: Optional evidence or help slot.

**Ownership**: Shared primitive; feature supplies the message and action.

## `LoadingIndicator`

**Responsibility**: Communicate loading without changing layout or adding noise.

**Public props**: `label`, `mode`, `reducedMotion`.

**Dependencies**: Renderer timing capability and `info`/`textMuted` tokens.

**Children**: Optional progress summary.

**Ownership**: Shared primitive; data owner supplies state.

## `ProgressIndicator`

**Responsibility**: Show progress with label, count, percentage, or stage context.

**Public props**: `value`, `maximum`, `label`, `stage`, `tone`, `indeterminate`.

**Dependencies**: Semantic tokens, terminal width, reduced-motion setting.

**Children**: Optional detail slot.

**Ownership**: Shared primitive; execution/workflow supplies meaning.

## `ShortcutLegend`

**Responsibility**: Render concise keyboard hints consistently.

**Public props**: `hints`, `compact`, `align`.

**Dependencies**: Keybinding registry and `textDim`/`accent` tokens.

**Children**: None by default.

**Ownership**: Shared primitive; command owner supplies available actions.

## Additional shared primitives

The architecture should also include these small primitives where needed:

- `Text` for semantic typography roles;
- `Icon` for design-system entity markers and fallback behavior;
- `StatusMessage` for plain-language state and recovery text;
- `EvidenceLink` for selectable file, artifact, screenshot, or log references;
- `FocusMarker` for non-color focus communication;
- `ScrollRegion` for viewport-safe scrolling.

These remain renderer-neutral through `@vestara/tui-renderer` and must not
embed domain-specific labels.

# 9. Execution and Conversation Presentation

The UX specification requires interpreted execution results. Component
architecture must keep raw tool protocol out of visual components.

## Projection boundary

Create renderer-neutral projection adapters outside the components:

- `ConversationProjectionAdapter`.
- `ExecutionProjectionAdapter`.
- `WorkflowProjectionAdapter`.
- `EvidenceProjectionAdapter`.
- `RuntimeProjectionAdapter`.

Each adapter converts controller/service events into view models containing:

- intent;
- lifecycle state;
- outcome;
- human-readable summary;
- evidence references;
- next action;
- execution/session/request identity.

Components must never parse DSML, SSE, WebSocket payloads, or raw stdout.

## `ExecutionSummary`

**Responsibility**

- Present the interpreted result of a command or agent execution.

**Public props**

- `intent`.
- `lifecycle`.
- `outcome`.
- `observations`.
- `evidence`.
- `unresolved`.
- `nextActions`.

**Dependencies**

- `Card`, `Chip`, `EvidenceLink`, `List`, `Button`.

**Children**

- Observation list, evidence list, unresolved list, action group.

**Ownership**

- Owns result hierarchy; projection adapter owns interpretation.

## `ExecutionActivity`

**Responsibility**

- Show an in-progress structured activity with intent and current outcome.

**Public props**

- `label`.
- `status`.
- `summary`.
- `duration`.
- `agent`.
- `tool`.
- `expanded`.
- `onToggle`.

**Dependencies**

- `Card`, `Chip`, `LoadingIndicator`, `ProgressIndicator`.

**Children**

- Optional expanded evidence/output slot.

**Ownership**

- Owns activity presentation; execution coordinator owns lifecycle.

# 10. Command and Action Architecture

Commands are registered through `TuiCommandRegistry`; components receive action
callbacks or action descriptors. Components must not construct shell command
strings or dispatch directly to the controller.

## Action descriptor

Every action should provide:

- stable identifier;
- human-readable title;
- category;
- enabled/disabled state;
- visible reason when disabled;
- shortcut when applicable;
- execution callback owned by an application service.

The same action descriptor may appear in:

- Quick Action Card;
- Command Palette;
- modal footer;
- contextual sidebar;
- status strip.

This prevents duplicate command definitions and inconsistent behavior.

# 11. Folder Structure

The application package should evolve toward this structure:

```text
packages/tui/src/
├── app/
│   ├── application.tsx          # root composition and lifecycle
│   ├── providers.tsx            # state, navigation, modal, notification providers
│   ├── state.ts                  # renderer-neutral application state contracts
│   └── view-models.ts            # shell-level view models
├── shell/
│   ├── TuiShell.tsx
│   ├── ShellBody.tsx
│   ├── BottomArea.tsx
│   └── layout-model.ts
├── layout/
│   ├── Header.tsx
│   ├── MainWorkspace.tsx
│   ├── ResponsiveLayout.ts
│   └── ScrollRegion.tsx
├── navigation/
│   ├── NavigationProvider.tsx
│   ├── Navigation.tsx
│   ├── NavigationItem.tsx
│   ├── navigation-model.ts
│   └── view-registry.ts
├── sidebar/
│   ├── ContextSidebar.tsx
│   ├── SidebarSection.tsx
│   ├── SessionCard.tsx
│   ├── ContextCard.tsx
│   ├── FilesInContextCard.tsx
│   ├── AgentCard.tsx
│   ├── RuntimeCard.tsx
│   ├── ModelCard.tsx
│   ├── ToolCard.tsx
│   └── QuickActionCard.tsx
├── composer/
│   ├── BottomComposer.tsx
│   ├── ComposerHint.tsx
│   └── composer-model.ts
├── status/
│   ├── StatusStrip.tsx
│   ├── ConnectionStatus.tsx
│   ├── ExecutionStatus.tsx
│   └── ShortcutLegend.tsx
├── modals/
│   ├── ModalProvider.tsx
│   ├── ModalLayer.tsx
│   ├── ModalFrame.tsx
│   ├── ModalFooter.tsx
│   ├── FocusScope.tsx
│   └── modal-types.ts
├── command-palette/
│   ├── CommandPaletteModal.tsx
│   ├── SearchBox.tsx
│   ├── RecentItems.tsx
│   ├── ResultGroups.tsx
│   ├── SearchResult.tsx
│   └── PaletteFooter.tsx
├── runtime-config/
│   ├── RuntimeConfigurationModal.tsx
│   ├── RuntimeSettings.tsx
│   ├── ProviderSelector.tsx
│   ├── ModelSelector.tsx
│   └── ApiKeyInput.tsx
├── views/
│   ├── ChatView.tsx
│   ├── SessionsView.tsx
│   ├── PlansView.tsx
│   ├── GraphView.tsx
│   ├── ExecutionView.tsx
│   ├── WorkflowView.tsx
│   ├── LogsView.tsx
│   ├── ArtifactsView.tsx
│   └── SettingsView.tsx
├── execution/
│   ├── ExecutionSummary.tsx
│   ├── ExecutionActivity.tsx
│   ├── ObservationList.tsx
│   └── EvidenceList.tsx
├── shared/
│   ├── Card.tsx
│   ├── Section.tsx
│   ├── Badge.tsx
│   ├── Chip.tsx
│   ├── Divider.tsx
│   ├── Input.tsx
│   ├── Button.tsx
│   ├── List.tsx
│   ├── Table.tsx
│   ├── EmptyState.tsx
│   ├── LoadingIndicator.tsx
│   ├── ProgressIndicator.tsx
│   ├── EvidenceLink.tsx
│   └── FocusMarker.tsx
├── projections/
│   ├── conversation-projection.ts
│   ├── execution-projection.ts
│   ├── workflow-projection.ts
│   ├── evidence-projection.ts
│   └── runtime-projection.ts
├── services/
│   ├── navigation-actions.ts
│   ├── runtime-actions.ts
│   ├── conversation-actions.ts
│   └── notification-actions.ts
├── controller.ts
├── host.ts
├── types.ts
└── index.tsx
```

## Folder ownership rules

- `shared/` cannot import from `views/`, `sidebar/`, `modals/`, or `services/`.
- `shared/` may import only design tokens and renderer-neutral hooks/contracts.
- `views/` may consume `projections/` and `shared/`, but not raw controller transport.
- `sidebar/` may consume view models and shared primitives, but not feature views.
- `modals/` owns modal lifecycle but modal contents remain in their feature folders.
- `services/` may call controller/service APIs and return action outcomes; they do not render.
- `projections/` may parse/normalize domain events; components never do.
- `navigation/` defines destinations and commands but does not own their feature content.

# 12. Component Contract Summary

Every component contract follows this shape:

```text
Responsibility
Public props
Dependencies
Children/slots
Ownership
```

The component must remain usable when its parent changes data source. For
example, `RuntimeCard` must work with API-backed routing, a fixture, or a future
Marketplace application view model without importing the API client.

## Public props policy

- Props are read-only view models or explicit callbacks.
- Props must not expose the entire controller, host, WebSocket, or native renderer.
- Callback names express user intent: `onSelect`, `onSave`, `onCancel`, `onRetry`, `onOpen`.
- Async outcomes return through application action services or state updates,
  not hidden component promises.
- Components should accept optional slots for secondary content rather than
  multiplying near-identical variants.

# 13. Reuse Beyond the TUI

The architecture is intentionally reusable by future Marketplace applications.

## Directly reusable

- `Card`, `Section`, `Badge`, `Chip`, `Divider`, `Input`, `Button`, `List`,
  `Table`, `EmptyState`, `LoadingIndicator`, `ProgressIndicator`.
- Semantic status and entity presentation metadata.
- Focus scope and modal framework contracts.
- Action descriptors and shortcut legend contracts.
- Evidence link and execution summary view-model contracts.

## TUI-specific adapters

- `OpenTuiRenderer` adapter.
- Terminal viewport and capability adapter.
- TUI shell layout.
- Keyboard event adapter.
- Terminal-specific fallback policy.

Future Workspace or Marketplace applications may reuse the domain-neutral
contracts and design tokens while supplying a different renderer adapter.

# 14. Architecture Review

This architecture was reviewed against the required questions before approval.

### Is every component single responsibility?

Yes. Shell components compose regions; feature views present projections; cards
present one contextual object; shared primitives provide one visual behavior;
modal infrastructure owns stack/focus lifecycle; services own actions.

### Can components be reused?

Yes. Shared components accept view models and callbacks rather than controller
objects or TUI-specific domain state. Sidebar cards can be mounted by other
engineering applications.

### Are there hidden dependencies?

The architecture prohibits them. Renderer access is through
`@vestara/tui-renderer`; visual tokens come from `@vestara/design-system`; raw
transport is isolated in controller/projection adapters; action execution is
owned by services.

### Can future Marketplace applications reuse these components?

Yes. The shared visual primitives, status semantics, action descriptors, focus
scope, modal framework, and evidence/execution view models are independent of
the TUI's shell. Future applications may reuse them through a renderer-specific
adapter without importing TUI application state.

### Final constraint

No implementation should proceed until this architecture continues to satisfy
the two approved specifications. A component is not justified by convenience
alone; it must reduce duplication, clarify ownership, or create a reusable
boundary.

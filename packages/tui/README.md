# @vestara/tui

Vestara's canonical interactive terminal presentation layer. It renders a
full-screen, event-driven application over the Workspace Runtime API and event
bus. It owns no conversation, provider, agent, telemetry, graph, filesystem,
or routing business logic.

Runtime events are normalized before reaching UI state. Provider protocol,
raw tool payloads, and provider metadata are never added to the conversation
timeline.

## Execution routing

Press `Ctrl+R`, or choose **Select Agent, Provider & Model** from the command
palette, to open the three-stage routing selector. The selector reads active
agents from `/api/agents` and healthy provider-scoped models from the shared
routing catalog. Completing the flow updates the versioned routing selection
through `/api/routing/selection`; it does not keep an independent TUI routing
configuration.

The active agent and effective `provider/model` are shown in the status bar.
Subsequent conversation requests include the selected agent identity, while
the API resolves the provider and model from authoritative routing state. A
revision conflict or unavailable candidate is surfaced as a TUI error instead
of silently overwriting a selection made by another client.

## Component hierarchy

```text
TuiApp
├── Header
├── NavigationPane
├── Conversation | Sessions | Plans | Graph | Explorer | Logs
├── AgentPane
├── MultilineEditor
├── CommandPalette | HelpOverlay
├── Toasts
└── StatusBar
```

`TuiController` is the runtime bridge. `normalizeRuntimeEvent` is the single
protocol-to-presentation boundary. Plans and sessions come from their public
runtime APIs; the Explorer is a projection of file entities in the Engineering
Graph. No workspace package is imported by this presentation package.

## Extension point

`TuiExtensionRegistry` accepts declarative `TuiViewContribution` descriptors.
Extensions may contribute identity, labels, descriptions, and commands, but do
not inject arbitrary Ink components into the trusted TUI process. The TUI owns
rendering and can evolve its theme and responsive layout independently.

Registrations return a disposal callback so package deactivation removes its
contributions without restarting the runtime. Duplicate or unsafe identifiers
are rejected at registration time.

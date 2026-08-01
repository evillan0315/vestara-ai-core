# @vestara/tui

Vestara's canonical interactive terminal presentation layer. It renders a
full-screen, event-driven application over the Workspace Runtime API and event
bus. It owns no conversation, provider, agent, telemetry, graph, filesystem,
or routing business logic.

Runtime events are normalized before reaching UI state. Provider protocol,
raw tool payloads, and provider metadata are never added to the conversation
timeline.

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

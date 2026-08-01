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
protocol-to-presentation boundary. Future extension views can contribute a
navigation entry and render function without gaining access to runtime
internals.

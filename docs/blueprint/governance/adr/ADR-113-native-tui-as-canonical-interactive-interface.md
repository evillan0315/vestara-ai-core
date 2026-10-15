---
id: "adr-113"
adr: "ADR-113"
title: "Native TUI as Canonical Interactive Interface"
category: "interface"
version: 1.0
date: "2026-08-01"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect"]
consulted: ["@platform-engineer", "@frontend-engineer", "@developer-experience-engineer"]
informed: ["@team"]
tags: ["tui", "cli", "events", "terminal", "presentation"]
depends_on: ["adr-106", "adr-111", "adr-112"]
referenced_by:
  - type: "blueprint"
    target: "13-design-system/17-terminal-console.md"
---

## Context

Vestara had multiple readline REPLs and a small transcript Console. Readline
owned input, rendering, and command behavior, which prevented persistent live
state, simultaneous agents, visible tools, responsive panes, and extension
views. The runtime and API already own the underlying behavior.

## Decision

`@vestara/tui` SHALL be Vestara's canonical interactive terminal interface.
No-argument `vestara`, `vestara tui`, and the compatibility `vestara console`
entrypoint launch it. Non-interactive CLI commands remain stable. `vestara open`
is finite and does not take terminal input.

The TUI is presentation only. It consumes runtime commands, streaming
conversation output, and WebSocket events. Every provider event is normalized
into presentation-safe conversation, tool, agent, telemetry, graph,
notification, connection, or approval events before rendering. Raw provider
protocol and tool arguments are prohibited from conversation state.

The public terminal uses a retained application state and alternate-screen
rendering. Readline handlers may survive temporarily only as an opt-in internal
migration layer and are not reachable from public CLI behavior.

## Consequences

- Terminal output updates in place rather than appending protocol lines.
- Runtime ownership is shared with Workspace UI and API consumers.
- TUI views and future plugin contributions have explicit presentation seams.
- The local launcher may start the compiled API when no shared runtime exists.
- Rich explorer and plugin view adapters can mature without another CLI rewrite.

## Implementation evidence

- `packages/tui/src/app.tsx`
- `packages/tui/src/controller.ts`
- `packages/tui/src/normalize.ts`
- `apps/cli/src/index.ts`
- `apps/console/src/index.tsx`
- `packages/tui/__tests__`

---
id: "adr-126"
adr: "ADR-126"
title: "Activity Room as Projection, Not Event Source"
category: "architecture"
version: 1.0
date: "2026-08-06"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@platform-engineer"]
consulted: ["@backend-engineer"]
informed: ["@team"]
tags: ["activity", "projection", "events", "workspace", "architecture"]
depends_on: ["adr-121", "adr-122"]
referenced_by:
  - type: "blueprint"
    target: "06-workspace/activity-room.md"
---

## Context

The Activity Room surfaces real-time agent activity to users. An early design
treated the Activity Room as a direct consumer of the event bus, subscribing to
raw engineering events. This created coupling between the event schema and the
UI, and made redaction, ordering, and resync harder to manage.

## Decision

The Activity Room is a **projection** of engineering events, not a direct
event consumer. The architecture separates concerns:

```text
Subsystem Event
  → Projection (redaction, ordering, formatting)
  → Append-only Store
  → History API
  → Activity Hub
  → WebSocket
  → Activity Room
```

The projection layer owns:
- **Redaction**: sensitive data is removed before storage
- **Ordering**: events are ordered deterministically for consistent display
- **Resync**: clients can reconstruct state from the append-only store
- **Formatting**: events are formatted for display, not raw

The append-only store is the source of truth for activity history. The Activity
Room renders from the History API, not directly from the event bus.

## Consequences

- Event schema changes don't directly break the UI
- Redaction is centralized in the projection layer
- Activity history is replayable and auditable
- Multiple clients (TUI, Workspace UI) consume the same projection

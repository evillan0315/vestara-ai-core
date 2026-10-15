---
id: "adr-105"
adr: "ADR-105"
title: "Event-Sourced Engineering Graph"
category: "foundation"
version: 1.0
date: "2026-08-01"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
consulted: ["@ai-engineer", "@backend-engineer"]
informed: ["@team"]
tags: ["events", "engineering-graph", "temporal", "architecture"]
depends_on:
  - id: "adr-104"
    relationship: "verification evidence is recorded and projected over time"
referenced_by:
  - type: "blueprint"
    target: "04-platform/engineering-event-architecture.md"
  - type: "runtime"
    target: "EngineeringEventStore"
---

## Context

The Workspace needs historical truth: it must reconstruct any point in time,
diff between states, and replay executions. Persisting full snapshots on every
refresh is expensive and loses intermediate state.

## Decision

Adopt an event-sourced engineering graph. The append-only event log is
**historical truth**; graph state is a **derived projection**; checkpoints are
**acceleration artifacts**. Every hydration diffs the previous state against
the new state and appends domain events
(`entity-created|updated|deleted`, `relationship-added|removed`) with monotonic
sequence numbers. `stateAt(time)` reconstructs state from the nearest
checkpoint plus incremental replay.

## Consequences

### Positive
- Any point-in-time state is reconstructable.
- Diffs, history, and replay are free.
- The graph becomes the substrate for verification, trust, and confidence.

### Negative
- Memory-resident today: history is lost on restart (durable persistence
  proposed).
- Replay cost grows with log length (mitigated by checkpoints).

### Risks
- Event volume unbounded in a long session (risk; mitigation: checkpoint +
  bounded retention).

## Alternatives Considered
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Full snapshot per refresh | simple | expensive, no intermediate state | rejected |
| Durable snapshot + journal | durable | heavier first step | deferred as future extension |

## Implementation Notes
- Migration required? No (new subsystem).
- Breaking changes? No.
- Implemented in `@vestara/engineering-graph` (`events.ts`, `graph.ts`).

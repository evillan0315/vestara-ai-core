---
id: "adr-121"
adr: "ADR-121"
title: "Engineering Event Projection (harness.* and change.*)"
category: "implementation"
version: 1.0
date: "2026-08-02"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@platform-engineer"]
consulted: ["@ai-engineer", "@backend-engineer"]
informed: ["@team"]
tags: ["event-store", "projection", "filesystem", "diff", "observability"]
depends_on: ["adr-104", "adr-105", "adr-111", "adr-120"]
referenced_by:
  - type: "blueprint"
    target: "04-platform/engineering-event-architecture.md"
---

## Context

The harness emits domain events through the event bus, but they did not reach
the engineering event store, and there was no durable record of filesystem
state. The TUI and Execution Center needed a single correlated event stream
that describes both agent activity and actual file changes.

## Decision

Project harness and filesystem activity into the engineering event store as
decoupled, durable events.

1. A `harness.*` bridge subscribes to harness domain events on the event bus,
   normalizes them into engineering events keyed by thread/correlation, and
   appends them to `SqliteEngineeringEventStore`. A projection failure is
   recorded through telemetry and never breaks the harness run.
2. A `change.*` projection is derived from actual filesystem observations and
   Git state — never from model output. It captures a baseline (file list +
   content hashes + git HEAD) per thread, then projects
   `change.baseline.captured`, `change.file.created|updated|deleted|renamed`,
   `change.diff.updated` (the real unified diff), and `change.summary.updated`.
   Renames are inferred from preserved content hashes. Projection is
   idempotent: a read/GET never duplicates events.
3. ThreadRuntime remains the authoritative execution history; the engineering
   event store and graph are projections.

## Consequences

- The TUI diff projection, Execution Center, and workflow projection all read
  the same durable events and therefore agree.
- Filesystem/diff events exist even when the model never reports them.
- Projection persistence is best-effort by design; the harness is never
  coupled to SQLite or routing.

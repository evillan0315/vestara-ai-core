---
id: "adr-122"
adr: "ADR-122"
title: "Real-Time Workflow Lifecycle"
category: "implementation"
version: 1.0
date: "2026-08-02"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@platform-engineer"]
consulted: ["@ai-engineer", "@backend-engineer"]
informed: ["@team"]
tags: ["workflow", "real-time", "tui", "projection", "websocket"]
depends_on: ["adr-104", "adr-105", "adr-111", "adr-120", "adr-121"]
referenced_by:
  - type: "blueprint"
    target: "04-platform/engineering-operating-system.md"
---

## Context

Activity, changes, approvals, verification, and diffs lived in separate views
with different shapes, so the TUI and Workspace UI could diverge. Updates were
invalidation-only (re-fetch the whole snapshot) with a one-second poll, which
is not a true event-driven architecture.

## Decision

Introduce one renderer-independent workflow model and an incremental push
protocol that both the TUI and the Workspace UI consume.

1. A canonical eight-stage workflow projection
   (Intent → Context → Investigation → Planning → Execution → Verification →
   Review → Complete) is derived deterministically from thread items and
   engineering events — never from parsing model text. Each stage exposes
   status, timestamps, duration, owning agent, tools, files, evidence,
   verification, and blocking reason.
2. Stage derivation is hybrid: explicit `harness.stage.*` announcements
   override the deterministic inference, so orchestrators with richer
   information can tighten the rail without a harness rewrite.
3. An incremental protocol (`workflow.snapshot`, `workflow.stage.*`,
   `workflow.agent.updated`, `workflow.change.updated`,
   `workflow.approval.*`, `workflow.verification.updated`,
   `workflow.completed`) carries a monotonic sequence in every envelope. A
   client connects, receives a snapshot, subscribes from its last sequence,
   and reconnects from the last acknowledged sequence; polling is retained
   only as a degraded fallback when push is unavailable.
4. Updates are published when events are appended (coalesced over a small
   interval), not on read requests. A GET never produces a mutation-style
   update event.
5. The TUI exposes a live workflow view (`/workflow <threadId>`) rendering the
   lifecycle rail, stage list, agents, approvals, and metrics, refreshed by
   push with a visibility-aware polling fallback.

## Consequences

- The TUI and Workspace render the same workflow state because they consume
  the same canonical projection and event stream.
- Real-time progress flows without full-page refreshes or render storms.
- Historical workflows can be replayed from the temporal event store.

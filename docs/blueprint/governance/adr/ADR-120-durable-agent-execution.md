---
id: "adr-120"
adr: "ADR-120"
title: "Durable Agent Execution via AgentHarnessRuntime"
category: "implementation"
version: 1.0
date: "2026-08-02"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@platform-engineer"]
consulted: ["@ai-engineer", "@security-engineer"]
informed: ["@team"]
tags: ["agent-harness", "execution", "threads", "approval", "restart-safety"]
depends_on: ["adr-104", "adr-111", "adr-117"]
referenced_by:
  - type: "blueprint"
    target: "04-platform/agent-harness-architecture.md"
---

## Context

The agent loop was split between a durable single-turn coordinator
(`AgentHarnessRuntime`) and a legacy capability orchestrator with its own
model→tool loop. Two execution paths meant fixes to one did not reach the
other, and the TUI could not trust a single authoritative history. The legacy
loop also rebuilt full thread history for every provider call, so long runs
could exceed the context window.

## Decision

`AgentHarnessRuntime` is the single execution path for ordinary agent work.

1. `AgentRuntime.run()` is a thin adapter that delegates to the harness,
   creating a durable thread and linked ExecutionSession for every run.
2. Every model turn executes tool calls in deterministic order. Invalid tool
   names or arguments produce a structured failure the model can react to;
   denial and cancellation terminate the turn; approval suspends before that
   call and persists the remaining call queue in the approval item for
   restart safety.
3. Approval decisions are idempotent — a persisted decision never re-executes
   the tool — and `pendingApprovals(threadId)` is read from durable items, so
   a restarted process can recover the approval screen.
4. The legacy capability orchestrator loop is removed. There is no duplicate
   model→tool loop.
5. Provider context is compacted: earlier turns are summarized into a system
   message preserving instruction, steering, completed tool-call IDs, changed
   files, failed attempts, verification state, and approval decisions, while
   recent items stay raw.

## Consequences

- Single authoritative execution history: thread replay is the control flow;
  the engineering event store and graph are projections.
- Long-horizon runs stay within the provider context window without losing
  the facts required for safe restart and idempotent execution.
- Legacy callers (`/api/agents/:id/run`, workflows, schedules) automatically
  run through the harness without per-caller changes.

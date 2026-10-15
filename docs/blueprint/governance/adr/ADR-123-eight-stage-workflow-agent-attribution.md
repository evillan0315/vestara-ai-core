---
id: "adr-123"
adr: "ADR-123"
title: "Eight-Stage Workflow Agent Attribution and Workspace Surfaces"
category: "implementation"
version: 1.0
date: "2026-08-02"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@platform-engineer"]
consulted: ["@ai-engineer", "@backend-engineer"]
informed: ["@team"]
tags: ["workflow", "agents", "workspace-ui", "lifecycle", "projection"]
depends_on: ["adr-111", "adr-120", "adr-122"]
referenced_by:
  - type: "blueprint"
    target: "04-platform/agent-harness-architecture.md"
---

## Context

The eight-stage workflow projection (ADR-122) described stages but did not
attribute an owning agent to each lifecycle stage, so the TUI and Workspace UI
could not answer "which agent owns this stage". Separately, the Workspace UI
surfaced milestone data across dedicated pages without a shared live surface.

## Decision

Every workflow stage carries an owning agent, derived deterministically:

1. The **actual agent** from tool-call `payload.agentId` when a signal carries
   one (the agent that executed the tool).
2. Otherwise a **role default per stage**: `conversation` → Intent, `analyst` →
   Context/Investigation, `planner` → Planning, `developer` → Execution,
   `verifier` → Verification, `reviewer` → Review, `system` → Complete.

The workflow API resolves human display names from the agent registry, so the
rail shows "Developer" rather than raw ids. The TUI and every Workspace page
consume the same canonical projection.

The Workspace UI surfaces the lifecycle in one shared model:

- Dashboard: "Live Engineering Workflow" section (threads, running, approvals,
  +additions/-deletions, active agents, per-workflow lifecycle rails with
  approve/deny and change diffs).
- Sessions: harness ExecutionSessions render the workflow rail + durable
  thread timeline.
- Agent Control: the selected agent's harness session renders its workflow
  rail with approve/deny.
- Artifacts: "Live Change Projection" panel (workflow rail + changed-files
  diff).
- Documentation: a live "System Milestones" strip tying docs to the delivered
  execution capabilities.

## Consequences

- Every lifecycle stage is attributable to an agent (actual or role default),
  which powers agent swimlanes later (ADR-118).
- The TUI and Workspace render the same stage state and owning agents because
  they consume the one canonical projection.
- The approval → resume → verify loop is actionable directly from the
  workflow rail in the UI.

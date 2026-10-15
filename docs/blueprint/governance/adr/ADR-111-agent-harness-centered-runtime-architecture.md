---
id: "adr-111"
adr: "ADR-111"
title: "Agent-Harness-Centered Runtime Architecture"
category: "platform"
version: 1.0
date: "2026-08-01"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect"]
consulted: ["@platform-engineer", "@ai-engineer", "@security-engineer"]
informed: ["@team"]
tags: ["agent-harness", "runtime", "threads", "tools", "environments"]
depends_on: ["adr-103", "adr-104", "adr-105", "adr-106", "adr-107"]
referenced_by:
  - type: "blueprint"
    target: "04-platform/agent-harness-architecture.md"
  - type: "blueprint"
    target: "04-platform/engineering-operating-system.md"
---

## Context

Vestara's coordinator-composes-specialists pattern correctly separates
ownership, but the Blueprint overextended the word “runtime” to planning,
learning, simulation, repository analysis, browser use, and other concepts that
do not independently own lifecycle, recovery, concurrency, or resources. That
fragments the central agent loop and makes ordinary engineering actions cross
too many artificial boundaries.

Public Codex product contracts validate a simpler execution shape: durable
threads contain turns and streamed items; turns may be steered or interrupted;
threads may be resumed, forked, and compacted; tool use is governed by sandbox
and approval policy; environments and worktrees isolate execution; subagent
threads are coordinated by a main thread. Vestara adopts this shape as an
external architectural reference without claiming to reproduce private Codex
internals.

## Decision

Vestara SHALL center engineering execution on a durable **Agent Harness
Runtime**. One harness run owns the model/tool/observation/verification loop for
one agent turn until it completes, blocks, fails, escalates, or is cancelled.

The first-class target runtimes are:

1. Agent Harness Runtime
2. Task and Thread Runtime
3. Environment Runtime
4. Tool Runtime
5. Context Runtime
6. Policy and Approval Runtime
7. Verification and Evidence Runtime
8. Worktree and Parallel-Agent Runtime
9. Orchestration Runtime
10. Automation Runtime
11. Event, Telemetry, and Audit Runtime

Planning, simulation, learning, repository intelligence, browser automation,
Git, Docker, Kubernetes, database access, memory retrieval, impact analysis,
and risk scoring SHALL begin as strategies, services, providers, policies, or
graph projections used by those runtimes.

A component graduates to a runtime only if it independently requires:

- durable lifecycle and state transitions;
- recovery after process or host failure;
- concurrency and cancellation ownership;
- an isolation or resource boundary; and
- an observable public contract.

## Runtime boundaries

```text
Orchestration Runtime  manages goals, task dependencies, and assignments.
Agent Harness Runtime  manages one agent's iterative turn and terminal outcome.
Tool Runtime           authorizes and executes individual operations.
Environment Runtime    owns where operations execute and what they can access.
Verification Runtime   produces structured evidence repeatedly during a turn.
Thread Runtime         preserves authoritative, resumable interaction history.
```

The event store is authoritative history. Compacted context and durable memory
are derived views. The Engineering Graph is a projection and retrieval source,
not an execution coordinator.

## Consequences

### Positive

- One coherent inspect/act/observe/verify loop.
- Tools replace one-off integration runtimes.
- Interfaces share durable threads rather than duplicating sessions.
- Policy and evidence apply uniformly to every tool provider.
- Parallel agents receive explicit worktree leases instead of sharing mutable
  directories.

### Negative

- Existing services and runtime names require gradual reconciliation.
- Durable threads, environment leases, tool schemas, and approvals create new
  persistence contracts.
- Harness recovery requires deterministic item/event processing.

### Risks

- A harness can become a god object. Mitigation: it coordinates typed services;
  specialists still own decisions within their bounded contracts.
- Tool unification can erase provider-specific constraints. Mitigation: common
  envelope plus provider capability metadata.
- A large migration could destabilize working features. Mitigation: strangler
  migration through adapters and event compatibility.

## Alternatives considered

| Alternative | Benefit | Cost | Decision |
|-------------|---------|------|----------|
| Runtime per engineering concept | explicit names | fragmented loop and lifecycle inflation | rejected |
| Provider owns the whole agent loop | rapid provider integration | loses Vestara policy, evidence, and portability | rejected |
| One monolithic agent service | simple deployment | weak ownership and testability | rejected |
| Harness coordinating bounded runtimes and services | coherent loop with replaceable specialists | requires careful contracts | accepted |

## Migration

No big-bang rewrite is authorized. Existing `WorkspaceRuntime`, kernel,
services, provider routing, verification, telemetry, tools, and graph remain in
service. Migration proceeds through additive thread/item schemas, a harness
coordinator over current services, unified tool adapters, and durable event
storage. Obsolete runtime names are retired only after consumers migrate and
evidence proves equivalent behavior.

## Implementation evidence

The additive Harness Foundation is implemented and verified; the complete
target architecture remains partial.

- Repository: `evillan0315/vestara-ai-core`
- Implementation reference: `4a76027`
- `packages/agent-harness`
- `packages/thread-runtime`
- `packages/tool-runtime`
- `packages/policy-engine`
- `packages/verification`

## Official alignment references

- [Codex App Server](https://developers.openai.com/codex/app-server) — thread,
  turn, item, resume, fork, compact, steer, interrupt, approval, and streaming
  contracts.
- [Codex sandboxing and approvals](https://developers.openai.com/codex/security)
  — bounded execution and human authorization.
- [Codex worktrees](https://developers.openai.com/codex/app/worktrees) — isolated
  parallel changes.

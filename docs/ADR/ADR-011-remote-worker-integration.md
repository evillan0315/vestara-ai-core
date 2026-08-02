---
id: "adr-011"
adr: "ADR-011"
title: "Remote Worker — Docker, CI, MCP Integration"
category: "implementation"
version: 1.0
date: "2026-08-03"
status: "accepted"
owner: "@chief-architect"
last-reviewed: "2026-08-03"
next-review: "2026-11-03"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
tags: ["worker", "docker", "ci", "mcp", "remote", "execution"]
referenced_by:
  - type: "blueprint"
    target: "00-governance/04-decision-log.md (ADR-025 Worker Model & Capability Scheduling)"
  - type: "runtime"
    target: "@vestara/worker"
  - type: "runtime"
    target: "@vestara/workflow-orchestrator (PCS-027 distributed cluster)"
influences:
  - "DevOps Engineer"
  - "AI Engineer"
---

# ADR-011 — Remote Worker (Docker, CI, MCP Integration)

## Context

ADR-025 defines the Worker as the execution abstraction: executors declare
capabilities and capacity, accept job assignments, and report results. The
Blueprint lists `Docker | CI | Remote | MCP` as executor classes. Before this
ADR, `@vestara/worker` shipped all five worker types as identical 19-line stubs
that always returned a synthetic `success` — they never actually executed
anything.

The PCS-027 distributed worker cluster (`@vestara/workflow-orchestrator`
`src/distributed/`) provides orchestration-task dispatch over a WebSocket
transport, but that operates on `WorkflowTask`s, not the `Job`-based Worker
contract, and must not be coupled into the worker package.

## Decision

Implement the four executor workers in `@vestara/worker`, dependency-light
(zero new third-party dependencies), with execution parameters carried on
`WorkerDefinition.labels`:

- **`DockerWorker`** — invokes the `docker run` CLI via `child_process`
  (no dockerode). Image from `labels.image`, extra args from `labels.runArgs`.
- **`CIWorker`** — executes a shell command via a subprocess (`labels.command`,
  or a `build`/`test`/`lint` default). Runs through the shell to support
  quoting/globbing.
- **`MCPWorker`** — a minimal MCP client: spawns an MCP server subprocess
  (`labels.server`) and speaks JSON-RPC over stdio — `initialize` handshake
  then `tools/call` (`labels.tool`, default `execute`).
- **`RemoteWorker`** — dispatches to a remote executor through an injected
  `RemoteJobDispatcher` (composition root wires the PCS-027 dispatcher), or
  performs an HTTP POST to `labels.remoteUrl` when no dispatcher is injected.

A shared `runCommand` helper provides bounded, non-interpolated subprocess
execution with timeout for the exec workers.

## Alternatives Considered

- **dockerode / MCP SDK dependencies** — rejected: they add native/heavy
  deps; the CLI and stdio JSON-RPC protocols are stable and testable without
  them.
- **Couple `@vestara/worker` to `@vestara/workflow-orchestrator`** — rejected:
  the worker package should not depend on the orchestrator; dispatch is
  injected at the composition root.
- **A single generic executor worker** — rejected: distinct worker types carry
  distinct capabilities and trust levels, which the scheduler matches on
  (ADR-025).

## Trade-offs

- The Docker/CI/MCP workers require their host tooling (`docker` CLI, a shell,
  an MCP server) to be present; failures surface as `failure` job results.
- MCP support is minimal (initialize + tools/call); full MCP resource/prompt
  support is future work.
- Remote dispatch without an injected dispatcher relies on a configured URL
  and the host's `fetch`.

## Consequences

- All five worker types now execute real work instead of returning synthetic
  success.
- Executors remain capability-matched by the scheduler (ADR-025) and observed
  through the kernel's failure budgets and quarantine (ADR-009).
- Composition-root hosts can wire `RemoteWorker` to the PCS-027 cluster
  dispatcher without coupling the worker package to the orchestrator.

---

- Supersedes: none
- Dependencies: `@vestara/types`, `@vestara/runtime`, `@vestara/job` (existing)
- Implements (blueprint): ADR-025, `00-governance/07-ai-operating-system-architecture.md`
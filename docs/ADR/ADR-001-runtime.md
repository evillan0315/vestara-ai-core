---
id: adr-001
adr: ADR-001
title: Runtime Model
category: foundation
version: 1.0
date: 2026-07-31
status: accepted
author: @chief-architect
deciders: "["@chief-architect", "@engineering-manager"]"
tags: "["runtime", "lifecycle", "state-machine", "kernel"]"
referenced_by: 
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# ADR-001 — Runtime Model

## Context

Every Vestara capability (workspace, agents, filesystem, verification) must follow the
same lifecycle so the kernel can boot, monitor, recover, and shut down services in a
deterministic order. Without a shared lifecycle contract, each service would manage its
own state, breaking health aggregation, dependency ordering, and recovery.

## Decision

Introduce `@vestara/runtime` as the base class for all runtime services, with:

- A `VestaraService` lifecycle: `initialize() → start() → stop() → health() → dispose()`.
- State transitions via `@vestara/state-machine` (generic, zero-dependency):
  `created → initializing → running → stopped`, plus
  `degraded / recovering / quarantined / failed / destroyed`.
- `RuntimeGroup` composes runtimes with dependency resolution and aggregate health.
- `DefaultKernel` orchestrates the boot sequence (job manager, recovery manager, task
  scheduler, worker manager) and wires foundation services.

## Alternatives Considered

- **Per-service ad-hoc state**: rejected — no uniform health/ordering, hard to recover.
- **Heavy framework (e.g., NestJS modules)**: rejected — violates the zero-dependency,
  minimal-kernel design; Runtime is intentionally thin.

## Trade-offs

- Uniform lifecycle adds ceremony to simple services, but buys deterministic boot,
  health aggregation, and recovery.
- The state machine is generic; each runtime supplies its own transition table,
  keeping the library reusable beyond Vestara.

## Consequences

- New runtimes must implement the `VestaraService` contract to participate in the
  kernel boot sequence.
- `RuntimeGroup` + `Runtime` instances are the execution-layer instance of the
  coordinator-composes-specialists invariant.

---

- Supersedes: none
- Dependencies: none

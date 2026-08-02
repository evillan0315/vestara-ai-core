---
id: "adr-006"
adr: "ADR-006"
title: "Resource Ownership & Locking"
category: "implementation"
version: 1.0
date: "2026-08-03"
status: "accepted"
owner: "@chief-architect"
last-reviewed: "2026-08-03"
next-review: "2026-11-03"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
tags: ["ownership", "locking", "resources", "concurrency", "kernel", "state-machine"]
referenced_by:
  - type: "blueprint"
    target: "00-governance/04-decision-log.md (ADR-027 Ownership & Resource Locking)"
  - type: "runtime"
    target: "@vestara/ownership"
  - type: "runtime"
    target: "@vestara/kernel"
influences:
  - "Backend Engineer"
---

# ADR-006 — Resource Ownership & Locking

## Context

Multiple runtimes access shared resources (files, repositories, databases).
Concurrent writes cause conflicts. Without ownership, no runtime is accountable
for a resource's state. The Blueprint decision ADR-027 establishes the
principle: every resource has an owner (the runtime that created it), ownership
grants write permission, other runtimes must request write access, and resource
locking prevents concurrent write conflicts with lock timeouts preventing
deadlock.

## Decision

Introduce `@vestara/ownership`, a dependency-light package (depends only on
`@vestara/types`) with two cooperating abstractions:

- **`OwnershipRegistry`** — records who owns which resource. `claim` /
  `ownerOf` / `isOwner` / `release` / `list`. Ownership is a claim, not a lock:
  it answers accountability.
- **`ResourceLockManager`** — keyed write locks with per-resource `timeoutMs`
  expiry (deadlock prevention). `acquire` returns `acquired` | `held`
  (reentrant) | `busy` (held by another runtime) and steals expired locks;
  `release` is holder-checked; `isHeld` / `holderOf` / `sweepExpired` maintain
  the table. Locks expire and are swept, so a crashed runtime cannot deadlock
  the system.

The Kernel owns an `OwnershipRegistry` + `ResourceLockManager` as composition
root infrastructure, mirroring how it already owns the scheduler and job
manager (kernel orchestrates, never implements).

## Alternatives Considered

- **A single lock table with no ownership registry** — rejected: ownership
  (accountability) and locking (concurrency control) answer different questions;
  collapsing them makes "who is accountable" ambiguous when a lock expires.
- **Promise-based async mutexes (e.g. an `acquireAsync`)** — deferred: the
  current API is synchronous and caller-driven, matching the deterministic,
  non-blocking style of the scheduler. An async variant can be layered later.

## Trade-offs

- Sync `acquire` means callers must check the result and retry; no await-based
  queueing is provided.
- ISO-string expiry comparison is millisecond-granular; sub-millisecond
  boundaries are not distinguished, which is acceptable for resource locks.
- Reentrant acquisition defaults on for the same runtime, which keeps nested
  ownership simple at the cost of not detecting accidental double-claiming.

## Consequences

- Writing runtimes get a canonical, deterministic ownership + lock primitive.
- Expiry + sweep give automatic deadlock recovery for crashed holders.
- This is the natural input to the Decision Pipeline (ADR-007/ADR-035):
  ownership answers "who may write" before the execution stage runs.

---

- Supersedes: none
- Dependencies: `@vestara/types`
- Implements (blueprint): ADR-027, `00-governance/07-ai-operating-system-architecture.md`
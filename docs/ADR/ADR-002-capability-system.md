---
id: adr-002
adr: ADR-002
title: Capability System
category: implementation
version: 1.0
date: 2026-07-31
status: accepted
author: @chief-architect
deciders: "["@chief-architect", "@ai-engineer"]"
tags: "["capabilities", "agents", "permissions", "security"]"
referenced_by: 
influences: 
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# ADR-002 — Capability System

## Context

Agents can reason and plan, but they must not touch the filesystem (or any resource)
directly. The earlier agent layer exposed a read-only `AgentFileSystem` view, and some
services wrote files bypassing all sandboxing. We needed a single, auditable boundary
that turns agent intent into permission-gated, sandboxed operations.

## Decision

Introduce a named capability model with a manager as the only entry point:

```
Agent → requests capability → AgentCapabilityManager → runtime adapter → operation
```

- `AgentCapabilityManager` resolves a capability name to a `(resource, action)`
  permission gate (e.g. `filesystem.write` → `repository:modify`).
- Capabilities are namespaced (`filesystem.*`), described, risk-classified, and may
  require a reason or approval.
- Agents never receive the runtime adapter; they receive capability execution results
  (`FsObservation`).
- `AgentCapability` domain strings (e.g. `code-generation`) remain descriptive; the
  permission-gated `(resource, action)` model is the enforcement mechanism.

## Alternatives Considered

- **Expose the runtime adapter directly**: rejected — no per-agent gating, no audit.
- **Prompt-based constraints only**: rejected — LLM output is not a security boundary.
- **Per-tool hardcoded checks**: rejected — duplication, drift, no uniform audit.

## Trade-offs

- One indirection layer per capability call; acceptable relative to the safety and
  audit gains.
- Capability names must be curated (namespace discipline) to keep the catalog usable.

## Consequences

- New resource domains (network, database, shell) extend the manager with the same
  gated contract.
- All agent filesystem access now flows through
  `AgentCapabilityManager → FilesystemRuntime` (see ADR-003).

---

- Supersedes: the read-only `AgentFileSystem` interface on `AgentRuntime`
- Dependencies: ADR-001, ADR-003

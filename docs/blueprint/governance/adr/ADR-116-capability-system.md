---
id: "adr-116"
adr: "ADR-116"
title: "Capability System — Permission-Gated Agent Access"
category: "implementation"
version: 1.0
date: "2026-08-02"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@ai-engineer"]
consulted: ["@security-engineer"]
informed: ["@team"]
tags: ["capabilities", "agents", "permissions", "security", "reconciliation"]
depends_on: ["adr-103", "adr-104", "adr-111", "adr-117"]
referenced_by:
  - type: "runtime"
    target: "vestara-ai-core/packages/workspace/src/agent-capability-manager.ts"
  - type: "runtime"
    target: "vestara-ai-core/packages/workspace/src/agent-capability.ts"
  - type: "blueprint"
    target: "05-ai-core/agent-runtime.md"
---

## Context

Agents can reason and plan, but they must never touch the filesystem (or any other
resource) directly. The implementation previously exposed a read-only
`AgentFileSystem` view on `AgentRuntime`, and several services wrote files bypassing
all sandboxing. Prompt constraints alone are not a security boundary. Vestara needs a
single, auditable, permission-gated boundary between agent intent and execution.

## Decision

Introduce a named capability model with a manager as the **only** entry point:

```
Agent → requests capability → AgentCapabilityManager → runtime adapter → operation
```

- `AgentCapabilityManager` resolves a capability name to a `(resource, action)`
  permission gate (e.g. `filesystem.write` → `repository:modify`).
- Capabilities are namespaced (`filesystem.*`), described, risk-classified, and may
  require a reason or approval.
- Agents never receive the runtime adapter; they receive capability execution
  results (`FsObservation`).
- Domain capability strings (e.g. `code-generation`) remain descriptive; the
  `(resource, action)` permission model is the enforcement mechanism.

## Alternatives Considered

- **Expose the runtime adapter directly**: rejected — no per-agent gating, no audit.
- **Prompt-based constraints only**: rejected — LLM output is not a security boundary.
- **Per-tool hardcoded checks**: rejected — duplication, drift, no uniform audit trail.

## Trade-offs

- One indirection layer per capability call; accepted for the safety and audit gains.
- Capability names must be curated (namespace discipline) to keep the catalog usable.

## Consequences

- All agent filesystem access flows through
  `AgentCapabilityManager → FilesystemRuntime` (ADR-117).
- New resource domains (network, database, shell) extend the manager with the same
  gated contract.
- Implementation ADRs: `vestara-ai-core/docs/ADR/ADR-002-capability-system.md`.

---

- Supersedes: the read-only `AgentFileSystem` interface on `AgentRuntime`
- Dependencies: ADR-103, ADR-104, ADR-111, ADR-117

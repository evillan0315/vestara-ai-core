---
title: PCS-024 — Agent Filesystem Capabilities
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# PCS-024 — Agent Filesystem Capabilities

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-024 |
| Name | Agent Filesystem Capabilities |
| Command | `POST /api/agents/:id/capabilities` · `filesystem.*` tools |
| Version | 1.0 |
| Status | Implemented (v0.9) |
| Prerequisite | PCS-007 Agent Runtime, Filesystem Runtime |

> **Canonical reference**: the architectural context for this capability (capability
> boundary, agent lifecycle, filesystem safety model) lives in
> [`docs/Architecture/Agent-Orchestration.md`](Architecture/Agent-Orchestration.md)
> and ADRs [ADR-002](ADR/ADR-002-capability-system.md),
> [ADR-003](ADR/ADR-003-filesystem-runtime.md). This spec focuses on the capability
> model and its safety controls.

---

## Goal

Give agents controlled read/write/update/delete access to workspace files through a
named **capability boundary**. The LLM reasons; agents request capabilities; a
Capability Manager authorizes; the Filesystem Runtime executes. No code path allows
an LLM or agent to touch the filesystem directly.

## Core Invariant

```
LLM = reasoning
Planner = decides actions
Capability Manager = authorizes
Filesystem Runtime = executes controlled operations
Understanding Runtime = interprets results
Memory / Context = preserves knowledge
```

## Execution Flow

```
Task
  ↓
Planner
  ↓
Capability Resolver (agent permissions → capability)
  ↓
AgentCapabilityManager.execute(agent, capability, input)
  ↓
FilesystemRuntime (workspace sandbox · approval gates · dry-run · history)
  ↓
FsObservation
  ↓
session.storeMemory('event', observation) → Understanding Runtime
```

## Capability Model

```typescript
interface AgentFilesystemCapability {
  name: 'filesystem.read' | 'filesystem.write' | 'filesystem.update' |
        'filesystem.delete' | 'filesystem.search' | 'filesystem.references' |
        'filesystem.list' | 'filesystem.stat' | 'filesystem.exists' |
        'filesystem.create' | 'filesystem.rename' | 'filesystem.copy';
  execute(input: AgentCapabilityInput): Promise<AgentCapabilityResult>;
}
```

Every capability maps to a `(resource, action)` permission gate:

| Capability | Permission | Risk | Approval |
|-----------|-----------|------|----------|
| filesystem.read / list / stat / exists / search / references | repository:read | low | no |
| filesystem.write / create / update / rename / copy | repository:modify | medium | no |
| filesystem.delete | repository:modify | high | **required** |

Mutating capabilities require a `reason` so the operation history is auditable.

## Safety Controls (enforced by FilesystemRuntime)

- Workspace root containment — absolute paths and `..` traversal rejected.
- Deny list — `.env`, `credentials.json`, `.git-credentials`, etc. always denied.
- Approval gate — high-risk operations (delete) are held pending until approved.
- Dry-run mode — validate and gate without touching the disk.
- Operation history — bounded record of every operation + change summary.
- Structured observations — `{ operation, file, status, changes: { added, removed } }`.

## Feedback Loop

After each capability execution the observation is stored via
`WorkspaceSession.storeMemory('event', ...)`. `DefaultUnderstandingEngine.observe()`
already surfaces recent memories, so future planning sees the new workspace state.

## Files

- Capability model: `packages/workspace/src/agent-capability.ts`
- Capability manager: `packages/workspace/src/agent-capability-manager.ts`
- Tool exposure: `packages/workspace/src/capability-tool-provider.ts`
- Executor: `packages/filesystem-runtime/src/index.ts`
- Agent integration: `packages/workspace/src/agent-runtime.ts` (`executeCapability`)
- Wiring: `apps/api/src/workspace-context.ts`, `apps/cli/src/context/cli-context.ts`

## Related Documents

- PCS-007 — Agent Runtime
- PCS-025 — Multi-Agent Project Management (workflow orchestration)
- Architecture — `docs/Architecture/Agent-Orchestration.md`
- ADR-002 — Capability System, ADR-003 — Filesystem Runtime
- `packages/filesystem-runtime/__tests__/filesystem-runtime.test.ts`
- `packages/workspace/__tests__/agent-capability.test.ts`

---
title: PCS-011 — Remote Agent Execution
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# PCS-011 — Remote Agent Execution

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-011 |
| Name | Remote Agent Execution |
| Version | 1.0 |
| Status | Implemented (v1.2) |
| Prerequisite | Agent Runtime (v0.8), Workspace UI (v1.1) |

---

## Goal

Introduce execution isolation for agents. Agents currently run in-process alongside the runtime. v1.2 introduces a worker abstraction that supports in-process, subprocess, and remote execution models, with streaming logs, resource management, and permission enforcement.

## Architecture

```
Agent Coordinator
      |
      +── AgentWorker (in-process)
      |     - synchronous execution
      |     - direct memory access
      |
      +── AgentWorker (subprocess)
      |     - isolated Node.js process
      |     - stdio/pipe communication
      |     - resource limits
      |
      +── AgentWorker (remote)
            - network communication
            - authentication
            - streaming events
```

## AgentWorker

```typescript
type WorkerType = 'in-process' | 'subprocess' | 'remote';

interface WorkerConfig {
  type: WorkerType;
  agentId: string;
  timeout: number;
  maxMemory?: number;
  allowedCapabilities: string[];
}

interface WorkerEvent {
  id: string;
  executionId: string;
  type: 'log' | 'output' | 'progress' | 'error' | 'complete';
  message: string;
  timestamp: string;
}
```

## AgentCoordinator

```typescript
interface AgentCoordinator {
  dispatch(agentId: string, task: string): Promise<WorkerHandle>;
  getEvents(executionId: string): AsyncIterable<WorkerEvent>;
  cancel(executionId: string): Promise<void>;
  getStatus(executionId: string): Promise<ExecutionStatus>;
}
```

## Related Documents

- PCS-007: `docs/PCS-007-agent-runtime.md`
- Agent types: `packages/workspace/src/types.ts`

# PCS-007 — Agent Runtime

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-007 |
| Name | Agent Runtime |
| Command | `vestara agent run <agent> <task>` |
| Version | 1.0 |
| Status | Implemented (v0.8) |
| Prerequisite | Completed Vestara lifecycle (open through collaborate) |

---

## Goal

Introduce the Agent Runtime Layer — transitioning from a single AI assistant to a governed ecosystem of specialized AI agents collaborating through artifacts. Agents do not control repositories directly; they operate through the Vestara lifecycle: Understand → Plan → Execute → Verify → Request Approval.

## Core Invariant

```
Agents can act.
Artifacts provide accountability.
Humans retain authority.
```

## Agent Definition

```typescript
interface AgentDefinition {
  id: string;
  name: string;
  role: AgentRole;
  capabilities: AgentCapability[];
  permissions: AgentPermission[];
  status: 'active' | 'disabled';
  createdAt: string;
}

type AgentRole = 'architect' | 'developer' | 'verifier' | 'documenter';

type AgentCapability =
  | 'architecture-analysis'
  | 'design-review'
  | 'dependency-analysis'
  | 'code-generation'
  | 'refactoring'
  | 'bug-fixing'
  | 'testing'
  | 'diagnostics'
  | 'quality-analysis'
  | 'documentation'
  | 'summarization'
  | 'knowledge-management';
```

## Agent Permission Model

```typescript
interface AgentPermission {
  resource: 'repository' | 'changeset' | 'verification' | 'collaboration' | 'plan' | 'knowledge';
  action: 'read' | 'create' | 'modify' | 'execute';
  approvalRequired: boolean;
}
```

## Agent Execution

```typescript
interface AgentExecution {
  id: string;
  agentId: string;
  task: string;
  inputArtifacts: string[];
  outputArtifacts: string[];
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
}
```

## Built-in Agents

| Agent | Role | Capabilities | Permissions |
|-------|------|-------------|-------------|
| Architect | architect | architecture-analysis, design-review, dependency-analysis | Repository: read, Knowledge: read/create, Plan: create |
| Developer | developer | code-generation, refactoring, bug-fixing | Repository: read/modify, ChangeSet: create, Plan: read |
| Verifier | verifier | testing, diagnostics, quality-analysis | Repository: read, ChangeSet: read, Verification: create |
| Documenter | documenter | documentation, summarization, knowledge-management | Knowledge: read/create, Explanation: create |

## Agent Workflow

```
Agent Request
      ↓
Permission Check
      ↓
Agent Execution
      ↓
Artifact Generation
      ↓
Verification (automatic)
      ↓
Collaboration Record (for human approval)
```

No agent can bypass: Change Set, Verification, or Approval.

## Related Documents

- PCS-001 through PCS-006: The lifecycle agents operate within
- Agent types: `packages/workspace/src/types.ts`
- AgentRuntime: `packages/workspace/src/agent-runtime.ts`
- AgentStorage: `packages/workspace/src/agent-storage.ts`
- Permission: `packages/workspace/src/agent-permission.ts`

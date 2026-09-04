---
title: PCS-009 — Engineering Session
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# PCS-009 — Engineering Session

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-009 |
| Name | Engineering Session |
| Command | `vestara workspace` |
| Version | 1.0 |
| Status | Implemented (v1.0) |

---

## Goal

Combine all prior capabilities into a unified, session-driven operating model. An engineering session represents a complete engineering objective — from understanding through planning, execution, verification, governance, and agent coordination — within a single persistent context.

## Core Invariant

```
Automation may execute. Governance decides.
```

## Artifact Model

### EngineeringSession

```typescript
type SessionStatus = 'created' | 'planning' | 'executing' | 'verifying' | 'reviewing' | 'completed' | 'failed';

interface SessionParticipant {
  id: string;
  type: 'human' | 'agent';
  role: string;
}

interface EngineeringSession {
  id: string;
  title: string;
  objective: string;
  status: SessionStatus;
  participants: SessionParticipant[];
  artifacts: string[];
  createdAt: string;
  completedAt?: string;
}
```

### AgentWorkflow

```typescript
interface WorkflowStep {
  order: number;
  agentId: string;
  requiredArtifact: 'plan' | 'changeset' | 'verification';
  approvalRequired: boolean;
}

interface AgentWorkflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
}
```

### WorkspaceEvent

```typescript
interface WorkspaceEvent {
  id: string;
  sessionId: string;
  type: string;
  actor: 'human' | 'agent' | 'system';
  artifactId: string;
  timestamp: string;
}
```

## Built-in Workflow: Feature Development

```
1. Architect → Plan
2. Developer → Change Set
3. Verifier → Verification
4. Human → Approval
```

## User Experience

### Create a session

```
vestara-ai-core > workspace create "Implement OAuth authentication"

  Engineering Session SES-1 created.
  Objective: Implement OAuth authentication
  Status: created

  Participants:
    • Human: owner

  Available agents: architect, developer, verifier, documenter

  Run: workspace run SES-1
```

### Run a session

```
vestara-ai-core > workspace run SES-1

  Running session SES-1: Implement OAuth authentication
  ──────────────────────────────────────────────────────

  → Step 1/4: Architect agent analyzing...
    ✓ Plan created (P-2)

  → Step 2/4: Developer agent implementing...
    ✓ Change Set created (CS-3)

  → Step 3/4: Verifier agent verifying...
    ✓ Verification passed (VR-2)

  → Step 4/4: Human approval required
    Status: reviewing

    Use "collab approve <cr-id>" to approve.

  Session SES-1: 3/4 steps completed, awaiting human approval
```

### Session status

```
vestara-ai-core > workspace status SES-1

  Session SES-1: Implement OAuth authentication
  Status: reviewing

  Artifacts:
    • Plan P-2 (from architect)
    • Change Set CS-3 (from developer)
    • Verification VR-2 (from verifier)
    • Collaboration CR-2 (awaiting approval)

  Events:
    • agent: Architect completed → plan:P-2
    • agent: Developer completed → changeset:CS-3
    • agent: Verifier completed → verification:VR-2
    • system: Awaiting human approval
```

## Related Documents

- PCS-001 through PCS-008: Combined capabilities
- Types: `packages/workspace/src/types.ts`
- SessionService: `packages/workspace/src/session-service.ts`

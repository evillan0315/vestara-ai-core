---
title: PCS-003 — Planning
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# PCS-003 — Planning

**Product Capability Specification**

| Field | Value |
| ------- | ------- |
| ID | PCS-003 |
| Name | Planning |
| Command | `vestara plan <goal>` |
| Version | 1.0 |
| Status | Implemented (v0.4) |
| Prerequisite | `vestara open` (PCS-001) |

---

## Goal

Enable a developer working within an opened workspace to transform understanding into executable intent. A plan is a first-class durable artifact with its own lifecycle, identity, and traceability — not a conversational summary.

## Inputs

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `<goal>` | Yes | — | Natural-language description of what the developer wants to accomplish |

The command is always issued within an active workspace session. The goal is interpreted in the context of the existing `RepositoryWorkspace` — its analysis, knowledge index, explanations, and memory.

## Outputs

| Artifact | Description |
|----------|-------------|
| `Plan` | First-class domain object with identity, lifecycle, tasks, and traceability |
| Terminal display | Formatted plan summary rendered to the user |

## Plan Artifact

```typescript
interface Plan {
  id: string;
  title: string;
  goal: string;
  scope: string[];
  assumptions: string[];
  constraints: string[];
  risks: Array<{ description: string; severity: 'low' | 'medium' | 'high' }>;
  tasks: Task[];
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
  workspaceId: string;
  parentExplanations: string[];  // IDs of explanations that informed this plan
}

interface Task {
  id: string;
  summary: string;
  description: string;
  files: string[];          // Files that need to be changed
  dependencies: string[];   // Task IDs this depends on
  status: TaskStatus;
  effort: 'small' | 'medium' | 'large';
}

type PlanStatus = 'draft' | 'proposed' | 'approved' | 'executing' | 'completed' | 'cancelled';
type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'blocked';
```

## Pipeline

```
User: plan <goal>
         │
         ▼
PlanningService.createPlan(goal, session)
         │
         ├── 1. Analyze goal against RepositoryWorkspace
         │     (entry points, risks, package map, indexed knowledge)
         │
         ├── 2. Retrieve relevant explanations from memory
         │
         ├── 3. Generate plan via provider (best-effort)
         │     System prompt includes goal + workspace context
         │     Returns structured Plan with tasks
         │
         ├── 4. Store Plan in workspace (SQLite)
         │
         ├── 5. Store in memory as a decision artifact
         │
         └── Output: Formatted plan + Plan ID
```

## User Experience

### Create a plan

```
vestara-ai-core > plan add input validation to the provider-runtime package

  Analyzing workspace...
  Consulting explanations...
  Generating plan...

  Plan P-1: Add input validation to provider-runtime
  ────────────────────────────────────────────────────
  Status: Draft

  Goal:
    Add input validation to the provider-runtime package to
    ensure provider configurations are validated before use.

  Scope:
    packages/provider-runtime/src/

  Assumptions:
    • Validation should not introduce new dependencies
    • Existing tests should continue to pass

  Risks:
    • Large number of provider config variants may make validation complex

  Tasks:
    1. Define validation schema for provider configuration
       Files: packages/provider-runtime/src/types.ts
       Effort: small
       Status: pending

    2. Implement validation function
       Files: packages/provider-runtime/src/validate.ts
       Dependencies: Task 1
       Effort: medium
       Status: pending

    3. Wire validation into provider registration flow
       Files: packages/provider-runtime/src/index.ts
       Dependencies: Task 2
       Effort: small
       Status: pending

    4. Add unit tests for validation
       Files: packages/provider-runtime/src/__tests__/validate.test.ts
       Dependencies: Task 2
       Effort: small
       Status: pending

  Use "plan approve P-1" to approve, "plan tasks P-1" to view tasks.

vestara-ai-core >
```

### Approve a plan

```
vestara-ai-core > plan approve P-1

  Plan P-1 approved. Status: Proposed → Approved

  Next: Tasks are ready for implementation.
  Use "vestara implement P-1" to begin work.
```

### List plans

```
vestara-ai-core > plan list

  Plans in workspace:
  ──────────────────────────────────────
  P-1   Draft     Add input validation to provider-runtime
  P-2   Approved  Refactor logger to use structured context
  P-3   Completed Extract configuration into standalone package

vestara-ai-core >
```

### View a plan

```
vestara-ai-core > plan show P-1

  Plan P-1: Add input validation to provider-runtime
  Status: Approved
  Created: 2026-07-23T16:30:00Z
  Tasks: 4 total, 0 completed
  ...
```

### No active workspace

```
$ vestara plan add input validation

  Error: No active workspace. Run `vestara open .` first.
```

## Success Metrics

| Metric | Target |
| -------- | -------- |
| Plan created for a valid goal | Always |
| Plan stored as a durable artifact | Always |
| Plan tasks reference specific files | Always |
| Plan tasks have dependencies | When applicable |
| Plan is reproducible (same goal → similar plan) | High |
| Response time (with provider) | <10 seconds |
| Deterministic fallback when provider unavailable | Yes |
| No architectural contracts violated | Always |

## Acceptance Criteria

- [ ] `vestara plan <goal>` in an active workspace creates a Plan artifact
- [ ] Plan is stored in SQLite (not ephemeral)
- [ ] Plan has an ID that can be referenced by subsequent commands
- [ ] Plan tasks reference specific files in the repository
- [ ] `plan show <id>` displays a stored plan
- [ ] `plan list` displays all plans in the workspace
- [ ] `plan approve <id>` transitions the plan to approved status
- [ ] Provider unavailable → deterministic plan with workspace context
- [ ] No active workspace → clear error message
- [ ] No architectural contracts violated

## Architecture Traceability

```
CLI (thin adapter)
  ↓
WorkspaceSession
  ├── WorkspaceRuntime.getSession()
  ├── WorkspaceSession.profile      (RepositoryProfile)
  ├── WorkspaceSession.knowledge    (for target file search)
  ├── WorkspaceSession.memory       (for prior explanations)
  └── New: PlanStorage              (SQLite-backed plan persistence)
```

## Implementation Strategy

The planning capability will be implemented as:

1. **Plan types** in `@vestara/workspace` types — `Plan`, `Task`, `PlanStatus`, `TaskStatus`
2. **PlanStorage** — SQLite-backed persistence for plans (follows existing pattern from `KnowledgeStorage` and `StateRuntime`)
3. **PlanningService** — orchestrates goal analysis, explanation retrieval, plan generation, and persistence
4. **REPL commands** — `plan <goal>`, `plan show`, `plan list`, `plan approve`

The service has two tiers:

| Tier | Method | Always works? | Provider needed? |
|------|--------|---------------|------------------|
| Deterministic | Analyze goal against workspace context, produce task framework | No | — |
| AI-synthesized | Generate structured plan from goal + context | No | Yes |

## Related Documents

- Product Principles: `docs/PRODUCT-PRINCIPLES.md`
- PCS-001: `docs/PCS-001-repository-comprehension.md`
- PCS-002: `docs/PCS-002-explain.md`
- Workspace types: `packages/workspace/src/types.ts`
- WorkspaceSession: `packages/workspace/src/workspace-session.ts`
- Workspace REPL: `apps/cli/src/repl-workspace.ts`

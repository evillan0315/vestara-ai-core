# PCS-004 — Implementation

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-004 |
| Name | Implementation |
| Command | `vestara implement <plan-id>` |
| Version | 1.0 |
| Status | Implemented (v0.5) |
| Prerequisite | An approved `Plan` in the workspace |

---

## Goal

Enable a developer to transform an approved `Plan` into a durable `Change Set` — an execution artifact that records every file modification with full traceability back to the originating plan, tasks, and intent.

## Inputs

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `<plan-id>` | Yes | — | ID of an approved plan (e.g., `P-1`) |

The command operates within an active workspace session. The plan is read from `PlanStorage`. The plan must have `status === 'approved'` for implementation to proceed.

## Outputs

| Artifact | Description |
|----------|-------------|
| `Change Set` | First-class execution artifact with file changes, diff, and traceability |
| Terminal display | Formatted change set showing files modified |
| Optional: filesystem writes | After explicit `apply` command |

## Change Set Artifact

```typescript
interface ChangeSet {
  id: string;
  planId: string;
  title: string;
  status: ChangeSetStatus;
  files: FileChange[];
  createdAt: string;
  appliedAt: string | null;
  workspaceId: string;
}

interface FileChange {
  path: string;
  originalContent: string;
  proposedContent: string;
  status: 'pending' | 'applied' | 'conflict' | 'skipped';
  taskId: string;          // Links to the Plan task that produced this change
}

type ChangeSetStatus = 'draft' | 'ready' | 'applied' | 'partial' | 'rolled-back';
```

## Pipeline

```
User: implement P-1
         │
         ▼
ImplementationService.execute(planId, session)
         │
         ├── 1. Load approved Plan from PlanStorage
         │
         ├── 2. For each task in the Plan:
         │     ├── Read current file contents
         │     ├── Generate proposed changes (AI or deterministic)
         │     └── Record FileChange
         │
         ├── 3. Create ChangeSet artifact (status: draft)
         │
         ├── 4. Present diff for user review
         │
         └── Output: ChangeSet ID + summary

User: implement apply CS-1
         │
         ▼
ImplementationService.apply(id)
         │
         ├── Write all proposed file changes to disk
         ├── Update ChangeSet status: ready → applied
         ├── Update Plan status: approved → executing
         └── Output: confirmation of applied changes
```

## User Experience

### Generate a change set

```
vestara-ai-core > implement P-1

  Loading plan P-1: "Add input validation to provider-runtime"
  Plan status: approved | Tasks: 4

  Generating changes...
  ──────────────────────────────────────────────────────
  ✓ T-1: Define validation schema
    → packages/provider-runtime/src/types.ts (+45 lines)

  ✓ T-2: Implement validation function
    → packages/provider-runtime/src/validate.ts (+120 lines)

  ✓ T-3: Wire validation into registration flow
    → packages/provider-runtime/src/index.ts (+12 lines, -4 lines)

  ✓ T-4: Add unit tests
    → packages/provider-runtime/src/__tests__/validate.test.ts (+85 lines)

  Change Set CS-1 created (draft)
  4 files changed | 262 insertions | 4 deletions

  Review with: implement show CS-1
  Apply with:  implement apply CS-1
```

### Review a change set

```
vestara-ai-core > implement show CS-1

  Change Set CS-1
  ──────────────────────────────────────────────────────
  Plan: P-1 (Add input validation to provider-runtime)
  Status: draft
  Created: 2026-07-23T16:55:00Z

  Files:
    packages/provider-runtime/src/types.ts
      +45 lines (new validation type definitions)
      Status: pending

    packages/provider-runtime/src/validate.ts
      +120 lines (new validation function)
      Status: pending

    packages/provider-runtime/src/index.ts
      +12 lines / -4 lines (wired into registration)
      Status: pending

    packages/provider-runtime/src/__tests__/validate.test.ts
      +85 lines (unit tests for validation)
      Status: pending
```

### Apply changes to disk

```
vestara-ai-core > implement apply CS-1

  Applying Change Set CS-1...
  ✓ packages/provider-runtime/src/types.ts
  ✓ packages/provider-runtime/src/validate.ts
  ✓ packages/provider-runtime/src/index.ts
  ✓ packages/provider-runtime/src/__tests__/validate.test.ts

  Change Set CS-1 applied.
  Plan P-1 status updated: approved → executing

  Next: verify with `vestara verify P-1`
```

### No approved plan

```
vestara-ai-core > implement P-1

  Plan P-1 status is "draft". Only approved plans can be implemented.
  Use "plan approve P-1" first.
```

### No active workspace

```
$ vestara implement P-1

  Error: No active workspace. Run `vestara open .` first.
```

## Success Metrics

| Metric | Target |
|--------|--------|
| Change Set created for approved plan | Always |
| Each task produces at least one FileChange | Always |
| File changes reference specific files | Always |
| Change Set includes before/after content | Always |
| `apply` writes changes to disk | Always |
| Plan status updated after apply | Always |
| AI provider unavailable | Deterministic placeholders with clear indication |
| No architectural contracts violated | Always |

## Acceptance Criteria

- [ ] `vestara implement <plan-id>` requires an approved plan
- [ ] Change Set is created with one FileChange per task
- [ ] Each FileChange records original and proposed content
- [ ] `implement show <cs-id>` displays file summaries
- [ ] `implement apply <cs-id>` writes changes to disk
- [ ] Plan status transitions: approved → executing
- [ ] Unknown plan ID returns clear error
- [ ] Plan not in approved status returns clear error
- [ ] No architectural contracts violated

## Implementation Strategy

The implementation capability will be built as:

1. **ChangeSet types** in `@vestara/workspace` types — `ChangeSet`, `FileChange`, `ChangeSetStatus`
2. **ChangeSetStorage** — SQLite-backed persistence (follows PlanStorage pattern)
3. **ImplementationService** — reads Plan tasks, generates file changes, manages Change Set lifecycle
4. **REPL commands** — `implement <plan-id>`, `implement show <cs-id>`, `implement apply <cs-id>`

Code generation tier:

| Tier | Method | Always works? |
|------|--------|---------------|
| Deterministic | Read-only: creates FileChange records with current content only (analysis mode) | Yes |
| AI-synthesized | Generates proposed content using provider with task context + file content | No |

## Related Documents

- Product Principles: `docs/PRODUCT-PRINCIPLES.md`
- PCS-003: `docs/PCS-003-plan.md` (Plan artifact consumed by implement)
- Plan types: `packages/workspace/src/types.ts`
- PlanStorage: `packages/workspace/src/plan-storage.ts`
- WorkspaceSession: `packages/workspace/src/workspace-session.ts`

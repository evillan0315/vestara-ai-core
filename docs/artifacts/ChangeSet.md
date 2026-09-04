---
title: ChangeSet Contract
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# ChangeSet Contract

**Version 1.0**

## Identity

- ID format: `CS-{N}` (sequential, e.g., `CS-1`)
- Namespace: per-workspace

## Lifecycle

```
Draft → Ready → Applied → Rolled-Back
          ↘         ↙
         Failed  Partial
```

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `planId` | string | Link to originating Plan |
| `files` | FileChange[] | Modified files with before/after content |

## Optional Fields (v2.6+)

| Field | Type | Description |
|-------|------|-------------|
| `assessmentId` | string | Link to ImpactAssessment |
| `decisionId` | string | Link to Decision |
| `summary` | object | Execution summary with health delta, risk, packages modified |

## Traceability

```
RepositoryWorkspace → Plan → ImpactAssessment → Decision → ChangeSet → VerificationReport
```

## Persistence

- SQLite table: `change_sets` in `.vestara/plans/plans.db`

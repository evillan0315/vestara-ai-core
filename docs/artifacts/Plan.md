# Plan Contract

**Version 1.0**

## Identity

- ID format: `P-{N}` (sequential, e.g., `P-1`, `P-2`)
- Namespace: per-workspace

## Lifecycle

```
Draft → Proposed → Approved → Executing → Completed
              ↘                       ↙
              Cancelled           Cancelled
```

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `goal` | string | Engineering objective |
| `tasks` | Task[] | Ordered work items |
| `status` | PlanStatus | Current lifecycle state |

## Relationships

- Optionally references `predictionId` (ImpactAssessment)
- Optionally references `decisionId` (Decision)
- Referenced by ChangeSet via `planId`

## Persistence

- SQLite table: `plans` in `.vestara/plans/plans.db`

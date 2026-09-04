---
title: Decision Contract
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Decision Contract

**Version 1.0**

## Identity

- ID format: `D-{timestamp}-{N}` (e.g., `D-1784856022809-1`)
- Namespace: per-workspace

## Lifecycle

```
Created → Accepted → (consumed by Implementation)
       ↘
      Rejected
```

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `recommendation` | string | What action is recommended |
| `confidence` | number | 0.0 — 1.0 |
| `alternatives` | Alternative[] | Other options considered with risk |
| `rationale` | string | Why this recommendation was made |

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `planId` | string | Link to evaluated Plan |
| `assessmentId` | string | Link to ImpactAssessment |
| `accepted` | boolean | Whether the recommendation was accepted |
| `acceptedBy` | string | Who accepted it |

## Relationships

- Consumes ImpactAssessment (via assessmentId)
- Consumes Plan (via planId)
- Referenced by ChangeSet via `decisionId`

## Persistence

- SQLite table: `decisions` in `.vestara/plans/plans.db`

# CollaborationRecord Contract

**Version 1.0**

## Identity

- ID format: `CR-{N}` (sequential, e.g., `CR-1`)
- Namespace: per-workspace

## Lifecycle

```
Draft → Submitted → Reviewing → Approved → Completed
                          ↘
                        Rejected
```

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `changeSetId` | string | Link to ChangeSet under review |
| `status` | ReviewStatus | Current lifecycle state |

## Key Sub-objects

- `Approval[]`: immutable append-only events (reviewer, decision, comment, timestamp)
- `CollaborationComment[]`: artifact-attached comments
- `Ownership`: owner, contributors, reviewers

## Invariants

- Approvals are append-only — never overwritten
- AI may never approve its own changes
- Status transitions follow a strict state machine

## Persistence

- SQLite tables: `collaboration_records`, `approvals`, `comments` in `.vestara/plans/plans.db`

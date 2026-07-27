# VerificationReport Contract

**Version 1.0**

## Identity

- ID format: `VR-{N}` (sequential, e.g., `VR-1`)
- Namespace: per-workspace

## Lifecycle

```
Pending → Running → Passed
                 ↘
                Failed
```

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `changeSetId` | string | Link to the verified ChangeSet |
| `checks` | VerificationCheck[] | Individual check results |
| `status` | VerificationStatus | Overall pass/fail |

## Check Types

| Type | Description |
|------|-------------|
| `filesystem` | Verify all ChangeSet files exist |
| `artifact-consistency` | Verify disk content matches proposed |
| `typecheck` | TypeScript compilation check |
| `test` | Test suite execution |
| `build` | Build validation |

## Relationships

- Referenced by PredictionAccuracy via `verificationId`
- Linked to ChangeSet via `changeSetId`

## Persistence

- SQLite table: `verification_reports` in `.vestara/plans/plans.db`

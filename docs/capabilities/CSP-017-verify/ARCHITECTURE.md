---
title: Architecture Design
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Architecture Design

## Service

`VerificationService` in `packages/workspace/src/verification-service.ts`

## Dependencies

| Dependency | Type | Purpose |
|-----------|------|---------|
| ChangeSetStorage | Storage | Load Change Set for file validation |
| VerificationStorage | Storage | Persist VerificationReport |
| PlanStorage | Storage | Load Plan for task completion check |
| AccuracyStorage | Storage | Record prediction accuracy |
| PluginRuntime | Optional | Fire after-verify hooks |

## Verification Pipeline

```
verify(changeSetId, session)
  │
  ├── Load ChangeSet
  ├── Run 5 checks (filesystem, consistency, typecheck, test, build)
  ├── Generate report
  ├── Fire after-verify hooks
  ├── Record prediction accuracy (if assessmentId exists)
  └── Persist VerificationReport
```

## Accuracy Tracking

After verification completes, if the ChangeSet has a linked ImpactAssessment:
1. Compare predicted health delta with actual health change
2. Store PredictionAccuracy record
3. Update running average error metric

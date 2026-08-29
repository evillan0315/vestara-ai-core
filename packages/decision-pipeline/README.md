# @vestara/decision-pipeline

ADR-035 decision pipeline — the invariant chain Permission → Policy → Execution → Verification → Trust → History.

## Usage

Import via workspace reference:

```
pnpm --filter @vestara/decision-pipeline build
```

## API

- `DecisionContext` — typed accumulation object; each stage populates exactly one field.
- `DecisionPipeline` — runs stages in fixed order, guards duplicate/unknown fields, short-circuits on permission denial.
- Stage adapters — `permissionStage`, `policyStage`, `executionStage`, `verificationStage`, `trustStage`.
- `HistoryRecorder` — append-only audit trail.

See [docs/](../../docs/) for capability specifications and architecture.

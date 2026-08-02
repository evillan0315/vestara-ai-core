# @vestara/intent

Intent model and planner — translates goals into ordered execution plans (ADR-026).

## Usage

Import via workspace reference:

```
pnpm --filter @vestara/intent build
```

## API

- `Intent` — state-machine-backed goal record (`submitted → planning → executing → completed | failed | cancelled`, `paused ⇄ executing`).
- `Planner` — deterministic goal → `ExecutionPlan` of jobs with dependency graph and estimated duration.
- `IntentManager` — lifecycle facade: submit, plan, approve, complete, cancel, pause, resume, fail.

See [docs/](../../docs/) for capability specifications and architecture.

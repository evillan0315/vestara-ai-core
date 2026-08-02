# @vestara/execution-center

Execution Center domain — DTOs and pure projections for the engineering execution surface.

Provides queue, metrics, approvals, and filesystem operation projections consumed by the Execution Center UI. All projections are pure functions that derive display-ready data from store records.

## Exports

- `buildQueue` — Build execution queue from source data
- `computeMetrics` — Compute execution metrics (total, completed, failed, running)
- `countFsOps` — Count filesystem operations in an execution
- `countPendingApprovals` — Count pending approvals
- `queueSummary` — Generate queue summary statistics

## Usage

```typescript
import { buildQueue, computeMetrics } from '@vestara/execution-center';

const queue = buildQueue(source);
const metrics = computeMetrics(source);
```

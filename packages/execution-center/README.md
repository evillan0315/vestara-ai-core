# @vestara/execution-center

## Overview

Execution Center domain — DTOs and pure projections for the engineering execution surface.

Provides queue, metrics, approvals, and filesystem operation projections consumed by the Execution Center UI. All projections are pure functions that derive display-ready data from store records.

## Responsibilities

- Build execution queue from source data
- Compute execution metrics (total, completed, failed, running)
- Count filesystem operations in an execution
- Count pending approvals
- Generate queue summary statistics

## Public API

```typescript
import { buildQueue, computeMetrics } from '@vestara/execution-center';

const queue = buildQueue(source);
const metrics = computeMetrics(source);
```

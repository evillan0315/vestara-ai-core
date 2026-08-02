# @vestara/workflow-projections

Canonical renderer-independent agent workflow projection with incremental event envelopes.

Both the TUI and Workspace UI consume this model so they always agree on workflow state. Provides the eight-stage workflow model, agent assignments, approval tracking, change sets, verification, and metrics.

## Features

- **Eight-Stage Model** — Canonical workflow stages (plan, implement, verify, etc.)
- **Incremental Envelopes** — `workflow.*` event protocol with monotonic sequences
- **Renderer-Independent** — Same projection consumed by TUI and Workspace UI
- **Agent Tracking** — Agent assignments, status, and metrics per stage

## Exports

```typescript
// Core projection
export * from './derive';   // Derive workflow state from events
export * from './events';   // Workflow event types
export * from './project';  // Project workflow state
export * from './types';    // TypeScript interfaces
```

## Usage

```typescript
import { deriveWorkflow, projectWorkflow } from '@vestara/workflow-projections';

const state = deriveWorkflow(events);
const projection = projectWorkflow(state);
```

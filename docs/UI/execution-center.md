---
title: Execution Center
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Execution Center

The Execution Center is the operational heart of the Workspace — the command
and control center for all AI-driven engineering activity. Where the
Documentation Center is the knowledge hub and the Diagnostic Center is the
observability hub, the Execution Center makes AI execution completely
transparent: every project, plan, task, agent, execution, approval, artifact,
and filesystem operation is observable in real time.

## Entrypoint

- Page: `apps/workspace/src/pages/Execution.tsx` → `apps/workspace/src/components/execution/ExecutionPage.tsx`
- Route: `/execution` (nav: Workspace → Execution)

## Architecture

```
apps/workspace/src/components/execution/
├── ExecutionPage.tsx      Layout: toolbar · cards · pipeline · tabs
├── ExecutionContext.tsx   Polling + session detail + persisted UI state
├── overview.tsx           Overview metric cards + metrics tab
├── pipeline.tsx           Multi-agent pipeline timeline + execution replay
├── projects.tsx           Project monitor
├── plans.tsx              Plan + task monitors
├── agents.tsx             Live agent states + executions
├── executions.tsx         Unified execution queue + sessions
├── artifacts.tsx          Artifact explorer + approval center
├── filesystem.tsx         Filesystem operations + event stream
├── traceability.tsx       Traceability / dependency graph (kind columns)
├── analyze.tsx            AI execution analysis
└── (execution.css imported by ExecutionPage)

apps/workspace/src/lib/execution.ts      Typed client + formatters
```

Supporting backend: `apps/api/src/routes/execution.ts` (aggregation + DTOs).

## Backend endpoints

| Route | Purpose |
|-------|---------|
| `GET /api/execution/dashboard` | composed snapshot: projects, plans, sessions, agents, executions, approvals, queue, metrics, pipeline |
| `GET /api/execution/queue` | unified queue (sessions + plans + tasks + executions) with status summary |
| `GET /api/execution/timeline?sessionId=` | fixed orchestration pipeline + a session's timeline |
| `GET /api/execution/agents` | agent states + executions |
| `GET /api/execution/artifacts` | change sets, verifications, collaboration, executions |
| `GET /api/execution/approvals` | pending approvals (collaboration + session approvals) |
| `GET /api/execution/filesystem` | filesystem capability operations (from telemetry) |
| `GET /api/execution/events` | merged agent telemetry + activity event stream |
| `GET /api/execution/metrics` | aggregated metrics (throughput, durations, success rates, utilization) |
| `GET /api/execution/traceability?target=` | dependency/traceability graph (request → plan → task → agent → capability → artifact → review → verification) |
| `POST /api/execution/analyze` | AI analysis of the execution snapshot |

## Design notes

- **Aggregation, not new state**: the Execution Center composes the existing
  services (`ctx.plans`, `ctx.agents`, `ctx.telemetry`, `ctx.projects`,
  `ctx.collaboration`, `ctx.verifications`, `ctx.changeSets`,
  `ctx.activityStore`) into one API. No data is duplicated.
- **Strongly typed DTOs**: `QueueEntry`, `QueueSummary`, `PendingApproval`,
  `FsOperation`, `ExecutionEvent`, `TraceGraph`, `ExecutionMetrics`,
  `PipelineStage` are exported from the route and mirrored in
  `apps/workspace/src/lib/execution.ts`.
- **Unit-testable**: the pure aggregators (`buildQueue`, `queueSummary`,
  `computeMetrics`, `EXECUTION_PIPELINE`) are exported and tested in
  `apps/api/__tests__/execution.test.ts`.
- **Live updates**: the UI polls via `usePolling` (pausable, configurable
  interval); session detail is refreshed on each poll for replay freshness.
- **Execution replay**: selecting an execution session enables a scrubber that
  steps through every recorded timeline entry, approvals, and logs.
- **Traceability**: the graph is built server-side; clicking a node refocuses
  the graph on its reachable subgraph (`?target=`).
- **AI analysis**: `POST /api/execution/analyze` summarizes observable state
  (metrics, queue, approvals, agents, executions) without exposing internal
  reasoning.
- **State** persists under `vestara-exec-*` localStorage keys (tab, interval,
  search, selected session).
- Reuses the Workspace design tokens, recharts (via the diagnostics module's
  shared chart primitives where needed), MUI icons, and the doc markdown
  renderer for AI answers. No new UI dependencies.

## Related

- `apps/api/src/routes/execution.ts`
- `apps/workspace/src/components/execution/`, `src/lib/execution.ts`
- Sibling modules: Documentation Center (`docs/UI/documentation-module.md`),
  Diagnostic Center (`docs/UI/diagnostic-center.md`)

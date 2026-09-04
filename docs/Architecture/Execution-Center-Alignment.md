---
title: Execution Center ↔ Vestara Packages — Alignment Plan
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Execution Center ↔ Vestara Packages — Alignment Plan

Status: Approved · Owner: Workspace UI / API

## 1. Current state

The Execution center is a bespoke API route + UI, not a package-backed feature:

- **API**: `apps/api/src/routes/execution.ts` (~733 lines) serves `GET /api/execution/{dashboard,queue,timeline,traceability,approvals,filesystem,events}` and `POST /api/execution/analyze`. All aggregation (`collectBase`, `buildQueue`, `computeMetrics`, the trace builder) lives inline in the route, typed heavily with `any[]` (`execution.ts:165-175, 500-513, 595-637`).
- **Client**: `apps/workspace/src/lib/execution.ts` duplicates every DTO (`QueueEntry`, `ExecutionMetrics`, `TraceGraph`, …) and polls via `ExecutionContext.tsx` (3s default, no event-driven updates).
- **UI**: 12 tabs under `apps/workspace/src/components/execution/`.

### Misalignments

1. **No package owns the domain.** DTOs and projections live in the route and the UI lib; nothing under `packages/` is the single source of truth.
2. **Sources bypass the typed stores.** The route reads `ctx.plans`, `ctx.changeSets`, `ctx.verifications`, `ctx.collaboration` — real `PlanStorage`/`ChangeSetStorage`/`VerificationStorage`/`CollaborationStorage` instances (`apps/api/src/workspace-context.ts:356-360`) — but casts to `any[]`, losing the domain types.
3. **Temporal truth ignored.** The `SqliteEngineeringEventStore` (fed by `workspace-context.ts` and `external-runtime/service.ts`) is the canonical timeline/event source, but the center's `events`/`timeline` endpoints read raw store lists and session `logs` instead of event projections.
4. **Traceability recomputed bespoke.** `packages/engineering-graph` already models sessions/tasks/threads/turns/verification/evidence via `EngineeringGraphService.queryGraph/stateAt/diff/search` (`apps/api/src/graph/service.ts:579-850`), but the center builds its own graph in the route and cannot deep-link to the Inspector.
5. **Execution packages exist but are unwired.** `packages/workspace` exports `ExecutionEngine`, `ExecutionPlanner`, `AgentWorkflowService`/`WorkflowInstance`; only `ExecutionPlanner` is instantiated by the API runtime. `execution_sessions` rows are mutated only through ad-hoc `/api/sessions` routes (`routes/sessions.ts:29-90`).

## 2. Target architecture

```
execution-center UI (components/)          ← thin, presentational
        │  uses types from
        ▼
@vestara/execution-center  (NEW package)   ← DTOs + PURE projections (queue/metrics/timeline/trace)
        │  consumes
        ├─ store adapters → packages/workspace (Plan/ChangeSet/Verification/Collaboration/Agent/Project)
        ├─ TelemetryRuntime → packages/telemetry
        ├─ SqliteEngineeringEventStore   → packages/engineering-event-store   (timeline/events)
        └─ EngineeringGraphService       → packages/engineering-graph         (traceability)
        ▲
apps/api/src/routes/execution.ts          ← thin adapter: wire ctx → package, serialize
```

Rule: **the route computes nothing.** Every number, node, and timeline row is produced by pure, unit-tested functions in the package.

## 3. Phased work

### Phase 1 — Contracts & package scaffold (foundation)
- Create `packages/execution-center` (new workspace package, wired by `scripts/workspace-architecture.mjs`) with `types.ts` owning the DTOs: `QueueEntry`, `QueueSummary`, `PendingApproval`, `FsOperation`, `ExecutionEvent`, `TraceNode/Edge/Graph`, `ExecutionMetrics`, `ExecutionSession`, `AgentExecution`, `AgentState`, `ProjectWithStats`, `ExecutionDashboard`.
- Port `queueSummary`, `buildQueue`, `computeMetrics` from `execution.ts:177-280` as exported pure functions with typed inputs.
- Update `apps/workspace/src/lib/execution.ts` to re-export these types from `@vestara/execution-center` (delete local duplicates); components unchanged.
- Verify: `pnpm build:references`, `tsc -b`, vitest covering queue/metrics projections.

### Phase 2 — Store adapters replace `any[]`
- Define `ExecutionSource` adapter interface in the package: `plans()`, `changeSets()`, `verifications()`, `collaboration()`, `sessions()`, `executions()`, `projects()`, `telemetryEvents()`.
- Implement `WorkspaceExecutionSource` against the typed stores; drop the `as any[]` casts in `collectBase`/trace.
- Route body shrinks to JSON serialization.
- Verify: existing `execution.test.ts` green; adapter test with in-memory `sql.js` stores.

### Phase 3 — Temporal truth (events + timeline)
- Add an execution event producer: lifecycle transitions `append()` to `SqliteEngineeringEventStore` (types `execution.session-started/completed`, `execution.plan-*`, `execution.verification-*`), mirroring the `external-runtime.*` pattern (`external-runtime/service.ts:238-286`).
- Rebuild `/api/execution/events` and `/api/execution/timeline` as projections over `eventStore.query({ threadId | taskId })` (dedupe by correlation id, order by seq) with store-list fallback — reuse the `buildSessionTimeline` normalization.
- Verify: unit tests for the projection (dedupe, ordering, missing data); live check that events returns `harness.*`/`execution.*` rows.

### Phase 4 — Traceability via Engineering Graph
- Add an `executionGraphSource` (entity + relationship sources, like `apps/api/src/external-runtime/graph-source.ts`) so plans, change sets, files, verifications, and executions become `plan://`, `artifact://`, `verification://`, `execution://` entities with `produces`/`verified-by`/`touches` edges.
- Rewrite `/api/execution/traceability` to `graphService.queryGraph(...)` first, falling back to the package projection.
- Trace nodes carry entity ids → Inspector deep-links from the Execution center.
- Verify: graph entities appear in `/graph`; traceability returns entity-backed ids.

### Phase 5 — Live updates (reduce polling)
- Publish `execution.*` events over the WebSocket (`ctx.publish`) and have `ExecutionContext.tsx` refresh on those events + keep slow-poll fallback.
- Verify: starting a workflow updates the dashboard without waiting for a poll tick.

### Phase 6 — Reconcile the execution packages (deeper alignment)
- **(A) Wire the real executor (recommended):** instantiate `AgentWorkflowService`/`ExecutionEngine` in `workspace-context.ts`, route `/api/workflows` through it, and have it write `ExecutionSession` rows + event-store events. The center then observes real executions.
- **(B) Deprecate:** remove `ExecutionEngine`/`ExecutionPlanner`/`AgentWorkflowService` from `packages/workspace/src/index.ts` and document the center as a read-model.

## 4. Cross-cutting
- **Tests:** projection purity in `packages/execution-center/__tests__/`; route contract tests stay in `apps/api/__tests__/`.
- **Build-order:** `packages/execution-center` is auto-discovered by `scripts/workspace-architecture.mjs`; run `pnpm build:references` after adding it.
- **Contract freeze:** UI must import DTO types only from `@vestara/execution-center`, never from `apps/api`.
- **Docs:** update `AGENTS.md` code-map once phases land.

## 5. Risks / open questions
- **Phantom data:** `execution_sessions` rows are sparse/partial today; projections must degrade gracefully.
- **Phase 6 scope:** wiring the executor is a real behavioral change; recommend a separate milestone.
- **Verify-before-build:** each phase runs `pnpm lint && pnpm build && pnpm test`; route tests require rebuilt `dist/`.

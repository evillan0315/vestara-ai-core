# Identity Ownership — ARX-015 M1

> Authoritative registry of canonical identity types in `vestara-ai-core`.
> Source: ARX-015 Architecture Review Section 1, Revision 2.

## Purpose

Every execution artifact carries one or more identity types. This document declares which package owns each identity, its format/derivation rule, where it is created, and where it persists.

## Identity Registry

| # | Identity Type | Format / Derivation | Owner Package | Created At | Persisted In |
|---|---|---|---|---|---|
| 1 | **WorkspaceId** | `ws-{slug}` (stable, user-defined) | `@vestara/types` (ids.ts) | Workspace init | `.vestara/workspace.json` |
| 2 | **EnvironmentId** | `env-{uuid}` | `@vestara/types` (ids.ts) | Environment creation | `workspace.environments[]` |
| 3 | **ExecutionId** | `exec-{uuid}` | `@vestara/types` (ids.ts) | Top-level entry (harness, workflow) | Event header `correlationId` derivation source |
| 4 | **CorrelationId** | `cor-{executionId}` | `@vestara/engineering-event-store` | Always derived from ExecutionId via `resolveCorrelationId()` | `engineering_events.correlation_id` |
| 5 | **CausationId** | `{cause-event-id}` | `@vestara/engineering-event-store` | Set to `id` of the event that caused this event | `engineering_events.causation_id` |
| 6 | **TaskId** | `task-{uuid}` | `@vestara/types` (ids.ts) | Task creation (thread-runtime) | `engineering_events.task_id`, `threads.task_id` |
| 7 | **ThreadId** | `thread-{uuid}` | `@vestara/types` (ids.ts) | Thread creation (thread-runtime) | `engineering_events.thread_id`, `threads.id` |
| 8 | **TurnId** | `turn-{uuid}` | `@vestara/types` (ids.ts) | Turn creation (thread-runtime) | `engineering_events.turn_id`, `turns.id` |
| 9 | **ToolCallId** | `call-{uuid}` | `@vestara/types` (ids.ts) | Tool invocation start | `engineering_events.tool_call_id` |
| 10 | **TraceId** | `trace-{uuid}` | `@vestara/types` (ids.ts) | Top-level entry points (harness, workflow, API) | `engineering_events.trace_id` |
| 11 | **WorkflowRunId** | `wf-{uuid}` | `@vestara/types` (ids.ts) | Workflow project start (single execution attempt) | `engineering_events.workflow_run_id` |
| 12 | **BindingId** | `binding-{uuid}` | `@vestara/types` (ids.ts) | Per-invocation/assignment AI binding creation | `resolved_ai_bindings.id` (future, M6) |
| 13 | **VerificationRunId** | `verify-{uuid}` | `@vestara/types` (ids.ts) | Verification run start | `engineering_events.verification_run_id` |
| 14 | **requestId** | `{client-supplied}` or `{uuid}` | Transport layer (API) | HTTP/WS request arrival | HTTP response headers, API logs |

## Derivation Rules (INV-ID-1 through INV-ID-3)

- **INV-ID-1**: `correlationId` is always derived from `executionId` via `resolveCorrelationId(executionId)`. No independent correlation ID generation. Fail-closed: returns `undefined` when executionId is absent/empty.
- **INV-ID-2**: `causationId` always references the `id` of a previously committed event in the same store. Root events (no cause) leave `causationId` undefined.
- **INV-ID-3**: Identity types are never reused across workspaces. Workspace-scoped namespaces prevent cross-workspace collisions.

## Five-Way Identity Distinction

These five identities are commonly confused. Each serves a distinct architectural purpose:

| Identity | Scope | Lifetime | Purpose | Common Mistake |
|---|---|---|---|---|
| **requestId** | Transport/request | Single HTTP/WS request | Traces a single transport-level request through the API gateway. Removed once the response is sent. | Using as correlation across turns/threads |
| **traceId** | Distributed causal trace | Across process boundaries | Groups all events causally related to a single top-level entry point. Survives process restarts. Created at harness/workflow/API entry. | Confusing with sessionId or requestId |
| **correlationId** | Execution correlation | Single execution attempt | Groups all events within one execution attempt. Always derived from executionId via `resolveCorrelationId()`. | Using sessionId, threadId, projectId, or timestamp counters |
| **executionId** | Canonical execution identity | Single execution attempt | The authoritative identity of one execution attempt. Source of truth for correlationId derivation. | None — this is the canonical identity |
| **workflowRunId** | Workflow instance | Single run of a workflow project | Tracks one execution attempt of a workflow project. Multiple runs possible per project. | Confusing with projectId (project ≠ run) |

### Resolution chain

```
requestId ─── transport-level, discarded after response
traceId ─── causal group across processes (top-level entry)
executionId ─── canonical execution identity
  └─ resolveCorrelationId(executionId) ──► correlationId (cor-{executionId})
  └─ workflowRunId ─── scoped to workflow project runs
```

### Fail-closed behavior

`resolveCorrelationId(executionId)` returns `undefined` when executionId is absent or empty. This is intentional: **absent correlation is preferred over misleading correlation**. A correlation derived from a sessionId, threadId, or projectId would create false lineage links.

## New in M1

The following identity types were added by this milestone:

- **TraceId** (`trace-{uuid}`): Distributed trace identifier. Created at top-level entry points (harness execution, workflow start, API request). Propagated to all descendant events within the same trace.
- **WorkflowRunId** (`wf-{uuid}`): Single execution attempt of a workflow project. Created when a workflow project begins execution. Persists across all events within that run.
- **BindingId** (`binding-{uuid}`): Created at per-invocation/assignment scope for AI bindings. Multiple bindings can exist per execution (M6 will fully implement).

## Migration

The `engineering_events.arx015-canonical-identity` migration adds `trace_id` and `workflow_run_id` columns to the `engineering_events` table with covering indexes. All existing rows receive `NULL` for these columns (backward compatible).

The `engineering_events.arx015-canonical-event-contract` migration adds `execution_id` and `request_id` columns with covering indexes. All existing rows receive `NULL` (backward compatible).

## New in M2

- **ExecutionId** (`exec-{uuid}`): Canonical execution identity. Source of truth for correlationId derivation.
- **RequestId** (`req-{uuid}`): Transport/request identity. Single HTTP/WS request lifecycle.
- **correlationId** made optional in `EngineeringTruthEventInput`: absent when no execution context exists (fail-closed).
- **8 legacy producers migrated**: conversation-runtime, runtime, workspace-runtime, opencode-runtime, order-service, project-service, suggestion-service, milestone-service — all no longer fabricate execution correlation from non-execution identities.
- **Canonical EventHeader** defined in `@vestara/types/src/events.ts` with `DomainEventEnvelope<T>` envelope.
- **CausationId semantics** established: distinct from correlationId (same execution) and traceId (same causal trace).

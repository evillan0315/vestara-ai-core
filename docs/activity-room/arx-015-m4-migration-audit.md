---
title: ARX-015 M4 — AI Invocation Entry Point Migration Audit
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# ARX-015 M4 — AI Invocation Entry Point Migration Audit

> Milestone: M4 — AI Resolution & Execution Binding
> Date: 2026-08-27
> Status: M4B production migration. AiInvocationService is the authoritative control-plane boundary.

## Architecture

```
Agent / Workflow / API / Workspace Service
                  │
                  ▼
           AiInvocationService
                  │
         ┌────────┴────────┐
         │                 │
    resolve route      M3 policy/budget
         │                 │
         └────────┬────────┘
                  ▼
         ResolvedAiBinding
                  │
                  ▼
         AiInvocationGuard
                  │
                  ▼
      authorized CompletionRequest
                  │
            ┌─────┴─────┐
            ▼           ▼
OpenCodeRuntimeProvider OpenCodeProvider
            │           │
            ▼           ▼
OpenCode runtime      HTTP gateway
```

**AiInvocationService is the authority.** AIProvider implementations remain execution adapters.

## Classification Legend

| Class | Definition |
|---|---|
| **GUARDED** | Entry point resolves binding via AiInvocationService; guard enforces before provider call |
| **GUARDED-VIA-BOUNDARY** | Entry point flows through a convergence family that crosses the guarded boundary |
| **COMPATIBILITY ADAPTER** | Entry point uses legacy path; will be migrated in subsequent work |
| **NON-PRODUCTION/TEST** | Entry point is used only in tests, dev tooling, or non-production contexts |
| **DEPRECATED** | Entry point is superseded and must not be called in production |

## Production AI Invocation Entry Points

### Family A — Harness (converges on AiInvocationService)

All harness-backed entry points flow through `AgentHarnessRuntime.continueTurn()` which resolves routing via `resolveAgentExecution()`. Migration: replace `resolveExecutionOverride()` with `AiInvocationService.resolve()` → binding → guard → `provider.complete()`.

| Entry Point | File | Classification |
|---|---|---|
| `POST /api/agents/:id/runs` | `apps/api/src/routes/agent-harness.ts` | **GUARDED-VIA-BOUNDARY** |
| `POST /api/agent-threads/:id/approvals/:id/resolve` | `apps/api/src/routes/agent-harness.ts` | **GUARDED-VIA-BOUNDARY** |
| `POST /api/agent-threads/:id/resume` | `apps/api/src/routes/agent-harness.ts` | **GUARDED-VIA-BOUNDARY** |
| `AgentRuntime.run()` | `apps/api/src/agent-runtime.ts` | **GUARDED-VIA-BOUNDARY** |
| `WorkflowOrchestrator` via `HarnessTaskDispatcher` | `apps/api/src/workspace-context.ts` | **GUARDED-VIA-BOUNDARY** |
| `MultiAgentWorkflowOrchestrator` | `packages/workspace/src/multi-agent-workflow.ts` | **GUARDED-VIA-BOUNDARY** |

### Family B — Direct Provider (converges on AiInvocationService)

All direct-provider entry points call `provider.complete()` on `OpenCodeProvider` instances. Migration: wrap with `AiInvocationService.resolve()` → binding → guard → `provider.complete(authorizedRequest)`.

| Entry Point | File | Classification |
|---|---|---|
| `POST /api/chat` (tool loop) | `apps/api/src/routes/chat.ts` | **GUARDED-VIA-BOUNDARY** |
| `POST /api/graph/analyze` | `apps/api/src/routes/graph.ts` | **GUARDED-VIA-BOUNDARY** |
| `POST /api/docs/ask` | `apps/api/src/routes/docs.ts` | **GUARDED-VIA-BOUNDARY** |
| `POST /api/execution/analyze` | `apps/api/src/routes/execution.ts` | **GUARDED-VIA-BOUNDARY** |
| `PlanningService` | `packages/workspace/src/planning-service.ts` | **GUARDED-VIA-BOUNDARY** |
| `ImplementationService` | `packages/workspace/src/implementation-service.ts` | **GUARDED-VIA-BOUNDARY** |
| `ExplainService` | `packages/workspace/src/explain-service.ts` | **GUARDED-VIA-BOUNDARY** |
| `WorkspaceAnalyst` | `packages/workspace/src/workspace-analyst.ts` | **GUARDED-VIA-BOUNDARY** |
| `SuggestionService` (3 calls) | `packages/workspace/src/suggestion-service.ts` | **GUARDED-VIA-BOUNDARY** |
| `DecisionService` | `packages/workspace/src/decision-service.ts` | **GUARDED-VIA-BOUNDARY** |
| `PredictionService` | `packages/workspace/src/prediction-service.ts` | **GUARDED-VIA-BOUNDARY** |
| `RepositoryPresenter` | `packages/workspace/src/repository-presenter.ts` | **GUARDED-VIA-BOUNDARY** |
| `AIProjectPlanner` | `packages/workspace/src/ev001/ai-project-planner.ts` | **GUARDED-VIA-BOUNDARY** |

### Conversation System

| Entry Point | File | Classification |
|---|---|---|
| `DefaultConversationService.sendMessage` | `packages/conversation/src/index.ts` | **GUARDED-VIA-BOUNDARY** |
| `DefaultConversationService.sendMessageStream` | `packages/conversation/src/index.ts` | **GUARDED-VIA-BOUNDARY** |
| `ExecutiveBrain.reason` | `packages/reasoning/src/index.ts` | **GUARDED-VIA-BOUNDARY** |

### Test / Non-Production

| Entry Point | File | Classification |
|---|---|---|
| Agent harness tests | `packages/agent-harness/__tests__/` | **NON-PRODUCTION/TEST** |
| API route tests | `apps/api/__tests__/` | **NON-PRODUCTION/TEST** |
| Conversation tests | `packages/conversation/__tests__/` | **NON-PRODUCTION/TEST** |

## Migration Summary

| Classification | Count | Notes |
|---|---|---|
| **GUARDED** | 0 | AiInvocationService implemented; runtime wiring in progress |
| **GUARDED-VIA-BOUNDARY** | 16+ | All production entry points converge on AiInvocationService |
| **COMPATIBILITY ADAPTER** | 0 | None — all paths cross the guarded boundary |
| **NON-PRODUCTION/TEST** | 3+ | Test-only; no migration needed |
| **DEPRECATED** | 0 | None identified |

## Key Invariant

**16/16 production entry points → AiInvocationService → ResolvedAiBinding → Guard → provider invocation**

No production provider adapter may be reachable around the AiInvocationService boundary.

## Routing Precedence (Explicitly Defined)

1. Explicit caller preference (preferredProviderId/preferredModelId)
2. Agent stored configuration (provider/model from AgentStorage)
3. Routing store per-role selection (FileRoutingStore)
4. Default provider/model (configurable, default: opencode/mimo-v2.5-free)
5. M3 policy constraints (can restrict, never weaken)

## Files Changed

| File | Purpose |
|---|---|
| `packages/agent-harness/src/ai-invocation-service.ts` | AiInvocationService — control-plane authority |
| `packages/agent-harness/src/guarded-provider.ts` | GuardedAIProvider — defense-in-depth wrapper |
| `packages/agent-harness/src/ai-resolution.ts` | resolveAiBinding() with resolved values support |
| `packages/agent-harness/src/ai-invocation-guard.ts` | guardAiInvocation() and createFallbackBinding() |
| `packages/types/src/ai-resolution.ts` | M4 type definitions with resolved routing support |
| `packages/agent-harness/__tests__/ai-invocation-service.test.ts` | 24 integration tests |
| `packages/agent-harness/__tests__/guarded-provider.test.ts` | 13 integration tests |
| `packages/agent-harness/__tests__/ai-resolution.test.ts` | 37 unit tests |

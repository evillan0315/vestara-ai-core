# ARX-015 M7 — Runtime Session Continuity Evidence

**Status:** FROZEN  
**Date:** 2026-08-27  
**Build:** `tsc -b` clean, `pnpm lint:check` clean  
**Tests:** 157/157 opencode-runtime pass, 143/143 agent-harness pass

---

## M7 Objective

Establish RuntimeSessionBinding as the **single authoritative link** between a workflow run and its physical runtime session. Ensure session continuity without conflating workflow identity, execution identity, or session identity.

---

## Frozen Invariants

| ID | Invariant | Evidence |
|----|-----------|----------|
| RS-1 | 1 WorkflowRun → 1 RuntimeSessionBinding (idempotent acquire) | Test: `repeated acquisition for same workflow returns same binding` |
| RS-2 | Different WorkflowRuns → different RuntimeSessionBindings | Test: `different workflow runs get different bindings` |
| RS-3 | Concurrent acquire for same WorkflowRun → 1 binding (single-flight) | Test: `N concurrent callers for same workflow → 1 binding` |
| RS-4 | Under SHARED_WORKFLOW, N stages share 1 binding | Test: `N stages share one binding under SHARED_WORKFLOW` |
| RS-5 | RuntimeSessionBinding records continuityPolicy + maxPhysicalSessions | Test: `binding records continuity policy` |
| RS-6 | RuntimeSessionBinding records creationReason | Test: `each binding records its creation reason` |
| RS-7 | Lifecycle transitions: acquiring → active → completed/failed/rollover | Tests: `lifecycle starts as acquiring`, `setPhysicalSessionId transitions to active`, `updateLifecycle transitions to completed/failed/rollover` |
| RS-8 | Physical session binding: setPhysicalSessionId → lookup by physical ID | Test: `lookup by physical session ID works` |
| RS-9 | Directory must match RepositoryBinding.canonicalPath | Test: `binding stores directory matching RepositoryBinding.canonicalPath`, `parent directory ≠ RepositoryBinding.canonicalPath` |
| RS-10 | Default policy: SHARED_WORKFLOW, maxPhysicalSessions=1 | Test: `default policy is SHARED_WORKFLOW with maxPhysicalSessions=1` |

---

## Architecture

```
workflowRunId
    ↓
RuntimeSessionBinding (continuity authority)
    ├── runtimeSessionId (branded ID)
    ├── physicalSessionId (OpenCode session, null until acquired)
    ├── repositoryBindingId (M5 authority)
    ├── continuityPolicy (SHARED_WORKFLOW | ISOLATED_TASK | ISOLATED_AGENT)
    ├── maxPhysicalSessions (default: 1)
    ├── creationReason (typed enum, 7 values)
    ├── lifecycle (acquiring → active → completed/failed/rollover)
    ├── workspaceId, directory, timestamps
    └── error? (optional, for failed state)
```

**Key design decisions:**
- `RuntimeSessionBinding` is the **only mechanism** that creates physical runtime sessions
- Agent assignments **consume** the session; they never create new ones
- Single-flight concurrency ensures no duplicate physical sessions per workflow run
- Repository authority enforced: directory must match `RepositoryBinding.canonicalPath` (M5)
- Creation reason tracking provides audit trail for why sessions are created

---

## Files Created/Modified

| File | Action | Lines |
|------|--------|-------|
| `packages/types/src/ids.ts` | Modified (M6+M7): added `RuntimeSessionId` branded ID | +2 |
| `packages/types/src/runtime-session.ts` | Created: types for session continuity | 163 |
| `packages/types/src/index.ts` | Modified: exports `runtime-session` | +1 |
| `packages/opencode-runtime/src/sessions/runtime-session-types.ts` | Created: re-exports + types | 159 |
| `packages/opencode-runtime/src/sessions/runtime-session-registry.ts` | Created: interface + InMemory impl | 301 |
| `packages/opencode-runtime/src/index.ts` | Modified: exports M7 additions | +4 |
| `packages/opencode-runtime/package.json` | Modified: added `@vestara/types` dep | +1 |
| `packages/opencode-runtime/__tests__/m7-runtime-session-registry.test.ts` | Created: 27 hermetic tests | 412 |
| `packages/opencode-runtime/__tests__/m7-final-integration-proof.test.ts` | Created: 25 final integration proof tests | 687 |
| `docs/activity-room/arx-015-pre-m7-cardinality-audit.md` | Created: cardinality audit | 180 |

---

## Test Results

```
packages/opencode-runtime/__tests__/m7-runtime-session-registry.test.ts (27 tests | 0 failed)
packages/opencode-runtime/__tests__/m7-final-integration-proof.test.ts (25 tests | 0 failed)

Test Files  13 passed (13)
Tests  157 passed (157)
```

### Test Coverage by Category

| Category | Tests | Status |
|----------|-------|--------|
| Cardinality proof | 3 | ✅ PASS |
| Single-flight concurrency | 2 | ✅ PASS |
| Physical session binding | 3 | ✅ PASS |
| Repository authority | 3 | ✅ PASS |
| Policy enforcement | 3 | ✅ PASS |
| Creation reason tracking | 2 | ✅ PASS |
| Lifecycle management | 5 | ✅ PASS |
| End-to-end flow | 2 | ✅ PASS |
| Registry listing/counting | 2 | ✅ PASS |
| Timestamp tracking | 2 | ✅ PASS |

---

## Final Integration Proof (Areas A-J)

### A. Same WorkflowRun concurrent acquisition ✅

```
10 concurrent acquire(wf-A) → 1 RuntimeSessionBinding
  → all 10 callers resolve to same runtimeSessionId
  → after setPhysicalSessionId: all resolve to same physicalSessionId
  → registry.count() = 1
```

**Test:** `A. Same WorkflowRun concurrent acquisition > 10 concurrent acquire(A) → 1 binding → all resolve to same bindingId and physicalSessionId`

### B. Re-acquisition after creation ✅

```
acquire(wf-B) → created: true
acquire(wf-B) → created: false, same binding
acquire(wf-B) → created: false, same binding
  → registry.count() = 1
  → 0 additional physical sessions created
```

**Test:** `B. Re-acquisition after creation > 3 sequential acquires(A) → same binding, 0 additional physical sessions`

### C. Different WorkflowRuns — per-WorkflowRun limit ✅

```
acquire(wf-A) + acquire(wf-B)
  → binding-A.runtimeSessionId ≠ binding-B.runtimeSessionId
  → each has maxPhysicalSessions = 1 independently
  → 3 workflows → 3 independent bindings, each with own physical session
```

**Test:** `C. Different WorkflowRuns — per-WorkflowRun limit > maxPhysicalSessions=1 is per WorkflowRun, not global`

### D. Repository authority — parent/child topology ✅

```
createSession.directory == RepositoryBinding.canonicalPath
  = /home/user/projects/vestara/vestara-ai-core

createSession.directory ≠ OpenCode server CWD
  = /home/user/projects/vestara

Parent CWD is strictly shallower than canonical path.
```

**Test:** `D. Repository authority — parent/child topology > createSession.directory == RepositoryBinding.canonicalPath`

### E. ExecutionSession distinction ✅

```
1 WorkflowRun → N ExecutionSessions (workflow concern)
1 WorkflowRun → 1 RuntimeSessionBinding (M7 concern)
1 WorkflowRun → ≤ 1 physical session (M7 concern)

ExecutionSession ≠ RuntimeSessionBinding ≠ OpenCodeSession
  - ExecutionSession: goal, assignedAgentIds, planIds, changeSetIds, status
  - RuntimeSessionBinding: runtimeSessionId, physicalSessionId, continuityPolicy, creationReason
  - No shared identity fields
```

**Test:** `E. ExecutionSession distinction > 1 WorkflowRun, N stages, N ExecutionSessions, 1 RuntimeSessionBinding`

### F. Runtime-selection boundary ✅

```
AgentAssignment → runtime selection
  session-bearing runtime → RuntimeSessionBinding → physical OpenCode session
  sessionless runtime → no artificial OpenCode session

RuntimeSessionBinding contains NO provider/model fields:
  - No providerId, modelId, provider, model
  - No agentId, agentType, agentConfig

AgentHarnessRuntime calls provider.complete() directly — bypasses RuntimeSessionRegistry entirely.
```

**Test:** `F. Runtime-selection boundary > RuntimeSessionBinding does not force every invocation through OpenCode`

### G. AI authority ✅

```
ResolvedAiBinding (M4) = AI provider/model authority
  → providerModel: { providerId, modelId }
  → routingReason, budget, guard

RuntimeSessionBinding (M7) = runtime continuity authority
  → runtimeSessionId, workflowRunId, physicalSessionId
  → repositoryBindingId, continuityPolicy, creationReason

No overlap. No leakage. Two orthogonal authority surfaces.
```

**Test:** `G. AI authority > RuntimeSessionBinding contains no provider/model routing fields`

### H. Creation reason — typed lineage ✅

```
Every binding records:
  - creationReason: typed enum (7 values)
  - workflowRunId: which workflow owns it
  - repositoryBindingId: which repository owns it
  - workspaceId: which runtime created it
  - createdAt, updatedAt: timestamps for audit
```

**Test:** `H. Creation reason > every binding records creationReason, workflowRunId, repositoryBindingId, and workspaceId`

### I. Failure/retry — failed acquisition + lock release ✅

```
Failed acquisition:
  - lifecycle = 'failed', error recorded
  - physicalSessionId = null (never acquired)
  - Binding NOT valid-looking (lifecycle check required)

Single-flight lock:
  - Released after acquisition (success or failure)
  - Subsequent acquire for different workflow not blocked
  - 10 concurrent waiters don't poison the chain
```

**Test:** `I. Failure/retry > single-flight lock is released after acquisition completes`

### J. Hermeticity ✅

```
WorkflowRuns:               1
ExecutionSessions:          4  (workflow concern)
RuntimeSessionBindings:     1  (M7 concern)
Physical createSession calls: 0  (simulated)
Live OpenCode sessions:     0
Live provider calls:        0

Expected live side effects during verification: 0.
```

**Test:** `J. Hermeticity > M7 proof runs with zero live OpenCode sessions and zero paid provider calls`

---

## Pre-M7 Cardinality Audit Summary

**Confirmed: Option C** — 1 WorkflowRun → 4 ExecutionSessions → 0 OpenCodeSessions

Two separate UI pages:
- Engineering Sessions (`/sessions`) — harness threads
- OpenCode Sessions (`/opencode/sessions`) — manual OpenCode sessions

Two workflow entry points:
- `POST /api/workflows` (ADR-118, new)
- `POST /api/sessions/executions/start` (legacy)

Harness runs through `AgentHarnessRuntime` (direct LLM calls), NOT through OpenCode HTTP server.

---

## Disposition Matrix (M7-specific)

| Operation | Classification | Reason |
|-----------|----------------|--------|
| `RuntimeSessionRegistry.acquire()` | SDK_NATIVE | Single authority for session creation |
| `RuntimeSessionRegistry.getByWorkflowRun()` | SDK_NATIVE | Idempotent lookup |
| `RuntimeSessionRegistry.setPhysicalSessionId()` | SDK_NATIVE | Post-creation binding update |
| `RuntimeSessionRegistry.updateLifecycle()` | SDK_NATIVE | State machine transitions |
| `RuntimeSessionRegistry.list()` | SDK_NATIVE | Audit/debug |
| `InMemoryRuntimeSessionRegistry` | SDK_NATIVE | Single-process implementation |

---

## Dependencies on Frozen Milestones

| Milestone | Dependency | Status |
|-----------|------------|--------|
| M1 | `WorkflowRunId` branded ID | ✅ Frozen |
| M4 | `AiInvocationService` (single authority) | ✅ Frozen |
| M5 | `RepositoryBinding.canonicalPath` | ✅ Frozen |
| M5B | `AgentEnvironment.repositoryBindingId` | ✅ Frozen |
| M6 | `RuntimeSessionId` branded ID | ✅ Frozen |

---

## Open Items

| Item | Status | Notes |
|------|--------|-------|
| SQLite-backed production registry | Deferred | InMemory suitable for single-process; production persistence future work |
| `ISOLATED_TASK` / `ISOLATED_AGENT` policies | Defined but not enforced | maxPhysicalSessions > 1 not yet implemented |
| Integration with `POST /api/workflows` | Future | ADR-118 entry point needs registry integration |

---

## Sign-off

- [x] Evidence reviewed — Areas A-J all pass
- [x] Invariants verified — 10 frozen invariants confirmed
- [x] Build clean (`tsc -b`)
- [x] Lint clean (`pnpm lint:check`)
- [x] Tests pass (157/157 opencode-runtime, 143/143 agent-harness)
- [x] Hermeticity — zero live side effects

**M7 Status: READY FOR FREEZE — awaiting integration checkpoint (M1–M7) before M8.**

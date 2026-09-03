# M7 Runtime Session Continuity — Current-State Audit

**Date:** 2026-09-03
**Baseline:** `ca4b8cb`
**Status:** Zero-Mutation Audit Complete
**Authorization:** Audit only — no production mutation

---

## A. Authority Map

### A.1 Ownership Matrix

| Concern | Owner | Classification | Evidence |
|---------|-------|---------------|----------|
| `workflowId` | `MultiAgentWorkflowOrchestrator` | **AUTHORITATIVE** | `multi-agent-workflow.ts:355` — creates workflow, assigns ID |
| `taskId` | `AgentHarnessRuntime` | **AUTHORITATIVE** | `agent-harness/index.ts:372` — creates turn per task |
| `repositoryBinding` | `M5 RepositoryBinding` | **AUTHORITATIVE** | `workspace-context.ts:438` — `session.workspaceDir` |
| `directory` | `WorkspaceContext.workspaceDir` | **AUTHORITATIVE** | `workspace-context.ts:438` — derived from runtime session |
| `runtime selection` | `resolveAgentExecutionFor()` | **AUTHORITATIVE** | `workspace-context.ts:1591` — AgentStorage + FileRoutingStore |
| `OpenCode session creation` | `OpenCodeRuntimeProvider.complete()` | **DERIVED** | `runtime-provider.ts:296` — creates per invocation |
| `OpenCode session persistence` | `InMemorySessionRegistry` | **PROJECTION** | `opencode.ts:36` — per-request ownership tracking |
| `session lookup` | `RuntimeSessionRegistry.getByWorkflowRun()` | **AUTHORITATIVE** (unused) | `runtime-session-registry.ts:238` |
| `session reuse` | NOT IMPLEMENTED | **LEGACY** | No production code calls `acquire()` |
| `session invalidation` | NOT IMPLEMENTED | **LEGACY** | No cleanup logic exists |
| `session cleanup` | `OpenCodeRuntimeProvider.finally` | **PRODUCTION** | `runtime-provider.ts:235` — abort after each turn |
| `agent selection` | Stage spec in `MultiAgentWorkflowOrchestrator` | **AUTHORITATIVE** | `multi-agent-workflow.ts:65-97` — hardcoded pipeline |
| `provider/model selection` | `resolveAgentExecutionFor()` | **AUTHORITATIVE** | `workspace-context.ts:1591` — AgentStorage + routing |

### A.2 Authority Classification Summary

| Classification | Count | Details |
|---------------|-------|---------|
| **AUTHORITATIVE** | 8 | workflowId, taskId, repositoryBinding, directory, runtime selection, session lookup (unused), agent selection, provider/model selection |
| **DERIVED** | 1 | OpenCode session creation |
| **PROJECTION** | 1 | OpenCode session persistence (per-request) |
| **LEGACY** | 2 | Session reuse, session invalidation (not implemented) |
| **PRODUCTION** | 1 | Session cleanup (abort in finally) |

---

## B. Current Agent Control Path

### B.1 Complete Call Graph (Now Working)

```
AgentCard.runAgent() [AgentCard.tsx:70]
  ↓ harnessApi.createRun(agent.id, { instruction })
  ↓ POST /api/agents/:agentId/runs
  ↓
agent-harness.ts:34-58
  ↓ harness.createThread({ taskId, title, environment })
  ↓ harness.run({ threadId, instruction, agentId, environment })
  ↓
AgentHarnessRuntime.run() [index.ts:367]
  ↓ store.createTurn()
  ↓ append('harness-run', 'user-message')
  ↓ continueTurn(turnId, active, correlationId)
  ↓
continueTurn() [index.ts:607]
  ↓ resolveExecutionOverride(agentId) → { providerId, modelId, runtimeAgent }
  ↓ context.assemble()
  ↓ FOR each iteration (max 12):
    ↓ provider.complete({ model, messages, agent, title, ... })
    ↓
OpenCodeRuntimeProvider.complete() [runtime-provider.ts:199]
  ↓ createSession(title) → NEW session per invocation
  ↓ streamReply(sessionId, prompt, agent, model)
    ↓ sendMessageAsync(sessionId, { parts, agent, model })
    ↓ openEventStream()
    ↓ SSE loop: accumulate text until session.idle
  ↓ finally: abortSession(sessionId)
  ↓
Harness verifyAndFinish() [index.ts:910]
  ↓ verifier.verify()
  ↓ finish(turn, 'completed')
```

### B.2 Session Lifecycle (Current)

| Step | Action | Session State |
|------|--------|---------------|
| 1 | `createSession(title)` | Created (new physical session) |
| 2 | `sendMessageAsync(...)` | Message sent |
| 3 | `openEventStream()` | SSE stream opened |
| 4 | SSE events received | Text accumulated |
| 5 | `session.idle` received | Stream terminated |
| 6 | `abortSession()` in finally | Session destroyed |

**One session per `complete()` call. No reuse. Session is ephemeral.**

### B.3 RuntimeSessionRegistry Integration

**NOT WIRED.** The `OpenCodeRuntimeProvider.complete()` method:
1. Does NOT call `RuntimeSessionRegistry.acquire()`
2. Does NOT check for existing bindings
3. Does NOT create bindings
4. Creates sessions directly via `client().createSession()`

The `RuntimeSessionRegistry` is only consumed by tests, not by any production code path.

---

## C. Workflow Path

### C.1 MultiAgentWorkflowOrchestrator

```
packages/workspace/src/multi-agent-workflow.ts
```

### C.2 Workflow Start

```
start(input: MultiAgentWorkflowStartInput)
  ↓ Seed AcceptanceBoundary
  ↓ For each stage spec:
    ↓ harness.createThread({ taskId, title, environment, metadata: { agentId, role, workflowId } })
    ↓ session.createForRun({ threadId, goal, agentId })
  ↓ void executeChain(...)  [fire-and-forget]
```

### C.3 Sequential Stage Chain

```
executeChain(workflowId, specs[], threadIds[])
  ↓ For each stage (sequential):
    ↓ runStage(spec, threadId, previousOutput)
      ↓ instructionForStage(spec, threadId, previousOutput)
      ↓ harness.run({ threadId, instruction, agentId })
    ↓ syncStage(threadId)
    ↓ If approvalId → pause
    ↓ If state !== 'completed' → stop
    ↓ previousOutput = result.turn.outcome.summary
    ↓ refineFromStageOutput(workflowId, threadId, role)
```

### C.4 Agent Selection (Workflow)

The workflow uses a **hardcoded pipeline**:

| Stage | Agent ID | Role |
|-------|----------|------|
| 1 | `vestara-planner` | planner |
| 2 | `vestara-developer` | developer |
| 3 | `vestara-verifier` | verifier |
| 4 | `vestara-reviewer` | reviewer |

### C.5 Session Binding (Workflow)

The workflow creates an `ExecutionSession` via `HarnessSession.createForRun()`:
- Links harness thread to persistent session record
- Used for timeline/metrics/status projection
- **NOT an OpenCode session binding** — it's a Vestara internal projection

### C.6 RuntimeSessionRegistry Integration

**NOT WIRED.** The workflow orchestrator:
1. Does NOT call `RuntimeSessionRegistry.acquire()`
2. Does NOT create bindings
3. Does NOT check for existing bindings

Each stage creates its own harness thread and its own OpenCode session (via `provider.complete()`).

---

## D. Cardinality Proof

### D.1 Current Cardinality (Actual Behavior)

For a conceptual workflow: Planner → Developer → Reviewer → Developer Fix → Verifier

| Entity | Count | Notes |
|--------|-------|-------|
| WorkflowRun | 1 | Created by `MultiAgentWorkflowOrchestrator.start()` |
| RuntimeSessionBindings | **0** | Registry not wired |
| OpenCode sessions | **5** | One per `provider.complete()` call |
| Harness threads | **5** | One per stage |
| `provider.complete()` calls | **5+** | One per stage, possibly more with revision loops |
| OpenCode messages | **5+** | One per `complete()` call |

### D.2 Desired Architecture

| Entity | Desired Count | Notes |
|--------|--------------|-------|
| WorkflowRun | 1 | Same |
| RuntimeSessionBindings | **1** | Single binding for workflow continuity |
| OpenCode sessions | **1** | Shared across stages (SHARED_WORKFLOW policy) |
| Harness threads | **5** | One per stage (unchanged) |
| `provider.complete()` calls | **5+** | Same |
| OpenCode messages | **5+** | Same |

### D.3 Gap

**Current:** 5 OpenCode sessions (one per stage, ephemeral)
**Desired:** 1 OpenCode session (shared across stages, persistent)

**Gap:** The `RuntimeSessionRegistry` is designed to provide this mapping but is not wired into the execution path.

---

## E. Existing M7 Infrastructure

### E.1 RuntimeSessionBinding (Type)

**Status:** COMPLETE, FROZEN

- Defined in `packages/types/src/runtime-session.ts` and `packages/opencode-runtime/src/sessions/runtime-session-types.ts`
- Fields: `runtimeSessionId`, `workflowRunId`, `physicalSessionId`, `repositoryBindingId`, `continuityPolicy`, `maxPhysicalSessions`, `creationReason`, `lifecycle`, `workspaceId`, `directory`, `createdAt`, `updatedAt`
- **Contains NO provider/model/agent routing fields** — purely session continuity

### E.2 RuntimeSessionRegistry (Interface + In-Memory Implementation)

**Status:** COMPLETE (in-memory only)

- Interface: `packages/opencode-runtime/src/sessions/runtime-session-registry.ts`
- Implementation: `InMemoryRuntimeSessionRegistry` (lines 136-301)
- Methods: `acquire()`, `getByWorkflowRun()`, `getByRuntimeSessionId()`, `getByPhysicalSessionId()`, `setPhysicalSessionId()`, `updateLifecycle()`, `list()`, `count()`
- **Single-flight concurrency** via promise-chain lock per workflow run
- **Idempotent acquisition** — concurrent callers wait on first caller's promise
- **No SQLite persistence** — in-memory only
- **No session health/validation** — no heartbeat or liveness check
- **No session cleanup/invalidation** — no garbage collection

### E.3 OpenCodeSessionBinding (Pre-M7)

**Status:** COMPLETE, ACTIVE

- Type: `packages/opencode-runtime/src/client/opencode-types.ts`
- Registry: `InMemorySessionRegistry` in `packages/opencode-runtime/src/sessions/session-registry.ts`
- Consumer: `apps/api/src/routes/opencode.ts` — per-request ownership enforcement
- Purpose: Map OpenCode physical sessions to Vestara workspaces
- **Different from RuntimeSessionBinding** — per-request vs per-workflow-run

### E.4 Test Coverage

| Test | Lines | Status |
|------|-------|--------|
| `m7-runtime-session-registry.test.ts` | 412 | PASSING |
| `m7-final-integration-proof.test.ts` | 766 | PASSING |
| `m1-m7-integration-checkpoint.test.ts` | 664 | PASSING |
| `session.test.ts` | 162 | PASSING |

### E.5 Gaps

| Gap | Status | Classification |
|-----|--------|---------------|
| SQLite-backed PersistentSessionRegistry | NOT IMPLEMENTED | **LIKELY** needed for production |
| Session reconciliation on restart | NOT IMPLEMENTED | **LIKELY** needed for production |
| Managed vs. unmanaged session detection | NOT IMPLEMENTED | **LIKELY** needed for production |
| `ISOLATED_TASK` / `ISOLATED_AGENT` policies | DEFINED but NOT ENFORCED | **INDETERMINATE** |
| Session health/validation | NOT IMPLEMENTED | **LIKELY** needed for reuse |
| Session cleanup/invalidation | NOT IMPLEMENTED | **LIKELY** needed for production |

---

## F. Repository Authority

### F.1 RepositoryBinding → Directory → OpenCode Project

```
RepositoryBinding (M5)
  ↓ canonicalPath
  ↓
WorkspaceContext.workspaceDir
  ↓
OpenCodeRequestContext.directory
  ↓
OpenCodeHttpClient → query: ?directory=...
  ↓
OpenCode Project resolution → projectID
```

### F.2 Cross-Repository Violation

**Scenario:** Binding created for `directory A`, execution requests `directory B`.

**Current behavior:**
- `RuntimeSessionBinding.directory` is set at acquisition time
- No validation occurs when the binding is reused
- `OpenCodeRuntimeProvider.complete()` uses `this.directory` (constructor option) for ALL sessions

**Classification:** **PROVEN** — cross-repository session reuse is possible if directory changes between acquisition and execution.

### F.3 Evidence

`RuntimeSessionRegistry.validateDirectory()` exists (line 109-117) but is **never called** by the `acquire()` flow. The function is dead code.

---

## G. Session Health/Reuse

### G.1 Current State

| Concern | Status |
|---------|--------|
| Binding exists | **YES** — `RuntimeSessionRegistry.getByWorkflowRun()` |
| OpenCode session still exists | **NOT CHECKED** — no liveness probe |
| Session belongs to expected directory | **NOT VALIDATED** — `validateDirectory()` is dead code |
| Session is usable | **NOT CHECKED** — no health probe |

### G.2 Health Check Gap

Before reusing an OpenCode session, Vestara should verify:
1. Session still exists in OpenCode
2. Session belongs to expected project/directory
3. Session is not in error/abandoned state

**None of these checks exist.** The `RuntimeSessionRegistry` stores bindings but does not validate them.

---

## H. Concurrency/Single-Flight

### H.1 Single-Flight Implementation

`InMemoryRuntimeSessionRegistry.acquire()` uses a **promise-chain lock** per `workflowRunId`:

```typescript
// runtime-session-registry.ts:149-178
const existing = this.locks.get(input.workflowRunId);
if (existing) {
  return existing;  // Wait on first caller's promise
}
const promise = this.doAcquire(input);
this.locks.set(input.workflowRunId, promise);
try {
  return await promise;
} finally {
  this.locks.delete(input.workflowRunId);
}
```

### H.2 Duplicate-Session Problem

**Scenario:** Two concurrent workflow steps call `provider.complete()` simultaneously.

**Current behavior (without M7 wiring):**
1. Both create new OpenCode sessions
2. Both get different session IDs
3. Both complete independently
4. No conflict — sessions are ephemeral

**Desired behavior (with M7 wiring):**
1. Both call `RuntimeSessionRegistry.acquire()`
2. First caller creates binding, second waits
3. Both receive same binding with same `physicalSessionId`
4. Both send messages to same OpenCode session

### H.3 Gap

The single-flight mechanism exists in the registry but is not invoked by the execution path.

---

## I. Per-Turn Execution Binding

### I.1 Current Flow

```
AgentHarnessRuntime.continueTurn()
  ↓ resolveExecutionOverride(agentId) → { providerId, modelId, runtimeAgent }
  ↓ provider.complete({ model, agent, title, ... })
  ↓
OpenCodeRuntimeProvider.complete()
  ↓ createSession(title)  ← NO agent/model in session creation
  ↓ streamReply(sessionId, prompt, agent, model)
    ↓ sendMessageAsync(sessionId, { parts, agent, model })  ← agent/model HERE
```

### I.2 Execution Binding (Per-Turn)

| Turn | agentId | runtimeAgent | providerId | modelId | How Resolved |
|------|---------|-------------|------------|---------|-------------|
| Planner | `vestara-planner` | `vestara-planner` | `opencode` | `deepseek-v4-flash-free` | AgentStorage + routing |
| Developer | `vestara-developer` | `vestara-developer` | `opencode` | `mimo-v2.5-free` | AgentStorage + routing |
| Reviewer | `vestara-reviewer` | `vestara-reviewer` | `opencode` | `nemotron-3-ultra-free` | AgentStorage + routing |
| Verifier | `vestara-verifier` | `vestara-verifier` | `opencode` | `deepseek-v4-flash-free` | AgentStorage + routing |

### I.3 Session Continuity vs Execution Binding

**Session Continuity** (M7): Which OpenCode session carries the conversation
**Execution Binding**: Which agent/model/provider executes the current turn

These are **separate concerns**. A reused session receives different execution bindings per turn via the message-level `agent` and `model` fields.

### I.4 Evidence from ca4b8cb

The corrected OpenCode contract places agent/model on the **message**, not the session:
- `POST /session` — session creation (directory only)
- `POST /session/{id}/message` — message execution (agent + model)

This proves that session reuse is compatible with per-turn execution binding.

---

## J. Permissions/Tools Isolation

### J.1 Current State

Each OpenCode session is created fresh per `complete()` call. There is no cross-turn permission leakage because sessions are ephemeral.

### J.2 With Session Reuse

If one OpenCode session is shared across multiple Vestara agents:

| Concern | Risk | Current Mitigation |
|---------|------|-------------------|
| Tools | **LOW** — OpenCode agents have tool definitions | Per-agent tool definitions are separate |
| Permissions | **LOW** — Vestara authorization is per-turn | `resolveAgentExecutionFor()` resolves per-turn |
| System instructions | **MEDIUM** — system prompt may differ per agent | `HarnessContextAssembler` builds per-turn |
| Agent configuration | **LOW** — agent config is per-turn | `resolveAgentExecutionFor()` resolves per-turn |

### J.3 Invariant

**Session continuity must not imply permission continuity.** Each turn must resolve its own execution binding independently.

---

## K. Lifecycle Transitions

### K.1 Current Lifecycle (Actual)

```
UNBOUND (no binding)
  ↓ provider.complete() called
  ↓ createSession() → NEW physical session
  ↓ sendMessageAsync() → message sent
  ↓ SSE events → text accumulated
  ↓ session.idle → turn complete
  ↓ abortSession() → session destroyed
  ↓
UNBOUND (no binding)
```

**No persistent bindings. No reuse. No lifecycle state machine.**

### K.2 Desired Lifecycle (M7 Target)

```
UNBOUND (no binding)
  ↓ RuntimeSessionRegistry.acquire()
  ↓ ACQUIRING (binding created, physical session pending)
  ↓ setPhysicalSessionId() → BOUND
  ↓ provider.complete() with reused session
  ↓ ACTIVE (session in use)
  ↓ turn complete → IDLE (session available for reuse)
  ↓ next turn → ACTIVE (session reused)
  ↓ workflow complete → COMPLETED
  ↓ OR session error → FAILED
  ↓ OR session expired → INVALID
  ↓ OR new session needed → REACQUIRING
  ↓ cleanup → RELEASED
```

### K.3 Current vs Desired

| State | Current | Desired |
|-------|---------|---------|
| UNBOUND | ✅ | ✅ |
| ACQUIRING | ❌ Not implemented | Needed |
| BOUND | ❌ Not implemented | Needed |
| ACTIVE | ❌ Not implemented | Needed |
| IDLE | ❌ Not implemented | Needed |
| COMPLETED | ❌ Not implemented | Needed |
| FAILED | ❌ Not implemented | Needed |
| INVALID | ❌ Not implemented | Needed |
| REACQUIRING | ❌ Not implemented | Needed |
| RELEASED | ❌ Not implemented | Needed |

---

## L. Gaps Against Intended M7 Architecture

### L.1 PROVEN Gaps

| Gap | Evidence | Impact |
|-----|----------|--------|
| RuntimeSessionRegistry not wired into execution path | `runtime-provider.ts:296` creates sessions directly | Session continuity not achieved |
| validateDirectory() is dead code | Never called by `acquire()` flow | Cross-repository reuse possible |
| No SQLite persistence | InMemoryRuntimeSessionRegistry only | Bindings lost on restart |
| No session health/validation | No liveness probe before reuse | Stale sessions may be reused |
| No session cleanup/invalidation | No garbage collection | Memory leak in long-running processes |

### L.2 LIKELY Gaps

| Gap | Evidence | Impact |
|-----|----------|--------|
| Session reconciliation on restart | No recovery logic | Orphaned sessions after crash |
| Managed vs. unmanaged detection | Not implemented | Cannot distinguish Vestara-created from external sessions |
| ISOLATED_TASK / ISOLATED_AGENT policies | Defined but not enforced | Policies exist but are no-ops |

### L.3 INDETERMINATE Gaps

| Gap | Evidence | Impact |
|-----|----------|--------|
| Permission isolation across turns | Depends on OpenCode agent configuration | Need to verify OpenCode's agent isolation model |
| Cross-session tool leakage | Depends on OpenCode session architecture | Need to verify OpenCode's session isolation model |

---

## M. Minimum Remediation Sequence

### M.1 Phase 1: Wire RuntimeSessionRegistry (Foundation)

**Scope:** Connect `RuntimeSessionRegistry` to the execution path without changing session lifecycle.

1. Inject `RuntimeSessionRegistry` into `AgentHarnessRuntime` (or `OpenCodeRuntimeProvider`)
2. In `continueTurn()`, call `registry.acquire()` before `provider.complete()`
3. After `provider.complete()` returns, call `registry.setPhysicalSessionId()` if a new session was created
4. After `provider.complete()` returns (success or failure), call `registry.updateLifecycle()`

**Classification:** PROVEN required for session continuity.

### M.2 Phase 2: Session Reuse (Core M7)

**Scope:** Modify `OpenCodeRuntimeProvider.complete()` to reuse sessions from bindings.

1. In `createSession()`, check if binding has a `physicalSessionId`
2. If yes, reuse the existing session (skip creation)
3. If no, create a new session and bind it
4. Remove `abortSession()` from `finally` (session is persistent, not ephemeral)

**Classification:** PROVEN required for workflow session continuity.

### M.3 Phase 3: Session Health/Validation

**Scope:** Add health checks before session reuse.

1. Before reusing a session, call `getSession()` to verify it exists
2. Validate directory matches binding's directory
3. Check session status is not error/abandoned
4. If validation fails, transition to REACQUIRING

**Classification:** LIKELY required for production reliability.

### M.4 Phase 4: SQLite Persistence (Production)

**Scope:** Replace in-memory registry with SQLite-backed implementation.

1. Implement `PersistentSessionRegistry` per M7 development plan schema
2. Add recovery logic on startup
3. Add session reconciliation (detect orphaned sessions)

**Classification:** LIKELY required for production durability.

### M.5 Phase 5: Session Cleanup (Production)

**Scope:** Add garbage collection for stale bindings.

1. Add TTL-based binding expiration
2. Add cleanup on workflow completion
3. Add cleanup on server shutdown

**Classification:** LIKELY required for production stability.

---

## N. Recommended M7 Implementation Slices

### Slice 1: Wire Registry into Execution Path

**Files:**
- `packages/agent-harness/src/index.ts` — inject `RuntimeSessionRegistry`, call `acquire()` in `continueTurn()`
- `packages/providers/opencode/src/runtime-provider.ts` — accept existing session ID, skip creation if binding exists

**Tests:**
- Extend `m7-runtime-session-registry.test.ts` to prove wiring
- Add integration test: workflow → acquire → complete → binding persists

### Slice 2: Session Reuse

**Files:**
- `packages/providers/opencode/src/runtime-provider.ts` — modify `complete()` to accept and reuse sessions
- `packages/agent-harness/src/index.ts` — pass binding to provider

**Tests:**
- Prove two turns share one OpenCode session
- Prove per-turn execution binding overrides session defaults

### Slice 3: Session Health

**Files:**
- `packages/opencode-runtime/src/sessions/runtime-session-registry.ts` — add health check logic
- `packages/providers/opencode/src/runtime-provider.ts` — validate before reuse

**Tests:**
- Prove stale sessions are detected and recreated
- Prove directory mismatch is detected

### Slice 4: SQLite Persistence

**Files:**
- `packages/opencode-runtime/src/sessions/` — new `PersistentSessionRegistry`
- `apps/api/src/workspace-context.ts` — wire persistent registry

**Tests:**
- Prove bindings survive restart
- Prove reconciliation works

### Slice 5: Session Cleanup

**Files:**
- `packages/opencode-runtime/src/sessions/runtime-session-registry.ts` — add cleanup methods
- `apps/api/src/workspace-context.ts` — wire cleanup on shutdown

**Tests:**
- Prove stale bindings are cleaned up
- Prove memory is released

---

*Audit complete. Zero production mutation. Awaiting Director review.*

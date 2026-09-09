# AR-GA-CORE-003 — Execution Contract Baseline

**Program:** AR-GA-CORE — Activity Room + Global Assistant Convergence
**Milestone:** 003 — Execution Contract Baseline
**Date:** 2026-09-09
**Depends On:** AR-GA-CORE-001 (frozen), AR-GA-CORE-002 (frozen)
**Commit:** `8dcd5602ecef3a8dc0288e4fd07df143b310927a`

---

## Table of Contents

1. [Current Execution Representations](#1-current-execution-representations)
2. [Collisions and Overlaps](#2-collisions-and-overlaps)
3. [Canonical Ownership](#3-canonical-ownership)
4. [Execution Identities](#4-execution-identities)
5. [Execution Lifecycle](#5-execution-lifecycle)
6. [Execution Request](#6-execution-request)
7. [Execution Result](#7-execution-result)
8. [Execution Lineage](#8-execution-lineage)
9. [Runtime Binding Boundary](#9-runtime-binding-boundary)
10. [Permission Boundary](#10-permission-boundary)
11. [Activity vs State](#11-activity-vs-state)
12. [Artifact Boundary](#12-artifact-boundary)
13. [Task Boundary](#13-task-boundary)
14. [Package Dependencies](#14-package-dependencies)
15. [Compatibility and Migration](#15-compatibility-and-migration)
16. [Verification Evidence](#16-verification-evidence)

---

## 1. Current Execution Representations

### 1.1 Identity Systems

| System | Package | ID Style | Execution Identity | Task Identity |
|--------|---------|----------|-------------------|---------------|
| GA Adapter | `@vestara/api` | OpenCode callID per operation | `operationId` (callID), `sessionId` (OpenCode session) | N/A |
| Workflow Orchestrator (PCS-025) | `@vestara/workflow-orchestrator` | Plain `string` | `project.id` | `task.id` |
| Formal DAG (ARX-015 M8) | `@vestara/types` | `Brand<string, ...>` | `ExecutionId`, `WorkflowRunId`, `TraceId`, `RequestId` | `WorkflowTaskId` |
| Multi-Agent Chain (ADR-118) | `@vestara/workspace` | Plain `string` | `workflowId` (generated) | `threadId` (harness) |
| Runtime Session (M7) | `@vestara/opencode-runtime` | `Brand<string, ...>` | `RuntimeSessionId` | N/A |

### 1.2 State Machines

| Machine | Package | States | Count |
|---------|---------|--------|-------|
| `ServiceStatus` | `@vestara/shared` | uninitialized → initializing → initialized → starting → running → degraded → stopping → stopped → disposed | 9 |
| `RuntimeState` | `@vestara/types` | created → initializing → running → suspended → degraded → recovering → quarantined → stopping → stopped → failed → destroyed | 11 |
| `RuntimeSessionLifecycle` | `@vestara/opencode-runtime` | acquiring → active → completed/failed/rollover | 5 |
| `VestaraExecutionState` | `@vestara/opencode-runtime` | queued → preparing → reasoning → active → waiting → completed/failed/cancelled/stalled | 9 |
| `ProviderStatus` | `@vestara/shared` | uninitialized → initializing → available → degraded → unavailable → error | 6 |

### 1.3 Execution Requests

| Request | Package | Fields |
|---------|---------|--------|
| `CompletionRequest` | `@vestara/shared` | model, messages, temperature, maxTokens, stream, tools, signal, conversationId, provider, surfaceContext, runtimeSessionId |
| `WorkflowRunStartInput` | `@vestara/types` | plan, executionId, traceId, requestId, repositoryBindingId, runtimeSessionBindingId |
| `MultiAgentWorkflowStartInput` | `@vestara/workspace` | goal, stages[] |

### 1.4 Execution Results

| Result | Package | Fields |
|--------|---------|--------|
| `CompletionResponse` | `@vestara/shared` | id, model, provider, content, toolCalls, usage, latency, resolution |
| `TaskDispatchResult` | `@vestara/workflow-orchestrator` | status, agentId, output, error, artifacts |
| `OpenCodeExecutionEvidence` | `@vestara/opencode-runtime` | sessionId, messageCount, changedFiles, todos, outcome |

### 1.5 Task Types

| Task | Package | Statuses | Count |
|------|---------|----------|-------|
| `Task` | `@vestara/workspace` | pending, in-progress, completed, blocked | 4 |
| `WorkflowTask` | `@vestara/workflow-orchestrator` | pending, ready, awaiting-approval, assigned, in-progress, needs-review, reviewing, changes-requested, testing, approved, retrying, blocked, failed, cancelled, completed | 15 |
| `TaskActivity` | `@vestara/activity-room` | Mirrors workflow-orchestrator minus `needs-review` | 14 |
| `TaskThread` | `@vestara/types` | active, blocked, completed, failed, cancelled, archived | 6 |

### 1.6 Artifact Types

| Artifact | Package | Kinds |
|----------|---------|-------|
| `WorkflowArtifact` | `@vestara/workflow-orchestrator` | analysis, plan, architecture, changeset, review, test, verification (7) |
| `EvidenceArtifact` | `@vestara/types` (harness) | command, file, test, log, screenshot, api, environment, custom (8) |
| `AssistantExecutionDetail` | `@vestara/shared` | tool, edit, terminal, task-snapshot, permission, question, verification, artifact, generic (9) |

---

## 2. Collisions and Overlaps

### 2.1 Identity Collisions

| Collision | Severity | Detail |
|-----------|----------|--------|
| Multiple `TaskStatus` types | ADJACENT | workspace (4), workflow-orchestrator (15), activity-room (14), harness (6) — all different |
| Multiple `WorkflowPlan` types | ADJACENT | `@vestara/workflow-orchestrator` and `@vestara/types` define different `WorkflowPlan` interfaces |
| Plain string vs branded IDs | ADJACENT | workspace/workflow-orchestrator use plain strings; types uses branded types |

### 2.2 State Machine Collisions

| Collision | Severity | Detail |
|-----------|----------|--------|
| 5 overlapping state machines | ADJACENT | Each serves a different layer but naming overlap creates confusion |
| `VestaraExecutionState` mixes lifecycle and activity | ADJACENT | 'reasoning' and 'active' are activity states, not lifecycle states |

### 2.3 Concept Collisions

| Collision | Severity | Detail |
|-----------|----------|--------|
| Todo ≠ Task ≠ WorkflowTask | ADJACENT | Three different task concepts sharing the word "task" |
| Activity ≠ State | ADJACENT | Tool calls are activities, not lifecycle states |
| Execution ≠ Session ≠ Conversation | ADJACENT | Three distinct lifecycle concepts often conflated |

---

## 3. Canonical Ownership

| Concept | Canonical Owner | Package | Rationale |
|---------|----------------|---------|-----------|
| Execution identity | `@vestara/execution-types` | `execution-types` | Branded types preventing accidental substitution |
| Execution lifecycle | `@vestara/execution-types` | `execution-types` | Vestara-owned state machine |
| Execution request | `@vestara/execution-types` | `execution-types` | Runtime-neutral request contract |
| Execution result | `@vestara/execution-types` | `execution-types` | Runtime-neutral result envelope |
| Execution lineage | `@vestara/execution-types` | `execution-types` | Parent/child tree utilities |
| Runtime binding | `@vestara/execution-types` | `execution-types` | Binding snapshot |
| Execution activity | `@vestara/execution-types` | `execution-types` | Ephemeral activity items |
| Artifacts | `@vestara/execution-types` | `execution-types` | Reference-based artifact contract |
| Runtime lifecycle | `@vestara/runtime` | `runtime` | Runtime state machine (11 states) |
| Session binding | `@vestara/opencode-runtime` | `opencode-runtime` | M7 session continuity |
| Workflow execution | `@vestara/types` + `@vestara/workflow-orchestrator` | both | DAG execution model |
| Task lifecycle | `@vestara/workflow-orchestrator` | `workflow-orchestrator` | 15-status task model |

---

## 4. Execution Identities

### 4.1 Canonical Identity Hierarchy

```
WorkflowRun (WorkflowRunId)
  └── WorkflowTask (WorkflowTaskId)
         └── Execution (ExecutionId)
                └── Turn (TurnId)
                       └── Operation (OperationId)
```

### 4.2 Identity Ownership

| Identity | Owner | Purpose | Lifecycle |
|----------|-------|---------|-----------|
| `ExecutionId` | `@vestara/types` | Canonical execution identity | Per-execution |
| `WorkflowRunId` | `@vestara/types` | Workflow execution attempt | Per-run |
| `WorkflowTaskId` | `@vestara/types` | Bounded executable unit | Per-task |
| `RuntimeSessionId` | `@vestara/types` | Session continuity binding | Per-session |
| `TurnId` | `@vestara/execution-types` | Single prompt/response turn | Per-turn |
| `OperationId` | `@vestara/execution-types` | Tool call, permission, etc. | Per-operation |
| `ConversationId` | `@vestara/shared` | Conversation identity | Per-conversation |

### 4.3 Critical Invariant

```
Conversation
     │
     └── Execution (ExecutionId)
            │
            └── RuntimeBinding
                    │
                    └── RuntimeSession (RuntimeSessionId)
```

These are distinct lifecycle concepts:
- A conversation may outlive an execution
- An execution may be recreated without destroying the conversation
- A runtime session may be recreated without destroying the execution
- A future conversation may use more than one runtime

---

## 5. Execution Lifecycle

### 5.1 Canonical State Machine

```
requested → binding → ready → running → completed
                                          ├── failed
                                          ├── cancelled
                                          └── timed_out
requested → failed (binding error)
binding → failed (resolution error)
ready → cancelled (abort before execution)
```

### 5.2 States

| State | Meaning | Terminal? |
|-------|---------|-----------|
| `requested` | Execution requested, not yet bound | No |
| `binding` | Runtime binding in progress | No |
| `ready` | Bound to runtime, waiting to start | No |
| `running` | Actively executing | No |
| `completed` | Successfully finished | Yes |
| `failed` | Failed with error | Yes |
| `cancelled` | Cancelled by user/system | Yes |
| `timed_out` | Exceeded time limit | Yes |

### 5.3 External State Mapping

| External State | Maps To | Rationale |
|---------------|---------|-----------|
| `VestaraExecutionState.queued` | `requested` | Vestara-owned |
| `VestaraExecutionState.preparing` | `binding` | Vestara-owned |
| `VestaraExecutionState.reasoning` | `running` | Activity within running |
| `VestaraExecutionState.active` | `running` | Activity within running |
| `VestaraExecutionState.completed` | `completed` | Direct |
| `VestaraExecutionState.failed` | `failed` | Direct |
| `RuntimeSessionLifecycle.acquiring` | `binding` | Session-level binding |
| `RuntimeSessionLifecycle.active` | `ready`/`running` | Session ready |

---

## 6. Execution Request

### 6.1 Contract

```typescript
interface ExecutionRequest {
  id: ExecutionId;
  actor: ExecutionActor;          // who initiated
  objective: string;              // what to accomplish
  context: ExecutionContext;      // where/conditions
  routing?: RoutingIntent;        // provider/model desire
  permissions?: PermissionContext; // authorization context
  parentExecutionId?: ExecutionId; // lineage
  conversationId?: string;        // conversation correlation
  workflowRunId?: WorkflowRunId;   // workflow correlation
  workflowTaskId?: WorkflowTaskId; // task correlation
  timeout?: ExecutionTimeoutConfig;
  metadata?: Record<string, unknown>;
}
```

### 6.2 Separation of Concerns

| Concern | Field | Rationale |
|---------|-------|-----------|
| Objective | `objective` | What the execution should accomplish |
| Context | `context` | Where and under what conditions |
| Routing | `routing` | Which provider/model (resolved by binding layer) |
| Permissions | `permissions` | What authorizations accompany the execution |
| Lineage | `parentExecutionId` | Parent/child execution tree |
| Correlation | `conversationId`, `workflowRunId`, `workflowTaskId` | Cross-domain linkage |

### 6.3 Runtime Neutrality

The request contains NO OpenCode-specific fields. Runtime adapters translate this into runtime-native formats:
- OpenCode: `{ parts, agent, model, system, tools }`
- Future Codex: TBD
- Future Claude Code: TBD

---

## 7. Execution Result

### 7.1 Critical Distinction

```
Execution completed successfully
        ≠
Verification proved the produced work correct
```

An execution result may contain output, artifacts, evidence, usage, timing, and diagnostics, but must NOT imply verification success merely because the runtime returned successfully.

### 7.2 Contract

```typescript
interface ExecutionResult {
  id: ExecutionId;
  status: ExecutionTerminalStatus;  // completed|failed|cancelled|timed_out
  output?: string;
  artifacts: ExecutionArtifact[];
  evidence: ExecutionEvidence[];
  usage?: ExecutionUsage;
  timing: ExecutionTiming;
  error?: ExecutionError;
  verification?: VerificationOutcome;  // separate from status
  metadata?: Record<string, unknown>;
}
```

### 7.3 Verification Separation

| Scenario | `status` | `verification?.verified` | Meaning |
|----------|----------|-------------------------|---------|
| Runtime succeeded, work verified | `completed` | `true` | Full success |
| Runtime succeeded, work not verified | `completed` | `undefined` | Execution succeeded, no verification performed |
| Runtime succeeded, work failed verification | `completed` | `false` | Execution succeeded but produced incorrect work |
| Runtime failed | `failed` | `undefined` | Execution failed |

---

## 8. Execution Lineage

### 8.1 Model

Lineage is expressed via `parentExecutionId` on `ExecutionRequest`. The execution contract provides tree utilities:

```typescript
interface ExecutionLineageNode {
  executionId: ExecutionId;
  parentExecutionId?: ExecutionId;
  depth: number;
}

function executionDepth(node, lookup): number;
function ancestorIds(node, lookup): ExecutionId[];
function isAncestor(ancestorId, descendantId, lookup): boolean;
```

### 8.2 Use Cases

- Agent/subagent inspection (subagent started → subagent completed)
- Execution timeline (root → child → grandchild)
- Task/Todo projection (execution correlates to task)
- Activity Room projection (execution events → activity stream)
- Global Assistant execution navigation (drill into child executions)

### 8.3 Design Decision

Lineage uses `parentExecutionId` (single parent) rather than a full graph structure. This is sufficient for the tree-shaped execution hierarchies observed in the codebase (agent → subagent, workflow → task → execution). A full execution graph engine is explicitly out of scope.

---

## 9. Runtime Binding Boundary

### 9.1 Binding Contract

```typescript
interface RuntimeBinding {
  executionId: ExecutionId;
  runtimeId: string;                // 'opencode', 'codex', etc.
  runtimeSessionId?: RuntimeSessionId;
  providerId?: string;
  modelId?: string;
  boundAt: string;
  metadata?: Record<string, unknown>;
}
```

### 9.2 Relationship Map

```
Execution
  │
  ├── RuntimeBinding
  │     ├── runtimeId (which runtime)
  │     ├── runtimeSessionId (which session)
  │     ├── providerId (which provider)
  │     └── modelId (which model)
  │
  └── (multiple bindings possible over time, e.g., retry with different runtime)
```

### 9.3 CORE-002 Preservation

The binding uses `providerId` and `modelId` as plain strings (matching CORE-002's branded `ProviderId`/`ModelId` conceptually). The binding is a snapshot at execution time — runtime state changes do not mutate the binding.

---

## 10. Permission Boundary

### 10.1 Two-Phase Authority Model

```
Vestara policy decision (ALLOW/ASK/DENY)
        ↓
Execution authorization
        ↓
Runtime enforcement/interception
```

### 10.2 Required Downstream Invariant

CORE-002 found that `normalizePermissionAction()` maps `task` → `other`, `doom_loop` → `other`, etc. The canonical `PermissionRequest.action` field stores only the normalized `PermissionAction` — the native action string is irrecoverable from `action` alone.

**Required invariant for Phase 2 migration:**

When constructing a `PermissionRequest` from a runtime-native request, the adapter MUST preserve the native action in the `metadata` field:

```typescript
const request: PermissionRequest = {
  id: nativeRequest.id,
  action: normalizePermissionAction(nativeRequest.action),
  resources: nativeRequest.resources,
  risk: classifyPermissionRisk(nativeRequest.action),
  askedAt: nativeRequest.askedAt,
  metadata: { nativeAction: nativeRequest.action, runtime: 'opencode' },
};
```

### 10.3 Current State

- `@vestara/permission-contracts` has zero consumers today
- The actual runtime path uses `OpenCodePermissionRequest` which preserves raw strings
- The adapter's `detail` object carries raw actions to the browser
- This invariant becomes a BLOCKER when Phase 2 migration occurs

---

## 11. Activity vs State

### 11.1 Distinction

| Concept | Definition | Examples |
|---------|-----------|----------|
| **Execution State** | Lifecycle status of the execution | requested, binding, ready, running, completed, failed, cancelled, timed_out |
| **Execution Activity** | What the execution is currently doing | text-delta, tool-call, file-edit, shell-command, permission-request |

### 11.2 Design Principle

Tool calls must not become lifecycle states. A tool call is an activity within a running execution. The execution lifecycle advances independently of tool activities.

### 11.3 Activity Types

12 activity types covering all observed runtime operations:
- Text generation: `text-delta`
- Tool operations: `tool-call`, `tool-result`
- File operations: `file-edit`
- Shell operations: `shell-command`
- Permission operations: `permission-request`, `permission-response`
- Question operations: `question-asked`, `question-answered`
- Subagent operations: `subagent-started`, `subagent-completed`
- Generic: `status-update`

### 11.4 Activity State

Each activity item has its own state: `running`, `completed`, `failed`. This is distinct from the execution lifecycle state.

---

## 12. Artifact Boundary

### 12.1 Design Decision

Artifacts use **references**, not embedded payloads. The execution contract stores a reference (URI, path, or content hash) to the artifact content, not the content itself.

### 12.2 Artifact Kinds

10 artifact kinds covering all observed output types:
- `file-change`, `diff`, `shell-output`, `generated-file`
- `test-result`, `verification-evidence`
- `image`, `document`
- `todo-snapshot`, `other`

### 12.3 Evidence vs Artifacts

| Concept | Definition | Direction |
|---------|-----------|-----------|
| **Artifact** | Output produced by the execution | Produced (execution → world) |
| **Evidence** | Proof of what happened during execution | Collected (execution → verification) |

---

## 13. Task Boundary

### 13.1 Conceptual Relationships

```
Composer Todo (UI projection)
    ↕ correlates with (not owns)
Execution Task (execution-types)
    ↕ correlates with (not owns)
Workflow Task (workflow-orchestrator)
```

### 13.2 Design Decision

The execution contract correlates to tasks via `workflowTaskId` on `ExecutionRequest` and `workflowRunId`. It does NOT own the Task domain. The future Composer Todo/Task panel is a projection — the React component must not become authoritative task storage.

### 13.3 Task Status Multiplicity

| Task Type | Statuses | Owner |
|-----------|----------|-------|
| Workspace Task | 4 | `@vestara/workspace` |
| Workflow Task | 15 | `@vestara/workflow-orchestrator` |
| Task Activity | 14 | `@vestara/activity-room` |
| Task Thread | 6 | `@vestara/types` (harness) |

These remain separate. The execution contract does not attempt to unify them.

---

## 14. Package Dependencies

### 14.1 New Package

| Package | Location | Dependencies |
|---------|----------|-------------|
| `@vestara/execution-types` | `packages/execution-types/` | `@vestara/types`, `@vestara/permission-contracts` |

### 14.2 Dependency Direction

```
Layer 0 (zero deps):
  @vestara/types
  @vestara/permission-contracts

Layer 0 (depends on Layer 0):
  @vestara/execution-types → @vestara/types, @vestara/permission-contracts
```

No cycles. Correct direction (lower → higher layer is forbidden; same layer with no back-edge is fine).

### 14.3 Verification

```
$ node scripts/workspace-architecture.mjs --check
Dependency boundaries valid across 107 workspace projects.
```

---

## 15. Compatibility and Migration

### 15.1 CORE-003 is Additive

The `@vestara/execution-types` package is new and has zero consumers. It does not modify existing code.

### 15.2 Deferred Migrations

| Migration | Reason | Blocker? |
|-----------|--------|----------|
| GA adapter → use ExecutionRequest | Requires adapter refactoring | No (Phase 2) |
| Workflow orchestrator → use ExecutionResult | Requires orchestrator refactoring | No (Phase 2) |
| VestaraExecutionState → map to ExecutionStatus | Requires normalizer update | No (Phase 2) |
| PermissionRequest → preserve native action | Requires PermissionRequest contract update | No (Phase 2, but BLOCKER when it occurs) |

### 15.3 Compatibility Adapters (Future)

| Adapter | From | To | Purpose |
|---------|------|----|---------|
| GA adapter | CompletionRequest | ExecutionRequest | Translate GA request to canonical |
| Workflow adapter | WorkflowRunStartInput | ExecutionRequest | Translate workflow start to canonical |
| Result adapter | CompletionResponse | ExecutionResult | Translate GA result to canonical |

---

## 16. Verification Evidence

### 16.1 Build Verification

```
$ npx tsc --noEmit (in packages/execution-types/)
✓ 0 errors
```

### 16.2 Test Results

```
$ npx vitest run packages/execution-types/__tests__/execution-types.test.ts
✓ 28 tests passed
```

### 16.3 Lint Verification

```
$ npx biome check packages/execution-types/src/ --diagnostic-level=error
✓ 0 errors
```

### 16.4 Dependency Boundary Verification

```
$ node scripts/workspace-architecture.mjs --check
✓ Dependency boundaries valid across 107 workspace projects.
```

### 16.5 CORE-002 Regression Check

```
$ npx vitest run packages/agent-types/ packages/routing-types/ packages/permission-contracts/
✓ 65 tests passed (no regressions)
```

### 16.6 Key Invariants Verified

1. **Canonical execution identity exists** — `ExecutionId`, `TurnId`, `OperationId` (branded)
2. **Execution request is runtime-neutral** — No OpenCode-specific fields
3. **Execution lifecycle is Vestara-owned** — 8 states, 4 terminal, explicit transitions
4. **Terminal semantics are explicit** — `completed` ≠ `verified`
5. **Execution result is distinct from verification** — `VerificationOutcome` is optional
6. **Parent/child execution lineage is modeled** — `parentExecutionId` + tree utilities
7. **Runtime binding boundary is explicit** — `RuntimeBinding` snapshot
8. **Conversation/session/execution identities remain distinct** — Hierarchy documented
9. **Permission boundary preserves native runtime identity** — Invariant documented for Phase 2
10. **Execution state and activity are distinct** — `ExecutionStatus` vs `ExecutionActivity`
11. **Artifact boundary is defined** — 10 kinds, reference-based
12. **Task correlation does not create task ownership** — `workflowTaskId` is correlation only
13. **Package dependency direction is valid** — 107 projects, no cycles
14. **Focused verification passes** — 28 new tests + 65 CORE-002 tests
15. **Architecture evidence exists** — This document

---

## Completion Gate

```
[x] canonical execution identity exists
[x] execution request is runtime-neutral
[x] execution lifecycle is Vestara-owned
[x] terminal semantics are explicit
[x] execution result is distinct from verification
[x] parent/child execution lineage is modeled
[x] runtime binding boundary is explicit
[x] conversation/session/execution identities remain distinct
[x] permission boundary preserves native runtime identity (documented invariant)
[x] execution state and activity are distinct
[x] artifact boundary is defined
[x] task correlation does not create task ownership
[x] package dependency direction is valid
[x] focused verification passes
[x] architecture evidence exists
```

---

**Recommendation:** `READY FOR AR-GA-CORE-004`

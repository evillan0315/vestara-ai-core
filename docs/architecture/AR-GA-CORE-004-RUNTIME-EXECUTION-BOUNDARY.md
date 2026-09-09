# AR-GA-CORE-004 — Runtime Execution Boundary

**Program:** AR-GA-CORE — Activity Room + Global Assistant Convergence
**Milestone:** 004 — Runtime Execution Boundary
**Date:** 2026-009-09
**Depends On:** CORE-001 (frozen), CORE-002 (frozen), CORE-003 (frozen)
**Commit:** `8dcd5602ecef3a8dc0288e4fd07df143b310927a`

---

## Table of Contents

1. [Current Runtime Call Graph](#1-current-runtime-call-graph)
2. [Target Runtime Boundary](#2-target-runtime-boundary)
3. [Port Contract](#3-port-contract)
4. [Adapter Responsibilities](#4-adapter-responsibilities)
5. [Session Relationship](#5-session-relationship)
6. [Provider/Model Relationship](#6-providermodel-relationship)
7. [Permission Translation](#7-permission-translation)
8. [Native Metadata Preservation](#8-native-metadata-preservation)
9. [Execution Observation Mechanism](#9-execution-observation-mechanism)
10. [Activity Mappings](#10-activity-mappings)
11. [Artifact Mappings](#11-artifact-mappings)
12. [Cancellation/Timeout Semantics](#12-cancellationtimeout-semantics)
13. [Compatibility Strategy](#13-compatibility-strategy)
14. [Deferred Migrations](#14-deferred-migrations)
15. [Verification Evidence](#15-verification-evidence)

---

## 1. Current Runtime Call Graph

### 1.1 Existing Boundary Points (from CORE-001/003 audit)

```
Browser (Vestara UI)
    │
    │ CompletionRequest { messages, model, provider, surfaceContext, conversationId }
    ▼
┌─ ProviderExecutor.complete() / .stream() ─────────────────────────────┐
│                                                                       │
│  1. resolveSession() → sessionRegistry.acquire()                      │
│     ├─ GET /session/:id (liveness probe)              ─── Vestara→OC │
│     └─ POST /session (create if needed)               ─── Vestara→OC │
│                                                                       │
│  2. buildSurfaceSystem(surfaceContext) → system string  ─── Vestara    │
│  3. buildToolsMap(capabilityPolicy) → tools map         ─── Vestara    │
│  4. resolveProviderModel() → { providerId, modelId }   ─── Vestara    │
│                                                                       │
│  5. client.sendMessageAsync()                                       │
│     POST /session/:id/prompt_async  { parts, agent, model,         │
│     system, tools }                            ─── Vestara→OC        │
│                                                                       │
│  6. client.openEventStream()                                          │
│     GET /event?directory=...                                         │
│     SSE frames → parseSseFrame() → OpenCodeEvent    ─── OC→Vestara   │
│                                                                       │
│  7. For each event:                                                   │
│     ├─ text delta         → StreamChunk { type: 'text' }             │
│     ├─ tool event         → projectTool*() → StreamChunk { tool_* }  │
│     ├─ shell event        → projectTerminal*() → StreamChunk         │
│     ├─ permission.asked   → evaluatePermission() → respondTo*()      │
│     ├─ question.asked     → broker.awaitQuestion()                   │
│     ├─ todo.updated       → StreamChunk { task-snapshot }            │
│     ├─ file.edited        → StreamChunk { edit }                     │
│     ├─ session.status/idle → turnDone = true                         │
│     └─ session.error      → StreamChunk { error }                    │
│                                                                       │
│  8. Post-turn enrichment:                                             │
│     ├─ GET /session/:id/diff  → StreamChunk { edit details }  ── OC │
│     └─ GET /session/:id/todo  → StreamChunk { task-snapshot }  ── OC │
│                                                                       │
│  9. Cleanup:                                                          │
│     └─ if !completedNaturally:                                        │
│        POST /session/:id/abort              ─── Vestara→OC            │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
    │
    │ StreamChunk[] → CompletionResponse
    ▼
Browser (Vestara SSE)
```

### 1.2 Existing Boundary Responsibilities (KEEP/ADAPT/RETAIL)

| Responsibility | Current Location | Classification | Rationale |
|---------------|-----------------|----------------|-----------|
| Session creation/reuse | `assistant-conversation-sessions.ts` | KEEP | Proven single-flight acquisition |
| Provider/model resolution | `assistant-binding-resolver.ts` | KEEP | Server-authoritative validation |
| Capability policy | `assistant-capability-policy.ts` | KEEP | Risk-sensitive authorization |
| Permission interception | `assistant-opencode-adapter.ts:359-489` | ADAPT | Must preserve native identity |
| Event projection | `assistant-execution-projection.ts` | ADAPT | Must map to canonical observations |
| Turn execution loop | `assistant-opencode-adapter.ts:259-584` | ADAPT | Must yield canonical observations |
| Post-turn enrichment | `assistant-opencode-adapter.ts:586-630` | KEEP | Diff/todos retrieval |
| Forced settlement | `assistant-opencode-adapter.ts:640-646` | KEEP | Abort on non-natural completion |
| OpenCode HTTP client | `opencode-http-client.ts` | KEEP | Proven HTTP boundary |

---

## 2. Target Runtime Boundary

### 2.1 Architecture

```
Vestara domain/orchestration
           │
           ▼
    ExecutionRequest
           │
           ▼
  RuntimeExecutionPort
           │
           ▼
  Runtime-specific adapter
           │
           ▼
 External runtime client
```

### 2.2 Return Direction

```
runtime-native behavior
           │
           ▼
  runtime-specific adapter
           │
           ▼
 canonical execution observations
           │
           ▼
     Vestara execution
```

### 2.3 Key Design Principle

The port belongs to Vestara. The adapter translates. The runtime executes.

No OpenCode-specific types appear in the port contract. The adapter translates everything internally.

---

## 3. Port Contract

### 3.1 RuntimeExecutionPort

```typescript
interface RuntimeExecutionPort {
  readonly runtimeId: string;
  isAvailable(): Promise<boolean>;
  execute(request: ExecutionRequest, binding: RuntimeBinding): Promise<RuntimeExecutionHandle>;
}
```

### 3.2 RuntimeExecutionHandle

```typescript
interface RuntimeExecutionHandle {
  readonly executionId: ExecutionId;
  readonly runtimeSessionId?: RuntimeSessionId;
  readonly binding: RuntimeBinding;
  readonly observations: AsyncIterable<ExecutionObservation>;
  cancel(): Promise<void>;
}
```

### 3.3 ExecutionObservation (discriminated union)

```typescript
type ExecutionObservation =
  | ExecutionActivityObservation      // What the execution is doing
  | ExecutionStatusObservation        // Lifecycle state changes
  | ExecutionPermissionObservation    // Permission requests (with native identity)
  | ExecutionArtifactObservation      // Produced artifacts
  | ExecutionEvidenceObservation      // Collected evidence
  | ExecutionResultObservation        // Terminal result
  | ExecutionErrorObservation;        // Non-terminal errors
```

---

## 4. Adapter Responsibilities

The OpenCode adapter (`@vestara/opencode-runtime/src/execution-adapter.ts`) implements `RuntimeExecutionPort` and translates:

| Direction | What Translates | Example |
|-----------|----------------|---------|
| Request → OpenCode | `ExecutionRequest` → `sendMessageAsync()` input | `objective` → `parts[0].text` |
| Request → OpenCode | `RoutingIntent` → `model: { providerId, modelId }` | Provider/model binding |
| Request → OpenCode | `PermissionContext` → `tools` map | Policy → tool availability |
| OpenCode → Observation | `session.next.text.delta` → `ExecutionActivityObservation` | Text delta |
| OpenCode → Observation | `session.next.tool.*` → `ExecutionActivityObservation` | Tool lifecycle |
| OpenCode → Observation | `permission.v2.asked` → `ExecutionPermissionObservation` | Permission request |
| OpenCode → Observation | `session.idle` → `ExecutionResultObservation` | Natural completion |
| OpenCode → Observation | `session.error` → `ExecutionResultObservation` | Runtime error |
| Vestara → OpenCode | `cancel()` → `client.abortSession()` | Cancellation |
| Vestara → OpenCode | Permission decision → `client.respondToPermission()` | Policy enforcement |

---

## 5. Session Relationship

### 5.1 Identity Hierarchy

```
Execution (ExecutionId)
    │
    ├── RuntimeBinding
    │     ├── runtimeId: 'opencode'
    │     └── runtimeSessionId: RuntimeSessionId
    │
    └── (RuntimeSessionId maps to OpenCode session)
```

### 5.2 Critical Invariant

`ExecutionId ≠ RuntimeSessionId`

- `ExecutionId`: Vestara-owned canonical identity for the execution
- `RuntimeSessionId`: Runtime-owned session identity (may be reused across executions)

One runtime session may serve multiple sequential executions. The contract must not prohibit this.

### 5.3 Session Creation Flow

1. `RuntimeExecutionPort.execute()` is called with an `ExecutionRequest`
2. The adapter resolves a `RuntimeBinding` (may reuse existing session)
3. The adapter creates or reuses an OpenCode session
4. The `RuntimeExecutionHandle` carries both `executionId` and `runtimeSessionId`

---

## 6. Provider/Model Relationship

### 6.1 Authority Chain

```
Browser request (provider/model selection)
    ↓
AssistantBindingResolver (validates against runtime catalog)
    ↓
RoutingIntent (canonical, on ExecutionRequest)
    ↓
Adapter translates to OpenCode format
    ↓
OpenCode routes to actual LLM provider
```

### 6.2 Key Principle

Provider/model selection is Vestara-owned policy (via `RoutingIntent`). The runtime executes with the selected provider/model but does not own the selection decision.

---

## 7. Permission Translation

### 7.1 Two-Phase Authority

```
Vestara policy decision (ALLOW/ASK/DENY)
        ↓
Execution authorization
        ↓
Runtime enforcement/interception
```

### 7.2 Native Identity Preservation (MANDATORY)

When the adapter normalizes permission actions, it MUST preserve both:

1. **Canonical permission action** (normalized by Vestara)
2. **Runtime-native operation identity** (preserved in metadata)

Example:
```typescript
// Input from OpenCode: { action: 'todowrite' }
// Adapter produces:
{
  kind: 'permission',
  canonicalAction: 'other',        // normalized
  nativeAction: 'todowrite',       // preserved
  runtime: 'opencode',             // runtime identifier
  resources: ['todowrite'],
  risk: 'safe',
}
```

### 7.3 Normalization Map

| Native Action | Canonical Action | Preserved In |
|--------------|-----------------|--------------|
| `read` | `read` | (same) |
| `edit` | `edit` | (same) |
| `bash` | `bash` | (same) |
| `task` | `other` | `nativeAction` |
| `todowrite` | `other` | `nativeAction` |
| `lsp` | `other` | `nativeAction` |
| `skill` | `other` | `nativeAction` |
| `question` | `other` | `nativeAction` |
| `doom_loop` | `other` | `nativeAction` |

---

## 8. Native Metadata Preservation

### 8.1 Required Invariant

The adapter MUST NOT irreversibly transform native action strings. The `ExecutionPermissionObservation` type carries:

- `canonicalAction`: The normalized Vestara action (for policy evaluation)
- `nativeAction`: The original runtime action (for downstream consumers)
- `runtime`: The runtime identifier (for disambiguation)

### 8.2 Current State

- `@vestara/permission-contracts` has zero consumers today
- The actual runtime path uses `OpenCodePermissionRequest` which preserves raw strings
- The adapter's `detail` object carries raw actions to the browser
- This invariant becomes a BLOCKER when Phase 2 migration occurs

---

## 9. Execution Observation Mechanism

### 9.1 Design

Observations are delivered via `AsyncIterable<ExecutionObservation>` on the `RuntimeExecutionHandle`. This is:

- **Runtime-neutral**: No SSE, WebSocket, or HTTP coupling
- **Internal**: Transport comes later
- **Pull-based**: Consumer iterates when ready

### 9.2 Observation Sequence

```
1. status: { kind: 'status', status: 'running' }           // execution started
2. activity: { kind: 'activity', activityType: 'text-delta' }  // text generation
3. activity: { kind: 'activity', activityType: 'tool-call' }   // tool execution
4. activity: { kind: 'activity', activityType: 'tool-result' } // tool completed
5. permission: { kind: 'permission', ... }                      // permission request
6. activity: { kind: 'activity', activityType: 'file-edit' }   // file modification
7. result: { kind: 'result', status: 'completed' }             // terminal result
```

### 9.3 Observation Ownership

| Concept | Owner | Observation |
|---------|-------|-------------|
| Lifecycle state | Vestara | `ExecutionStatusObservation` |
| Runtime activity | Adapter (observed from runtime) | `ExecutionActivityObservation` |
| Permission requests | Adapter (observed from runtime) | `ExecutionPermissionObservation` |
| Policy decisions | Vestara (via adapter) | Response to permission |
| Terminal result | Adapter (observed from runtime) | `ExecutionResultObservation` |

---

## 10. Activity Mappings

### 10.1 OpenCode → Canonical Activity

| OpenCode Event | Canonical ActivityType | State |
|---------------|----------------------|-------|
| `session.next.text.delta` | `text-delta` | `running` |
| `session.next.tool.called` | `tool-call` | `running` |
| `session.next.tool.success` | `tool-result` | `completed` |
| `session.next.tool.failed` | `tool-result` | `failed` |
| `session.next.shell.started` | `shell-command` | `running` |
| `session.next.shell.ended` | `shell-command` | `completed` |
| `permission.v2.asked` | `permission-request` | `running` |
| `question.v2.asked` | `question-asked` | `running` |
| `file.edited` | `file-edit` | `running` |

### 10.2 Unmappable Events

| OpenCode Event | Mapping | Limitation |
|---------------|---------|------------|
| `message.part.updated` | `tool-call`/`tool-result` | Requires state inference from payload |
| `session.status` (idle) | Result observation | Control signal, not activity |
| `todo.updated` | `status-update` | Generic mapping |

---

## 11. Artifact Mappings

### 11.1 OpenCode → Canonical Artifacts

| OpenCode Output | ArtifactKind | Reference |
|----------------|-------------|-----------|
| `getSessionDiff()` | `diff` | `path` (file path) |
| `getSessionTodos()` | `todo-snapshot` | N/A (in-memory) |
| File edits during turn | `file-change` | `file` (file path) |
| Shell output | `shell-output` | N/A (in-memory) |

### 11.2 Reference-Based Design

Artifacts use references (file paths, content hashes), not embedded payloads. The actual content lives in the filesystem or runtime.

---

## 12. Cancellation/Timeout Semantics

### 12.1 Ownership

| Concern | Owner | Mechanism |
|---------|-------|-----------|
| Cancel decision | Vestara | `handle.cancel()` |
| Cancel translation | Adapter | `client.abortSession()` |
| Cancel execution | Runtime | Runtime-specific interruption |
| Timeout decision | Vestara | `deadline = Date.now() + turnTimeoutMs` |
| Timeout enforcement | Adapter | Check deadline in event loop |

### 12.2 Race Conditions

| Scenario | Handling |
|----------|----------|
| Completion during cancellation | Adapter yields terminal result before cancel takes effect |
| Failure during cancellation | Adapter yields error result; cancel becomes no-op |
| Timeout while result arriving | Adapter yields timed_out result; ignores remaining events |

### 12.3 Current Implementation

- Turn timeout: 5 minutes default (`TURN_TIMEOUT_MS`)
- Permission timeout: 10 minutes (`PERMISSION_TIMEOUT_MS`)
- Forced settlement: `client.abortSession()` on non-natural completion

---

## 13. Compatibility Strategy

### 13.1 Existing Path Preservation

The existing GA execution path (`assistant-opencode-adapter.ts`) continues working. The new `OpenCodeAdapter` is an additional proof path, not a replacement.

### 13.2 Migration Strategy

| Phase | Action |
|-------|--------|
| CORE-004 | Add port contract + proof adapter (current) |
| CORE-005+ | Gradually migrate existing callers to use port |
| Future | Retire direct OpenCode client usage in API layer |

### 13.3 No Repository-Wide Migration

CORE-004 does NOT migrate existing callers. The proof adapter demonstrates the boundary works. Migration happens incrementally in later milestones.

---

## 14. Deferred Migrations

| Item | Reason | Blocker? |
|------|--------|----------|
| Migrate GA adapter to use RuntimeExecutionPort | Requires refactoring 742-line adapter | No (Phase 2) |
| Migrate Activity Room to use RuntimeExecutionPort | Requires AR execution path refactoring | No (Phase 2) |
| Merge session registries | Different lifecycle concepts | No (documented) |
| Unify SSE/WebSocket | Transport convergence is separate | No (CORE-005+) |

---

## 15. Verification Evidence

### 15.1 Build Verification

```
$ npx tsc --noEmit (packages/execution-types/)
✓ 0 errors

$ npx tsc --noEmit (packages/opencode-runtime/)
✓ 0 errors
```

### 15.2 Test Results

```
$ npx vitest run packages/execution-types/__tests__/
✓ 45 tests passed (28 CORE-003 + 17 CORE-004)
```

### 15.3 Lint Verification

```
$ npx biome check packages/execution-types/src/ packages/opencode-runtime/src/execution-adapter.ts
✓ 0 errors
```

### 15.4 Dependency Boundary Verification

```
$ node scripts/workspace-architecture.mjs --check
✓ Dependency boundaries valid across 107 workspace projects.
```

### 15.5 Key Invariants Verified

1. **runtime-neutral execution port exists** — `RuntimeExecutionPort` interface
2. **OpenCode proof adapter exists** — `OpenCodeAdapter` implements port
3. **canonical ExecutionRequest crosses the boundary** — Type-level proof
4. **runtime-specific types remain behind adapter** — No OpenCode types in port
5. **ExecutionId and RuntimeSessionId remain distinct** — Branded types
6. **runtime binding remains explicit** — `RuntimeBinding` snapshot
7. **native operation identity survives normalization** — `nativeAction` field
8. **representative activities map canonically** — 9 event types mapped
9. **artifacts remain reference-based** — No embedded payloads
10. **completion/failure mapping is deterministic** — Event → observation
11. **cancellation/timeout ownership is documented** — Vestara owns decision
12. **fake runtime can satisfy the same port in tests** — `FakeRuntimeAdapter` proves it
13. **existing production path remains functional** — No modifications to existing code
14. **focused verification passes** — 45 tests, 0 failures
15. **architecture evidence exists** — This document

---

## Completion Gate

```
[x] runtime-neutral execution port exists
[x] OpenCode proof adapter exists
[x] canonical ExecutionRequest crosses the boundary
[x] runtime-specific types remain behind adapter
[x] ExecutionId and RuntimeSessionId remain distinct
[x] runtime binding remains explicit
[x] native operation identity survives permission normalization
[x] representative activities map canonically
[x] artifacts remain reference-based
[x] completion/failure mapping is deterministic
[x] cancellation/timeout ownership is documented
[x] fake runtime can satisfy the same port in tests
[x] existing production path remains functional
[x] focused verification passes
[x] architecture evidence exists
```

---

**Recommendation:** `READY FOR AR-GA-CORE-005`

---
title: ARX-015 Architecture Review
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# ARX-015 Architecture Review

**Date:** 2026-08-27
**Status:** Revision 2 — Awaiting Acceptance
**Predecessor:** ARX-015-000 (Cross-Module Ownership Audit)
**Scope:** Architectural decisions only. No implementation. No code changes.

---

## 0. Repository Authority

### 0.1 Authoritative Repository

**`vestara-ai-core` is the authoritative Vestara platform.** All architectural decisions, package boundaries, authority contracts, and production ownership reside here. This review targets `vestara-ai-core` unless a milestone explicitly states otherwise.

### 0.2 Reference Implementation

**`vestara-platform` is a standalone/reference implementation** of Vestara platform capabilities. It is not an architectural authority over `vestara-ai-core`. It provides:

- Experimentation surface for new concepts before authoritative adoption
- Architectural evidence (contracts, invariants, concurrency findings, session-continuity findings, verification evidence)
- Reference implementations that may be reused — but must be reimplemented according to `vestara-ai-core` package boundaries

### 0.3 Dependency Boundary

**`vestara-ai-core` must not acquire runtime dependencies on `vestara-platform`.** The dependency direction is strictly one-way: `vestara-platform` may depend on `vestara-ai-core` (or not), but never the reverse.

### 0.4 Implementation Target

All ARX-015 milestones implement into `vestara-ai-core`. When a concept has been developed in `vestara-platform` (e.g., during ARX-014D), the review:

1. Acknowledges the reference implementation exists
2. Classifies the finding as **ABSENT IN AUTHORITATIVE CORE + REFERENCE IMPLEMENTATION EXISTS**
3. Requires review of the reference contracts, invariants, and evidence before implementing equivalents
4. Mandates reuse of accepted architectural semantics where appropriate
5. Prohibits blind copying and competing authorities

### 0.5 ARX-014D Reference Evidence

Concepts developed during ARX-014D in `vestara-platform` that are absent from `vestara-ai-core` are treated as architectural evidence, not automatically authoritative. Before implementing equivalents in `vestara-ai-core`, the Planner must:

- Review ARX-014D contracts, invariants, concurrency findings, session-continuity findings, and verification evidence
- Evaluate ARX-014D invariants as candidate core invariants (see §7.5)
- Reuse accepted semantics, but implement according to `vestara-ai-core` package boundaries and authority contracts
- Do not copy implementation blindly; do not create competing authorities inside `vestara-ai-core`

---

## 1. Canonical Execution Identity

### 1.1 Definitions

Every identity below has a single owner, a single creation site, and a single propagation rule. No identity may serve double duty.

| Identity | Semantics | Owner | Format | Created By | Persisted In |
|----------|-----------|-------|--------|------------|--------------|
| `requestId` | An HTTP or CLI invocation boundary. One request may trigger zero or more executions. | API layer (`apps/api`) | `req-{uuid}` | `http/request-context.ts` | `X-Request-Id` header, `HistoryRecord` |
| `traceId` | A distributed trace spanning multiple requests, executions, and subsystems. Survives process restarts. | OpenTelemetry (future) or canonical trace generator | `trc-{uuid}` | Trace initializer at top-level entry | Engineering event store (new column) |
| `executionId` | A single bounded unit of work: one task dispatch, one agent run, one verification pass. | Workflow Orchestrator / Agent Runtime | `exec-{timestamp}-{counter}` | `AgentStorage.createExecution()`, `WorkflowOrchestrator.runTask()` | `agent_executions` table, `orchestrated_task_leases`, evidence bundles |
| `correlationId` | Groups all events and artifacts produced by a single `executionId`. Never aliases projectId, sessionId, or threadId. | Execution owner (orchestrator or agent runtime) | `cor-{executionId}` | Derived from `executionId` at execution start | Engineering event store `correlation_id`, activity records, evidence bundles |
| `causationId` | Points to the event or decision that directly caused this event. Forms a causal chain. | Event emitter | Same format as the causing event's ID | Set to the ID of the immediately preceding event | Engineering event store `causation_id`, thread items |
| `workflowRunId` | A single execution attempt of a workflow project. Multiple runs possible per project (retry, re-open). | Workflow Orchestrator | `run-{projectId}-{counter}` | `WorkflowOrchestrator.startProject()` or `resume()` | New table `orchestrated_workflow_runs` |
| `activityId` | A single record in the Activity Room append-only store. | Activity Projection Service | `act-{sourceEventId}:{kind}` | Projectors in `@vestara/activity-projection` | `.vestara/activity.db` `activity_events.id` |
| `agentExecutionId` | Alias for `executionId` when the execution is agent-initiated. No separate ID. | — | Same as `executionId` | — | — |
| `projectId` | A workflow project (multi-task, multi-plan). | Workflow Orchestrator | `proj-{timestamp}-{counter}` | `WorkflowOrchestrator.createProject()` | `orchestrated_projects` |
| `repositoryBindingId` | A resolved, authoritative link between a project and its repository root. | Workspace Runtime | `repo-{fingerprint}` | `WorkspaceRuntime.resolve()` | `.vestara/workspace.json` |
| `runtimeSessionId` | A session in a coding runtime (OpenCode, Claude Code, etc.). May contain multiple AI invocations. | Runtime adapter | Native to runtime (e.g., `ses_xxx` for OpenCode) | Runtime adapter on session create | `OpenCodeSessionBinding` (currently in-memory; must be persisted) |
| `threadId` | A durable agent harness thread. One thread per agent execution. Contains ordered items (turns, tool calls). | Agent Harness | `thread-{timestamp}-{counter}` | `AgentHarnessRuntime` | Thread store (SQLite), `engineering_events.thread_id` |
| `messageId` | A human-to-agent or agent-to-human message in the Activity Room. | Activity Room API | `activity:msg:{uuid}` | `routes/activity-room.ts` | `activity_events` (via projection) |

### 1.2 Invariants

**INV-ID-1:** `correlationId` is always derived from `executionId`. It is never a projectId, sessionId, threadId, or generated counter.

**INV-ID-2:** `causationId` always points to the ID of the immediately preceding event in the causal chain. It defaults to `null` only for root events (the first event in a trace).

**INV-ID-3:** `executionId` is the single unit of work. There is exactly one `correlationId` per `executionId`. All events, artifacts, evidence, and Activity Room records produced by that work share the same `correlationId`.

**INV-ID-4:** `workflowRunId` is separate from `executionId`. A single workflow run may contain many executions (one per task). A single execution belongs to exactly one workflow run.

**INV-ID-5:** `runtimeSessionId` is separate from `executionId`. A single runtime session may contain many executions (multi-turn agent). A single execution may span multiple runtime sessions (session retry, failover).

**INV-ID-6:** No identity is reused across process restarts. Counter-based IDs include a timestamp component that prevents collision.

**INV-ID-7:** `requestId` is request-scoped and does not propagate into event systems. It lives only in HTTP headers and history records.

### 1.3 Rejected Alternatives

**Rejected: Using `correlationId` as a universal alias.** The audit found `correlationId` overloaded as projectId, sessionId, threadId, and counter. This made cross-system queries unreliable. The fix is to give each concept its own identity and use `correlationId` exclusively for execution grouping.

**Rejected: Eliminating `executionId` in favor of `threadId`.** A thread is an agent harness concept. Executions also occur outside the harness (orchestrator verification, manual runs). `executionId` is the universal unit.

**Rejected: Merging `workflowRunId` into `projectId`.** A project can have multiple runs (retry, re-open after verification failure). Run-level tracking is necessary for cost attribution and debugging.

---

## 2. Canonical Event Envelope

### 2.1 Current State

Three parallel envelope types exist:

| Type | Package | Fields |
|------|---------|--------|
| `EventEnvelope` | `@vestara/types` | eventId, timestamp, source, runtimeId, jobId, intentId, type, payload, correlationId, parentId, severity, metadata |
| `EventEnvelope<T>` | `@vestara/events` | id, timestamp, type, version, source, runtimeId, jobId, intentId, correlationId, causationId, payload, severity, metadata |
| `VestaraEvent` | `@vestara/shared` | id, type, version, timestamp, source, actor, payload, metadata(correlationId, causationId, retryCount, ttl) |

Plus the `EngineeringTruthEvent` in the event store with its own field set.

### 2.2 Decision: Shared Immutable Header, Domain-Specific Payloads

**Do not collapse all events into one giant type.** Instead:

1. **Define `EventHeader`** — a shared immutable metadata contract that every event must carry:

```typescript
interface EventHeader {
  readonly id: EventId;              // globally unique
  readonly type: string;             // namespace.domain.action (e.g. "orchestration.task.started")
  readonly timestamp: Timestamp;     // ISO-8601
  readonly source: string;           // originating module
  readonly correlationId: CorrelationId; // execution grouping
  readonly causationId: CausationId | null; // causal chain
  readonly traceId: TraceId | null;  // distributed trace (new)
  readonly severity: EventSeverity;
}
```

2. **Domain events carry `EventHeader` + domain-specific payload.** The orchestrator, harness, agent, and Activity Room each define their own payload types.

3. **The engineering event store is the durable audit trail.** All events, regardless of originating envelope type, are projected into the store via bridges. The store schema is the single source of truth for persisted event identity.

4. **In-process event bus uses the header + payload pattern.** The three existing envelope types converge on `EventHeader` but retain backward-compatible field sets during migration.

### 2.3 Migration Path

| Phase | Action |
|-------|--------|
| ARX-015-001 | Define `EventHeader` type in `@vestara/types`. Add `traceId` column to engineering event store. |
| ARX-015-007 | Update bridges to populate `EventHeader` fields consistently. Deprecate overloaded `correlationId` usage. |
| Post-ARX-015 | Existing envelope types adopt `EventHeader` as their base. Remove `VestaraEvent` in favor of `EventHeader` + domain payload. |

### 2.4 Invariants

**INV-EVT-1:** Every event has exactly one `EventHeader`. No event bypasses the header.

**INV-EVT-2:** `correlationId` in the header is always derived from `executionId` (INV-ID-1).

**INV-EVT-3:** `causationId` in the header forms a chain. The chain terminates at `null` (root event).

**INV-EVT-4:** The engineering event store is the durable audit trail. In-process events are ephemeral until projected into the store.

**INV-EVT-5:** Domain events may carry additional metadata beyond the header, but the header fields are never overridden by domain metadata.

### 2.5 Rejected Alternatives

**Rejected: Single monolithic event type.** Would create a giant union of all possible payloads, making the type system unwieldy and preventing domain-specific validation.

**Rejected: Keeping three separate envelope types indefinitely.** The field divergence causes integration bugs. Convergence on a shared header eliminates the class of bugs where `runtimeId` is present on one envelope but lost in another.

**Rejected: Replacing the engineering event store with an event-sourcing framework.** The store is working, well-tested, and has hash-chain integrity. Extending it with new columns is safer than replacing it.

---

## 3. Execution Lineage

### 3.1 The Lineage Chain

```
requestId (HTTP boundary)
  └→ traceId (distributed trace)
       └→ workflowRunId (one execution attempt of a project)
            └→ executionId (one bounded unit of work)
                 ├→ correlationId (groups all events for this execution)
                 ├→ agentId (which agent performed)
                 ├→ threadId (harness thread)
                 │    └→ turnId, toolCallId (sub-execution)
                 ├→ ResolvedAiBinding* (per-invocation scope: provider/model)
                 │    ├→ providerId
                 │    ├→ modelId
                 │    ├→ invocationScope (task, assignment, verification, manual)
                 │    └→ routingDecisionId
                 ├→ runtimeSessionId (which coding runtime session)
                 │    └→ nativeSessionId (e.g., OpenCode ses_xxx)
                 ├→ activityId* (Activity Room records, one per projected event)
                 ├→ evidenceBundleId* (verification evidence, one per run)
                 └→ messageId* (human/agent messages, zero or more)
```

Items marked `*` are derived. **Multiple `ResolvedAiBinding` records may exist per execution** (one per agent/role/invocation scope). All share the same `executionId` and `correlationId`.

### 3.2 Lineage Propagation Rules

| Rule | Description |
|------|-------------|
| **LINEAGE-1** | `requestId` is created at the HTTP/CLI boundary and does not propagate into event systems. |
| **LINEAGE-2** | `traceId` is created at the top-level entry point (workflow start, agent run, verification) and propagates through all subsequent events. |
| **LINEAGE-3** | `workflowRunId` is created when a project execution begins and propagates to all tasks within that run. |
| **LINEAGE-4** | `executionId` is created when a task dispatch begins and propagates to all events, artifacts, and evidence for that task. |
| **LINEAGE-5** | `correlationId` is derived from `executionId` and propagated identically. |
| **LINEAGE-6** | `causationId` is set to the ID of the immediately preceding event. Root events have `causationId = null`. |
| **LINEAGE-7** | `threadId` is created by the harness and propagates to all turns and items within that thread. |
| **LINEAGE-8** | `ResolvedAiBinding` is created at AI routing resolution time at invocation/assignment scope. Multiple bindings may exist per execution. Each is immutable after creation and carries lineage back to `executionId`, `workflowRunId`, and `taskId`. |
| **LINEAGE-9** | `runtimeSessionId` is created when a runtime session is acquired and propagated to all AI invocations within that session. |
| **LINEAGE-10** | `activityId` is created by projectors and does not propagate (it is a leaf identity). |

### 3.3 Persistence Requirement

The lineage chain must survive restart. Specifically:

- `traceId`, `executionId`, `correlationId`, `workflowRunId` must be persisted in the engineering event store.
- `ResolvedAiBinding` must be persisted (new table or column in orchestrator stores).
- `runtimeSessionId` binding must be persisted (currently in-memory; must move to durable store).
- `threadId` is already persisted in thread store and engineering event store.

### 3.4 Lineage Query

Given any identity in the chain, the system must be able to resolve the full lineage:

```
Given: executionId = "exec-123"
Query: SELECT * FROM engineering_events WHERE correlation_id = 'cor-exec-123' ORDER BY seq
Result: All events for this execution, with full causation chain

Given: runtimeSessionId = "ses_xxx"
Query: SELECT * FROM runtime_session_bindings WHERE open_code_session_id = 'ses_xxx'
Result: { executionId, agentId, workspaceId, ... }
Then: SELECT * FROM engineering_events WHERE correlation_id = 'cor-{executionId}'
Result: All events for the execution that used this session
```

---

## 4. AI Routing Authority

### 4.1 Current State

The routing system (`EngineeringRoutingRuntime`) is architecturally complete:
- 14 capabilities, 6 roles, 6 profiles
- Constraint-based candidate evaluation
- Decision evidence with reason codes
- Persisted assignments with optimistic concurrency

But it is entirely disconnected from execution. Agents hardcode their model in `agents.registry.ts`. The `resolveAgentExecution` callback in `AgentHarnessOptions` is never wired.

### 4.2 ResolvedAiBinding Contract

A `ResolvedAiBinding` captures the provider/model resolution for a **single bounded invocation or assignment scope**, not for an entire execution. This allows Planner, Developer, Reviewer, Verifier, and specialized agents to legitimately resolve different models within the same execution.

```typescript
interface ResolvedAiBinding {
  readonly bindingId: string;              // unique, deterministic
  readonly executionId: string;            // the execution this binding serves (lineage back-reference)
  readonly workflowRunId: string | null;   // workflow run lineage (if within a workflow)
  readonly taskId: string | null;          // task lineage (if within a task)
  readonly traceId: string | null;         // distributed trace

  readonly agentId: string;                // which agent requested
  readonly role: EngineeringAgentRole;     // planner, developer, reviewer, verifier, etc.
  readonly invocationScope: string;        // bounded scope: 'task', 'assignment', 'verification', 'manual'

  readonly providerId: string;             // resolved provider
  readonly modelId: string;                // resolved model
  readonly routingDecisionId: string;      // links to RoutingDecisionEvidence
  readonly routingProfile: string;         // which profile was active (balanced, best-quality, etc.)
  readonly requiredCapabilities: string[]; // what capabilities were requested
  readonly fallbackUsed: boolean;          // whether fallback was triggered
  readonly fallbackReason?: string;        // why fallback was needed
  readonly resolvedAt: string;             // ISO-8601 timestamp
  readonly immutable: true;                // never mutated after creation
}
```

### 4.3 Multi-Agent Resolution

Within a single execution, different agents may resolve different models:

```
Execution: exec-123 (workflow run: run-proj-1, task: task-42)
    │
    ├─ Planner resolves: mimo-v2.5-free (planning is lightweight)
    │     ResolvedAiBinding { agentId: vestara-planner, providerId: opencode, modelId: mimo-v2.5-free, invocationScope: 'task' }
    │
    ├─ Developer resolves: claude-sonnet-4 (coding requires strong reasoning)
    │     ResolvedAiBinding { agentId: vestara-developer, providerId: anthropic, modelId: claude-sonnet-4, invocationScope: 'task' }
    │
    ├─ Reviewer resolves: mimo-v2.5-free (review is lightweight)
    │     ResolvedAiBinding { agentId: vestara-reviewer, providerId: opencode, modelId: mimo-v2.5-free, invocationScope: 'assignment' }
    │
    └─ Verifier resolves: deepseek-v4 (verification requires thorough analysis)
          ResolvedAiBinding { agentId: vestara-verifier, providerId: deepseek, modelId: deepseek-v4, invocationScope: 'verification' }
```

Each binding is independent. All share the same `executionId` and `correlationId`. The `invocationScope` field identifies the bounded context within the execution.

### 4.4 Authority Flow

```
Agent Definition (modelRequirements)
    │
    ▼
Harness ResolveAgentExecution callback
    │
    ▼
EngineeringRoutingRuntime.resolve()
    │  Input: RoutingRequest { role, requiredCapabilities, policy, constraints }
    │  Output: RoutingResolution { candidate, evidence }
    │
    ▼
ResolvedAiBinding (immutable at invocation/assignment scope)
    │
    ├→ Persisted to new table `resolved_ai_bindings`
    │
    ├→ Attached to invocation context (HarnessEventIdentity, thread items)
    │
    ├→ Projected into engineering event store (via bridge)
    │
    └→ Available to Activity Room for display and analytics
```

### 4.5 When Routing Becomes Authoritative

| Phase | Authority |
|-------|-----------|
| Definition time | Agent declares `modelRequirements` (capabilities, constraints) |
| Resolution time | `EngineeringRoutingRuntime.resolve()` selects provider+model. **This is the point of authority.** One resolution per invocation scope. |
| Binding time | `ResolvedAiBinding` is created. **Immutable after this point.** Multiple bindings may exist per execution. |
| Execution time | Runtime provider uses the binding's provider+model. No re-routing within the scope. |
| Post-execution | All bindings are persisted. Activity Room, analytics, and debugging read from the persisted bindings. |

### 4.6 Invariants

**INV-AI-1:** Each `ResolvedAiBinding` is immutable after creation. It captures one resolution at one invocation scope.

**INV-AI-2:** Multiple bindings may exist per execution (one per agent/role/invocation scope). All share the same `executionId` and `correlationId`.

**INV-AI-3:** The runtime provider must use the provider+model specified in the binding for that invocation scope. No implicit model switching.

**INV-AI-4:** If the bound provider is unavailable, the invocation fails. Fallback requires a new binding (new invocation scope) with `fallbackUsed: true`.

**INV-AI-5:** The routing decision evidence (`routingDecisionId`) must be persisted alongside the binding. This enables post-hoc analysis of why a model was selected.

**INV-AI-6:** Agent definitions may include a `modelOverride` for explicit pinning. When present, routing is skipped and the binding is created directly with `fallbackUsed: false` and the pinned model.

### 4.7 Rejected Alternatives

**Rejected: One immutable binding per execution.** This prevents different agents from using different models within the same execution. Planner and Verifier have different capability requirements than Developer.

**Rejected: Advisory-only routing.** The current state where routing is disconnected from execution is exactly the problem. Routing must be authoritative at invocation scope.

**Rejected: Re-routing on provider failure within a single invocation scope.** This breaks the immutability invariant and makes post-hoc analysis unreliable. Failure should abort the invocation and start a new one with a new binding.

**Rejected: Storing routing state only in file-based JSON.** The `FileRoutingAssignmentStore` is useful for configuration but not for audit. `ResolvedAiBinding` must be in the SQLite store alongside the execution.

---

## 5. Runtime Identity

### 5.1 Definitions

| Identity | Semantics | Owner | Persistence |
|----------|-----------|-------|-------------|
| `runtimeId` | Identifies which coding runtime is in use (opencode, claude-code, etc.) | Runtime adapter registration | Must be added to engineering event store |
| `runtimeSessionId` | A session within a runtime. May contain multiple AI invocations. | Runtime adapter on session create | Must be persisted (currently in-memory) |
| `nativeSessionId` | The runtime's own session identifier (e.g., OpenCode `ses_xxx`) | Native runtime | Known only to the runtime adapter |

### 5.2 Current State

- `runtimeId` exists on `EventEnvelope` (`@vestara/types`) but is NOT persisted in the engineering event store (no `runtime_id` column).
- `runtimeSessionId` is tracked in `InMemorySessionRegistry` (lost on restart).
- `nativeSessionId` (OpenCode `ses_xxx`) is the key in the in-memory registry.

### 5.3 Required Changes

1. **Add `runtime_id` column** to `engineering_events` table (new migration).
2. **Persist `OpenCodeSessionBinding`** in SQLite (new table `runtime_session_bindings`).
3. **Distinguish managed vs. unmanaged sessions.** The registry must classify sessions Vestara created vs. sessions that appear in OpenCode but have no Vestara binding.

### 5.4 Session Ownership Model

```
OpenCode Server
    ├── ses_abc (Vestara-created, bound to execution exec-123)
    ├── ses_def (Vestara-created, bound to execution exec-456)
    └── ses_999 (unmanaged, not created by Vestara)

Vestara RuntimeSessionRegistry
    ├── ses_abc → { executionId: exec-123, agentId: vestara-developer, workspaceId: ws-1, status: active }
    ├── ses_def → { executionId: exec-456, agentId: vestara-reviewer, workspaceId: ws-1, status: completed }
    └── (ses_999 not present → classified as UNMANAGED)
```

**INV-RUN-1:** Vestara must never automatically adopt an unmanaged session.

**INV-RUN-2:** Every managed session must have a binding to an `executionId`.

**INV-RUN-3:** Session bindings must survive restart. On restart, bindings are reconciled against the runtime's actual session list.

### 5.5 OpenCode Session Lifecycle

| Phase | Action | Vestara Side | OpenCode Side |
|-------|--------|--------------|---------------|
| Create | Agent execution begins | `SessionRegistry.bind()` | `POST /session` → `ses_xxx` |
| Use | AI invocation | `requireSessionOwnership()` check | `POST /session/{id}/message` |
| Reuse | Next turn in same execution | `SessionRegistry.get()` → reuse | Existing session |
| Complete | Execution finishes | `SessionRegistry.updateStatus('completed')` | Session remains (for inspection) |
| Restart | API restarts | Reconcile bindings against runtime | Sessions persist in OpenCode |

---

## 6. Execution Policy

### 6.1 Contract

Execution policy operates as a layered enforcement model:

```
execution default (hermetic | governed | live)
    │
    ▼
task/capability constraints (task-level overrides)
    │
    ▼
effective operation policy (what the runtime actually enforces)
    │
    ▼
runtime enforcement (deny | sandbox | audit | allow)
```

Each layer may impose stricter constraints than the layer above, never looser.

```typescript
type ExecutionPolicyMode = 'hermetic' | 'governed' | 'live';

interface ExecutionPolicy {
  readonly mode: ExecutionPolicyMode;       // execution-level default
  readonly effectiveAt: string;
  readonly source: string;                  // who selected this policy
}

// Capability gates per mode
interface ExecutionPolicyGates {
  readonly externalAi: 'deny' | 'policy' | 'allow';
  readonly openCode: 'deny' | 'policy' | 'allow';
  readonly network: 'deny' | 'policy' | 'allow';
  readonly filesystemWrite: 'sandbox' | 'policy' | 'allow';
  readonly browserExternal: 'deny' | 'policy' | 'allow';
  readonly cloud: 'deny' | 'policy' | 'allow';
  readonly telegram: 'deny' | 'policy' | 'allow';
}

// Task-level constraints (may be stricter than execution default)
interface TaskCapabilityConstraint {
  readonly taskId: string;
  readonly capability: string;              // e.g., 'externalAi', 'network'
  readonly constraint: 'deny' | 'sandbox' | 'audit' | 'allow';
  readonly reason: string;                  // why this constraint exists
}

// Effective operation policy (resolved at runtime)
interface EffectiveOperationPolicy {
  readonly operation: string;               // e.g., 'openCode.session.create'
  readonly effectiveConstraint: 'deny' | 'sandbox' | 'audit' | 'allow';
  readonly derivedFrom: 'execution-default' | 'task-constraint' | 'approval';
}
```

### 6.2 Mode Semantics

| Mode | Meaning | Use Case |
|------|---------|----------|
| `hermetic` | No external side effects. All operations are sandboxed or denied. | `pnpm verify`, CI verification, evidence collection |
| `governed` | External side effects allowed subject to policy rules. Audit trail required. | Normal development execution |
| `live` | Full external access. User-initiated, real-world actions. | Manual operations, Telegram commands, live browser |

### 6.3 Layered Enforcement

| Layer | Authority | Scope | Example |
|-------|-----------|-------|---------|
| **Execution default** | Workflow Orchestrator | Entire execution | `governed` for normal dev, `hermetic` for verification |
| **Task/capability constraint** | Task definition / approval system | Single task or capability | Task 42 requires `externalAi: deny` because it's a verification task |
| **Effective operation policy** | Runtime adapter (resolved at operation time) | Single operation | `openCode.session.create` → `audit` (stricter than execution default `allow`) |
| **Runtime enforcement** | Runtime adapter (executes) | Single operation | Check effective policy → deny/sandbox/audit/allow |

**Rule:** Each layer may impose stricter constraints than the layer above. No layer may loosen a constraint imposed by a higher layer.

### 6.4 Ownership

| Layer | Responsibility |
|-------|---------------|
| **Workflow Orchestrator** | Selects the execution-level policy mode based on project configuration and phase |
| **Task Definition** | Declares task-level capability constraints (may be stricter than execution default) |
| **Approval System** | May grant exceptions (effectively loosening a constraint), recorded as approval events |
| **Agent Runtime** | Reads the effective policy from execution context; enforces capability gates |
| **Runtime Adapter** | Resolves effective operation policy at operation time; checks before each external operation; denies if not permitted |
| **Activity Room** | Displays the active policy; does NOT select or enforce it |

### 6.5 Current Mapping

| Current Mechanism | Maps To |
|-------------------|---------|
| `VITEST=true` environment variable | Implicit `hermetic` execution default |
| `VESTARA_ALLOW_LIVE` | Implicit `governed` or `live` execution default |
| Browser tool `informationGovernance` | Task-level capability constraint for browser |
| `TokenBudgetPolicy` | Task-level capability constraint for cost |

### 6.6 Invariants

**INV-POL-1:** Execution-level policy selection happens once per execution. It is not changed mid-execution.

**INV-POL-2:** Task-level constraints may be stricter than the execution default, never looser.

**INV-POL-3:** Every external operation must resolve the effective operation policy (execution default → task constraints → approval) and check before executing.

**INV-POL-4:** Policy violations are recorded as events (not just denied silently).

**INV-POL-5:** Approval-based exceptions are recorded as approval events with full lineage back to the execution and task.

### 6.7 Rejected Alternatives

**Rejected: Per-operation policy evaluation from scratch.** Too expensive, too complex. The layered model resolves the effective policy at operation time, but the resolution is bounded by the execution default and task constraints.

**Rejected: User-selected policy for every operation.** The orchestrator should select policy based on context. User override is possible via approval but not required for every operation.

**Rejected: Single flat policy with no layers.** Task-level constraints are necessary for verification (hermetic), budget-limited tasks, and security-sensitive operations. A flat policy cannot express these requirements.

---

## 7. Workflow Authority

### 7.1 Reconciliation of Audit Findings

The ARX-015-000 audit reported `WorkflowRun`, `DevelopmentPlan`, and `GovernedActivityRunner` as absent. The findings are valid for `vestara-ai-core`. However, equivalent concepts have been developed and tested during ARX-014D in `vestara-platform`. Classification:

| Concept | Status in `vestara-ai-core` | ARX-014D Reference | Reconciliation |
|---------|-----------------------------|---------------------|----------------|
| `DevelopmentPlan` | **ABSENT IN AUTHORITATIVE CORE + REFERENCE IMPLEMENTATION EXISTS** | Contracts, invariants, and execution evidence exist in `vestara-platform` | Review ARX-014D contracts before implementing. Evaluate as candidate core invariant (§7.5). |
| `WorkflowRun` | **ABSENT IN AUTHORITATIVE CORE + REFERENCE IMPLEMENTATION EXISTS** | Run-level tracking, cost attribution, and debugging evidence exist in `vestara-platform` | Review ARX-014D contracts before implementing. Evaluate as candidate core invariant (§7.5). |
| `GovernedActivityRunner` | **ABSENT IN AUTHORITATIVE CORE + REFERENCE IMPLEMENTATION EXISTS** | Governed execution runner with policy enforcement exists in `vestara-platform` | Review ARX-014D contracts. Evaluate whether governance belongs in orchestrator `runTask()` or as separate concern. |
| `WorkflowRuntime` | **FOUND** — legacy runtime in `packages/runtime/src/runtimes/workflow-runtime.ts` | Independent of `workflow-orchestrator`. Two separate workflow systems exist. | See §7.4 — ownership mapping required before any deprecation decision. |

### 7.2 Workflow Architecture (Current)

```
packages/runtime/src/runtimes/workflow-runtime.ts  (Legacy)
    └── Simple step-based workflow (feature/bugfix/review pipelines)
    └── Independent of orchestrator
    └── Ownership and coverage must be mapped before deprecation

packages/workflow-orchestrator/  (Current)
    └── Multi-agent orchestration (project → plan → tasks → verification)
    └── Event-sourced with SQLite persistence
    └── Distributed worker support

packages/workflow-projections/  (UI)
    └── Derives stages from thread replay + engineering events
    └── Independent of orchestrator stores
```

### 7.3 WorkflowRuntime Ownership Mapping (Required Before Deprecation)

The legacy `WorkflowRuntime` must not be marked deprecated without completing this analysis:

| Step | Action | Gate |
|------|--------|------|
| 1 | **Map existing ownership.** What responsibilities does `WorkflowRuntime` currently own? What subsystems depend on it? | Must complete before any deprecation proposal |
| 2 | **Identify missing responsibilities.** What does `WorkflowRuntime` NOT handle that the orchestrator does? (e.g., multi-agent, verification, event sourcing) | Must complete before any deprecation proposal |
| 3 | **Establish migration coverage.** For each `WorkflowRuntime` responsibility, does the orchestrator (or another subsystem) provide an equivalent? | Must complete before any deprecation proposal |
| 4 | **Verify parity.** For each covered responsibility, does the replacement match or exceed the legacy behavior? | Must complete before any deprecation proposal |
| 5 | **Propose deprecation separately.** Only after steps 1–4 are complete and accepted, propose a deprecation timeline in a dedicated decision. | Separate from ARX-015 |

**INV-WF-DEP:** Do not deprecate an existing runtime merely because ARX-015 proposes another orchestration boundary. Deprecation requires demonstrated parity and accepted migration plan.

### 7.4 Required Decisions

1. **`WorkflowRun` must be introduced** as a first-class type in `workflow-orchestrator`, informed by ARX-014D evidence. It represents one execution attempt of a project. The orchestrator already tracks phase transitions; adding run-level tracking is a natural extension. Review ARX-014D concurrency findings and session-continuity findings before finalizing the contract.

2. **`DevelopmentPlan` must be reconciled** with `WorkflowPlan` based on ARX-014D evidence. The semantic match should be evaluated against ARX-014D contracts. If the semantics align, `WorkflowPlan` may be renamed or extended. If they diverge, a separate type may be warranted. This decision depends on ARX-014D review.

3. **`GovernedActivityRunner` placement** must be evaluated. The governance logic may belong in the orchestrator's `runTask()` method (with policy enforcement delegated to the execution policy system, §6), or it may be a separate concern. Review ARX-014D's governed execution evidence before deciding.

4. **`WorkflowRuntime` ownership mapping** must be completed (§7.3) before any deprecation decision. This is a prerequisite, not part of ARX-015.

### 7.5 Candidate Core Invariants (from ARX-014D)

These invariants were accepted during ARX-014D in `vestara-platform`. They are **reference evidence**, not automatically authoritative in `vestara-ai-core`. The Planner must evaluate each before adoption:

| # | Candidate Invariant | Description | Evaluation Required |
|---|---------------------|-------------|---------------------|
| CI-1 | **DevelopmentPlan = immutable WHAT** | The plan defines what to build; it does not change during execution. | Does `vestara-ai-core`'s `WorkflowPlan` already satisfy this? If so, adopt the invariant. |
| CI-2 | **WorkflowRun = mutable execution state** | A run tracks the mutable state of an execution attempt (phase, progress, cost). | Must align with §7.4 decision on `WorkflowRun`. |
| CI-3 | **Developer Runtime/CAR/OpenCode = HOW** | The runtime determines how work is executed; it does not determine what is built. | Already satisfied by current separation. Adopt if confirmed. |
| CI-4 | **Stable task IDs** | Task identifiers must not change across retries, re-runs, or phase transitions. | Must be verified against `orchestrated_tasks` schema. Adopt if confirmed. |
| CI-5 | **DAG validation before execution** | The task graph must be validated for cycles and consistency before any execution begins. | `task-graph.ts` exists but is unused. Wire it in. Adopt after wiring. |
| CI-6 | **Sequential bounded execution by default** | Tasks execute sequentially with concurrency bounds unless explicitly parallelized. | Must align with orchestrator's execution model. Adopt if confirmed. |
| CI-7 | **Concurrent duplicate starts → single logical WorkflowRun** | If two requests try to start the same project, only one run is created. | Must be implemented in orchestrator. Adopt as requirement. |
| CI-8 | **Runtime-session acquisition → single-flight** | A runtime session is acquired exactly once per execution. No double-acquire. | Must be verified against session registry. Adopt if confirmed. |
| CI-9 | **Repository binding → authoritative execution directory** | The resolved repository binding determines the execution directory. No implicit `process.cwd()`. | Aligns with ARX-015-004. Adopt. |
| CI-10 | **Workflow continuity → reuse the appropriate root runtime session** | When resuming work, reuse the existing runtime session rather than creating a new one. | Must be verified against session lifecycle. Adopt if confirmed. |
| CI-11 | **Verification → hermetic unless explicitly live** | Verification runs must be hermetic by default. Live verification requires explicit opt-in. | Aligns with §6 execution policy. Adopt. |

**Process:** Each candidate invariant must be evaluated against `vestara-ai-core`'s current architecture, accepted or rejected with rationale, and only then added to the authoritative invariant set.

### 7.6 Invariants

**INV-WF-1:** The workflow orchestrator is the single authority for project/plan/task lifecycle. The legacy `WorkflowRuntime` is not — until ownership mapping (§7.3) demonstrates otherwise.

**INV-WF-2:** Workflow projections (UI) are derived from orchestrator state, not from independent thread replay. A bridge adapter must connect them.

**INV-WF-3:** ARX-014D invariants are reference evidence. They become authoritative only after evaluation and acceptance by the vestara-ai-core architecture review.

---

## 8. Persistence Boundaries

### 8.1 What Must Survive Restart

| Data | Current State | Required State |
|------|---------------|----------------|
| Activity records | ✅ Durable (`.vestara/activity.db`) | No change |
| Engineering events | ✅ Durable (`.vestara/events.db`) | Add `runtime_id`, `trace_id` columns |
| Orchestrator state | ✅ Durable (9 SQLite tables) | Add `workflow_runs` table |
| Agent definitions | ✅ Durable (`plans.db`) | No change |
| Agent executions | ✅ Durable (`agent_executions`) | No change |
| Thread state | ✅ Durable (thread store) | No change |
| Evidence bundles | ✅ Durable (filesystem JSON) | No change |
| **Message receipts** | ❌ Volatile (in-memory Map) | **Must be persisted** |
| **Runtime session bindings** | ❌ Volatile (in-memory Map) | **Must be persisted** |
| **Resolved AI bindings** | ❌ Do not exist | **Must be created and persisted** |
| Visual config | ✅ Durable (`.vestara/visual-config.json`) | No change |
| Routing assignments | ✅ Durable (`.vestara/routing/assignments.json`) | No change |
| Provider credentials | ✅ Durable (`provider-credentials.json`) | Consider encryption |

### 8.2 Authoritative Store for Execution Lineage

The **engineering event store** (`.vestara/events.db`) is the authoritative store for execution lineage. It already has `correlation_id`, `causation_id`, `task_id`, `thread_id`, `turn_id`. Adding `runtime_id`, `trace_id`, and `workflow_run_id` completes the lineage.

The **orchestrator stores** are authoritative for workflow state (projects, plans, tasks, artifacts, locks).

The **resolved AI bindings store** (new) is authoritative for provider/model resolution.

### 8.3 Invariant

**INV-PERSIST-1:** Any identity that participates in the lineage chain (Section 3) must be persisted in the engineering event store or a store that can be joined to it.

**INV-PERSIST-2:** Message receipts and runtime session bindings must be persisted. Volatile state that affects user-visible behavior (unread counts, session ownership) cannot be lost on restart.

**INV-PERSIST-3:** The engineering event store is append-only. New columns are added via migrations, never by altering existing rows.

---

## 9. Activity Room Boundary

### 9.1 Definition

**Activity Room is a projection and interaction surface over authoritative execution state.** It is not an execution authority, not an event authority, and not a state authority.

### 9.2 What Activity Room Owns

| Asset | Ownership |
|-------|-----------|
| Activity records (append-only store) | ✅ Activity Room owns |
| Effective state projection | ✅ Activity Room owns (derived from records) |
| Severity derivation | ✅ Activity Room owns (derived from records) |
| WebSocket streaming | ✅ Activity Room owns |
| Message receipts | ✅ Activity Room owns (must persist) |
| Human-to-agent messaging | ✅ Activity Room owns (via commands) |
| Visual config | ✅ Activity Room owns |

### 9.3 What Activity Room Does NOT Own

| Concept | Authority |
|---------|-----------|
| Workflow lifecycle | Workflow Orchestrator |
| Task assignment | Workflow Orchestrator |
| Agent execution | Agent Runtime + Harness |
| AI model routing | Engineering Routing Runtime |
| Runtime session management | Runtime Adapter + Session Registry |
| Verification verdict | Verification Engine + Evidence Pipeline |
| Provider/model selection | ResolvedAiBinding |

### 9.4 Activity Room as Projection

```
Authoritative Sources:
    Workflow Orchestrator → workflow lifecycle events
    Agent Runtime → agent execution events
    Engineering Routing → AI binding events
    Runtime Adapter → session events
    Verification Engine → verification events
    Evidence Pipeline → evidence events
    Human messages → command events
         │
         ▼
    EventBus (in-process)
         │
         ▼
    Organizational Bridge (normalize to ActivitySourceEvent)
         │
         ▼
    Activity Projection Service (project → redact → persist → broadcast)
         │
         ▼
    Activity Room (records, streaming, effective state, UI)
```

### 9.5 Command/Event Separation

| Activity Room Commands (mutable requests) | Activity Room Events (immutable facts) |
|-------------------------------------------|----------------------------------------|
| `SendMessage` | `MessageSent` |
| `StartExecution` | `ExecutionStarted` |
| `PauseExecution` | `ExecutionPaused` |
| `ResumeExecution` | `ExecutionResumed` |
| `CancelExecution` | `ExecutionCancelled` |
| `RetryTask` | `TaskRetried` |
| `ApproveAction` | `ActionApproved` |
| `RejectAction` | `ActionRejected` |
| `RequestReview` | `ReviewRequested` |
| `RequestVerification` | `VerificationRequested` |

Commands are intercepted by the API layer and translated into the appropriate authoritative action (orchestrator method call, agent runtime call, etc.). Events are the results projected into the Activity Room.

### 9.6 Invariant

**INV-AR-1:** Activity Room never directly mutates workflow, agent, or runtime state. All mutations go through authoritative subsystems.

**INV-AR-2:** Activity Room records are append-only. Corrections append new records; they never mutate existing ones.

**INV-AR-3:** The effective state projection is always recomputed from the append-only history. It is never stored independently.

---

## 10. OpenCode Implications

### 10.1 OpenCode Resource Mapping

| OpenCode Resource | Vestara Concept | Current State | Required State |
|-------------------|-----------------|---------------|----------------|
| Server | Runtime (`runtimeId = 'opencode'`) | ✅ Managed | No change |
| Project | RepositoryBinding (`repositoryBindingId`) | ⚠️ Implicit via `workspace.json` | Make explicit |
| Directory | Part of RepositoryBinding | ⚠️ Often conflated with project root | Separate from project root |
| Session | RuntimeSession (`runtimeSessionId`, `nativeSessionId`) | ⚠️ In-memory only | Persist |
| Agent | AgentDefinition (`agentId`) | ✅ Synced via `POST /api/agents/sync` | No change |
| Provider | Provider registration (`providerId`) | ✅ Runtime discovered | No change |
| Model | Model catalog (`modelId`) | ✅ Runtime discovered | No change |
| Messages | AI invocations within session | ✅ Sync/async via API | Add `ResolvedAiBinding` |
| Commands | CLI commands | ✅ Supported | No change |
| Permissions | Permission registry | ⚠️ In-memory only | Persist |
| MCP | MCP server config | ✅ Configured in `opencode.json` | No change |
| Files | Filesystem operations | ✅ Via tools | No change |
| SSE Events | Event stream | ✅ Subscribed via bridge | Add `EventHeader` |

### 10.2 How Canonical Contracts Support Integration

| Contract | OpenCode Integration Benefit |
|----------|------------------------------|
| `ResolvedAiBinding` | Every AI invocation through OpenCode records which provider/model was used. Post-hoc analytics possible. |
| `RuntimeSessionBinding` (persisted) | Survives restart. On restart, Vestara can reconcile its bindings against OpenCode's actual session list. |
| `ExecutionPolicy` | Hermetic mode can block OpenCode sessions during verification. Governed mode can audit all OpenCode interactions. |
| `EventHeader` with `traceId` | Every OpenCode interaction is traceable through the full execution lineage. |
| `correlationId` (execution-scoped) | Events from OpenCode can be correlated back to the specific execution that triggered them. |
| Unmanaged session detection | OpenCode sessions not created by Vestara are classified and displayed but never adopted. |

### 10.3 Subagent/Child Sessions

OpenCode can spawn subagent sessions. These must be tracked as child sessions of the parent:

```
Parent Session: ses_abc (vestara-developer, execution exec-123)
    ├── Child Session: ses_def (subagent: reviewer, execution exec-123)
    └── Child Session: ses_ghi (subagent: verifier, execution exec-123)
```

Each child session has its own `runtimeSessionId` and `nativeSessionId`, but shares the parent's `executionId` and `correlationId`.

### 10.4 Invariant

**INV-OC-1:** Every OpenCode interaction must have a `RuntimeSessionBinding` before execution. Untracked interactions are denied.

**INV-OC-2:** OpenCode session creation must be recorded in the persisted session registry. The registry is the source of truth for session ownership.

**INV-OC-3:** On restart, the session registry is reconciled against OpenCode's actual session list. Stale bindings are marked `abandoned`. Active bindings are re-verified.

---

## 11. Finding-by-Finding Resolution

For every ARX-015-000 finding. **Authoritative Repository** indicates where the contract lives. **Reference Implementation** indicates prior work in `vestara-platform` that provides architectural evidence.

| # | Finding | Authoritative Repository/Package | Reference Implementation/Evidence | Contract Decision | Migration Impact | Implementation Dependency |
|---|---------|----------------------------------|-----------------------------------|-------------------|------------------|---------------------------|
| F1 | Three parallel event envelope types | `@vestara/types` (`vestara-ai-core`) | None | Shared `EventHeader` contract, domain payloads | ARX-015-001 (header), ARX-015-007 (bridge update) | 001 |
| F2 | `correlationId` overloaded | Execution owner in `vestara-ai-core` (orchestrator/agent runtime) | None | Always derived from `executionId` | ARX-015-001 | 001 |
| F3 | `runtimeId` lost in engineering store | Engineering event store (`vestara-ai-core`) | None | Add `runtime_id` column | ARX-015-001 | 001 |
| F4 | `requestId` not in event systems | API layer (`vestara-ai-core/apps/api`) | None | Request-scoped, do not propagate | None | None |
| F5 | `traceId` limited to policy audit | `@vestara/policy-types` → Engineering event store (`vestara-ai-core`) | ARX-014D trace evidence in `vestara-platform` | Add `trace_id` column, add to `EventHeader` | ARX-015-001 | 001 |
| F6 | `providerId`/`modelId` not event-sourced | `ResolvedAiBinding` in `vestara-ai-core` | ARX-014D routing evidence in `vestara-platform` | Persist binding at invocation scope alongside execution | ARX-015-002 | 001 |
| F7 | No `WorkflowRun` type | Workflow Orchestrator (`vestara-ai-core/packages/workflow-orchestrator`) | **ABSENT IN CORE + REFERENCE EXISTS:** ARX-014D run-level tracking in `vestara-platform` | Introduce as first-class type, informed by ARX-014D evidence | ARX-015-001 | 001 |
| F8 | No `DevelopmentPlan` type | Workflow Orchestrator (`vestara-ai-core/packages/workflow-orchestrator`) | **ABSENT IN CORE + REFERENCE EXISTS:** ARX-014D `DevelopmentPlan` contracts in `vestara-platform` | Reconcile with `WorkflowPlan` based on ARX-014D review | ARX-014D review | ARX-014D review |
| F9 | Two disconnected workflow projection systems | `workflow-orchestrator` + `workflow-projections` (`vestara-ai-core`) | None | Bridge adapter from orchestrator → UI projection | ARX-015-009 | 001, 007 |
| F10 | Message receipts volatile | `apps/api` (`vestara-ai-core`) | None | Move to SQLite store | ARX-015-008 | 007 |
| F11 | Runtime session bindings volatile | `opencode-runtime` (`vestara-ai-core/packages/opencode-runtime`) | None | Move to SQLite store | ARX-015-005 | 001 |
| F12 | No `ResolvedAiBinding` | Engineering Routing Runtime (`vestara-ai-core/packages/provider-runtime`) | ARX-014D routing resolution evidence in `vestara-platform` | New type + new table at invocation scope | ARX-015-002 | 001 |
| F13 | No `ExecutionPolicy` type | Workflow Orchestrator (`vestara-ai-core/packages/workflow-orchestrator`) | ARX-014D policy evidence in `vestara-platform` | Layered enforcement model: execution default → task constraints → effective policy | ARX-015-003 | 001 |
| F14 | No `GovernedActivityRunner` | Workflow Orchestrator (`vestara-ai-core/packages/workflow-orchestrator`) | **ABSENT IN CORE + REFERENCE EXISTS:** ARX-014D governed runner in `vestara-platform` | Evaluate placement: orchestrator `runTask()` vs. separate concern, based on ARX-014D evidence | ARX-015-003 | 003 |
| F15 | No command/event separation in Activity Room | Activity Room API (`vestara-ai-core/apps/api`) | None | Factor commands into separate handlers | ARX-015-007 | 007 |
| F16 | No attention engine | Activity Room projection (`vestara-ai-core`) | None | New projection layer over effective state | ARX-015-009 | 007, 008 |
| F17 | `process.cwd()` as implicit context (51 instances) | CLI, tools, API (`vestara-ai-core`) | None | Replace with explicit `RepositoryBinding` resolution | ARX-015-004 | 001 |
| F18 | No unmanaged session detection | Runtime Session Registry (`vestara-ai-core/packages/opencode-runtime`) | None | Classify sessions as managed/unmanaged | ARX-015-005 | 005 |
| F19 | No Telegram integration | New package + bridge (`vestara-ai-core`) | None | Architecture ready, implement when needed | ARX-015-015 | 007, 010 |
| F20 | No Live Visual Browser | Browser tools + Activity Room (`vestara-ai-core`) | None | Extend browser tools with persistence + streaming | ARX-015-016 | 005, 010 |
| F21 | `AIProvidersSettings.tsx` hardcoded | `apps/workspace` (`vestara-ai-core`) | None | Replace with `GET /api/providers` | ARX-015-011 | 010 |
| F22 | Credential storage unencrypted | `provider-credentials.json` (`vestara-ai-core`) | None | Add encryption at rest | ARX-015-018 | 018 |
| F23 | No cycle detection in task DAG | `task-graph.ts` in `vestara-ai-core` (exported, unused) | None | Wire into `generatePlan` | ARX-015-001 | 001 |
| F24 | Plan transitions not validated | `state-machines.ts` in `vestara-ai-core` (defined, unused) | None | Wire `canTransitionPlan` into orchestrator | ARX-015-001 | 001 |
| F25 | No transaction support in stores | `stores/*` in `vestara-ai-core` | None | Add transaction wrapper (Phase 3 concern) | ARX-015-017 | 017 |
| F26 | `VerificationEvidenceBundle` not projected to Activity Room | `evidence` + `activity-projection` in `vestara-ai-core` | None | New projector for evidence bundles | ARX-015-009 | 007, 008 |

---

## 12. Unresolved Decisions

| # | Decision | Options | Recommendation | Blocker? |
|---|----------|---------|----------------|----------|
| U1 | `DevelopmentPlan` naming and semantics | (a) Alias `WorkflowPlan` (b) Separate type based on ARX-014D evidence | Review ARX-014D contracts before deciding. Evaluate against CI-1 candidate invariant. | Yes, for ARX-015-001 |
| U2 | `WorkflowRuntime` deprecation | (a) Deprecate after ownership mapping + parity verification (b) Keep indefinitely | Complete §7.3 ownership mapping first. Deprecation is a separate decision, not part of ARX-015. | No |
| U3 | `traceId` implementation source | (a) OpenTelemetry (b) Custom trace generator | Custom generator (simpler, no new dependency) | No |
| U4 | Evidence bundle → Activity Room projection granularity | (a) Summary only (b) Full bundle reference (c) Both | Summary + reference (balance detail vs. noise) | No |
| U5 | `ExecutionPolicy` default mode | (a) `governed` (b) `hermetic` for tests, `governed` for dev | `governed` as default, `hermetic` for verification. Align with CI-11 candidate invariant. | No |
| U6 | Session registry persistence format | (a) SQLite table (b) JSON file | SQLite (consistent with other stores) | No |
| U7 | Whether to unify `TokenBudgetPolicy` and `ObservationPolicy.maxEstimatedCost` | (a) Unify now (b) Keep separate, unify later | Unify later (different lifecycle concerns) | No |
| U8 | `GovernedActivityRunner` placement | (a) Orchestrator `runTask()` (b) Separate concern | Review ARX-014D governed runner evidence before deciding | Yes, for ARX-015-003 |
| U9 | ARX-014D invariant adoption scope | (a) Adopt all 11 candidates (b) Adopt subset (c) Reject all | Evaluate each against `vestara-ai-core` architecture. Adopt incrementally. | No (but affects design quality) |

---

## 13. Implementation Dependency Graph

```
ARX-015-000 (Audit) ─── ACCEPTED ───→ ARX-015-001 (Correlation Contract)
                                              │
                    ┌─────────────────────────┼─────────────────────────┐
                    │                         │                         │
                    ▼                         ▼                         ▼
            ARX-015-002                ARX-015-003                ARX-015-004
         (AI Binding)              (Exec Policy)            (Repo Authority)
                    │                         │                         │
                    └────────────┬────────────┘                         │
                                 │                                      │
                                 ▼                                      │
                         ARX-015-005 ◄─────────────────────────────────┘
                      (Session Manager)
                                 │
                    ┌────────────┼────────────┐
                    │            │            │
                    ▼            ▼            ▼
            ARX-015-006   ARX-015-007   ARX-015-008
         (OC Adapter V2) (Event Protocol) (Durable Store)
                         │            │
                         ▼            ▼
                    ARX-015-009 (Projection + Attention)
                         │
                         ▼
                    ARX-015-010 (Activity Room API V2)
                         │
                         ▼
                    ARX-015-011 (Activity Room UI V2)
                    ...
```

---

## 14. Explicit Non-Goals (Reiterated)

1. **Do not rewrite the Activity Room projection pipeline.** It is production-quality.
2. **Do not rewrite the Workflow Orchestrator.** It is mature and well-tested.
3. **Do not rewrite the Agent domain.** It has correct separation of concerns.
4. **Do not create a second Provider/Model architecture.** Extend the existing AI domain.
5. **Do not conflate AI invocation sessions with coding runtime sessions.**
6. **Do not automatically adopt unmanaged OpenCode sessions.**
7. **Do not implement ARX-015-001 from this review.** This review is evidence for the Planner.
8. **Do not collapse domain events into one giant event type.**
9. **Do not use `correlationId` as an alias for any other identity.**
10. **Do not deprecate `WorkflowRuntime` without completing ownership mapping (§7.3) and parity verification.** Deprecation is a separate decision.
11. **Do not blindly copy `vestara-platform` implementations into `vestara-ai-core`.** Reuse accepted semantics; reimplement according to `vestara-ai-core` package boundaries.
12. **Do not treat ARX-014D invariants as automatically authoritative.** They are reference evidence requiring evaluation before adoption.

---

*This architecture review is a decision document. No production code was changed. All decisions are based on the ARX-015-000 audit evidence, ARX-014D reference evidence, and targeted source inspection. Revision 2 incorporates repository authority clarification, ARX-014D reconciliation, refined AI binding scope, and layered execution policy.*

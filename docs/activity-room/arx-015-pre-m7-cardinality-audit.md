# ARX-015 Pre-M7 — Zero-Mutation Workflow→Session Cardinality Audit

**Date:** 2026-08-27  
**Status:** Evidence-only audit (code analysis, no live server mutation)  
**Scope:** Trace one workflow start through the full call graph to determine session cardinality

---

## 1. Architecture Discovery

### 1.1 Two Separate UI Pages, Two Separate Session Concepts

| UI Page | Route | Data Source | What It Shows |
|---------|-------|-------------|---------------|
| **Engineering Sessions** | `/sessions` | `GET /api/sessions` + `GET /api/sessions/executions` | Simple sessions + ExecutionSessions merged into one list |
| **OpenCode Sessions** | `/opencode/sessions` | `GET /api/opencode/sessions` + `GET /api/opencode/sessions/status` | Physical OpenCode server sessions |

**Critical finding:** The Engineering Sessions page (`/sessions`) merges two different entity types into a single list:
- `GET /api/sessions` → simple session records (`{ id, title, objective, status }`)
- `GET /api/sessions/executions` → ExecutionSession records (`{ id, goal, workflowId, assignedAgentIds, timeline, metrics }`)

Evidence: `apps/workspace/src/pages/SessionList.tsx` lines 104-111:
```typescript
const [s, ex] = await Promise.all([
  fetch('/api/sessions').then((r) => (r.ok ? r.json() : { sessions: [] })),
  fetch('/api/sessions/executions').then((r) => (r.ok ? r.json() : { sessions: [] })),
]);
setSessions(s.sessions ?? []);
setExSessions(ex.sessions ?? []);
```

Then merged at line 154-165:
```typescript
const allItems = useMemo(() => {
  const items = [
    ...sessions.map((s) => ({ ...s, _type: 'session' as const })),
    ...exSessions.map((s) => ({ ...s, _type: 'execution' as const, title: s.goal })),
  ];
  items.sort((a, b) => new Date(b.createdAt || Date.now()).getTime() - new Date(a.createdAt || Date.now()).getTime());
  return items;
}, [sessions, exSessions]);
```

### 1.2 Two Workflow Entry Points

| Endpoint | Handler | Creates | Runs Through |
|----------|---------|---------|--------------|
| `POST /api/workflows` | `workflow.ts` line 126 | 4 stages → 4 harness threads → 4 ExecutionSessions | `AgentHarnessRuntime` |
| `POST /api/sessions/executions/start` | `sessions.ts` line 99 | 1 ExecutionSession | Legacy `AgentRuntime` |

**The Workspace UI "Start Workflow" button calls `POST /api/sessions/executions/start`** (legacy path).  
**The ADR-118 multi-agent workflow uses `POST /api/workflows`** (new path).

Evidence: `SessionList.tsx` line 138-152:
```typescript
const startWorkflow = async () => {
  await fetch('/api/sessions/executions/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal: wfGoal, workflow: wfType }),
  });
};
```

### 1.3 OpenCode Sessions Are NOT Created by Workflows

**Neither workflow entry point creates OpenCode sessions.** The multi-agent workflow runs through `AgentHarnessRuntime`, which makes direct LLM provider calls — it does NOT go through the OpenCode HTTP server.

Evidence: `multi-agent-workflow.ts` line 364:
```typescript
const thread = this.session.harness.createThread({
  taskId: `${taskId}-${index}`,
  title: `${spec.agentId}: ${spec.instruction.slice(0, 120)}`,
  environment: this.environment,
  metadata: { agentId: spec.agentId, role: spec.role, workflowId, runSource: 'multi-agent', stageIndex: index },
});
```

The harness creates threads, not OpenCode sessions. OpenCode sessions are created only via:
- `POST /api/opencode/sessions` (manual creation from OpenCode Sessions page)
- Never automatically by workflow execution

---

## 2. Call Graph — ADR-118 Multi-Agent Workflow

### 2.1 Start Path

```
User clicks "Start Workflow" (or POST /api/workflows)
    ↓
POST /api/workflows  (workflow.ts line 126)
    ↓
ctx.multiAgentWorkflow.start({ goal, stages })
    ↓
MultiAgentWorkflowOrchestrator.start()  (multi-agent-workflow.ts line 355)
    ↓
For each stage (4 stages: planner, developer, verifier, reviewer):
    ↓
    this.session.harness.createThread({ ... })  →  creates harness thread
    ↓
    this.session.createForRun({ threadId, goal, agentId })  →  creates ExecutionSession
    ↓
    stages.push({ role, agentId, threadId })
    ↓
Returns { workflowId, goal, stages: [4 records] }
    ↓
void this.executeChain(workflowId, stages, threadIds)  →  runs in background
```

### 2.2 Execution Chain

```
executeChain()  (multi-agent-workflow.ts line 415)
    ↓
For each stage (sequential):
    ↓
    runStage(spec, threadId, previousOutput)  →  runs agent via harness
    ↓
    syncStage(threadId)  →  projects thread replay into ExecutionSession
    ↓
    if approval needed → pause; else continue
    ↓
    previousOutput = result.turn.outcome.summary
    ↓
All stages complete → emit workflow.completed event
```

### 2.3 Entity Creation Count

| Entity | Count per Workflow Start | Created By |
|--------|------------------------|------------|
| `workflowId` | 1 | `nextWorkflowId()` |
| Harness threads | 4 | `harness.createThread()` |
| `ExecutionSession` records | 4 | `session.createForRun()` |
| OpenCode sessions | **0** | Not created by workflow |
| `OpenCodeSessionBinding` | **0** | Not created by workflow |
| `ResolvedAiBinding` | 4 (one per stage) | `AiInvocationService` (inside harness run) |

---

## 3. Cardinality Determination

### 3.1 Answer: Option C — One WorkflowRun with Multiple Tasks Incorrectly Projected as Sessions

**The repeated Sessions-page entries represent one workflow with 4 stages, where each stage is incorrectly projected as an independent "session" on the Engineering Sessions page.**

Evidence:

1. **One workflow start** → 1 `workflowId` (e.g., `wf-1724764800000-1`)
2. **4 stages** → 4 harness threads (e.g., `thread-1724764800000-0` through `thread-1724764800000-3`)
3. **4 ExecutionSessions** → 4 records saved to storage (e.g., `session-1724764800001-1` through `session-1724764800004-4`)
4. **Sessions page merges** `GET /api/sessions` + `GET /api/sessions/executions` → 4+ rows appear as independent "sessions"

The UI label says "Session" but the underlying entity is an `ExecutionSession` — a harness thread execution record, not a session in the OpenCode or workflow-run sense.

### 3.2 Why Not the Other Options

| Option | Why Not |
|--------|---------|
| **A. Multiple WorkflowRuns** | Only 1 `workflowId` is created. The 4 records share the same `workflowId` in their metadata. |
| **B. One WorkflowRun with Multiple Executions** | There is 1 workflow execution chain (`executeChain()`). The 4 records are stages/tasks, not independent executions. |
| **D. Each Agent Creates Independent OpenCode Sessions** | No OpenCode sessions are created at all. The harness runs through `AgentHarnessRuntime`, not OpenCode. |
| **E. Duplicate Workflow Initialization** | Only 1 `POST /api/workflows` call is made. The 4 records are from 4 stages, not 4 workflow starts. |

---

## 4. Canonical Entity Distinctions

### 4.1 Entity Definitions

| Entity | Package | Identity | Lifecycle | What It Represents |
|--------|---------|----------|-----------|-------------------|
| **WorkflowRun** | `multi-agent-workflow.ts` | `workflowId` (string) | start → execute → complete/fail | One user-initiated workflow with multiple stages |
| **Execution** | `session-orchestrator.ts` | `exSession.id` (string) | queued → running → completed/failed | One legacy workflow execution (pre-ADR-118) |
| **Task** | `workflow-orchestrator/types.ts` | `task.id` (string) | pending → ready → assigned → in-progress → completed | One unit of work within a workflow plan |
| **AgentAssignment** | `workspace/types.ts` | `assignment.id` (string) | pending → ready → running → completed | One agent's assignment to tasks |
| **RuntimeSession** | `opencode-runtime` | `OpenCodeSessionBinding` | active → completed/aborted/deleted | Binding between OpenCode session and Vestara workspace |
| **OpenCodeSession** | OpenCode server | `session.id` (pattern `^ses`) | active → idle → completed | Physical OpenCode server session |
| **HarnessThread** | `agent-harness` | `threadId` (TaskThreadId) | created → running → completed/failed | Durable execution thread for one agent stage |
| **ExecutionSession** | `workspace/types.ts` | `session.id` (string, `session-*` or `exs-*`) | queued → running → completed/failed | Projection of harness thread replay into session timeline |

### 4.2 What the Sessions Page Actually Lists

The Engineering Sessions page (`/sessions`) lists a **mixed projection** of:

1. **Simple sessions** (`GET /api/sessions`) — lightweight records with `{ id, title, objective, status }`. These are created manually via `POST /api/sessions` and are NOT linked to workflows.

2. **ExecutionSessions** (`GET /api/sessions/executions`) — records created by `HarnessSession.createForRun()` (for ADR-118 workflows) or `SessionOrchestrator.startSession()` (for legacy workflows). Each record represents one harness thread's execution.

**The page merges both into a single list sorted by creation time, labeling them all as "sessions."**

### 4.3 The UI Should Eventually Distinguish

| Current UI Label | Actual Entity | Recommended Label |
|-----------------|---------------|-------------------|
| "Session" (from `/api/sessions`) | Simple session | "Session" (correct) |
| "Session" (from `/api/sessions/executions`) | ExecutionSession | "Workflow Stage" or "Agent Execution" |
| "Session" (from `/api/opencode/sessions`) | OpenCode session | "OpenCode Session" (correct) |

---

## 5. Target M7 Invariant

### 5.1 Desired Cardinality

```
1 user workflow start
       ↓
1 workflowId
       ↓
1 RuntimeSessionBinding
       ↓
1 physical OpenCode session
       ↓
N workflow stages/tasks (planner, developer, verifier, reviewer)
       ↓
N agent assignments/invocations
       ↓
All share the same OpenCode session
```

### 5.2 Current Cardinality (Pre-M7)

```
1 user workflow start (POST /api/workflows)
       ↓
1 workflowId
       ↓
4 harness threads
       ↓
4 ExecutionSession records (appear as 4 "sessions" on UI)
       ↓
0 OpenCode sessions (harness doesn't use OpenCode)
```

### 5.3 What M7 Must Establish

M7 must create the missing layer:

```
1 user workflow start
       ↓
1 workflowId
       ↓
1 RuntimeSessionBinding (NEW — links workflow to physical session)
       ↓
1 physical OpenCode session (acquired via OpenCodeHttpClient)
       ↓
N stages share the session via switchSessionAgent() / sendMessage()
       ↓
Agent assignments consume the session (not create new ones)
```

---

## 6. Repository Invariant

### 6.1 Current State

The multi-agent workflow receives `AgentEnvironment` which contains `workspaceRoot`:
```typescript
// multi-agent-workflow.ts line 346-348
get environment(): AgentEnvironment {
  return this.session.environment;
}
```

The `AgentEnvironment` is constructed at API bootstrap time in `apps/api/src/index.ts` and includes `workspaceRoot` from `resolveRepoRoot()`.

### 6.2 Repository Binding Propagation (M5)

M5 established:
- `RepositoryBinding.canonicalRoot` is the sole repository identity authority
- Tools require explicit `workspaceRoot` parameter
- `AgentEnvironment.repositoryBindingId` tracks binding lineage

### 6.3 M7 Requirement

For every repository-scoped OpenCode session:
```
RepositoryBinding.canonicalRoot
      ↓
OpenCode session creation (directory parameter)
      ↓
session.directory == RepositoryBinding.canonicalRoot
```

The OpenCode server may run from `/home/user/projects/vestara` (parent), but the session's `directory` parameter must be set to `RepositoryBinding.canonicalRoot` (child).

---

## 7. Session Policy Model (M7)

### 7.1 Continuity Policy

```typescript
continuityPolicy = 'SHARED_WORKFLOW'  // default
maxPhysicalSessions = 1               // per WorkflowRun
```

### 7.2 Policy Rules

Under `SHARED_WORKFLOW` with `maxPhysicalSessions = 1`:

| Rule | Enforcement |
|------|-------------|
| Planner/developer/reviewer/verifier share the workflow's OpenCode session | `getOrCreate()` converges on same session |
| Agent assignment must NOT create a session | Session acquisition happens at workflow start |
| Workflow-step transition must NOT create a session | Reuse existing session |
| Repeated `getOrCreate()` calls converge | Single-flight acquisition pattern |
| Concurrent acquisition is single-flight | Mutex/lock on session creation |
| Second physical session fails closed | `maxPhysicalSessions` enforcement |
| Provider/model resolution is per-invocation | M4 `ResolvedAiBinding` authority |

### 7.3 Session Creation Reasons

Every physical session creation must record `creationReason`:

| Reason | When |
|--------|------|
| `workflow-start` | New workflow begins |
| `explicit-isolation` | Operator or policy demands isolation |
| `context-limit-rollover` | Context window exhausted |
| `runtime-recovery` | Session lost, need fresh |
| `repository-change` | Different repo binding |
| `provider-incompatibility` | Model/provider requires new session |
| `operator-request` | Manual intervention |

---

## 8. M6→M7 Dependency Surface

### 8.1 M6 Primitives M7 Will Use

| M6 Method | M7 Use |
|-----------|--------|
| `listActiveSessions()` | Discover existing sessions for reconciliation |
| `getSessionContext(sessionId)` | Reconstruct session state after restart |
| `getSessionHistory(sessionId, opts?)` | Durable event replay for session continuity |
| `waitSession(sessionId)` | Detect session completion |
| `interruptSession(sessionId)` | Control session lifecycle |
| `switchSessionAgent(sessionId, agent)` | Change agent within shared session |
| `switchSessionModel(sessionId, model)` | Change model within shared session (M4 authority preserved) |
| `compactSession(sessionId)` | Manage context window |

### 8.2 New Primitives M7 Must Create

| Primitive | Purpose |
|-----------|---------|
| `RuntimeSessionRegistry` | Persistent session bindings (SQLite-backed) |
| `SessionBinding` | Links workflowRunId → runtimeSessionId → openCodeSessionId |
| `getOrCreateSession(workflowRunId)` | Single-flight session acquisition |
| `creationReason` tracking | Every session creation records why |

---

## 9. Evidence Summary

### 9.1 Cardinality Finding

**The repeated Sessions-page entries are one workflow with 4 stages, where each stage is projected as an independent "session" on the Engineering Sessions page.** This is option C from the requested classification.

### 9.2 Root Cause

The Engineering Sessions page (`/sessions`) merges two entity types:
1. Simple sessions (`GET /api/sessions`)
2. ExecutionSessions (`GET /api/sessions/executions`)

Both are labeled "Session" in the UI. An ADR-118 workflow creates 4 ExecutionSessions (one per stage), which appear as 4 independent rows.

### 9.3 OpenCode Session Count

**Zero OpenCode sessions are created by workflow execution.** The harness runs through `AgentHarnessRuntime` (direct LLM calls), not through the OpenCode HTTP server. OpenCode sessions are only created manually via the OpenCode Sessions page.

### 9.4 What M7 Must Build

M7 must establish the missing `RuntimeSessionBinding` layer that:
1. Acquires one physical OpenCode session per workflow
2. Makes all stages share that session
3. Records creation reasons
4. Enforces `maxPhysicalSessions` policy
5. Preserves M4 authority for model/provider selection

---

**Audit complete. No production code was modified.**

# Duplicate Agent Creation Provenance Audit

**Date:** 2026-09-03
**Status:** Audit Complete — Awaiting Director Review
**Authorization:** Audit only. No mutation.
**Baseline:** `ff4545a` (cleanup frozen)

---

## 1. Root Cause Classification

**ROOT CAUSE PROVEN**

The three timestamp-generated Developer agents (`agent-1788442451252`, `agent-1788442465552`, `agent-1788442474275`) were created by **explicit human submission** of the "Register Agent" form in the Workspace UI, three times over a 23-second window. The UI lacks submission feedback mechanisms (disabled state, loading indicator, modal close, success confirmation), causing the user to believe the first submission did not work and re-submit.

---

## 2. Creation Call Graph

### 2.1 Complete Call Chain (POST /api/agents)

```
User clicks "Register Agent" button in AgentRegistryModal
  → <form onSubmit={handleSubmit}>                    [AgentRegistryModal.tsx:234]
    → handleSubmit(e)                                  [AgentRegistryModal.tsx:166]
      → e.preventDefault()
      → if (!validate()) return
      → onSave({ name, role, agentType, ... })         [AgentRegistryModal.tsx:170]
        → saveAgent(agent)                              [Agents.tsx:201]
          → apiFetch('/api/agents', { method: 'POST', body: JSON.stringify({...}) })
                                                        [Agents.tsx:213]
            → fetch('/api/agents', ...)                 [api.ts:4]
              → HTTP POST to server
                → handleAgentsRoute()                   [routes/agents.ts:80]
                  → POST /api/agents branch             [routes/agents.ts:111]
                    → readBody(req)
                    → JSON.parse(raw)
                    → normalizedId = id || `agent-${Date.now()}`
                                                        [routes/agents.ts:124]
                    → ctx.agents.listAgents() (duplicate check)
                    → ctx.agents.saveAgent(agent)       [routes/agents.ts:151]
                      → AgentStorage.saveAgent()        [agent-storage.ts:68]
                        → INSERT OR REPLACE INTO agents
                    → logAudit(ctx.audit, ..., AGENT_CREATE, ...)
                                                        [routes/agents.ts:152]
                    → json(res, 201, { agent })
```

### 2.2 ID Generation

**File:** `apps/api/src/routes/agents.ts:124`
```typescript
const normalizedId = id || `agent-${Date.now()}`;
```

When the request body does not include an `id` field (the UI never sends one), the server generates `agent-${Date.now()}`. Each HTTP request gets a unique ID because `Date.now()` returns different millisecond timestamps.

### 2.3 Duplicate Check

**File:** `apps/api/src/routes/agents.ts:125-128`
```typescript
if (stored.some((agent: any) => agent.id === normalizedId)) {
  json(res, 409, { error: `Agent id already exists: ${normalizedId}` });
  return true;
}
```

The 409 guard only prevents exact ID collisions. Since `Date.now()` produces a unique ID per request, the guard never fires for repeated submissions.

---

## 3. Temporal Evidence

### 3.1 Three Developer Creation Records

| Agent ID | Audit ID | Timestamp | User | IP |
|----------|----------|-----------|------|-----|
| `agent-1788442451252` | `audit_1788442451287_vywch8` | 2026-09-03T13:34:11.287Z | local-operator | ::ffff:127.0.0.1 |
| `agent-1788442465552` | `audit_1788442465589_ialv4n` | 2026-09-03T13:34:25.589Z | local-operator | ::ffff:127.0.0.1 |
| `agent-1788442474275` | `audit_1788442474304_8r04q2` | 2026-09-03T13:34:34.304Z | local-operator | ::ffff:127.0.0.1 |

### 3.2 Creation Gaps

| Interval | Duration | Interpretation |
|----------|----------|----------------|
| 1st → 2nd | 14.3 seconds | Manual re-submission (not double-click) |
| 2nd → 3rd | 8.7 seconds | Manual re-submission (not double-click) |
| 1st → 3rd | 23.0 seconds | Total window of triple creation |

**The 14.3s and 8.7s gaps are inconsistent with:**
- Double-click (would be < 500ms)
- React StrictMode double-render (would be < 100ms)
- Automatic retry (would be < 5s)
- useEffect re-trigger (would be < 1s)

**The gaps are consistent with:**
- A user clicking submit, waiting for feedback that never comes, clicking again

### 3.3 Surrounding Audit Context

The audit log shows a clear pattern of user interaction around the creation timestamps:

| Time (UTC) | Action | Agent | Interpretation |
|------------|--------|-------|----------------|
| 13:31:01 | agent.update | agent-1787781308249 | User editing existing agents |
| 13:31:34 | agent.update | agent-verifier | User editing existing agents |
| 13:32:00 | agent.update | agent-reviewer | User editing existing agents |
| 13:32:47 | agent.update | agent-1787781354162 | User editing existing agents |
| 13:33:05 | agent.update | agent-developer | User editing existing agents |
| **13:34:11** | **agent.create** | **agent-1788442451252** | **1st Developer creation** |
| **13:34:25** | **agent.create** | **agent-1788442465552** | **2nd Developer creation** |
| **13:34:34** | **agent.create** | **agent-1788442474275** | **3rd Developer creation** |
| 13:34:51 | agent.update | agent-developer | User continues editing |

The user was actively editing agents (5 updates in 3 minutes), then created 3 Developer agents in 23 seconds, then continued editing. This is consistent with a user experimenting with the agent registration flow.

### 3.4 Audit Record Properties

| Property | Value | Consistent with |
|----------|-------|-----------------|
| user_id | `local-operator` | Authenticated human user (anonymous fallback) |
| username | `local-operator` | Same user for all three |
| IP | `::ffff:127.0.0.1` | Local browser access |
| action | `agent.create` | POST /api/agents route |
| resource | `agent` | Agent creation |
| All three same principal? | **YES** | Single user, not multi-user |
| All three same IP? | **YES** | Same machine |
| Request IDs available? | **NO** — audit_log has no request_id column | Cannot correlate to HTTP request logs |
| Correlation IDs available? | **NO** — not stored in audit | Would require stdout NDJSON cross-reference |

---

## 4. UI Submission Semantics

### 4.1 Submit Handler

**File:** `apps/workspace/src/pages/Agents/AgentRegistryModal.tsx:166-181`
```typescript
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  if (!validate()) return;
  onSave({
    name,
    role,
    agentType,
    description,
    provider: agentType === 'workspace' ? (provider || undefined) : (registrySource || undefined),
    model: agentType === 'workspace' ? (model || undefined) : (registryVersion || undefined),
    runtimeAgent: agentType === 'workspace' ? runtimeAgent || undefined : undefined,
    teamId: teamId || '',
    color,
    capabilities: capStr.split(',').map((s) => s.trim()).filter(Boolean),
  });
};
```

### 4.2 saveAgent Function

**File:** `apps/workspace/src/pages/Agents.tsx:201-223`
```typescript
const saveAgent = async (agent: Partial<Agent>) => {
  try {
    const clean = Object.fromEntries(Object.entries(agent).filter(([_, v]) => v !== undefined));
    const isNewRegistration = editAgent?.id?.startsWith('slot-') || editAgent?.status === 'unregistered';
    if (editAgent && !isNewRegistration) {
      await apiFetch(`/api/agents/${editAgent.id}`, { method: 'PUT', body: JSON.stringify(clean) });
      addToast({ type: 'success', message: `Agent "${clean.name || editAgent.name}" updated` });
    } else {
      await apiFetch('/api/agents', { method: 'POST', body: JSON.stringify({ ...clean, name: clean.name || 'New Agent' }) });
      addToast({ type: 'success', message: `Agent "${clean.name || 'New Agent'}" registered` });
    }
    setEditAgent(null);
    load();
  } catch (err: any) {
    addToast({ type: 'error', message: `Failed to save agent: ${err.message}` });
  }
};
```

### 4.3 Missing Protections

| Protection | Present? | Evidence |
|-----------|----------|----------|
| `disabled` / loading state on submit button | **NO** | Button at line 510 has no `disabled` prop |
| `isSubmitting` mutex in handleSubmit | **NO** | No flag checked or set before/after onSave |
| Modal closes after successful save | **NO** | `setEditAgent(null)` at line 219, but `showRegistry` stays `true` — modal remains visible |
| Debounce on submit handler | **NO** | No debounce/throttle applied |
| Button text changes after click | **NO** | Always says "Register Agent" (or "Save Changes") |
| Spinner/progress indicator | **NO** | No loading state rendering |
| Server-side idempotency | **NO** | ID = `agent-${Date.now()}`, unique per call |
| Client-side deduplication | **NO** | No check for in-flight requests |
| Error retry logic | **NO** | Error just shows a toast |
| React.StrictMode double-fire | **NO** | handleSubmit is event-driven (form onSubmit), not effect-driven |
| useEffect re-submission | **NO** | All useEffects in AgentRegistryModal are read-only (fetch providers, set defaults) |
| onClick + onSubmit overlap | **NO** | Submit button is `type="submit"` inside `<form>`, no separate onClick handler |

### 4.4 Why the User Re-Submitted

The user clicked "Register Agent" and observed:

1. **No modal close** — the modal stayed open on step 2
2. **No button state change** — button still says "Register Agent"
3. **No spinner** — no loading indicator
4. **Toast may not be visible** — toast notifications may appear behind the modal (z-50 vs z-50) or be dismissed quickly
5. **No immediate visual change** — the agent list behind the modal doesn't update while the modal is open (modal overlays the list)

The user reasonably concluded the first click did not work and clicked again (14.3s later), then again (8.7s after that).

---

## 5. Runtime/Bootstrap Exclusion Evidence

### 5.1 seedBuiltIn()

**EXCLUDED.** Uses static IDs from `CANONICAL_AGENTS` (`agent-context`, `agent-developer`, etc.), not `agent-${Date.now()}`. Only seeds into empty catalog. Guard at `agent-storage.ts:60-61`:
```typescript
const existing = dbGet(this.db, 'SELECT COUNT(*) as c FROM agents');
if (existing && existing.c > 0) return;
```

### 5.2 GET /api/agents Runtime Synchronization

**EXCLUDED.** `runtimeSyncedAgents()` at `routes/agents.ts:59-78` only annotates existing stored agents with OpenCode runtime twin information. It does not create new agents. The function maps `runtimeAgent` names to OpenCode runtime agents and enriches stored agent objects.

### 5.3 POST /api/agents/sync

**EXCLUDED.** Writes `.opencode/agents/*.md` files to disk. Does not call `saveAgent()`. Logs `AGENT_UPDATE` (not `AGENT_CREATE`). See `routes/agents.ts:367-403`.

### 5.4 Team Creation

**EXCLUDED.** `POST /api/teams` at `routes/teams.ts:72-104` creates a team record, then iterates `memberIds` to set `agent.teamId = team.id` on existing agents. Does not create new agents. The `saveAgent()` calls are updates to existing agent records (INSERT OR REPLACE with existing ID).

### 5.5 WorkflowRuntime

**EXCLUDED.** `WorkflowRuntime` at `packages/workspace/src/workflow-runtime.ts` orchestrates workflow execution. It consumes `AgentDefinition` objects from storage but never calls `saveAgent()`.

### 5.6 AgentRuntime

**EXCLUDED.** `AgentRuntime` at `packages/workspace/src/agent-runtime.ts` runs agent reasoning loops. It reads agents via `listAgents()` and `getAgent()` but never calls `saveAgent()`.

### 5.7 AgentHarnessRuntime

**EXCLUDED.** `AgentHarnessRuntime` at `packages/workspace/src/agent-runtime.ts` manages agent harness sessions. It reads agents for execution but never creates new agent definitions.

### 5.8 OpenCode Runtime

**EXCLUDED.** The OpenCode runtime (`@vestara/opencode-runtime`) manages its own agent definitions (`.opencode/agents/*.md` files). It does not write to the Vestara `agents` table in `plans.db`. The `POST /api/agents/sync` endpoint syncs FROM Vestara TO OpenCode, not the reverse.

### 5.9 Session Restoration

**EXCLUDED.** Session restoration reads existing session data and agent definitions. It does not create new agents.

### 5.10 Test/Development Tooling

**EXCLUDED.** Test files call `saveAgent()` in test setup, but these operate on test databases, not the production `plans.db`.

---

## 6. Complete Creation Provenance (All 10 Noncanonical Agents)

The audit log reveals the creation history of all 10 noncanonical agents:

| Agent ID | Name | Created (UTC) | Creation Pattern |
|----------|------|---------------|------------------|
| `agent-1787781308249` | Planner | 2026-08-26T21:55:08 | Single creation |
| `agent-1787781354162` | Repository Analyst | 2026-08-26T21:55:54 | Single creation (46s after Planner) |
| `agent-1787819315794` | Security Agent | 2026-08-27T08:28:35 | Single creation (next day) |
| `agent-1787819502373` | Architect | 2026-08-27T08:31:42 | Single creation (3min after Security) |
| `agent-1787835308017` | Performance Agent | 2026-08-27T12:55:08 | Single creation (4.5hr later) |
| `agent-1787837563476` | Reviewer | 2026-08-27T13:32:43 | Single creation (37min later) |
| `agent-1787978779626` | Developer | 2026-08-29T04:46:19 | Single creation (2 days later) |
| `agent-1788442451252` | Developer | 2026-09-03T13:34:11 | **Triple creation (1st)** |
| `agent-1788442465552` | Developer | 2026-09-03T13:34:25 | **Triple creation (2nd, +14.3s)** |
| `agent-1788442474275` | Developer | 2026-09-03T13:34:34 | **Triple creation (3rd, +8.7s)** |

**Pattern:** The first 7 agents were created as single events over 8 days (Aug 26 — Aug 29). The last 3 were created in a 23-second burst on Sep 3. All 10 were created by `local-operator` from `::ffff:127.0.0.1`.

**Interpretation:** The user was deliberately creating specialized agents over several days (Planner, Repository Analyst, Security Agent, Architect, Performance Agent, Reviewer, Developer). On Sep 3, the user attempted to create a "Developer" agent and accidentally created 3 due to the UI's lack of submission feedback.

---

## 7. BLOCKER / ADJACENT / OBSERVATION

### BLOCKER

None. Root cause is proven and the cleanup has already been executed.

### ADJACENT

| ID | Finding | Action |
|----|---------|--------|
| ADJ-CREATE-001 | AgentRegistryModal has no submission feedback (disabled state, loading, modal close) | UI improvement, not blocking |
| ADJ-CREATE-002 | POST /api/agents has no idempotency key or client-supplied unique constraint | Server improvement, not blocking |
| ADJ-CREATE-003 | Audit log has no request_id column for HTTP request correlation | Observability improvement, not blocking |
| ADJ-CREATE-004 | Toast notifications may render behind the modal (z-index overlap) | UI improvement, not blocking |

### OBSERVATION

| ID | Finding | Confidence |
|----|---------|------------|
| OBS-CREATE-001 | All 10 noncanonical agents were created by the same user (`local-operator`) from the same IP (`127.0.0.1`) | HIGH (audit log evidence) |
| OBS-CREATE-002 | The triple creation was isolated to a single 23-second window; no other duplicate creation events exist in the audit log | HIGH (154 audit records inspected) |
| OBS-CREATE-003 | The user was actively editing agents (5 updates) immediately before and after the triple creation | HIGH (audit log evidence) |
| OBS-CREATE-004 | The `POST /api/agents` endpoint has no rate limiting | MEDIUM (no rate limit middleware observed) |

---

## 8. Minimum Recurrence-Prevention Recommendation

The root cause is a UI feedback deficiency, not a server defect. The server correctly:
- Generates unique IDs per request
- Returns 201 with the created agent
- Logs audit records
- Persists to database

The recurrence-prevention recommendation (for future authorization, not this audit):

1. **Add `isSubmitting` state to AgentRegistryModal** — disable submit button during request, show loading indicator
2. **Close modal after successful save** — call `setShowRegistry(false)` after `saveAgent` resolves
3. **Show success feedback** — toast is correct but should be more prominent (e.g., modal success state before close)
4. **Consider client-side deduplication** — track in-flight POST requests and prevent duplicate submissions

These are UI improvements, not server changes. The `POST /api/agents` endpoint does not need modification for recurrence prevention.

---

*Provenance audit complete. No production code was changed. All evidence is from audit log records in `.vestara/plans/plans.db` and source code inspection.*

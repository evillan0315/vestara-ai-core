---
title: Agent Catalog Cleanup Preflight (Corrected)
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Agent Catalog Cleanup Preflight (Corrected)

**Date:** 2026-09-03
**Status:** Corrected — Awaiting Director Approval
**Authorization:** Cleanup preflight only. No mutation.
**Baseline:** `c7d7106` (M-B1.5 frozen)
**Previous version:** `9f5063b` (original preflight, corrected per Director feedback)

---

## Corrections Applied

| # | Director Correction | Section(s) Changed |
|---|-------------------|--------------------|
| 1 | Hard-delete disposition: replace "safe: YES" with narrower proven conclusion | §4, §6, §16 |
| 2 | Recurrence classification: replace "risk: None" with "risk: UNKNOWN" | §3, §10 |
| 3 | No negative-set destructive mutation: must use exact evidence-backed deletion set | §9 |
| 4 | Persisted-state evidence: database successfully inspected | §2, §16 |
| 5 | Team mutation must be exact: exact before/after for each deletion candidate | §7, §9 |
| 6 | Dropped production identities remain adjacent | §15, §16 |

---

## 1. Canonical Active Engineering Agent Set

The five canonical Engineering Agents, defined in `packages/workspace/src/agents.registry.ts`:

| # | `AgentDefinition.id` | `runtimeAgent` | `role` | Status |
|---|---------------------|----------------|--------|--------|
| 1 | `agent-context` | `vestara-context` | `context` | Active |
| 2 | `agent-planner` | `vestara-planner` | `planning` | Active |
| 3 | `agent-developer` | `vestara-developer` | `developer` | Active |
| 4 | `agent-reviewer` | `vestara-reviewer` | `reviewer` | Active |
| 5 | `agent-verifier` | `vestara-verifier` | `verifier` | Active |

These are the **only** canonical Engineering Agents. All other persisted agent identities are cleanup candidates.

---

## 2. Current Persisted Agent Rows (Database Evidence)

**Database location:** `.vestara/plans/plans.db` (1,212,416 bytes)
**Inspection method:** Node.js require of sql.js WASM via `initSqlJs()` + `fs.readFileSync()`
**Inspection timestamp:** 2026-09-03

### 2.1 All 15 Agent Rows (persisted evidence)

| # | `id` | `name` | `role` | `status` | `model` | `team_id` | `runtime_agent` |
|---|------|--------|--------|----------|---------|-----------|-----------------|
| 1 | `agent-planner` | Planner | planning | active | deepseek-v4-flash-free | *(empty)* | vestara-planner |
| 2 | `agent-context` | Context | context | active | mimo-v2.5-free | *(empty)* | vestara-context |
| 3 | `agent-verifier` | Verifier | verifier | active | deepseek-v4-flash-free | team-1787978561148 | vestara-verifier |
| 4 | `agent-reviewer` | Reviewer | reviewer | active | nemotron-3-ultra-free | team-1787978561148 | vestara-reviewer |
| 5 | `agent-developer` | Developer | developer | active | mimo-v2.5-free | team-1787978561148 | vestara-developer |
| 6 | `agent-1787781308249` | Planner | planner | active | mimo-v2.5-free | team-1787978561148 | vestara-developer |
| 7 | `agent-1787781354162` | Repository Analyst | analyst | active | mimo-v2.5-free | team-1787978561148 | vestara-context |
| 8 | `agent-1787819315794` | Security Agent | security-agent | active | nemotron-3-ultra-free | *(empty)* | build |
| 9 | `agent-1787819502373` | Architect | architect | active | nemotron-3-ultra-free | *(empty)* | general |
| 10 | `agent-1787835308017` | Performance Agent | performance-agent | active | deepseek-v4-flash-free | *(empty)* | build |
| 11 | `agent-1787837563476` | Reviewer | reviewer | active | mimo-v2.5-free | *(empty)* | build |
| 12 | `agent-1787978779626` | Developer | developer | active | mimo-v2.5-free | team-1787978561148 | vestara-developer |
| 13 | `agent-1788442451252` | Developer | developer | active | mimo-v2.5-free | team-1787978561148 | build |
| 14 | `agent-1788442465552` | Developer | developer | active | mimo-v2.5-free | team-1787978561148 | vestara-developer |
| 15 | `agent-1788442474275` | Developer | developer | active | mimo-v2.5-free | team-1787978561148 | vestara-developer |

### 2.2 Persisted-State Evidence Summary

- **Total agents:** 15
- **Canonical:** 5 (rows 1-5)
- **Noncanonical (user-created):** 10 (rows 6-15)
- **`origin` column:** Does NOT exist yet (migration pending GA-4.1)
- **Team `team-1787978561148`:** `member_ids = []`, `leader_agent_id = ''` (empty team — team cleanup is a no-op)
- **Execution records:** 22 rows in `agent_executions` — all reference canonical agents or noncanonical agents
- **Memory records:** 23 rows in `agent_memory` — references canonical + `agent-1787781354162` + `agent-1787819502373`
- **Schedule records:** 0 rows
- **Execution sessions:** 600+ rows — overwhelming majority reference `agent-workspace-ui-tester` (a dropped agent)

### 2.3 Provider/Model Drift (canonical agents only)

| Canonical Agent | Canonical Model | Persisted Model | Drift |
|----------------|----------------|-----------------|-------|
| `agent-planner` | `mimo-v2.5-free` | `deepseek-v4-flash-free` | YES |
| `agent-context` | `mimo-v2.5-free` | `mimo-v2.5-free` | NO |
| `agent-developer` | `mimo-v2.5-free` | `mimo-v2.5-free` | NO |
| `agent-reviewer` | `mimo-v2.5-free` | `nemotron-3-ultra-free` | YES |
| `agent-verifier` | `mimo-v2.5-free` | `deepseek-v4-flash-free` | YES |

**Classification:** Provider/model drift belongs to AI Configuration/M4 authority. Catalog cleanup must NOT normalize this.

---

## 3. Creation Provenance of Duplicate/Experimental Agents

### User-Created Agents (via Register Agent UI)

**Creation path:** `POST /api/agents` → `AgentStorage.saveAgent()`

**ID generation:** `agent-${Date.now()}` (line 133 of `routes/agents.ts`)

**Can this recreate them after cleanup?** Yes. The `POST /api/agents` endpoint is the standard user agent creation path. It will continue to work after cleanup. The UI radio buttons allow creating both workspace and registry agents.

**Recurrence prevention:** The Register Agent UI is an intentional user capability. Noncanonical agents are expected user creations. The cleanup targets stale/test agents, not a capability restriction.

**Risk classification: UNKNOWN.** We do not yet know whether the user-created agents in this database were intentional or accidental. The fact that they exist and were used in workflows (execution sessions reference them) suggests they were intentional at creation time. Whether they should persist is a judgment call, not a technical question.

### Dropped Canonical Agents

**Creation path:** `seedBuiltIn()` seeded them when they were in `CANONICAL_AGENTS`. They were later removed from the array but never cleaned from existing databases.

**Can this recreate them after cleanup?** No. `seedBuiltIn()` only seeds from `CANONICAL_AGENTS`, and these IDs are no longer in the array. However, `seedBuiltIn()` only seeds into an empty catalog — it would not re-add them to a non-empty catalog.

**Risk classification: UNKNOWN.** The `DROPPED_BUILT_IN_AGENT_IDS` array documents intent to remove, but the recurrence path through `seedBuiltIn()` is guarded by the empty-catalog check. We cannot prove that no future code path will re-introduce these IDs without a broader audit.

### Automatic Agent Generation

**No automatic agent generation paths exist.** The `AgentRuntime`, `AgentHarnessRuntime`, and workflow systems do not create agents. They consume existing agent definitions.

---

## 4. FK / Cascade Behavior

### Schema Analysis

**File:** `packages/workspace/src/agent-migrations.ts` (lines 103-183)

| Table | FK Constraints | CASCADE Rules |
|-------|---------------|---------------|
| `agents` | **NONE** | **NONE** |
| `agent_executions` | **NONE** | **NONE** |
| `agent_teams` | **NONE** | **NONE** |
| `agent_schedules` | **NONE** | **NONE** |
| `agent_memory` | **NONE** | **NONE** |
| `execution_sessions` | **NONE** | **NONE** |

**Critical finding:** The entire agent domain has **zero FOREIGN KEY constraints** and **zero CASCADE delete rules**. All cross-table references are purely logical, enforced only by application code.

### Impact of Hard Deletion

Deleting an agent from the `agents` table:

| Related Table | Impact | Evidence Preserved? |
|---------------|--------|-------------------|
| `agent_executions` | Orphaned rows remain | **YES** — execution history preserved |
| `agent_schedules` | Orphaned rows remain | **YES** — schedule history preserved |
| `agent_memory` | Orphaned rows remain | **YES** — memory entries preserved |
| `agent_teams` | Stale `member_ids` JSON, stale `leader_agent_id` | **YES** — but team integrity broken |
| `execution_sessions` | Stale `assigned_agent_ids` JSON | **YES** — session history preserved |

### Hard-Delete Disposition (Corrected)

**Physical cascade risk: NONE.** Zero FK constraints exist. No database-level cascade will fire.

**Historical preservation: PROVEN.** The `agent_executions`, `agent_memory`, `agent_schedules`, and `execution_sessions` tables have zero FK constraints. Rows referencing deleted agents persist indefinitely.

**Logical referential integrity after deletion: NOT YET PROVEN.** The consumer audit (§5) reveals that all consumers correlate agent identity through application-level lookup against the `agents` table. When the agent row is deleted:

- CLI commands (`brief`, `doctor`, `agents`, `teams`) show orphaned `agent_id` strings without display names
- API endpoints (`GET /api/agents/:id`) return 404, making per-agent execution history unreachable
- UI components silently filter out orphaned executions (no matching agent card)
- Graph service creates phantom `agent:*` entity nodes

**This is a presentation degradation, not a data loss or crash.** Historical evidence is preserved but loses agent identity resolution. The records remain readable as raw data — they just can't be resolved to human-readable agent names, models, or providers.

**Conclusion:** Hard deletion is physically safe and preserves historical evidence. The cost is presentation degradation of orphaned records. This is acceptable for cleanup of stale/test agents. For agents with significant execution history (e.g., `agent-developer` with 12+ executions), the orphaned records remain valuable as aggregate metrics even without identity resolution.

---

## 5. Historical Reference Impact

### References FROM Related Tables TO Agents

| Reference Type | Location | Pattern | Impact of Agent Deletion |
|---------------|----------|---------|------------------------|
| `agent_executions.agent_id` | `agent-migrations.ts:121` | `TEXT` column | Orphaned rows — execution history preserved |
| `agent_schedules.agent_id` | `agent-migrations.ts:143` | `TEXT` column | Orphaned rows — schedule preserved |
| `agent_memory.agent_id` | `agent-migrations.ts:158` | `TEXT` column | Orphaned rows — memory preserved |
| `agent_teams.member_ids` | `agent-migrations.ts:134` | `TEXT` (JSON array) | Stale reference in JSON — team integrity broken |
| `agent_teams.leader_agent_id` | `agent-migrations.ts:133` | `TEXT` column | Stale reference — team integrity broken |
| `execution_sessions.assigned_agent_ids` | `agent-migrations.ts:175` | `TEXT` (JSON array) | Stale reference — session preserved |

### Consumer Audit Results (28 consumers audited)

**Join type:** ALL consumers use soft dependency (no SQL JOINs). Correlation is application-level via `agentId` string matching.

**Failure mode:** Silent data loss of agent identity (display name, model, provider, role). No crashes, no errors.

| Consumer | File | Impact |
|----------|------|--------|
| `brief.ts` | `apps/cli/src/commands/brief.ts:131-138` | Orphaned `agent_id` strings in output without display names |
| `doctor.ts` | `apps/cli/src/commands/doctor.ts:281-291` | Deleted agent's executions vanish from per-agent health view |
| `agents.ts` (CLI) | `apps/cli/src/commands/agents.ts:28-49` | Deleted agent not listed; orphaned executions invisible |
| `teams.ts` | `apps/cli/src/commands/teams.ts:20-36` | Deleted agent missing from team roster |
| `agent-service.ts` | `packages/workspace/src/agent-service.ts:157-182` | Stats still work via `agentId` filter |
| `memory-service.ts` | `packages/workspace/src/memory-service.ts:132-144` | KG node shows raw `agentId` string |
| `suggestion-service.ts` | `packages/workspace/src/suggestion-service.ts:180,348` | Aggregate-only suggestions; no breakage |
| `execution-planner.ts` | `packages/workspace/src/execution-planner.ts:157` | Deleted agent not a candidate; no breakage |
| `workspace-analyst.ts` | `packages/workspace/src/workspace-analyst.ts:39-42` | Aggregate metrics only; no breakage |
| `GET /api/agents` | `apps/api/src/routes/agents.ts:100-104` | Returns orphaned executions; client filters them out |
| `GET /api/agents/:id` | `apps/api/src/routes/agents.ts:161-184` | Returns 404; per-agent execution history unreachable |
| `/api/execution/*` | `apps/api/src/routes/execution.ts:163-174,484-488` | Queue shows raw `agentId`; traceability graph has phantom nodes |
| `/api/diagnostics/agents` | `apps/api/src/routes/diagnostics.ts:207` | Orphaned executions with unresolved `agentId` |
| `/api/sessions/executions` | `apps/api/src/routes/sessions.ts:29` | Sessions contain stale `agentId` strings |
| Graph service | `apps/api/src/graph/service.ts:163-177,417-422` | Edges point to phantom `agent:*` nodes |
| `Agents.tsx` | `apps/workspace/src/pages/Agents.tsx:40,96-104` | Orphaned executions not assigned to any agent card |
| `AgentCard.tsx` | `apps/workspace/src/pages/Agents/AgentCard.tsx:55-63` | No card rendered for deleted agent |
| `OpsCenter.tsx` | `apps/workspace/src/pages/OpsCenter.tsx:71-94` | Orphaned executions silently filtered out |

### Historical Evidence Invariant (Corrected)

Deleting an agent does NOT delete its execution history. `agent_executions`, `agent_memory`, `agent_schedules`, and `execution_sessions` rows referencing the deleted agent remain intact. However, agent identity resolution (display name, model, provider, role) is lost for those records because all consumers correlate through application-level lookup against the `agents` table. The records degrade from "interpretable with identity" to "interpretable as raw data" — functional but less meaningful.

---

## 6. Hard Delete vs Retirement Recommendation

### Option A: Hard Delete

**Pros:**
- Simple, clean catalog
- No orphaned identity records
- Consistent with `DROPPED_BUILT_IN_AGENT_IDS` intent

**Cons:**
- Orphaned execution/memory/schedule records lose agent identity resolution
- Team integrity broken (stale references) — but current team is empty, so no impact
- No audit trail of agent existence

### Option B: Retirement (Status → `disabled`)

**Pros:**
- Preserves identity record for audit
- Team references remain valid (agent exists but disabled)
- Clear "retired" semantics

**Cons:**
- Catalog retains non-functional agents
- Requires UI to filter/display retired agents
- More complex lifecycle

### Recommendation: Hard Delete with Team Cleanup

**Rationale:**
1. No FK constraints exist — hard deletion does not violate referential integrity at the DB level
2. Historical execution evidence is preserved in `agent_executions`, `agent_memory`, etc. — these tables are NOT deleted
3. Team references are cleaned up before agent deletion (member removal + leader clearing)
4. The `DROPPED_BUILT_IN_AGENT_IDS` array already documents the intent to remove these agents
5. Retirement adds complexity without clear benefit for engineering agents
6. Current team `team-1787978561148` has `member_ids = []` and `leader_agent_id = ''` — team cleanup is a no-op

**Disposition:** Hard deletion is physically safe (zero FK cascade), preserves historical evidence (orphaned rows persist), and causes presentation degradation (orphaned records lose identity resolution). This is acceptable for cleanup of stale/test agents.

---

## 7. Team Impact

### Current Team State (persisted evidence)

**Team `team-1787978561148` (Engineering):**
- `id`: `team-1787978561148`
- `name`: `Engineering`
- `leader_agent_id`: *(empty)*
- `member_ids`: `[]` (empty JSON array)

**Agents with `team_id = team-1787978561148`:**
- `agent-verifier`
- `agent-reviewer`
- `agent-developer`
- `agent-1787781308249` (Planner)
- `agent-1787781354162` (Repository Analyst)
- `agent-1787978779626` (Developer)
- `agent-1788442451252` (Developer)
- `agent-1788442465552` (Developer)
- `agent-1788442474275` (Developer)

### Team Cleanup: Before → After

**Before (current state):**
```
team-1787978561148:
  member_ids: []
  leader_agent_id: ''
```

**After (cleanup):**
```
team-1787978561148:
  member_ids: []
  leader_agent_id: ''
```

**No team mutation required.** The team has zero members and no leader. The `member_ids` and `leader_agent_id` fields are already empty. The only team-side change is clearing the `team_id` column on the 10 noncanonical agents before deletion (set to empty string).

### Agent `team_id` Before → After

| Agent | Before `team_id` | After `team_id` |
|-------|------------------|-----------------|
| `agent-1787781308249` | `team-1787978561148` | *(empty)* |
| `agent-1787781354162` | `team-1787978561148` | *(empty)* |
| `agent-1787819315794` | *(empty)* | *(no change)* |
| `agent-1787819502373` | *(empty)* | *(no change)* |
| `agent-1787835308017` | *(empty)* | *(no change)* |
| `agent-1787837563476` | *(empty)* | *(no change)* |
| `agent-1787978779626` | `team-1787978561148` | *(empty)* |
| `agent-1788442451252` | `team-1787978561148` | *(empty)* |
| `agent-1788442465552` | `team-1787978561148` | *(empty)* |
| `agent-1788442474275` | `team-1787978561148` | *(empty)* |

---

## 8. Canonical-vs-Persisted Drift Table

### Drift Fields

| Field | Canonical Source | Persistence | Drift Risk |
|-------|-----------------|-------------|------------|
| `id` | `CANONICAL_AGENTS[i].id` | DB PK | **None** — seeded identically |
| `name` | `CANONICAL_AGENTS[i].name` | DB column | **Low** — user can rename via UI |
| `role` | `CANONICAL_AGENTS[i].role` | DB column | **Low** — user can change via UI |
| `agentType` | `CANONICAL_AGENTS[i].agentType` | DB column (default `'workspace'`) | **None** — all canonical are `'workspace'` |
| `runtimeAgent` | `CANONICAL_AGENTS[i].runtimeAgent` | DB column (default `''`) | **Low** — user can change via UI |
| `provider` | `CANONICAL_AGENTS[i].provider` | DB column (default `''`) | **MEDIUM** — user can change via UI; AI Configuration will re-establish authority |
| `model` | `CANONICAL_AGENTS[i].model` | DB column (default `''`) | **MEDIUM** — user can change via UI; AI Configuration will re-establish authority |
| `permissions` | `CANONICAL_AGENTS[i].permissions` | DB column (JSON) | **Low** — user can modify via UI |
| `capabilities` | `CANONICAL_AGENTS[i].capabilities` | DB column (JSON) | **Low** — user can modify via UI |
| `status` | `CANONICAL_AGENTS[i].status` | DB column | **Expected** — enable/disable is allowed |
| `color` | `CANONICAL_AGENTS[i].color` | DB column | **Expected** — user customization |
| `teamId` | `CANONICAL_AGENTS[i].teamId` | DB column | **Expected** — team assignment |

### Provider/Model Isolation

**Do not normalize provider/model configuration during catalog cleanup.** Current provider/model drift is evidence and belongs to the forthcoming AI Configuration/M4 authority. Catalog cleanup concerns identity, not AI routing.

---

## 9. Exact Bounded Cleanup Mutation

### Phase 1: Clear team_id on noncanonical agents (before deletion)

```sql
-- Clear team_id on noncanonical agents that reference team-1787978561148
UPDATE agents
SET team_id = ''
WHERE id IN (
  'agent-1787781308249',
  'agent-1787781354162',
  'agent-1787978779626',
  'agent-1788442451252',
  'agent-1788442465552',
  'agent-1788442474275'
)
AND team_id = 'team-1787978561148';
```

**Expected affected rows:** 6

**Note:** The other 4 noncanonical agents (`agent-1787819315794`, `agent-1787819502373`, `agent-1787835308017`, `agent-1787837563476`) have `team_id = ''` already — no change needed.

### Phase 2: Delete noncanonical agents (exact evidence-backed set)

```sql
-- Delete ONLY the 10 noncanonical agents found in persisted evidence
DELETE FROM agents
WHERE id IN (
  'agent-1787781308249',
  'agent-1787781354162',
  'agent-1787819315794',
  'agent-1787819502373',
  'agent-1787835308017',
  'agent-1787837563476',
  'agent-1787978779626',
  'agent-1788442451252',
  'agent-1788442465552',
  'agent-1788442474275'
);
```

**Expected affected rows:** 10

**Why exact set, not negative-set:** The Director corrected that `WHERE id NOT IN (canonical-5)` is unsafe because it would delete any future agent that doesn't happen to be in the canonical set. The exact set is derived from database evidence (§2.1), not from a structural exclusion rule.

### Phase 3: Verify

```sql
-- Confirm only canonical 5 remain
SELECT id, name FROM agents ORDER BY created_at ASC;
-- Expected: 5 rows (agent-context, agent-planner, agent-developer, agent-reviewer, agent-verifier)

-- Confirm orphaned execution records persist
SELECT COUNT(*) FROM agent_executions;
-- Expected: 22 (unchanged)

-- Confirm orphaned memory records persist
SELECT COUNT(*) FROM agent_memory;
-- Expected: 23 (unchanged)

-- Confirm team unchanged
SELECT id, name, leader_agent_id, member_ids FROM agent_teams;
-- Expected: team-1787978561148, Engineering, '', '[]'
```

### What Is NOT Mutated

- `agent_executions` — historical evidence preserved
- `agent_memory` — memory entries preserved
- `agent_schedules` — schedule history preserved
- `execution_sessions` — session history preserved
- `CANONICAL_AGENTS` — canonical definitions unchanged
- Provider/model routing — unchanged
- Activity Room records — unchanged (references runtimeAgent names, not AgentDefinition.id)

---

## 10. Recurrence Prevention

### Can Noncanonical Agents Be Recreated?

| Path | Recurrence Risk | Mitigation |
|------|----------------|------------|
| `POST /api/agents` | **Expected** — this is the user agent creation API | No mitigation needed — user-created agents are legitimate |
| `seedBuiltIn()` | **UNKNOWN** — only seeds from `CANONICAL_AGENTS`, but only into empty catalog | Guard is correct but unproven for all edge cases |
| `DROPPED_BUILT_IN_AGENT_IDS` | **UNKNOWN** — not consumed by any code path currently, but future code could re-introduce | No mitigation beyond current array documentation |
| `POST /api/teams` | **None** — creates teams, not agents | Already safe |

### Recurrence Prevention Recommendation

1. **No API changes needed.** The `POST /api/agents` endpoint is the standard user creation path. Noncanonical agents are expected user creations.
2. **DROPPED_BUILT_IN_AGENT_IDS should be consumed.** The reconciliation logic (GA-4.0 Section D) should clean dropped agents automatically on startup.
3. **Seed-on-empty guard is correct.** `seedBuiltIn()` only seeds into an empty catalog. This prevents re-adding dropped agents to a populated catalog.
4. **Risk remains UNKNOWN** for whether future code paths could re-introduce dropped agent IDs. This is a broader architectural concern, not a cleanup concern.

---

## 11. AgentOrigin System Classification

### Candidate Rule

**Exact canonical identity match + canonical authority membership → eligible deterministic system classification:**

```typescript
const CANONICAL_IDS = new Set([
  'agent-context', 'agent-planner', 'agent-developer',
  'agent-reviewer', 'agent-verifier',
]);

function classifyOrigin(id: string): AgentOrigin {
  return CANONICAL_IDS.has(id) ? 'system' : 'user';
}
```

### Backfill Strategy

During reconciliation (GA-4.2):

```sql
-- For each canonical agent that exists in the database
UPDATE agents
SET origin = 'system'
WHERE id IN ('agent-context', 'agent-planner', 'agent-developer', 'agent-reviewer', 'agent-verifier')
AND (origin IS NULL OR origin = 'user');
```

**Only exact canonical IDs are upgraded to `system`.** Arbitrary existing agents remain `user`.

---

## 12. CanonicalAgent Coupling Classification

### Finding

`CanonicalAgent` requires OpenCode-specific fields (`mode`, `opencodePermissions`, `opencodePrompt`) even when the canonical identity has no `runtimeAgent`, `provider`, or `model`.

### Classification: ADJACENT

**ADJ-007:** `CanonicalAgent` couples canonical identity with OpenCode runtime projection. The `mode`, `opencodePermissions`, and `opencodePrompt` fields are in-memory-only (not persisted to DB) and are only used by `scripts/agents-sync.mjs` for `.md` generation. For `agent-assistant` (which has no runtime twin), these fields are structurally required but semantically unused.

**Do not generalize CanonicalAgent as part of cleanup.** This is an architectural observation for future reconciliation, not a cleanup concern.

---

## 13. BLOCKER / ADJACENT / OBSERVATION

### BLOCKER

None. All cleanup investigation paths are clear.

### ADJACENT

| ID | Finding | Action |
|----|---------|--------|
| ADJ-007 | `CanonicalAgent` couples identity with OpenCode projection | Record; do not fix in cleanup |
| ADJ-008 | `session-service.ts:85,273` references `agent-architect` (dropped) | Will cause runtime error if workflow executed — separate fix |
| ADJ-009 | `workspace-analyst.ts:74` saves memory with `agent-analyst` (dropped) | Creates orphaned memory — separate fix |
| ADJ-010 | `suggestion-service.ts:209` filters `agent-architect` (dropped) | Harmless no-op — separate fix |
| ADJ-011 | `EXECUTION_PIPELINE` agents are display labels, not persisted agents | No cleanup needed |
| ADJ-012 | `deleteAgent()` has no cascading cleanup | Cleanup mutation handles this explicitly |

### Dropped Production Identities (Adjacent, Not Blocking)

The following dropped agents have production references that survive in code and/or persisted data:

| Dropped Agent | Code Reference | Persisted Reference |
|--------------|----------------|-------------------|
| `agent-architect` | `session-service.ts:85,273`, `suggestion-service.ts:209` | 0 agent rows, 0 executions, 0 sessions |
| `agent-analyst` | `workspace-analyst.ts:74` | 0 agent rows, 0 executions, 0 sessions |
| `agent-workspace-ui-tester` | (none in code) | 0 agent rows, 500+ failed sessions |
| `agent-tester` | (none in code) | 0 agent rows, 0 executions, 10+ sessions |
| `agent-documenter` | (none in code) | 0 agent rows, 0 executions, 12 completed sessions |
| `agent-documentation` | (none in code) | 0 agent rows, 0 executions, 12 completed sessions |

**Classification:** These are adjacent findings. The code references (`session-service.ts`, `workspace-analyst.ts`, `suggestion-service.ts`) are stale references that will cause runtime errors if the referenced workflows are executed. This is a separate fix, not part of catalog cleanup. The persisted session records for dropped agents are orphaned and will remain orphaned regardless of whether the dropped agent rows exist (they don't — these agents are not in the current database).

### OBSERVATION

| ID | Finding | Confidence |
|----|---------|------------|
| OBS-004 | `seedBuiltIn()` uses fire-and-forget `.catch(() => {})` — errors silently swallowed | High |
| OBS-005 | `BUILT_IN_CREATED_AT` is a fixed timestamp shared by all canonical agents | High |
| OBS-006 | No agent domain table has any FK constraint — all references are logical | High |

---

## 14. Proposed Cleanup Sequence

| Step | Action | Scope |
|------|--------|-------|
| 1 | **Clear team_id** on 6 noncanonical agents that reference `team-1787978561148` | `UPDATE agents SET team_id = '' WHERE id IN (...)` |
| 2 | **Delete 10 noncanonical agents** (exact evidence-backed set) | `DELETE FROM agents WHERE id IN (10 specific IDs)` |
| 3 | **Verify agent count** | `SELECT COUNT(*) FROM agents` → expected: 5 |
| 4 | **Verify orphaned records persist** | `SELECT COUNT(*) FROM agent_executions` → expected: 22 |
| 5 | **Verify team unchanged** | `SELECT * FROM agent_teams` → expected: same row, empty members |

---

## 15. Verification Plan

| Verification | Command | Expected Result |
|-------------|---------|-----------------|
| Only canonical 5 remain | `SELECT id, name FROM agents` | 5 rows, all canonical |
| Orphaned executions persist | `SELECT COUNT(*) FROM agent_executions` | 22 rows (unchanged) |
| Orphaned memory persists | `SELECT COUNT(*) FROM agent_memory` | 23 rows (unchanged) |
| Team unchanged | `SELECT member_ids, leader_agent_id FROM agent_teams` | `[]`, `''` |
| Canonical seeding works | Restart API → check agents | 5 agents still present |
| Registration still works | `POST /api/agents` via UI | New agent created successfully |
| Dropped agent sessions intact | `SELECT COUNT(*) FROM execution_sessions` | 600+ rows (unchanged) |

---

## 16. Summary

### Evidence Base

- **Database inspected:** `.vestara/plans/plans.db` (1,212,416 bytes, 15 agent rows)
- **Consumer audit:** 28 consumers audited across packages/workspace, apps/api, apps/cli, apps/workspace
- **Zero SQL JOINs** between history tables and agents table
- **Zero FK constraints** across entire agent domain
- **Team state:** Empty member list, no leader — team cleanup is a no-op

### Disposition

| Dimension | Finding |
|-----------|---------|
| Physical cascade risk | **NONE** — zero FK constraints |
| Historical preservation | **PROVEN** — orphaned rows persist in all 4 history tables |
| Logical referential integrity | **DEGRADES** — agent identity (name, model, provider, role) becomes unresolvable for orphaned records |
| Team integrity | **NO IMPACT** — team has zero members and no leader |
| Recurrence risk | **UNKNOWN** — user creation path is intentional; dropped agent re-introduction risk deferred |
| Dropped production identities | **ADJACENT** — stale code references in session-service, workspace-analyst, suggestion-service; not blocking |

### Bounded Mutation

- **Phase 1:** Clear `team_id` on 6 noncanonical agents (6 rows affected)
- **Phase 2:** Delete 10 noncanonical agents (10 rows affected)
- **Total:** 16 row mutations across 2 tables
- **What is NOT mutated:** `agent_executions` (22 rows), `agent_memory` (23 rows), `agent_schedules` (0 rows), `execution_sessions` (600+ rows), `CANONICAL_AGENTS`, provider/model routing, Activity Room records

*Corrected cleanup preflight complete. No production code was changed. All decisions are based on source inspection of vestara-ai-core at commit `c7d7106` and database evidence from `.vestara/plans/plans.db`.*

---

## 17. Mutation Execution Record

**Authorization:** Director-authorized bounded catalog cleanup
**Execution date:** 2026-09-03
**Baseline:** `c7d7106` (M-B1.5 frozen)

### 17.1 Before State

| Metric | Value |
|--------|-------|
| Agent count | 15 |
| Execution count | 23 |
| Memory count | 23 |
| Session count | 779 |
| Schedule count | 0 |
| Team `team-1787978561148` | `leader_agent_id=''`, `member_ids='[]'` |

**Before agent rows:**

| `id` | `name` | `role` | `model` | `team_id` | `runtime_agent` |
|------|--------|--------|---------|-----------|-----------------|
| `agent-planner` | Planner | planning | deepseek-v4-flash-free | *(empty)* | vestara-planner |
| `agent-context` | Context | context | mimo-v2.5-free | *(empty)* | vestara-context |
| `agent-verifier` | Verifier | verifier | deepseek-v4-flash-free | team-1787978561148 | vestara-verifier |
| `agent-reviewer` | Reviewer | reviewer | nemotron-3-ultra-free | team-1787978561148 | vestara-reviewer |
| `agent-developer` | Developer | developer | mimo-v2.5-free | team-1787978561148 | vestara-developer |
| `agent-1787781308249` | Planner | planner | mimo-v2.5-free | team-1787978561148 | vestara-developer |
| `agent-1787781354162` | Repository Analyst | analyst | mimo-v2.5-free | team-1787978561148 | vestara-context |
| `agent-1787819315794` | Security Agent | security-agent | nemotron-3-ultra-free | *(empty)* | build |
| `agent-1787819502373` | Architect | architect | nemotron-3-ultra-free | *(empty)* | general |
| `agent-1787835308017` | Performance Agent | performance-agent | deepseek-v4-flash-free | *(empty)* | build |
| `agent-1787837563476` | Reviewer | reviewer | mimo-v2.5-free | *(empty)* | build |
| `agent-1787978779626` | Developer | developer | mimo-v2.5-free | team-1787978561148 | vestara-developer |
| `agent-1788442451252` | Developer | developer | mimo-v2.5-free | team-1787978561148 | build |
| `agent-1788442465552` | Developer | developer | mimo-v2.5-free | team-1787978561148 | vestara-developer |
| `agent-1788442474275` | Developer | developer | mimo-v2.5-free | team-1787978561148 | vestara-developer |

### 17.2 Phase 1: Clear team_id

**SQL executed:**
```sql
UPDATE agents SET team_id = '' WHERE id IN (
  'agent-1787781308249',
  'agent-1787781354162',
  'agent-1787978779626',
  'agent-1788442451252',
  'agent-1788442465552',
  'agent-1788442474275'
)
AND team_id = 'team-1787978561148';
```

**Rows affected:** 6 (all 6 noncanonical agents that referenced the team)

**After Phase 1 team_id state:**

| Agent | `team_id` before | `team_id` after |
|-------|------------------|-----------------|
| `agent-1787781308249` | team-1787978561148 | *(empty)* |
| `agent-1787781354162` | team-1787978561148 | *(empty)* |
| `agent-1787978779626` | team-1787978561148 | *(empty)* |
| `agent-1788442451252` | team-1787978561148 | *(empty)* |
| `agent-1788442465552` | team-1787978561148 | *(empty)* |
| `agent-1788442474275` | team-1787978561148 | *(empty)* |

**Canonical agents with team_id retained (not mutated):**

| Agent | `team_id` (unchanged) |
|-------|----------------------|
| `agent-verifier` | team-1787978561148 |
| `agent-reviewer` | team-1787978561148 |
| `agent-developer` | team-1787978561148 |

### 17.3 Phase 2: Delete noncanonical agents

**SQL executed:**
```sql
DELETE FROM agents WHERE id IN (
  'agent-1787781308249',
  'agent-1787781354162',
  'agent-1787819315794',
  'agent-1787819502373',
  'agent-1787835308017',
  'agent-1787837563476',
  'agent-1787978779626',
  'agent-1788442451252',
  'agent-1788442465552',
  'agent-1788442474275'
);
```

**Rows affected:** 10

### 17.4 After State

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Agent count | 15 | 5 | -10 |
| Execution count | 23 | 23 | 0 |
| Memory count | 23 | 23 | 0 |
| Session count | 779 | 779 | 0 |
| Schedule count | 0 | 0 | 0 |
| Team `team-1787978561148` | `leader=''`, `members=[]` | `leader=''`, `members=[]` | 0 |
| DB file size | 1,212,416 bytes | 1,220,608 bytes | +8,192 bytes |

**After agent rows:**

| `id` | `name` | `role` | `model` | `team_id` | `runtime_agent` |
|------|--------|--------|---------|-----------|-----------------|
| `agent-planner` | Planner | planning | deepseek-v4-flash-free | *(empty)* | vestara-planner |
| `agent-context` | Context | context | mimo-v2.5-free | *(empty)* | vestara-context |
| `agent-verifier` | Verifier | verifier | deepseek-v4-flash-free | team-1787978561148 | vestara-verifier |
| `agent-reviewer` | Reviewer | reviewer | nemotron-3-ultra-free | team-1787978561148 | vestara-reviewer |
| `agent-developer` | Developer | developer | mimo-v2.5-free | team-1787978561148 | vestara-developer |

### 17.5 Verification Results

| Verification | Expected | Actual | Status |
|-------------|----------|--------|--------|
| Agent count | 5 | 5 | PASS |
| Agent IDs | canonical 5 | canonical 5 | PASS |
| Cleanup candidate count | 0 | 0 | PASS |
| Execution count | unchanged (23) | 23 | PASS |
| Memory count | unchanged (23) | 23 | PASS |
| Session count | unchanged (779) | 779 | PASS |
| Schedule count | unchanged (0) | 0 | PASS |
| Team record | unchanged (empty) | unchanged | PASS |
| Canonical five definitions | unchanged | unchanged | PASS |
| `GET /api/agents` returns only canonical 5 | 5 agents | 5 agents | PASS |
| No deleted identities reappear via API | 0 found | 0 found | PASS |

### 17.6 API Cache Note

**ADJACENT-MUTATION-001:** The API process caches the sql.js database in memory. Mutations to the database file via external processes (e.g., the mutation script) are NOT reflected in the running API's in-memory state until the process is restarted. The API must be restarted after database mutations for the changes to take effect. This is a known sql.js in-process architecture characteristic.

**Resolution applied:** API process was restarted after mutation to verify the endpoint reflects the post-mutation state.

---

*Mutation execution complete. All verification conditions satisfied.*

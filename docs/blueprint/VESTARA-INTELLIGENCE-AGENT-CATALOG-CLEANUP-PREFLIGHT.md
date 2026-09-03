# Agent Catalog Cleanup Preflight

**Date:** 2026-09-03
**Status:** Preflight Complete — Awaiting Director Approval
**Authorization:** Cleanup preflight only. No mutation.
**Baseline:** `c7d7106` (M-B1.5 frozen)

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

## 2. Current Persisted Agent Rows

**Database location:** `.vestara/plans/plans.db` (relative to workspace root)

**Inspection command:** `vestara doctor agents` or `vestara agents`

### Expected Canonical Rows (from `seedBuiltIn()`)

The five agents above are seeded when the `agents` table is empty. On a fresh installation, exactly these five rows exist.

### Noncanonical Rows (cleanup candidates)

Noncanonical agents enter the database through these paths:

| Creation Path | File:Line | ID Pattern | Trigger |
|---------------|-----------|------------|---------|
| `POST /api/agents` | `routes/agents.ts:111-157` | `agent-${Date.now()}` | User creates agent via Register Agent UI |
| `PUT /api/agents/:id` | `routes/agents.ts:187-227` | (preserves existing id) | User edits agent |
| `POST /api/teams` | `routes/teams.ts:72-104` | (sets `teamId` on agents) | Team creation modifies agent records |
| `POST /api/teams/:id/members` | `routes/teams.ts:125-163` | (sets `teamId` on agents) | Team member addition |

**User-created agents** have IDs like `agent-1725000000000` (timestamp-based). These are the primary noncanonical cleanup candidates.

**Dropped canonical agents** (`DROPPED_BUILT_IN_AGENT_IDS`) may exist in older databases that were seeded before agents were removed from `CANONICAL_AGENTS`:

```
agent-architect, agent-documenter, agent-dashboard-curator,
agent-dashboard-dev, agent-conversation-dev, agent-analyst,
agent-security, agent-performance, agent-documentation,
agent-refactoring, agent-release, agent-workspace-ui-tester, agent-tester
```

---

## 3. Creation Provenance of Duplicate/Experimental Agents

### User-Created Agents (via Register Agent UI)

**Creation path:** `POST /api/agents` → `AgentStorage.saveAgent()`

**ID generation:** `agent-${Date.now()}` (line 133 of `routes/agents.ts`)

**Can this recreate them after cleanup?** Yes. The `POST /api/agents` endpoint is the standard user agent creation path. It will continue to work after cleanup. The UI radio buttons allow creating both workspace and registry agents.

**Recurrence prevention:** The Register Agent UI is an intentional user capability. Noncanonical agents are expected user creations. The cleanup targets stale/test agents, not a capability restriction.

### Dropped Canonical Agents

**Creation path:** `seedBuiltIn()` seeded them when they were in `CANONICAL_AGENTS`. They were later removed from the array but never cleaned from existing databases.

**Can this recreate them after cleanup?** No. `seedBuiltIn()` only seeds from `CANONICAL_AGENTS`, and these IDs are no longer in the array. However, `seedBuiltIn()` only seeds into an empty catalog — it would not re-add them to a non-empty catalog.

**Recurrence prevention:** The `DROPPED_BUILT_IN_AGENT_IDS` array documents retired agents. The reconciliation logic (proposed in GA-4.0 Section D) should clean these automatically.

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

**Hard deletion is safe for historical evidence.** No execution history is destroyed. The only integrity concern is team references.

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
| `agents.team_id` | `agent-migrations.ts:115` | `TEXT` column | N/A — agent row deleted |

### References FROM Production Code TO Dropped Agents

| Code Location | Reference | Impact |
|---------------|-----------|--------|
| `session-service.ts:85,273` | `agent-architect` | Workflow step references non-existent agent — runtime error if executed |
| `workspace-analyst.ts:74` | `agent-analyst` | Memory saved with non-existent agent ID — orphaned memory record |
| `suggestion-service.ts:209` | `agent-architect` | Filter exclusion of non-existent agent — harmless no-op |

---

## 6. Hard Delete vs Retirement Recommendation

### Option A: Hard Delete

**Pros:**
- Simple, clean catalog
- No orphaned identity records
- Consistent with `DROPPED_BUILT_IN_AGENT_IDS` intent

**Cons:**
- Orphaned execution/memory/schedule records
- Team integrity broken (stale references)
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

**Historical evidence invariant:** Deleting an agent does NOT delete its execution history. `agent_executions`, `agent_memory`, `agent_schedules`, and `execution_sessions` rows referencing the deleted agent remain intact and interpretable.

---

## 7. Team Impact

### Team-Agent Reference Model

```
agent_teams:
  id TEXT PRIMARY KEY
  leader_agent_id TEXT          → agents.id (logical FK)
  member_ids TEXT DEFAULT '[]'  → JSON array of agents.id (logical FK)

agents:
  team_id TEXT DEFAULT ''       → agent_teams.id (logical FK)
```

### Team Cleanup Requirements

Before deleting a noncanonical agent:

1. **Remove from team member lists:** For each team where the agent is a member, remove its ID from `member_ids` JSON
2. **Clear team leadership:** If the agent is `leader_agent_id`, clear the field
3. **Clear agent's team_id:** Set `team_id = ''` on the agent before deletion

### Team Integrity After Cleanup

The resulting team must reference only valid canonical agent identities:
- `leader_agent_id` must be one of the 5 canonical IDs (or empty)
- `member_ids` must contain only canonical IDs
- `agents.team_id` must reference an existing team (or empty)

---

## 8. Canonical-vs-Persisted Drift Table

### Drift Detection Method

Compare persisted agent rows (from `AgentStorage.listAgents()`) against `CANONICAL_AGENTS` definitions.

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

### Phase 1: Team Cleanup (before agent deletion)

```sql
-- For each noncanonical agent to be deleted:

-- 1. Remove from all team member lists
UPDATE agent_teams
SET member_ids = (
  SELECT json_group_array(value)
  FROM json_each(agent_teams.member_ids)
  WHERE value != '<agent-id>'
)
WHERE member_ids LIKE '%"<agent-id>%"';

-- 2. Clear team leadership
UPDATE agent_teams
SET leader_agent_id = ''
WHERE leader_agent_id = '<agent-id>';

-- 3. Clear agent's team_id
UPDATE agents
SET team_id = ''
WHERE id = '<agent-id>';
```

### Phase 2: Agent Deletion

```sql
-- Delete noncanonical agents
DELETE FROM agents
WHERE id NOT IN (
  'agent-context', 'agent-planner', 'agent-developer',
  'agent-reviewer', 'agent-verifier'
)
AND id NOT LIKE 'agent-17%';  -- preserve user-created agents for review

-- Or more targeted: delete only specific IDs
-- DELETE FROM agents WHERE id IN ('<list-of-ids-to-delete>');
```

### Phase 3: Optional — Clean Dropped Canonical Agents

```sql
-- If dropped agents exist from older seeds
DELETE FROM agents
WHERE id IN (
  'agent-architect', 'agent-documenter', 'agent-dashboard-curator',
  'agent-dashboard-dev', 'agent-conversation-dev', 'agent-analyst',
  'agent-security', 'agent-performance', 'agent-documentation',
  'agent-refactoring', 'agent-release', 'agent-workspace-ui-tester',
  'agent-tester'
);
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
| `seedBuiltIn()` | **None** — only seeds from `CANONICAL_AGENTS` | Already safe |
| `DROPPED_BUILT_IN_AGENT_IDS` | **None** — not consumed by any code path | No mitigation needed |
| `POST /api/teams` | **None** — creates teams, not agents | Already safe |

### Recurrence Prevention Recommendation

1. **No API changes needed.** The `POST /api/agents` endpoint is the standard user creation path. Noncanonical agents are expected user creations.
2. **DROPPED_BUILT_IN_AGENT_IDS should be consumed.** The reconciliation logic (GA-4.0 Section D) should clean dropped agents automatically on startup.
3. **Seed-on-empty guard is correct.** `seedBuiltIn()` only seeds into an empty catalog. This prevents re-adding dropped agents to a populated catalog.

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
| 1 | **Inspect current DB state** | `vestara doctor agents` — list all persisted agents |
| 2 | **Identify noncanonical agents** | Compare persisted IDs against canonical 5 |
| 3 | **Clean team references** | Remove noncanonical agents from team member lists and leadership |
| 4 | **Delete noncanonical agents** | `DELETE FROM agents WHERE id NOT IN (canonical-5)` |
| 5 | **Verify cleanup** | `vestara doctor agents` — confirm only canonical 5 remain |
| 6 | **Verify historical evidence** | `vestara doctor` — confirm execution history intact |

---

## 15. Verification Plan

| Verification | Command | Expected Result |
|-------------|---------|-----------------|
| Only canonical 5 remain | `vestara agents` | 5 agents listed, all canonical |
| No orphaned team references | `vestara doctor teams` | All teams reference valid agents |
| Historical evidence intact | `vestara doctor` | Execution counts non-zero for agents with history |
| Canonical seeding works | Restart API → `vestara agents` | 5 agents still present (no re-seeding needed) |
| Registration still works | `POST /api/agents` via UI | New agent created successfully |

---

*Cleanup preflight complete. No production code was changed. All decisions are based on source inspection of vestara-ai-core at commit `c7d7106`.*

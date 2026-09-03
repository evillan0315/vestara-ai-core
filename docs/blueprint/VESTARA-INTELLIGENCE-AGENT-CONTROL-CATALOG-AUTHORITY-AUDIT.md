# Agent Control Catalog Authority Audit

**Date:** 2026-09-03
**Status:** Audit Complete — Awaiting Director Review
**Authorization:** Audit only. No mutation.
**Baseline:** `f57df71` (provenance audit frozen)

---

## 1. Agent Control Data-Source Call Graph

```
[packages/workspace/src/agents.registry.ts]
  CANONICAL_AGENTS (5 entries: context, developer, planning, reviewer, verifier)
  DROPPED_BUILT_IN_AGENT_IDS (13 historical IDs)
       │
       ▼
[packages/workspace/src/agent-storage.ts]
  AgentStorage.seedBuiltIn() ─── seeds CANONICAL_AGENTS into plans.db on first run
  AgentStorage.listAgents()  ─── SELECT * FROM agents
       │
       ▼
[apps/api/src/routes/agents.ts]
  GET /api/agents
    1. ctx.agents.listAgents()           ── reads from DB
    2. runtimeSyncedAgents(ctx, stored)   ── annotates with OpenCode runtime twin
    3. enrich with stats
    4. Returns { agents: [...], executions: [...] }
       │
       ▼
[apps/workspace/src/pages/Agents.tsx]
  load() → apiFetch('/api/agents') → setAgents(data.agents)
       │
       ▼
  allAgentSlots = useMemo:
    For each of the 16 ALL_AGENT_SLOTS:
      find matching agent in `agents` by role
        FOUND    → use the real agent object (status: 'active')
        NOT FOUND → create synthetic placeholder (status: 'unregistered')
       │
       ▼
  filteredAgents = allAgentSlots (filtered/searched/sorted)
       │
       ▼
[apps/workspace/src/pages/Agents/AgentCategoryList.tsx]
  Groups filteredAgents by ROLE_CATEGORIES into 5 categories
  Renders AgentCard for each
       │
       ▼
[apps/workspace/src/pages/Agents/AgentCard.tsx]
  isRegistered = agent.status !== 'unregistered'
  Shows "Register" button for unregistered, "Edit" for registered
       │
       ▼  (user clicks "Register")
[apps/workspace/src/pages/Agents.tsx]
  openEditAgent() ─── pre-fills with slot defaults from ALL_AGENT_SLOTS
       │
       ▼
[apps/workspace/src/pages/Agents/AgentRegistryModal.tsx]
  ROLES (16 hardcoded role strings) for dropdown
  Step 1: name, role, agentType, description, team, color
  Step 2: provider, model, runtimeAgent (workspace) or registrySource (registry)
  onSubmit → onSave(partialAgent)
       │
       ▼
[apps/workspace/src/pages/Agents.tsx]
  saveAgent() → POST /api/agents → load()
       │
       ▼
[apps/api/src/routes/agents.ts]
  POST /api/agents handler:
    normalizedId = id || `agent-${Date.now()}`
    ctx.agents.saveAgent(agent)
    logAudit(ctx.audit, ..., AGENT_CREATE, ...)
```

---

## 2. Exact Source of Every Displayed Registerable Agent

### 2.1 The 16 UI Slots

**Source:** `apps/workspace/src/pages/Agents/constants.ts:67-186` — hardcoded `ALL_AGENT_SLOTS` array.

| # | Role | Default Name | Category | Source Type |
|---|------|-------------|----------|-------------|
| 1 | `architect` | Architect | Development | Frontend constant |
| 2 | `developer` | Developer | Development | Frontend constant |
| 3 | `verifier` | Verifier | Verification | Frontend constant |
| 4 | `reviewer` | Reviewer | Verification | Frontend constant |
| 5 | `tester` | Tester | Verification | Frontend constant |
| 6 | `documenter` | Documenter | Specialized | Frontend constant |
| 7 | `analyst` | Repository Analyst | Analysis | Frontend constant |
| 8 | `security-agent` | Security Agent | Verification | Frontend constant |
| 9 | `performance-agent` | Performance Agent | Analysis | Frontend constant |
| 10 | `documentation-agent` | Documentation Agent | Analysis | Frontend constant |
| 11 | `refactoring-agent` | Refactoring Agent | Infrastructure | Frontend constant |
| 12 | `release-agent` | Release Agent | Infrastructure | Frontend constant |
| 13 | `conversation` | Conversation Developer | Specialized | Frontend constant |
| 14 | `planner` | Planner | Development | Frontend constant |
| 15 | `frontend` | Dashboard Developer | Development | Frontend constant |
| 16 | `dashboard-curator` | Dashboard Curator | Specialized | Frontend constant |

### 2.2 No External Marketplace or Registry

The `AgentRegistryModal` has a "Registry Agent" type with a freeform "Registry Source" text input (e.g., `@vestara/agent-pack`), but there is **no live marketplace API** being queried. The role list is entirely hardcoded. The registry concept is label-only.

---

## 3. Registered vs. Unregistered Determination Logic

**File:** `apps/workspace/src/pages/Agents.tsx:64-83`

```typescript
const allAgentSlots = useMemo<Agent[]>(() => {
  return ALL_AGENT_SLOTS.map((slot) => {
    const registered = agents.find((a) => a.role === slot.role);
    return (
      registered ||
      ({
        id: `slot-${slot.role}`,
        name: slot.defaultName,
        role: slot.role,
        description: 'Not registered — add via Agent Registry',
        capabilities: [],
        permissions: [],
        status: 'unregistered',
        color: slot.color,
        agentType: 'workspace',
        createdAt: '',
      } as Agent)
    );
  });
}, [agents]);
```

**Key behavior:** The `find()` returns the **first** matching agent by `role`. If multiple agents share the same role, only the first (oldest by `created_at`) is shown as "registered." The rest are invisible.

**Registered** = at least one agent in the DB has `a.role === slot.role`
**Unregistered** = no agent in the DB has a matching role

---

## 4. Template → Persisted-Agent Registration Transformation

### 4.1 Pre-fill (openEditAgent)

**File:** `apps/workspace/src/pages/Agents.tsx:266-282`

For unregistered slots, the modal is pre-populated:
```typescript
{
  ...agent,                          // synthetic placeholder fields
  name: slot?.defaultName || agent.name,
  description: slot?.defaultDescription || '',
  capabilities: slot?.defaultCapabilities || [],
  color: slot?.color || agent.color,
  runtimeAgent: 'build',             // hardcoded default
}
```

### 4.2 Submit (handleSubmit → saveAgent → POST /api/agents)

**File:** `apps/workspace/src/pages/Agents/AgentRegistryModal.tsx:166-181`

The user's form input is sent as-is. No ID is supplied by the client.

### 4.3 Server-Side ID Generation

**File:** `apps/api/src/routes/agents.ts:124`
```typescript
const normalizedId = id || `agent-${Date.now()}`;
```

Since the UI never sends an `id` field, every registration produces `agent-${Date.now()}`.

### 4.4 Persistence

**File:** `packages/workspace/src/agent-storage.ts:68`
```sql
INSERT OR REPLACE INTO agents (id, name, role, ...) VALUES (?, ?, ?, ...)
```

The agent is persisted with the timestamp ID and the user-supplied role.

### 4.5 Stable Identity Behavior

**The template identity is NOT preserved.** The registration transforms:

```
Template:     { role: 'developer', defaultName: 'Developer', ... }
                ↓ POST /api/agents
Persisted:    { id: 'agent-1788442451252', role: 'developer', name: 'Developer', ... }
```

The `role` field is the only link between template and persisted agent. The `id` is a fresh timestamp. Repeated registration of the same template produces multiple persisted agents with different IDs but the same role.

---

## 5. Canonical Developer Duplication Explanation

### 5.1 The Three Identity Layers

The system conflates three distinct identity concepts:

| Layer | Example | Source | Authority |
|-------|---------|--------|-----------|
| **Canonical identity** | `agent-developer` (id), `developer` (role) | `CANONICAL_AGENTS` in `agents.registry.ts` | Backend registry |
| **Template identity** | `developer` (role), `Developer` (defaultName) | `ALL_AGENT_SLOTS` in `constants.ts` | Frontend constant |
| **Persisted instance identity** | `agent-1788442451252` (id), `developer` (role) | `POST /api/agents` → `agent-${Date.now()}` | User submission |

### 5.2 Why Registration Produces Duplicates

When the user clicks "Register" on the Developer slot:

1. The UI sees the slot is `unregistered` (or registered — either way, the Register/Edit button is available)
2. The modal pre-fills with template defaults
3. The user submits → POST /api/agents with `role: 'developer'`
4. The server generates `agent-1788442451252` and persists it
5. Now two agents have `role: 'developer'`: `agent-developer` (canonical) and `agent-1788442451252` (user-created)
6. The UI's `find()` returns `agent-developer` (first match), so the slot shows as "registered"
7. The user-created `agent-1788442451252` is **invisible** in the UI grid

### 5.3 Why This Is Not Detected

- The `find()` match is by `role`, not by `id`
- Multiple agents with the same role are silently allowed
- The UI only shows the first match per role
- No uniqueness constraint exists on the `(role)` column
- The user sees the slot as "registered" after the first registration, so they may not realize duplicates were created

### 5.4 The Developer Case Specifically

Before the Sep 3 session:
- `agent-developer` (canonical) existed with `role: 'developer'`
- The Developer slot showed as "registered"

The user clicked "Register" on the Developer slot 3 times (per provenance audit f57df71):
- Each click created `agent-1788442451252`, `agent-1788442465552`, `agent-1788442474275` with `role: 'developer'`
- All three were invisible because `agent-developer` was already the first `find()` match
- The user likely didn't see their registration reflected (because the slot was already "registered") and clicked again

---

## 6. Competing-Authority Analysis

### 6.1 The Five Sources

| Source | Location | Authority | Entries |
|--------|----------|-----------|---------|
| `CANONICAL_AGENTS` | `packages/workspace/src/agents.registry.ts` | Backend registry (single source of truth per AGENTS.md) | 5 agents |
| `agents` table | `.vestara/plans/plans.db` | Persisted runtime state | 5 agents (post-cleanup) |
| `ALL_AGENT_SLOTS` | `apps/workspace/src/pages/Agents/constants.ts` | Frontend UI grid definition | 16 slots |
| `DROPPED_BUILT_IN_AGENT_IDS` | `packages/workspace/src/agents.registry.ts` | Historical retirement list | 13 IDs |
| `AgentRegistryModal.ROLES` | `apps/workspace/src/pages/Agents/AgentRegistryModal.tsx` | Modal dropdown (hardcoded) | 16 roles |

### 6.2 Authority Conflicts

| Conflict | Severity | Description |
|----------|----------|-------------|
| UI has 16 slots, backend has 5 agents | **HIGH** | 11 UI slots have no backend canonical agent |
| Role mismatch: `context` vs no slot | **MEDIUM** | `agent-context` (role `context`) has no UI slot — invisible |
| Role mismatch: `planning` vs `planner` | **MEDIUM** | `agent-planner` (role `planning`) doesn't match slot `planner` — invisible |
| Template creates timestamp ID | **HIGH** | Registration produces `agent-${Date.now()}`, not `agent-${role}` |
| No role uniqueness | **HIGH** | Multiple agents with same role allowed, only first visible |
| DROPPED IDs match UI slots | **LOW** | 11 of 13 dropped IDs correspond to UI slot roles — UI resurrects retired concepts |
| Registry Agent type is label-only | **LOW** | Marketplace concept exists in UI but has no backend implementation |

### 6.3 Which Source Currently Determines What the User Sees

**`ALL_AGENT_SLOTS` (frontend constant)** determines the complete set of 16 visible agent entries. The backend only determines whether each slot is "registered" or "unregistered." The user cannot see any agent whose role is not in `ALL_AGENT_SLOTS`, and cannot see any slot that is not in `ALL_AGENT_SLOTS`.

---

## 7. Classification of Legacy/Noncanonical Entries

### 7.1 All 16 UI Slots Classified

| Role | Default Name | Classification | Evidence |
|------|-------------|----------------|----------|
| `architect` | Architect | **Legacy built-in agent** | `agent-architect` in `DROPPED_BUILT_IN_AGENT_IDS` |
| `developer` | Developer | **Canonical agent** | `agent-developer` in `CANONICAL_AGENTS` (role matches) |
| `verifier` | Verifier | **Canonical agent** | `agent-verifier` in `CANONICAL_AGENTS` (role matches) |
| `reviewer` | Reviewer | **Canonical agent** | `agent-reviewer` in `CANONICAL_AGENTS` (role matches) |
| `tester` | Tester | **Legacy built-in agent** | `agent-tester` in `DROPPED_BUILT_IN_AGENT_IDS` |
| `documenter` | Documenter | **Legacy built-in agent** | `agent-documenter` in `DROPPED_BUILT_IN_AGENT_IDS` |
| `analyst` | Repository Analyst | **Legacy built-in agent** | `agent-analyst` in `DROPPED_BUILT_IN_AGENT_IDS` |
| `security-agent` | Security Agent | **Legacy built-in agent** | `agent-security` in `DROPPED_BUILT_IN_AGENT_IDS` |
| `performance-agent` | Performance Agent | **Legacy built-in agent** | `agent-performance` in `DROPPED_BUILT_IN_AGENT_IDS` |
| `documentation-agent` | Documentation Agent | **Legacy built-in agent** | `agent-documentation` in `DROPPED_BUILT_IN_AGENT_IDS` |
| `refactoring-agent` | Refactoring Agent | **Legacy built-in agent** | `agent-refactoring` in `DROPPED_BUILT_IN_AGENT_IDS` |
| `release-agent` | Release Agent | **Legacy built-in agent** | `agent-release` in `DROPPED_BUILT_IN_AGENT_IDS` |
| `conversation` | Conversation Developer | **Legacy built-in agent** | `agent-conversation-dev` in `DROPPED_BUILT_IN_AGENT_IDS` |
| `planner` | Planner | **Stale frontend definition** | No canonical agent has role `planner`; `agent-planner` has role `planning` |
| `frontend` | Dashboard Developer | **Legacy built-in agent** | `agent-dashboard-dev` in `DROPPED_BUILT_IN_AGENT_IDS` |
| `dashboard-curator` | Dashboard Curator | **Legacy built-in agent** | `agent-dashboard-curator` in `DROPPED_BUILT_IN_AGENT_IDS` |

### 7.2 Summary Counts

| Classification | Count | Roles |
|---------------|-------|-------|
| Canonical agent | 3 | `developer`, `verifier`, `reviewer` |
| Legacy built-in agent | 11 | `architect`, `tester`, `documenter`, `analyst`, `security-agent`, `performance-agent`, `documentation-agent`, `refactoring-agent`, `release-agent`, `conversation`, `frontend`, `dashboard-curator` |
| Stale frontend definition | 1 | `planner` (role mismatch with canonical `planning`) |
| Canonical but no UI slot | 2 | `context`, `planning` (invisible in Agent Control) |

### 7.3 Not Classified As

- **Capability incorrectly modeled as agent:** Not applicable — all entries represent distinct functional roles
- **Marketplace/registry candidate:** Not applicable — no marketplace implementation exists
- **Test/demo fixture:** Not applicable — all entries are production UI definitions

---

## 8. Recommended Authoritative Catalog Architecture

### 8.1 Current State (Problematic)

```
Frontend:  ALL_AGENT_SLOTS (16 entries, hardcoded)
                ↕ role-based merge
Backend:   CANONICAL_AGENTS (5 entries) → plans.db agents table
                ↕ POST /api/agents
User:      agent-${Date.now()} (unbounded creation)
```

Three competing authorities, no uniqueness, role mismatch between frontend and backend.

### 8.2 Proposed Target Architecture

```
Engineering Agent Authority (backend-canonical)
├── Context        (role: context)
├── Planner        (role: planning)
├── Developer      (role: developer)
├── Reviewer       (role: reviewer)
└── Verifier       (role: verifier)

Specialized Behavior (capabilities/skills, not separate agents)
├── architecture analysis  → capability of Context/Planner
├── security analysis      → capability of Verifier
├── performance analysis   → capability of Verifier
├── testing                → capability of Verifier
├── documentation          → capability of Context
└── ... expressed as capabilities on canonical agents

Global Agent Authority (separate from Engineering)
├── Assistant              (role: assistant, GA-4 milestone)
└── future explicitly authorized identities

Extensible Agent Catalog (user/Marketplace)
└── future user-created agents with unique IDs and role uniqueness
```

### 8.3 Key Principles

1. **Single backend authority:** `CANONICAL_AGENTS` in `agents.registry.ts` is the sole source of truth for built-in agents
2. **Frontend derives from backend:** `ALL_AGENT_SLOTS` should be replaced with a dynamic list derived from `CANONICAL_AGENTS` + persisted user agents
3. **Role uniqueness:** Each `role` value should map to exactly one agent in the catalog
4. **Template identity = canonical identity:** Registering a "Developer" template should produce `agent-developer` (or reference the existing canonical), not `agent-${Date.now()}`
5. **Specialized behavior via capabilities:** Architecture analysis, security analysis, etc. should be capabilities on canonical agents, not separate agent identities

---

## 9. Minimum Future UI Recurrence Fix

When authorized (not part of this audit):

1. **Derive UI slots from backend:** Replace hardcoded `ALL_AGENT_SLOTS` with a dynamic list from `GET /api/agents` + canonical definitions
2. **Registration maps to canonical:** When user clicks "Register" on a Developer slot, the system should either:
   - Activate the existing canonical `agent-developer` (if disabled), or
   - Create an agent with `id: 'agent-developer'` (not timestamp)
3. **Role uniqueness constraint:** Prevent multiple agents with the same `role` value
4. **Hide invisible canonical agents:** Ensure `agent-context` and `agent-planner` are visible in the UI (add slots for `context` and `planner` roles, or remap their roles)
5. **Remove legacy slots:** Remove 11 UI slots that correspond to `DROPPED_BUILT_IN_AGENT_IDS` entries

---

## 10. BLOCKER / ADJACENT / OBSERVATION

### BLOCKER

None. This is an audit-only investigation.

### ADJACENT

| ID | Finding | Action |
|----|---------|--------|
| ADJ-CATALOG-001 | 11 of 16 UI slots correspond to `DROPPED_BUILT_IN_AGENT_IDS` — UI resurrects retired concepts | Frontend cleanup, not blocking |
| ADJ-CATALOG-002 | `agent-context` (role `context`) and `agent-planner` (role `planning`) have no UI slots — invisible in Agent Control | UI gap, not blocking |
| ADJ-CATALOG-003 | `ALL_AGENT_SLOTS` and `AgentRegistryModal.ROLES` are separate hardcoded definitions of the same 16 roles — divergence risk | Code quality, not blocking |
| ADJ-CATALOG-004 | Registration produces `agent-${Date.now()}` not `agent-${role}` — template identity not preserved | Design issue, not blocking |
| ADJ-CATALOG-005 | No role uniqueness constraint — multiple agents with same role allowed but only first visible | Data integrity, not blocking |
| ADJ-CATALOG-006 | `runtimeAgent` defaults to `'build'` for unregistered slots — may not be appropriate for all roles | Default value, not blocking |

### OBSERVATION

| ID | Finding | Confidence |
|----|---------|------------|
| OBS-CATALOG-001 | The Agent Control UI was designed for a 16-agent roster that no longer matches the 5-agent canonical set | HIGH |
| OBS-CATALOG-002 | The `planner` slot (role `planner`) does not match `agent-planner` (role `planning`) — typo or intentional? | HIGH |
| OBS-CATALOG-003 | The "Registry Agent" type with marketplace source is a UI-only concept with no backend implementation | HIGH |
| OBS-CATALOG-004 | Category grouping (Development, Verification, Analysis, Infrastructure, Specialized) was designed for 16 agents, not 5 | MEDIUM |

---

*Agent Control Catalog Authority audit complete. No production code was changed. All evidence is from source code inspection and audit log records.*

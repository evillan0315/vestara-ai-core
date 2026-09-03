# Agent Control Remediation — Acceptance Evidence

**Date:** 2026-09-03
**Status:** Acceptance Review — Awaiting Director Freeze
**Baseline:** `7b57e39` (catalog authority audit frozen)

---

## 1. Shared Type Authority

### 1.1 Type Comparison

| Type | Shared (`components/ui/agents/types.ts`) | Authoritative (`packages/workspace/src/types.ts`) | Relationship |
|------|------------------------------------------|--------------------------------------------------|-------------|
| `AgentIdentity` | `id, name, role, description?, color?, status?, provider?, model?, runtimeAgent?, capabilities?, teamId?, createdAt?` | `AgentDefinition`: `id, name, role (AgentRole), agentType, description?, capabilities (AgentCapability[]), permissions, provider?, model?, runtimeAgent?, mode?, opencodePermissions?, teamId?, color?, status, createdAt` | **Subset** — `AgentIdentity` omits `agentType`, `permissions`, `mode`, `opencodePermissions` (backend-only fields). All fields are presentation-relevant. |
| `AgentStats` | `total, completed, failed, running, avgDuration, successRate?` | `pages/Agents/types.ts` `AgentStats`: `total, completed, failed, running, avgDuration` | **Superset** — adds optional `successRate`. No conflict. |
| `AgentSaveData` | `name, role, description?, provider?, model?, runtimeAgent?, capabilities?, color?, teamId?` | `POST /api/agents` request body | **Form subset** — exactly the fields the form submits. No competing definition. |
| `TeamRef` | `id, name, description?` | `pages/Agents/types.ts` `Team`: `id, name, description, leaderAgentId?, memberIds?, sharedContext?, createdAt` | **Subset** — minimal reference for dropdown display. No conflict. |

### 1.2 Disposition

**`AgentIdentity`** is a **presentation/view contract** — it defines what the UI needs to render an agent, not what an agent IS. It omits backend-only fields (`agentType`, `permissions`, `mode`, `opencodePermissions`) that are not relevant to display.

**Recommendation:** `AgentIdentity` should remain a presentation contract. It should NOT be replaced by `AgentDefinition` because:
1. `AgentDefinition` uses strict union types (`AgentRole`, `AgentCapability`, `AgentPermission`) that would require the UI to handle all possible values
2. `AgentDefinition` includes backend-only fields (`mode`, `opencodePermissions`) irrelevant to display
3. `AgentIdentity` is intentionally loose to accommodate any role string from the API

**No competing definitions exist.** `AgentIdentity` is consumed only by shared UI primitives. The authoritative `AgentDefinition` remains in `packages/workspace/src/types.ts`.

---

## 2. No Hidden Role Catalog

### 2.1 `deriveCategory.ts` — Role-Specific Knowledge

```
CATEGORY_MAP contains 20 role strings mapped to 5 categories:
  Development: architect, developer, frontend, planner, planning, context
  Verification: verifier, reviewer, tester, security-agent, security
  Analysis: analyst, performance-agent, performance, documentation-agent, documentation, documenter
  Infrastructure: release-agent, release, refactoring-agent, refactoring, devops
  Specialized: (fallback for all unknown roles)
```

**Classification:** This is **bounded presentation logic** — it determines UI grouping only. It does NOT:
- Define what agents exist
- Restrict which roles are valid
- Prevent arbitrary roles from being registered
- Compete with backend agent identity authority

**The fallback path (`|| 'Specialized'`) handles any unknown role.** The map is an optimization for known roles, not an exhaustive catalog.

**Recommendation:** Remains as bounded presentation logic. If the backend later provides category metadata on `AgentDefinition`, this map should be replaced by that authoritative source. Until then, it is the minimal presentation-layer mapping needed for category grouping.

### 2.2 `agentColors.ts` — Role Color Fallback

```
ROLE_COLORS contains 16 role strings mapped to hex colors.
DEFAULT_COLOR = '#6b7280'
```

**Classification:** This is **presentation fallback logic** — it provides a deterministic color when the agent does not have an explicit `color` field. The `getAgentColor()` function prioritizes `agent.color` over the role-based fallback.

**The fallback path (`|| DEFAULT_COLOR`) handles any unknown role.** The map is a visual convenience, not an identity constraint.

**Recommendation:** Remains as presentation fallback. The color map could eventually be replaced by a backend-provided `color` field on every agent, but this is not required for correctness.

### 2.3 `AgentCategoryList.tsx` — No Role Catalog

The shared `AgentCategoryList` imports `deriveCategory` from `deriveCategory.ts`. It does not contain any hardcoded role strings. It uses `CATEGORY_ORDER` (5 category names) for display ordering only.

### 2.4 Summary

| File | Role-specific knowledge | Classification | Action |
|------|------------------------|----------------|--------|
| `deriveCategory.ts` | 20 role → category mappings | Bounded presentation logic | Remains; replace when backend provides category metadata |
| `agentColors.ts` | 16 role → color mappings | Presentation fallback | Remains; agents override via `color` field |
| `AgentCategoryList.tsx` | None (uses `deriveCategory`) | Display only | No action |

---

## 3. ProviderModelPicker Authority

### 3.1 Call Graph

```
ProviderModelPicker
    ↓ fetch (on open, cached 30s)
GET /api/providers
    ↓
apps/api/src/routes/providers.ts → GET /api/providers handler (line 302-320)
    ↓
runtimeProviderConfigs() → ctx.opencodeRuntime.listProviders()
    ↓
packages/opencode-runtime/src/client/opencode-http-client.ts → listProviders()
    ↓
HTTP GET to upstream OpenCode /providers endpoint
    ↓
packages/opencode-runtime/src/discovery-normalizers.ts → normalizeProviders()
    ↓
Returns: { source, providers: ManagedProvider[] }
```

### 3.2 Response Contract

```typescript
interface ProvidersResponse {
  source?: string;                    // 'opencode-runtime' | 'configuration'
  providers: ManagedProvider[];
}

interface ManagedProvider {
  id: string;                         // e.g. 'opencode'
  name: string;                       // e.g. 'OpenCode'
  enabled: boolean;
  status: string;                     // 'available' | 'degraded' | 'unavailable'
  credential?: { configured: boolean; source?: string };
  models: ManagedModel[];
}

interface ManagedModel {
  id: string;                         // e.g. 'mimo-v2.5-free'
  name: string;
  enabled: boolean;
  contextWindow: number;
  maxOutput: number;
  capabilities: Record<string, boolean>;
  pricing?: { inputPerMillionTokens: number; outputPerMillionTokens: number };
}
```

### 3.3 Previous Modal's API Usage vs. ProviderModelPicker

| Endpoint | Previous `AgentRegistryModal` | Previous `AgentDetailDrawer` | New `ProviderModelPicker` |
|----------|------------------------------|------------------------------|--------------------------|
| `GET /api/opencode/providers` | **YES** (runtime providers) | **YES** (runtime providers) | **NO** — not needed |
| `GET /api/providers` | **YES** (config fallback) | **NO** | **YES** — primary source |
| `GET /api/opencode/agents` | **YES** (runtime agent names) | **YES** (runtime agent names) | **NO** — not relevant to provider/model |

**What changed:** `ProviderModelPicker` uses ONLY `GET /api/providers` which already aggregates runtime-discovered + configured providers. The previous dual-fetch pattern (`/api/opencode/providers` + `/api/providers`) was redundant — `GET /api/providers` already prefers runtime when available (line 88-89 of `providers.ts`: `source === 'opencode-runtime'`).

**Why:** Single endpoint simplifies the data flow, eliminates the merge logic, and provides a unified view of all available providers/models.

### 3.4 Authority Boundary

**The picker is presentation only.** It:
- Displays available choices from `GET /api/providers`
- Calls `onChange(providerId, modelId)` to notify the parent form
- Does NOT persist selection (the parent form does via `PUT /api/agents/:id`)
- Does NOT override M4 routing resolution
- Does NOT compete with `GET /api/routing/catalog` or `GET /api/routing/selection`

**No hardcoded provider/model catalog.** The picker dynamically discovers providers/models from the runtime.

---

## 4. Registration Single-Submit Proof

### 4.1 Code Evidence

**`AgentEditor.tsx` lines 71-96:**
```typescript
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setTouched({ name: true, role: true });
  if (!validate()) return;

  setSubmitting(true);          // ← disables button immediately
  try {
    await onSave({...});        // ← single await, parent handles POST
  } catch {
    // Error handled by parent via onSave rejection
  } finally {
    setSubmitting(false);       // ← re-enables on success OR failure
  }
};
```

**`AgentEditor.tsx` line 230:**
```typescript
<button type="submit" disabled={submitting} className={buttonPrimaryClass}>
  {submitting ? 'Saving...' : isNew ? 'Create Agent' : 'Save Changes'}
</button>
```

### 4.2 Submission Lifecycle

| State | Button | Behavior |
|-------|--------|----------|
| `idle` | "Create Agent" / "Save Changes" | Enabled, clickable |
| `submitting` | "Saving..." | **Disabled**, cannot click |
| `success` | Back to idle | `onSave` resolved, parent closes modal |
| `failure` | Back to idle | `onSave` rejected, button re-enabled, user can retry |

### 4.3 Root Cause Closure

The provenance audit (`f57df71`) established that the root cause was "explicit human submission of the form 3 times over 23 seconds" because the UI had "zero submission feedback (no disabled state, no loading, modal stays open)."

**This is now fixed:**
1. `submitting` state is set to `true` before `onSave` is called
2. Button is `disabled={submitting}` — cannot be clicked during submission
3. Button text changes to "Saving..." — visual feedback
4. `submitting` is reset in `finally` — always returns to retryable state
5. Only one `await onSave()` call per submit — no race condition

### 4.4 HTTP-Level Evidence

**`Agents.tsx` `saveAgent` function:**
```typescript
const saveAgent = async (agent: Partial<Agent>) => {
  const clean = Object.fromEntries(Object.entries(agent).filter(([_, v]) => v !== undefined));
  const isNewRegistration = !editAgent?.id;
  if (editAgent && !isNewRegistration) {
    await apiFetch(`/api/agents/${editAgent.id}`, { method: 'PUT', body: JSON.stringify(clean) });
  } else {
    const created = await apiFetch<{ agent: Agent }>('/api/agents', { method: 'POST', body: JSON.stringify(clean) });
    if (created?.agent) setAgents((prev) => [...prev, created.agent]);
  }
  await load();
};
```

**One submit → one POST → one persisted agent.** The `submitting` guard prevents the second click from reaching this function.

---

## 5. Dynamic Identity Proof

### 5.1 Arbitrary Agent: `agent-banana` / `Banana Engineer` / `banana-engineer`

**Step 1: Registration**
- User types "Banana Engineer" in name field
- User types "banana-engineer" in role field (freeform input)
- `AgentEditor.handleSubmit()` calls `onSave({ name: 'Banana Engineer', role: 'banana-engineer', ... })`
- `saveAgent()` calls `POST /api/agents` with `{ name: 'Banana Engineer', role: 'banana-engineer', ... }`
- Backend creates `agent-<timestamp>` with `role: 'banana-engineer'`

**Step 2: Display**
- `load()` fetches `GET /api/agents` — returns the new agent
- `agents` state updates → `filteredAgents` recomputes → `AgentCategoryList` re-renders
- `deriveCategory('banana-engineer')` returns `'Specialized'` (fallback path)
- Agent appears in the "Specialized" category group

**Step 3: No frontend code change**
- No `banana-engineer` added to any constant, map, union, or switch
- `deriveCategory()` fallback handles it automatically
- `getAgentColor()` fallback handles it (returns `DEFAULT_COLOR = '#6b7280'`)

### 5.2 Canonical Agents: `agent-context` / `agent-planner`

**`agent-context`:**
- `deriveCategory('context')` → `'Development'` (direct map lookup, line 17)
- `getAgentColor({ role: 'context' })` → `'#6b7280'` (no entry in `ROLE_COLORS`, falls to `DEFAULT_COLOR`)
- Renders in "Development" category

**`agent-planner`:**
- `deriveCategory('planner')` → `'Development'` (direct map lookup, line 14)
- `getAgentColor({ role: 'planner'`) → `'#d946ef'` (direct map lookup in `ROLE_COLORS`)
- Renders in "Development" category with purple accent

### 5.3 Evidence

| Agent | `deriveCategory()` | Category | Color |
|-------|-------------------|----------|-------|
| `agent-developer` | `'Development'` | Development | `#3b82f6` (role fallback) |
| `agent-context` | `'Development'` | Development | `#6b7280` (default) |
| `agent-planner` | `'Development'` | Development | `#d946ef` (role fallback) |
| `agent-reviewer` | `'Verification'` | Verification | `#14b8a6` (role fallback) |
| `agent-verifier` | `'Verification'` | Verification | `#10b981` (role fallback) |
| `agent-banana` (hypothetical) | `'Specialized'` | Specialized | `#6b7280` (default) |

---

## 6. Activity Room Boundary

### 6.1 Zero Production Behavior Change

| Concern | Before | After | Changed? |
|---------|--------|-------|----------|
| Activity Room agent display | `AgentListItem` from telemetry | Same | **NO** |
| Activity Room agent sidebar | `ActivitySidebar` with participants | Same | **NO** |
| Activity Room agent detail | `AgentDetailDrawer` with inline form | Same | **NO** |
| Activity Room WebSocket events | Same | Same | **NO** |
| Activity Room API calls | Same endpoints | Same | **NO** |

### 6.2 Shared Primitives Decoupling Proof

```
components/ui/agents/ imports from:
  - react (external)
  - NO pages/Agents/ imports
  - NO pages/activity/ imports
  - NO TelemetryContext imports
  - NO ALL_AGENT_SLOTS imports

pages/Agents/ imports from:
  - components/ui/agents/ (correct direction)

pages/activity/ imports from:
  - NO components/ui/agents/ imports (yet — future consumption)
```

**Verification:** `grep "from.*pages/Agents\|from.*pages/activity" apps/workspace/src/components/ui/agents/` returns zero matches.

### 6.3 No Activity Room Catalog Authority

The shared primitives do NOT:
- Define which agents Activity Room should display
- Override Activity Room's telemetry-driven agent list
- Modify Activity Room's WebSocket event handling
- Change Activity Room's participant rendering

Activity Room remains free to consume shared primitives (e.g., `AgentEditor` inside `AgentDetailDrawer`) without acquiring agent catalog authority.

---

## 7. Return

### 7.1 Implementation Commits

Single working tree (not yet committed). All changes are in the current working tree.

### 7.2 Affected Files

**New files (11):**
| File | Lines | Purpose |
|------|-------|---------|
| `components/ui/agents/types.ts` | 65 | Shared types |
| `components/ui/agents/deriveCategory.ts` | 86 | Category derivation + presentation constants |
| `components/ui/agents/agentColors.ts` | 37 | Color resolution |
| `components/ui/agents/formClasses.ts` | 38 | Shared form CSS |
| `components/ui/agents/AgentStatusBadge.tsx` | 33 | Status badge |
| `components/ui/agents/AgentSummary.tsx` | 53 | Minimal identity display |
| `components/ui/agents/AgentCard.tsx` | 155 | Shared card with actions slot |
| `components/ui/agents/AgentEditor.tsx` | 237 | Shell-agnostic create/edit form |
| `components/ui/agents/ProviderModelPicker.tsx` | 345 | Searchable provider/model picker |
| `components/ui/agents/AgentCategoryList.tsx` | 162 | Category list with deriveCategory |
| `components/ui/agents/index.ts` | 48 | Barrel export |

**Modified files (6):**
| File | Change | Lines changed |
|------|--------|---------------|
| `pages/Agents.tsx` | Remove allAgentSlots, use agents directly | -25/+10 |
| `pages/Agents/constants.ts` | Remove ALL_AGENT_SLOTS, re-export from shared | -152/+25 |
| `pages/Agents/AgentCard.tsx` | Import from shared module | -2/+2 |
| `pages/Agents/AgentStatusBadge.tsx` | Re-export from shared | -13/+8 |
| `pages/Agents/AgentCategoryList.tsx` | Use deriveCategory from shared | -2/+2 |
| `pages/Agents/AgentRegistryModal.tsx` | Freeform role input, import shared form classes | -15/+20 |

### 7.3 Focused Tests

Build and lint pass:
- `pnpm build` — passes (98 workspace projects)
- `pnpm lint:check` — passes (1346 files, no errors)

### 7.4 Type-Authority Disposition

`AgentIdentity` is a **presentation/view contract** — a subset of `AgentDefinition` for display purposes. It does not compete with the authoritative `AgentDefinition` in `packages/workspace/src/types.ts`. No refactoring of domain types is required or proposed.

### 7.5 Remaining Role-Specific Presentation Knowledge

| Location | Knowledge | Classification | Replacement path |
|----------|-----------|----------------|------------------|
| `deriveCategory.ts` `CATEGORY_MAP` | 20 role → category mappings | Bounded presentation logic | Replace when backend provides `category` on `AgentDefinition` |
| `agentColors.ts` `ROLE_COLORS` | 16 role → color mappings | Presentation fallback | Replace when all agents have explicit `color` field |

### 7.6 Provider/Model Authority Call Graph

```
ProviderModelPicker → GET /api/providers → providers.ts → opencodeRuntime.listProviders()
                                                               ↓
                                                     OpenCodeHttpClient → upstream Zen
```

No hardcoded catalog. Single authoritative endpoint. Presentation only — does not override M4 routing.

### 7.7 Single-Submit Evidence

- `submitting` state disables button before `onSave` call
- Button text changes to "Saving..." during submission
- `finally` block always resets state
- Only one `await onSave()` per submit cycle
- Root cause from `f57df71` (3 submissions in 23 seconds) is closed

### 7.8 Genericity Evidence

- `deriveCategory('banana-engineer')` → `'Specialized'` (fallback)
- `getAgentColor({ role: 'banana-engineer' })` → `'#6b7280'` (default)
- `ProviderModelPicker` fetches from API — no hardcoded catalog
- `AgentEditor` accepts any role string via freeform input
- Shared primitives have zero imports from `pages/Agents/` or `pages/activity/`

### 7.9 Working-Tree Isolation

All changes are confined to:
- `apps/workspace/src/components/ui/agents/` (new directory)
- `apps/workspace/src/pages/Agents/` (existing directory)
- `apps/workspace/src/pages/Agents.tsx` (page root)

No changes to:
- Backend packages (`packages/*`)
- API routes (`apps/api/src/routes/*`)
- Activity Room (`pages/activity/*`)
- Types (`packages/workspace/src/types.ts`)
- Shared packages (`packages/shared/src/*`)

---

*Acceptance evidence complete. Awaiting Director freeze decision.*

---

## ADJACENT-AGENT-PRESENTATION-001

**Recorded:** 2026-09-03
**Status:** RECORDED — Do not remediate now

### Finding

The frontend currently contains role-specific category/color presentation mappings:

- `deriveCategory.ts` `CATEGORY_MAP`: 20 role → category strings
- `agentColors.ts` `ROLE_COLORS`: 16 role → hex color strings

### Constraints

1. Unknown roles must continue to work without source modification
2. These mappings must never determine whether an agent exists, can register, can execute, or is authorized
3. Do not expand these mappings automatically when new agents are introduced
4. Future authoritative/package presentation metadata may supersede these heuristics

### Classification

Bounded presentation heuristics — not agent authority. Accepted at freeze.

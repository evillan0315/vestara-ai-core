---
title: Agent Control Remediation Preflight — AMENDED
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Agent Control Remediation Preflight — AMENDED

**Date:** 2026-09-03
**Status:** Preflight Complete — Awaiting Director Approval
**Authorization:** Audit/design only. No mutation.
**Baseline:** `7b57e39` (catalog authority audit frozen)
**Amendment:** Director review `2026-09-03` — shared agent UI, searchable picker, composition boundary

---

## 1. Current State Analysis

### 1.1 The Competing Authority Problem

```
Frontend:  ALL_AGENT_SLOTS (16 entries, hardcoded in constants.ts)
                ↕ role-based merge
Backend:   CANONICAL_AGENTS (5 entries) → plans.db agents table
                ↕ POST /api/agents
User:      agent-${Date.now()} (unbounded creation)
```

Three sources define "what agents exist." The frontend constant is the dominant authority for what the user sees.

### 1.2 Current Data Flow

| Step | Source | Data |
|------|--------|------|
| Backend seeds | `CANONICAL_AGENTS` (5) | `agent-context`, `agent-developer`, `agent-planner`, `agent-reviewer`, `agent-verifier` |
| API returns | `GET /api/agents` | All persisted agents from `plans.db` |
| Frontend merges | `ALL_AGENT_SLOTS` (16) × `agents` (5) | 16 slots: 5 registered + 11 unregistered placeholders |
| User sees | `AgentCategoryList` | 16 agents grouped by hardcoded `ROLE_CATEGORIES` |
| User registers | `AgentRegistryModal` → `POST /api/agents` | Creates `agent-${Date.now()}` with user-supplied role |

### 1.3 Duplicated Patterns (Evidence of Reuse Need)

| Pattern | Locations | Count |
|---------|-----------|-------|
| Agent type definition | `AgentDetailDrawer.tsx`, `Agents/types.ts`, `lib/api.ts`, `TelemetryContext.tsx` | 4 |
| `fetchJSON` helper | `AgentDetailDrawer.tsx`, `AgentRegistryModal.tsx`, `lib/api.ts` | 3 |
| Provider/model dropdown | `AgentDetailDrawer.tsx`, `AgentRegistryModal.tsx` | 2 |
| Status/presence mapping | `AgentListItem.tsx`, `ActivitySidebar.tsx`, `M11CParticipantRail.tsx`, `ExecutionPulse.tsx`, `AgentStatusBadge.tsx` | 5 |
| Form CSS classes | `AgentRegistryModal.tsx`, `AgentDetailDrawer.tsx`, `TeamCreatorModal.tsx`, `NewProjectModal.tsx` | 4+ |

---

## 2. Domain vs. Presentation Metadata Classification

### 2.1 ALL_AGENT_SLOTS Fields

| Field | Domain or Presentation? | Evidence |
|-------|------------------------|----------|
| `role` | **Domain** — persisted to DB, used for matching | `agent.role` stored in `agents` table |
| `defaultName` | **Presentation** — UI display only | Never sent to backend |
| `color` | **Presentation** — visual only | Stored in DB but purely cosmetic |
| `defaultDescription` | **Presentation** — UI display only | Used for modal pre-fill |
| `defaultCapabilities` | **Presentation** — UI display only | Used for modal pre-fill |

### 2.2 Category System Fields

All `ROLE_CATEGORIES`, `CATEGORY_ORDER`, `CATEGORY_COLORS`, `CATEGORY_ICONS`, `CATEGORY_DESCRIPTIONS`, `ROLE_COLORS` are **presentation** — client-side only, not in DB or API.

### 2.3 Conclusion

**All ALL_AGENT_SLOTS data is presentation metadata.** The only domain field is `role`, which is already on `AgentDefinition`. The category system is entirely presentation-layer.

---

## 3. API Sufficiency Analysis

### 3.1 GET /api/agents Response

```json
{
  "agents": [{
    "id": "agent-developer",
    "name": "Developer",
    "role": "developer",
    "agentType": "workspace",
    "description": "Implement approved tasks.",
    "capabilities": ["code-generation", "refactoring", "bug-fixing"],
    "provider": "opencode",
    "model": "mimo-v2.5-free",
    "runtimeAgent": "vestara-developer",
    "teamId": "",
    "color": "#3b82f6",
    "status": "active",
    "createdAt": "2026-08-12T00:00:00.000Z",
    "stats": { "total": 12, "completed": 8, "failed": 4, "running": 0, "successRate": 0.67 }
  }],
  "executions": [...],
  "runtime": { "reachable": true }
}
```

### 3.2 Sufficiency Verdict

**GET /api/agents is sufficient** as the Agent Control source. No distinct catalog/query contract is required. The only missing field is `category`, which should be derived from `role` client-side.

---

## 4. Existing Shared UI Inventory

### 4.1 Shared UI Primitives (components/ui/)

| Component | File | Purpose |
|-----------|------|---------|
| `Drawer` | `components/ui/Drawer.tsx` | Resizable slide-over panel (left/right/bottom), z-[80], localStorage sizing |
| `VestaraModal` | `components/ui/VestaraModal.tsx` | Global modal shell with focus trap, z-50 |

### 4.2 Existing Agent Components (Agent Control — pages/Agents/)

| Component | Reuse Potential | Notes |
|-----------|-----------------|-------|
| `AgentCard` | **HIGH** | Display-only, expandable card with status, stats |
| `AgentCategoryList` | **MEDIUM** | Grouping logic is presentation |
| `AgentRegistryModal` | **MEDIUM** | Form content separable from modal shell |
| `AgentStatusBadge` | **HIGH** | Generic status display |
| `AgentFilters` | **LOW** | Agent Control-specific |
| `AgentControlHeader` | **LOW** | Agent Control-specific |

### 4.3 Existing Activity Room Agent Components (pages/activity/)

| Component | Reuse Potential | Notes |
|-----------|-----------------|-------|
| `AgentDetailDrawer` | **MEDIUM** | Provider/model editing separable |
| `AgentListItem` | **LOW** | Telemetry-specific |
| `ActivitySidebar` | **LOW** | Workflow-specific |

---

## 5. Proposed Reusable Boundaries

### 5.1 Design Principle

Extract only boundaries with **demonstrated reuse**. Shared primitives live in `components/ui/agents/` and are consumed by both Agent Control and Activity Room. They do not depend on either page's state.

### 5.2 Shared Agent Primitives

#### AgentSummary (display-only, read-only)

**Purpose:** Minimal agent identity display. Used in lists, sidebars, cards.

```typescript
interface AgentSummaryProps {
  agent: AgentIdentity;
  selected?: boolean;
  onSelect?: (agentId: string) => void;
}
```

#### AgentCard (extracted from pages/Agents/AgentCard.tsx)

**Purpose:** Expandable agent card with status, stats, and action slots.

```typescript
interface AgentCardProps {
  agent: AgentIdentity;
  stats?: AgentStats;
  team?: Team;
  isExpanded?: boolean;
  onToggle?: () => void;
  actions?: ReactNode;  // action slot for context-specific buttons
}
```

Replace hardcoded Run/Edit/More buttons with `actions` slot. Agent Control passes its own actions; Activity Room passes none.

#### AgentStatusBadge (extracted from pages/Agents/AgentStatusBadge.tsx)

```typescript
interface AgentStatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}
```

#### AgentEditor (form content, NOT shell)

**Purpose:** Agent create/edit form content. **Not coupled to modal or drawer.**

```typescript
interface AgentEditorProps {
  agent?: AgentIdentity;        // undefined = create mode
  teams?: Team[];
  roleSuggestions?: string[];   // derived from persisted agents
  onSave: (data: AgentSaveData) => Promise<void>;
  onCancel: () => void;
}
```

**Composition:** Same `AgentEditor` renders inside:
- `VestaraModal` in Agent Control (create/edit)
- `Drawer` in Activity Room (inspect/edit where authorized)
- Future: modal in Marketplace, drawer in Agent Builder

#### ProviderModelPicker (searchable, dynamic)

**Purpose:** Searchable provider/model selection. Replaces hardcoded `<select>` dropdowns.

```typescript
interface ProviderModelPickerProps {
  providerId: string;
  modelId: string;
  onChange: (providerId: string, modelId: string) => void;
  disabled?: boolean;
}
```

#### AgentCategoryList (extracted)

```typescript
interface AgentCategoryListProps {
  agents: AgentIdentity[];
  selectedAgentId?: string;
  onSelectAgent?: (agentId: string) => void;
  renderAgent?: (agent: AgentIdentity) => ReactNode;
}
```

Uses `deriveCategory()` instead of `ROLE_CATEGORIES`.

### 5.3 What Is NOT Extracted

| Component | Why Not |
|-----------|---------|
| `AgentFilters` | Agent Control-specific filtering. No demonstrated reuse. |
| `AgentControlHeader` | Agent Control-specific stats/actions. No demonstrated reuse. |
| `AgentListItem` | Activity Room-specific (telemetry state). No demonstrated reuse. |
| `ActivitySidebar` | Activity Room-specific (workflow participants). No demonstrated reuse. |

---

## 6. Searchable Provider/Model Picker

### 6.1 Data Source Call Graph

```
UI (ProviderModelPicker)
    ↓ fetch
GET /api/providers
    ↓ backend route
providers.ts → runtimeProviderConfigs() → ctx.opencodeRuntime.listProviders()
    ↓ OpenCode runtime
OpenCodeHttpClient.listProviders() → upstream Zen /providers
    ↓ normalize
OpenCodeProviderSummary[] → { id, name, source, modelCount, models[] }
    ↓ map to
ManagedProvider[] → { id, name, enabled, models: ManagedModel[], credential, status }
```

**Key:** Picker sources from `GET /api/providers` which aggregates runtime-discovered + configured providers. No hardcoded catalog.

### 6.2 Response Shape (Already Exists)

```json
{
  "source": "opencode-runtime",
  "providers": [{
    "id": "opencode",
    "name": "OpenCode",
    "enabled": true,
    "status": "available",
    "credential": { "configured": true, "source": "environment" },
    "models": [{
      "id": "mimo-v2.5-free",
      "name": "mimo-v2.5-free",
      "enabled": true,
      "contextWindow": 128000,
      "maxOutput": 8192,
      "capabilities": { "chat": true, "streaming": true, "functionCalling": true, "vision": false },
      "pricing": { "inputPerMillionTokens": 0, "outputPerMillionTokens": 0 }
    }]
  }]
}
```

### 6.3 Searchable Picker Contract

#### UX Requirements

| Requirement | Implementation |
|-------------|----------------|
| Search by provider | Filter providers by name/id (case-insensitive) |
| Search by model | Filter models by name/id (case-insensitive) |
| Group models by provider | Provider header rows with model rows beneath |
| Dynamically sourced | `GET /api/providers` on mount + refresh |
| Availability state | Show `credential.configured`, `status`, model `enabled` |
| Keyboard navigation | Arrow keys navigate, Enter selects, Escape closes, typeahead |
| Loading state | Spinner while fetching |
| Empty state | "No providers available" message |
| Error/degraded state | Error banner + retry button |

#### Component Structure

```
ProviderModelPicker (button trigger)
  └─ Popover (absolute positioned, z-50)
       ├─ Search input (auto-focused)
       ├─ Provider groups (scrollable)
       │    ├─ Provider header (name, status badge, model count)
       │    └─ Model rows (name, context window, capabilities, availability)
       └─ Empty/error states
```

#### Keyboard Navigation

| Key | Action |
|-----|--------|
| Up/Down | Navigate between model rows (wrapping) |
| Enter | Select focused model, close popover |
| Escape | Close popover, return focus to trigger |
| Home/End | Jump to first/last model |
| Type chars | Typeahead: filter to matching models, focus first match |

#### Data Flow

```
1. Component mounts → fetch GET /api/providers
2. Response cached (refetch on trigger click, max 30s stale)
3. Search input filters: providers → models (case-insensitive)
4. Filtered results grouped by provider
5. User selects → onChange(providerId, modelId) → close popover
6. Trigger shows: provider.name / model.name
```

#### Availability State Display

| State | Visual | Source |
|-------|--------|--------|
| `credential.configured: true` | Green dot | `GET /api/providers` |
| `credential.configured: false` | Amber dot + "API key required" | Same |
| `status: "available"` | Normal text | Same |
| `status: "degraded"` | Amber text | Same |
| `status: "unavailable"` | Red text + disabled | Same |
| `model.enabled: false` | Strikethrough + disabled | Same |

### 6.4 Authority Boundary

**The picker is presentation only.** It displays available choices from the API. It does NOT:
- Become M4 routing authority
- Override routing resolution
- Persist provider/model selection (unless the parent form does so)
- Compete with `GET /api/routing/catalog` or `GET /api/routing/selection`

The UI may request a provider/model preference where currently supported (e.g., `PUT /api/agents/:id`), but M4 remains responsible for authoritative resolution.

---

## 7. Modal/Drawer Composition Boundary

### 7.1 Problem

`AgentRegistryModal` couples form content with `VestaraModal` shell. `AgentDetailDrawer` independently implements similar form content inside `Drawer`. The same editor form cannot be reused.

### 7.2 Solution: Editor Content / Shell Separation

```
AgentEditor (form content)
  ├─ Inside VestaraModal (Agent Control: create/edit)
  ├─ Inside Drawer (Activity Room: inspect/edit)
  └─ Inside VestaraModal (future: Marketplace install)
```

### 7.3 Composition Pattern

```tsx
// Agent Control: Create
<VestaraModal onClose={onClose} className="max-w-lg">
  <AgentEditor
    teams={teams}
    roleSuggestions={agents.map(a => a.role)}
    onSave={handleCreate}
    onCancel={onClose}
  />
</VestaraModal>

// Activity Room: Inspect/Edit
<Drawer open={open} onClose={onClose} title="Agent Details" position="right">
  <AgentEditor
    agent={agent}
    onSave={handleSave}
    onCancel={onClose}
  />
</Drawer>
```

### 7.4 Shell Responsibilities

| Concern | VestaraModal | Drawer |
|---------|-------------|--------|
| Backdrop | `bg-black/70 backdrop-blur-sm` | `bg-black/50` |
| Positioning | Centered | Right-side slide-over |
| Focus trap | Yes (Tab cycling) | No (Escape only) |
| Resize | No | Yes (drag handle) |
| localStorage | No | Yes (size persistence) |
| z-index | `z-50` | `z-[80]` |

The editor content does not know which shell it is in. It only receives `onSave` and `onCancel` callbacks.

---

## 8. Activity Room Decoupling Proof

### 8.1 Current State

| Concern | Agent Control | Activity Room |
|---------|---------------|---------------|
| Agent list source | `GET /api/agents` | `GET /api/agents` (via AgentDetailDrawer) |
| Agent display | `AgentCard` (expandable) | `AgentListItem` (telemetry) |
| Agent editing | `AgentRegistryModal` (VestaraModal) | `AgentDetailDrawer` (Drawer) |
| Provider/model editing | `AgentRegistryModal` → `<select>` | `AgentDetailDrawer` → `<select>` |
| Imports from other surface | **NONE** | **NONE** |

### 8.2 Shared Primitives Decoupling Proof

The shared primitives will:

1. Import from `components/ui/agents/` — not from `pages/Agents/` or `pages/activity/`
2. Accept props only — no internal state depends on either page's state
3. Use `GET /api/agents` and `GET /api/providers` — same API endpoints both surfaces already use
4. Not import `TelemetryContext` — Activity Room's telemetry state stays local
5. Not import `ALL_AGENT_SLOTS` — no hardcoded agent catalog

### 8.3 Verification

After implementation, verify:
- `components/ui/agents/*.tsx` has zero imports from `pages/Agents/` or `pages/activity/`
- `pages/Agents/` imports from `components/ui/agents/` (not the reverse)
- `pages/activity/AgentDetailDrawer.tsx` can import from `components/ui/agents/` without circular dependency
- `AgentEditor` renders correctly inside both `VestaraModal` and `Drawer`

---

## 9. Design Decisions

### 9.1 Agent List: Dynamic, Not Slotted

Display only persisted agents from `GET /api/agents`. No synthetic `slot-*` objects.

### 9.2 Category: Derived from Role

```typescript
function deriveCategory(role: string): string {
  const r = role.toLowerCase();
  if (['developer', 'architect', 'planner', 'planning', 'frontend', 'context'].includes(r)) return 'Development';
  if (['verifier', 'reviewer', 'tester', 'security-agent', 'security'].includes(r)) return 'Verification';
  if (['analyst', 'performance-agent', 'performance', 'documentation-agent', 'documentation', 'documenter'].includes(r)) return 'Analysis';
  if (['release-agent', 'release', 'refactoring-agent', 'refactoring', 'devops'].includes(r)) return 'Infrastructure';
  return 'Specialized';
}
```

Presentation logic, not domain authority. Unknown roles fall to "Specialized."

### 9.3 Role Input: Freeform with Suggestions

`<input>` with datalist suggestions derived from `agents.map(a => a.role)` — dynamic, not hardcoded.

### 9.4 Registration Without slot-* Objects

"Create Agent" button opens empty `AgentEditor`. No pre-filling from hardcoded templates.

### 9.5 Dynamic Provider/Model Discovery

New providers/models appear in `ProviderModelPicker` automatically via `GET /api/providers`. No frontend code change needed.

### 9.6 Genericity Acceptance Test

**Test A: Arbitrary agent role**

| Step | Expected |
|------|----------|
| POST /api/agents with role 'banana-engineer' | Creates `agent-<timestamp>` |
| GET /api/agents | Returns the new agent |
| Agent Control UI | Displays card with name "Banana Engineer" |
| deriveCategory('banana-engineer') | Returns "Specialized" |
| No frontend code change | No banana-engineer in any constant/map/union |

**Test B: Dynamic provider/model**

| Step | Expected |
|------|----------|
| New provider in OpenCode runtime | `GET /api/providers` includes it |
| ProviderModelPicker opens | Shows new provider with models |
| No frontend code change | No provider in any hardcoded list |

---

## 10. Affected Files

### 10.1 New Shared Primitives

| File | Purpose |
|------|---------|
| `components/ui/agents/types.ts` | Shared `AgentIdentity`, `AgentStats`, `AgentSaveData` types |
| `components/ui/agents/deriveCategory.ts` | Category derivation function |
| `components/ui/agents/formClasses.ts` | Shared form CSS classes (`inputClass`, `labelClass`) |
| `components/ui/agents/AgentSummary.tsx` | Minimal agent identity display |
| `components/ui/agents/AgentStatusBadge.tsx` | Extracted status badge |
| `components/ui/agents/AgentCard.tsx` | Extracted card with `actions` slot |
| `components/ui/agents/AgentEditor.tsx` | Agent create/edit form (shell-agnostic) |
| `components/ui/agents/ProviderModelPicker.tsx` | Searchable provider/model selection |
| `components/ui/agents/AgentCategoryList.tsx` | Category list with `deriveCategory()` |

### 10.2 Files to Modify

| File | Change | Risk |
|------|--------|------|
| `pages/Agents.tsx` | Remove `allAgentSlots` merge; use `agents` directly; import shared primitives | MEDIUM |
| `pages/Agents/AgentRegistryModal.tsx` | Replace with `VestaraModal` + `AgentEditor` composition | MEDIUM |
| `pages/Agents/AgentCard.tsx` | Re-export from shared or delete and import directly | LOW |
| `pages/Agents/AgentCategoryList.tsx` | Re-export from shared or delete and import directly | LOW |
| `pages/Agents/AgentStatusBadge.tsx` | Re-export from shared or delete and import directly | LOW |
| `pages/Agents/constants.ts` | Remove `ALL_AGENT_SLOTS`, `ROLES`, `ROLE_CATEGORIES` | LOW |
| `pages/activity/AgentDetailDrawer.tsx` | Replace inline form with `AgentEditor` inside `Drawer` | MEDIUM |

### 10.3 Files NOT Modified

| File | Reason |
|------|--------|
| `packages/workspace/src/agents.registry.ts` | CANONICAL_AGENTS unchanged |
| `packages/workspace/src/agent-storage.ts` | seedBuiltIn() unchanged |
| `apps/api/src/routes/agents.ts` | GET/POST /api/agents unchanged |
| `apps/api/src/routes/providers.ts` | GET /api/providers unchanged |
| `packages/workspace/src/types.ts` | AgentDefinition unchanged |
| `packages/shared/src/provider.ts` | AIProvider/AIModel unchanged |
| `pages/Agents/AgentFilters.tsx` | Agent Control-specific |
| `pages/Agents/AgentControlHeader.tsx` | Agent Control-specific |
| `pages/activity/AgentListItem.tsx` | Activity Room-specific |
| `pages/activity/ActivitySidebar.tsx` | Activity Room-specific |

### 10.4 Shared Type Definition

```typescript
// components/ui/agents/types.ts

/** Minimal agent identity — sufficient for display and selection. */
export interface AgentIdentity {
  id: string;
  name: string;
  role: string;
  description?: string;
  color?: string;
  status?: string;
  provider?: string;
  model?: string;
  capabilities?: string[];
  teamId?: string;
  createdAt?: string;
}

/** Agent execution stats — from GET /api/agents response. */
export interface AgentStats {
  total: number;
  completed: number;
  failed: number;
  running: number;
  avgDuration: number;
  successRate: number;
}

/** Data for creating/updating an agent — from AgentEditor form. */
export interface AgentSaveData {
  name: string;
  role: string;
  description?: string;
  provider?: string;
  model?: string;
  runtimeAgent?: string;
  capabilities?: string[];
  color?: string;
  teamId?: string;
}
```

---

## 11. Bounded Implementation Slices

### Slice 1: Shared Types + deriveCategory + Form CSS

**Scope:** Create shared type definitions, category derivation, and form CSS constants.

**Files:** `components/ui/agents/types.ts`, `components/ui/agents/deriveCategory.ts`, `components/ui/agents/formClasses.ts`

**Changes:**
1. Create `AgentIdentity`, `AgentStats`, `AgentSaveData` types
2. Create `deriveCategory()` function
3. Extract shared form CSS classes

**Verification:** Types compile. `deriveCategory()` handles known and unknown roles.

### Slice 2: AgentStatusBadge + AgentSummary

**Scope:** Extract status badge and create minimal summary component.

**Files:** `components/ui/agents/AgentStatusBadge.tsx`, `components/ui/agents/AgentSummary.tsx`

**Changes:**
1. Extract `AgentStatusBadge` from `pages/Agents/AgentStatusBadge.tsx`
2. Create `AgentSummary` as minimal identity display
3. Update `pages/Agents/AgentStatusBadge.tsx` to re-export

**Verification:** Both render correctly. Activity Room can import without circular dependency.

### Slice 3: AgentCard (Extracted)

**Scope:** Extract AgentCard with `actions` slot.

**Files:** `components/ui/agents/AgentCard.tsx`

**Changes:**
1. Move AgentCard logic to shared location
2. Replace hardcoded Run/Edit/More buttons with `actions` slot
3. Update `pages/Agents/AgentCard.tsx` to re-export or delete

**Verification:** Agent Control passes custom actions. Activity Room can use without actions.

### Slice 4: ProviderModelPicker

**Scope:** Searchable provider/model selection.

**Files:** `components/ui/agents/ProviderModelPicker.tsx`

**Changes:**
1. Create popover-based picker with search input
2. Fetch `GET /api/providers` on mount
3. Group models by provider
4. Implement keyboard navigation
5. Show loading, empty, error states
6. Display availability state

**Verification:** Picker shows providers/models from API. Keyboard navigation works. No hardcoded catalog.

### Slice 5: AgentEditor

**Scope:** Agent create/edit form content (shell-agnostic).

**Files:** `components/ui/agents/AgentEditor.tsx`

**Changes:**
1. Create form with name, role, description, provider/model, capabilities, color, team
2. Use `ProviderModelPicker` for provider/model selection
3. Freeform role input with datalist suggestions
4. Submission state machine (idle → submitting → success/error)
5. Validation with inline errors

**Verification:** Renders correctly inside both `VestaraModal` and `Drawer`.

### Slice 6: AgentCategoryList (Extracted)

**Scope:** Extract category list with `deriveCategory()`.

**Files:** `components/ui/agents/AgentCategoryList.tsx`

**Changes:**
1. Move category list logic to shared location
2. Use `deriveCategory()` instead of `ROLE_CATEGORIES`
3. Add `renderAgent` customization slot
4. Update `pages/Agents/AgentCategoryList.tsx` to re-export or delete

**Verification:** Groups agents by derived category. Unknown roles fall to "Specialized."

### Slice 7: Agent Control Integration

**Scope:** Wire shared primitives into Agent Control page.

**Files:** `pages/Agents.tsx`, `pages/Agents/AgentRegistryModal.tsx`, `pages/Agents/constants.ts`

**Changes:**
1. Remove `allAgentSlots` merge — use `agents` directly
2. Replace `AgentRegistryModal` with `VestaraModal` + `AgentEditor`
3. Remove `ALL_AGENT_SLOTS`, `ROLES`, `ROLE_CATEGORIES` from constants
4. Pass `agents.map(a => a.role)` as role suggestions
5. Add "Create Agent" button

**Verification:** 5 canonical agents appear. No `slot-*` objects. Registration works with any role.

### Slice 8: Activity Room Integration

**Scope:** Wire `AgentEditor` into Activity Room's `AgentDetailDrawer`.

**Files:** `pages/activity/AgentDetailDrawer.tsx`

**Changes:**
1. Replace inline form with `AgentEditor` inside `Drawer`
2. Remove duplicated `fetchJSON`, `RegisteredAgent` type, provider/model dropdowns
3. Import shared types from `components/ui/agents/types.ts`

**Verification:** AgentDetailDrawer renders `AgentEditor`. Provider/model editing works via shared picker.

---

## 12. Test Strategy

### 12.1 Unit Tests

| Test | File | Verification |
|------|------|-------------|
| `deriveCategory()` returns correct category for known roles | `components/ui/agents/__tests__/deriveCategory.test.ts` | 5 canonical roles → correct categories |
| `deriveCategory()` returns "Specialized" for unknown roles | Same file | `deriveCategory('banana-engineer')` === "Specialized" |
| `AgentStatusBadge` renders status variants | `components/ui/agents/__tests__/AgentStatusBadge.test.tsx` | All status strings render |
| `AgentSummary` renders agent identity | `components/ui/agents/__tests__/AgentSummary.test.tsx` | Name, role, status shown |
| `AgentCard` renders with actions slot | `components/ui/agents/__tests__/AgentCard.test.tsx` | Custom actions render |
| `ProviderModelPicker` fetches and groups providers | `components/ui/agents/__tests__/ProviderModelPicker.test.tsx` | Mock API → grouped display |
| `ProviderModelPicker` keyboard navigation | Same file | Arrow/Enter/Escape work |
| `ProviderModelPicker` search filtering | Same file | Typeahead filters providers/models |
| `ProviderModelPicker` loading/empty/error states | Same file | All states render |
| `AgentEditor` renders create mode | `components/ui/agents/__tests__/AgentEditor.test.tsx` | Empty form fields |
| `AgentEditor` renders edit mode | Same file | Pre-filled from agent prop |
| `AgentEditor` validation | Same file | Required fields enforced |
| `AgentEditor` submission lifecycle | Same file | idle → submitting → success/error |
| `AgentEditor` renders inside VestaraModal | Same file | Composition works |
| `AgentEditor` renders inside Drawer | Same file | Composition works |

### 12.2 Integration Tests

| Test | File | Verification |
|------|------|-------------|
| Agent list shows only persisted agents | `pages/Agents/__tests__/agents-page.test.tsx` | No `slot-*` objects |
| Registration creates agent with any role | `apps/api/__tests__/agent-crud-routes.test.ts` | POST with arbitrary role succeeds |
| Category grouping works for all agents | `components/ui/agents/__tests__/AgentCategoryList.test.tsx` | All agents grouped |
| Agent Detail Drawer uses shared editor | `pages/activity/__tests__/agent-detail-drawer.test.tsx` | AgentEditor renders inside Drawer |

### 12.3 Manual Verification

| Verification | Expected |
|-------------|----------|
| 5 canonical agents appear in Agent Control | 5 cards in correct categories |
| Create agent with role "banana-engineer" | Appears in "Specialized" category |
| Create agent with role "custom-role-xyz" | Succeeds, appears in "Specialized" |
| Submission prevents double-click | Only one agent created |
| ProviderModelPicker shows providers from API | No hardcoded list |
| New provider appears without code change | Dynamic discovery works |
| AgentEditor works in Agent Control modal | Create/edit flows work |
| AgentEditor works in Activity Room drawer | Inspect/edit flows work |
| agent-assistant appears after GA-4 | No UI code change needed |

---

## 13. Migration Impact

### 13.1 Database Migration

**None.** No schema changes. No data migration.

### 13.2 API Changes

**None.** All existing endpoints unchanged.

### 13.3 Frontend Breaking Changes

| Change | Impact | Mitigation |
|--------|--------|------------|
| No more "unregistered" slots | Users can't see "what agents could exist" | "Create Agent" button |
| No more hardcoded role dropdown | User must type role | Datalist suggestions from persisted agents |
| ProviderModelPicker replaces `<select>` | Different visual appearance | Same data, better UX |

### 13.4 Backward Compatibility

- Existing persisted agents unaffected
- Existing team assignments unaffected
- Existing execution history unaffected
- All API response shapes unchanged

---

## 14. BLOCKER / ADJACENT / OBSERVATION

### BLOCKER

None.

### ADJACENT

| ID | Finding | Action |
|----|---------|--------|
| ADJ-REMED-001 | `Agent` type in `types.ts` is a loose re-declaration of `AgentDefinition` | Consider importing `AgentDefinition` directly (future) |
| ADJ-REMED-002 | `ROLE_COLORS` is a hardcoded role→color map | Keep as presentation fallback |
| ADJ-REMED-003 | `allCapabilities` currently pulls from `ALL_AGENT_SLOTS` | Acceptable: capabilities from persisted agents only |
| ADJ-REMED-004 | `deriveCategory()` is effectively a "soft" ROLE_CATEGORIES | Acceptable: presentation logic, not domain authority |
| ADJ-REMED-005 | `fetchJSON` duplicated 3 times | Shared primitives eliminate this duplication |
| ADJ-REMED-006 | Form CSS classes duplicated 4+ times | `formClasses.ts` eliminates this |

### OBSERVATION

| ID | Finding | Confidence |
|----|---------|------------|
| OBS-REMED-001 | Freeform role input may confuse users who expect guidance | MEDIUM |
| OBS-REMED-002 | `origin` field extension optional for this remediation | HIGH |
| OBS-REMED-003 | ProviderModelPicker popover z-index must not conflict with Drawer z-[80] | HIGH |

---

*Amended preflight complete. No production code was changed. All design decisions are based on source code inspection and the Director's shared agent UI amendment.*

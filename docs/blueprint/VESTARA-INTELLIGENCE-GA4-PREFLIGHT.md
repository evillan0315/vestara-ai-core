---
title: GA-4.0 — Authority & Existing-State Implementation Preflight
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# GA-4.0 — Authority & Existing-State Implementation Preflight

**Date:** 2026-09-03
**Status:** Preflight Complete — Awaiting Director Review
**Milestone:** VESTARA-INTELLIGENCE-MB1.5 (frozen at `c7d7106`)
**Phase:** GA-4.0 — Authority & Existing-State Audit
**Scope:** Audit/preflight only. No production mutation.

---

## A. AgentType / Scope Authority

### Definition

```typescript
// packages/workspace/src/types.ts:593
export type AgentType = 'workspace' | 'registry';
```

### Decision: Reuse `AgentType` as the authoritative scope contract

**AgentType IS the scope contract.** No new `AgentScope` type is needed. The frozen semantic maps directly:

| AgentType value | Product term | Meaning |
|----------------|--------------|---------|
| `'workspace'` | Workspace Agent | workspace-scoped availability |
| `'registry'` | Global Agent | cross-workspace availability |

### Consumer Trace

| Location | File | Usage |
|----------|------|-------|
| Type definition | `packages/workspace/src/types.ts:593` | `type AgentType = 'workspace' \| 'registry'` |
| Duplicate type | `apps/workspace/src/pages/Agents/types.ts:1` | Same type (UI mirror) |
| Interface field | `packages/workspace/src/types.ts:599` | `agentType: AgentType` on `AgentDefinition` |
| Interface field (UI) | `apps/workspace/src/pages/Agents/types.ts:7` | `agentType: AgentType` on `Agent` |
| Re-export | `packages/workspace/src/index.ts:240` | Exported from package |
| DB write | `packages/workspace/src/agent-storage.ts:78` | `agent.agentType ?? 'workspace'` |
| DB read | `packages/workspace/src/agent-storage.ts:339` | `row.agent_type \|\| 'workspace'` |
| Migration DDL | `packages/workspace/src/agent-migrations.ts:204` | `TEXT DEFAULT 'workspace'` |
| API create | `apps/api/src/routes/agents.ts:134` | `body.agentType \|\| 'workspace'` |
| API update | `apps/api/src/routes/agents.ts:205-212` | Spread existing + body |
| UI radio | `apps/workspace/src/pages/Agents/AgentRegistryModal.tsx:276-289` | Workspace/Registry radio |
| UI branching | `apps/workspace/src/pages/Agents/AgentRegistryModal.tsx:94,95,115,172-176,297,348` | Branches on value |

### Current State

- All 5 canonical agents use `agentType: 'workspace'`
- All test fixtures use `'workspace'`
- DB default is `'workspace'`
- Write-time default is `'workspace'`
- Read-time fallback is `'workspace'`
- **Zero production agents use `'registry'`** — the value exists only in types and UI

### Migration Required

**No schema migration required.** The `agent_type` column already exists with `DEFAULT 'workspace'`. Adding a new agent with `agentType: 'registry'` is a normal `INSERT` operation.

### Recommendation

**Reuse `AgentType` as-is.** The frozen semantic `workspace → Workspace Agent, registry → Global Agent` maps directly to existing type values. No rename, no new type, no migration.

---

## B. AgentOrigin Persistence

### Target

```typescript
AgentOrigin = 'system' | 'user'
```

### Mutation Surface

| Layer | File | Change Required |
|-------|------|----------------|
| Type definition | `packages/workspace/src/types.ts` | Add `AgentOrigin` type, add `origin?: AgentOrigin` to `AgentDefinition` |
| UI mirror type | `apps/workspace/src/pages/Agents/types.ts` | Add `origin` field to `Agent` interface |
| SQL schema | `packages/workspace/src/agent-migrations.ts` | New migration v4: `agents.origin TEXT DEFAULT 'user'` |
| DB write | `packages/workspace/src/agent-storage.ts:78` | Add `origin` to INSERT |
| DB read | `packages/workspace/src/agent-storage.ts:334-351` | Add `origin` to rowToAgent mapping |
| API serialization | `apps/api/src/routes/agents.ts` | No change needed (flows through as-is) |
| Canonical agents | `packages/workspace/src/agents.registry.ts` | Add `origin: 'system'` to all 5 canonical agents |
| Tests/fixtures | Multiple test files | Add `origin` to test agent objects |

### Backfill / Default Recommendation

**Database default:** `DEFAULT 'user'`

**Rationale:** The `user` default ensures existing rows (all created by users or by the old `seedBuiltIn()` which did not distinguish ownership) are NOT silently classified as system-owned. Only explicitly registered canonical agents will have `origin: 'system'`.

**Backfill strategy:**

1. Existing 5 canonical agents: **Backfill to `'system'`** via `seedBuiltIn()` reconciliation (see Section D)
2. Existing user-created agents: **Remain `'user'`** via `DEFAULT 'user'`
3. New agents created via API: **Default to `'user'`** via `body.origin || 'user'`

**Critical invariant:** No existing user agent may be reclassified as system-owned without explicit migration evidence.

---

## C. CanonicalAgent Suitability

### Current Evidence

```typescript
// packages/workspace/src/types.ts:622-627
interface CanonicalAgent extends AgentDefinition {
  mode: AgentMode;                        // required
  opencodePermissions: OpenCodePermissions; // required
  opencodePrompt: string;                 // NEW field
}
```

`CanonicalAgent` is an in-memory-only type. The database has NO columns for `mode`, `opencodePermissions`, or `opencodePrompt`. `rowToAgent()` returns `AgentDefinition`, not `CanonicalAgent`.

### Options Evaluated

| Option | Description | Assessment |
|--------|-------------|------------|
| **A. Reuse CanonicalAgent unchanged** | Add `agent-assistant` to `CANONICAL_AGENTS` with empty/default OpenCode fields | Works. `mode`, `opencodePermissions`, `opencodePrompt` can be set to minimal values. The type is already designed for in-memory canonical representation. |
| **B. Generalize CanonicalAgent** | Remove OpenCode-specific fields, make them optional | Over-engineered. Breaks the existing canonical agent contract for all 5 current agents. |
| **C. Introduce narrower canonical identity contract** | New type `CanonicalIdentity` without OpenCode fields | Creates parallel type hierarchy. Adds complexity without clear benefit. |
| **D. Separate canonical identity from runtime projection** | Split into identity + projection types | Already the case. `AgentDefinition` is the identity, `CanonicalAgent` adds OpenCode projection. The DB only stores identity. |

### Recommendation: Option A — Reuse CanonicalAgent unchanged

```typescript
// Proposed addition to CANONICAL_AGENTS
{
  id: 'agent-assistant',
  name: 'Vestara Assistant',
  role: 'assistant',              // new role value (see Section F)
  agentType: 'registry',
  origin: 'system',
  description: 'Vestara cross-workspace assistant',
  capabilities: ['conversation', 'context-access', 'surface-context'],
  permissions: [],                // no repository permissions needed
  provider: undefined,
  model: undefined,
  runtimeAgent: undefined,        // no OpenCode runtime twin
  mode: 'primary',                // required by CanonicalAgent
  opencodePermissions: {          // required by CanonicalAgent — unused but structurally needed
    read: 'allow', edit: 'deny', glob: 'allow', grep: 'allow',
    list: 'allow', bash: 'deny', task: 'deny', external_directory: 'deny',
  },
  opencodePrompt: '',             // required by CanonicalAgent — unused
  status: 'active',
  createdAt: BUILT_IN_CREATED_AT,
}
```

**Key:** `runtimeAgent: undefined` means agents-sync.mjs will use `role` as the filename fallback, producing `.opencode/agents/assistant.md`. This is acceptable — the file will contain an empty prompt, which is harmless. Alternatively, `runtimeAgent` can be set to a reserved value like `'vestara-assistant'` to control the filename.

**Architecture note:** `CanonicalAgent` is NOT a runtime contract. It is a registration-time in-memory representation. The DB only stores `AgentDefinition` fields. OpenCode-specific fields are used by `scripts/agents-sync.mjs` for `.md` generation, which reads directly from `CANONICAL_AGENTS`.

---

## D. Canonical Bootstrap / Reconciliation

### Current Behavior

`seedBuiltIn()` (`agent-storage.ts:48-66`):
1. If `VESTARA_DISABLE_AGENT_SEED=1` → skip entirely
2. If `agents` table has ANY rows → skip entirely (no reconciliation)
3. If empty → INSERT all `CANONICAL_AGENTS`

**Problem:** On existing installations with a populated `agents` table, `agent-assistant` will never be seeded. The current logic is "seed or nothing" — there is no incremental reconciliation.

### Proposed Reconciliation Design

**Replace** the "seed only empty catalog" logic with **"ensure canonical agents exist"**:

```typescript
private reconcileCanonical(): void {
  if (process.env.VESTARA_DISABLE_AGENT_SEED === '1') return;

  for (const canonical of CANONICAL_AGENTS) {
    const existing = dbGet(this.db, 'SELECT id, origin FROM agents WHERE id = ?', [canonical.id]);
    if (!existing) {
      // Missing canonical agent → deterministic creation
      this.saveAgent(canonical);
    } else if (existing.origin !== 'system' && canonical.origin === 'system') {
      // Existing row needs system-origin backfill
      // Only upgrade: user → system for canonical IDs
      dbRun(this.db, 'UPDATE agents SET origin = ? WHERE id = ? AND origin != ?', ['system', canonical.id, 'system']);
    }
    // Already correct → no-op
    // User-configurable state (color, status, capabilities) → preserved
  }
}
```

### Conflict Handling

| State | Behavior |
|-------|----------|
| Missing canonical agent | Deterministic `INSERT` |
| Already correct (same origin) | No-op |
| Existing user-created agent with canonical ID | **CONFLICT** — requires explicit migration path |
| Existing agent with different name/role | Preserve user state, do not overwrite |

**Canonical ID conflict scenario:** If a user has created an agent with `id: 'agent-assistant'` before the canonical agent exists, the reconciliation would upgrade it to `origin: 'system'`. This is the correct behavior — the canonical ID is authoritative.

**Alternative:** If user-created canonical-ID conflicts are unacceptable, the reconciliation can log a warning and skip, requiring manual resolution. This is safer but less automatic.

### `DROPPED_BUILT_IN_AGENT_IDS`

Currently defined but never consumed programmatically. The reconciliation should optionally clean up dropped agents:

```typescript
for (const droppedId of DROPPED_BUILT_IN_AGENT_IDS) {
  dbRun(this.db, 'DELETE FROM agents WHERE id = ? AND origin = ?', [droppedId, 'system']);
}
```

**Only delete system-owned dropped agents.** User-created agents with dropped IDs are preserved.

---

## E. System-Agent Lifecycle Authority

### Mutation Paths

| Operation | Current Location | System-Agent Enforcement |
|-----------|-----------------|------------------------|
| Create | `AgentStorage.saveAgent()` | No enforcement — any agent can be created |
| Update | `AgentStorage.saveAgent()` (INSERT OR REPLACE) | No enforcement — any field can be overwritten |
| Delete | `AgentStorage.deleteAgent()` | No enforcement — any agent can be deleted |
| Disable | `AgentStorage.updateAgentStatus()` | No enforcement |
| Enable | `AgentStorage.updateAgentStatus()` | No enforcement |
| Provider/model update | `AgentStorage.updateAgentModel()` | No enforcement |

### Enforcement Points

**Storage layer (`agent-storage.ts`)** — primary enforcement boundary:

```typescript
async deleteAgent(id: string): Promise<void> {
  const agent = await this.getAgent(id);
  if (agent?.origin === 'system') {
    throw new Error(`Cannot delete system agent: ${id}`);
  }
  dbRun(this.db, 'DELETE FROM agents WHERE id = ?', [id]);
}
```

```typescript
async saveAgent(agent: AgentDefinition): Promise<void> {
  if (agent.origin === 'system' && agent.id) {
    const existing = await this.getAgent(agent.id);
    if (existing && existing.origin === 'system' && existing.id !== agent.id) {
      throw new Error(`Cannot change system agent identity: ${existing.id} → ${agent.id}`);
    }
  }
  // ... existing INSERT OR REPLACE
}
```

**API layer (`routes/agents.ts`)** — secondary enforcement:

```typescript
// PUT /api/agents/:id — before saveAgent
const existing = await ctx.agents.getAgent(id);
if (existing?.origin === 'system') {
  // Reject mutation of protected fields
  if (cleanBody.id && cleanBody.id !== id) {
    return json(res, 400, { error: 'Cannot change system agent identity' });
  }
}
```

**UI (`AgentRegistryModal.tsx`)** — presentation only, NOT security boundary:

```tsx
// Disable delete button for system agents
const isSystemAgent = agent?.origin === 'system';
<Button disabled={isSystemAgent} onClick={handleDelete}>Delete</Button>
```

### Protected Fields (system agents)

| Field | Protected | Rationale |
|-------|-----------|-----------|
| `id` | Yes | Identity immutability (GA-I2) |
| `origin` | Yes | Cannot downgrade system → user |
| `agentType` | No | Scope can change with migration |
| `name` | No | User-configurable |
| `role` | No | User-configurable |
| `status` | No | Enable/disable allowed per policy |
| `color` | No | User-configurable |
| `capabilities` | No | Additive, user-configurable |
| `provider` | No | Will be resolved through AI Configuration |
| `model` | No | Will be resolved through AI Configuration |

---

## F. Canonical Assistant Role

### Current `AgentRole`

```typescript
// packages/workspace/src/types.ts:456-484
export type AgentRole =
  | 'architect' | 'developer' | 'verifier' | 'documenter' | 'security'
  | 'devops' | 'testing' | 'ux' | 'performance' | 'database' | 'release'
  | 'governance' | 'conversation' | 'planning' | 'refactoring' | 'custom'
  | 'dashboard-curator' | 'frontend' | 'analyst' | 'reviewer' | 'tester'
  | 'continuous-tester' | 'security-agent' | 'performance-agent'
  | 'documentation-agent' | 'refactoring-agent' | 'release-agent' | 'context';
```

### Analysis

| Existing Role | Semantic Overlap with Assistant |
|---------------|--------------------------------|
| `'conversation'` | Close — but implies conversational capability, not the Assistant identity |
| `'context'` | Close — but implies context-gathering, not user-facing access |

### Recommendation: Introduce `role = 'assistant'`

**Rationale:**
- `'conversation'` describes a capability, not an identity role
- `'assistant'` is a distinct domain concept: user-facing access surface for intelligence
- The `AgentRole` union already has `(string & {})` escape hatch, but explicit values are preferable for type safety
- `role = 'assistant'` does NOT conflict with `MessageRole = 'assistant'` — these are different type systems serving different purposes

**Distinction:**

| Concept | Type | Value | Meaning |
|---------|------|-------|---------|
| Agent identity | `AgentDefinition.id` | `'agent-assistant'` | Which agent |
| Agent role | `AgentRole` | `'assistant'` | What function |
| Message role | `MessageRole` | `'assistant'` | LLM message turn type |
| Conversation capability | `AgentCapability` | `'conversation'` | What it can do |

---

## G. Conversation Provenance

### Existing Contracts

| Contract | Location | Fields |
|----------|----------|--------|
| `Conversation` | `packages/shared/src/conversation-types.ts` | `id`, `userId`, `projectId?`, `title`, `messages`, `status` |
| `Message` | `packages/shared/src/conversation-types.ts` | `id`, `conversationId`, `role`, `content`, `provider?`, `model?` |
| `ActivityActor` | `packages/types/src/activity.ts:78-82` | `type`, `id`, `displayName` |
| `Participant` | `packages/types/src/activity.ts:93-111` | `participantId`, `type`, `displayName`, `membership`, `presence`, `workState` |
| `ParticipantProjection` | `packages/types/src/projection.ts:117-182` | Full actor identity with `role?`, `modelId?`, `providerId?` |
| `StructuredInteraction` | `packages/types/src/interaction.ts:67-100` | `presentingParticipantId`, `presentingParticipantName` |

### Gap

`Conversation` and `Message` have **no actor identity field**. The `role` on `Message` is `MessageRole` (LLM turn type), not a Vestara agent identity.

### Alternatives

| Option | Pros | Cons |
|--------|------|------|
| **A. `Conversation.agentId?: string`** | Simple, direct provenance | Ties conversation to single agent; doesn't model multi-agent conversations |
| **B. `Message.agentId?: string`** | Per-message provenance; supports multi-agent | More granular than needed for GA-4; may be premature |
| **C. Generalized actor identity** | Reuses existing `ActivityActor` pattern | Requires new type or extension; broader scope |
| **D. `Conversation.participantId?: string`** | Aligns with Activity Room `ParticipantProjection` | May conflate conversation and Activity Room identity |

### Recommendation: Option A — `Conversation.agentId?: string`

**Rationale:**
- GA-4 requires canonical Assistant provenance (frozen requirement)
- `Conversation.agentId` is the simplest representation that satisfies the requirement
- Per-message provenance (Option B) is a future extension, not a GA-4 requirement
- The existing `ActivityActor` contract (Option C) is designed for Activity Room, not Conversation
- `agentId` references `AgentDefinition.id`, which is the canonical identity

**Migration/compatibility:**
- Optional field — existing conversations remain valid
- No backfill required — old conversations have `agentId: undefined`
- `ConversationService` continues to own conversation state

---

## H. AI-Policy Boundary

### Current State

No `aiPolicy`, `ai-config`, or `assistant-default` patterns exist in the codebase.

### Required Contract for GA-4.5

GA-4 must establish an integration boundary for AI Configuration without implementing it. The smallest contract:

```typescript
// packages/workspace/src/types.ts (addition)
export interface AgentAIPolicy {
  readonly policyId: string;        // e.g. 'assistant-default'
  readonly description?: string;
}

// On AgentDefinition
export interface AgentDefinition {
  // ... existing fields ...
  readonly aiPolicy?: AgentAIPolicy;  // optional, references AI Configuration
}
```

### Recommendation: Defer `aiPolicy` field to AI Configuration milestone

**Rationale:**
- GA-4 establishes identity, not provider/model resolution
- Adding `aiPolicy` now creates an empty contract that nothing consumes
- The existing `provider` and `model` fields on `AgentDefinition` are sufficient for GA-4 (set to `undefined`)
- AI Configuration will introduce the actual policy contract and resolution mechanism

**GA-4 boundary:** GA-4 documents that `provider` and `model` on `agent-assistant` are `undefined` and will be resolved through a future AI Configuration milestone. No new type is needed in GA-4.

---

## I. Runtime Non-Coupling

### Evidence: Registration Does NOT Trigger Execution

| Path | Does Registration Enter It? | Evidence |
|------|---------------------------|----------|
| `AgentRuntime` | **NO** | Constructed from `AgentStorage`, not triggered by `saveAgent()` |
| `AgentHarnessRuntime` | **NO** | Only invoked during harness turn execution, not at registration |
| `WorkflowRuntime` | **NO** | No event listener on agent creation |
| `OpenCodeRuntimeProvider` | **NO** | Only constructed by Harness, not by registration |
| `OpenCode session creation` | **NO** | Sessions created per-turn, not per-registration |
| `agent sync generation` | **INDIRECT** | `scripts/agents-sync.mjs` reads `CANONICAL_AGENTS` and generates `.opencode/agents/*.md` |
| `.opencode/agents/` generation | **INDIRECT** | Running `pnpm agents:sync` would generate a file for any new canonical agent |

### Critical Finding: agents-sync.mjs

`scripts/agents-sync.mjs` iterates `CANONICAL_AGENTS` and generates `.opencode/agents/<runtimeAgent>.md` files. If `agent-assistant` is added to `CANONICAL_AGENTS` with `runtimeAgent: 'vestara-assistant'`, running `pnpm agents:sync` would generate `.opencode/agents/vestara-assistant.md`.

**This is NOT automatic execution** — it is a build-time code generation step. The generated `.md` file is inert (no code, no execution). It is only relevant if the OpenCode server is configured to load it.

**Mitigation:** If `runtimeAgent: undefined`, the sync script falls back to `role` as the filename, producing `.opencode/agents/assistant.md`. This is still harmless but may be confusing. Consider using a distinct `runtimeAgent` value like `'vestara-assistant'` to make the file name explicit and distinguishable.

**The registration itself (seedBuiltIn or saveAgent) does NOT trigger agents-sync.mjs.** Sync is a separate manual/CI command.

---

## J. Global Agent UI Mapping

### Current UI Labels

| Location | File | Current Label | Target Label |
|----------|------|--------------|--------------|
| Radio button | `AgentRegistryModal.tsx:293` | `"Registry Agent"` | `"Global Agent"` |
| Radio button | `AgentRegistryModal.tsx:276` | `"Workspace Agent"` | `"Workspace Agent"` (unchanged) |
| Help text | `AgentRegistryModal.tsx:299` | `"Agent installed from the marketplace registry"` | `"Available across workspaces. Access remains governed per workspace."` |

### Wire/Storage Semantics

The wire format uses `'workspace'` and `'registry'` (AgentType values). These are NOT renamed — only the display labels change.

### Duplicate Frontend Type

`apps/workspace/src/pages/Agents/types.ts` defines a duplicate `Agent` interface and `AgentType` type. This is a pre-existing architectural issue (not introduced by GA-4).

**GA-4 recommendation:** Update the duplicate type's `AgentType` to include `origin` field, keep the labels synchronized. Do NOT refactor the type duplication in GA-4.

---

## K. Identity Namespace Map

| Form | Context | Classification |
|------|---------|---------------|
| `agent-developer` | `AgentDefinition.id` in `CANONICAL_AGENTS` | Canonical identity |
| `vestara-developer` | `AgentDefinition.runtimeAgent` | Runtime identity (OpenCode twin) |
| `agent-agent-developer` | Activity Room `participantId` pattern (`agent-${id}`) | Participant identity |
| `@developer` | Message receipt alias resolution | Role alias |
| `@vestara-developer` | Message receipt alias resolution | Runtime identity alias |
| `@developer-agent` | Message receipt alias resolution | Role-agent alias |

### GA-4 Impact

`agent-assistant` follows the canonical identity pattern. No runtime twin is created in GA-4 (no `runtimeAgent` value). Participant identity would be `agent-agent-assistant` (following existing pattern).

**Adjacent issues (noted, not fixed in GA-4):**
- `agent-agent-developer` prefix is redundant but established
- Message receipt aliases mix identity levels (canonical + runtime + role)

---

## L. Zero-Execution Verification Design

### Observable Boundaries

| Boundary | Observable Signal | Measurement |
|----------|------------------|-------------|
| Provider requests | `AIProvider.complete()` call count | Mock/spy on provider |
| OpenCode sessions | `OpenCodeClient.createSession()` call count | Mock/spy on client |
| WorkflowRuns | `EventBus` events matching `workflow.*` | Event spy |
| Harness executions | `EventBus` events matching `harness.*` | Event spy |
| Tool calls | `ToolRuntime.invoke()` call count | Mock/spy on tool runtime |

### Test Design

```typescript
describe('GA-4.7: Registration non-execution', () => {
  it('registering agent-assistant causes zero AI execution', async () => {
    const provider = { complete: vi.fn(), stream: vi.fn() };
    const client = { createSession: vi.fn() };
    const toolRuntime = { invoke: vi.fn() };
    const eventBus = { emit: vi.fn(), on: vi.fn() };

    // Construct AgentStorage (triggers seedBuiltIn → reconcileCanonical)
    const db = new SQL.Database();
    migrate(db, PLANS_MANIFEST, {});
    const storage = new AgentStorage(db);

    // Verify agent-assistant exists
    const agent = await storage.getAgent('agent-assistant');
    expect(agent).toBeTruthy();
    expect(agent!.agentType).toBe('registry');
    expect(agent!.origin).toBe('system');

    // Verify zero execution
    expect(provider.complete).not.toHaveBeenCalled();
    expect(client.createSession).not.toHaveBeenCalled();
    expect(toolRuntime.invoke).not.toHaveBeenCalled();
    // Verify no workflow/harness events
    expect(eventBus.emit).not.toHaveBeenCalledWith(
      expect.stringContaining('harness'),
      expect.anything(),
    );
  });

  it('listing agents causes zero AI execution', async () => {
    // ... similar pattern
  });
});
```

### Test Seam Location

Tests should be placed in `packages/workspace/__tests__/` alongside existing agent tests. The existing `AgentStorage` test patterns (Pattern A: fresh in-memory DB) provide the foundation.

---

## M. Working-Tree Isolation

### Pre-Existing Changes (NOT part of GA-4)

| File | Status | Origin |
|------|--------|--------|
| `apps/api/src/routes/activity-room-m11a.ts` | Modified | M11C diagnostics endpoint |
| `apps/api/src/routes/diagnostics.ts` | Modified | DIAG-0 type alignment |
| `apps/workspace/__tests__/r6-decision-loop.test.tsx` | Modified | R6 test refinements |
| `apps/workspace/src/hooks/useM11CActivityRoom.ts` | Modified | M11C hook refinements |
| `package.json` | Modified | Auth fix (`--env-file=.env`) |
| `docs/blueprint/VESTARA-INTELLIGENCE-GA0-AUTHORITY-AUDIT.md` | New | GA-0 documentation |
| `docs/blueprint/VESTARA-INTELLIGENCE-MB1-PREFLIGHT.md` | New | MB-1 documentation |
| `packages/types/__tests__/diagnostic-contract.test.ts` | New | DIAG-0 evidence tests |
| `packages/types/src/diagnostic.ts` | New | DIAG-0 type definitions |

### GA-4 Scope Isolation

GA-4 implementation commits must be path-scoped to:
- `packages/workspace/src/types.ts` (AgentOrigin, AgentDefinition changes)
- `packages/workspace/src/agent-storage.ts` (reconciliation, enforcement)
- `packages/workspace/src/agents.registry.ts` (add agent-assistant)
- `packages/workspace/src/agent-migrations.ts` (origin column migration)
- `packages/workspace/__tests__/` (new test files)
- `apps/api/src/routes/agents.ts` (enforcement, origin field)
- `apps/workspace/src/pages/Agents/` (label changes)

Do NOT modify, stage, revert, or include the pre-existing changes listed above.

---

## BLOCKER / ADJACENT / OBSERVATION Findings

### BLOCKER

None. All GA-4.0 investigation paths are clear.

### ADJACENT

| ID | Finding | Classification | Action |
|----|---------|---------------|--------|
| ADJ-001 | `DROPPED_BUILT_IN_AGENT_IDS` is defined but never consumed programmatically | Adjacent | GA-4 reconciliation can optionally consume it |
| ADJ-002 | `CanonicalAgent` fields (`mode`, `opencodePermissions`, `opencodePrompt`) are lost on DB round-trip | Adjacent | By design — these fields are in-memory only for `.md` generation |
| ADJ-003 | `apps/workspace/src/pages/Agents/types.ts` duplicates `AgentType` and `Agent` from `packages/workspace` | Adjacent | Pre-existing type duplication; GA-4 updates both |
| ADJ-004 | `AgentRegistryModal` has registry-specific fields (`registrySource`, `registryVersion`) that are unrelated to GA-4's Global Agent concept | Adjacent | GA-4 reuses existing UI; these fields are presentation-only |
| ADJ-005 | `resolveAgentExecutionFor()` matches agents by `id`, `runtimeAgent`, OR `role` — triple matching creates ambiguity | Adjacent | Pre-existing; GA-4 does not modify resolution logic |
| ADJ-006 | `messageTargetsAgent()` resolves aliases at 3 levels (runtime identity, role, role-agent) — no canonical identity alias | Adjacent | Pre-existing; GA-4 does not modify alias resolution |

### OBSERVATION

| ID | Finding | Confidence |
|----|---------|------------|
| OBS-001 | The 5 canonical agents all use `provider: 'opencode'`, `model: 'mimo-v2.5-free'` — these are presentation defaults, not authoritative routing | High |
| OBS-002 | `AgentStorage.seedBuiltIn()` uses fire-and-forget `.catch(() => {})` for saveAgent — errors are silently swallowed | High |
| OBS-003 | `BUILT_IN_CREATED_AT` is a fixed timestamp (`2026-08-12T00:00:00.000Z`) shared by all canonical agents | High |

---

## Proposed Implementation Batches

### Batch 1: Types & Schema (GA-4.1)

**Files:**
- `packages/workspace/src/types.ts` — Add `AgentOrigin` type, add `origin` field to `AgentDefinition`
- `packages/workspace/src/agent-migrations.ts` — Add migration v4: `agents.origin`
- `apps/workspace/src/pages/Agents/types.ts` — Add `origin` field to UI `Agent` interface

**Verification:** `pnpm lint:check && pnpm build && pnpm test`

### Batch 2: Bootstrap & Registration (GA-4.2)

**Files:**
- `packages/workspace/src/agents.registry.ts` — Add `agent-assistant` to `CANONICAL_AGENTS`, add `origin: 'system'` to all canonical agents
- `packages/workspace/src/agent-storage.ts` — Replace `seedBuiltIn()` with `reconcileCanonical()`, add `origin` to write/read paths

**Verification:** Agent registration tests + zero-execution test

### Batch 3: System Lifecycle (GA-4.3)

**Files:**
- `packages/workspace/src/agent-storage.ts` — Add deletion/mutation protection for system agents
- `apps/api/src/routes/agents.ts` — Add enforcement at API layer

**Verification:** Lifecycle tests (delete rejection, mutation rejection, enable/disable)

### Batch 4: Conversation Provenance (GA-4.4)

**Files:**
- `packages/shared/src/conversation-types.ts` — Add optional `agentId` field to `Conversation`
- Design documentation update

**Verification:** Type tests + ownership invariant tests

### Batch 5: Genericity & Non-Execution (GA-4.6, GA-4.7)

**Files:**
- `packages/workspace/__tests__/` — New test files for genericity and zero-execution

**Verification:** Genericity tests + zero-execution tests

### Batch 6: UI Labels (GA-4.8)

**Files:**
- `apps/workspace/src/pages/Agents/AgentRegistryModal.tsx` — Update labels

**Verification:** Visual test + label test

---

## Verification Commands

| Batch | Command |
|-------|---------|
| All | `pnpm lint:check && pnpm build && pnpm test` |
| Types | `pnpm --filter @vestara/workspace test` |
| Registration | `pnpm --filter @vestara/workspace test` |
| Lifecycle | `pnpm --filter @vestara/workspace test` |
| Conversation | `pnpm --filter @vestara/shared test` |
| Genericity | `pnpm --filter @vestara/workspace test` |
| UI | `pnpm --filter @vestara/workspace-ui test` |

---

*GA-4.0 preflight complete. No production code was changed. All decisions are based on source inspection of vestara-ai-core at commit `c7d7106`.*

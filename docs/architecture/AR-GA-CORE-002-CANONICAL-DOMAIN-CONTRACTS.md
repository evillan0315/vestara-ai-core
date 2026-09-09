# AR-GA-CORE-002 — Canonical Domain Contracts

**Program:** AR-GA-CORE — Activity Room + Global Assistant Convergence
**Milestone:** 002 — Canonical Domain Contracts
**Date:** 2026-09-09
**Depends On:** AR-GA-CORE-001 (frozen)
**Commit:** `8dcd5602ecef3a8dc0288e4fd07df143b310927a`

---

## Table of Contents

1. [Package Boundaries](#1-package-boundaries)
2. [Dependency Direction](#2-dependency-direction)
3. [AgentRole Normalization Table](#3-agentrole-normalization-table)
4. [Capability Semantic Model](#4-capability-semantic-model)
5. [Routing Vocabulary](#5-routing-vocabulary)
6. [Permission Vocabulary](#6-permission-vocabulary)
7. [Compatibility Strategy](#7-compatibility-strategy)
8. [Retained CORE-001 Authorities](#8-retained-core-001-authorities)
9. [Deferred Migrations](#9-deferred-migrations)
10. [Verification Evidence](#10-verification-evidence)

---

## 1. Package Boundaries

### New Leaf Packages

Three dependency-free leaf packages have been created. Each contains only type definitions, runtime arrays, type guards, and pure normalization functions. No services, no HTTP clients, no persistence, no event buses, no UI.

| Package | Location | Responsibility | Dependencies |
|---------|----------|---------------|-------------|
| `@vestara/agent-types` | `packages/agent-types/` | Agent identity vocabulary: AgentRole, AgentCapability, AgentType, AgentDefinition, role normalization | None (leaf) |
| `@vestara/routing-types` | `packages/routing-types/` | Routing vocabulary: ProviderId, ModelId, ProviderModelRef, RoutingCapability, routing selection contracts | None (leaf) |
| `@vestara/permission-contracts` | `packages/permission-contracts/` | Permission vocabulary: PermissionAction, PermissionRisk, PolicyDecision, permission request/decision contracts | None (leaf) |

### Package Contents

#### `@vestara/agent-types`

| File | Exports | Purpose |
|------|---------|---------|
| `agent-role.ts` | `AgentRole` (28 values), `ALL_AGENT_ROLES`, `isAgentRole()` | Canonical agent role vocabulary |
| `agent-capability.ts` | `AgentCapability` (42 values), `ALL_AGENT_CAPABILITIES`, `CAPABILITY_DESCRIPTIONS`, `isAgentCapability()` | Canonical agent capability vocabulary with descriptions |
| `agent-definition.ts` | `AgentType`, `AgentMode`, `AgentPermission`, `AgentDefinition` | Agent identity and configuration interfaces |
| `role-compat.ts` | `RoutingRole`, `PerformanceRole`, `mapAgentRoleToRoutingRole()`, `routingRoleToAgentRole()`, `normalizeLegacyRole()` | Role normalization and compatibility adapters |
| `index.ts` | Barrel re-exports | Public API |

#### `@vestara/routing-types`

| File | Exports | Purpose |
|------|---------|---------|
| `provider-model.ts` | `ProviderId`, `ModelId`, `ProviderModelRef`, `providerId()`, `modelId()` | Branded provider/model identity |
| `provider-state.ts` | `ProviderOperationalState`, `ProviderAvailability`, `RoutingConstraints` | Provider health and routing constraints |
| `routing.ts` | `RoutingCapability` (14 values), `RoleRoutingPolicy`, `EngineeringRoutingPolicy`, `RoutingAssignment`, etc. | Routing selection vocabulary |
| `index.ts` | Barrel re-exports | Public API |

#### `@vestara/permission-contracts`

| File | Exports | Purpose |
|------|---------|---------|
| `permission-action.ts` | `PermissionAction` (11 values), `ALL_PERMISSION_ACTIONS`, `isPermissionAction()` | Canonical permission action vocabulary |
| `permission-status.ts` | `PermissionRisk`, `PermissionStatus`, `ApprovalScope` | Permission lifecycle types |
| `policy-decision.ts` | `PolicyDecision` | Three-valued policy decision |
| `permission-request.ts` | `PermissionRequest`, `PermissionRecord`, `PermissionDecisionInput`, `PolicyEvaluation`, `VestaraPermissionDecision` | Permission request/decision contracts |
| `normalize.ts` | `normalizePermissionAction()`, `classifyPermissionRisk()` | Pure normalization functions |
| `index.ts` | Barrel re-exports | Public API |

---

## 2. Dependency Direction

```
Layer 0 (Leaf, zero deps):
  @vestara/agent-types
  @vestara/routing-types
  @vestara/permission-contracts

Layer 1 (Existing leaf, zero deps):
  @vestara/shared
  @vestara/types

Layer 2 (Single dep on Layer 0+1):
  @vestara/event-bus       ← shared
  @vestara/logger           ← shared
  @vestara/context          ← shared
  ...

Layer 5 (Facade):
  @vestara/workspace ← 20 deps (unchanged)

Layer 6 (Applications):
  @vestara/api ← 48 deps (unchanged)
  @vestara/workspace-ui ← 8 deps (unchanged)
```

The three new packages are at Layer 0 — the same layer as `@vestara/shared` and `@vestara/types`. They have zero internal dependencies and introduce no cycles.

**Invariant verified:** `node scripts/workspace-architecture.mjs --check` passes with 106 workspace projects.

---

## 3. AgentRole Normalization Table

### Source Vocabularies (from CORE-001)

| Location | Type Name | Values | Package |
|----------|-----------|--------|---------|
| `packages/workspace/src/types.ts:456-484` | `AgentRole` | 28 values | `@vestara/workspace` |
| `packages/provider-runtime/src/routing-types.ts:20` | `EngineeringAgentRole` | 6 values | `@vestara/provider-runtime` |
| `packages/agent-performance/src/performance-types.ts:10` | `AgentRole` | 6 values | `@vestara/agent-performance` |
| `apps/workspace/src/lib/routing.ts:1` | `EngineeringAgentRole` | 6 values (copy) | `@vestara/workspace-ui` |
| `apps/api/src/routes/chat.ts:164-165` | (normalization bridge) | 2 mappings | `@vestara/api` |

### Normalization Decisions

| Existing Value | Source | Canonical Value | Decision | Compatibility |
|---------------|--------|----------------|----------|---------------|
| `'architect'` | workspace, provider-runtime, agent-performance | `'architect'` | KEEP | direct — same value in all vocabularies |
| `'developer'` | workspace, provider-runtime | `'developer'` | KEEP | direct — routing uses this value |
| `'engineer'` | agent-performance | `'developer'` | MERGE | `normalizeLegacyRole('engineer') → 'developer'` |
| `'verifier'` | workspace, provider-runtime, agent-performance | `'verifier'` | KEEP | direct — same value in all vocabularies |
| `'reviewer'` | workspace, provider-runtime, agent-performance | `'reviewer'` | KEEP | direct — same value in all vocabularies |
| `'documenter'` | workspace | `'documenter'` | KEEP | workspace agent identity role |
| `'documentation'` | provider-runtime, agent-performance | N/A — not an AgentRole | RoutingRole/PerformanceRole only | `normalizeLegacyRole('documentation') → 'documenter'` |
| `'documentation-agent'` | workspace | `'documentation-agent'` | KEEP | workspace agent identity role |
| `'planning'` | workspace | `'planning'` | KEEP | workspace agent identity role |
| `'planner'` | provider-runtime, agent-performance | N/A — not an AgentRole | RoutingRole/PerformanceRole only | `normalizeLegacyRole('planner') → 'planning'` |
| `'security'` | workspace | `'security'` | KEEP | direct |
| `'devops'` | workspace | `'devops'` | KEEP | direct |
| `'testing'` | workspace | `'testing'` | KEEP | direct |
| `'ux'` | workspace | `'ux'` | KEEP | direct |
| `'performance'` | workspace | `'performance'` | KEEP | direct |
| `'database'` | workspace | `'database'` | KEEP | direct |
| `'release'` | workspace | `'release'` | KEEP | direct |
| `'governance'` | workspace | `'governance'` | KEEP | direct |
| `'conversation'` | workspace | `'conversation'` | KEEP | direct |
| `'refactoring'` | workspace | `'refactoring'` | KEEP | direct |
| `'custom'` | workspace | `'custom'` | KEEP | direct |
| `'dashboard-curator'` | workspace | `'dashboard-curator'` | KEEP | direct |
| `'frontend'` | workspace | `'frontend'` | KEEP | direct |
| `'analyst'` | workspace | `'analyst'` | KEEP | direct |
| `'tester'` | workspace | `'tester'` | KEEP | direct |
| `'continuous-tester'` | workspace | `'continuous-tester'` | KEEP | direct |
| `'security-agent'` | workspace | `'security-agent'` | KEEP | direct |
| `'performance-agent'` | workspace | `'performance-agent'` | KEEP | direct |
| `'refactoring-agent'` | workspace | `'refactoring-agent'` | KEEP | direct |
| `'release-agent'` | workspace | `'release-agent'` | KEEP | direct |
| `'context'` | workspace | `'context'` | KEEP | direct |

### Key Design Decisions

1. **Three separate type families, not one merged union.** AgentRole (28 values), RoutingRole (6 values), and PerformanceRole (6 values) are deliberately distinct types. They represent different architectural concerns:
   - AgentRole: agent identity classification
   - RoutingRole: task-category bucket for provider/model selection
   - PerformanceRole: evaluation bucket for agent performance scoring

2. **Mapping functions are explicit.** `mapAgentRoleToRoutingRole()` provides the many-to-one mapping from agent roles to routing buckets. `normalizeLegacyRole()` handles known divergences.

3. **Legacy values are not silently discarded.** The `normalizeLegacyRole()` function explicitly maps `'engineer' → 'developer'`, `'planner' → 'planning'`, `'documentation' → 'documenter'`. Unknown values return `undefined`.

---

## 4. Capability Semantic Model

### CORE-001 Findings

Five distinct concepts shared the word "capability":

| Concept | Location | Values | Purpose |
|---------|----------|--------|---------|
| `AgentCapability` | `workspace/types.ts:513-556` | 42+ (with `(string & {})`) | Agent qualification labels |
| `CAPABILITY_DESCRIPTIONS` | `workspace/agent-service.ts:17-56` | 37 entries | Human-readable metadata |
| `AgentCapabilityName` | `workspace/agent-capability.ts:17-29` | 12 filesystem ops | Filesystem operations |
| `EngineeringCapability` | `provider-runtime/routing-types.ts:1-18` | 14 values | Routing substrate capabilities |
| `Capability` | `types/capabilities.ts:47-52` | Structured (domain:category:action) | Generic capability framework |

### Canonical Separation

| Canonical Type | Package | Concept | Values |
|---------------|---------|---------|--------|
| `AgentCapability` | `@vestara/agent-types` | What an agent is qualified/intended to do | 42 values (closed) |
| `RoutingCapability` | `@vestara/routing-types` | What the execution substrate can technically perform | 14 values |
| `AgentCapabilityName` | `@vestara/workspace` (retained) | Filesystem operations with risk metadata | 12 values |
| `Capability` | `@vestara/types` (retained) | Generic structured capability framework | Structured |

### Key Design Decision: Removed `(string & {})` Escape Hatch

The legacy `AgentCapability` type used `(string & {})` which made it effectively `string` at the type level while providing autocomplete. CORE-002 intentionally removes this:

- **Rationale:** An open-ended vocabulary prevents compile-time verification of capability values. If a new capability is needed, it must be added to the canonical union explicitly.
- **Impact:** Code passing arbitrary capability strings will fail to compile. This is the desired behavior — it forces capabilities to be declared in the canonical vocabulary.
- **Migration:** Existing code using the escape hatch must either use a known capability or request addition to the canonical union.

---

## 5. Routing Vocabulary

### Canonical Types

| Type | Package | Purpose |
|------|---------|---------|
| `ProviderId` | `@vestara/routing-types` | Branded provider identity |
| `ModelId` | `@vestara/routing-types` | Branded model identity |
| `ProviderModelRef` | `@vestara/routing-types` | Provider + model reference |
| `RoutingCapability` | `@vestara/routing-types` | 14 routing-level capabilities |
| `RoleRoutingPolicy` | `@vestara/routing-types` | Per-role routing preferences |
| `EngineeringRoutingPolicy` | `@vestara/routing-types` | Full routing policy |
| `RoutingAssignment` | `@vestara/routing-types` | Task-to-provider binding |

### Runtime Neutrality

The routing vocabulary does NOT encode:
- `OpenCodeProvider` — use `ProviderId` instead
- `OpenCodeSession` — use `RuntimeSessionId` (from `@vestara/types`) instead
- `OpenCodeModel` — use `ModelId` instead

Provider/model selection is expressed through branded identity types, not runtime-specific classes.

---

## 6. Permission Vocabulary

### Canonical Types

| Type | Package | Purpose |
|------|---------|---------|
| `PermissionAction` | `@vestara/permission-contracts` | 11 governance-level actions |
| `PermissionRisk` | `@vestara/permission-contracts` | Risk classification (safe/sensitive/dangerous) |
| `PermissionStatus` | `@vestara/permission-contracts` | Request lifecycle (pending/approved/rejected/expired) |
| `PolicyDecision` | `@vestara/permission-contracts` | Three-valued decision (allow/ask/deny) |
| `PermissionRequest` | `@vestara/permission-contracts` | Permission request contract |
| `VestaraPermissionDecision` | `@vestara/permission-contracts` | Decision to communicate to runtime |

### PermissionAction Values (11)

```
read, edit, write, glob, grep, list, bash, webfetch, websearch,
external-directory, other
```

### OpenCode-Specific Tools → `other`

OpenCode tool names (`task`, `todowrite`, `lsp`, `skill`, `question`, `doom_loop`) are NOT canonical PermissionActions. They normalize to `'other'` via `normalizePermissionAction()` and are matched by policy rules using resource patterns.

### Vestara Authorization Model

```
Vestara owns authorization/policy decision
  ↓
Runtime performs bounded execution and may enforce/intercept the decision
```

The `PolicyDecision` type is the output of policy evaluation. Runtime adapters translate this into runtime-native responses (e.g., OpenCode's `'always'/'once'/'reject'`).

---

## 7. Compatibility Strategy

### Existing Consumer Migration

CORE-002 does NOT migrate existing consumers. The new packages are additive — they provide canonical types without breaking existing code. Migration happens incrementally:

1. **Phase 1 (CORE-002):** Create canonical leaf packages. Existing code continues using local types.
2. **Phase 2 (future):** Consumers import from canonical packages. Legacy types become re-exports.
3. **Phase 3 (future):** Legacy type definitions are retired.

### Compatibility Adapters

| Adapter | Location | Purpose | Retirement Condition |
|---------|----------|---------|---------------------|
| `normalizeLegacyRole()` | `agent-types/src/role-compat.ts` | Maps `'engineer'→'developer'`, `'planner'→'planning'`, `'documentation'→'documenter'` | When all consumers use canonical types |
| `mapAgentRoleToRoutingRole()` | `agent-types/src/role-compat.ts` | Maps 28 agent roles → 6 routing buckets | When routing uses canonical types |
| `normalizePermissionAction()` | `permission-contracts/src/normalize.ts` | Maps runtime action strings → canonical PermissionAction | When all consumers use canonical types |

### Do Not Scatter Aliases

All normalization is centralized in the compatibility modules. Consumers must not define their own role/capability/permission mappings.

---

## 8. Retained CORE-001 Authorities

The following CORE-001 classifications are preserved:

| Component | Classification | Status |
|-----------|---------------|--------|
| `Conversation`/`Message` in `@vestara/shared` | KEEP | Retained as-is |
| `ConversationStore` in `@vestara/conversation` | KEEP | Retained as-is |
| `Participant` in `@vestara/types` | KEEP | Retained as-is |
| `ActivityRecord`/`ActivityStore` in `@vestara/activity-room` | KEEP | Retained as-is |
| `ActivityProjectionService` in `@vestara/activity-room` | KEEP | Retained as-is |
| `Runtime` base class in `@vestara/runtime` | KEEP | Retained as-is |
| `RuntimeSessionBinding` in `@vestara/opencode-runtime` | KEEP | Retained as-is |
| `AssistantCapabilityPolicy` in `@vestara/api` | ADAPT | Extracted to `@vestara/permission-contracts` (types only) |
| `AssistantConversationSessionRegistry` in `@vestara/api` | ADAPT | Deferred to later milestone |

---

## 9. Deferred Migrations

The following are explicitly deferred and NOT part of CORE-002:

| Item | Reason |
|------|--------|
| Migrate `@vestara/workspace` to import `AgentRole` from `@vestara/agent-types` | Requires workspace package.json change; defer to Phase 2 |
| Migrate `@vestara/provider-runtime` to import from `@vestara/routing-types` | Requires provider-runtime package.json change; defer to Phase 2 |
| Migrate `apps/api/src/assistant-capability-policy.ts` to import from `@vestara/permission-contracts` | Requires api package.json change; defer to Phase 2 |
| Migrate `apps/workspace/src/lib/routing.ts` to import from `@vestara/routing-types` | Requires workspace-ui package.json change; defer to Phase 2 |
| Remove normalization bridge in `apps/api/src/routes/chat.ts:164-165` | Requires AgentDefinition to carry `routingRole` field; defer |
| Remove hardcoded role list in `apps/workspace/src/pages/activity/AgentProjectionDrawer.tsx:78-90` | Requires workspace-ui to depend on `@vestara/agent-types`; defer |
| Merge `AssistantConversationSessionRegistry` and `RuntimeSessionRegistry` | Different lifecycle concepts; defer to session convergence milestone |
| Unify SSE and WebSocket transports | Transport convergence is not part of CORE-002 |
| Redesign workflows | Out of scope |
| Redesign conversation persistence | Out of scope |

---

## 10. Verification Evidence

### Build Verification

```
$ npx tsc --noEmit  (in each package directory)
✓ @vestara/agent-types — 0 errors
✓ @vestara/routing-types — 0 errors
✓ @vestara/permission-contracts — 0 errors
```

### Test Results

```
$ npx vitest run packages/agent-types/__tests__/ agent-types.test.ts
  ✓ 37 tests passed

$ npx vitest run packages/routing-types/__tests__/routing-types.test.ts
  ✓ 9 tests passed

$ npx vitest run packages/permission-contracts/__tests__/permission-contracts.test.ts
  ✓ 17 tests passed

Total: 63 tests passed, 0 failed
```

### Dependency Boundary Verification

```
$ node scripts/workspace-architecture.mjs --check
Dependency boundaries valid across 106 workspace projects.
```

### Key Invariants Verified

1. **Canonical role vocabulary is closed and deterministic:** 28 values, no duplicates, no `(string & {})` escape hatch
2. **Legacy role normalization behaves explicitly:** `normalizeLegacyRole()` maps known divergences, returns `undefined` for unknown
3. **Capability categories cannot be accidentally conflated:** AgentCapability (42 values) ≠ RoutingCapability (14 values) ≠ AgentCapabilityName (12 filesystem ops)
4. **Runtime/provider/model identities remain runtime-neutral:** Branded `ProviderId`/`ModelId` types, no OpenCode-specific encoding
5. **Permission decisions are runtime-neutral:** `PolicyDecision` is Vestara-owned; runtime adapters translate to native format
6. **Leaf packages introduce no forbidden dependencies:** Zero `@vestara/*` dependencies in all three packages
7. **Serialization is deterministic:** All types are plain TypeScript interfaces/unions; no class instances, no circular references

---

## Completion Gate

```
[x] AgentRole has one canonical vocabulary (28 values, closed)
[x] Legacy role drift has an explicit compatibility strategy (normalizeLegacyRole)
[x] Capability semantics are no longer ambiguous (3 distinct types)
[x] Canonical Agent contract exists (AgentDefinition in @vestara/agent-types)
[x] Routing contracts are runtime-neutral (branded IDs, no OpenCode encoding)
[x] Permission contracts are runtime-neutral (PermissionAction, PolicyDecision)
[x] Leaf dependency direction is verified (0 deps, boundary check passes)
[x] Existing KEEP authorities remain intact (Conversation, Activity, Runtime)
[x] No session behavior changed
[x] No realtime transport behavior changed
[x] No runtime behavior changed
[x] Focused verification passes (63 tests, 0 failures)
[x] Architecture document exists (this file)
```

---

**Recommendation:** `READY FOR AR-GA-CORE-003`

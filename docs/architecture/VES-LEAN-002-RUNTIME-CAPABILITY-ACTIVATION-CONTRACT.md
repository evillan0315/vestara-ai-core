---
title: VES-LEAN-002 — Runtime Capability & Activation Profile Contract
version: 1.0.0
status: complete
owner: vestara
date: 2026-09-10
milestone: VES-LEAN-002
mode: architecture contract / minimal implementation
prerequisites: VES-LEAN-001, VES-LEAN-001A
---

# VES-LEAN-002 — Runtime Capability & Activation Profile Contract

## 1. Lifecycle Vocabulary

Vestara distinguishes four lifecycle states for runtime capabilities:

```
Known → Installed → Enabled → Active
```

| State | Definition |
|-------|-----------|
| **KNOWN** | Vestara understands the capability contract |
| **INSTALLED** | The implementation required to provide the capability is available |
| **ENABLED** | Policy/configuration permits the capability to be used |
| **ACTIVE** | The capability has been selected for the current runtime and its required resources have been constructed/started |

These states are **not collapsed**. A capability may be known, installed, and enabled without being active.

## 2. Ownership

| Component | Ownership |
|-----------|-----------|
| `RuntimeProfile` | `@vestara/types` (contract) + `apps/api` (resolver) |
| `CapabilityDescriptor` | `@vestara/types` |
| `ActivationPlan` | `@vestara/types` |
| `resolveActivationPlan()` | `@vestara/types` |
| `resolveRuntimeProfile()` | `apps/api/src/runtime-profile.ts` |
| `DOGFOOD_PROFILE` | `@vestara/types` |
| `FULL_PROFILE` | `apps/api/src/runtime-profile.ts` |

## 3. Requirement Dimension

Independent of activation strategy:

| Requirement | Meaning |
|-------------|---------|
| **REQUIRED** | Must be active for the selected runtime profile |
| **OPTIONAL** | May be active; not required by the surface |
| **DISABLED** | Must NOT be active for the selected runtime profile |

## 4. Activation Dimension

Independent of requirement classification:

| Activation | Meaning |
|-----------|---------|
| **EAGER** | Constructed and started during boot |
| **LAZY** | Constructed on first use, not at boot |
| **NONE** | Never constructed; no resources allocated |

## 5. Valid Combinations

| Requirement | Activation | Semantics |
|-------------|-----------|-----------|
| REQUIRED | EAGER | Must be active, constructed at boot |
| REQUIRED | LAZY | Must be active, constructed on first use |
| OPTIONAL | EAGER | May be active, constructed at boot |
| OPTIONAL | LAZY | May be active, constructed on first use |
| OPTIONAL | NONE | Not active, not constructed |
| DISABLED | NONE | Must not be active, never constructed |

## 6. RuntimeProfile Contract

```typescript
interface RuntimeProfile {
  readonly id: string;           // e.g. 'dogfood', 'full'
  readonly name: string;
  readonly description: string;
  readonly capabilities: readonly CapabilityDescriptor[];
}

interface CapabilityDescriptor {
  readonly id: string;           // e.g. 'global-assistant'
  readonly name: string;
  readonly requirement: CapabilityRequirement;
  readonly activation: CapabilityActivation;
  readonly dependencies?: readonly string[];
}

interface ActivationPlan {
  readonly profileId: string;
  readonly eager: readonly string[];
  readonly lazy: readonly string[];
  readonly disabled: readonly string[];
  readonly unsatisfied: readonly string[];
}
```

## 7. Dogfood Profile

The dogfood profile defines the minimal production surface:

### REQUIRED / EAGER

- **Shared Core**: kernel, configuration, logger, metrics, event-bus, service-registry, health, permissions, recovery, task-scheduler, job-scheduler, worker-manager, job-manager
- **Global Assistant**: global-assistant, conversation, workspace-runtime, provider-resolution, agent-harness, tool-runtime, evidence, memory, interaction, worktree, thread-store, engineering-events, routing, workflow-orchestrator, plans-db
- **Activity Room**: activity-room, m9-ingestion, m11a-api, m11b-websocket, agent-lifecycle-bridge
- **Diagnostics**: diagnostics

### REQUIRED / LAZY

- verification (required but not needed at boot)

### OPTIONAL / EAGER

- engineering-memory, documentation, marketplace

### DISABLED / NONE

- **boot-runtime** (proven unnecessary by VES-LEAN-001A)
- **host-runtime** (OS-0 integration, not needed for dogfood)
- **browser-runtime** (browser tools available but not required)
- **telegram** (not part of dogfood surface)
- **opencode-go-provider** (not needed for dogfood)
- **openai-provider** (not needed for dogfood)
- **worker-cluster** (single-node dogfood)
- **dashboard-runtime** (no dashboard needed)

## 8. Dependency Resolution

`resolveActivationPlan()` implements:

1. **Direct classification**: Map each capability's requirement+activation to eager/lazy/disabled/unsatisfied
2. **Transitive resolution**: REQUIRED dependencies of REQUIRED capabilities become REQUIRED
3. **Unsatisfied detection**: If a REQUIRED dependency is DISABLED, the parent is marked unsatisfied

The algorithm is deterministic and produces the same plan for the same profile input.

## 9. Composition Seam

The composition seam is in `createWorkspaceContext()` (`apps/api/src/workspace-context.ts`):

```typescript
const { resolveRuntimeProfile } = await import('./runtime-profile.js');
const { profile, plan } = resolveRuntimeProfile(process.env);
```

This resolves the profile **before any service construction**. The activation plan is available for VES-LEAN-003 to gate service construction.

**Current state**: The seam resolves and logs only. Composition remains monolithic. VES-LEAN-003 will use the plan to gate construction.

## 10. Lazy Activation Semantics

LAZY does NOT mean optional. A capability may be REQUIRED/LAZY:

- Must be active for the runtime surface
- Constructed on first use, not at boot
- Must have a defined activation path (not unreachable)

Example: `verification` is REQUIRED (the execution contract needs it) but LAZY (not needed until verification is actually invoked).

## 11. Provider Activation Semantics

Provider activation is represented within the capability framework:

- `provider-resolution` — REQUIRED/EAGER (routing infrastructure)
- `opencode-go-provider` — DISABLED/NONE (not needed for dogfood)
- `openai-provider` — DISABLED/NONE (not needed for dogfood)
- The primary OpenCode provider is part of `provider-resolution`

This does NOT redesign provider routing. It merely makes it possible for a provider implementation to exist without being activated during boot.

## 12. Route Lifecycle Semantics

A DISABLED/NONE capability should not expose operational routes. VES-LEAN-003 will use the activation plan to gate route registration:

- Routes for DISABLED capabilities → not registered
- Routes for LAZY capabilities → registered but handler deferred
- Routes for EAGER capabilities → registered and active

## 13. Background Resource Ownership

Capability activation governs ownership of:

| Resource | Gating |
|----------|--------|
| Stores/databases | Only open for EAGER capabilities |
| Child processes | Only spawn for EAGER capabilities |
| Timers/intervals | Only start for EAGER capabilities |
| Watchers | Only start for EAGER capabilities |
| Sockets/WebSockets | Only create for EAGER capabilities |
| Bridges | Only subscribe for EAGER capabilities |
| Event subscriptions | Only subscribe for EAGER capabilities |
| Providers | Only load for EAGER providers |

## 14. Dogfood Minimum Set

Based on source evidence:

| Capability | Why Required |
|-----------|-------------|
| Kernel core (12 services) | Unavoidable shared infrastructure |
| WorkspaceRuntime | Workspace identity, discovery |
| ConversationService | Global Assistant conversations |
| AgentHarnessRuntime | Agent execution loop |
| ProviderManager + OpenCode | Primary AI model access |
| ToolRuntime | Tool invocation |
| FileThreadStore | Thread persistence |
| EvidencePipeline | Verification evidence |
| MemoryService | Knowledge graph |
| InteractionService | Approval flow |
| M9IngestionBridge | Activity Room ingestion |
| DurableActivityStore | Activity Room persistence |
| ProjectionRuntime | Activity Room projection |
| ActivityStreamHub | Activity Room WebSocket |
| M11A + M11B | Activity Room API + realtime |
| AgentLifecycleBridge | Agent events → Activity Room |
| Plans DB + Storage | Engineering artifacts |
| Diagnostics routes | Runtime inspection |

## 15. OS Boot Runtime Classification

**Evidence-based classification: DISABLED / NONE for dogfood.**

VES-LEAN-001A confirmed:
- `bootRuntime` is NOT used in Global Assistant golden path
- `bootRuntime` is NOT used in Activity Room
- `bootRuntime` is NOT used in Diagnostics
- `bootRuntime` is only consumed by `GET /api/boot` (read-only observer)
- No service declares a runtime dependency on `boot-runtime`
- `bootRuntime` is a required field on `WorkspaceContext` but only read by `routes/host.ts`

Boot Runtime is an OS-0 integration concern, not a dogfood runtime requirement.

## 16. Activity Room Persistence Debt

VES-LEAN-001 identified two Activity Room persistence paths:
- `activity.db` (legacy)
- `m9-activity.db` (M11A production)

This milestone does NOT consolidate, delete, or migrate them. This is explicit architectural debt for a separate ownership decision. The runtime profile does not choose between persistence authorities.

## 17. Migration Plan for VES-LEAN-003

VES-LEAN-003 will:

1. **Gate kernel services**: Skip registration of services whose capability is DISABLED
2. **Gate provider loading**: Only load providers whose capability is ACTIVE
3. **Gate bridge creation**: Only create bridges for ACTIVE capabilities
4. **Gate route registration**: Only register routes for ACTIVE capabilities
5. **Gate store opening**: Only open databases for ACTIVE capabilities
6. **Measure boot improvement**: Compare full vs dogfood boot times

## 18. Invariants

1. **Known != Installed != Enabled != Active** — lifecycle states are not collapsed
2. **Requirement and Activation are independent** — REQUIRED/LAZY is valid
3. **Profile is not authority** — RuntimeProfile selects activation, not implementation
4. **No duplicate capability authority** — profile is a pure data contract
5. **Dependency resolution is deterministic** — same input produces same plan
6. **Default behavior preserved** — `full` profile maintains current monolithic behavior
7. **Dogfood is explicitly selectable** — `VESTARA_RUNTIME_PROFILE=dogfood` env var
8. **Disabled capabilities are excluded before construction** — no wasted resources
9. **Lazy required capabilities remain reachable** — defined activation path exists
10. **Boot Runtime classified independently** — no forced coupling to Diagnostics

## 19. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Disabling Boot Runtime may break health gate | MEDIUM | `bootRuntime.advance()` calls will need bypass or stub in dogfood |
| WorkspaceContext requires `bootRuntime` field | LOW | Make optional or provide stub for dogfood |
| Existing tests may assume full profile | LOW | Default is `full`; dogfood is opt-in |
| Dependency resolution may miss implicit deps | MEDIUM | Audit in VES-LEAN-003 before broad migration |

## 20. Verification Evidence

| Check | Result |
|-------|--------|
| 26 contract tests pass | ✅ CONFIRMED |
| 11 resolver tests pass | ✅ CONFIRMED |
| 190 types package tests pass | ✅ CONFIRMED |
| Build succeeds | ✅ CONFIRMED |
| Boot Runtime independently classifiable | ✅ CONFIRMED |
| Dogfood profile has zero unsatisfied deps | ✅ CONFIRMED |
| Default profile preserves current behavior | ✅ CONFIRMED |
| No duplicate capability authority | ✅ CONFIRMED |
| Activity Room persistence untouched | ✅ CONFIRMED |
| FileBootStateStore not modified | ✅ CONFIRMED |

---

> **VES-LEAN-002 FREEZE READY**

---

## Appendix — Acceptance & Frozen Constraints

> **Accepted**: 2026-09-10
> **Status**: FROZEN — do not redesign or replace

### Frozen Architecture

The following is authoritative. Do not introduce alternatives:

| Component | Location | Status |
|-----------|----------|--------|
| `RuntimeProfile` contract | `packages/types/src/runtime-profile.ts` | FROZEN |
| `DOGFOOD_PROFILE` | `packages/types/src/runtime-profile.ts` | FROZEN |
| `resolveActivationPlan()` | `packages/types/src/runtime-profile.ts` | FROZEN |
| API profile resolver | `apps/api/src/runtime-profile.ts` | FROZEN |
| `FULL_PROFILE` | `apps/api/src/runtime-profile.ts` | FROZEN |
| Composition seam | `apps/api/src/workspace-context.ts` | FROZEN |
| `VESTARA_RUNTIME_PROFILE` env var | Selection mechanism | FROZEN |
| Default: `full` | Backward compatibility | FROZEN |

### Do NOT Introduce

- Another `RuntimeProfile`
- Another `CapabilityRegistry`
- Another activation store
- Another feature-flag system
- Package-local environment gates

All dogfood gating must derive from the canonical resolved `ActivationPlan`.

### Frozen Classifications

These classifications are proven by source evidence. Do not casually reclassify:

| Capability | Requirement | Activation | Evidence |
|-----------|-------------|-----------|----------|
| Boot Runtime | DISABLED | NONE | VES-LEAN-001A: no runtime deps from GA/AR/Diagnostics |
| Telegram | DISABLED | NONE | Not part of dogfood surface |
| Browser Runtime | DISABLED | NONE | Not required for dogfood |
| Host Runtime | DISABLED | NONE | OS-0 integration only |
| OpenCode Go Provider | DISABLED | NONE | Not needed for dogfood |
| OpenAI Provider | DISABLED | NONE | Not needed for dogfood |
| Verification | REQUIRED | LAZY | Required by execution contract, not at boot |
| Provider Resolution | REQUIRED | EAGER | Primary AI model access |

If source evidence contradicts a classification, **STOP and report** rather than silently changing the frozen profile.

### Boot Runtime Invariant

VES-LEAN-001A measured `FileBootStateStore.save()` → `fs.access()` taking ~34–38 seconds. VES-LEAN-002 proved Boot Runtime is not a transitive dogfood dependency. Therefore dogfood must **prevent this path from being reached**.

- Do NOT optimize `FileBootStateStore`
- Do NOT replace `fs.access()`
- Do NOT cache around it
- **Prove** that dogfood does not construct/advance the inactive Boot Runtime

### DISABLED Means Absent

For DISABLED/NONE capabilities, prove where applicable:

```
constructor     0
store opens     0
workers         0
timers          0
watchers        0
subscriptions   0
routes          0
provider init   0
child processes 0
```

"Constructed but not started" is NOT sufficient parking.

### LAZY Means Reachable

For REQUIRED/LAZY capabilities:

- Do not eagerly initialize unnecessarily
- Preserve a canonical demand-time activation path
- Prove the capability remains reachable
- Do not turn LAZY into accidental disablement

### Performance Gate

After runtime gating, measure API startup separately from build/test:

| Metric | Full Profile | Dogfood Profile |
|--------|-------------|-----------------|
| Startup time | baseline | target: eliminate ~35s stall |
| FileBootStateStore stall | ~34–38s | prove: 0 (path not reached) |

Do not claim improvement because the code path "appears" gated. **Measure it.**

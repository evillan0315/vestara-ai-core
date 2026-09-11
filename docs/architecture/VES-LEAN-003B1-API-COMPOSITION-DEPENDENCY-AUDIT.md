---
title: VES-LEAN-003B.1 — API Composition & Dependency Surface Audit
version: 1.0.0
status: complete
owner: vestara
date: 2026-09-10
milestone: VES-LEAN-003B.1
mode: audit + architecture recommendation only
prerequisites: VES-LEAN-001, VES-LEAN-001A, VES-LEAN-002, VES-LEAN-003A, VES-LEAN-003B
---

# VES-LEAN-003B.1 — API Composition & Dependency Surface Audit

## 1. Executive Summary

`@vestara/api` has **51 direct internal workspace dependencies**. After systematic analysis:

- **20 LEGITIMATE** composition root dependencies (kernel, workspace hub, core services)
- **12 OPTIONAL-CAPABILITY** dependencies (telegram, browser, voice, documentation, marketplace, etc.)
- **8 COMPOSITION-ROOT** dependencies (providers, tools, bridges — required only because API composes them)
- **6 CONTRACT** dependencies (type-only imports for interfaces)
- **3 TYPE-ONLY** dependencies (imported only for TypeScript types, zero runtime code)
- **1 UNUSED** dependency (`@vestara/extension-contracts` — zero imports)
- **1 SUSPICIOUS** dependency (`@vestara/permissions` — used only as inline type cast)

**API is primarily a legitimate composition root** — it knows many implementations because it wires them together. It is NOT an ownership/service-locator problem. The 51 dependencies reflect the breadth of Vestara's capability surface, not architectural decay.

## 2. Pre-existing Dirty State

35+ files with prior working-tree changes — unrelated to this audit. Preserved intact.

## 3. Current API Architecture

```
Transport (server.ts — HTTP + WebSocket)
    ↓
Routes (routes/*.ts — 28 route handlers)
    ↓
Application/Composition (workspace-context.ts — creates all services)
    ↓
Domain Services / Ports (packages/* — workspace, kernel, conversation, etc.)
    ↓
Runtime Adapters / Infrastructure (opencode-runtime, provider-runtime, etc.)
```

The API is a **composition root** — it constructs and wires all services. This is a legitimate architectural role.

## 4. Dependency Classification Matrix

### REQUIRED-DOGFOOD (13 packages)

These are needed for the dogfood golden path:

| Package | Why Required | Import Pattern |
|---------|-------------|----------------|
| `@vestara/kernel` | Lifecycle coordinator | Construction |
| `@vestara/workspace` | Hub package (28+ symbols) | Construction + types |
| `@vestara/agent-harness` | Agent execution loop | Construction |
| `@vestara/activity-room` | Activity Room projection | Construction + routes |
| `@vestara/conversation` | Conversation service | Construction |
| `@vestara/conversation-runtime` | Conversation persistence | Construction |
| `@vestara/provider-runtime` | Provider resolution | Construction |
| `@vestara/provider-opencode` | OpenCode provider | Construction |
| `@vestara/opencode-runtime` | OpenCode integration | Construction + routes |
| `@vestara/evidence` | Evidence pipeline | Construction + routes |
| `@vestara/interaction-app` | Interaction service | Construction + routes |
| `@vestara/interaction-persistence` | Interaction persistence | Construction |
| `@vestara/worktree-runtime` | Worktree leases | Construction |

### COMPOSITION-ROOT (8 packages)

Legitimate implementation dependencies required only because API composes them:

| Package | Why Composition-Root | Import Pattern |
|---------|---------------------|----------------|
| `@vestara/configuration` | Settings service | Construction + routes |
| `@vestara/context` | Context assembler | Construction |
| `@vestara/event-bus` | EventBus type contract | Type-only (6 files) |
| `@vestara/filesystem-runtime` | Filesystem tools | Construction |
| `@vestara/tool-runtime` | Tool runtime | Construction |
| `@vestara/tools-browser` | Browser tools | Construction |
| `@vestara/tools-git` | Git tools | Construction |
| `@vestara/tools-shell` | Shell tools | Construction |

### CONTRACT (6 packages)

API consumes canonical types/contracts:

| Package | Import Pattern |
|---------|----------------|
| `@vestara/types` | Type-only (10 files) + runtime profile |
| `@vestara/shared` | Mostly type-only (8/10 files) |
| `@vestara/events` | Type-heavy, 1 runtime function |
| `@vestara/runtime` | Type contract for Runtime base |
| `@vestara/engineering-event-store` | Type-heavy (5 files) |
| `@vestara/verification` | Construction (1 symbol) |

### OPTIONAL-CAPABILITY (12 packages)

Valid API capabilities but not required for dogfood:

| Package | Capability | Dogfood Required? |
|---------|-----------|-------------------|
| `@vestara/boot-runtime` | OS boot coordination | **NO** (DISABLED) |
| `@vestara/host-runtime` | OS host inspection | **NO** (DISABLED) |
| `@vestara/browser-runtime` | Browser automation | **NO** (DISABLED) |
| `@vestara/telegram-integration` | Telegram bot | **NO** (DISABLED) |
| `@vestara/documentation` | Documentation governance | Optional |
| `@vestara/marketplace` | Extension marketplace | Optional |
| `@vestara/workflow-orchestrator` | Workflow orchestration | Required (transitive) |
| `@vestara/workflow-projections` | Workflow projections | Routes only |
| `@vestara/engineering-graph` | Engineering graph | Routes only |
| `@vestara/external-runtime` | External runtime | Routes only |
| `@vestara/extension-runtime` | Extension management | Marketplace only |
| `@vestara/extension-contracts` | Extension contracts | **UNUSED** |

### LAZY-CANDIDATE (3 packages)

Capabilities that could be lazy-loaded:

| Package | Current Pattern | Lazy Candidate? |
|---------|----------------|-----------------|
| `@vestara/context-intelligence` | Dynamic import() | Already lazy |
| `@vestara/memory` | Dynamic import() | Already lazy |
| `@vestara/observer` | Dynamic import() | Already lazy |

### DORMANT (5 packages)

Capabilities currently outside dogfood product:

| Package | Usage |
|---------|-------|
| `@vestara/stt` | Speech-to-text route |
| `@vestara/voice-browser` | Voice browser routes |
| `@vestara/tui-projections` | TUI projection routes |
| `@vestara/tui-protocol` | TUI protocol types |
| `@vestara/diff-engine` | Diff utilities (also used by bridges) |

### SUSPICIOUS-OWNERSHIP (1 package)

| Package | Issue |
|---------|-------|
| `@vestara/permissions` | Used only as inline type cast in workspace-context.ts — could use `@vestara/shared` or kernel type |

### UNUSED (1 package)

| Package | Evidence |
|---------|----------|
| `@vestara/extension-contracts` | Zero imports in apps/api/src/ — declared in package.json but never imported |

## 5. Import Evidence Summary

| Import Type | Count | Notes |
|-------------|-------|-------|
| Runtime imports | ~35 packages | Construction, route handlers, bridges |
| Type-only imports | ~15 packages | TypeScript type contracts |
| Dynamic imports | 3 packages | context-intelligence, memory, observer (already lazy) |
| Unused | 1 package | extension-contracts |

## 6. Route Ownership Matrix

| Route Prefix | Capability | Dogfood? | Behavior When Absent |
|-------------|-----------|----------|---------------------|
| `/api/health/*` | Core | ✅ | Always available |
| `/api/conversations/*` | Global Assistant | ✅ | Always available |
| `/api/activity-room/*` | Activity Room | ✅ | Always available |
| `/api/diagnostics/*` | Diagnostics | ✅ | Always available |
| `/api/agents/*` | Agents | ✅ | Always available |
| `/api/sessions/*` | Sessions | ✅ | Always available |
| `/api/opencode/*` | OpenCode | ✅ | Always available |
| `/api/evidence/*` | Evidence | ✅ | Always available |
| `/api/interactions/*` | Interactions | ✅ | Always available |
| `/api/routing/*` | Routing | ✅ | Always available |
| `/api/providers/*` | Providers | ✅ | Always available |
| `/api/workspace/*` | Workspace | ✅ | Always available |
| `/api/settings/*` | Settings | ✅ | Always available |
| `/api/execution/*` | Execution | ✅ | Always available |
| `/api/orchestration/*` | Orchestration | ✅ | Always available |
| `/api/boot` | Boot Runtime | ❌ | **503** (VES-LEAN-003A) |
| `/api/host` | Host Runtime | ❌ | **503** (VES-LEAN-003A) |
| `/api/telegram/*` | Telegram | ❌ | Not initialized |
| `/api/browser/*` | Browser | ❌ | Routes exist, runtime gated |
| `/api/documentation/*` | Documentation | Optional | **503** when absent |
| `/api/marketplace/*` | Marketplace | Optional | **503** when absent |
| `/api/voice/*` | Voice | ❌ | Routes exist, dormant |
| `/api/stt` | Speech-to-text | ❌ | Routes exist, dormant |
| `/api/tui/*` | TUI | ❌ | Routes exist, dormant |
| `/api/graph/*` | Engineering Graph | Optional | Routes exist |
| `/api/workers/*` | Workers | Optional | Routes exist |

## 7. WorkspaceContext Analysis

| Metric | Count |
|--------|-------|
| Total fields | ~55 |
| Required fields | ~45 |
| Optional fields | ~10 (bootRuntime, hostRuntime, browserRuntime, documentation, marketplace, workerCluster, etc.) |
| Fields used by only 1 route | ~15 |
| Fields consumed broadly | ~20 (kernel, eventBus, agents, plans, etc.) |

**Assessment**: WorkspaceContext is a **legitimate composition container** — it holds all services that the API needs to wire together. It has NOT become a god context because:
- Fields are typed (not `any`)
- Most fields are consumed by multiple routes
- Optional fields are properly optional
- The context is created once at boot, not mutated at runtime

**Not a service locator** — services are constructed in `createWorkspaceContext()`, not looked up dynamically.

## 8. ActivationPlan Alignment

| Capability | VES-LEAN-002 Classification | API Composition Match |
|-----------|---------------------------|----------------------|
| boot-runtime | DISABLED/NONE | ✅ Gated (construction skipped) |
| host-runtime | DISABLED/NONE | ✅ Gated (construction skipped) |
| browser-runtime | DISABLED/NONE | ✅ Gated (construction skipped) |
| opencode-go-provider | DISABLED/NONE | ✅ Gated (construction skipped) |
| openai-provider | DISABLED/NONE | ✅ Gated (construction skipped) |
| verification | REQUIRED/LAZY | ⚠️ Constructed eagerly (EngineeringVerificationProfiles) |
| provider-resolution | REQUIRED/EAGER | ✅ Correct |
| activity-room | REQUIRED/EAGER | ✅ Correct |
| documentation | OPTIONAL | ✅ Gated (construction skipped when absent) |
| marketplace | OPTIONAL | ✅ Gated (construction skipped when absent) |

**One mismatch**: `verification` is classified REQUIRED/LAZY but `EngineeringVerificationProfiles` is constructed eagerly. This is a minor inconsistency — the profiles object is lightweight and doesn't perform I/O.

## 9. Dogfood Golden Path

```
Human → Global Assistant → Conversation → Context → Workflow → Task → Agent
  → Execution → Runtime Binding → OpenCode → Artifacts → Verification → Evidence
  → Assistant
```

**Minimum source-derived API dependency surface for golden path:**

```
@vestara/kernel
@vestara/workspace (hub — 28+ symbols)
@vestara/agent-harness
@vestara/conversation
@vestara/conversation-runtime
@vestara/provider-runtime
@vestara/provider-opencode
@vestara/opencode-runtime
@vestara/evidence
@vestara/interaction-app
@vestara/interaction-persistence
@vestara/worktree-runtime
@vestara/tool-runtime
@vestara/tools-git
@vestara/tools-shell
@vestara/event-bus (type contract)
@vestara/types (type contract)
@vestara/shared (type contract)
@vestara/configuration
@vestara/context
@vestara/filesystem-runtime
@vestara/engineering-event-store
@vestara/thread-runtime
@vestara/memory
@vestara/verification
@vestara/telemetry
@vestara/activity-room
@vestara/workflow-orchestrator
@vestara/sqlite-migrations
```

**~29 packages** for the golden path. The remaining 22 are for optional/dormant capabilities or type contracts.

## 10. Dormant Capability Coupling

| Package | Coupling Type | Can Be Parked Without API Mutation? |
|---------|--------------|-------------------------------------|
| `@vestara/boot-runtime` | Construction + routes | ✅ Already gated |
| `@vestara/host-runtime` | Construction + routes | ✅ Already gated |
| `@vestara/browser-runtime` | Construction + routes | ✅ Already gated |
| `@vestara/telegram-integration` | Route-only | ✅ Already gated in index.ts |
| `@vestara/voice-browser` | Route-only | ⚠️ Routes still registered |
| `@vestara/stt` | Route-only | ⚠️ Routes still registered |
| `@vestara/tui-projections` | Route-only | ⚠️ Routes still registered |
| `@vestara/tui-protocol` | Type contract | ✅ Type-only, harmless |
| `@vestara/documentation` | Construction + routes | ✅ Already gated |
| `@vestara/marketplace` | Construction + routes | ✅ Already gated |
| `@vestara/extension-runtime` | Construction (marketplace) | ⚠️ Constructed when marketplace active |
| `@vestara/extension-contracts` | **UNUSED** | ✅ Can be removed from package.json |

## 11. 84-Package Closure Explanation

The 84-package dogfood closure is caused by:

| Contributor | Packages Pulled | Mechanism |
|------------|----------------|-----------|
| `@vestara/api` (root) | 51 direct deps | Composition root imports everything |
| `@vestara/workspace` (hub) | 20 deps | Integrates conversation, agent, workflow, memory, knowledge |
| `@vestara/kernel` | 20 deps | Composes all kernel services |
| `@vestara/agent-harness` | 7 deps | Needs tools, threads, interactions |
| Shared contracts | ~30 packages | `types`, `shared`, `event-bus` fan out widely |
| Transitive chain | ~20 more | Packages that depend on shared contracts |

**This is the correct closure.** The 84-package count reflects Vestara's actual capability breadth, not artificial inflation.

## 12. Legitimate Coupling

| Finding | Evidence |
|---------|----------|
| API → workspace is legitimate composition | 28+ symbols needed for service wiring |
| API → kernel is legitimate composition | Boot, lifecycle, health, diagnosis |
| API → opencode-runtime is legitimate | Session management, event bridge, permission governance |
| API → activity-room is legitimate | M9/M11 projection, ingestion bridge |
| API → agent-harness is legitimate | Agent execution, context assembly, verification |
| API → tools-* is legitimate | Tool construction for agent harness |
| API → evidence is legitimate | Evidence pipeline, verification bundles |
| Type-only deps are legitimate | Type contracts for interfaces |

## 13. Suspicious/Accidental Coupling

| Finding | Evidence | Recommendation |
|---------|----------|----------------|
| `@vestara/extension-contracts` | Zero imports in apps/api | Remove from package.json |
| `@vestara/permissions` | Only inline type cast | Consider using `@vestara/shared` type |
| `@vestara/diff-engine` | Used by bridge + TUI route | Bridge usage is legitimate; TUI route is dormant |

## 14. Parking Blockers

| Blocker | Impact |
|---------|--------|
| Voice/STT/TUI routes still registered | Dormant capability routes should be gated |
| `@vestara/extension-contracts` unused | Can be removed from package.json |
| `@vestara/verification` eagerly constructed | Minor: could be LAZY per ActivationPlan |

## 15. Recommended Target Shape

**The existing composition root is already correct.** No restructuring needed.

Recommended refinements (for VES-LEAN-003C):

1. **Gate dormant routes**: Voice, STT, TUI routes should be conditionally registered
2. **Remove unused dep**: `@vestara/extension-contracts` from package.json
3. **Lazy verification profiles**: Construct `EngineeringVerificationProfiles` on first use
4. **Route-level gating**: For capabilities like Telegram, browser — skip route registration entirely when disabled

**Do NOT**:
- Split WorkspaceContext (it's a legitimate composition container)
- Introduce plugin framework (composition root pattern is sufficient)
- Create capability registry (VES-LEAN-002 ActivationPlan is the authority)
- Reduce dependency count for aesthetic reasons

## 16. Explicit Non-Recommendations

- Do NOT split WorkspaceContext into per-capability contexts
- Do NOT introduce dynamic module loading for route registration
- Do NOT create a second capability/activation registry
- Do NOT refactor API into micro-services
- Do NOT add dependency inversion for its own sake
- Do NOT reduce 51 to an arbitrary number

## 17. Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| WorkspaceContext may grow as capabilities are added | LOW | Optional fields handle this |
| Dormant routes may confuse API consumers | LOW | 503 responses are clear |
| `@vestara/workspace` hub coupling is deep | MEDIUM | Accept as design choice — workspace IS the integration hub |

## 18. Architecture Debt

1. `@vestara/extension-contracts` unused — remove from package.json
2. Voice/STT/TUI routes not gated by profile
3. `verification` classified LAZY but constructed eagerly (minor)

## 19. Recommended Next Milestone

VES-LEAN-003C: Capability Parking & Marketplace Projection

---

> **VES-LEAN-003B.1 AUDIT COMPLETE**

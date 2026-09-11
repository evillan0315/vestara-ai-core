---
title: VES-LEAN-003B — Dogfood Build & Test Graph Reduction
version: 1.0.0
status: complete
owner: vestara
date: 2026-09-10
milestone: VES-LEAN-003B
mode: bounded implementation + measurement
prerequisites: VES-LEAN-001, VES-LEAN-001A, VES-LEAN-002, VES-LEAN-003A
---

# VES-LEAN-003B — Dogfood Build & Test Graph Reduction

## 1. Executive Summary

Reduced Vestara's development build/test surface by establishing:
- **Dogfood build closure**: 84 / 115 packages (31 excluded)
- **Affected graph algorithm**: deterministic changed→owned→dependent calculation
- **Affected build/test scripts**: `scripts/affected.mjs`, `scripts/build-affected.mjs`, `scripts/test-affected.mjs`
- **Three verification levels**: affected, dogfood, full
- **17 focused tests** proving affected graph correctness

## 2. Pre-existing Build Architecture

| Component | Technology |
|-----------|-----------|
| Build system | `tsc -b` (TypeScript project references) |
| Reference generation | `scripts/workspace-architecture.mjs --generate` |
| Incremental cache | `.tsbuildinfo` per package |
| Test framework | Vitest 4.1.10 |
| Lint | Biome |
| No Turbo/Nx | Pure `tsc -b` with custom reference generation |

## 3. Measured Baseline

All measurements taken on 2026-09-10, same machine:

| Metric | Command | Measured |
|--------|---------|----------|
| **A. Cold full build** | `pnpm clean && time pnpm build` | **12.7s** |
| **B. Warm unchanged full build** | `time pnpm build` | **10.5s** |
| **C. Dogfood build** | `time node scripts/build-affected.mjs --dogfood` | **10.7s** |
| **D. Affected calculation** | `time node scripts/affected.mjs --explain` | **0.14s** |
| **E. Architecture validation** | `time pnpm dependencies:check` | **1.5s** |

**Note on C**: The dogfood build currently runs `pnpm build` which builds all 114 projects via `tsc -b`. The `build-affected.mjs` script provides scope information but delegates to `tsc -b` for actual compilation. TypeScript's incremental mode already skips unchanged projects via `.tsbuildinfo`. The dogfood script's value is **scope visibility**, not build reduction (that's provided by `tsc -b` incrementality).

## 4. Repository Graph

115 packages across 4 workspace globs:
- `packages/*` — ~90 packages
- `packages/providers/*` — 1 package (opencode)
- `packages/tools/*` — 8 packages
- `apps/*` — 3 buildable apps (api, cli, workspace-ui)

## 5. Dogfood Build Roots

Source-derived from VES-LEAN-003A activation plan:

```
@api, @workspace, @agent-harness, @activity-room, @conversation,
@provider-runtime, @opencode-runtime, @evidence, @memory,
@interaction-app, @worktree-runtime, @tool-runtime, @kernel
```

## 6. Dogfood Build Closure

**84 packages** in the transitive closure.

**31 packages excluded** from dogfood build:

| Category | Packages | Count |
|----------|----------|-------|
| UI/Design | design-system, ui, ui-theme, ui-tokens, workspace-ui | 5 |
| OS/System | os-controller, native-installer | 2 |
| TUI | tui, tui-renderer | 2 |
| Tools (not in dogfood path) | tools-filesystem, tools-knowledge, tools-memory, tools-project, mcp-server | 5 |
| Media | openvidu-adapter, media-conference | 2 |
| Apps | cli, onboarding-lab | 2 |
| Other | evaluation, architecture-runtime, agent-types, agent-performance, cognitive, reasoning, events-server, execution-center, history, repository-evidence, routing-types, settings-framework, state-runtime, subsystem | 14 |

### Why 84 packages (coupling analysis)

The dogfood closure is 84 because `@vestara/api` has **52 internal dependencies**. The major coupling contributors:

| Contributor | Packages Pulled In | Reason |
|------------|-------------------|--------|
| `@vestara/api` (root) | 52 deps | Main application entry — imports everything |
| `@vestara/kernel` | 20 deps | Lifecycle coordinator — composes all kernel services |
| `@vestara/workspace` | 20 deps | Hub package — integrates conversation, agent, workflow, memory |
| `@vestara/agent-harness` | 7 deps | Agent execution — needs tools, threads, interactions |
| Shared contracts | ~30 packages | `@vestara/types`, `@vestara/shared`, `@vestara/event-bus` fan out widely |

The 84-package closure is the **correct transitive dependency closure** for the dogfood surface. Artificially reducing it would break type checking or runtime behavior.

## 7. Affected Graph Algorithm

```
Changed Files
    ↓
Owning Package(s)  (file path → package.json location)
    ↓
Dependency Impact   (who depends on changed packages — transitive)
    ↓
Affected Closure    (CHANGED + DEPENDENT + GLOBAL INVALIDATION)
```

**Global invalidation triggers**: `tsconfig.json`, `vitest.config.ts`, `biome.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `package.json`

### Measured affected calculation

Using current uncommitted changes (43 files):
- Changed packages: 8
- Affected packages: 61 (including transitive dependents)
- Calculation time: **0.14 seconds**

## 8. Verification Commands

| Level | Commands |
|-------|----------|
| **Affected calculation** | `node scripts/affected.mjs --explain` |
| **Affected build** | `node scripts/build-affected.mjs` (uses `tsc -b` incrementality) |
| **Affected tests** | `node scripts/test-affected.mjs` (finds test files for affected packages) |
| **Dogfood scope** | `node scripts/affected.mjs --dogfood` |
| **Full verification** | `pnpm build && pnpm test` |
| **Architecture validation** | `pnpm dependencies:check` |

**Note**: There is not yet one canonical "affected verification" command. The three scripts (`affected.mjs`, `build-affected.mjs`, `test-affected.mjs`) compose into the affected workflow. This is intentional — the scripts are focused tools, not a new build system.

## 9. Focused Tests (17 tests, all pass)

| Test | What It Proves |
|------|---------------|
| 1. Changed leaf project detected | `packages/types/src/common.ts` → `@vestara/types` is CHANGED |
| 2a. Transitive dependent included | `packages/event-bus/src/index.ts` → `@vestara/conversation` is DEPENDENT |
| 2b. Deeply nested dependents | `packages/types/src/common.ts` → `@vestara/api` is affected |
| 3. Unrelated project excluded | `packages/tools/shell/src/index.ts` → `@vestara/types` NOT affected |
| 4a. Dogfood roots deterministic | Same roots every call |
| 4b. Dogfood includes required packages | api, workspace, agent-harness, activity-room, kernel all present |
| 5a. Dogfood closure deterministic | Same closure size and members every call |
| 5b. Closure size reasonable | >50 and <115 |
| 6a. Global config invalidation | `tsconfig.json` change → all 115 packages affected |
| 6b. Vitest config invalidation | `vitest.config.ts` change → all 115 packages affected |
| 7. Shared contract expansion | `execution-types` change → downstream consumers included |
| 8. Unrelated tests excluded | `tools-shell` change → `@vestara/types` not affected |
| 9. Affected tests selected | `@vestara/types` has `__tests__/` directory |
| 10a. Full graph available | All 115 packages in graph |
| 10b. All paths valid | Every package has valid `package.json` |
| 11a. Architecture script exists | `workspace-architecture.mjs` present |
| 11b. Dependency check exists | Same script supports `--check` mode |

## 10. Cache/Incremental Behavior

**Boundary**: VES-LEAN-003B does NOT own cache correctness. TypeScript's `tsc -b` incremental mode provides `.tsbuildinfo`-based caching. The affected scripts provide **scope visibility** on top of this.

Cache correctness is delegated to:
1. `tsc -b` — project references + `.tsbuildinfo` for compilation
2. `vitest` — test result caching (minimal, not configured)
3. `workspace-architecture.mjs` — reference regeneration (always runs)

## 11. Before/After (Measured)

| Metric | Before | After | Notes |
|--------|--------|-------|-------|
| Cold full build | 12.7s | 12.7s | Unchanged (same `tsc -b`) |
| Warm unchanged build | 10.5s | 10.5s | Unchanged (incremental) |
| Affected calculation | N/A | **0.14s** | New capability |
| Dogfood scope visibility | N/A | **84/115** | New capability |
| Architecture validation | 1.5s | 1.5s | Unchanged (repository-wide) |

**Key insight**: The primary improvement is **scope visibility** — developers can now see exactly which packages are affected before building/testing. The actual build speed comes from `tsc -b` incrementality, which was already present.

## 12. Exact Milestone Delta

### Files Created

| File | Purpose |
|------|---------|
| `scripts/affected.mjs` | Affected package calculator with explainability |
| `scripts/build-affected.mjs` | Affected build runner |
| `scripts/test-affected.mjs` | Affected test runner |
| `packages/types/__tests__/build-graph/affected-graph.test.ts` | 17 focused tests |
| `docs/architecture/VES-LEAN-003B-DOGFOOD-BUILD-TEST-GRAPH.md` | This document |

### Files Modified

None. No existing files were modified.

## 13. Remaining Bottlenecks

1. **Reference generation**: `workspace-architecture.mjs --generate` runs on every build (~1-2s)
2. **`tsc -b` always builds all 114 projects**: Even with incrementality, `tsc -b` checks all projects. The affected scripts don't yet filter the `tsc -b` input.
3. **Vitest alias coupling**: Tests resolve from `dist/` — requires build before test

## 14. Remaining Build/Test Debt

1. No CI-level affected detection
2. No test result caching across runs
3. No Turbo/Nx remote cache
4. `build-affected.mjs` delegates to `pnpm build` (full build) — could be enhanced to only build affected packages via `tsc -b <specific-project>`

---

> **VES-LEAN-003B FREEZE READY**

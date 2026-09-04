---
title: "TEST-P0: Test Suite Performance + Diagnostics Audit"
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# TEST-P0: Test Suite Performance + Diagnostics Audit

**Author**: Vestara Developer Agent  
**Date**: 2026-09-03  
**Classification**: Static audit — no code mutations  
**Baseline**: Vitest v4.1.10, Node 22, full suite wall-clock >600s (timeout-killed)

---

## Executive Summary

The 376-file test suite fails to complete within any reasonable timeout. The root causes are:

1. **1 pathological file** (`m10-final-invariant-review.test.ts`) generates 100K records and rebuilds projections in a single test, taking **115s** alone
2. **1 file with a process-killing test** (`diagnostics.test.ts`) calls `process.kill(-1)` which sends SIGTERM to all processes in the group, hanging Vitest indefinitely
3. **47 `.tsx` test files** are missing `@vitest-environment jsdom` — every test in them fails with `ReferenceError: document is not defined`, wasting ~3-5s per file in import/transform time for zero signal
4. **apps/api** has 36 test files that start real HTTP servers and make real fetch calls — integration tests run in the default suite with no isolation boundary

**Estimated recoverable time from these 4 issues alone: ~150s+**

---

## Test Surface Inventory

### By Package (sorted by file count)

| Package | Files | Profiled Wall-Clock | Classification |
|---------|------:|-------------------:|----------------|
| apps/workspace | 91+7 visual | ~25s import-only (47 broken) | COMPONENT (tsx) + INTEGRATION (ts) |
| apps/api | 36 | >120s (1 hangs) | INTEGRATION |
| packages/activity-room | 24 | ~120s (1 pathological) | UNIT + STRESS |
| packages/workspace | 23 | 19.84s | UNIT |
| packages/workflow-orchestrator | 20 | 19.30s (e2e + unit) | E2E + UNIT |
| packages/opencode-runtime | 15 | 6.27s | UNIT |
| packages/tui | 14 | 5.55s | UNIT |
| packages/marketplace | 13 | 7.86s | UNIT |
| packages/agent-harness | 13 | 9.53s | UNIT + E2E |
| packages/tools | 7 | <2s | UNIT |
| packages/settings-framework | 5 | 3.57s | UNIT |
| apps/cli | 5 | 3.78s | UNIT |
| packages/types | 4 | 2.36s | UNIT |
| packages/kernel | 4 | 3.95s | UNIT |
| packages/interaction-persistence | 4 | 4.46s | UNIT |
| packages/sqlite-migrations | 3 | 3.80s | MIGRATION |
| packages/providers/opencode | 3 | 1.18s | UNIT |
| packages/os-controller | 3 | <2s | UNIT |
| packages/evidence | 3 | 3.03s | UNIT |
| packages/conversation-runtime | 3 | 3.18s | UNIT |
| All remaining (50+ packages) | 1-2 each | <2s each | UNIT |
| **Total** | **376** | **>600s (timeout)** | |

### By Speed Tier

| Tier | Wall-Clock | Package Count | Files |
|------|-----------|--------------|-------|
| **FAST** (<2s) | <2s | ~30 | ~35 |
| **MODERATE** (2-10s) | 2-10s | ~10 | ~80 |
| **SLOW** (10-30s) | 10-30s | 3 | ~70 |
| **PATHOLOGICAL** (>30s) | >30s | 2 | ~60 |
| **HANGING** (∞) | ∞ | 1 | 1 |

---

## Critical Findings

### FINDING-1: Pathological Stress Test (BLOCKER)

**File**: `packages/activity-room/__tests__/m10-final-invariant-review.test.ts`  
**Line**: 1027-1042  
**Impact**: 115s wall-clock for 22 tests (113.49s in test execution)

The file contains **INV-9: Performance Baseline** — three stress tests that generate massive datasets:

```
1K records:  rebuild time + incremental latency     (timeout: 30s)
10K records: rebuild time + stream size             (timeout: 60s)
100K records: rebuild time + stream size            (timeout: 120s)
```

The 100K test generates 100,000 records via `store.append()` in a loop, then rebuilds a `ProjectionRuntime`. This is a **benchmark**, not a correctness test. It has no gating assertions — only soft bounds (`<300s`).

**Why it blocks**: This single file consumes more time than all 30+ fast packages combined. It runs in the default suite with no separation.

### FINDING-2: Process-Killing Test (BLOCKER)

**File**: `apps/api/__tests__/diagnostics.test.ts`  
**Lines**: 962-982  
**Impact**: Hangs Vitest indefinitely

The second `killProcess` describe block contains:

```ts
it('returns ok false for invalid PID', () => {
    // PID 0 sends signal to process group - use -1 instead
    const result = killProcess(-1);   // ← sends SIGTERM to ALL processes
    expect(result.ok).toBe(false);
```

`killProcess(-1)` calls `process.kill(-1, 'SIGTERM')` which sends SIGTERM to **every process in the process group**, including the Vitest worker itself. The process never returns — it just dies or hangs.

**Why it blocks**: When Vitest runs this test, the worker process is killed, causing the test to hang forever. The full `diagnostics.test.ts` (1183 lines, 95 tests) cannot complete.

### FINDING-3: Missing jsdom Environment (HIGH)

**Location**: 47 `.tsx` files in `apps/workspace/__tests__/`  
**Impact**: ~150-200s wasted execution across all 47 files  
**Root cause**: Missing `@vitest-environment jsdom` pragma at top of file

Only 8 `.tsx` files have the pragma (plus 1 `.ts` file: `clientConfig.test.ts`). The other 47 `.tsx` files use `render()` from `@testing-library/react` without specifying a DOM environment, causing every test to fail with:

```
ReferenceError: document is not defined
```

Each file wastes ~3-5s in import/transform time producing zero signal (all tests fail immediately).

**Affected files** (47):
- `activity-detail-modal.test.tsx`, `activity-hardening.test.tsx`, `activity-messaging.test.tsx`
- `activity-room-agent-drawer.test.tsx`, `activity-room-model.test.tsx`, `activity-room.test.tsx`
- `activity-scope.test.tsx`, `ActivityWorkflowBrowser.test.tsx`
- `agent-card.test.tsx`, `agent-category-list.test.tsx`, `agent-control-header.test.tsx`
- `agent-control-page.test.tsx`, `agent-execution-history.test.tsx`, `agent-filters.test.tsx`
- `agent-harness-sessions.test.tsx`, `agent-registry-edit.test.tsx`, `agent-registry-modal.test.tsx`
- `agent-status-badge.test.tsx`, `App.test.tsx`, `app.test.ts` (lowercase)
- `drawer.test.tsx`, `evidence-baselines-ui.test.tsx`, `execution-summary-panel.test.tsx`
- `live-activity-panel.test.tsx`, `m11c-activity-room.test.tsx`
- `marketplace-asset-detail.test.tsx`, `marketplace-discover.test.tsx`
- `marketplace-installed.test.tsx`, `marketplace-install-review.test.tsx`
- `marketplace-operations.test.tsx`, `marketplace-publish.test.tsx`, `marketplace-staleness.test.tsx`
- `opencode-live-session.test.tsx`, `opencode-permissions.test.tsx`
- `opencode-session-forms.test.tsx`, `opencode-sessions-ui.test.tsx`, `opencode-ui.test.tsx`
- `overview-page.test.tsx`, `qualification-ui.test.tsx`, `routing-ui.test.tsx`
- `runtime-status-bar.test.tsx`, `session-trial-initiation.test.tsx`, `settings-ui.test.tsx`
- `teams-panel.test.tsx`, `theme-builder-import-export.test.tsx`
- `workflow-panel.test.tsx`, `zzz-probe-hardening.test.tsx`, `zzz-probe-hardening2.test.tsx`

### FINDING-4: Integration Tests in Default Suite (MEDIUM)

**Location**: `apps/api/__tests__/` — 36 files  
**Impact**: Multiple files start real HTTP servers on real ports  
**Root cause**: No separation between unit and integration tests

Files that call `server.listen()`:
- `index.test.ts` (ports 18992, 18993, 18994 — **hardcoded**)
- `agent-harness-routes.test.ts` (port 0 — dynamic)
- `interactions.test.ts` (port 0 — dynamic)
- `multi-agent-workflow-routes.test.ts` (port 0 — dynamic)
- `server-hardening.test.ts` (port 0 — dynamic)

Additionally, 30+ test files make `fetch()` calls to `localhost`/`127.0.0.1`, including files that also use SQLite (36 files), child_process (13 files), and EventBus (40+ files).

These are legitimate integration tests but they run in the same default `vitest run` as pure unit tests, with no way to skip them when fast feedback is needed.

---

## Expensive Pattern Inventory

### Real Server Startup (7 files)

| File | Pattern | Port Strategy |
|------|---------|---------------|
| apps/api/__tests__/index.test.ts | `createServer().listen()` | **Hardcoded** (18992-18994) |
| apps/api/__tests__/agent-harness-routes.test.ts | `server.listen(0)` | Dynamic |
| apps/api/__tests__/interactions.test.ts | `server.listen(0)` | Dynamic |
| apps/api/__tests__/multi-agent-workflow-routes.test.ts | `server.listen(0)` | Dynamic |
| apps/api/__tests__/server-hardening.test.ts | `server.listen(0)` | Dynamic |
| packages/marketplace/__tests__/remote-registry.test.ts | `createServer` | Unknown |
| packages/workspace/__tests__/runtime-client.test.ts | `createServer` | Unknown |

### OpenCode / Provider Integration (47 files)

Files referencing `createSession`, `provider.complete`, or `OpenCode`:
- `packages/opencode-runtime/__tests__/` (15 files)
- `packages/agent-harness/__tests__/` (6 files)
- `packages/workflow-orchestrator/__tests__/e2e/` (8 files)
- `packages/providers/opencode/__tests__/` (3 files)
- `packages/activity-room/__tests__/` (5 files)
- `apps/api/__tests__/` (2 files)
- `apps/workspace/__tests__/` (8 files)
- `apps/onboarding-lab/__tests__/` (1 file)

### Pathological Waits

| File | Wait | Duration |
|------|------|----------|
| `apps/workspace/__tests__/activity-room-model.test.tsx` | `setTimeout` | **4500ms** |
| `apps/workspace/__tests__/zzz-probe-hardening.test.tsx` | `setTimeout` | **3000ms** |
| `apps/api/__tests__/index.test.ts` | `setTimeout` (WS timeout) | 4000ms (×2) |
| `apps/api/__tests__/activity-room-ws.test.ts` | `setTimeout` (connect) | 4000ms |
| `packages/runtime/__tests__/runtimes-validation.test.ts` | `setTimeout` | 500ms, 300ms |
| `packages/opencode-runtime/__tests__/event-bridge.test.ts` | `setTimeout` | 120-150ms (×3) |
| `packages/workflow-orchestrator/__tests__/cluster.test.ts` | `setTimeout` | 120ms |
| `apps/api/__tests__/harness-approval-production-chain.test.ts` | `setTimeout` | 100ms (×5) |

### Resource Leak Risks

Tests that create resources without guaranteed cleanup:
- 7 files open HTTP servers (see above)
- 36 files use SQLite (in-memory, generally safe)
- 40+ files use EventBus/WebSocket subscriptions
- 13 files spawn child processes
- 2 files have hardcoded port binds (collision risk)

---

## Diagnostics Inventory

### Biome Lint Summary

```
Checked 1318 files in 11s. No fixes applied.
Found 107 warnings.
Found 40 infos.
```

### By Rule

| Rule | Count | Severity |
|------|------:|----------|
| `lint/correctness/noUnusedVariables` | 53 | Warning |
| `lint/correctness/noUnusedImports` | 42 | Warning |
| `lint/complexity/useLiteralKeys` | 25 | Info |
| `lint/style/useTemplate` | 8 | Info |
| `lint/style/useNodejsImportProtocol` | 7 | Info |
| `lint/correctness/noUnusedFunctionParameters` | 7 | Info |
| `lint/complexity/useOptionalChain` | 3 | Info |
| `lint/correctness/noUnusedPrivateClassMembers` | 2 | Info |

### By Package (Production Files)

| Package | Warnings |
|---------|--------:|
| apps/api | 19 |
| packages/activity-room | 5 |
| packages/opencode-runtime | 4 |
| packages/agent-harness | 4 |
| packages/workspace | 2 |
| packages/types | 2 |
| packages/interaction-persistence | 1 |

### By Package (Test Files)

| Package | Warnings |
|---------|--------:|
| packages/activity-room | 58 |
| apps/api | 22 |
| packages/opencode-runtime | 11 |
| packages/workflow-orchestrator | 6 |
| packages/workspace | 5 |
| packages/engineering-event-store | 3 |
| packages/agent-harness | 3 |
| packages/types | 2 |

### "Fixed 1 File" Investigation

`pnpm lint` (which runs `biome check --write`) previously reported "Fixed 1 file". This was an **import sorting fix** applied to `packages/workflow-orchestrator/__tests__/e2e/harness-e2e-characterization.test.ts` — reordering imports alphabetically per Biome convention. The fix was a no-op semantic change. Currently `pnpm lint:check` passes cleanly (1349 files, no fixes).

---

## Vitest Configuration Analysis

### Current Config

```ts
test: {
    include: [
      'packages/*/__tests__/**/*.{test,spec}.{ts,tsx}',
      'packages/{providers,tools}/*/__tests__/**/*.{test,spec}.{ts,tsx}',
      'apps/*/__tests__/**/*.{test,spec}.{ts,tsx}',
      'apps/workspace/tests/visual/__tests__/**/*.{test,spec}.{ts,tsx}',
    ],
    testTimeout: 15000,
}
```

### Observations

1. **testTimeout = 15s** is the only timeout configured. No `hookTimeout`, `teardownTimeout`, `pool`, `maxWorkers`, or `fileParallelism` overrides.
2. **No environment default** — `.tsx` files must opt-in per-file with `@vitest-environment jsdom`.
3. **No test categorization** — all 376 files run in one flat pool. No way to run "fast unit tests only" without explicit file paths.
4. **Alias fix applied** — `vitest.config.ts` now scans `packages/providers/*` and `packages/tools/*` for `@vestara/*` aliases (was missing before).

### Discovery Impact of Alias Fix

Before the fix, tests in `packages/providers/opencode/__tests__/` (3 files) and `packages/tools/git/__tests__/` (2 files) could not resolve `@vestara/*` imports from source. They would have failed to import or fallen back to `dist/`. The fix is correct and necessary.

---

## Profiled Wall-Clock by Package

### Tier 1: FAST (<2s) — 30 packages, ~35 files

These packages are well-behaved and contribute minimally to suite duration.

| Package | Duration | Files |
|---------|---------|------:|
| packages/action | 210ms | 1 |
| packages/agent-performance | 356ms | 1 |
| packages/activity-log | 376ms | 1 |
| packages/tools/git | 398ms | 1 |
| packages/permission | 409ms | 1 |
| packages/conversation | 456ms | 1 |
| packages/context | 504ms | 1 |
| packages/shared | 508ms | 1 |
| packages/knowledge | 506ms | 1 |
| packages/health | 535ms | 1 |
| packages/permissions | 577ms | 1 |
| packages/ownership | 626ms | 1 |
| packages/events | 632ms | 1 |
| packages/state-runtime | 636ms | 1 |
| packages/event-bus | 674ms | 1 |
| packages/metrics | 668ms | 1 |
| packages/audio | 701ms | 1 |
| packages/state-machine | 716ms | 1 |
| packages/logger | 749ms | 1 |
| packages/history | 826ms | 1 |
| packages/design-system | 829ms | 1 |
| packages/events-server | 818ms | 1 |
| packages/intent | 896ms | 1 |
| packages/architecture-runtime | 918ms | 1 |
| packages/boot-runtime | 993ms | 1 |
| packages/provider-runtime | 989ms | 1 |
| packages/providers/opencode | 1.18s | 3 |
| packages/filesystem-runtime | 1.18s | 1 |
| packages/thread-runtime | 1.15s | 1 |
| packages/tool-runtime | 1.02s | 1 |
| packages/opportunity-registry | 1.02s | 1 |

### Tier 2: MODERATE (2-10s) — 10 packages, ~80 files

| Package | Duration | Files |
|---------|---------|------:|
| packages/memory | 1.44s | 2 |
| packages/job | 1.20s | 2 |
| packages/external-runtime | 1.92s | 2 |
| packages/engineering-graph | 1.77s | 2 |
| packages/configuration | 1.38s | 2 |
| packages/capabilities | 1.34s | 2 |
| packages/native-installer | 1.66s | 1 |
| packages/diff-engine | 1.13s | 1 |
| packages/host-runtime | 1.12s | 1 |
| packages/decision-pipeline | 1.06s | 1 |
| packages/interaction-app | 2.47s | 1 |
| packages/types | 2.36s | 4 |
| packages/runtime | 2.26s | 2 |
| packages/engineering-event-store | 3.10-3.30s | 2 |
| packages/evidence | 3.03s | 3 |
| packages/conversation-runtime | 3.18s | 3 |
| packages/sqlite-migrations | 3.80s | 3 |
| packages/verification | 3.84s | 2 |
| packages/kernel | 3.95s | 4 |
| packages/settings-framework | 3.57s | 5 |
| packages/interaction-persistence | 4.46s | 4 |
| packages/worker | 1.56s | 2 |
| packages/tui | 5.55s | 14 |
| packages/marketplace | 7.86s | 13 |
| packages/agent-harness | 9.53s | 13 |
| apps/cli | 3.78s | 5 |
| apps/onboarding-lab | 499ms | 1 |

### Tier 3: SLOW (10-30s) — 3 packages

| Package | Duration | Files | Notes |
|---------|---------|------:|-------|
| packages/workspace | 19.84s | 23 | All pass, heavy imports (14s) |
| packages/workflow-orchestrator (non-e2e) | 10.57s | 7 | SQLite-heavy |
| packages/workflow-orchestrator (e2e) | 8.73s | 9 | 1 skipped (live server) |

### Tier 4: PATHOLOGICAL (>30s) — 2 suites

| Package | Duration | Files | Notes |
|---------|---------|------:|-------|
| packages/activity-room | ~120s | 24 | **1 file = 115s** (stress test) |
| apps/api (partial) | >120s | 36 | **1 file hangs** (kill test) |

### Tier 5: BROKEN (wasted time)

| Package | Duration | Files | Notes |
|---------|---------|------:|-------|
| apps/workspace (.tsx without jsdom) | ~150-200s total | 47 | All tests fail, ~3-5s each wasted |

---

## Root Cause Analysis

### Why Full Suite Exceeds 600s

| Component | Estimated Time | % of Total |
|-----------|---------------|-----------|
| apps/workspace .tsx imports (47 broken files) | ~150-200s | 25-33% |
| packages/activity-room (m10 stress test) | ~115s | 19% |
| apps/api (36 integration files) | ~120s+ | 20%+ |
| packages/workspace (23 files) | ~20s | 3% |
| packages/workflow-orchestrator (20 files) | ~20s | 3% |
| All other packages (~200 files) | ~80-100s | 15% |
| Vitest transform/import overhead | ~30-50s | 5-8% |
| **diagnostics.test.ts hang** | ∞ | **HANGS** |

### Bottleneck Hierarchy

1. **BLOCKER**: `diagnostics.test.ts` — `killProcess(-1)` hangs forever
2. **BLOCKER**: `m10-final-invariant-review.test.ts` — 115s stress test
3. **HIGH**: 47 broken `.tsx` files — ~150-200s wasted
4. **MEDIUM**: 36 `apps/api` integration tests in default suite
5. **LOW**: Heavy import times in `packages/workspace` (14s imports for 23 files)

---

## Recommendations (Ordered by Impact)

### P0: Immediate Fixes (no architecture change)

| # | Action | Impact | Risk |
|---|--------|--------|------|
| 1 | Add `@vitest-environment jsdom` to 47 `.tsx` files OR configure global jsdom default | Recovers ~150-200s | Low |
| 2 | Remove or separate `killProcess(-1)` from `diagnostics.test.ts` | Unblocks full suite | Low |
| 3 | Move INV-9 stress tests to a separate file with `--testPathPattern` guard | Recovers ~115s from default suite | Low |

### P1: Structural Improvements

| # | Action | Impact | Risk |
|---|--------|--------|------|
| 4 | Add Vitest workspace config with named pools (unit / integration / stress) | Enables fast unit-only runs | Medium |
| 5 | Add `testTimeout` per-file overrides for stress tests (e.g., `120_000` for INV-9) | Prevents false timeouts | Low |
| 6 | Replace hardcoded ports (18992-18994) with port 0 in `index.test.ts` | Prevents port collisions | Low |

### P2: Diagnostics Hygiene

| # | Action | Impact | Risk |
|---|--------|--------|------|
| 7 | Fix 53 `noUnusedVariables` warnings | Cleaner diagnostics output | Low |
| 8 | Fix 42 `noUnusedImports` warnings | Cleaner diagnostics output | Low |
| 9 | Investigate 63 `activity-room` test-file warnings | Largest warning source | Low |

---

## Appendix: Full Profiled Timing Data

### apps/api (36 files, profiled individually)

| File | Duration | Notes |
|------|---------|-------|
| index.test.ts | 5.92s | Hardcoded ports, WS tests |
| agent-harness-routes.test.ts | ~3s | Server + SQLite |
| interactions.test.ts | 6.62s | Server + SQLite |
| multi-agent-workflow-routes.test.ts | 9.57s | Server + SQLite |
| server-hardening.test.ts | 6.33s | Server + child_process |
| worker-socket.test.ts | 1.66s | WebSocket |
| workflow-orchestrator-harness.test.ts | 4.41s | SQLite |
| opencode-runtime-routes.test.ts | 3.58s | OpenCode |
| graph-service.test.ts | 2.34s | |
| harness-approval-interaction-bridge.test.ts | 1.45s | |
| harness-approval-recovery.test.ts | 1.40s | |
| harness-approval-production-chain.test.ts | 1.46s | 5× setTimeout(100) |
| harness-engineering-event-bridge.test.ts | 1.68s | |
| http.test.ts | 1.19s | |
| marketplace-routes.test.ts | 1.62s | |
| message-receipts.test.ts | 708ms | |
| opencode-supervisor.test.ts | 1.65s | |
| orchestration-routes.test.ts | 2.50s | |
| orders-routes.test.ts | 978ms | |
| participants.test.ts | 901ms | |
| qualification-routes.test.ts | 1.09s | |
| visual-scenarios.test.ts | 870ms | |
| diagnostics.test.ts | **HANGS** | killProcess(-1) |
| (remaining ~13 files) | ~1-2s each | |

### packages/activity-room (24 files)

| File | Duration | Notes |
|------|---------|-------|
| m10-final-invariant-review.test.ts | **115s** | 100K record stress test |
| store-sqlite.test.ts | 1.92s | |
| m9-durable-activity-room.test.ts | <1s | |
| m10-projection-evidence.test.ts | 4.21s | |
| m9-final-durability-evidence.test.ts | 3.32s | |
| m11a-read-api-contract.test.ts | 5.20s | |
| (remaining ~18 files) | 1-3s each | Total ~120s |

---

## Appendix: Test File Counts by Pattern

| Pattern | Files | Notes |
|---------|------:|-------|
| `.test.ts` (pure unit) | ~250 | No DOM, no network |
| `.test.tsx` (with jsdom) | 9 | Working React tests |
| `.test.tsx` (missing jsdom) | 47 | **All broken** |
| `.test.ts` (integration) | ~50 | Server, DB, or network |
| `.spec.ts` (visual) | 7 | Playwright-owned, excluded |
| E2E tests | ~10 | Gated or long-running |

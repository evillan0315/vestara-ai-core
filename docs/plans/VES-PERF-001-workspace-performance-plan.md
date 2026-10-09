---
title: VES-PERF-001 — Workspace Performance Improvement Plan
version: 1.0.0
status: planned
owner: vestara
last-reviewed: 2026-10-09
next-review: 2026-10-23
---

# VES-PERF-001 — Workspace Performance Improvement Plan

| Field | Value |
|---|---|
| Status | PLANNED — high priority milestone |
| Scope | Overview page, Activity Room Settings, global loading audit |
| Implementation | NOT YET AUTHORIZED (phases execute on approval) |
| Last Updated | 2026-10-09 |

> Scope: `apps/workspace` (`@vestara/workspace-ui`, React 19 + Vite + `react-router-dom` lazy routes).
> No API changes unless measured as blocker. All UI work follows
> `docs/governance/UI-UX-GOVERNANCE.md` (tokens via `var(--vestara-*)`, no hardcode,
> validate via `pnpm vds:validate`).

## 0. Findings from inspection (why this plan exists)

| Surface | Current behavior | Perf smell |
|---|---|---|
| **Overview** `features/overview/OverviewScreen.tsx` + `hooks/useOverview.ts` | Single `isLoading` gate blocks entire page on 8-way `Promise.all` (`/api/workspace` ×2, `/api/conversations`, `/api/diagnostics/events`, `/api/agents`, GitHub `api.github.com/users/{owner}/repos`, `/api/diagnostics/summary`, marketplace search+installed, `/api/health`+`/api/ci/status`+`/api/diagnostics/git`). Plus parallel `useMorningBriefing()` (`/latest` + `?limit=20`). | Slowest fetch gates everything; duplicate `/api/workspace` fetch (`fetchWorkspace` + `fetchProjects`); external GitHub call on critical path; no cache/SWR; all panels render in one pass; `LoadingSkeleton` only, no progressive reveal. |
| **Activity Room Settings** `pages/activity/ActivitySettingsPanel.tsx` + `M11CActivityRoomPage.tsx` (1619 lines) | `ActivitySettingsPanel` re-fetches `settingsClient.configuration()` + `.runtime()` on every drawer open, duplicating `SettingsPage` authority. `M11CActivityRoomPage` statically imports everything: stream, participant rail, workflow browser, context panel, detail/agent drawers, settings/browser panels, 6× MUI icons, `OperationalWorkspaceLayout`, `InventoryDrawer`. | Drawer tabs pay full settings cost even when never opened; monolithic page bundle — no `lazy()` for drawers/panels; no virtualization confirmed (`@tanstack/react-virtual` is a dep but unused here); `ActivityFreshness` 15s interval + WS re-render risk. |
| **Global loading** `App.tsx` + `layouts/ShellLayout.tsx` | One generic `LazyPage` fallback (`Loading...` + `animate-pulse`) for all 40+ `lazy()` routes. `ShellLayout` always mounts `GraphProvider`, `SurfaceContextProvider`, `GlobalDrawerProvider`, `CommandPalette`, `Inspector`, `GraphSearch`, `GlobalAssistant`, `GlobalDrawerHost` on every route. `vite.config.ts` has no `manualChunks`, no bundle budget, no prefetch/preload. | No route-specific skeletons (Overview/Settings skeletons exist but are bypassed by global `Loading...` during code-split load); shell pays graph/assistant/command-palette cost on lightweight pages; no interaction-timing telemetry. |

## 1. Phase 0 — Baseline (0.5 day, no code changes)

1. `pnpm --filter @vestara/workspace-ui build` + bundle analysis — record per-route chunk sizes; identify top 5 chunks >200KB.
2. Manual timing harness (dev proxy `:5173` → API `:3001`):
   - Overview: cold load, warm load, `fetchData()` wall time per sub-fetch (wrap `apiFetch` with `performance.now()` logging behind `?perf=1`).
   - Activity Room → open Settings drawer: time-to-interactive of `ActivitySettingsPanel`.
   - Settings `/settings/*`: `load()` 4-way `Promise.all` wall time.
3. Record in `apps/workspace/PERF-BASELINE.md`: TTFB, FCP, LCP, blocking-fetch count, bundle KB. This is the gate — no optimization without a number.

## 2. Phase 1 — Test harness (1 day)

Create `apps/workspace/src/performance/` (new, isolated — no existing behavior touched):

- `route-timing.harness.ts` — `measureRoute(path, { cold })` using Playwright (`tests/visual/` pattern): navigates, captures `performance.getEntriesByType('navigation')`, LCP via `PerformanceObserver`, fetch waterfall via request interception. Returns JSON.
- `overview.perf.test.tsx` (vitest, mocked `fetch`): asserts `useOverview` issues bounded requests, dedupes `/api/workspace` to 1 call, resolves with partial failures (one endpoint 500 → still renders fixtures, no full-page block).
- `activity-settings.perf.test.tsx`: asserts `ActivitySettingsPanel` does not fetch until visible (lazy mount), caches `configuration` across open/close.
- `shell-loading.test.tsx`: asserts each route renders its own skeleton (not global `Loading...`) during `lazy()` pending state.
- Wire into `pnpm --filter @vestara/workspace-ui test -- performance` (new glob, excluded from `test:fast` until stable).

Acceptance: harness runs green on current code as characterization tests (with `// BASELINE:` expected values); red-lines become optimization targets.

## 3. Phase 2 — Overview optimization (1–2 days)

In priority order (stop when LCP target met):

1. **Dedupe + decouple fetches** (`hooks/useOverview.ts`):
   - Share single `/api/workspace` result between `fetchWorkspace` and `fetchProjects` (pass-through param, not second fetch).
   - Move GitHub repos + marketplace off critical path: render fixtures/heroes first, background refresh with `setData` merge. Never block `isLoading` on external hosts.
   - Replace all-or-nothing `isLoading` with progressive readiness: `workspace` + `continueWorking` → first paint; `agents/resources/health` → second pass. Keep `LoadingSkeleton` for shell, add per-panel skeletons (token-based `mpg-skeleton` already exists).
2. **Morning briefing defer** (`hooks/useMorningBriefing.ts`): don't block `OverviewHero` — pass `briefingLoading` (already exists) and render hero immediately with briefing slot skeleton. Fix double-fetch (`fetchLatest` + `fetchAll` overlap; `fetchAll(limit=1)` suffices for hero).
3. **Code-split heavy panels**: `lazy()` + `Suspense` for `WorkspaceSnapshot`, `CodexRuntimeActivityCard`, `MilestonesSummary` (each has own API calls). Keep `TodayFocus`/`QuickActions` eager (above-fold).
4. **Memoize derived work**: `focusPct`, `agentsOnline` filter, `panels` record — `useMemo`. `renderColumn` drag handlers `useCallback`.
5. **Cache**: 30s in-memory SWR for `/api/diagnostics/summary` + `/api/health` (stale-while-revalidate, background `refetch` on focus, not on mount).

Target: LCP < 2.5s warm, blocking fetches on first paint ≤ 2, no external-host dependency for first paint.

## 4. Phase 3 — Activity Room + Settings optimization (1–2 days)

1. **Lazy drawers/panels** (`M11CActivityRoomPage.tsx`): convert `ActivitySettingsPanel`, `ActivityBrowserPanel`, `ActivityDetailDrawer`, `AgentProjectionDrawer`, `M11CWorkflowBrowser` to `lazy()` with panel-level `ActivityPanelSkeleton` fallback (already exists). Settings drawer code must not load until opened — verify via bundle split.
2. **Eliminate duplicate settings fetch**: lift `configuration`/`runtime` into a shared snapshot cache (60s TTL) consumed by both `ActivitySettingsPanel` and `SettingsPage`. Split `SettingsPage` `load()` per-route: `general` needs config only, `runtime` needs runtime+cli+history.
3. **Stream render budget**: adopt `@tanstack/react-virtual` for `M11CActivityStream` (500-item M10 working set); memoize `M11CStreamItem` (`React.memo` + stable keys), throttle `ActivityFreshness` interval to 30s. Use existing `useRenderProfiler` output as regression signal (log p95 render ms in harness).
4. **Icon/tree-shake**: audit 6× `@mui/icons-material` static imports — replace with single icon sprite or dynamic `lazy` per drawer. Do NOT upgrade MUI v6 → v9 in this task (recorded as ADJACENT).

Target: Activity Room initial JS −30%, Settings drawer open < 300ms warm (cache hit), no full-list re-render on single WS message.

## 5. Phase 4 — Global loading audit (1 day)

1. **Route-aware fallbacks** (`App.tsx` `LazyPage`): replace single `Loading...` with per-route skeleton map — `overview → OverviewSkeleton`, `settings → SettingsSkeleton`, `activity → ActivityPanelSkeleton`, generic otherwise. Skeletons use `var(--vestara-*)` only.
2. **Shell slimming** (`ShellLayout.tsx`): `lazy()` + conditional mount for `CommandPalette`, `GraphSearch`, `Inspector`, `GlobalAssistant` (mount on first interaction/shortcut, not every route). Keep `AppHeader`/`AppSidebar` eager. Measure shell JS before/after.
3. **Build tuning** (`vite.config.ts`): add `manualChunks` (`vendor-react`, `vendor-mui`, `vendor-mermaid/monaco`, route chunks), `chunkSizeWarningLimit`, `reportCompressedSize`. Add `pnpm perf:budget` CI check (fail if any route chunk grows >10% vs baseline).
4. **Prefetch on intent**: `AppSidebar` hover/`onMouseEnter` → `import()` prefetch of target route. Overview prefetched from login landing.
5. **Telemetry**: extend `TelemetryContext` with LCP/INP/CLS beacons to `/api/telemetry` (sampled) — feeds baseline into production.

## 6. Validation & rollout

- `pnpm lint:check && pnpm --filter @vestara/workspace-ui build && pnpm --filter @vestara/workspace-ui test -- performance` green.
- `pnpm vds:validate` green (any new skeleton/spinner uses tokens).
- Playwright harness re-run: Overview LCP, Activity Settings open latency, Settings route latency — all vs `PERF-BASELINE.md`, deltas recorded.
- No API contract changes; no `opencode.json`/agent changes; no MUI upgrade; no `.vestara/` edits.

## 7. Out of scope (recorded, not actioned)

- **ADJACENT:** MUI v6 → v9 migration (governance prefers v9 for complex UI; needs `ExternalScout` verification + theme remap — separate task).
- **ADJACENT:** `useOverview` fixture fallback masks API outages — consider error-surface UX pass later.
- **OBSERVATION (low confidence):** `WorkspaceSnapshot` + `CodexRuntimeActivityCard` may double-fetch diagnostics — confirm during Phase 2 instrumentation.

## Execution order

Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4, with stop-and-report after each phase (numbers before next phase). Estimated total: **4–5 days**, single engineer.

Tracked as milestone `VES-PERF-001` (high priority) — see `.tmp/tasks/VES-PERF-001/task.json`.

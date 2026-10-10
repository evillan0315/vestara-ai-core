---
title: Workspace Performance Baseline
milestone: VES-PERF-001
captured: 2026-10-10
status: partial
---

# Workspace Performance Baseline

This is the Phase 0–2 baseline for `VES-PERF-001`. It records build,
bundle, and characterization-test evidence that can be reproduced locally.
Browser and API timing measurements remain pending because the sandbox does not
permit the local API listener required by the supported dev proxy.

## Environment

| Field | Value |
|---|---|
| Commit | `main` at the Phase 0 capture (`git status`: 2 commits ahead of `origin/main`) |
| Node | `v22.23.2` |
| pnpm | `12.4.2` |
| UI package | `@vestara/workspace-ui` |
| Build command | `pnpm --filter @vestara/workspace-ui exec vite build` |
| Build result | Passed; `4680` modules transformed; `1m 43s` |
| Repository build | Passed; `bash build-order.sh` completed successfully |

## Bundle baseline

The build emitted 156 JavaScript assets totaling 7,291,735 bytes (6.95 MiB)
and 14 CSS assets totaling 429,717 bytes (0.41 MiB), before compression.

Largest JavaScript assets:

| Asset | Raw KB | Gzip KB |
|---|---:|---:|
| `index-CcHIA71y.js` | 1,348.18 | 388.89 |
| `cynefin-VYW2F7L2-DP7EqN2y.js` | 690.83 | 155.11 |
| `mermaid.core-DJWqGc2W.js` | 611.73 | 144.99 |
| `cytoscape.esm-DTSO7Bv0.js` | 443.72 | 142.36 |
| `index-CnQZF2w2.js` | 313.43 | 93.66 |

Additional large route/application assets:

| Asset | Raw KB | Gzip KB |
|---|---:|---:|
| `index-B4Omt71t.js` | 268.33 | 74.09 |
| `katex-C5jXJg4s.js` | 261.33 | 77.57 |
| `M11CActivityRoomPage-CqP3Rpsq.js` | 236.69 | 62.80 |
| `CategoricalChart-D4jDBO3X.js` | 222.02 | 67.58 |
| `Dashboard-Xs6naH9a.js` | 190.50 | 50.97 |

Vite emitted its default warning that some chunks exceed 500 kB after
minification. No `manualChunks` configuration or performance budget was
added during this baseline phase.

## Source characterization signals

- Overview currently uses an eight-way `Promise.all` in `useOverview` and has
  separate `fetchWorkspace()` and `fetchProjects()` calls.
- Morning briefing currently runs `fetchLatest()` and `fetchAll()` in parallel.
- Activity Room statically imports `ActivitySettingsPanel`.
- `App.tsx` uses one generic `Loading...` Suspense fallback.

These are observations only; no optimization was performed in Phase 0.

## Runtime measurements

| Measurement | Result |
|---|---|
| Overview cold/warm load | Not captured — API could not bind in sandbox |
| Overview TTFB/FCP/LCP | Not captured — API could not bind in sandbox |
| Overview blocking-fetch count | Not captured — browser harness not yet implemented |
| Activity Settings open latency | Not captured — API could not bind in sandbox |
| Settings route timing | Not captured — API could not bind in sandbox |

The rebuilt API completed boot and route registration, then failed with
`listen EPERM: operation not permitted 0.0.0.0:3001`. Probes to
`127.0.0.1:3001`, `:5173`, and `:4173` therefore returned connection refused.
The API process started by this task was stopped; no process remains owned by
this baseline task.

## Phase 1 characterization harness

Added isolated performance artifacts under `apps/workspace/src/performance/`:

- `route-timing.harness.ts` captures navigation timing, LCP, and request URLs.
- `overview.perf.test.tsx` characterizes current Overview request fan-out and
  fixture fallback behavior.
- `activity-settings.perf.test.tsx` characterizes settings requests on mount.
- `shell-loading.test.ts` characterizes the current generic Suspense fallback.

Verification:

```text
pnpm --filter @vestara/workspace-ui exec vitest run \
  src/performance/overview.perf.test.tsx \
  src/performance/activity-settings.perf.test.tsx \
  src/performance/shell-loading.test.ts --maxWorkers=2
3 files passed, 4 tests passed

pnpm --filter @vestara/workspace-ui build
passed; 4680 modules transformed; 1m 42s
```

## Phase 0 disposition

Phase 0 is **partially complete**: build and bundle evidence is recorded, but
the runtime portion is blocked by the sandbox's listener restriction. Phase 1
characterization tests and the timing harness are present and verified; live
Playwright timing remains pending until the supported dev proxy can run in an
environment that allows local listeners.

## Phase 2 implementation evidence

Implemented the bounded Overview optimizations:

- Reused the single `/api/workspace` response to derive the GitHub owner,
  reducing the workspace request count from 2 to 1 in characterization tests.
- Released the Overview shell after workspace and recent-work data arrive;
  secondary panels now merge into the fixture-backed view as they resolve.
- Removed the duplicate `/api/morning-briefings/latest` request from the shared
  briefing refresh path; the list response supplies the latest briefing.
- Code-split `MilestonesSummary` and `WorkspaceSnapshot` with panel-level
  skeleton fallbacks.
- Memoized Overview derived focus progress, panel composition, and dashboard
  callbacks.

Verification after Phase 2:

```text
Focused performance tests: 3 files passed, 4 tests passed
Workspace UI build: passed; 4680 modules transformed; 1m 38s
New chunks: MilestonesSummary 5.51 kB raw / 2.14 kB gzip;
WorkspaceSnapshot 23.36 kB raw / 5.67 kB gzip
```

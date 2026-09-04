---
title: Diagnostic Center
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Diagnostic Center

The Diagnostic Center is the Workspace's primary observability dashboard. It
monitors the local host (CPU, memory, disk, GPU, network, processes, Docker,
Git) and the Vestara runtime (agents, executions, events, health) in real time,
then helps diagnose problems with AI analysis and exportable reports.

## Entrypoint

- Page: `apps/workspace/src/pages/Diagnostics.tsx` → `apps/workspace/src/components/diagnostics/DiagnosticsPage.tsx`
- Route: `/diagnostics` (nav: Workspace → Diagnostics)

## Architecture

```
apps/workspace/src/components/diagnostics/
├── DiagnosticsPage.tsx       Layout: toolbar · cards · charts · tabs
├── DiagnosticsContext.tsx    Polling + rolling history + persisted UI state
├── OverviewCards.tsx         Top summary cards (CPU, mem, swap, disk, GPU…)
├── SystemInfo.tsx            OS / workspace / toolchain / network / memory detail
├── ProcessExplorer.tsx       Sortable, filterable process table + kill
├── StoragePanel.tsx          Filesystems + workspace scan (dirs, large files)
├── DockerPanel.tsx           Containers, images, live resource stats
├── GitPanel.tsx              Repository status
├── EnvPanel.tsx              Toolchain versions + safe env vars
├── AgentMonitor.tsx          Agent states + execution timeline
├── LogViewer.tsx             Event timeline (activity + agent) + CSV export
├── HealthPanel.tsx           Health checks + readiness score + alerts
├── AiAnalyze.tsx             AI analysis of the current snapshot
├── charts.tsx                Sparkline / history / meter primitives (recharts)
└── (diagnostics.css imported by DiagnosticsPage)

apps/workspace/src/hooks/usePolling.ts   Generic live-data polling hook
apps/workspace/src/lib/diagnostics.ts     Typed API client + formatters
```

Supporting backend:

```
apps/api/src/diagnostics/collect.ts      Pure Node system collectors (unit-testable)
apps/api/src/routes/diagnostics.ts       Route dispatch + alert derivation + AI analyze
```

## Backend endpoints

| Route | Purpose |
|-------|---------|
| `GET /api/diagnostics/summary` | composed snapshot: os, cpu, memory, disks, gpu, docker, git, versions, workspace, health, readiness, alerts |
| `GET /api/diagnostics/cpu` | per-core utilization (delta since previous call) + load + temperature |
| `GET /api/diagnostics/memory` | detailed `/proc/meminfo` breakdown |
| `GET /api/diagnostics/processes?q=&limit=` | process list (top by CPU, searchable) |
| `GET /api/diagnostics/disks` | mounted filesystems (`df -kPT`) |
| `GET /api/diagnostics/gpu` | NVIDIA via `nvidia-smi` (best-effort) |
| `GET /api/diagnostics/docker` | containers/images/stats via docker CLI (best-effort) |
| `GET /api/diagnostics/git` | branch, status, ahead/behind for the workspace repo |
| `GET /api/diagnostics/versions` | toolchain version probes (cached 60s) |
| `GET /api/diagnostics/filesystem` | dir sizes, large files, recently modified |
| `GET /api/diagnostics/health` | health checks + readiness score |
| `GET /api/diagnostics/events` | merged activity + agent telemetry timeline |
| `GET /api/diagnostics/agents` | agent states + executions from `ctx.telemetry` / `ctx.agents` |
| `POST /api/diagnostics/analyze` | AI analysis of a snapshot (provider-grounded) |
| `POST /api/diagnostics/processes/kill` | SIGTERM a process (confirmed in UI) |

## Design notes

- **Collectors degrade gracefully**: every system command is optional; missing
  binaries, permissions, or unsupported features yield `null` / empty results
  instead of errors. The UI shows "not available (optional)" states.
- `collect.ts` is free of `@vestara` imports so parsers (`parsePs`, `parseDf`,
  `computeCpuUsage`, `parseDockerStat`) are unit-tested in
  `apps/api/__tests__/diagnostics.test.ts`.
- **Live data**: the frontend polls via `usePolling`; CPU/memory history buffers
  (last 60 samples) drive the recharts charts. Polling pauses when the user
  hits pause or switches the interval.
- **State** persists under `vestara-diag-*` localStorage keys (active tab,
  refresh interval, search).
- The UI reuses the existing chart tokens (`--chart-*`, `--vestara-*`) and
  recharts; no new UI dependencies were added.
- Platform probes (`ps`, `df`, `nvidia-smi`, `docker`, `git`, `du`, `find`,
  `/proc/*`) are Linux-oriented but each is optional and guarded.

## Related

- `apps/api/src/routes/diagnostics.ts`, `apps/api/src/diagnostics/collect.ts`
- `apps/workspace/src/components/diagnostics/`, `src/lib/diagnostics.ts`

---
title: VES-UI-002 — OS Host Port (Tauri) Plan
version: 1.0.0
status: executing
owner: vestara
last-reviewed: 2026-10-21
next-review: 2026-11-21
---

# VES-UI-002 — OS Host Port (Tauri) Plan

| Field | Value |
|---|---|
| Orchestrated project | `project-1792534106380-1` (`ves-ui-002-os-host-port-tauri`) |
| Plan | `plan-1792534155109-1` (approved — `director-approval-2026-10-21`) |
| Goal | Port the validated VES-UI-001 desktop shell to the Tauri host (`ai.vestara.workspace`) |
| Host decision | Tauri-first (Director, 2026-10-21) |
| Scope | bundle config · window-lifecycle boot/shutdown bridge · `teal://vestara-shell` deep link · bundled wallpapers |
| Out of scope | `os/` systemd + Plymouth host work (explicitly excluded) |
| Predecessor | [VES-UI-001 — Workspace UI v2 Desktop Shell Plan](VES-UI-001-workspace-ui-v2-desktop-shell-plan.md) |
| Last Updated | 2026-10-21 — project completed; verification passed with evidence (see §6) |

> This plan records the Tauri host port of the validated desktop shell. It is
> the follow-up to VES-UI-001 §13 (T8 host port deferred, Tauri-first
> decision). All project/plan/task state is owned by the orchestrator and is
> mutated only through the API — this document is the human-readable record,
> not a second source of truth.

## 1. Task map (U0–U5)

| Task | Summary | Files | Status (2026-10-21) |
|---|---|---|---|
| `task-1792534155384-1` | U0 — Tauri capability audit + decision record | `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` | ✅ completed |
| `task-1792534155384-2` | U1 — Bundle validated shell (config + icons + CSP) | `src-tauri/tauri.conf.json`, `src-tauri/src` | ✅ completed |
| `task-1792534155384-3` | U2 — Window-lifecycle boot/shutdown bridge | `packages/boot-runtime/src/index.ts`, `src-tauri/src` | ✅ completed |
| `task-1792534155384-4` | U3 — `teal://vestara-shell` deep-link scheme | `src-tauri/tauri.conf.json`, `src-tauri/src`, `apps/workspace/src/routes.ts` | ✅ completed |
| `task-1792534155384-5` | U4 — Wallpaper assets in bundle (transcoded, budgeted) | `assets/wallpapers/`, `src-tauri/tauri.conf.json` | ✅ completed |
| `task-1792534155384-6` | U5 — Tests + visual/docs gates | `src-tauri/`, VES-UI-001 plan | ✅ completed (2026-10-20) |

Acceptance gates per task (from the plan):

- **U0** — audit record only; no code changes.
- **U1** — bundle config aligned with the validated shell; CSP stays `null`
  only with justification; version handling per G11 (no imported version strings).
- **U2** — vitest for the bridge mapping (`SHELL_PHASES` → Tauri window lifecycle).
- **U3** — vitest for the link-to-route mapping, cold start and running-app cases.
- **U4** — no 1.8 MB+ PNG shipped in the bundle.
- **U5** — bridge + deep-link vitest, visual-gate feasibility assessment, docs.

## 2. Blocker diagnosis (2026-10-21)

The project could not progress. Three distinct conditions, all recorded in the
orchestration event stream (`GET /api/orchestration/projects/project-1792534106380-1/audit`):

| Condition | Evidence | Why it blocks |
|---|---|---|
| **U1 wedged `in-progress`** | `orchestration.task.started` at 2026-10-20T22:23:48Z with no matching `task.completed`/`task.failed`; the dispatch died with the process | `runExecution` only dispatches `pending`/`ready`/`assigned` tasks, so `in-progress` is never picked up again — and the task kept the file locks `apps/workspace/src-tauri/tauri.conf.json` and `apps/workspace/src-tauri/src` |
| **U0 stuck `retrying`** | `orchestration.task.failed` → `orchestration.task.retrying` at 2026-10-20T22:21:23Z, no further dispatch | `retrying` is not runnable either; the task was unreachable for the execution loop |
| **U2/U3/U4 `blocked` on stale locks** | `orchestration.task.blocked` with `file lock held on "apps/workspace/src-tauri/…" by task-1792534155384-2` | Every dependent task blocked on the two locks the wedged U1 would never release |

**Root cause (governance gap).** `WorkflowOrchestrator.requeueTask` — the only
governed operator recovery path — accepted `blocked` and `failed` tasks only.
A task whose dispatch died mid-flight lands in `in-progress` (or `retrying`),
which is neither recoverable nor runnable: the project deadlocks, and the
wedged task's file locks leak for the lifetime of the database.

## 3. Root-cause fix — governed recovery of wedged tasks

`packages/workflow-orchestrator` now has a recovery path that covers the
states the automatic loop cannot leave on its own:

- `RECOVERABLE_TASK_STATUSES` (`src/state-machines.ts`) = `blocked`, `failed`,
  `retrying`, `in-progress` — with `in-progress → assigned` added to the task
  transition table as the operator recovery edge.
- `requeueTask(projectId, taskId, { reason })` (`src/orchestrator.ts`):
  validates project/plan ownership, **reclaims the stale file locks the wedged
  task still holds** (audited as `file.lock.released` events), resets attempt
  accounting, and records `task.requeued` with `fromStatus`, `reason`, and
  `releasedPaths`.
- A task persisted as `failed` cannot reach `assigned` directly, so recovery
  walks the legal path `failed → retrying → assigned` and audits the hop.
- The API route `POST /api/orchestration/projects/:id/tasks/:taskId/retry`
  (`apps/api/src/routes/orchestration.ts`) passes the operator-supplied
  `reason` through to the audit trail.

Coverage: `packages/workflow-orchestrator/__tests__/orchestrator.test.ts`
(recovery of a wedged `in-progress` task + lock reclaim, recovery of a
`retrying` task, the `failed → retrying → assigned` path, re-dispatch on
resume, and refusal of non-recoverable statuses).

## 4. Recovery record (2026-10-21)

Applied through the API (`POST /api/orchestration/projects/project-1792534106380-1/tasks/:taskId/retry`):

| Task | Recovered from | Reclaimed locks | Audit event |
|---|---|---|---|
| U0 | `retrying` | — | `orchestration.task.requeued` (seq 32163) |
| U1 | `in-progress` | `apps/workspace/src-tauri/src`, `apps/workspace/src-tauri/tauri.conf.json` | `orchestration.file.lock.released` (seq 32164, 32165) + `orchestration.task.requeued` (seq 32166) |
| U2 | `blocked` | — | `orchestration.task.requeued` (seq 32167) |
| U3 | `blocked` | — | `orchestration.task.requeued` (seq 32168) |
| U4 | `blocked` | — | `orchestration.task.requeued` (seq 32169) |

After the recovery: no unreleased file locks remain, and all five tasks sit in
`assigned` — the state the execution loop dispatches from. The project was
re-dispatched with `POST /api/orchestration/projects/project-1792534106380-1/execute`.

## 5. Exit criteria

- [x] U0 decision record exists — [VES-UI-002-U0-tauri-capability-audit.md](VES-UI-002-U0-tauri-capability-audit.md)
      (capability audit for the deep-link plugin, bundle targets, CSP model —
      verified against upstream docs, never fabricated).
- [x] U1 bundle config matches the validated shell (window geometry, icons,
      bundle targets, CSP justification, G11 version handling).
- [x] U2 vitest proves the bridge mapping between `SHELL_PHASES` and the Tauri
      window lifecycle.
- [x] U3 vitest proves `teal://vestara-shell` → route mapping for cold start
      and running-app cases.
- [x] U4 ships no 1.8 MB+ PNG in the bundle (AVIF 42 KB / WebP 46 KB /
      PNG 978 KB, single size).
- [x] Focused vitest, `pnpm lint:check`, `pnpm vds:validate`, and a clean
      build pass for the touched scope.
- [x] Orchestrated verification (`POST …/verify`) records `passed: true`.

## 6. Completion record (2026-10-21)

Project `project-1792534106380-1` moved `executing → verifying → completed`;
plan `plan-1792534155109-1` is `completed`. All six tasks are `completed`
and the audit stream balances: 21 `file.lock.acquired` ↔ 21
`file.lock.released`, 5 `task.requeued` (the recovery in §4), 6
`task.completed`.

Gates re-run on the final tree:

| Gate | Result | Evidence |
|---|---|---|
| Build | ✅ | `bash build-order.sh` — dependency boundaries valid across 122 projects, 121 buildable projects compiled |
| Lint | ✅ | `pnpm lint:check` — 1598 files clean |
| Design tokens | ✅ | `pnpm vds:validate` — VDS validation passed (VDS 1.1 · Workspace/TUI/CLI aligned) |
| Focused vitest | ✅ | 73 tests / 6 files green — boot-runtime bridge, orchestrator recovery, `tauri-bundle-config`, `deep-link`, wallpaper budget + wallpaper |
| Full vitest | ✅ | `pnpm vitest run --maxWorkers=2` — 222 files passed / 2 skipped, 1801 tests passed / 3 skipped (197 s, no failures) |
| Rust shell | ✅ | `cargo check --offline` in `apps/workspace/src-tauri` — Finished dev profile (deep-link + single-instance plugins compile) |
| Docs | ✅ | `pnpm docs:govern` — validation, links, evidence passed |

Delivered by the task agents (paths are repo-relative):

- `apps/workspace/src-tauri/tauri.conf.json` — labelled `main` window,
  `teal` deep-link scheme, bundle icons/targets.
- `apps/workspace/src-tauri/Cargo.toml` / `src/lib.rs` / `capabilities/default.json` —
  deep-link + single-instance plugins and the capability grants the U0 audit
  found missing.
- `apps/workspace/src/features/desktop-shell/deep-link.ts` (+ `DeepLinkHandler.tsx`,
  `deep-link.test.ts`) — cold-start and running-app link→route mapping.
- `packages/boot-runtime/src/index.ts` — additive window-lifecycle bridge.
- `apps/workspace/public/startup/vestara-startup-bg.{avif,webp,png}` — single
  transcoded size.

## 7. Known constraints

- **Visual gate** — Playwright drives bundled Chromium over HTTP and cannot
  target the Tauri bundle (the OS WebView exposes no CDP endpoint, and
  `tauri-driver`/WebdriverIO are not wired). The web gate remains the proxy;
  bundle-native chrome is out of Playwright scope. Recorded in
  [CSP-010](../capabilities/CSP-010-workspace-ui/README.md) and
  [CSP-016](../capabilities/CSP-016-os-integration/README.md).
- **CSP** — `app.security.csp` stays `null` for now; a hardening pass is a
  separate, boot-gated task.

---
title: VES-UI-003 — Workflows Next-Action Surfacing Plan
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-10-21
next-review: 2026-11-21
---

# VES-UI-003 — Workflows Next-Action Surfacing Plan

| Field | Value |
|---|---|
| Orchestrated project | `project-1792546136880-1` (`ves-ui-003-workflows-next-action`) |
| Plan | `plan-1792546143677-1` (approved — 9 tasks, all `pending`) |
| Goal | Make the Workflows page surface the next recommended action unambiguously, and land the CTA on the exact object it names |
| Scope | banner-dismissal defect · filter-scoped resolution · tone/CTA weight · persistent next lane · priority-ordered rail · targeted CTA · why-now context · queue-order explanation |
| Out of scope | changing the resolver priority ladder (`KIND_PRIORITY`) · approval-gate semantics · surfaces outside `/orchestration` |
| Source of truth | [`apps/workspace/src/pages/Orchestration.tsx`](../../apps/workspace/src/pages/Orchestration.tsx), [`apps/workspace/src/lib/orchestration-next-action.ts`](../../apps/workspace/src/lib/orchestration-next-action.ts) |
| Predecessor | [VES-UI-002 — OS Host Port (Tauri) Plan](VES-UI-002-os-host-port-tauri-plan.md) |
| Last Updated | 2026-10-21 — verified: project + plan `completed`; W5 remainder deferred as a documented follow-up |

> All project/plan/task state is owned by the orchestrator and is mutated only
> through the API — this document is the human-readable record, not a second
> source of truth. The plan is approved and staged: every task is `pending`
> and no agent has been dispatched (`POST …/execute` has not been called).

## 1. Why this plan exists

The Workflows page already computes a next recommended action
(`getNextAction` / `getNextActions` in `orchestration-next-action.ts`) and
surfaces it in five places: the header attention chip, the top banner, the
per-project card strip, the inspector `Actions` tab, and the Overview
`Recommended actions` panel.

The resolver is well covered by `orchestration-next-action.test.ts`. The
*presentation* of its output is where the gaps are: two defects make the
banner lie to the user, and the remaining items make the recommendation hard
to act on. This plan covers the presentation layer; the priority ladder itself
is left alone.

## 2. Findings

| # | Finding | Evidence | Impact |
|---|---|---|---|
| F1 | **The dismiss button is a no-op when task attention is zero.** The dismissal signature embeds `dashboard.attention` (Orchestration.tsx ~L673) and a cleanup effect clears the dismissal whenever `dashboard.attention === 0` (~L683). | A phase-level recommendation (`plan-approval`, `architecture-review`) carries zero task-level attention, so dismissing it clears the signature and the effect immediately restores it. | The ✕ reads as broken precisely in the states where a phase-level recommendation is the only thing to show. |
| F2 | **The banner can recommend a project the rail filter has hidden.** `nextAction`/`allNextActions` resolve over `projects` (L652–660) while the rail renders `visibleProjects` (L696–717). | With a status filter or text query active, the recommended workflow is absent from the visible rail; clicking it selects a project the user cannot see. | The recommendation and the list disagree about what exists. |
| F3 | **Observational recommendations are dressed as alarms.** The banner hardcodes the warning surface and a `primary` CTA (L1173, L1191) regardless of `actionable`. | `NextActionButton` (L232) already differentiates by `actionable`; the banner does not. | "Check progress in X" carries the same visual weight as "Approve 3 tasks in X". |
| F4 | **Only one action is visible.** The rest are hidden behind `+N more … see Next actions tab` (L1184–1188). | "Next actions" is an inspector tab (right pane), not a main tab, and that pane is collapsible. | The referent is ambiguous and frequently unreachable. |
| F5 | **The rail is not ordered by actionability.** Projects render in API order (L332). | `KIND_PRIORITY` orders the recommendation but not the list the user scans first. | The first row a user sees is not the first thing to do. |
| F6 | **The CTA lands on the project, not the object.** `handleProjectAction` (L824–846) routes to the Tasks/Blockers *tab*. | The recommendation carries no `taskId`/`approvalId`; `task-approval` detail shows only `approvals[0].summary` (L69) even when N approvals are pending. | "Open tasks" drops the user into a full list to hunt the blocked task. |
| F7 | **The empty state offers the same CTA three times.** Rail empty state (L1307), Overview `Next recommended action` panel (L1770–1788), `New project` quick tile (L975–980). | All three render "create a workflow". | Competing primaries; no hierarchy to read. |

## 3. Task map (W0–W8)

| Task | Summary | Files | Capabilities | Status (2026-10-21) |
|---|---|---|---|---|
| `task-1792546143904-1` | W0 — Fix next-action banner dismissal when task attention count is zero | `pages/Orchestration.tsx`, `lib/orchestration-next-action.ts` | implementation, testing | ⏳ pending |
| `task-1792546143904-2` | W1 — Scope next-action resolution to the visible project set | `pages/Orchestration.tsx`, `lib/orchestration-next-action.ts` | implementation, testing | ⏳ pending |
| `task-1792546143904-3` | W2 — Differentiate banner tone and CTA weight by `actionable` | `pages/Orchestration.tsx` | implementation | ⏳ pending |
| `task-1792546143904-4` | W3 — Replace the dismissible banner with a persistent next-action lane | `pages/Orchestration.tsx` | implementation | ⏳ pending |
| `task-1792546143904-5` | W4 — Order the projects rail by action priority and badge each row | `pages/Orchestration.tsx`, `lib/orchestration-next-action.ts` | implementation | ⏳ pending |
| `task-1792546143904-6` | W5 — Give the recommendation a target and land the CTA on the exact object | `lib/orchestration-next-action.ts`, `pages/Orchestration.tsx`, `components/workflow/WorkflowTaskList.tsx` | implementation, testing | ⏳ pending |
| `task-1792546143905-7` | W6 — Show why-now context on the recommendation | `pages/Orchestration.tsx`, `lib/orchestration-next-action.ts` | implementation | ⏳ pending |
| `task-1792546143905-8` | W7 — Explain the queue order and collapse the duplicated empty-state CTA | `pages/Orchestration.tsx` | implementation | ⏳ pending |
| `task-1792546143905-9` | W8 — Tests, token validation and docs gates | `lib/orchestration-next-action.test.ts`, `pages/Orchestration.tsx`, this plan | testing, documentation | ⏳ pending |

## 4. Design direction

**W0 — W2 (defects).** The banner gets its own dismissal signature, keyed on
the recommendation itself (kind + project + a hash of the action content such
as the pending approval count) instead of the task-attention counter; the
`attention === 0` reset is scoped to the header chip only. Resolution is
computed over the visible project set, with a count shown whenever the pool is
filtered. Banner tone and button variant derive from `actionable`, matching
`NextActionButton`.

**W3 — W5 (shape).** The banner becomes a persistent *next lane* docked at the
head of the main column: kind glyph → project name + phase chip → action → one
primary CTA → a queue pager (`2 of 5`). A persistent element uses
`role="status"` with `aria-live="polite"` rather than `role="alert"`, which
would re-announce on every refresh. The rail sorts by the same priority ladder
and badges each row with its action kind, so the first row is the next thing
to do. The recommendation grows an optional target (`taskId` / `approvalId` /
`tab`) so the CTA lands on the exact object; if the resolver needs snapshot
state it no longer receives, it moves to `packages/workflow-orchestrator` so
the CLI/TUI render the same recommendation instead of reimplementing it.

**W6 — W7 (context).** Recommendations state *why now* — pending approval
count, age of the oldest pending approval, dependent tasks held up — and each
one carries a short precedence explanation, so the ordering is legible rather
than implicit in `KIND_PRIORITY`. The empty state keeps exactly one create CTA.

## 5. Exit criteria

- [x] W0 — a phase-level recommendation can be dismissed and stays dismissed
      until that recommendation changes; the header chip restore path still works.
- [x] W1 — no recommended action targets a project hidden by the active filter;
      unfiltered behaviour is unchanged.
- [x] W2 — an observational recommendation no longer renders as a warning
      alert with a primary CTA.
- [x] W3 — the next lane is present while actions exist, the pager cycles the
      queue, and it announces politely rather than alerting.
- [x] W4 — the first rail row is the recommended action; row badges match the
      resolver output.
- [ ] W5 — "Open tasks" lands on the blocked task; "Review approvals" focuses
      the pending approval. **Partially met — see §7.** The task-ref plumbing
      landed (`tasksByProject` into the resolver, held-up dependent counts),
      "Review approvals" resolves to the inspector Blocker tab, but the lane
      CTA still routes at tab level and `NextAction` carries no task/approval
      target. Deferred as a documented follow-up; it does not block the rest.
- [x] W6 — a multi-approval action names every pending approval, with age and
      blocked-dependency counts shown only when the data supports them.
- [x] W7 — each recommendation explains its precedence; the empty state renders
      a single primary create action.
- [x] W8 — focused vitest green, `pnpm vds:validate` green, lint clean for the
      touched files, this plan updated with the implementation record.
- [x] Orchestrated verification (`POST …/verify`) records `passed: true`
      (project + plan `completed`; the report scopes the W5 remainder as a
      non-blocking follow-up).

## 6. Governance constraints

- **Design tokens are mandatory.** Every new visual value comes from
  `packages/ui-tokens/src/tokens.ts` as `var(--vestara-*)`. No `#hex`, no
  `bg-[#...]`, no inline `style=` literals. The next lane reuses
  `--vestara-status-warning-*`, `--vestara-accent-*`, `--vestara-spacing-*`,
  `--vestara-radius-lg`, and `--vestara-font-size-*` — create a token only if
  one is genuinely missing. See
  [UI/UX Governance](../governance/UI-UX-GOVERNANCE.md).
- **`apps/workspace` is Biome-ignored.** `pnpm lint:check` will not catch style
  drift in the touched file; the reviewer gate has to catch it.
- **Data flow.** No hardcoded arrays in JSX — the recommendation comes from the
  resolver over API-backed state, and any new fixture data belongs in a
  `*.fixtures.ts` file.
- **Orchestrator state is API-owned.** Project/plan/task state is mutated only
  through `/api/orchestration/*`, never by editing `.vestara/` runtime state.

## 7. Completion record (2026-10-21)

All 9 tasks ran to `completed` through the harness (implementation +
review + test gates per task). The project moved `executing → verifying →
completed`; verification passed with the report scoping the W5 remainder
as a non-blocking follow-up.

| Task | Outcome |
|---|---|
| W0 dismissal (`task-…3904-1`) | `buildBannerSignature` / `isBannerDismissed` / `shouldClearStaleBannerDismissal` in `orchestration-next-action.ts`; the page keys dismissal on the recommendation, never on `dashboard.attention`. 9 new resolver test cases. |
| W1 filter scope (`task-…3904-2`) | Resolution via `getScopedNextAction(visibleProjects, …)` / `getNextActions(visibleProjects, …)`; filtered-empty yields no banner; a "From N of M workflows" note discloses the scope. |
| W2 tone split (`task-…3904-3`) | `NextLane` and the banner derive tone and button weight from `actionable` (warning + primary vs info + secondary). |
| W3 next lane (`task-…3904-4`) | Persistent `NextLane` at the head of the main column: kind glyph, project name + phase chip, pager `#i of N`, `role="status"` + `aria-live="polite"`. |
| W4 rail order (`task-…3904-5`) | `sortProjectsByActionPriority` over the visible set; the first row carries the "Next" marker and per-row action badges. |
| W5 targeted CTA (`task-…3904-6`) | **Partial.** Task refs (`tasksByProject`) flow into the resolver and feed W6's held-up dependent counts; "Review approvals" resolves to the inspector Blocker tab. The `target` (task/approval id) on `NextAction` and scroll-to-object landing are not implemented — see the deferred item below. |
| W6 why-now (`task-…3905-7`) | `oldestPendingApprovalAge` + age buckets, every pending approval named, dependent-held-up counts rendered only when snapshot data supports them. |
| W7 queue order (`task-…3905-8`) | `NEXT_ACTION_PRECEDENCE` per-kind explanations plus `#rank of N` on every row; the empty state keeps a single create CTA. |
| W8 gates (`task-…3905-9`) | Resolver tests extended (47 passing), this plan updated. |

Independent verification (operator, 2026-10-21): `vitest run
orchestration-next-action.test.ts` 47/47 ✅ · `pnpm vds:validate` ✅ ·
`tsc -b` on `apps/workspace` clean ✅ · no `#hex` / `bg-[#…]` /
inline-`style` literals added ✅ · `docs:govern` (`validate --strict`,
`links --strict`, `evidence --strict`) ✅ · `documentation:check` introduces
zero new findings for this plan (the 4 current deltas are pre-existing
VES-UI-002 `implementation-route-exists` errors, recorded not fixed).

**Operational note.** The first dispatch deadlocked: all 9 tasks declare
`Orchestration.tsx` and the decision-bridge fired a second `runExecution`
while the first task held the lock, so tasks 2–9 blocked on a stale lock.
Recovered with the governed path (`POST …/tasks/:taskId/retry`) and drove
the remainder strictly one runnable task at a time. Recommendation for
`workflow-orchestrator`: plans whose tasks share `files` should either get
dependency edges at plan time or be serialized by the scheduler — `blocked`
tasks are currently invisible to `runExecution` with no re-drive.

**Deferred follow-up (W5 remainder).** Give `NextAction` an optional target
(`taskId` / `approvalId`), populate it from the task refs already in the
resolver, and have `handleProjectAction` scroll to and highlight that object
in the Tasks tab and the inspector Blocker list. Estimated: one task, one
agent turn. Does not block verification of the rest.

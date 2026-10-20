---
title: Activity Date-Range Report Plan — Report Icon, Drawer Timeline, and Details
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-10-11
next-review: 2026-11-11
---

# Activity Date-Range Report Plan — Report Icon, Drawer Timeline, and Details

## Status: DRAFT — Pending Director Approval

## Executive Summary

Build a report of **all activities within a selected date range** in the
Activity Room: a **report icon** in the Activity Room header opens the
**reusable Drawer**, which loads a **timeline view** containing the
activities in range plus the report details. Milestone capture:
`AR-REPORT` (Activity Room era, `pending`) in
`packages/workspace/src/milestone-service.ts`.

Related: `governance/UI-UX-GOVERNANCE.md`.

## Reuse Inventory (evidence — all exist today)

| Need | Existing piece | Notes |
|---|---|---|
| Reusable drawer shell | `apps/workspace/src/components/ui/Drawer` + `GlobalDrawerContext` / `GlobalDrawerHost` | `ActivityDetailDrawer` is the pattern to follow (record-stamped data, UNKNOWN preserved, never inferred) |
| Report icon slot | `ActivityRoomHeader.tsx` `ar-control-button` icon buttons | Add one icon button with tooltip + `aria-label`, same pattern as pause/clear/terminal |
| Date-range selection | `ActivityDateFilter.tsx` (AR-DATE-002) | Controlled presets (all/today/yesterday) + custom From/To + invalid-range handling, tested |
| Timeline presentation | `M11CActivityStream` / `M11CStreamItem` / `ActivityItem` + `activity-formatters` | Reuse kind icons/labels/relative time; report view is read-only projection |
| Drawer header actions | `ActivityDrawerHeaderActions.tsx` | Dock-position controls pattern |
| Backend records | `apps/api/src/routes/activity-room*.ts` projection of stored records | Range-query support to verify/extend (bounded, parameterized) |

No report icon or report view exists today — this is new surface, not a refactor.

## UX Specification

1. **Trigger:** report icon button in the Activity Room header
   (`aria-label="Activity report"`, tooltip "Activity report"); opens the
   Drawer, keeps the room visible behind it.
2. **Drawer content:**
   - Report header: selected range label + summary counts (total, by kind,
     by actor) via `SectionCard` composition.
   - `ActivityDateFilter` reused for range selection (extend presets with
     last-7/last-30 days); invalid ranges stay invalid, never silently
     coerced.
   - Timeline list of in-range activities reusing stream-item presentation;
     selecting an activity shows its details inline (same record-stamped
     content as `ActivityDetailDrawer`: summary, actor, kind context,
     evidence links; absent fields stay absent).
3. **Styling:** Vestara tokens only (`var(--vestara-*)`), governed Tailwind
   v4, `pnpm vds:validate`. Icon from `@mui/icons-material` (verify current
   MUI v9 API before use — `slots`/`slotProps`, no v5 memory).
4. **Data:** API range query first; typed local `*.fixtures.ts` fallback;
   never hardcoded arrays in JSX.

## Phases & Acceptance Criteria

1. **Backend range query** — activity records endpoint accepts bounded
   `from`/`to`; invalid/missing range returns invalid (never unbounded
   full-table dump by accident); unit tests.
2. **Report trigger** — icon in header opens/closes the Drawer; keyboard
   (Escape) and overlay close work via the Drawer shell; a11y names pass.
3. **Report drawer + timeline** — range select → summary counts → timeline
   renders in-range activities with details expansion; fixture-backed tests
   for presets, custom windows, invalid ranges, and empty-range state.
4. **Verification** — `lint:check`, `vds:validate`, scoped vitest (new +
   existing activity drawer/date tests).
5. **Milestone close-out** — flip `AR-REPORT` to `completed` only when all
   four phases meet criteria; Dashboard progress follows automatically.

## Risks

- Unbounded queries over large activity stores — contained by phase 1
  bounds (max window + pagination).
- Drawer competing with existing detail/agent drawers — single Drawer
  shell arbitrates; report never invents record structure.
- Second source of truth for activity data — the report is a read-only
  projection; the stream stays authoritative.

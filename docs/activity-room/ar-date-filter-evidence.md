---
title: AR-DATE-001-05 — Date-Range Filter Validation Evidence
version: 1.0.0
status: complete
owner: vestara
last-reviewed: 2026-09-27
next-review: 2026-10-27
---

# AR-DATE-001-05 — Date-Range Filter Validation Evidence

Milestone: `AR-DATE-001` — Activity Room Date-Range Filter.

## 1. Governance

- `pnpm vds:validate` — passed (`VDS 1.1 · Workspace/TUI/CLI aligned`).
- Hardcode scan over the `M11CActivityStream.tsx` diff — zero `#hex`, zero `bg-[#...]`, zero `style={{...}}` literals. New date-control classes use only `var(--vestara-*)` tokens (`surface-panel-raised`, `border-default`, `text-primary`, `text-muted`, `radius`, `font-size-xs/sm`, `spacing-element`) plus the existing `ar-stream-filter__tab` pill.
- Biome — `apps/workspace` is excluded from `biome check` by repo config, so no Biome gate applies to the touched files. No `console.log` / `TODO` added.
- No MUI introduced (design decision in `ar-date-filter-design.md` §2), so no v9 verification was required.

## 2. Tests

- New: `apps/workspace/src/pages/activity/M11CActivityStream.date.test.tsx` — 8 cases, all passing: absent/empty/malformed bounds, single-day inclusivity, half-bounded windows, midnight boundary inclusivity/exclusivity, invalid-range passthrough, unparseable timestamps, AND-composition with participant + category + search, Marionette 23+2 shape.
- Regression (direct invocation): date 8/8, density, tool suites green.
- Regression (supported runner `pnpm test`): 687/688 across 91 files. The single failure is `packages/activity-room/__tests__/runtime-question-projection.test.ts > projects room attention without creating a response authority` — a package untouched by this milestone (ADJACENT, recorded, not acted on).
- Note: `M11CActivityStream.history.test.tsx > keeps the history affordance in its loading state` fails only under direct per-package `vitest` invocation (`Invalid Chai property: toBeDisabled` — jest-dom matchers load via the root config's setup file). It passes under the supported `pnpm test` runner. Pre-existing invocation artifact, not a regression.

## 3. Functional evidence (activity-only, no message content)

- `filterStreamItems` with `{ startDate: '2026-09-26', endDate: '2026-09-27' }` over the Marionette-shaped fixture (23 events 2026-09-26 ~11:40–12:02 local, 2 events 2026-09-27 14:23 UTC) returns 25; single-day windows return 23 and 2 respectively (test `isolates the Marionette yesterday/today shape`).
- UI path: Activity Room → participant `Marionette Evangelista` → date preset `Yesterday` / custom `2026-09-26` to `2026-09-27` isolates the same 23 + 2 without opening message content. Invalid ranges pause the predicate with a warning banner; windows predating loaded history surface the existing `Load older history` affordance with a coverage note.

## 4. Deliverables

- `apps/workspace/src/pages/activity/M11CActivityStream.tsx` — `startDate` / `endDate` options, `parseCalendarDay` / `matchesDateWindow` / `isValidDateRange` helpers, filter-bar presets + From/To + warnings.
- `apps/workspace/src/pages/activity/M11CActivityStream.date.test.tsx` — 8 vitest cases.
- `docs/activity-room/ar-date-filter-audit.md`, `ar-date-filter-design.md`, `ar-date-filter-evidence.md` (this file).

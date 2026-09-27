---
title: AR-DATE-001-02 — Date-Range Filter UI Design
version: 1.0.0
status: complete
owner: vestara
last-reviewed: 2026-09-27
next-review: 2026-10-27
---

# AR-DATE-001-02 — Date-Range Filter UI Design

Milestone: `AR-DATE-001`. Parent audit: `docs/activity-room/ar-date-filter-audit.md`.
Scope: design only. No code changed in this subtask.

## 1. Placement and composition

- Extend the existing filter bar in `M11CActivityStream.tsx:793-829` (`ar-stream-filter`), right cluster next to search + density select. No new panel, no new route.
- Functional React 19, local `useState` for `startDate` / `endDate` (ISO `yyyy-mm-dd` strings, empty = unbounded), lifted into `filterStreamItems` options in `03`.
- Controls: preset pills (`All`, `Today`, `Yesterday`) + native From/To date inputs + `Clear` button. Presets set the inputs; manual edits clear the preset to custom.
- Filtered-empty and clear-all (`clearAllFilters`, `M11CActivityStream.tsx:712-718`) gain date reset alongside participant + workflow + search.

## 2. Why no MUI

- Per `docs/governance/UI-UX-GOVERNANCE.md` §5, MUI v9 is for complicated UI only (grids, pickers with a11y + virtualization). A From/To pair with presets stays in Vestara primitives — native date inputs carry built-in keyboard + locale + calendar behavior with zero new dependency.
- No `ExternalScout` / webfetch verification needed because no MUI is introduced. If a future rich calendar popover is requested, that subtask must verify `slots` / `slotProps` against current MUI v9 docs first.

## 3. Token mapping (every visual value)

Canonical authority: `packages/ui-tokens/src/tokens.ts` + `packages/ui-tokens/src/css.ts`; workspace aliases in `apps/workspace/src/styles/*.css`.

- Container: `background: var(--vestara-surface-panel)`, `border: 1px solid var(--vestara-border-subtle)`, `border-radius: var(--vestara-radius-lg, var(--vestara-radius))`
- Labels (`From`, `To`): `color: var(--vestara-text-muted)`, `font-size: var(--vestara-font-size-xs)`, `font-weight: var(--vestara-font-weight-medium)`
- Inputs: `background: var(--vestara-surface-panel-raised)`, `color: var(--vestara-text-primary)`, `border: 1px solid var(--vestara-border-default)`, focus `border-color: var(--vestara-border-focus)`, `border-radius: var(--vestara-radius)`, `padding: var(--vestara-spacing-element) var(--vestara-spacing-section)`, `font-size: var(--vestara-font-size-sm)`
- Preset pills reuse `ar-stream-filter__tab` + `ar-stream-filter__tab--active`: active gets `color: var(--vestara-accent-text)`, `border-color: var(--vestara-accent-border-active)`, dot `background: var(--vestara-accent-primary)`
- Spacing: `gap: var(--vestara-spacing-element)` inside group, group margin from existing filter-bar rhythm. No new spacing scale.
- Typography: inputs `TYPOGRAPHY.bodySmall`, labels `TYPOGRAPHY.label`, counts `TYPOGRAPHY.caption`. No arbitrary sizes.

Tailwind v4 (governed renderer): `flex items-center gap-[var(--vestara-spacing-element)]`, `rounded-[var(--vestara-radius)]`, `border border-[var(--vestara-border-default)]`, `bg-[var(--vestara-surface-panel-raised)]`, `text-[var(--vestara-text-primary)]`, `text-[length:var(--vestara-font-size-xs)]`. If any needed token is missing, `03` creates `--vestara-{category}-{name}` in `packages/ui-tokens/src/tokens.ts` first — never `bg-[#...]` or `style={{ color: '#...' }}`.

## 4. States and behavior

- Empty: both inputs blank = today's `All` preset, no date predicate.
- Partial: only From or only To = half-bounded window (inclusive).
- Invalid (`From > To`): show inline hint in `var(--vestara-status-warning)` + `var(--vestara-font-size-xs)`, apply no date predicate until valid. Never silently swap.
- Timezone: compare by calendar day in the viewer's locale; events store UTC ISO (`M11CStreamItem.timestamp`). `03` defines inclusive day boundaries and documents the conversion; DST edge cases covered by test.
- History interplay: date window applies over recovered items; when the window predates loaded history, the UI surfaces the existing `Load older` affordance with a coverage note (`olderLoaded`, `hasMoreHistory`, `snapshotComplete`) rather than claiming emptiness.
- Accessibility: `role="search"` group already exists; label both inputs, `aria-label="Filter from date"` / `"Filter to date"`, presets as `aria-pressed` pills matching existing tabs, full keyboard operability via native inputs.

## 5. Data

- Client-side only over `M11CStreamItem[]`. No new API, no mock server, no fixtures. Matches governance data order (API first — none needed — so local projection, never hardcoded arrays in JSX).

## 6. Validation for 03–05

- `pnpm vds:validate` zero HARDCODE flags; `biome check` clean; no `console.log` / `TODO`.
- Vitest: boundaries, invalid range, timezone, AND-composition with participant + workflow + density + category + search.
- Evidence: Marionette Evangelista window 2026-09-26 to 2026-09-27 shows 23 + 2 without opening message content.

---
title: AR-DATE-002 — Date Filter Dropdown Evidence
version: 1.0.0
status: complete
owner: vestara
last-reviewed: 2026-09-27
next-review: 2026-10-27
---

# AR-DATE-002 — Date Filter Dropdown Evidence

Milestone: `AR-DATE-002` — Activity Date Filter Dropdown. Parent: `AR-DATE-001` (100%).

## 1. What changed

- New `apps/workspace/src/pages/activity/ActivityDateFilter.tsx` — controlled dropdown owning the date icon trigger (`DateRangeOutlined`, `SIZING.icon.md`), presets (`All dates`, `Today`, `Yesterday`), native From/To inputs, `Clear dates` / `Done` footer, invalid-range warning, outside-click + Escape close with focus return.
- `M11CActivityStream.tsx` — filter bar renders one `<ActivityDateFilter>` trigger; inline presets/inputs removed. Window state, predicate, empty-title, clear-all, and history coverage note keep AR-DATE-001 behavior unchanged.

## 2. Governance

- `pnpm vds:validate` — passed.
- Hardcode scan over the stream diff and the new component/test — zero `#hex`, zero `bg-[#...]`, zero `style={{...}}`. Panel uses `var(--vestara-z-index-popover)`, `var(--vestara-radius-lg)`, `var(--vestara-border-default)`, `var(--vestara-surface-panel-raised)`, `var(--vestara-elevation-lg)`, spacing/typography tokens; trigger reuses `ar-stream-filter__tab`.
- No MUI added beyond the already-present `@mui/icons-material` set (no new dependency, no v9 verification needed). No `console.log` / `TODO`. Biome N/A (`apps/workspace` excluded by repo config).

## 3. Tests

- New `ActivityDateFilter.test.tsx` — 5/5 green (closed-by-default, preset reporting, manual custom edits, invalid warning + clear, Escape close with focus return).
- `M11CActivityStream.date.test.tsx` — 8/8 green (predicate untouched).
- Stream regression (direct invocation): density + tool + base suites 21/21 green. History suite passes under the supported `pnpm test` runner (direct-invocation `toBeDisabled` artifact documented in AR-DATE-001 evidence, unchanged).

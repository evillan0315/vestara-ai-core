---
title: AR-TOOLTIP-001 — Reusable Accent Tooltip Evidence
version: 1.0.0
status: complete
owner: vestara
last-reviewed: 2026-09-27
next-review: 2026-10-27
---

# AR-TOOLTIP-001 — Reusable Accent Tooltip Evidence

Milestone: `AR-TOOLTIP-001` — Reusable Accent Tooltip (general Activity Room).

## 1. Tokens

- `AccentTheme.overlay` added to `packages/ui-tokens/src/themes.ts` with dark (`rgba(26, 20, 8, 0.96)`) and light (`rgba(255, 251, 235, 0.97)`) values, mapped to `--vestara-accent-overlay` in `packages/ui-tokens/src/css.ts`.
- `apps/workspace/src/styles/generated-tokens.css` regenerated (77 vars per mode, overlay present in both).
- `--vestara-z-index-tooltip: 1800` added to `apps/workspace/src/styles/index.css`, mirroring `Z_INDEX.tooltip`.

## 2. Component

- `packages/ui/src/components/Tooltip.tsx`, exported from `packages/ui/src/index.ts`: controlled-by-parent content, `top | bottom | left | right` placements, `disabled`, `maxLength` (default 600, ellipsis), 200ms open delay, hover + focus open, outside-leave / blur / Escape close, `role="tooltip"` with `aria-describedby` linkage.
- Background `var(--vestara-accent-overlay)`, border `var(--vestara-accent-border-active)`, text `var(--vestara-text-primary)`, radius / spacing / typography / elevation tokens; Tailwind is the renderer only. Newlines preserved via `whitespace-pre-line`.
- Wired to the stream message (`M11CStreamItem.tsx`): full body shows only while truncated (`collapsible && !expanded`); the native `title` duplicate and the bare-`kind` fallback are gone.

## 3. Validation

- `pnpm vds:validate` passed; `pnpm dependencies:check` valid across 120 projects; Biome clean on all touched package files.
- Hardcode scan over the component, its test, and the stream diff: zero `#hex`, zero `bg-[#...]`, zero `style={{...}}`.
- Tests: `Tooltip.test.tsx` 5/5, `M11CActivityStream.date.test.tsx` 8/8, `ActivityDateFilter.test.tsx` 5/5, stream density + tool + base suites 21/21.

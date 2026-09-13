# UI/UX Governance — Vestara AI Core (MANDATORY)

**Status:** ENFORCED for all agents (vestara-context, planner, developer, reviewer, verifier, assistant, browser, CoderAgent) + human contributors.
**Authority:** Director directive — overrides any local preference.
**Applies to:** `apps/workspace/**`, `packages/ui/**`, `packages/ui-tokens/**`, `apps/workspace/src/styles/**`, any file that renders pixels.

> **Violation = BLOCKER.** PRs that break this governance fail CI and require re-authorization.

---

## 1. Vestara Design Token — MANDATORY

* All visual values **must** come from the canonical token system.
  * **Source of truth:** `packages/ui-tokens/src/tokens.ts` + `packages/ui-tokens/src/themes.ts` + CSS variables `--vestara-*` generated via `packages/ui-tokens/src/css.ts` / `generate.ts`.
  * **Renderer-neutral:** `packages/design-system` re-exports the same tokens for web + TUI.
  * Usage: `var(--vestara-surface-panel)`, `var(--vestara-text-primary)`, `var(--vestara-border-subtle)`, `var(--vestara-accent)`, `var(--vestara-radius-lg)`, etc. or `COLOR.*`, `SPACING.*`, `RADIUS.*` from `@vestara/ui-tokens`.
* **Validation:** `pnpm vds:validate` (`scripts/vds-validate.mjs`) checks semantic tokens exist in `apps/workspace/src/styles/index.css` and that Workspace/TUI/CLI adapters align. Do **not** bypass.

## 2. Clean & Modern Code

* Biome: `single quotes, trailing commas, semicolons, 2-space indent, 120 width`.
* No dead code, no `console.log`, no `TODO/FIXME` left behind. Remove before handoff (Self-Review Loop).
* Component shape: functional React 19, hooks, `SectionCard`/`GalleryCard`/`PageHero` composition — no class components.
* File organization: `features/` owns composition, `components/` is reusable, `hooks/` is state. No business logic in `App.tsx` pages beyond wiring.

## 3. NO HARDCODE — Zero Tolerance

Hardcode = any literal visual value not sourced from a token.

| Forbidden | Required |
|-----------|----------|
| `color: #f59e0b` | `color: var(--vestara-amber)` or `COLOR.brand.amber` |
| `bg-[#ff0000]`, `text-[13px]` arbitrary | `bg-[var(--vestara-surface-panel)]` via token, or `text-[length:var(--vestara-font-size-sm)]` |
| `border: 1px solid #27272a` | `border: 1px solid var(--vestara-border-subtle)` |
| `style={{ margin: '12px' }}` | `className="p-[var(--vestara-spacing-3)]"` or `SPACING[3]` |
| `fontFamily: 'Arial'` | `TYPOGRAPHY.body.fontFamily` |

**Exception:** Storybook fixtures, visual-test baselines, and `*.tokens.css` where the token is *defined* — not *consumed*.

**CI gate:** `biome check` + `vds-validate` + manual reviewer flag `HARDCODE`.

## 4. Tailwind v4 — Required, but Governed

* **Must** use Tailwind (project is `tailwindcss@4` via `apps/workspace`).
* **Forbidden:** inline `style=` for visual values, arbitrary utility classes that encode hardcode, and raw `bg-white`/`text-black` etc. without token indirection.
* **Pattern — `vestara-*`:**
  1. **Check token first:** is `--vestara-*` already defined in `packages/ui-tokens/src/tokens.ts` **or** `apps/workspace/src/styles/*.css`?
     * Yes → use it: `bg-[var(--vestara-surface-panel)]`, `text-[var(--vestara-text-primary)]`, `rounded-[var(--vestara-radius-lg)]`
     * Example: `className="bg-[var(--vestara-surface-panel)] border border-[var(--vestara-border-subtle)] text-[var(--vestara-text-secondary)]"`
  2. **Not available → create it** following `vestara-*` naming:
     * **Token name:** `--vestara-{category}-{name}` where category ∈ `surface|text|border|accent|status|spacing|radius|elevation|motion|z-index|sizing|density|color`
     * **Location:** Add to `packages/ui-tokens/src/tokens.ts` (canonical) **and** regenerate CSS via `packages/ui-tokens/src/css.ts`; or for app-local, add to `apps/workspace/src/styles/marketplace.css` etc. with `var(--vestara-*)` alias and document in `14-design-tokens.md`.
     * **Example:** need `--vestara-surface-glass` → add to `COLOR.surface.glass: 'rgba(255,255,255,0.06)'` + CSS var, then `bg-[var(--vestara-surface-glass)]`.
  3. **Never** invent `bg-[#...]` or `text-[#...]` — that is hardcode (see §3).

* Valid Tailwind with tokens: `p-[var(--vestara-spacing-4)]`, `gap-[var(--vestara-spacing-2)]`, `shadow-[var(--vestara-elevation-md)]`, `duration-[var(--vestara-motion-normal)]`.
* All Tailwind usage must still pass through tokens — Tailwind is the *renderer*, tokens are the *authority*.

## 5. Material UI v9 + Material Icons — Optional, but Capability Required

* **Optional:** For *complicated UI* only (data grids, date pickers, autocompletes, dialogs that benefit from a11y + keyboard + virtualized handling). Simple cards, heroes, and marketplace gallery **must stay** with Vestara primitives (`GalleryCard`, `Pill`, `SectionCard`) — do not pull MUI for a card.
* **When used:** `npm install @mui/material@^9 @mui/icons-material@^9 @emotion/react @emotion/styled` (MUI v9 peer deps). Import `import Button from '@mui/material/Button'` + `import Icons from '@mui/icons-material/...'` — do not pin to v5/v6 docs.
* **Agents MUST know latest MUI v9:**
  * **v9 (2025-2026) facts:** Requires React 18+, Emotion 11+, uses `theme` via `createTheme()` from `@mui/material/styles`, icons are `Outlined`/`Rounded`/`Sharp` variants, `sx` prop still supported but `slots`/`slotProps` replaces `components`/`componentsProps` (v5 compat removed).
  * **Capability check:** Before using MUI, call `ExternalScout` (or `webfetch` to `https://mui.com/material-ui/getting-started/` + `https://mui.com/material-ui/migration/migration-v9/`) to verify current API — **never fabricate** v9 API from v6 memory. `pnpm --filter @vestara/workspace-ui add @mui/material` must resolve to `9.x`.
  * **Styling interop:** Wrap MUI in `ThemeProvider` that maps Vestara tokens: `createTheme({ palette: { primary: { main: 'var(--vestara-accent)' }}, shape: { borderRadius: 'var(--vestara-radius-lg)' } })` so MUI does not introduce hardcode.

## 6. Data & Mocking — API First, Mock Second

```
Need data? → Check API exists? → Yes → use it
                          ↓ No
               Is mock server running? (check `pnpm mock:status` / `http://127.0.0.1:3002` / `apps/workspace/src/mocks/server.ts`)
                          ↓ No
               Use LOCAL mock data (fixture file, `apps/workspace/src/features/**/fixtures.ts` or `overview.fixtures.ts`)
                          ↓ Never
               Hardcode in component
```

* **Check mock server:** `pnpm --filter @vestara/workspace-ui mock` or `GET /api/mock/*` or `lsof -i :3002`. If running, `fetch('/api/mock/<resource>')`.
* **Local mock:** Create `*.fixtures.ts` with typed data, import it, gate with `if (!apiData) return fixtures` — do not inline arrays in JSX. Example: `features/overview/overview.fixtures.ts` pattern.
* **Never** `const data = [{ id: 1, name: 'Test' }] // hardcoded` inside a component.

## 7. Enforcement

* **Pre-commit:** `biome check` + `pnpm dependencies:check` + `vds-validate`.
* **Reviewer:** Flags any `style=` with hex, any `bg-[#`, any `color: #`, any `text-[12px]` not mapping to `TYPOGRAPHY.*`, any Tailwind without `var(--vestara-`.
* **Authoring:** When in doubt, open `packages/ui-tokens/src/tokens.ts` and `apps/workspace/src/styles/index.css` first — that is the palette.

**For agents:** Load `.opencode/skills/vestara-ui-ux/SKILL.md` on any UI task. For humans: this file is the contract.

*Last updated: 2026-09-13 — Manila (Asia/Manila) — Director directive.*

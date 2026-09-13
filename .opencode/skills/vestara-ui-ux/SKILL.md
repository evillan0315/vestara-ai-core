# Vestara UI/UX Governance Skill

**When to use:** Any task that touches `apps/workspace/**`, `packages/ui/**`, `packages/ui-tokens/**`, `apps/workspace/src/styles/**`, or any component that renders pixels. Load this skill BEFORE reading or writing UI code.

## Mandatory Checklist (do not skip)

```
□ Read docs/governance/UI-UX-GOVERNANCE.md — the single source of truth
□ Open packages/ui-tokens/src/tokens.ts — the token vocabulary
□ Check apps/workspace/src/styles/index.css for CSS var existence — the rendered authority
□ No hardcode? (no #hex, no bg-[#], no style={{color:}} unless token var)
□ Tailwind? If yes, every utility maps to var(--vestara-*) — if missing, CREATE vestara-* token first
□ MUI? Only if complicated UI — verify MUI v9 docs via ExternalScout/webfetch (https://mui.com/material-ui/migration/migration-v9/) — do not hallucinate v5 API
□ Data needed? Check API → mock server running? → local fixtures (overview.fixtures.ts pattern)
□ Clean & modern? (Biome, no console.log/TODO, functional React 19)
```

## 1. Design Token First

* Source: `packages/ui-tokens/src/tokens.ts` (`COLOR`, `SPACING`, `RADIUS`, `TYPOGRAPHY`, `ELEVATION`, `MOTION`, `Z_INDEX`, `SIZING`) → `apps/workspace/src/styles/*.css` → `var(--vestara-*)`.
* Example: `bg-[var(--vestara-surface-panel)] border border-[var(--vestara-border-subtle)] text-[var(--vestara-text-primary)] rounded-[var(--vestara-radius-lg)]`

## 2. Tailwind Governed

* Must use Tailwind v4, but **never** `bg-white`, `text-[13px]` arbitrary, `style=`. 
* Missing token? Create `--vestara-{category}-{name}` in `packages/ui-tokens/src/tokens.ts` (+ `src/css.ts` regen) or app-local `marketplace.css` alias. Category ∈ surface|text|border|accent|status|spacing|radius|elevation|motion|z-index|sizing|density|color.

## 3. Hardcode = BLOCKER

Any `color: #...`, `bg-[#...]`, `style={{ margin: '12px' }}` without token is a BLOCKER — stop, create token, then continue.

## 4. MUI v9 Capability

* Latest is v9 (2026). Before using, run `ExternalScout` for `https://mui.com/material-ui/getting-started/` and migration guide. Verify `slots`/`slotProps` (not `components`), Emotion peers, `createTheme` mapping to Vestara tokens.
* Wrap: `createTheme({ palette: { primary: { main: 'var(--vestara-accent)' } }, shape: { borderRadius: 'var(--vestara-radius-lg)' } })`.

## 5. Mock Data

* Pattern: `GET /api/<resource>` → if 404/empty → `fetch('/api/mock/<resource>')` if server on `:3002` → else import `*.fixtures.ts` local. Never inline hardcoded arrays in JSX.

## 6. Verification

* Run `pnpm lint:check` (Biome) + `bash build-order.sh` + `pnpm vds:validate` before marking UI task complete.
* Reviewer will flag any hardcode or non-vestara Tailwind.

Refer to `docs/governance/UI-UX-GOVERNANCE.md` for full enforcement details.

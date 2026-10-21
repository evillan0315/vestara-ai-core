# Extractor UI — Build Workflow

Source: `/home/user/Downloads/Vestara-Extractor-Restructured.html` (minified React 18.3.1 bundle, dark glass theme).
Target: `apps/extractor-ui` — React 19 + TypeScript + Vite + MUI v9 + Material Icons, all visuals via
`var(--vestara-*)`.

## 1. Artifact review (done 2026-10-21)

Recovered from the bundle (UI copy + class structure — the JS is minified, no source maps):

| Area | Recovered content |
|------|-------------------|
| Header (sticky, blur) | `VESTARA / EXTRACTOR`, badges `Bundle 342KB · CSS 18KB · 12 reference components`, `Command K ⌘K`, `Drop artifact`, `Export manifest` |
| Sidebar | Component list w/ status dots (`fileicon TS`, `UI`, `MD`, icons file/button/card/code/markdown), `Recent extractions` (`vestara_market_v3.html 2m 342KB`, `landing_tokens.html 18m 128KB`, `dashboard_dark.html 1h 89KB`) |
| Drop zone | `Drop React artifact HTML here`, `Client-side only — parsed in your browser, never uploaded`, `Choose file`, URL input + `Fetch`, `.html • up to 10MB`, `Paste • Drag • URL` |
| Reference strip | `Bundle • Live extraction • Glass workspace` + disclaimer that reference examples are not parsed output |
| Preview demos | File-type cards (TS/UI/MD), `Primary/Ghost/Outline` buttons, card skeleton, empty `Live preview placeholder` |
| Inspector | `PROPS` table (`Prop/Type/Default`: `components`, `vars`), `Used by preview • Resolved at runtime`, `IMPORT`, `ACTIONS`, `Extractor tip` (local-only, preview-mode switching) |
| Toasts | `Command palette — ⌘K`, `Scrolled to drop zone`, `Manifest exported`, `Artifact dropped — parsing locally`, `File picker — choose HTML`, `Enter a URL first`, `Close tab` |
| Theme | canvas `#0A0F14`, elevated `#101820`, border `rgba(255,255,255,0.07)`, accent `#00E5FF`, text `#E6F0F2`, muted `#7A8A91`, success `#22C55E`, warning `#F59E0B`, radius `10px`, Geist/Geist Mono |

Toasts confirm behaviors: command palette, smooth-scroll to drop zone, manifest export, local parsing, file picker, URL fetch validation.

## 2. Scaffold (done)

```
apps/extractor-ui/
  package.json          @vestara/extractor-ui, React 19, MUI v9, Vite 7, Tailwind v4
  tsconfig.json / tsconfig.app.json / tsconfig.node.json   (Vite composite template)
  vite.config.ts        react + tailwindcss plugins, dev port 5174
  index.html
  src/main.tsx, src/App.tsx, src/theme.ts, src/styles.css, src/vite-env.d.ts
  src/features/extractor/ExtractorPage.tsx
  src/features/extractor/extractor.fixtures.ts
```

`apps/*` is already in `pnpm-workspace.yaml` and root `workspaces`, so no root edits were needed.
`pnpm build:references` picks the new app up automatically.

## 3. Token mapping (done — promotion candidates)

`src/styles.css` is the definition site: it SETS canonical vars to the artifact palette, components only
consume `var(--vestara-*)`. App-local aliases (not in canonical categories) to promote to
`packages/ui-tokens/src/tokens.ts` if reused elsewhere:

- `--vestara-font-sans`, `--vestara-font-mono` (system stacks; artifact used Google-Fonts Geist — dropped to avoid a runtime network dependency)
- `--vestara-extractor-drop-idle`
- `--vestara-accent-*` cyan values (`#00E5FF` family) vs canonical amber — a deliberate per-app theme override, scoped to this app's `:root`

## 4. Remaining phases

| # | Phase | Acceptance |
|---|-------|------------|
| 4 | Real artifact parsing | `DOMParser` element counter exists; extend to extract component tree, props, and CSS vars into the inspector (replace placeholders) |
| 5 | Preview modes | Wire `Original` / `Cleaned` tabs to parsed markup (sanitized) instead of placeholders |
| 6 | Reference demos | Replace static demo cards with the 12 reference components from the bundle badges |
| 7 | Mock/API | Check mock server `:3002` / `apps/workspace/src/mocks/server.ts`; else add `*.fixtures.ts` (already started) — never hardcode in JSX |
| 8 | Verify | `biome check`, `tsc -b`, `vite build`, `pnpm vds:validate`, `pnpm dependencies:check`, `vitest run` |

## 5. Run

```bash
pnpm install
pnpm --filter @vestara/extractor-ui dev      # http://127.0.0.1:5174
pnpm --filter @vestara/extractor-ui build
```

## 6. Classifications (no mutation authority taken)

- **OBSERVATION** — MUI v9 `slots`/`slotProps` used from knowledge; governance requires verifying against
  `https://mui.com/material-ui/migration/migration-v9/` via webfetch before considering this closed.
- **ADJACENT** — `apps/workspace` still pins MUI v6 (`@mui/material ^6.4.0`); extractor-ui uses v9 per this
  task. Aligning the two is out of scope here.
- **ADJACENT** — `shape.borderRadius: 10` is numeric (MUI requires a number); value matches `--vestara-radius`.
- **ADJACENT** — `z-index` used `var(--vestara-z-index-sticky, 40)` with fallback; promote a canonical
  `--vestara-z-index-sticky` token if the pattern spreads.

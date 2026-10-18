---
title: VES-UI-001 — Workspace UI v2 Desktop Shell + Package Alignment Plan
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-10-18
next-review: 2026-11-01
---

# VES-UI-001 — Workspace UI v2 Desktop Shell + Package Alignment Plan

| Field | Value |
|---|---|
| Status | PROPOSED — awaiting reviewer + audit |
| Scope | New Workspace UI v2 desktop shell (web-first, then OS port) + governed refactor of aligned packages |
| Source prototype | `assets/templates/html/v2/start/workspace-ui-v2/` (Vite + React 18.3.1 + Tailwind 3.4, v7.15.112) |
| Target | `apps/workspace` (`@vestara/workspace-ui`, React 19.2 + Tailwind v4 + MUI icons (currently v6.4.0), app v1.1.0) |
| Implementation | NOT YET AUTHORIZED (phases execute on approval) |
| Last Updated | 2026-10-18 |

> All UI work follows `docs/governance/UI-UX-GOVERNANCE.md` (tokens via
> `var(--vestara-*)`, no hardcode, validate via `pnpm vds:validate`).
> Package work must pass `pnpm dependencies:check` (no cycles, no deep
> imports, no undeclared internal deps).

## 0. Goal and non-goals

**Goal:** Ship a first-class Vestara Desktop Shell — teal V identity,
32px small header, draggable windows, dock, system menu, and a
boot → login → desktop → shutdown state machine — by promoting the
`start/workspace-ui-v2` prototype into the governed Workspace UI, and
refactor the packages it touches so they align with the current
architecture (tokens, boundaries, tests, data layer).

**Non-goals (explicit):**
- No changes to provider/model execution provenance or OpenCode adapter contracts.
- No changes to `.vestara/` runtime state, credentials, or `.env`.
- No new instruction files (per docs governance — use `opencode.json` instructions).
- OS host port (Phase 5) is planned but executes only after web validation.

## 1. Findings from inspection (why this plan exists)

### 1.1 Source prototype inventory

| Surface | File | Behavior |
|---|---|---|
| App shell + window manager | `src/App.tsx` | `Phase` state machine (`boot/login/desktop/shutdown`), z-order window stack, 4 default windows, `openType/closeWin/minimizeWin/bringFront` |
| Types | `src/lib/types.ts` | `Phase`, `LoginMode`, 9 `WinType`s (`workspace/terminal/marketplace/files/overview/settings/agent/diagnostic/activity`), `WinData`, `PackageDef` |
| Tokens (hardcoded) | `src/lib/constants.ts` | `TOKENS` hex map (`bg #0a1214`, `surface #0d191b/#111e20/#132528`, `border #1a3a3d`, `accent #2de8c3`, text ramp, `danger/success/warning`), `BOOT_LOGS`, `WORKSPACE` |
| 32px header | `src/components/TopBar.tsx` | `h-[32px]`, teal V logo + `VESTARA` + live dot + `v7.15` pill; centered 200px `Spotlight ⌘K`; clock (`HH:MM:SS` teal seconds) + date; Wifi/Battery 12px icon buttons; avatar `E` + chevron |
| Window chrome | `src/components/VestaraWindow.tsx` | Draggable 36px header (traffic-light close/minimize/maximize, title + subtitle, type pill), 28px status bar (`WxH`, `z:N`), 8-way resize handles, focus ring `border-[#2de8c3]/40`, double-click maximize |
| Boot / shutdown | `src/components/BootScreen.tsx` | Progress + `BOOT_LOGS` stream + `pulseGlow` keyframes (inline `<style>`); shutdown spinner + `SHUTTING DOWN SHELL OS` |
| Login | `src/components/LoginScreen.tsx` | Split card (brand panel + auth panel), modes `default/locked/switch`, hardcoded user `Eddie R Villanueva`, password + `Continue → Desktop`, biometric/skip links |
| System menu | `src/components/SystemMenu.tsx` | `fixed` overlay + dropdown: user card, Lockscreen / Switch User / Settings, Logout / Shutdown (danger), footer `VESTARA SHELL OS • 112 FINAL` |
| Dock | `src/components/Dock.tsx` | `h-12` centered pill, 8 package icons, open (teal dot) / minimized (amber dot) indicators, V logo cap |
| Desktop icons | `src/components/DesktopIcons.tsx` | 5 icons, double-click to open |
| Teal logo | `src/components/VestaraLogoTeal.tsx` | Inline SVG, same V geometry as `public/logo.svg`, but **hardcoded** teal ramp (`#E6FFF9 → #2DE8C3 → #042F2E`), hardcoded spine `#134E4A` |
| Packages (7) | `src/packages/*.tsx` | `Overview` (static hero + 4 stat cards), `ActivityRoom` (static participant rail + 3 records), `AgentWorkforce` (6-card static grid), `Marketplace` (6 static cards), `Terminal` (static transcript), `Settings` (static shell/topbar/token panels), `Diagnostic` (32 sine bars with `Math.random`) |

### 1.2 Current Vestara mapping

| Need | Existing asset | Path |
|---|---|---|
| V logo (theme-aware) | `VestaraMark` — inline SVG, accent ramp from `--vestara-accent-light/accent/accent-dark` | `apps/workspace/src/components/branding/VestaraMark.tsx` |
| Logo wrapper | `Logo.tsx` | `apps/workspace/src/components/Logo.tsx` |
| Top bar (current: 64px) | `AppHeader` + `HeaderSearch/Connection/Notifications/UserMenu` | `apps/workspace/src/components/layout/AppHeader/` |
| Shell geometry | `ShellRoot` (viewport) + `ShellLayout` (header slot, sidebar, drawers) | `apps/workspace/src/layouts/` |
| Topbar styling | `.shell-topbar` (blur + accent hairline) | `apps/workspace/src/styles/index.css:723` |
| Teal accent | `ACCENT_PALETTES.shell` (`#2de8c3`, light `#5ff0d4`, dark `#10b7a0`) | `packages/ui-tokens/src/tokens.ts:748` |
| Runtime theming | `theme.tsx` sets `--vestara-accent*` from selected palette | `apps/workspace/src/lib/theme.tsx:332` |
| Capability spec | CSP-010 (Workspace UI, Implemented v1.1) | `docs/capabilities/CSP-010-workspace-ui/` |
| OS capability | CSP-016 (AI OS Integration, Implemented v2.0) | `docs/capabilities/CSP-016-os-integration/` |
| Prior review | `Vestara-Teal-Implementation-Review.html` (Executive Summary, De-minified Component Map, Branding & Tokens Extraction, Implementation Steps, Roadmap & Risks, Reviewer Notes) | `assets/templates/html/v2/start/` |

### 1.3 Gap analysis (prototype → production)

| # | Gap | Severity | Plan ref |
|---|---|---|---|
| G1 | Hardcoded hex throughout (`bg-[#0a1214]`, `text-[#5a7a78]`, …) — violates NO-HARDCODE | BLOCKER | Phase 0 |
| G2 | `VestaraLogoTeal` hardcodes teal ramp; `VestaraMark` already theme-aware — must reuse, not duplicate | BLOCKER | Phase 0 |
| G3 | React 18.3.1 → 19.2, Tailwind 3.4 → v4, lucide-react → MUI icons (repo has v6.4.0; v9 migration is a separate concern) | High | Phase 0/1 |
| G4 | `HeaderSearch` (`h-11`) + `HeaderUserMenu` (`h-10`) do not fit a 32px bar — density redesign required | High | Phase 1 |
| G5 | All package content is static (hardcoded arrays in JSX) — needs API → mock `:3002` → `*.fixtures.ts` | High | Phase 3 |
| G6 | No tests, no a11y (keyboard drag, focus trap, `prefers-reduced-motion`, aria) | High | Phase 6 |
| G7 | `Math.random()` in `Diagnostic` bars + window spawn — non-deterministic, breaks visual regression | Medium | Phase 3 |
| G8 | Inline `<style>` keyframes in `BootScreen` — move to governed CSS | Medium | Phase 2 |
| G9 | Google Fonts via CDN `<link>` — use token font stack / self-host | Medium | Phase 0 |
| G10 | `Files` WinType has no content (falls to `Package {type} wired` div) | Medium | Phase 3 |
| G11 | Version skew (prototype v7.15.112 vs `@vestara/workspace-ui` v1.1.0 / root v0.3.0) — do not import version strings | Low | Phase 0 |
| G12 | Wallpaper PNGs (2× 220KB) in prototype assets — use `assets/wallpapers/` + `os/customization/assets/` | Low | Phase 1 |

## 2. Token mapping (prototype → `--vestara-*`)

| Prototype | Token |
|---|---|
| `#2de8c3` (accent) | `--vestara-accent` via `ACCENT_PALETTES.shell` |
| `#0a1214` / `#0d191b` / `#111e20` / `#132528` | `--vestara-surface-canvas` / `--vestara-shell-bg` / `--vestara-surface-panel` / panel-raised |
| `#1a3a3d` (hairline) | `--vestara-border-subtle` / `--vestara-accent-border` |
| `#5a7a78` / `#8ab3ad` / `#c8ddd9` / `#e6fff9` | `--vestara-text-muted` → `--vestara-text-primary` |
| `#4ade80` / `#ff5a5a` / `#facc15` | `--vestara-status-success` / `--vestara-status-error` / `--vestara-status-warning` |
| `JetBrains Mono` / `Instrument Serif` | `TYPOGRAPHY.mono` / `TYPOGRAPHY.serif` (font-family catalog) |

No new tokens are expected; if a semantic role is missing, create
`--vestara-{category}-{name}` in `packages/ui-tokens/src/tokens.ts` first.

## 3. Phase 0 — Foundations and token alignment (2–3 days)

1. **T0.1 Token audit.** Map every prototype hex to `--vestara-*`; expose the
   `shell` accent in the Settings accent picker; add missing tokens only.
   Files: `packages/ui-tokens/src/tokens.ts`, `apps/workspace/src/lib/theme.tsx`,
   `apps/workspace/src/pages/Settings/*`. Acceptance: `pnpm vds:validate` green.
2. **T0.2 Shell scaffold.** Create `apps/workspace/src/features/desktop-shell/`
   (mirrors `features/startup/` pattern) with `types.ts` (`Phase/LoginMode/WinType/WinData`),
   `tokens.ts` (re-export, no literals), `*.fixtures.ts` (users, windows, boot logs).
   Acceptance: Biome clean, no hardcoded arrays in components.
3. **T0.3 Icon + font migration.** Replace lucide-react with the repo's MUI
   icons package (currently v6.4.0 — match existing `AppHeader` imports, do not
   introduce a v9 migration in this plan); replace CDN fonts with token stacks.
   Acceptance: no `lucide-react` import, no external `<link>`.

## 4. Phase 1 — Shell chrome, 32px header (3–4 days)

1. **T1.1 `DesktopTopBar`.** 32px (`h-8`): `<VestaraMark size={20}/>` lockup +
   live dot + version pill; centered Spotlight trigger; clock/date; status
   icons; compact avatar. Reuse `HeaderSearch/Connection/Notifications/UserMenu`
   with compact (`h-7`/`h-6`) variants. Acceptance: 32px at all breakpoints;
   keyboard reachable; `⌘K` opens `CommandPalette`.
2. **T1.2 `SystemMenu`.** User card + Lockscreen / Switch User / Settings /
   Logout / Shutdown; outside-click + Escape close; focus return.
3. **T1.3 `Dock` + `DesktopIcons`.** 48px dock with open/minimized indicators;
   desktop icons (double-click + Enter to open). Single-click select optional.
4. **T1.4 `VestaraWindow`.** Drag (pointer + keyboard arrows), 8-way resize,
   minimize/maximize/close, focus/z-order, 36px header + 28px status bar,
   double-click maximize. Acceptance: no `Math.random` in placement;
   `prefers-reduced-motion` disables animation.
5. **T1.5 Global chrome swap.** Replace `AppHeader` (`h-16` → `h-8`) in
   `ShellLayout`; audit every page for 64px assumptions. Recommend two PRs
   (header first, then shell) to keep gates clean.

## 5. Phase 2 — Boot and login state machine (2 days)

1. **T2.1 `BootScreen`.** Progress + log stream (from fixtures) + shutdown
   variant; keyframes moved to governed CSS. Acceptance: deterministic output.
2. **T2.2 `LoginScreen`.** Modes `default/locked/switch`; real actor from
   `useAuth` (no hardcoded user); Enter submits; biometric/skip are explicit
   non-auth paths with audit note.
3. **T2.3 `DesktopShell` wiring.** `boot → login → desktop` + `locked/switch/shutdown`
   in `ShellLayout`; lockscreen preserves session; shutdown returns to boot.
   Acceptance: state machine covered by vitest.

## 6. Phase 3 — Package pages with real data (4–5 days)

Each package: API first → local `*.fixtures.ts` (existing pattern, e.g.
`features/overview/overview.fixtures.ts`). Never hardcode arrays in JSX.
(Note: governance references a `:3002` mock server at
`apps/workspace/src/mocks/server.ts`, but that file is not present in the
repo as of 2026-10-18 — audit finding A1. If a mock server is needed, creating
it is a separate task, not part of this plan.)

1. **T3.1 Overview** — hero + stat cards from `/api/workspace` (reuse `useOverview`).
2. **T3.2 Activity Room** — participant rail + live stream from Activity Room stores.
3. **T3.3 Agent Workforce** — agent grid from `/api/agents`.
4. **T3.4 Marketplace** — capability cards from marketplace index.
5. **T3.5 Terminal** — live terminal surface (not a static transcript).
6. **T3.6 Settings** — shell/topbar/appearance controls bound to real settings.
7. **T3.7 Diagnostic** — deterministic telemetry (seeded, no `Math.random`).
8. **T3.8 Files** — implement (missing in prototype; use `features/files/`).

## 7. Phase 4 — Package alignment refactor (3–4 days)

Bounded by architecture guardrails (`scripts/workspace-architecture.mjs`):
packages must not depend on `apps/*`; no deep internal imports; no undeclared
deps; no cycles. Verify each step with `pnpm dependencies:check`.

1. **T4.1 Boundary audit.** Run `dependencies:check` + `check:source-artifacts`;
   record violations touching the shell surface as BLOCKERs, others as ADJACENT.
2. **T4.2 UI packages.** Align `ui`, `ui-components`, `ui-theme`, `design-system`,
   `marketplace-ui`, `ui-tokens` to the v2 shell contract (tokens, `SectionCard`/
   `GalleryCard` composition, React 19).
3. **T4.3 Runtime packages.** Align `activity-room`, `boot-runtime`, `workspace`,
   `terminal-runtime`, `settings-framework` to the shell state machine + data contracts.
4. **T4.4 Registry/docs sync.** If the agent surface changes, update
   `packages/workspace/src/agents.registry.ts` via `pnpm agents:sync` (never hand-edit).

Out of scope for this plan: provider/model packages, OpenCode adapter, kernel
lifecycle — record findings, do not mutate (ADJACENT).

## 8. Phase 5 — OS host port (after web validation, 3–5 days)

Port the validated shell to `os/` (Tauri/OS-0 host, not in pnpm workspaces):
`teal://vestara-shell` scheme handling, real boot/shutdown via `os-controller`/
`boot-runtime`, wallpapers from `assets/wallpapers/`. Keep React components
shared where possible; only hardware-adjacent calls differ. Confirm target host
(Tauri vs OS-0 systemd/Plymouth) before starting.

## 9. Phase 6 — Tests, visual regression, audit (2–3 days)

1. **T6.1 Unit/integration.** Vitest for state machine, window manager,
   TopBar, SystemMenu, each package (mocked fetch). Update existing header tests
   for 32px.
2. **T6.2 Visual regression.** `pnpm screenshots:ci`; approve baselines via
   `pnpm screenshots:update`.
3. **T6.3 Governance.** `pnpm lint:check`, `pnpm vds:validate`, `pnpm build`,
   `pnpm test`, `pnpm documentation:check`, `pnpm docs:govern` — all green.
4. **T6.4 Reviewer + audit pass.** Reviewer agent checks UI/UX Governance
   (HARDCODE flag); verifier runs the audit checklist below; findings filed as
   BLOCKER/ADJACENT/OBSERVATION per Execution Governance.

## 10. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 32px density (search + 4 buttons + user menu do not fit) | High | High | Icon-only collapse below `lg`; two-PR landing; visual review before code |
| Scope creep (full shell + global chrome + package refactor) | High | High | Phase gates; stop at acceptance criteria; ADJACENT findings recorded, not fixed |
| React 18→19 / Tailwind 3→4 / lucide→MUI migration friction | Medium | Medium | Migrate in Phase 0 before feature work; verify MUI v9 via migration docs |
| Static → live data (7 packages) | Medium | High | Fixture-first; API reuse (`useOverview`, Activity stores); no new endpoints in v1 |
| Package boundary violations | Medium | Medium | `dependencies:check` per phase; BLOCKER stops, ADJACENT records |
| OS port target ambiguity (Tauri vs OS-0) | Medium | Medium | Phase 5 gated on explicit host decision |
| Live API perturbing baseline tests (port 3001) | Low | Medium | `pnpm services:stop` before full runs; `--maxWorkers=2` on small boxes |

## 11. Governance gates and audit checklist (reviewer/verifier)

Run in order; any failure is a BLOCKER:

- [ ] `pnpm vds:validate` — every visual value from `var(--vestara-*)`
- [ ] `pnpm lint:check` — Biome, no `console.log`/`TODO`/dead code
- [ ] `pnpm build` — `tsc -b` clean (before tests; `dist/` fresh)
- [ ] `pnpm test` — vitest green (update stale header assertions)
- [ ] `pnpm dependencies:check` — boundaries hold
- [ ] `pnpm check:source-artifacts` — no stray `src/*.js`
- [ ] `pnpm documentation:check` + `pnpm docs:govern` — if docs touched
- [ ] `pnpm screenshots:ci` — no unapproved regressions
- [ ] Reviewer HARDCODE scan — no `#hex`, `bg-[#...]`, `style={{color:}}`, arbitrary `text-[12px]`
- [ ] `VestaraMark` reused inline (never `<img src>` for the logo)
- [ ] No hardcoded arrays in JSX (fixtures only)
- [ ] Deterministic render (no `Math.random` in components)
- [ ] Keyboard + screen-reader pass for TopBar/Menu/Window/Dock/Login

## 12. Workflow orchestration mapping

This plan is registered as an orchestrated project (see §13). Task IDs below
are the orchestration handles for reviewer/audit:

| # | Task summary | Files | Effort | Capabilities |
|---|---|---|---|---|
| T0 | Foundations + token alignment | `packages/ui-tokens/src/tokens.ts`, `apps/workspace/src/lib/theme.tsx`, `features/desktop-shell/` scaffold | large | implementation, analysis |
| T1 | 32px DesktopTopBar + chrome swap | `components/layout/AppHeader/*`, `layouts/ShellLayout.tsx`, `styles/index.css` | large | implementation |
| T2 | SystemMenu + Dock + DesktopIcons | `features/desktop-shell/SystemMenu.tsx`, `Dock.tsx`, `DesktopIcons.tsx` | medium | implementation |
| T3 | VestaraWindow (drag/resize/focus) | `features/desktop-shell/VestaraWindow.tsx` | large | implementation |
| T4 | Boot + Login + state machine | `features/desktop-shell/BootScreen.tsx`, `LoginScreen.tsx`, `DesktopShell.tsx` | medium | implementation |
| T5 | Package pages + data layer (Overview/Activity/Agents/Marketplace) | `features/desktop-shell/packages/*`, `*.fixtures.ts` | large | implementation |
| T6 | Package pages (Terminal/Settings/Diagnostic/Files) | `features/desktop-shell/packages/*` | large | implementation |
| T7 | Package boundary + UI/runtime alignment | `packages/ui*`, `packages/design-system`, `packages/activity-room`, `packages/boot-runtime`, `packages/workspace` | large | implementation, analysis |
| T8 | OS host port | `os/`, `packages/os-controller`, `packages/boot-runtime` | large | implementation |
| T9 | Tests + visual regression | `__tests__/**`, `tests/visual/**` | medium | testing |
| T10 | Docs + governance + audit pass | `docs/plans/VES-UI-001*`, `docs/capabilities/CSP-010*`, `docs/governance/*` | small | documentation |

## 13. Reviewer and audit record

| Role | Action | Status |
|---|---|---|
| Planner | Built this plan from `start/` inspection + current-Vestara investigation | Done 2026-10-18 |
| Auditor (self) | Path/claim verification — findings A1–A3 below, plan corrected | Done 2026-10-18 |
| Reviewer | Governance + scope review (§11 checklist) | Pending |
| Verifier | Independent audit (evidence vs claims, gates green) | Pending |
| Director | Approval to execute (phases run only on approval) | Pending |

**Audit findings (self-audit 2026-10-18):**

| ID | Finding | Severity | Resolution |
|---|---|---|---|
| A1 | `apps/workspace/src/mocks/server.ts` (mock `:3002`) referenced in governance but **not present** in repo. Plan originally cited it as a data source. | Medium | Plan corrected (§6, §12-T5): data layer is API → `*.fixtures.ts`; mock-server creation is out of scope |
| A2 | Plan originally stated target uses "MUI v9"; repo has `@mui/material ^6.4.0`. v9 is aspirational per governance, not installed. | Medium | Plan corrected (header, G3, T0.3): match existing MUI v6 imports; v9 migration explicitly out of scope |
| A3 | All 30 other referenced paths verified present; prototype claims (9 WinTypes, 32px/48px/36px geometry, hardcoded TOKENS, `Math.random`, inline `<style>`, CDN fonts, static packages) verified by direct file reads | — | No change; evidence holds |

> Orchestration handles (registered 2026-10-18):
> - Project: `project-1792304306133-1` (`ves-ui-001-workspace-ui-v2-shell`, phase `architecture` — ready for review)
> - Plan: `plan-1792304306496-1` (status `proposed`, revision 1)
> - Tasks: `task-1792304306501-1` … `task-1792304306501-11` (all `pending`; T0→T10 in §12 order)
> - Artifacts: `artifact-1792304306401-1` (analysis), `artifact-1792304306530-2` (plan)
> - Audit trail: 17 `orchestration.*` events in `.vestara/events/engineering-events.db`
>   (query via `GET /api/orchestration/projects/project-1792304306133-1/audit`).
> Reviewer: call `POST /api/orchestration/projects/:id/architecture` with
> `{architectId, status: approved|violations, findings}`. On approval the plan
> moves to `reviewed` and the project to `pending-approval` for Director sign-off.

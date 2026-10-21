---
title: VES-UI-001 — Workspace UI v2 Desktop Shell + Package Alignment Plan
version: 1.1.0
status: proposed
owner: vestara
last-reviewed: 2026-10-21
next-review: 2026-11-21
---

# VES-UI-001 — Workspace UI v2 Desktop Shell + Package Alignment Plan

| Field | Value |
|---|---|
| Status | VERIFICATION-FAILED (2026-10-21) — visual gate red 24/40, reopened to `executing`; fix-forward in progress. The visual gate was removed with the visual governance layer on 2026-10-21, so the remaining gates are the non-visual ones (lint, build, test, docs) |
| Scope | New Workspace UI v2 desktop shell (web-first, then OS port) + governed refactor of aligned packages |
| Source prototype | `assets/templates/html/v2/start/workspace-ui-v2/` (Vite + React 18.3.1 + Tailwind 3.4, v7.15.112) |
| Target | `apps/workspace` (`@vestara/workspace-ui`, React 19.2 + Tailwind v4 + MUI icons (currently v6.4.0), app v1.1.0) |
| Implementation | NOT YET AUTHORIZED (phases execute on approval) |
| Last Updated | 2026-10-21 (verification failed on visual gate — 24/40 shell cases red; project reopened to executing, fix-forward; T8 deferred, see §13; VES-UI-002 U5 tests+docs gates landed, see follow-up) |

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
| Teal logo | `src/components/VestaraLogoTeal.tsx` | Inline SVG, `viewBox="0 0 512 512"` — same V geometry as production `apps/workspace/public/logo.svg` (`512×512`; NB `assets/brand/logo.svg` is a different asset, `605×571`). **Hardcoded** teal ramp (`#E6FFF9 → #2DE8C3 → #042F2E`), hardcoded spine `#134E4A` |
| Packages (7) | `src/packages/*.tsx` | `Overview` (static hero + 4 stat cards), `ActivityRoom` (static participant rail + 3 records), `AgentWorkforce` (6-card static grid), `Marketplace` (6 static cards), `Terminal` (static transcript), `Settings` (static shell/topbar/token panels), `Diagnostic` (32 sine bars with `Math.random`) |

### 1.2 Current Vestara mapping

| Need | Existing asset | Path |
|---|---|---|
| V logo (theme-aware) | `VestaraMark` — inline SVG, accent ramp from `--vestara-accent-light/accent/accent-dark` | `apps/workspace/src/components/branding/VestaraMark.tsx` |
| Logo wrapper | `Logo.tsx` | `apps/workspace/src/components/Logo.tsx` |
| Top bar (current: 64px) | `AppHeader` + `HeaderSearch/Connection/Notifications/UserMenu` | `apps/workspace/src/components/layout/AppHeader/` |
| Shell geometry | `ShellRoot` (viewport) + `ShellLayout` (header slot, sidebar, drawers) | `apps/workspace/src/layouts/` |
| Topbar styling | `.shell-topbar` (blur + accent hairline) | `apps/workspace/src/styles/index.css:723` |
| Teal accent | `ACCENT_PALETTES.shell` (`#2de8c3`, light `#5ff0d4`, dark `#10b7a0`) | `packages/ui-tokens/src/tokens.ts:795` |
| Runtime theming | `theme.tsx` sets `--vestara-accent*` from selected palette | `apps/workspace/src/lib/theme.tsx:332` |
| Capability spec | CSP-010 (Workspace UI) — body table reads "Implemented (v1.1)" but frontmatter `status: proposed`; T10 reconciles | `docs/capabilities/CSP-010-workspace-ui/` |
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
| G12 | Wallpaper weight: prototype ships **2 byte-identical** 220 KB PNGs (only one referenced; `…_1.png` is dead); repo `assets/wallpapers/` is **13 MB of 1.8–2.4 MB PNGs** (teal = 1.78 MB @ 1671×941) and is **consumed by nothing** (0 imports). Review mitigation: WebP + lazy-load + 10 % opacity/blur 20 px (boot screen already does 10 %/blur 20). ffmpeg has `libwebp`; no `cwebp`/`sharp`/`convert`. | Low | Phase 1 |
| G13 | Review claims "**Current implementation already matches target spec** / No gold references remaining". **True only for the prototype** (`workspace-ui-v2/src/App.tsx`, 0 gold refs). **False for the real app**: 134 gold refs; hardcoded `--vestara-gold` ramp (`#c9a84c/#fcf6ba/#b38728/#b8860b`) still defined in `styles/index.css:41-44,249`; `components/Sidebar.tsx` renders `text-vestara-gold`; `Overview/DecisionsCard.tsx` uses `border-l-[var(--vestara-gold)]`; default accent is `amber` (`#f59e0b`). Review self-contradicts — its own step 01 says "Replace gold logo with teal variant in `src/components/VestaraLogo.tsx`". | High | Phase 0 |

> Prototype "ALREADY TEAL" applies to the **prototype artifact** (its `src/App.tsx` is teal-only). The production `@vestara/workspace-ui` v1.1.0 is **amber/gold by default** and is *not* teal — Phase 0 must reconcile these before any shell work.

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

1. **T0.1 Token audit.** Map every prototype hex to `--vestara-*`; add missing
   tokens only. The `shell` accent is **already exposed** in the Settings picker
   (`SettingsReferenceSurface.tsx:708` iterates `Object.entries(ACCENT_PALETTES)`,
   which includes `shell`) — verify only, do not re-implement.
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

## 9. Phase 6 — Tests, audit (2–3 days)

1. **T6.1 Unit/integration.** Vitest for state machine, window manager,
   TopBar, SystemMenu, each package (mocked fetch). Update existing header tests
   for 32px.
2. **T6.2 Governance.** `pnpm lint:check`, `pnpm vds:validate`, `pnpm build`,
   `pnpm test`, `pnpm documentation:check`, `pnpm docs:govern` — all green.
3. **T6.3 Reviewer + audit pass.** Reviewer agent checks UI/UX Governance
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
| Wallpaper payload (13 MB PNGs, one 1.78 MB @ 1671×941) shipped to a desktop shell | Medium | Medium | Transcode to WebP/AVIF (ffmpeg `libwebp`), serve one optimized size, lazy-load, keep 10 %/blur-20 boot treatment; drop dead `…_1.png` duplicate. `assets/wallpapers/` is currently unconsumed — decide ship-vs-archive in Phase 1 |
| "Already teal / no gold" misread from review applied to production app | Medium | High | G13 — production is amber/gold (134 refs, deprecated `--vestara-gold` ramp). Verify against source, not the review card, before T0/T1 |

## 11. Governance gates and audit checklist (reviewer/verifier)

Run in order; any failure is a BLOCKER:

- [ ] `pnpm vds:validate` — every visual value from `var(--vestara-*)`
- [ ] `pnpm lint:check` — Biome, no `console.log`/`TODO`/dead code
- [ ] `pnpm build` — `tsc -b` clean (before tests; `dist/` fresh)
- [ ] `pnpm test` — vitest green (update stale header assertions)
- [ ] `pnpm dependencies:check` — boundaries hold
- [ ] `pnpm check:source-artifacts` — no stray `src/*.js`
- [ ] `pnpm documentation:check` + `pnpm docs:govern` — if docs touched
- [ ] Reviewer HARDCODE scan — no `#hex`, `bg-[#...]`, `style={{color:}}`, arbitrary `text-[12px]`
- [ ] `VestaraMark` reused inline (never `<img src>` for the logo)
- [ ] No hardcoded arrays in JSX (fixtures only)
- [ ] Deterministic render (no `Math.random` in components)
- [ ] Keyboard + screen-reader pass for TopBar/Menu/Window/Dock/Login

## 12. Workflow orchestration mapping

This plan is registered as an orchestrated project (see §13). Task IDs below
are the orchestration handles for reviewer/audit.

> Resolved (D2, 2026-10-19): the original task rows were created 2026-10-18,
> before this doc's G12/G13 revisions, and carried stale T0/T1 scope. There is
> still **no task-update route** (`TaskStore` exposes no scope/description/files
> edit; `generatePlan` would create a duplicate plan and cannot self-transition
> `architecture → architecture`), so resync was done by **re-registering the
> project through the API** (single writer): `project-1792304306133-1` was
> cancelled and replaced by `project-1792412250418-1` with corrected T0/T1
> scope. Out-of-band `.vestara/` writes remain forbidden; see A7.

| # | Task summary | Files | Effort | Capabilities |
|---|---|---|---|---|
| T0 | Foundations + token alignment (incl. G13: reconcile production gold vs prototype teal; retire dead `--vestara-gold` ramp / dead gold-bearing files) | `packages/ui-tokens/src/tokens.ts`, `apps/workspace/src/lib/theme.tsx`, `styles/index.css`, `features/desktop-shell/` scaffold | large | implementation, analysis |
| T1 | 32px DesktopTopBar + chrome swap + wallpaper pipeline (WebP/AVIF, lazy, single size) | `components/layout/AppHeader/*`, `layouts/ShellLayout.tsx`, `styles/index.css`, `assets/wallpapers/` | large | implementation |
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
| Auditor (self) | Path/claim verification — findings A1–A6 below, plan corrected | Done 2026-10-18 |
| Auditor (self) | Plan-integrity audit vs repo + orchestration stores — findings A7–A11, plan corrected | Done 2026-10-19 |
| Orchestrator | Re-registered plan through the API with G12/G13 scope (D2); old project cancelled | Done 2026-10-19 |
| Developer (T10) | Docs + governance + audit pass: CSP-010/CSP-016 status notes, gate record + findings T10-B/A/O below (docs scope only, no implementation changes) | Done 2026-10-20 |
| Reviewer | Governance + scope review (§11 checklist) | Pending |
| Verifier | Independent audit — **first verification FAILED 2026-10-21** (visual gate 24/40 red; artifact `artifact-1792533517604-1`; auto-reopen #1 consumed, project back to `executing`) | Failed → fix-forward |
| Director | Approval to execute (phases run only on approval) | Pending |

**Audit findings (self-audit 2026-10-18):**

| ID | Finding | Severity | Resolution |
|---|---|---|---|
| A1 | `apps/workspace/src/mocks/server.ts` (mock `:3002`) referenced in governance but **not present** in repo. Plan originally cited it as a data source. | Medium | Plan corrected (§6, §12-T5): data layer is API → `*.fixtures.ts`; mock-server creation is out of scope |
| A2 | Plan originally stated target uses "MUI v9"; repo has `@mui/material ^6.4.0`. v9 is aspirational per governance, not installed. | Medium | Plan corrected (header, G3, T0.3): match existing MUI v6 imports; v9 migration explicitly out of scope |
| A3 | All 30 other referenced paths verified present; prototype claims (9 WinTypes, 32px/48px/36px geometry, hardcoded TOKENS, `Math.random`, inline `<style>`, CDN fonts, static packages) verified by direct file reads | — | No change; evidence holds |
| A4 | Review card "Current implementation already matches target spec / No gold references remaining" is a **claim about the prototype only**; production has 134 gold refs + deprecated hardcoded `--vestara-gold` ramp + amber default accent | High | Recorded as G13 (§1.3) + risk row (§10); Phase 0 scope confirmed |
| A5 | Dead code (0 imports, adjacent to G13): `apps/workspace/src/components/Sidebar.tsx` (the gold `text-vestara-gold` wordmark) and `apps/workspace/src/pages/Overview/DecisionsCard.tsx` (gold `border-l`) are **not imported anywhere** | Low | ADJACENT — recorded, not fixed. Confirm removal in T0/T10 instead of blindly re-tokenizing dead files |
| A6 | Prototype `src/assets/wallpaper-teal-giant-planet-mountain-lake_1.png` is byte-identical (md5 `a921d49…`) to `…-lake.png` and **unreferenced** | Low | ADJACENT — dead duplicate; safe to drop. Repo `assets/wallpapers/` teal PNG differs (md5 `721beba…`), i.e. two separate renders |
| A7 | Plan claimed "17 `orchestration.*` events" for the project; **actual 0**. State lives in `plans.db`, but no event is correlated to `project-1792304306133-1`; `/audit` returns empty | High | **Root cause found.** The registration ran the `WorkflowOrchestrator` **library** directly (bypassing the API), supplying its own sink that appended to `engineering-events.db`. `SqliteEngineeringEventStore` is an in-memory sql.js DB persisted by **debounced whole-file atomic replacement** (`flushPersist`: `.tmp` → `renameSync`), and the live API (`apps/api/src/workspace-context.ts:624`) holds its **own** copy of the same file and re-writes it in full on every flush. The script never called `eventStore.close()` (the only deterministic flush), and any concurrent API flush replaces the entire file → the script's rows were lost. Corroborated: 30 event rows dated 2026-10-18 but **none at 06:18** (registration time; next is 06:22, `external-runtime.*`, API-originated); the last `orchestration.*` rows in the DB are 2026-09-14 (dogfood project, registered via the API). **Rule:** orchestration state must be mutated only through the API (single writer) — never open `.vestara/**` stores out-of-band while the API runs. **Resolved 2026-10-19:** re-registration through the API produced **17** correlated `orchestration.*` events for `project-1792412250418-1`; `/audit` is no longer empty. |
| A8 | §1.2 cited `packages/ui-tokens/src/tokens.ts:748` for `ACCENT_PALETTES.shell`; actual line is **795** (748 = `purple:`) | Low | Corrected (§1.2) |
| A9 | §1.1/G2 referenced `public/logo.svg`; prototype has no `public/` dir. Correct asset is `apps/workspace/public/logo.svg` (viewBox `512×512`); `assets/brand/logo.svg` differs (`605×571`) | Low | Corrected (§1.1) |
| A10 | §1.2 asserted CSP-010 "Implemented v1.1"; `CSP-010-workspace-ui/README.md` frontmatter is `status: proposed` (body table says Implemented) | Low | Reconciled 2026-10-20 (T10): status notes added to CSP-010 + CSP-016 READMEs — frontmatter `proposed` is the *document* lifecycle state (all 23 CSPs share it; `implemented` would require `implementation-repository`/`implementation-commit` per `docs-automation.mjs`), body "Implemented (vX)" is the *capability* state. Frontmatter deliberately not flipped. Review dates refreshed to 2026-10-20 / 2026-11-20 |
| A11 | T0.1 listed "expose the `shell` accent in the Settings accent picker" as work; already satisfied — `SettingsReferenceSurface.tsx:708` iterates `Object.entries(ACCENT_PALETTES)` (includes `shell`) | Low | Corrected to verify-only (§3 T0.1) |

**T10 gate + audit record (2026-10-20 — developer, docs scope only; no implementation files touched):**

| Gate | Result | Evidence |
|---|---|---|
| `pnpm lint:check` | ✅ pass | `Checked 1593 files … No fixes applied` |
| `pnpm vds:validate` | ✅ pass | `VDS validation passed (VDS 1.1 · Workspace/TUI/CLI aligned)` |
| `pnpm build` (`build-order.sh`) | ✅ pass | `tsc -b` clean, 121 buildable projects |
| `pnpm dependencies:check` | ✅ pass | `Dependency boundaries valid across 122 workspace projects` |
| `pnpm check:source-artifacts` | ✅ pass | `no generated .js/.js.map/.d.ts artifacts under src/ or __tests__/` |
| `pnpm docs:govern` (strict validate + links + evidence) | ✅ pass | `validation: passed`, `links passed`, `Evidence manifests passed (1)` |
| `pnpm test` (full, 215 files / 1720 tests) | ❌ **fail — see T10-B1** | 8 failed / 1710 passed; failures confined to 2 uncommitted VES-UI-001 files |
| `documentation:check` (CI baseline gate) | ❌ **fail — see T10-B2** | `passed: false`, current 670 vs baseline 626 |
| Reviewer HARDCODE scan (new shell scope) | ✅ pass with notes — see T10-O1/O2 | All Tailwind arbitraries via `var(--ds-*)` / `var(--vestara-*)`; no `console.log`/`TODO`; no `Math.random` in components |
| `pnpm screenshots:ci` | ⚠️ not run — see T10-O3 | Playwright/browser run not attempted in this pass; left for T9/reviewer |

**T10 findings (Execution Governance classification):**

| ID | Classification | Finding | Evidence |
|---|---|---|---|
| T10-B1 | **BLOCKER** | `pnpm test` red: 8 failures in `DesktopTopBar.test.tsx` (5) + `StartupWallpaper.test.tsx` (3) — `ReferenceError: document is not defined`. Root cause: both new test files lack the `/** @vitest-environment jsdom */` pragma that existing passing UI tests (e.g. `useGAExecutionConfig.test.ts`) carry. Fix belongs to T9 (test scope), not T10 — recorded, not mutated. | Full-suite run 2026-10-20: `Test Files 2 failed \| 212 passed`; `Tests 8 failed \| 1710 passed` |
| T10-B2 | **BLOCKER** | `documentation:check` red against baseline (`passed: false`, current 670 vs baseline 626, 43 introduced). Includes unknown API routes in `docs/MILESTONES.md` / `docs/blueprint/SETTINGS-ENV-E2*` and missing barrel export `SHELL_APPEARANCE_MODULE_ID` (`packages/settings-framework/API.md`) — correlated with uncommitted working-tree changes. The 2 findings on this plan doc itself (`/api/orchestration` route mentions, HEAD lines 310/314) pre-date T10 and are baseline drift, not working-tree regressions. Owner: docs/API owners; out of T10 docs-scope mutation authority — recorded, not mutated. | `documentation:check` 2026-10-20; `git show HEAD:…plan.md \| grep api/orchestration` |
| T10-A1 | ADJACENT | Working tree deletes the A5 dead files (`apps/workspace/src/components/Sidebar.tsx`, `apps/workspace/src/pages/Overview/DecisionsCard.tsx` — gold-bearing, 0 imports). Confirm the deletions land with T0/T10 rather than re-tokenizing dead files. | `git status` 2026-10-20: `D` entries for both files |
| T10-A2 | ADJACENT | CSP frontmatter `status: proposed` retained on all CSPs (not just CSP-010/016) — flipping to `implemented` would trip `docs:govern --strict` (`implementation-repository`/`implementation-commit` required). Reconciliation is editorial (status notes), not a status flip. | `scripts/docs-automation.mjs:91-107` |
| T10-O1 | OBSERVATION | HARDCODE scan of uncommitted shell scope (`features/desktop-shell/`, `DesktopTopBar.tsx`, `StartupWallpaper.tsx`) is clean: hex appears only in prototype→token mapping comments and one palette-value assertion (`DESKTOP_SHELL_ACCENT.hex === '#2de8c3'`); `--ds-*` layer derives 1:1 from `--vestara-*`. | `rg` scan 2026-10-20 |
| T10-O2 | OBSERVATION | `--ds-font-mono` carries a `'JetBrains Mono'` fallback literal inside `var()` (low confidence issue; matches plan §2 TYPOGRAPHY mapping). Reviewer may confirm the canonical mono token covers it. | `desktop-shell.tokens.css:53` |
| T10-O3 | OBSERVATION | `screenshots:ci` and `documentation:check` bisection vs clean tree not performed (no `stash` — would disturb uncommitted T0–T8 work). T10-B2 may partly pre-date the working tree; confidence: medium that ≥1 finding correlates with uncommitted changes. | — |

> Orchestration handles (re-registered 2026-10-19; supersedes the 2026-10-18 handles;
> state as of 2026-10-21 — verification failed, project reopened):
> - Project: `project-1792412250418-1` (`ves-ui-001-workspace-ui-v2-shell`, phase `executing` — was `verifying`, reopened after failed verification; `verificationReopens: 1`, auto-reopen consumed)
> - Plan: `plan-1792412251142-1` (status `approved`, revision 1)
> - Tasks: `task-1792412251312-1` … `task-1792412251312-11` (all `completed`)
> - Artifacts: `artifact-1792412250905-1` (analysis), `artifact-1792412252217-2` (plan), per-task changeset/review/test triples, `artifact-1792533517604-1` (verification — FAILED)
> - Durable state: project/plan/tasks/artifacts persisted in `.vestara/plans/plans.db`.
> - Audit trail: **present** — 17 correlated `orchestration.*` events
>   (project.created, 3× phase.changed, analysis.completed, plan.generated,
>   11× task.created); `GET /api/orchestration/projects/:id/audit` (project `project-1792412250418-1`).
>   Root-cause guard from A7 still applies: mutate only through the API.
> - Superseded: `project-1792304306133-1` / `plan-1792304306496-1` /
>   `task-1792304306501-1…11` cancelled 2026-10-19 (stale T0/T1 scope).
> Reviewer: call `POST /api/orchestration/projects/:id/architecture` with
> `{architectId, status: approved|violations, findings}`. On approval the plan
> moves to `reviewed` and the project to `pending-approval` for Director sign-off.

### Verification record (2026-10-21 — verifier, via API)

First `runVerification` on `project-1792412250418-1` returned **failed** and the
project auto-reopened `verifying → executing` (`project.verification.reopened`,
`reopenCount: 1` — the single governed reopen is now consumed; a second failure
parks as `verification.awaiting-approval` for human decision).

| Check | Result | Evidence |
|---|---|---|
| `git diff --check` | ✅ pass | clean, exit 0 |
| `pnpm vds:validate` | ✅ pass | `VDS validation passed (VDS 1.1 · Workspace/TUI/CLI aligned)` |
| Targeted tests (orchestrator + next-action) | ✅ pass | 2 files / 25 tests; full suite same tree 217 files / 1735 tests green (pretest `tsc -b` clean) |
| Visual regression (startup/login/orchestration/overview/files × desktop × dark/light) | ❌ **fail — the verdict driver** | 16 pass (startup+login 16/16), 24 fail: overview 8/8 (2.3–21.6 %), orchestration 8/8 (7.2–12.9 %), files 8/8 (4.2–9.1 %). All fails are pixel diffs vs pre-polish baselines from the 10 intentional restyle commits `7386612..ec8741e`; 0 missing, 0 errors. Report: `apps/workspace/tests/visual/.artifacts/reports/visual-regression.json` |
| `pnpm lint:check` | ⚠️ not run (blocked) | Last green 2026-10-20 19:11 PHT predates `3a261b1`/`55e8662`/`ec8741e`; must re-run before any `passed:true` verdict |

Fix-forward (required before re-verify): human review of the 24 diff images in
`apps/workspace/tests/visual/.artifacts/diff/`, then `pnpm screenshots:update`
to approve, plus fresh `pnpm lint:check`. Out-of-scope rider `9bb77e6`
(Andy McCraw call package) is named here so the audit trail stays honest.

### T8 host-port decision (2026-10-21 — DEFERRED)

Evidence: task `task-1792412251312-9` is `completed` with files
`["os/", "packages/os-controller/src/index.ts", "packages/boot-runtime/src/index.ts"]`,
but the last real `os/` commit is `5d8f164` (2026-10-13, a week before the
workflow) and every per-task artifact body reads only `"Verification passed"`.
T8 has **no on-disk evidence** — the Phase 5 gate (web validation + explicit host
decision: Tauri vs OS-0) was never satisfied on record.

Decision: **defer the OS host port.** Rationale: web validation itself only just
reached the verification gate (and failed on visuals); porting an unverified
shell to a host target multiplies rework. The `completed` status on T8 is
recorded as *deferred-by-decision*, not *ported* — no `verify` verdict certifies
an OS port.

Follow-up (created 2026-10-21, Director decision: Tauri-first): `project-1792534106380-1`
(`ves-ui-002-os-host-port-tauri`, plan approved `plan-1792534155109-1`,
`director-approval-2026-10-21`, phase `executing` — 6 tasks U0–U5): (1) U0
Tauri capability audit, (2) U1 bundle config, (3) U2 window-lifecycle
boot/shutdown bridge via `boot-runtime`, (4) U3 `teal://vestara-shell`
deep-link scheme (greenfield — absent from `tauri.conf.json`/`Cargo.toml`),
(5) U4 transcoded wallpaper assets in bundle (G12 carryover), (6) U5 tests +
visual/docs gates. `os/` systemd/Plymouth scope explicitly excluded. The
follow-up has its own plan record:
[VES-UI-002 — OS Host Port (Tauri) Plan](VES-UI-002-os-host-port-tauri-plan.md).

### VES-UI-002 U5 record (2026-10-21 — tests + visual/docs gates)

| Obligation | Verdict | Evidence |
|---|---|---|
| Vitest for bridge mapping | ✅ ESTABLISHED | `packages/boot-runtime/__tests__/shell-bridge.test.ts` — 7 tests green: `SHELL_PHASES` 6-phase order, `BOOT_STAGES` 8-stage unchanged guard (bridge additive, no boot mutation), `shellPhaseForBootStage` (mid-boot→`boot`, `workspace-ready`/`ready`→`login`, `recovery` stage/status and `failed` status→`boot`) |
| Vitest for deep-link mapping | ❌ NOT ESTABLISHED — blocked on U3 | No on-disk implementation: `rg "teal://"` in `packages/*/src` + `apps/*/src` empty; `rg -i "deep.link|url.scheme|custom.protocol|onDeepLink"` in `apps/workspace/src-tauri` + `packages/boot-runtime/src` + `packages/os-controller/src` empty. No tests written — failing-contract tests would red the suite |
| Visual gate for bundled app | ⚠️ Playwright cannot target the bundle — documented, web gate remains the proxy | `apps/workspace/playwright.config.ts` drives Playwright-bundled Chromium over HTTP (`PLAYWRIGHT_BASE_URL` → Vite dev `webServer`); `runner/viewport.ts` uses `browser.newContext` (Playwright-owned browser only). The Tauri bundle renders in OS WebView (WebKitGTK/WebView2/WKWebView) with no CDP endpoint; no `tauri-driver`/`webdriverio` in any workspace manifest. Proxy holds: `tauri.conf.json` `frontendDist: ../dist` bundles the same Vite production build the web gate screenshots — pixel behavior identical modulo WebView-vs-Chromium deltas. Bundle-native chrome (window frame, deep-link handling) is out of Playwright scope; `tauri-driver` (WebDriver) is the future path, not wired |
| CSP notes | ✅ recorded | `tauri.conf.json` `app.security.csp: null` — bundle ships with no CSP (web app relies on server headers/dev defaults); noted in CSP-010/CSP-016 status notes. Deep-link scheme absent — no scheme-handler attack surface yet; CSP/scheme review due when U3 lands |

U5 touched scope: `packages/boot-runtime/__tests__/shell-bridge.test.ts` (new),
this plan doc (follow-up only), `docs/capabilities/CSP-010-workspace-ui/README.md`
+ `docs/capabilities/CSP-016-os-integration/README.md` (status notes only).
No implementation files mutated. Gates for touched scope: `bash build-order.sh`
clean, focused vitest 7/7 green, `pnpm lint:check`, `pnpm vds:validate`.

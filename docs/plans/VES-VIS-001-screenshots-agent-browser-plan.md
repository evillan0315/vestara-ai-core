---
title: VES-VIS-001 — Screenshots on agent-browser (Restructure Plan)
version: 1.0.0
status: planned
owner: vestara
last-reviewed: 2026-10-12
next-review: 2026-11-12
---

# VES-VIS-001 — Screenshots on agent-browser (Restructure Plan)

## Status: FUTURE PLAN — not authorized for implementation

The Playwright harness (`apps/workspace/tests/visual/`) stays canonical until
this plan is authorized and its P0 spike answers the open unknowns below. No
`screenshots:*` script, CI workflow, or baseline changes ship under this plan
until cutover (P3).

## 1. Audit — screenshot creation as found (2026-10-12)

Pipeline: `visual.spec.ts` (Playwright entry) → `engine.ts` (route ×
viewport × theme cases) → `pipeline.ts` (viewport → theme → capture →
compare) → `runner/page.ts` (navigate, stabilize, mask, shoot) →
`baselines/manager.ts` (baseline/current/diff layout) → `diff/generator.ts`
(pixel compare) → `reports/generator.ts` (HTML/JSON/Markdown).
Route discovery derives from `src/routes.ts` via `routes/manifest.ts` with
`SCREENSHOT_ROUTES` / `-g` scoping (`routes/discovery.ts`). Determinism comes
from a theme init script, `fixtures/api.ts` mock injection, animation
disabling, reduced-motion emulation, masks, and network-idle settling.

### Strengths (keep)

- S1: Engine/case-generation is unit-testable and free of browser imports
  (only `type Browser`); naming, baselines, reports, and diff are
  driver-agnostic already.
- S2: Theme seeding via init script + `vestara-theme` localStorage key is
  portable to any CDP-capable driver.
- S3: `BrowserDriver` boundary + agent-browser CLI contract notes already
  exist (`packages/tools/browser/src/agent-browser-driver.ts`, 0.27.0 spike:
  batch-via-stdin, isolated `--session` browsers, `screenshot <path>`,
  JSON-body errors, ref-staleness rules) — but they serve Live Browser
  runtime, not the visual harness.
- S4: Binary baselines in git (`.artifacts/baselines/`) are accepted
  precedent; reports are already multi-format.

### Findings (motivate the restructure)

- F1: `@playwright/test` types flow through `engine.ts`, `pipeline.ts`,
  `runner/*`, `fixtures/api.ts`, and `visual.spec.ts` — there is no driver
  seam, so the harness can only ever drive Playwright.
- F2: Fixtures depend on Playwright `page.route` interception
  (`fixtures/api.ts`, qualification/activity datasets). agent-browser parity
  for request interception is UNVERIFIED (CDP Fetch domain via CLI batch?
  unknown — P0 spike item).
- F3: Viewport groups are fixed (`desktop` 1920/1600/1440 + laptop 1366;
  tablet/mobile groups). The 1672×941 reference viewport
  (VOS-STARTUP-001 P4 strict-diff) is impossible without a config change.
- F4: Update mode rewrites every in-scope baseline; only operator discipline
  (`-g`, `SCREENSHOT_ROUTES`) prevents full-suite churn.
- F5: `visual-regression.yml` runs `screenshots:ci` scoped to
  `activity,qualification-activity` with `continue-on-error` — regressions
  do not fail the PR from that job today.
- F6: Route-specific stabilization is bespoke per route (`page.ts`
  activity pinning). A second driver must reproduce or explicitly own each
  stabilization or diffs will be attributed to the wrong cause.
- F7: No mocks server exists (`apps/workspace/src/mocks/` absent) despite
  governance referencing `:3002` — fixtures are the only mock layer, and
  they are Playwright-coupled (see F2).

## 2. Target shape (no behavior change until P3)

```
visual.spec.ts ── cases() ──► ScreenshotDriver (new boundary)
                                ├── PlaywrightDriver (extract as-is from
                                │    runner/* + fixtures/api.ts)
                                └── AgentBrowserDriver (new: CLI batch —
                                     open, viewport, theme seed, stabilize,
                                     screenshot <path>)
engine.ts / pipeline.ts / baselines / diff / reports: untouched.
```

Fixture injection moves behind the seam: Playwright keeps `page.route`;
agent-browser uses whichever P0 proves first — CLI-exposed interception,
CDP via the driver's daemon, or a real mocks server (which would also close
F7 for both drivers).

## 3. Phases

- **P0 — Spike (read-only + throwaway scripts, no repo changes).** Verify
  against the pinned agent-browser CLI: window/viewport sizing to exact
  pixels (incl. 1672×941), full-viewport PNG capture, init-script/theme-seed
  equivalent, network interception or mock-server alternative, reduced-motion
  + font-rendering parity with Playwright Chromium, and per-spawn cost.
  Abort criteria: any NO that forces harness-specific behavior into the app.
- **P1 — Driver seam.** Extract `PlaywrightDriver` behind
  `ScreenshotDriver` with zero capture changes (byte-identical baselines on
  re-run prove it). No new dependencies.
- **P2 — AgentBrowserDriver + parity.** Implement the driver, run dual
  captures per case, record parity % per route/viewport/theme in the plan
  (not as gates). Add the 1672×941 `startup-reference` viewport here —
  only for the agent-browser runner until parity is proven.
- **P3 — Cutover.** Switch CI (`visual-regression.yml`) to the agent-browser
  runner, keep one Playwright parity job for a full release cycle, then
  remove the Playwright path and its browser downloads. Baselines carry
  over only where parity was 100%; the rest are re-approved via the normal
  update flow.
- **P4 — Retire.** Delete `runner/page.ts` Playwright capture + `fixtures`
  interception once cutover holds for one cycle; close F7 if a mocks server
  landed, otherwise carry it to its own plan.

## 4. Acceptance

- P0 answers every unknown with a versioned CLI reference or a NO with
  evidence; agent-browser CLI version pinned in `package.json` before P2.
- No phase changes a single committed baseline pixel except through
  `screenshots:update` review.
- Rollback at any point before P3 completion is deleting the new driver —
  the Playwright path keeps working untouched.

## 5. Non-goals and risks

- Non-goals: changing route discovery, diff tolerance, report formats, or
  the `vds:validate`/governance gates; live-media routes stay excluded.
- Risks: CLI version drift (pin + contract test the batch verbs used);
  daemon CDP races already documented in the driver notes (retryable,
  confirm via load wait); font/GPU raster differences between the two
  Chromium builds showing up as diff noise (tolerance review per route).

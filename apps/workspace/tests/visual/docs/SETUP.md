# Setup Guide

## Prerequisites

- Node.js 22+, pnpm
- A built API server is optional; the framework only needs the UI dev server.
  Pages that depend on `/api/*` render their error/empty states without it
  (still captured deterministically).

## Install

```bash
cd vestara-ai-core
pnpm install
```

Playwright browsers (Chromium is the default target):

```bash
cd apps/workspace
pnpm exec playwright install chromium
# full set (chromium, firefox, webkit):
pnpm exec playwright install
```

## First run (approve baselines)

```bash
pnpm screenshots:update        # from vestara-ai-core (delegates to workspace-ui)
```

This launches the Vite dev server (Playwright `webServer`), captures every
discovered route across desktop viewports and dark/light themes, and writes
baselines under `apps/workspace/tests/visual/.artifacts/baselines/`.
Commit those baselines.

## Daily run (compare)

The same workflow is available through the compiled Vestara CLI:

```bash
vestara screenshots run
vestara screenshots run --viewport mobile --routes dashboard --theme dark
vestara screenshots update --routes settings
vestara screenshots report
vestara screenshots check --json
```

The CLI validates route IDs, roles, URLs, numeric ranges, viewports, and themes
before invoking Playwright. `--json` emits a structured result with the action,
delegated script, success state, exit code, stdout, and stderr. Use
`vestara help screenshots` for the complete option list.

```bash
pnpm screenshots               # all desktop viewports, dark + light
pnpm screenshots:mobile        # mobile viewport group
pnpm screenshots:tablet        # tablet viewport group
pnpm screenshots:desktop       # desktop viewport group
pnpm screenshots:ci            # CI mode (2 workers, retries, server must be started externally or auto)
```

## Targeted runs

```bash
# One route, one theme
SCREENSHOT_ROUTES=dashboard SCREENSHOT_THEME=dark pnpm screenshots

# Multiple routes
SCREENSHOT_ROUTES=docs,execution,graph pnpm screenshots

# Update baselines for one route after an intentional change
SCREENSHOT_ROUTES=settings pnpm screenshots:update
```

## Reports

Reports are regenerated after every run into
`apps/workspace/tests/visual/.artifacts/reports/`:
`index.html` (dashboard), `visual-regression.json`, `visual-regression.md`.

To regenerate reports from an existing run without re-capturing:

```bash
pnpm screenshots:report
```

## Cleanup

```bash
pnpm screenshots:clean         # removes current/diff/results/reports, keeps baselines
```

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SCREENSHOT_VIEWPORT` | `desktop` | viewport group: `desktop`/`tablet`/`mobile` |
| `SCREENSHOT_THEME` | — | single theme: `dark`/`light` |
| `SCREENSHOT_ROUTES` | — | comma-separated route ids to run |
| `SCREENSHOT_MODE` | `compare` | `update` writes baselines |
| `SCREENSHOT_TOLERANCE` | `0.1` | pixelmatch per-pixel threshold |
| `SCREENSHOT_MAX_DIFF` | `0.5` | max diff % before a shot fails |
| `PLAYWRIGHT_BASE_URL` | `http://localhost:5173` | app URL |
| `SCREENSHOT_WAIT_NETWORK` | off | wait for `networkidle` (off by default; dev websockets/HMR block it) |

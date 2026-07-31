# Troubleshooting Guide

## "No baseline for … Run `pnpm screenshots:update` first"

Expected on a fresh clone or after adding a route. Approve baselines:

```bash
pnpm screenshots:update
# or update only the reviewed route through the CLI
pnpm vestara screenshots update --routes dashboard
```

Do not use `update` merely to make a regression disappear. Inspect the current
and diff artifacts, confirm the UI change is intended, then update only the
reviewed routes.

## Everything fails with dimension mismatches

The app renders at a different size than the baseline. Common causes:

- The viewport list changed — re-approve baselines.
- A layout/theme change resized the shell — inspect `current/` vs `baselines/`.

## Flaky diffs from dynamic content

Add masks (`helpers/masks.ts`) for the region, or widen
`SCREENSHOT_TOLERANCE` / `SCREENSHOT_MAX_DIFF`. Note the `waitForNetworkIdle`
is off by default because Vite HMR + the event-stream websocket keep the
network busy; enable it only for static builds.

## The dev server doesn't start / port in use

Playwright's `webServer` uses `reuseExistingServer: !CI`. Stop your own
`pnpm dev:ui` instance or set `PLAYWRIGHT_BASE_URL` to an already-running
server.

## Missing module errors under ESM

The package is `"type": "module"`; relative imports must use `.js` extensions
(resolved to `.ts` by TypeScript). If a new file fails to load, ensure its
imports use `from './x.js'`.

## Baselines don't appear in git

The root `.gitignore` ignores `*.png`; baselines are re-allowed via
`!apps/workspace/tests/visual/.artifacts/baselines/**`. Verify the negation is
still present.

## `pnpm screenshots` is slow

- Narrow with `SCREENSHOT_ROUTES=...` or a single viewport group.
- With the CLI, use `--routes <ids>`, `--theme <id>`, and `--viewport <group>`.
- Raise CI workers (`playwright.config.ts`).
- Shard: `npx playwright test --shard=1/4` etc.

## Browser download fails (CI/proxy)

Install browsers explicitly and retry:

```bash
pnpm exec playwright install --with-deps chromium
```

## Report says 0 tests found

Confirm `testMatch` in `playwright.config.ts` (`tests/visual/**/*.spec.ts`) and
that `visual.spec.ts` exists. Run `pnpm --filter @vestara/workspace-ui screenshots:check`
to catch type errors that silently break discovery.

The CLI equivalent is `pnpm vestara screenshots check --json`. A non-zero
`exitCode` and captured `stderr` identify the delegated package-script failure.

## CLI reports an unknown or invalid option

The CLI intentionally rejects pass-through arguments. Run
`pnpm vestara help screenshots` for supported options. Use the package-level
Playwright command directly for advanced development-only flags such as
sharding.

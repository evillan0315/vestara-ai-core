# @vestara/workspace-ui

React workspace client for Vestara runtime and product services.

## Usage

Run the unit/UI test suite and production build:

```bash
pnpm --filter @vestara/workspace-ui test
pnpm --filter @vestara/workspace-ui build
```

Run the standalone Tauri desktop shell during development. Start the API in a
separate terminal first:

```bash
pnpm build
pnpm dev:api
pnpm --filter @vestara/workspace-ui desktop:dev
```

Create a production desktop bundle with
`pnpm --filter @vestara/workspace-ui desktop`. Configure a non-local API with
`VITE_API_URL` at build/development time or later under **Settings > API
Endpoint**. See the [desktop guide](docs/DESKTOP.md) for prerequisites and
troubleshooting.

Vitest owns component, queue-policy, and visual-framework unit tests. The
Playwright entrypoint at `tests/visual/visual.spec.ts` is intentionally excluded
from Vitest and runs through the `screenshots*` scripts.

## Visual regression automation

The Playwright framework discovers enabled routes from `src/routes.ts`, captures
the selected viewport and theme matrix, compares images with approved baselines,
and emits JSON, Markdown, and HTML reports.

Use either the root scripts or the compiled Vestara CLI:

```bash
pnpm screenshots
pnpm vestara screenshots run --viewport desktop --theme dark
pnpm vestara screenshots run --routes dashboard,docs --json
pnpm vestara screenshots update --routes settings
pnpm vestara screenshots report
pnpm vestara screenshots check
```

CLI comparison runs force `SCREENSHOT_MODE=compare`. Baseline writes require the
explicit `update` subcommand. Generated current images, diffs, and reports live
under `tests/visual/.artifacts/`; approved baselines are retained by cleanup.

See the visual framework [setup](tests/visual/docs/SETUP.md),
[architecture](tests/visual/docs/ARCHITECTURE.md),
[developer](tests/visual/docs/DEVELOPER.md), and
[troubleshooting](tests/visual/docs/TROUBLESHOOTING.md) guides.

## Notification presentation

Transient event notifications are presented by `src/components/Toast.tsx`:

- At most one toast is visible at a time.
- Waiting notifications are bounded to five entries and normally retain FIFO order.
- Errors are placed immediately after the active toast, so they are prioritized without interrupting it.
- Notifications with the same type and message within three seconds are collapsed and display a repetition count.
- Each visible toast receives a complete five-second display window and can be dismissed manually.
- Persistent notification history remains owned by the notification API and notification-center views; the toast queue is presentation-only state.

See [PCS-010](../../docs/PCS-010-workspace-ui.md),
[UX-010](../../docs/UX-010-workspace-ui.md), and
[ATS-010](../../docs/ATS-010-workspace-ui.md) for capability requirements.

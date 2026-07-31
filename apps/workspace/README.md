# @vestara/workspace-ui

React workspace client for Vestara runtime and product services.

## Usage

Run the unit/UI test suite and production build:

```bash
pnpm --filter @vestara/workspace-ui test
pnpm --filter @vestara/workspace-ui build
```

Vitest owns component, queue-policy, and visual-framework unit tests. The
Playwright entrypoint at `tests/visual/visual.spec.ts` is intentionally excluded
from Vitest and runs through the `screenshots*` scripts.

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

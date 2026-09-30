# AR-STREAM-STATUS-003 — Header Degraded-State Presentation

## 1. Result

GO. This bounded repair changes only the Activity Room header presentation. It
does not change Activity Room state, transport, reconnect behavior, snapshot
semantics, ordering, or scroll behavior.

## 2. Root cause addressed

The previous prominent label was `Live stream · Disconnected`. Although the
M11A Activity data signal was independently shown as available or snapshot
incomplete, the wording could be read as describing the whole Activity Room.

## 3. Resulting presentation

The prominent status now reads `Live updates · Disconnected` for the M11B
disconnected state. The status indicator remains disconnected and retains its
existing truthful visual variant. Connected, connecting, reconnecting, and
paused labels continue to come from the existing M11B connection-state
configuration.

The accessible status label and title are also scoped to live Activity updates.
The separate M11A signal continues to display `Activity data Available` or
`Activity data Available · snapshot incomplete` as before.

## 4. Authoritative state inputs

- M11B live transport state remains the existing `state` input and
  `CONNECTION_STATUS_CONFIG` mapping.
- M11A data availability and completeness remain the existing
  `dataAvailable`, `snapshotComplete`, `activityDataStatus`, and
  `ACTIVITY_DATA_STATUS_CONFIG` inputs.
- No aggregate connectivity state was introduced or persisted.

## 5. Reconnect behavior

No reconnect code changed. The existing `Reconnect live stream` label and
`room.retry` action remain unchanged and continue to target M11B behavior.

## 6. Exact files changed for this milestone

- `apps/workspace/src/pages/activity/ActivityRoomHeader.tsx`
- `apps/workspace/src/pages/activity/status-config.ts`
- `apps/workspace/src/pages/activity/status-config.test.ts`
- `docs/evidence/AR-STREAM-STATUS-003.md`

## 7. Verification

- Focused status contract tests: passed.
- AR-SCROLL-002 focused tests: passed; no scroll/order files were changed.
- `git diff --check`: passed.
- No API restart, browser reload, staging, commit, or push was performed.

The known workspace UI build baseline issue remains outside this milestone:
`apps/workspace/src/lib/m11a-api.ts:292` has the pre-existing participant
projection union error. The known unrelated Telegram identity lint findings
also remain unchanged.

## 8. AR-SCROLL-002 regression status

No AR-SCROLL-002 implementation was modified. Its focused ordering, hydration,
history-anchor, live-update, and viewport behavior remain covered by the
existing focused tests.

## 9. Reload requirements

The frontend bundle must be rebuilt and the browser reloaded to display the new
copy in a running UI. Neither action was performed during this audit/repair.
An API restart is not required.

## 10. Remaining unknowns

None introduced by this bounded presentation change. The unrelated Codex App
Server authentication behavior remains out of scope.

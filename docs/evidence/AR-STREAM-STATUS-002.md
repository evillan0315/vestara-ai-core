# AR-STREAM-STATUS-002 — Degraded Stream Status Repair Evidence

Status: implemented and locally verified. No API restart, browser reload,
production database mutation, staging, commit, or push was performed.

## Root cause repaired

AR-STREAM-STATUS-001 established
`EXPECTED_DEGRADED_MODE_WITH_MISLEADING_LABEL`: the Activity Room status
presentation used M11B WebSocket state as though it described all Activity Room
availability. M11A snapshot data can remain available while M11B is
disconnected or reconnecting.

## Previous misleading semantics

The header and context panel displayed `Activity Stream: Offline`/`Offline`
from the M11B-derived state while the same view could contain successfully
hydrated M11A records, a frontier, reconstructed entities, and a recent data
timestamp. `updated just now` was already written for both snapshot application
and live activity; it was not a WebSocket-only timestamp.

## Resulting status contract

- M11B remains authoritative for live transport state:
  `Connecting`, `Live`, `Reconnecting`, `Disconnected`, plus existing local
  `Paused`/error behavior.
- M11A remains authoritative for data availability and snapshot completeness:
  `Available`, `Available · snapshot incomplete`, or `Unavailable`.
- The UI labels the first dimension `Live stream` / `Live Activity Stream`.
- The UI labels the second dimension `Activity data` / `Activity Data`.
- No aggregate degraded state is stored. The presentation derives data status
  from existing snapshot presence and `snapshotComplete`.

## Degraded-mode behavior

When M11B is disconnected or reconnecting and M11A data is present, existing
Activity data remains visibly available. The live-stream indicator remains
truthfully disconnected/reconnecting and does not become Live because a
snapshot exists. An incomplete snapshot remains separately visible as
`Available · snapshot incomplete`.

## Freshness semantics

The existing freshness timestamp remains generic Activity-data freshness. It
may reflect snapshot application or live activity application. The header now
labels it `Data`, next to the separate `Activity data` status, so it cannot be
read as proof of WebSocket connectivity. No transport timestamp was added.

## Reconnect semantics

The existing `room.retry` action and M11B reconnect/snapshot behavior are
unchanged. Its visible label is now `Reconnect live stream`, making its target
explicit. Cursor, frontier, catch-up, resync, and history semantics were not
changed.

## M11A/M11B ownership and frozen boundaries

The repair does not modify M11A SnapshotProjector ownership, entity membership,
operation attachment, ordering, frontier, or completeness. It does not modify
M11B protocol or connection transitions, durable persistence, event ordering,
view-mode semantics, or Codex App Server authentication/401 behavior.

## Exact files changed

- `apps/workspace/src/pages/activity/status-config.ts`
  - Added pure M11A data-status presentation mapping.
  - Changed only transport labels from `Offline` to `Disconnected`.
- `apps/workspace/src/pages/activity/ActivityRoomHeader.tsx`
  - Added separate live-stream and Activity-data presentation.
- `apps/workspace/src/pages/activity/ActivityRoomContextPanel.tsx`
  - Added separate live-stream, Activity-data, and snapshot status rows.
- `apps/workspace/src/pages/activity/M11CActivityRoomPage.tsx`
  - Passed existing snapshot evidence to the presentation components.
  - Renamed the existing action to `Reconnect live stream`.
- `apps/workspace/src/pages/activity/status-config.test.ts`
  - Added focused status-contract tests.
- `docs/evidence/AR-STREAM-STATUS-002.md`
  - This evidence record.

No AR-SNAPSHOT-002A, M11B transport, Codex, persistence, or event-ordering
files were changed.

## Verification

Passed:

- Focused status, snapshot-consumer, Activity stream, and M11B-related tests:
  5 files / 21 tests.
- Relevant Activity Room UI, hook, and package corpus: 23 files / 168 tests.
- `pnpm build` (root build): PASS; dependency boundaries valid across 119
  workspace projects.
- `pnpm dependencies:check`: PASS; dependency boundaries valid across 119
  workspace projects.
- `pnpm check:source-artifacts`: PASS.
- `git diff --check`: PASS for the tracked worktree diff; the new untracked
  files were also checked individually with no whitespace errors.

Expected bounded-environment limitations:

- `pnpm --filter @vestara/workspace-ui build` reached TypeScript but failed on
  the pre-existing unrelated `apps/workspace/src/lib/m11a-api.ts:292` union
  shape error (`participants` is not present on one union branch). That file
  was already dirty and was not changed.
- `pnpm lint:check` found three pre-existing/unrelated Biome issues in
  `apps/api/src/telegram-identity.ts` and
  `apps/api/__tests__/telegram-identity.test.ts`. No lint fix was run.
- Targeted Biome cannot process these files because repository configuration
  ignores `apps/workspace`; it made no changes. The changed status contract
  passed the focused Vitest compilation and tests.

## Remaining unknowns

This repair does not establish the exact browser WebSocket frame history for a
past deployment, nor the endpoint behind the unrelated Codex 401. Those were
not required for the accepted presentation boundary and remain out of scope.

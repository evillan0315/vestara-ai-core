# AR-SCROLL-002 — Restore Canonical Activity Ordering Evidence

Status: bounded M11C repair implemented and locally verified. No API restart,
browser reload, production mutation, staging, commit, or push was performed.

## Root cause repaired

AR-SCROLL-001 established that M11A `SnapshotSelection.items` is ascending,
while M11A `entities` are selected newest-first. M11C consumed `entities`
without normalization. Its history/live logic and scroll behavior assumed
ascending oldest-to-newest order, so initial `scrollTop = scrollHeight`
positioned the user at older activity.

## Resulting ordering contract

M11C now normalizes the M11A entity or flat snapshot path by authoritative
sequence at `snapshotStreamItems()`. The rendered working set is always:

```text
oldest sequence -> newest sequence
```

This restores the established Activity Room contract. Started/Completed order
is determined only by sequence; no lifecycle ordering is invented.

## Scroll and history behavior

- Initial hydration starts with the existing at-latest intent and snaps to the
  bottom after snapshot rows are applied.
- Jump to latest continues to target the bottom/latest end.
- Live additions are merged and sorted ascending defensively. At-bottom users
  continue to follow the latest end.
- Users reading older rows retain their current viewport when live rows append;
  live updates do not change `scrollTop` in that state.
- Older-history prepends preserve the visual anchor by adding the increase in
  scroll height to the prior scroll position. A second animation-frame
  correction accommodates virtual-row measurement growth.

## Header refinement

The existing AR-STREAM-STATUS-002 presentation remains intact: M11B remains
truthfully represented as `Live stream · Disconnected` or `Live stream ·
Reconnecting`, while M11A availability remains independently represented as
Activity data. The Reconnect live stream behavior was not changed.

## Frozen boundaries

No changes were made to:

- M11A SnapshotProjector ownership, membership, attachment, completeness,
  frontier, or bounded retrieval;
- M11B protocol, authentication, reconnect, or transport behavior;
- durable persistence;
- AR-STREAM-STATUS-002 state ownership;
- Codex App Server behavior;
- view-mode or lifecycle ordering semantics.

## Exact files changed

- `apps/workspace/src/hooks/useM11CActivityRoom.ts`
  - normalize snapshot entities and preserve ascending live merge order;
  - retain existing snapshot completeness behavior.
- `apps/workspace/src/pages/activity/M11CActivityStream.tsx`
  - preserve older-history visual anchors;
  - prevent live updates from moving a browsing viewport;
  - retain bottom/latest initial and Jump to latest behavior.
- `apps/workspace/src/hooks/m11c-snapshot-contract.test.ts`
  - entity normalization and sequence-based live ordering tests.
- `apps/workspace/src/pages/activity/M11CActivityStream.scroll.test.ts`
  - latest-end and prepend-anchor contract tests.
- `docs/evidence/AR-SCROLL-002.md`
  - this evidence record.

The prior AR-STREAM-STATUS-002 files remain unchanged by this milestone.

## Verification

Passed:

- Focused normalization, scroll, status, snapshot, and Activity stream tests:
  6 files / 27 tests before the final fixture correction; final focused
  rerun: 3 files / 13 tests passed.
- Relevant Activity Room and `packages/activity-room` suites: 25 files / 174
  tests passed.
- Root `pnpm build`: PASS; dependency boundaries valid across 119 projects.
- `pnpm dependencies:check`: PASS; dependency boundaries valid across 119
  projects.
- `pnpm check:source-artifacts`: PASS.
- `git diff --check`: PASS; new untracked test/evidence files also passed
  individual whitespace checks.

Known baseline limitation:

- `pnpm --filter @vestara/workspace-ui build` remains blocked by the existing
  unrelated `apps/workspace/src/lib/m11a-api.ts:292` union-shape error. The new
  fixture error was corrected; no production baseline file was modified.
- Workspace UI paths are ignored by repository Biome configuration, so
  targeted Biome does not process these files. No lint mutation was run.

## Remaining risks

The history-anchor correction relies on the virtualizer's measured scroll
height and reasserts once on the next animation frame. Extremely late layout
changes outside the virtualized rows are not independently observed. No live
browser reload was performed in this milestone.

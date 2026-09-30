# AR-SNAPSHOT-002A — Snapshot Ownership & Completeness Repair Evidence

Status: locally repaired and verified; **not deployed**. The API was not
restarted, the browser was not refreshed, and no production database state was
mutated. Nothing was staged, committed, or pushed.

## Accepted blockers

AR-SNAPSHOT-002 review identified:

- B1: M11A selected parent capacity but returned flat StreamItems, leaving
  operation correlation to M11C.
- B2: `complete=false` was computed but discarded by the M11A response.
- B3: operation lifecycle records could be separated by retrieval pages
  without an entity-level attachment contract.

## Exact repair

### Activity entity contract and authority

`packages/activity-room/src/snapshot-projector.ts` now returns:

```text
SnapshotActivityEntity {
  parent: StreamItem
  lineageKey: exact execution/session/conversation lineage key or null
  operations: SnapshotOperation[]
}
```

The projector selects newest non-tool parent entities up to the fixed capacity
of 50. Tool lifecycle records never increment `entityCount`. Operations are
attached by exact lineage and callID, using the same authoritative lineage
fields already present in M10 StreamItems. No display text, timestamp-only
matching, UI position, names, or heuristic fallback is used.

Called/succeeded/failed lifecycle rows for one callID are merged into one
`SnapshotOperation` with the accumulated activity IDs and the status from the
highest authoritative sequence. Parent selection uses deterministic entity
priority and sequence ordering when more than one eligible parent shares a
lineage.

M11A owns entity membership, operation attachment, entity cardinality, and
snapshot completeness. M10 remains a reusable per-record StreamItem mapper;
its additive `projectRecord()` method remains side-effect-free. M11C adapts
already-attached entities into the existing visual session shape and does not
decide snapshot membership or recompute the initial snapshot's relationships.

### API completeness transport

The M11A snapshot response now includes additive fields:

- `entities`: parent entities with attached operations;
- `complete`: whether reconstruction proved operation closure;
- `entityCount`: selected parent entity count.

The legacy flat `stream` field remains in the response for compatibility, but
the updated M11C client consumes `entities` for snapshot hydration.

### Consumer behavior

`useM11CActivityRoom` adapts server-established entities to existing UI items.
When `complete=false`, it:

- exposes `snapshotComplete=false`;
- preserves the partial recovered entities;
- keeps history loading available;
- reports `Activity snapshot incomplete; load older history to continue.`

It does not silently treat a budget-exhausted snapshot as complete.

Existing client correlation remains available for later live/history material
and merges with an already-established snapshot session without replacing its
known operations. It is presentation adaptation, not snapshot membership
authority.

## Bounded reconstruction

The existing fixed bounds remain unchanged:

- page size: 50 M9 records;
- maximum pages: 20;
- maximum durable records scanned: 1,000.

The M9 backward query remains AR-HISTORY-002 semantics: `beforeSequence` is
exclusive, selects the immediately preceding page, and returns it in ascending
sequence order.

`complete=true` now requires the projector to exhaust durable history within
the 20-page budget. Reaching 50 entities alone is insufficient because older
operation lifecycle records may still exist. A page-budget stop returns
`complete=false`, preserving fail-closed behavior. A parent outside the total
budget remains unresolved and cannot be represented as a complete entity.

The authoritative frontier remains `projection.room.cursor`; scanning older
M9 pages never moves it backward.

## Page-boundary behavior

The projector accumulates tool rows before and after their parent is encountered
during newest-first traversal, then performs attachment after selection. This
supports:

- parent and operation rows on different pages;
- operation encountered before its parent;
- multiple operations distributed across pages;
- independent parents with distinct lineage keys;
- parent inside the M9 scan budget but outside the M10 500-item working set;
- deterministic incomplete state when the parent is outside the total budget.

An operation is attached only when an exact lineage key and callID are
available. Otherwise it remains non-attached evidence and cannot create a
fabricated relationship.

## Frontier, history, and filters

- Snapshot entity count and operation count remain independent of the sequence
  frontier.
- AR-HISTORY-002 source and semantics were not changed.
- Load Older History continues to use `beforeSequence` and ascending page
  composition.
- Summary, Operational, and Raw presentation filters remain downstream and do
  not affect server snapshot membership.
- M10's 500-item working-set semantics remain unchanged.

## Files changed by 002A

### Production additions/changes

- `packages/activity-room/src/snapshot-projector.ts` — entity and operation
  contract, exact attachment, conservative completeness.
- `packages/activity-room/src/index.ts` — exports the new snapshot contracts.
- `apps/api/src/routes/activity-room-m11a.ts` — transports entities,
  operations, `complete`, and `entityCount`.
- `apps/workspace/src/lib/m11a-api.ts` — client response contracts.
- `apps/workspace/src/hooks/useM11CActivityRoom.ts` — entity adaptation and
  explicit incomplete-state handling.
- `apps/workspace/src/pages/activity/correlated-session.ts` — preserves and
  merges server-established operation sessions when older/live evidence is
  later presented.

### Tests

- `packages/activity-room/__tests__/snapshot-projector.test.ts` — entity
  attachment, one parent with 200 logical operations (400 lifecycle rows),
  page splits, lineage isolation,
  budget exhaustion, frontier, ordering, and history composition.
- `apps/workspace/src/hooks/m11c-snapshot-contract.test.ts` — consumer entity
  adaptation and incomplete-state behavior.

### Inherited AR-SNAPSHOT-002 files

The working tree already contained the prior AR-SNAPSHOT-002 implementation,
tests, and evidence before this repair. In particular,
`packages/activity-room/src/m10-projection-runtime.ts` and the existing M11A
route/projector changes are inherited context; 002A did not redesign M10 or
change its `projectRecord()` ownership.

The worktree also contains unrelated uncommitted work from earlier milestones.
Those changes were preserved and are not claimed as 002A work.

## Verification evidence

Passed:

- `pnpm build` — PASS; dependency boundaries valid across 119 projects.
- Focused 002A/ownership tests — PASS; projector, history, Activity stream,
  correlation, and consumer contract tests passed (18 tests in the final
  projector/consumer/correlation run; the broader focused set passed 34
  tests).
- Activity Room package corpus — PASS; 20 files / 141 tests.
- Relevant API/M9 route regressions — PASS; 5 files / 23 tests.
- `pnpm dependencies:check` — PASS; 119 projects.
- Targeted Biome on relevant changed files — PASS after formatting.
- `git diff --check` — PASS.

The API route is compile-verified but no live route request was made because
the API was not restarted and live state was out of scope.

## Remaining unknowns

- A live deployment is required to verify the running systemd API serves the
  additive entity/completeness contract.
- Concurrent appends during a snapshot scan remain reconciled by sequence-based
  M11B catch-up; no stronger transactional snapshot claim is introduced.
- The fixed 20-page budget can legitimately produce an incomplete snapshot in
  sufficiently dense histories; the consumer now reports that state instead
  of presenting it as complete.

## Deployment state

**MANUAL API RELOAD REQUIRED**

Required operator action after review:

```text
pnpm build
sudo systemctl restart vestara-api.service
```

No restart was performed by this work.

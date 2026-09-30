# AR-SNAPSHOT-002 — Independent Acceptance Review

Status: independent review only. No production source, tests, database,
service, browser state, or OpenCode state was modified. No staging, commit, or
push was performed.

## 1. Executive verdict

**HOLD_FOR_FIXES**

The implementation correctly moves snapshot membership selection behind a
package-owned projector invoked by M11A and removes dependence on M10's 500
item working set. Focused tests and the full build pass. However, it does not
fully satisfy the frozen AR-SNAPSHOT-001B contract:

1. `SnapshotProjector` selects parent-capacity and returns tool `StreamItem`s,
   but it does not attach operations into an Activity-entity result. Actual
   operation correlation remains in unchanged M11C
   (`deriveCorrelatedSessions`). This violates the frozen requirement that the
   M11A snapshot boundary own operation attachment and entity cardinality.
2. `SnapshotSelection.complete` is computed but discarded by the M11A route.
   The wire response has no completion state, and the client cannot distinguish
   a budget-exhausted partial snapshot from a complete snapshot. This makes the
   reported fail-closed `complete=false` semantics internal/test-only rather
   than an actionable snapshot contract.

The implementation is therefore not safe for dogfood deployment under the
accepted ownership decision.

## 2. Exact diff/scope

The current worktree is substantially dirty from earlier work programs. Git
reports many unrelated modified and untracked files, including prior identity,
authentication, persistence, Activity Room, UI, and documentation changes.
There is no clean commit boundary that independently identifies the complete
AR-SNAPSHOT-002 mutation set. This limits the ability to certify “only
AR-SNAPSHOT-002 files changed.” The following AR-SNAPSHOT-002-relevant files
are present:

### Relevant production files

- `packages/activity-room/src/snapshot-projector.ts` — new M11A snapshot
  selection logic; within scope.
- `packages/activity-room/src/m10-projection-runtime.ts` — additive
  `projectRecord()` exposure; the method is within scope, but this file also
  contains unrelated pre-existing changes in the current worktree.
- `packages/activity-room/src/index.ts` — exports the projector; within scope,
  but also contains unrelated prior exports in the current worktree.
- `apps/api/src/routes/activity-room-m11a.ts` — invokes the projector in the
  snapshot route; the AR-SNAPSHOT-002 hunk is within scope, but the file also
  contains unrelated RuntimeInteraction/native-storage changes.

### Relevant test/evidence files

- `packages/activity-room/__tests__/snapshot-projector.test.ts` — new focused
  projector tests.
- `docs/evidence/AR-SNAPSHOT-002.md` — implementation evidence.

### Scope observations

- `apps/workspace/src/hooks/useM11CActivityRoom.ts` and the M11C correlation
  helper were not changed for this implementation. That preserves existing UI
  behavior but also leaves client-side correlation as the actual operation
  attachment authority.
- `AR-HISTORY-002` source was not changed in the relevant diff.
- M9 persistence ownership was not changed by the projector itself; the route
  injects the existing store query.
- Because the worktree is not clean, unrelated current modifications remain a
  deployment-scope risk even though they are not required by AR-SNAPSHOT-002.

## 3. Ownership compliance

### Compliant

- M9 remains the durable source. The route injects `room.store.query` rather
  than changing M9 schema or persistence ownership.
- M10 remains the source of per-record `StreamItem` material. The projector
  receives a stateless `projectRecord` function.
- M11A invokes the projector at the HTTP snapshot boundary.
- M11B, M11C filters, and rendering were not made snapshot authorities.
- M10's ordinary 500-item stream working set is bypassed for durable snapshot
  retrieval.

### Not compliant with the frozen decision

The frozen decision defines the M11A SnapshotProjector contract as selecting
projectable parent entities **with correlated operations attached**. The new
projector returns `SnapshotSelection.items: readonly StreamItem[]`; it does
not return an ActivityEntity/operation-bearing entity contract. The client
still calls `deriveCorrelatedSessions(stream)` in
`apps/workspace/src/hooks/useM11CActivityRoom.ts`.

Thus M11A owns which non-tool records enter the returned set, but M11C still
owns whether tool records become operations on a parent. This is a partial
ownership transfer, not the frozen complete boundary.

## 4. SnapshotProjector contract review

`packages/activity-room/src/snapshot-projector.ts` correctly provides:

- injected bounded history retrieval;
- newest-first page traversal using `beforeSequence`;
- a parent/entity capacity separate from tool count;
- exact lineage-key helpers for execution, session, and conversation;
- ascending final item order;
- an independent `entityCount`;
- a deterministic page budget;
- a `complete` result field.

The implementation treats every non-tool `StreamItem` as an entity and every
tool item as attachable evidence. That is a defensible recovery classification,
but the output is still the old flat StreamItem shape. The projector only uses
lineage to decide whether to stop scanning; it does not construct or return
the operation membership required by the frozen contract.

The route passes `projection.room.cursor.sequenceNumber + 1` as the exclusive
upper bound and returns the old `room` object/cursor. That preserves the
frontier shape, but the route drops `selection.complete` and
`selection.entityCount`.

## 5. Projectable entity semantics

The implementation's implicit entity definition is:

> any non-tool M10 StreamItem.

This preserves zero-operation controls and does not use display text or
inferred identity. Stream identity remains the existing `streamItemId` derived
from `activityId`, and sequence ordering is stable.

The definition is incomplete at the wire boundary because there is no entity
object containing its operation membership. The result can contain:

- selected non-tool parents;
- all tool items scanned during the bounded traversal, including tools whose
  parent is not selected or whose lineage is not attachable to a selected
  entity.

Those orphan tool rows remain recoverable evidence and are later excluded by
M11C. That preserves some historical behavior, but it means the projector is
not itself the authoritative operation-bearing entity projection.

No display-text correlation, synthetic parent, or unstable ID was found.

## 6. Operation correlation

The implementation does not double-count tool rows as entity slots: tools are
not appended to `entities`, and tests demonstrate a 200-tool-row fixture with
`entityCount === 2` for the started/completed parents.

However, the required attachment proof is absent from the production result:

- `lineageKeysOf` and `attachesToSelected` only determine whether a scanned
  tool shares a lineage with a selected parent.
- `scannedTools` is returned as separate `StreamItem`s.
- Actual callID lifecycle coalescing and parent attachment still occur in
  `deriveCorrelatedSessions` on M11C.

Therefore the required cases are only partially proven:

| Case | Entity slot behavior | Attachment authority |
| --- | --- | --- |
| parent + 0 operations | one slot | parent returned; okay |
| parent + 1 operation | one slot | client still attaches |
| parent + 25 operations | one slot | client still attaches |
| parent + 200 operations | one slot | client still attaches |

The tests prove tool rows do not increment `entityCount` and preserve callID
values, but they do not prove the SnapshotProjector returns one operation-
bearing entity. They also do not prove wrong-parent rejection through the
projector's output contract; they only inspect lineage fields and counts.

## 7. M10 `projectRecord()` review

**Verdict: ACCEPTABLE ADDITIVE EXPOSURE.**

`ProjectionRuntime.projectRecord(record)` directly delegates to the existing
private `recordToStreamItem(record)` and does not mutate stream, cursor,
participants, attention, workflow, or aggregation state
(`packages/activity-room/src/m10-projection-runtime.ts:294-309`). It exposes
existing per-record mapping capability needed by the injected projector and
does not make M10 own entity cardinality.

The method itself is therefore within the frozen ownership model and does not
create an inappropriate dependency direction. The same file contains other
unrelated worktree changes, including participant and attention behavior; those
are not justified by this method and remain part of the broader dirty-tree
deployment risk.

## 8. Bounded retrieval analysis

Per-page retrieval is bounded:

- page size defaults to 50;
- each call uses the existing `beforeSequence` M9 query;
- cursor advances to `page[0].sequenceNumber`;
- `MAX_SNAPSHOT_SCAN_PAGES` defaults to 20;
- an empty page terminates;
- a trailing page with no attachable tool can terminate after capacity.

Total traversal is also globally bounded at 20 queries and at most 1000
retrieved M9 records under the default settings. This is stronger than merely
having a per-page LIMIT and does not depend on M10's 500-item working set.

The limitation is semantic rather than unboundedness: the total output can
contain all scanned tool rows, up to the page budget, and the projector can
stop before older lifecycle rows for a selected parent are examined. The code
comment claims that after a quiet trailing page older pages cannot attach to a
selected parent, but that is not generally guaranteed by lineage alone when a
parent's operations precede the parent in durable sequence order. The evidence
document acknowledges deeply interleaved lineages as a limitation, but the
snapshot contract requires operation attachment to be explicit and complete.

Classification: **bounded retrieval is structurally safe but semantically
incomplete for operation completeness**.

## 9. `complete=false` semantics

The internal meaning is reasonably precise: `false` means the page budget
ended before either capacity was reached or durable history was exhausted.
The test exercises deterministic budget exhaustion.

The production boundary is not coherent:

- M11A does not include `selection.complete` in the JSON response.
- M11A does not include `entityCount` or scan metadata either.
- `useM11CActivityRoom` cannot observe or act on incomplete state.
- The client can silently treat a partial selection as a complete recovered
  snapshot and begin normal catch-up from the frontier.

This is a deployment blocker. A fail-closed internal boolean that is discarded
at the API boundary is not fail-closed behavior for the consumer.

## 10. Sequence/frontier analysis

The implementation preserves the existing projection cursor:

```text
room.cursor = projection.room.cursor
startBefore = room.cursor.sequenceNumber + 1
```

Entity count, operation count, and pages scanned do not replace the cursor.
The route returns the M10 projection frontier, so it cannot move backward just
because the projector reads older M9 pages.

This part satisfies the frozen frontier requirement. The remaining concern is
that the scan is a point-in-time read while concurrent appends may occur; the
existing M11B forward catch-up path is the appropriate reconciliation mechanism
and the evidence records that limitation.

## 11. Ordering

The projector scans pages newest-first, selects entities newest-first, then
sorts the combined parent/tool `StreamItem` list ascending by sequence. This
is deterministic for unique M9 sequence numbers and preserves parent order.

Operation attachment is not actually performed by the projector, so there is
no projector-level operation-order contract to verify. The remaining client
correlation preserves first-seen callID insertion order, as shown by the
existing correlation tests.

## 12. AR-HISTORY-002 composition

The M9 native query still implements AR-HISTORY-002: `beforeSequence` selects
the immediately preceding bounded page in descending order and reverses it to
canonical ascending order (`packages/activity-room/src/m9-native-sqlite-store.ts:189-249`).

Focused AR-HISTORY-002 tests pass and the implementation source was not
changed by the projector. The new test G proves sequence-level union and
deduplication for a fake history source, but it does not prove:

- operation-bearing entity attachment across the boundary;
- no duplicate operation after a parent is already held;
- the real M11A route response;
- behavior when a selected parent's tool rows span the projector page budget.

Compatibility is therefore structurally preserved but not fully demonstrated
at the required entity/operation contract.

## 13. Reload/reconnect coverage

The source path shows the repaired projector is used by the M11A snapshot route
for both initial snapshot and the same route used by explicit M11C resync.
Cold browser load, deliberate page reload, and resync therefore reach the new
selection function once the rebuilt API is deployed.

Ordinary API restart with an existing browser uses M11B reconnect/catch-up and
does not necessarily request a snapshot; that is existing sequence-based
behavior. If M11B requires resync, the hook refetches the same repaired M11A
snapshot.

No source path was found where the production M11A snapshot route still calls
the old `.slice(-50)` expression. This portion is acceptable.

There is no API-level route test proving this path, and no live deployment has
occurred.

## 14. Filter independence

The SnapshotProjector operates on M9/M10 material and does not receive Summary,
Operational, or Raw filter state. M11C filters remain downstream. The focused
test I checks that recovery includes kinds that presentation may later hide.

This satisfies filter independence. It does not cure the missing transport
completion state or client-owned operation attachment.

## 15. Test-quality review

The tests are useful and use the real M10 per-record mapping with a fake
AR-HISTORY-002-compatible source. They genuinely cover:

- operation-heavy input;
- 200 lifecycle rows / 100 callIDs;
- multiple lineages;
- deterministic one-page budget exhaustion;
- ordering;
- zero-operation selection;
- downstream filtering intent;
- sequence-level history union.

Coverage gaps:

- The “200 operations = one slot” test checks `entityCount`, not a returned
  operation-bearing entity.
- No test asserts a SnapshotProjector operation cannot attach across distinct
  session/execution/conversation lineage combinations beyond origin fields.
- No test exercises a selected parent's operations older than a quiet page.
- No test proves total output or wire payload behavior under the 20-page limit.
- No test verifies `complete=false` reaches the HTTP client or changes client
  state.
- No API route harness verifies the real JSON snapshot response.
- The history composition test checks raw sequence union, not parent/operation
  composition.
- No test covers an actual parent beyond the M10 working set through the route;
  the fake source proves the projector does not call M10's working set, but not
  the deployed composition.

The tests are not false positives for parent-capacity selection, but they are
insufficient to accept the frozen operation-attachment and completion
contracts.

## 16. Independent verification results

Executed read-only verification:

- `pnpm build` — PASS; dependency boundaries valid across 119 projects.
- Focused Activity/ownership tests — PASS, 5 files / 30 tests:
  `snapshot-projector`, `m9-backward-pagination`, `ar-stream-reload-001`,
  `ar-stream-tool-001`, and M11C `correlated-session`.
- `pnpm dependencies:check` — PASS; 119 projects.
- Targeted Biome on relevant production/test files — PASS; no fixes applied.
- `git diff --check` — PASS.

These results validate compilation and the implemented selection behavior, but
they do not resolve the two contract blockers above.

## 17. Deployment risks

Blockers:

1. **High — operation attachment ownership violation.** M11A SnapshotProjector
   returns flat StreamItems; M11C still performs actual parent/session
   correlation. This conflicts with the frozen M11A ownership decision.
2. **High — incomplete snapshot state is dropped.** `complete=false` is not
   transported or interpreted, so budget-exhausted recovery can appear normal.
3. **Medium — operation completeness across page boundaries.** The early-stop
   rule and flat tool evidence output do not prove all operations for selected
   parents are attached before the snapshot is considered complete.
4. **Medium — dirty worktree scope cannot be independently certified.** The
   current status contains broad unrelated production changes, and the route
   itself contains unrelated prior changes in the same file.

No evidence indicates a new M9 persistence ownership violation, AR-HISTORY-002
source regression, or filter-membership coupling.

## 18. Dogfood plan

Not executable until blockers are fixed and a rebuilt API is manually deployed.
The bounded post-deployment plan is:

1. Run `pnpm build` and manually restart the existing
   `vestara-api.service`; do not start a second API process.
2. Wait for API readiness and record the service/build state, not health alone.
3. Cold-load Activity Room and record recovered entity count, attached
   operation counts, `complete` state, and frontier sequence.
4. Run an operation-heavy execution with many tool calls and verify multiple
   parent entities remain present; verify one parent with 25+ operations still
   occupies one entity slot.
5. Deliberately reload the browser and compare entity IDs, operation IDs,
   chronology, and frontier for duplicates or gaps.
6. Use Load Older History across the snapshot boundary and verify no skipped
   parents, duplicate parents, or duplicate called/succeeded operations.
7. Exercise API restart with the browser retained, then ordinary reconnect
   and forced resync behavior separately.
8. Record the separate final-agent-response observation for
   `AR-RESPONSE-PROJECTION-001`; do not treat it as this milestone's result.

## 19. Final ACCEPT_FOR_DEPLOYMENT / HOLD_FOR_FIXES

**HOLD_FOR_FIXES**

Required before acceptance:

- make the M11A snapshot contract genuinely operation-bearing, or otherwise
  move authoritative operation attachment into the explicit M11A projector
  without leaving M11C as the owner;
- define and transport actionable completion semantics, or establish an
  explicit bounded contract in which partial results cannot be presented as a
  complete snapshot;
- add route-level and boundary-focused tests for those semantics;
- re-review the implementation from a clean milestone diff or explicitly
  separate unrelated worktree mutations.


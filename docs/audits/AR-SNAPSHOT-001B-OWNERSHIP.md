# AR-SNAPSHOT-001B — Snapshot Projection Ownership Decision

Status: architecture/ownership decision only. No production source, tests,
database, service, browser state, OpenCode configuration, or Activity Room
runtime state was modified.

## 1. Executive decision

The canonical owner should be an explicit **M11A snapshot-projection boundary**
between the reusable M10 stream projection and the M11A HTTP snapshot/API
contract.

This is Option C, with M11A as the owning boundary:

```text
M9 durable observations
  → M10 reusable StreamItem projection/material
  → M11A SnapshotProjector
       - selects newest N projectable Activity entities
       - attaches correlated operations
       - preserves the independent frontier
  → M11A snapshot transport
  → M11C presentation/filtering/rendering
```

M9 must remain persistence authority. M10 must remain the reusable ordered
observation-to-stream projection. M11C must not decide snapshot membership.
The current client correlation algorithm is evidence that the required
projectable-entity contract is missing; it is not evidence that M10 already
owns that contract.

## 2. Current M9 → M10 → M11A ownership map

| Layer | Current authority | Current representation | Snapshot role |
| --- | --- | --- | --- |
| M9 | `DurableActivityStore` / `m9_activity_events` | `M9ActivityRecord` with sequence and lineage | durable source and history query |
| M10 | `ProjectionRuntime` in `@vestara/activity-room` | `StreamItem`, participants, attention, workflow summary | reconstructable in-memory projection; raw stream working set |
| M11A | `activity-room-m11a.ts` | HTTP snapshot/activities/participants/attention responses | transport/API boundary; currently applies `.slice(-50)` |
| M11B | `activity-room-m11b.ts` plus `ActivityStreamHub` | ordered live projection records | subscribe, catch-up, resync transport |
| M11C | `useM11CActivityRoom` and activity page modules | client stream items and correlated sessions | hydration, client presentation, filtering, rendering |

Concrete evidence:

- M11A opens `.vestara/m9-activity.db`, rebuilds M10, and owns
  `lastProjection` (`apps/api/src/routes/activity-room-m11a.ts:137-203`).
- M10 converts every ordered record into a stream item, maintains the 500-item
  in-memory bound, and exposes `getRawStream()` (`packages/activity-room/src/m10-projection-runtime.ts:48-132`).
- M11A currently returns `getRawStream().map(...).slice(-50)` and an
  independent projection cursor (`activity-room-m11a.ts:842-857`).
- M11C currently derives correlated sessions after snapshot hydration
  (`apps/workspace/src/pages/activity/correlated-session.ts:45-124`).

## 3. M9 responsibility

M9 owns durable normalized Activity observations, their stable activity/event
identities, sequence allocation, lineage fields, payload evidence, and
cursor-based history. The M9 types explicitly describe durable records as
reconstructable projection input and not orchestration authority
(`packages/activity-room/src/m9-types.ts`, `M9ActivityRecord` and store
contracts).

M9 should know nothing about:

- visible Activity Room entities;
- UI density or filter modes;
- parent-card selection;
- operation grouping for presentation;
- snapshot page size.

M9 may expose enough stable sequence and lineage evidence for a higher layer to
perform those projections. Adding entity cardinality to the store would mix
persistence/history semantics with a consumer-specific read model and would
also risk changing AR-HISTORY-002's existing backward pagination contract.

## 4. M10 responsibility

M10 is the reusable deterministic projection runtime. Its `StreamItem` contract
is already semantic Activity Room projection material, not a raw database row:
it contains `streamItemId`, source `activityId`, sequence, kind, importance,
actor, content, lineage, tool metadata, and optional aggregation data
(`packages/activity-room/src/projection-types.ts:29-132`).

However, `StreamItem` is not currently a projectable Activity entity. The
contract permits `tool-call` and `tool-result` as first-class stream kinds, and
M10 creates one item per processed M9 record before any called/succeeded
coalescing. M10's 500 bound is a working-set/backpressure bound, not an
entity-cardinality promise (`m10-projection-runtime.ts:71-89`).

M10 currently serves these meaningful consumers:

- M11A snapshot state, including participants, attention, workflow summary, and
  raw stream hydration;
- M11A endpoints that read `lastProjection` and M10-derived participants or
  attention;
- M11B's runtime lifecycle, which processes new records through the same M10
  runtime before broadcasting;
- package-level projection and rebuild tests, including reload and tool
  evidence tests;
- M11C, indirectly, through M11A stream records and live wire conversion.

Changing M10 so its ordinary stream or `getRawStream()` means “newest N
projectable UI entities” would change a reusable projection contract and could
alter live processing, participants/attention reconstruction, tests, and any
future M10 consumer. That is not supported by the current contract.

M10 may gain a narrowly named input/output capability only if it is explicitly
defined as a snapshot-projector dependency, but the ordinary M10 stream must
not silently change meaning.

## 5. M11A responsibility

M11A is the current server-side Activity Room API and snapshot owner. It
already decides when to rebuild stale projection state, what snapshot payload
to return, which cursor accompanies it, and how the durable history endpoint is
exposed (`apps/api/src/routes/activity-room-m11a.ts:833-875`).

M11A should own the semantic snapshot membership decision because:

- snapshot membership is an API/read-model concern, not persistence;
- the snapshot must be consistent across cold load, page reload, and explicit
  resync;
- the HTTP response already carries both stream data and the authoritative
  frontier;
- the client should not decide whether an item exists in the authoritative
  initial snapshot;
- M10's reusable `StreamItem` contract can remain available to live and other
  consumers.

The new boundary must explicitly own selection and operation attachment. It
must not be confused with M11A's existing filtering or the browser's current
`deriveCorrelatedSessions` helper. Client filters remain presentation-only;
the bounded snapshot projector determines which entities are recovered.

## 6. Projectable Activity entity definition

The repository currently has no canonical type whose cardinality means “one
visible Activity entity with its operations.” `StreamItem` is the closest
existing contract, but it is lower-level because tool lifecycle items are
individual items and correlation is currently client-side.

For AR-SNAPSHOT-002, define a projectable Activity entity at the M11A
snapshot boundary as:

> One stable parent Activity presentation item selected from authoritative M10
> projection material, identified by its existing activity/stream identity and
> sequence, carrying zero or more correlated operation records whose callIDs
> and lineage resolve to that parent.

Required properties:

- stable parent identity, preserving the existing source activity/stream ID;
- the parent's authoritative sequence and timestamp;
- a lineage key sufficient to associate operations;
- operations keyed by callID, with called/succeeded/failed lifecycle evidence;
- the parent's operation membership without treating each operation as a
  separate entity slot;
- ascending canonical sequence order;
- an independent authoritative frontier.

This is a proposed missing contract, not an existing type claim. It must be
introduced as an explicit snapshot contract or projector result, rather than
reinterpreting `StreamItem` globally.

## 7. Operation ownership/correlation

The current client implementation knows how to correlate operations: it
requires a canonical callID, a shared execution/session/conversation lineage
key, and an in-window non-tool parent. It merges lifecycle rows by callID and
hides the correlated tool rows from the top-level list
(`correlated-session.ts:45-124`).

The invariant “correlated operations consume zero Activity-entity snapshot
slots” belongs to the M11A snapshot-projector contract because that boundary
owns the selected entity set. It should not be added to M9, which has no UI
entity semantics, or to ordinary M10 processing, which currently preserves
tool lifecycle StreamItems as evidence.

For the snapshot projector to enforce the invariant safely, it must receive
enough M10/material or authoritative M9 lineage to find the parent and all
bounded operations. It must not silently over-fetch an arbitrary unbounded
window. The contract must define a bounded retrieval/continuation strategy and
the behavior when a parent is outside the available M10 working set.

The existing client correlation logic should either consume the new bounded
entity contract or become a compatibility-only presentation helper. It must
not remain the authority for initial snapshot membership.

## 8. Sequence/frontier ownership

M9 owns sequence allocation and durable ordering. M10 carries the latest
processed sequence into its projection cursor. M11A exposes that cursor in the
snapshot. M11B uses sequence cursors for subscribe/catch-up, and M11C uses the
snapshot cursor to start live delivery.

The snapshot projector must preserve this separation:

- entity cardinality is the count of selected parent entities;
- operation count is attached evidence, not sequence cardinality;
- the snapshot cursor is the highest authoritative sequence observed at the
  snapshot frontier, even when few entities are returned;
- `beforeSequence` remains a durable history cursor;
- `afterSequence`/M11B subscription remains a stream catch-up cursor.

No projected entity count may be substituted for a sequence number.

## 9. Snapshot/history composition

Initial snapshot and Load Older History must remain different contracts:

- M11A snapshot returns newest-N projectable entities and the current frontier;
- `/activities?beforeSequence=` continues to query durable M9 history using
  AR-HISTORY-002 semantics;
- the history page must be projected with enough parent/operation lineage to
  avoid duplicating an entity already held or orphaning operations;
- returned rows remain ascending within the page and merge chronologically;
- the backward cursor remains the oldest held authoritative sequence, not an
  entity index.

AR-HISTORY-002 must remain unchanged. AR-SNAPSHOT-002 must add a composition
test proving that the snapshot plus backward history pages neither skips a
parent nor duplicates a called/succeeded operation pair.

## 10. Reconnect semantics

The selected boundary must apply consistently to:

- cold browser load: HTTP snapshot, then M11B subscribe from its frontier;
- page reload: same HTTP snapshot contract and replacement hydration;
- API restart with browser retained: ordinary M11B reconnect/catch-up merges
  from the last sequence; no snapshot is required unless resync is requested;
- explicit M11B resync: refetches the same semantic snapshot contract and
  replaces the local recovered set.

Different transport mechanics are legitimate, but snapshot membership must not
change meaning between initial load and resync. Catch-up remains sequence-based
and must not be made entity-count-based.

## 11. Multi-consumer impact

Choosing M11A snapshot projection limits the change to the Activity Room read
boundary. M9 durable records, M10 ordinary StreamItems, M11B sequence
transport, and AR-HISTORY-002 remain stable.

Affected consumers:

- `GET /api/activity-room/v1/snapshot` response contract;
- `useM11CActivityRoom` snapshot hydration;
- `deriveCorrelatedSessions` or its replacement input adapter;
- reload/resync and snapshot-focused tests;
- Activity Room UI counts, which must distinguish recovered projectable entity
  count from attached operation count.

Unaffected by contract:

- M9 ingestion and persistence;
- durable `/activities` history ordering;
- M11B forward sequence delivery;
- non-Activity-Room M10 consumers of ordinary StreamItems;
- workflow, agent, credential, and execution authorities.

This is more Activity-Room-specific than an M10 semantic change, but that is
the correct consequence of an Activity Room snapshot requirement. It avoids
making a reusable lower-level stream contract carry a UI-specific entity
cardinality promise.

## 12. Architectural invariants

The proposed invariants are supported with one refinement:

- `Observation ≠ StreamItem ≠ ActivityEntity ≠ Operation` — **accepted**.
- `Persistence cardinality ≠ Stream cardinality ≠ UI entity cardinality` —
  **accepted**.
- `Snapshot membership ≠ History traversal ≠ Stream catch-up` — **accepted**.
- `Operation membership must not consume Activity entity slots` — **accepted
  for the new M11A snapshot contract**, not an M9/M10 persistence invariant.
- `Sequence frontier remains authoritative independent of projected
  cardinality` — **accepted**.

Additional required invariant:

- M10's ordinary `StreamItem` meaning must not change merely because M11A
  adopts a projectable-entity snapshot.

## 13. Canonical ownership decision

**OWNER:** An explicit M11A SnapshotProjector/read-model boundary between
`ProjectionRuntime` material and the M11A snapshot route.

**CONTRACT:** Given bounded authoritative projection material and its sequence
frontier, return newest-N projectable parent Activity entities in ascending
order, with correlated operations attached by exact lineage/callID, while
preserving the independent frontier and history cursor semantics.

**NON-OWNER RESPONSIBILITIES:**

- M9 owns durable observations, sequence allocation, and history traversal.
- M10 owns deterministic record-to-StreamItem projection, participants,
  attention, workflow state, and its working-set lifecycle.
- M11B owns ordered live delivery and catch-up, not snapshot membership.
- M11C owns filtering, density, rendering, and local presentation state, not
  authoritative snapshot selection.

**WHY:** M11A is already the server-side snapshot and cursor boundary, while
M10 is a reusable lower-level projection and M11C currently owns client-side
correlation. The missing entity contract is therefore best made explicit at
the Activity Room API boundary rather than inferred from M10 StreamItems or
left to the browser.

**CONSEQUENCES:** AR-SNAPSHOT-002 becomes an Activity Room snapshot read-model
change. It must define bounded parent/operation retrieval and may require a
new explicit contract in the Activity Room package, but it must not silently
change M10's ordinary stream or M9 history semantics.

## 14. AR-SNAPSHOT-002 implementation boundary

Allowed future boundary:

- `packages/activity-room`: add the explicit snapshot-projector contract and
  pure projection/selection logic only if it remains package-owned and does
  not depend on the API or UI;
- `apps/api/src/routes/activity-room-m11a.ts`: invoke that projector and
  return its bounded entity snapshot plus the unchanged authoritative cursor;
- `apps/workspace/src/hooks/useM11CActivityRoom.ts` and activity correlation
  adapter: consume the explicit entity/operation shape without independently
  deciding snapshot membership;
- focused package/API/UI tests for the new contract.

Must remain unchanged unless a proven contract dependency requires a mechanical
adapter:

- M9 schema, persistence, sequence allocation, and AR-HISTORY-002 pagination;
- M10 ordinary `ProjectionRuntime` StreamItem semantics and 500-item working
  set;
- M11B sequence protocol and catch-up cursor semantics;
- authorization, execution, agent, and provider authorities.

The exact files should be selected during implementation only after the
bounded retrieval strategy is designed. This audit does not authorize edits.

## 15. Regression obligations

The future repair must prove, with deterministic non-live fixtures:

1. operation-heavy newest activity does not starve multiple parent entities;
2. correlated operations consume zero parent-entity slots;
3. called/succeeded/failed lifecycle rows merge by exact callID and lineage;
4. a parent at each selection boundary is handled deterministically;
5. returned entities are in canonical ascending sequence order;
6. the frontier remains the authoritative highest sequence, independent of
   entity count and operation count;
7. cold load and page reload use identical snapshot semantics;
8. M11B reconnect/catch-up does not duplicate snapshot entities;
9. explicit resync produces the same semantic snapshot as cold load;
10. Load Older History composes without gaps, duplicates, parent loss, or
    operation loss;
11. AR-HISTORY-002's immediate-preceding-page and ascending-return behavior
    remains green and unchanged;
12. filtering/density changes visible presentation only, not snapshot
    membership, frontier, or durable history;
13. M10's ordinary 500-item working-set contract remains separately tested;
14. unrelated M10 consumers and M11B projection delivery remain compatible.

## 16. Risks / unknowns

- The current M10 working set is capped at 500. If the parent needed for a
  selected recent operation is already outside that set, M11A cannot safely
  recover it from `getRawStream()` alone. The implementation must define a
  bounded durable/material retrieval path rather than silently over-fetching.
- The current client correlation helper is not a server-authoritative entity
  contract. Moving membership authority requires an explicit wire shape or a
  server-side selection result; a client-only refactor would not satisfy the
  ownership decision.
- Operation ordering and status precedence must be specified for partial
  called/result pairs and retry calls.
- The snapshot entity identity must preserve existing Activity/stream IDs so
  Activity Room drill-down and deduplication do not acquire a second identity
  namespace.

## 17. Final GO / HOLD recommendation

**GO for AR-SNAPSHOT-002 design and bounded implementation planning.**

Do not begin implementation until the projectable-entity wire contract and
bounded retrieval behavior for parents outside the M10 working set are written
into the milestone acceptance criteria. Once those two details are fixed, the
ownership boundary is sufficiently established to implement without changing
M9, AR-HISTORY-002, M11B, or ordinary M10 stream semantics.


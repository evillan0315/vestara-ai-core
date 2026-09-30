# AR-SNAPSHOT-001-CODEX-REVIEW — Independent Verification Audit

Status: AUDIT ONLY. This review performed read-only source inspection and a
read-only census of `.vestara/m9-activity.db`. No production source, tests,
database, service, OpenCode configuration, browser state, or Activity Room
state was modified.

## 1. Executive verdict

The prior diagnosis survives in substance but not in its exact layer
description.

Confirmed:

- Initial/resync snapshot hydration is bounded to the newest 50
  `ProjectionRuntime` raw `StreamItem`s by
  `room.runtime.getRawStream().map(...).slice(-50)` in
  `apps/api/src/routes/activity-room-m11a.ts:842-857`.
- `ProjectionRuntime` has already processed the complete ordered M9 rebuild
  before that slice; it is not a SQL `LIMIT` over M9 rows. The M10 runtime
  retains at most 500 stream items (`packages/activity-room/src/m10-projection-runtime.ts:28-32,48-89`).
- Tool called/succeeded/failed items therefore consume snapshot capacity even
  though the UI later attaches paired tool lifecycles to a parent and removes
  standalone tool rows from the list.
- A parent outside the 50-item snapshot cannot receive its tools in the client
  correlation pass, because correlation requires an in-window non-tool parent.
- The current durable database is structurally healthy and sequence-contiguous
  through sequence 11610 at audit time. This does not prove the historical
  browser event by itself, but it does not support a persistence-loss cause.

Disputed wording in `AR-SNAPSHOT-001.md`:

- “fixed newest-50 raw observation window before projection/grouping” is not
  literally correct. The fixed slice occurs after M10 record-to-`StreamItem`
  projection and before client-side correlation/filtering.
- “raw observation count” is a useful semantic description of the items, but
  the exact implementation object being sliced is `StreamItem[]`, not the M9
  `ActivityRecord[]` returned by a persistence query.

Root cause classification from this independent review:

- **C — snapshot semantics: CONFIRMED.** The snapshot contract is a fixed
  newest-50 stream-item tail followed by client projection/correlation.
- **D — cardinality limit before the final visible Activity projection:
  CONFIRMED.** The cap is before client parent/session projection, and tool
  lifecycle rows consume capacity.
- **E — projection/correlation boundary: CONTRIBUTING, not independently a
  defect.** Correlation behaves as coded, but its required parent must be in
  the bounded snapshot.
- **F — client replacement: CONTRIBUTING to the observed collapse only when a
  snapshot/resync path is entered; not a defect by itself.** Snapshot hydration
  intentionally replaces the held stream.
- **G — filtering: DOWNSTREAM/CONTRIBUTING to displayed counts, not the root
  cause.** The latest `All (7)` versus `Operational (5)` is explained by
  presentation filtering after recovery.
- **A, B, H: DISPROVEN for the current evidence** as primary explanations.
  No sequence gap, persistence overwrite, catch-up-only loss, or old-repository
  configuration was found.

The repair contract proposed by the earlier audit is directionally correct,
but implementation requires an explicit ownership decision for projectable
parent selection and correlated-operation attachment. Merely increasing the
raw slice is not a safe semantic repair.

## 2. Independent call graph

### Server initialization and reconstruction

`apps/api/src/index.ts` calls `initM11AActivityRoom(repoPath)`. The initializer
constructs the path `<repoPath>/.vestara/m9-activity.db`, opens
`DurableActivityStore`, creates `ProjectionRuntime`, reads
`store.rebuild()`, and calls `runtime.rebuild(records)`
(`apps/api/src/routes/activity-room-m11a.ts:137-171`). The native store is
exported as `DurableActivityStore` from
`packages/activity-room/src/index.ts`; its normal `rebuild` reads durable M9
records in sequence order.

The runtime processes each record in order, updates the authoritative cursor,
creates one M10 `StreamItem`, and trims only when the in-memory stream exceeds
500 (`packages/activity-room/src/m10-projection-runtime.ts:48-95`). This is a
server-side projection/reconstruction stage, not the snapshot's 50-item
selection.

### Initial and resync snapshot

```text
M9 m9_activity_events
  → DurableActivityStore.rebuild()
  → ProjectionRuntime.rebuild(records)
  → ProjectionRuntime.getRawStream() : StreamItem[]
  → sanitizeStreamItem
  → .slice(-50)                         [server snapshot boundary]
  → GET /api/activity-room/v1/snapshot
  → fetchM11ASnapshot()
  → streamItemFromSnapshot()
  → setStream(items)                    [client replacement]
  → deriveCorrelatedSessions(stream)
  → eligibility / density / preset / category / search filters
  → render and virtualized render window
```

The route returns the independent projection cursor from `projection.room`
alongside the bounded stream (`activity-room-m11a.ts:842-857`). The cursor is
therefore not the last returned stream item; it is the projection frontier.

### Live and reconnect path

The M11A watcher polls the durable store for records after its last sequence,
processes each through the same M10 runtime, updates `lastProjection`, and
broadcasts a projection record (`activity-room-m11a.ts:202-205` and the
watcher body). M11B subscribe/catch-up replays records after the client's
sequence cursor. The client merges those live items rather than replacing its
held stream (`apps/workspace/src/lib/m11b-client.ts:93-104,180-234` and
`useM11CActivityRoom.ts:700-730`).

The explicit `resync-required` handler refetches the bounded snapshot and
replaces client stream state (`useM11CActivityRoom.ts:925-951`). Initial hook
mount does the same (`:962-980`).

## 3. Cardinality/limit inventory

| Location | Limit | What it counts | Layer | Finding |
| --- | ---: | --- | --- | --- |
| `ProjectionRuntime` | 500 | M10 `StreamItem`s retained in memory | server reconstruction/live runtime | upstream working-set bound, not the snapshot's 50 |
| M11A snapshot | 50 | newest M10 raw `StreamItem`s | server transport snapshot | operative snapshot cap |
| `/activities` history query | default 50, max 100 | persisted M9 records | server historical API | separate from snapshot; query uses cursor semantics |
| Load Older History | 50 | persisted M9 records before oldest held sequence | client request/history path | prepends and dedupes; AR-HISTORY-002 ordering preserved |
| M11B catch-up | transport-bounded replay path | records after sequence cursor | realtime transport | not the snapshot cap |
| client working set | 500 | client-held stream items | client state | drops oldest only above its working-set bound |
| client render window | 100 plus older-loaded allowance | already filtered items rendered by virtualizer | UI presentation | not the cause of 1/4/7 recovered-record states |

The 50 snapshot expression is `getRawStream().map(...).slice(-50)` and is
therefore after M10 `recordToStreamItem`, but before client
`deriveCorrelatedSessions`, structural tool exclusion, density, and filters.
There is no SQL `LIMIT 50` in this initial snapshot path.

## 4. Projection and operation-correlation findings

`ProjectionRuntime.recordToStreamItem` creates tool-call and tool-result
stream items with tool name, callID, status, and lineage metadata. It does not
collapse a called/succeeded pair in M10. `getRawStream()` returns the retained
per-record stream before muted aggregation (`m10-projection-runtime.ts:101-132`).

The client correlation implementation in
`apps/workspace/src/pages/activity/correlated-session.ts:45-124`:

1. finds non-tool parent candidates by execution, session, or conversation
   lineage;
2. requires a canonical tool `callID`, a shared lineage key, and an in-window
   non-tool parent;
3. keys operations by callID, so called/succeeded rows collapse into one
   operation with the later status and both activity IDs;
4. hides correlated tool lifecycle rows and attaches a session to the selected
   parent.

Consequences independently established:

- A called/succeeded pair occupies two of the 50 server snapshot positions,
  although it becomes one displayed operation.
- Tool rows do not consume a separate displayed parent slot, but they do
  consume the bounded stream-item positions.
- If the parent is outside the snapshot, the tools fail the required-parent
  condition and are not attached to that parent. They remain stream evidence
  subject to the later structural tool-row exclusion.
- The grouping algorithm itself is deterministic and fail-closed; no evidence
  shows that it incorrectly merges different lineage keys.

## 5. Persisted-data census

Read-only inspection of `/home/user/projects/vestara-ai-core/.vestara/m9-activity.db`
on 2026-09-26 found:

- SQLite journal mode `wal`.
- `PRAGMA integrity_check` = `ok`.
- `PRAGMA foreign_key_check` returned no rows.
- `m9_activity_events` sequence range 1–11610, count 11610.
- No sequence gaps in the complete ordered sequence scan.
- The inspected rows include the historical incident anchors: sequence 11565
  `agent.completed`, 11566 `human.message`, 11567 `agent.started`, sequence
  11594 `agent.completed`, sequence 11607 `agent.completed`, and later records
  through 11610.

For bounded range 11510–11610, the database contained 101 rows when the
frontier was 11610: 92 tool lifecycle rows (including two failures) and 9
non-tool rows. The range contained 45 `tool.called`, 45
`tool.succeeded`, 2 `tool.failed`, 3 `agent.completed`, 3 `human.message`,
and 3 `agent.started` rows. There were 47 distinct callIDs in that 101-row
bounded range, with 45 callIDs having both a called row and a succeeded/failed
result.

These counts demonstrate that the observed sequence neighborhood is
operation-heavy and can fill a 50-item stream tail. They do not reconstruct
the exact historical 50-item snapshot window at each screenshot, because the
database advanced afterward. The supplied 1/4/7 screenshots are therefore
dogfood evidence of outcomes, not replayable exact-window proofs.

## 6. Snapshot versus history

| Concern | Initial/resync snapshot | Load Older History |
| --- | --- | --- |
| source | M10 in-memory `StreamItem[]` | M9 durable query |
| selection | newest 50 stream items | latest page below `beforeSequence` |
| ordering | ascending stream order after tail selection | AR-HISTORY-002 selects backward then returns ascending |
| client state | replaces stream | prepends unique items, sorts by sequence, caps working set |
| cursor | independent current projection frontier | oldest held item becomes next backward cursor |
| correlation | after snapshot hydration | same client correlation after merge |

This semantic difference explains why Load Older History can repopulate many
records without changing the current frontier: it adds durable historical
rows below the held minimum; it does not alter the snapshot cursor.

AR-HISTORY-002 is not implicated as a defect by this review. Its source path
and current use of `beforeSequence` remain compatible with the observed
behavior.

## 7. Reload/reconnect analysis

### Browser page reload or component mount

The hook fetches the HTTP snapshot, replaces room and stream state, then
connects M11B from the snapshot cursor. This is the direct path that can
produce a smaller visible set after a deliberate browser reload.

### API restart while the browser remains open

The API process loses its in-memory runtime and M11B connections, then rebuilds
M10 from durable M9. The browser's React state is not intrinsically replaced by
the server restart. The client's WebSocket reconnects and subscribes from its
last sequence; ordinary forward catch-up merges new records. A snapshot
replacement occurs only if the client is remounted or receives a
`resync-required` path. The historical observation “after API restart” alone
does not prove which of those paths occurred.

### M11B resync

The transport can send `resync-required` when its bounded delivery state cannot
continue safely. The hook then refetches the same 50-item snapshot and replaces
the stream. This is a distinct replacement path from ordinary catch-up.

## 8. Filter-count analysis

The UI computes filter counts from recovered `items` after structural
tool-lifecycle exclusion. `All` counts the scoped list-eligible items;
`Operational` counts those whose kind passes `matchesDensityKind(...,
'operational')` (`M11CActivityStream.tsx:300-345, 627-684`). The component
also reports density-hidden counts as presentation-only; it explicitly keeps
those records recovered.

Therefore the supplied `All (7)`, `Operational (5)`, and “2 activities hidden
by Operational view” are a downstream filter/density result. It is not evidence
that only five records were recovered, and it is not the underlying snapshot
cardinality mechanism. It can coexist with a bounded snapshot and can obscure
two of the seven list-eligible records without changing the authoritative
cursor.

## 9. Persistence/data-loss analysis

The current read-only census found no integrity failure, foreign-key failure,
sequence gap, retention truncation, or overwrite signal in the M9 database.
The inspected historical anchor rows remain present. The store opens the M9
database from the repository path and the M10 rebuild consumes the durable
records (`activity-room-m11a.ts:137-171`).

Classification: persistence/data loss is **DISPROVEN as the current primary
cause**. A historical record could theoretically have been absent before this
census, but no source/runtime/data evidence supplied here demonstrates such a
loss. The variable 1/4/7 states are explained by bounded snapshot composition
plus downstream projection/filtering without invoking deletion.

## 10. OpenCode repository verification

The systemd service is configured with:

- `ExecStart=/usr/bin/node apps/api/dist/index.js`
- `WorkingDirectory=/home/user/projects/vestara-ai-core`
- `Environment=VESTARA_API_PORT=3001`

`createWorkspaceContext` canonicalizes its incoming `repoPath` with
`path.resolve(repoPath)` (`apps/api/src/workspace-context.ts:448-455`). The
assistant OpenCode executor receives `directory: abs`, explicitly documented
as the repository root and not `.vestara` (`workspace-context.ts:910-914`).
The repository's `opencode.json` contains model/instruction/permission
configuration but no alternate repository directory. No source or service
evidence supports an old-repository pointer as a contributor to the Activity
Room reconstruction symptom.

Finding: **H — OpenCode/repository configuration DISPROVEN** for this symptom.

## 11. Comparison with `AR-SNAPSHOT-001.md`

### Agreements

- The newest bounded snapshot tail is the operative trigger.
- Tool lifecycle rows consume bounded capacity before they are hidden or
  attached to parent Activity presentation.
- Parent/tool correlation is based on exact lineage and callID evidence.
- The durable sequence frontier is independent of the number of visible rows.
- Load Older History is a separate backward-pagination path and should be
  preserved.
- Persistence loss, ordinary catch-up, filter semantics, and repository path
  are not supported as primary explanations.
- A safe repair must operate at the projectable Activity-entity boundary, not
  merely increase a raw limit.

### Disagreements or corrections

- The earlier audit calls `.slice(-50)` a raw M9 observation limit before
  projection. Source shows it slices `StreamItem[]` returned by M10
  `getRawStream()` after M10 record projection and before client correlation.
  The *semantic* conclusion is similar, but the ownership/layer statement is
  too strong and must be corrected before implementation.
- The earlier audit describes grouping as exclusively after the raw limit;
  this is true of client correlation, but M10 has already performed its own
  record-to-stream projection and its 500-item backpressure before the 50-item
  route slice.
- The earlier classification of D remains valid only when defined as “limit
  before final projectable Activity/entity presentation,” not literally “raw
  M9 rows before projection.”

### Unsupported or not independently recoverable

- The exact historical 50-item composition and exact 25-operation arithmetic
  cannot be reconstructed from the present database because the frontier
  advanced. Current census data corroborates operation-heavy composition but
  is not the original window.
- The exact trigger distinguishing the historical API-restart incident from a
  page remount or M11B resync is not recoverable from source alone.

### Missed condition / additional risk

The repair must account for the two distinct bounded layers: M10's 500-item
working set and M11A's 50-item snapshot. A server-side selection design that
only changes the M11A slice cannot recover a parent that M10 already trimmed
out after a long enough history. This is a bounded-working-set risk, not proof
that it is currently responsible for the reported 1/4/7 cases.

## 12. Root-cause classification

| Classification | Status | Evidence-based interpretation |
| --- | --- | --- |
| A persistence/data loss | DISPROVEN as primary | healthy, gap-free current M9 census; anchors present |
| B stream catch-up | DISPROVEN as primary | ordinary reconnect catch-up merges; snapshot replacement is separate |
| C snapshot query/selection semantics | CONFIRMED | fixed newest-50 M10 stream-item tail with independent frontier |
| D limit before final projectable Activity cardinality | CONFIRMED | tool items consume slots before client parent/session projection |
| E projection/grouping defect | CONTRIBUTING boundary | parent-outside-window causes fail-closed non-attachment; grouping itself is correct |
| F client merge/replacement defect | CONTRIBUTING path, not defect | snapshot/resync intentionally calls `setStream`, catch-up merges |
| G filtering/render semantics | CONTRIBUTING display-only | explains All/Operational divergence, not recovery loss |
| H OpenCode/repository configuration | DISPROVEN | service and adapter use current repository root |
| I combination | CONFIRMED | C + D, with E/F/G explaining visible-count variation |
| J other | UNKNOWN | no additional cause established |

## 13. Repair-boundary assessment

The proposed contract is **architecturally supported in direction but
incomplete in ownership**:

```text
select newest N projectable Activity entities
→ attach all bounded correlated operations to those entities
→ operations consume zero entity slots
→ preserve frontier independently
→ return canonical ascending order
```

It is not safe to implement this as a larger `.slice()` or as client-only
guesswork. The implementation must answer which layer owns “projectable
Activity entity” selection:

- M10 currently owns durable-record-to-stream-item projection and a 500-item
  working set.
- M11A owns the HTTP snapshot boundary and currently exposes a tail of raw
  M10 stream items.
- M11C owns correlation and display filtering.

A safe AR-SNAPSHOT-002 design therefore needs either a bounded server-side
snapshot projector with authoritative parent/tool lineage, or a deliberately
specified transport contract that carries enough parent context to make the
client projection complete. It must also define behavior when a parent is
outside the M10 500-item working set. No destructive persistence change is
required by this audit.

## 14. Regression-test requirements

Use deterministic in-memory/fake-store fixtures; do not target live
`.vestara` state. Required cases:

1. operation-heavy newest window: many called/succeeded pairs plus several
   projectable parents;
2. multiple parents with distinct conversation/session/execution lineage;
3. called/succeeded pairing by callID, including failed and retried calls;
4. parent just inside and just outside the snapshot-selection boundary;
5. canonical ascending sequence order in the returned snapshot;
6. frontier equals authoritative latest sequence, independently of returned
   entity count;
7. Load Older History remains compatible with the chosen snapshot boundary;
8. AR-HISTORY-002 backward pagination remains unchanged and returns the
   immediately preceding page in ascending order;
9. filtering/density changes displayed counts only and never changes the
   authoritative snapshot frontier or recovered semantics;
10. M10 500-item working-set behavior is tested separately from the M11A
    snapshot bound so the two caps cannot be conflated;
11. snapshot replacement followed by M11B catch-up does not duplicate items;
12. snapshot selection is deterministic across rebuilds.

The negative control should show that the current raw stream-tail contract
loses projectable parent coverage when tool volume fills the newest 50 slots.

## 15. Unknowns and evidence limitations

- The exact client path that produced each historical screenshot is not
  persisted as a causal event. Source proves mount and resync replacement
  paths, but not which one fired.
- The exact historical 50-item set for the “25 operations” case is not
  recoverable after later writes.
- The supplied screenshot artifacts were treated as operator evidence; this
  audit did not refresh the browser or alter browser state.
- Current source confirms M10 stream items are record-derived one-for-one
  before the snapshot slice, but a future change could alter that invariant;
  regression tests must assert it at the selected ownership boundary.

## 16. Recommendation for AR-SNAPSHOT-002

AR-SNAPSHOT-002 is sufficiently specified to begin design, but not yet safe
to implement from the earlier wording alone. Its acceptance contract should
first be amended to say “newest N projectable Activity entities” and identify
the owner of parent selection/correlation across both the M10 500-item bound
and the M11A 50-item transport bound.

Recommended bounded next step:

1. define the authoritative snapshot projection contract and ownership;
2. add the deterministic tests in §14, including parent-outside-boundary and
   AR-HISTORY-002 preservation;
3. implement only that boundary;
4. separately preserve the existing Activity UI filter semantics and frontier
   reporting.

Do not increase the raw snapshot limit as the repair.

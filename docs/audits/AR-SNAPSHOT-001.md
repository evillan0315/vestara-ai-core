# AR-SNAPSHOT-001 — Initial Activity Snapshot / Projection Cardinality Audit

Status: AUDIT ONLY. Zero production mutation. No source, test, database,
service, browser, OpenCode, or identity state modified. No restarts, no
refresh, no staging/commits/pushes. Read-only inspection only (source,
read-only SQLite queries, read-only live `GET`s, read-only
`systemctl show`/`/proc` reads). The valuable dogfood browser state was
preserved. AR-HISTORY-002 was not modified.

Auditor: Vestara Assistant. Date: 2026-09-25/26 (UTC).

---

## 1. Executive verdict

The working hypothesis is **PROVEN**: the initial/reconnect snapshot applies
its record limit to raw persisted observations BEFORE projection/grouping, so
an operation-heavy newest window collapses to one (or few) visible Activity
records. Concretely: snapshot = last ≤50 **raw** M9-derived stream items;
~48 of those 50 were `tool.called`/`tool.succeeded` rows of a single
Conversation Runtime execution sharing one `conversationId` lineage key, which
`deriveCorrelatedSessions` correctly folded into the single in-window parent
(`agent.completed` "Conversation Runtime / Completed" @ seq 11565) — hence
"1 record · 25 operations" (25 ≈ distinct callIDs in that exact 50-window;
30 callIDs in the adjacent 60-window census).

Classification: **D (raw-row limit before projection) as the root cause**,
with C (snapshot query semantics) as its enabling contract. No data loss (A
disproven), no stream catch-up defect (B disproven), no projection/grouping
defect (E disproven — grouping behaved exactly to contract), no client
merge/replacement defect beyond intended snapshot-replace semantics (F
disproven as defect), no filter defect (G disproven), no repository
misconfiguration (H disproven).

## 2. Reproduction evidence

- Post-restart browser state (operator-observed, preserved): 1 visible record,
  header seq 11565, "Load Older History" available; after loading: ~113
  records, seq unchanged at 11565, recent ACTOR-IDENTITY history correctly
  shown, no Sep-14 jump (AR-HISTORY-002 verified working in production).
- Read-only census of the durable window seq 11510–11569 (60 rows): 57 tool
  rows (29 `tool.called`, 28 `tool.succeeded`), 30 distinct callIDs, zero
  null-callID rows, plus exactly 3 non-tool rows — of which only ONE lies at
  or below the frontier-relevant edge: seq 11565 `agent.completed`
  ("Conversation Runtime / Completed", actor `conversation-runtime`).
  (11566+ are post-incident rows from this very audit session.)
- Live snapshot endpoint (read-only GET during this audit) returns exactly 50
  raw stream items with cursor at the live frontier — endpoint contract sound,
  window composition operation-heavy by construction when executions are active.
- Lineage join proven at data level: tool rows carry
  `payload.data.conversationId = conv-1790338870578-10` (plus
  `runtimeSessionBindingId = ses_f277…`); parent 11565 carries the same
  `data.conversationId`; client `extractM9OriginProvenance` lifts both to
  `originConversationId`, yielding the shared `conversation:…` lineage key
  that `deriveCorrelatedSessions` groups on (see §7).

## 3. Persistence census / bounded recent-row evidence

- Live DB `.vestara/m9-activity.db`: gap-free contiguous sequences 1–11569+
  (verified `COUNT == MAX-MIN+1` twice during audit; frontier advanced under
  live write load, as expected — auditor issued no writes).
- Last-60 type distribution: tool.called 29, tool.succeeded 28,
  agent.completed 1, human.message 1, agent.started 1. The newest
  snapshot-sized range IS dominated by tool/operation observations, as
  hypothesized — counts, not assumptions.
- All Sep-25 anchors from AR-HISTORY-001 remain persisted; recent records
  around the 11565 frontier intact. **No data loss.**

## 4. Initial snapshot call graph

```text
M11CActivityRoomPage mount (or resync/retry)
→ fetchM11ASnapshot() : GET /api/activity-room/v1/snapshot   (m11a-api.ts:197)
→ route (activity-room-m11a.ts:833): optional rebuild-if-stale
→ room.runtime.getRawStream()            // M10 in-memory StreamItem[], one per
→   .map(sanitizeStreamItem)             //   processed M9 record (1:1, no drops)
→   .slice(-50)                          // ← HARDCODED raw-row limit (line 852)
→ cursor: projection.room.cursor (= last processed seq)
→ client: setStream(snapshot.stream.map(streamItemFromSnapshot))  // REPLACE
→ deriveCorrelatedSessions → eligibility/density/window → render
→ client.connect(cursor.sequenceNumber)  // WS subscribe + forward catch-up
```

- Store method: **none** — the snapshot does not query persistence; it slices
  the M10 runtime's in-memory raw stream (itself rebuilt from `store.rebuild()`
  at API boot, capped at `MAX_STREAM_ITEMS = 500`, m10-projection-runtime.ts:32).
- Ordering: stream (sequence-ascending) tail. Limit: hardcoded `.slice(-50)`,
  no parameter, no constant (client-side `SNAPSHOT_LIMIT = 50` is unused by
  this endpoint).
- Representation: **raw persisted-row-derived items** (one StreamItem per M9
  record, including every tool observation), NOT projected/grouped records.
  Grouping happens exclusively client-side afterwards.

## 5. Snapshot vs history pipeline comparison

| Stage | Snapshot (initial/reconnect) | History ("Load Older History") |
|---|---|---|
| Source | M10 in-memory raw stream | M9 durable store `query()` |
| Ordering | stream order (seq ASC), tail taken | seq ASC (post-AR-HISTORY-002: DESC-select, ASC-return) |
| Limit applies to | **raw observations** (`.slice(-50)`) | persisted rows in contiguous window (50) |
| Projection | after limit, client-side (`deriveCorrelatedSessions`) | after limit, same client function |
| Merge | **REPLACE** (`setStream`) | prepend + sort + id-dedup (preserves held window) |
| Cursor use | returns frontier cursor for WS subscribe | `beforeSequence` = oldest held seq |
| Net record-count semantic | ≤50 raw rows → **≤50, often far fewer, visible records** | 50 contiguous rows merged into held window |

Every semantic difference is identified; the two pipelines share only the
downstream grouping function. AR-HISTORY-002 (history column) is intact and
must not be touched by any follow-up.

## 6. Limit/cardinality analysis

- Every relevant cap located: server `.slice(-50)` (the operative one);
  `MAX_STREAM_ITEMS = 500` (runtime stream bound — determines the pool the 50
  are drawn from, not the snapshot size); client `SNAPSHOT_LIMIT = 50`
  (defined, unused by endpoint); `RENDER_WINDOW = 100` (display window, not
  contributory at these counts).
- **Projection happens AFTER the limiting operation** (proven: limit is a
  server-side slice of raw items; grouping is client-side in
  `correlated-session.ts`). Raw Observation Count (50) ≠ Projected Activity
  Record Count (1) ≠ Operation Count (25) — the hypothesized inequality holds
  exactly.
- Capacity consumption: each `tool.called`/`tool.succeeded` row consumes one
  of the 50 snapshot slots individually, including called+succeeded pairs
  sharing a callID (≈2 rows per operation). An execution emitting ≥50 tool
  rows in the newest window can therefore squeeze ALL non-tool activity out
  of the snapshot entirely (parent-outside-window case → tool rows survive
  only as eligibility-excluded, drill-down-only evidence).

## 7. 25-operation correlation analysis

- Parent identity: seq 11565 `agent.completed`, actor `conversation-runtime`,
  `data.conversationId = conv-1790338870578-10` ("Conversation Runtime /
  Completed" — the single visible record).
- Grouping key: `conversation:conv-1790338870578-10`, matched between parent
  (via `data.conversationId` → `originConversationId`) and each tool row (same
  field). `deriveCorrelatedSessions` requires: tool kind + canonical callID +
  shared lineage key + in-window non-tool parent — all satisfied; tool rows
  hidden (`hiddenIds`), operations keyed by callID (called+succeeded pairs
  merge to one operation with latest status), session attached to the parent
  only (`parents.get(key)?.id === item.id`).
- 25 vs 30 callIDs: the incident's exact 50-window is unrecoverable
  post-hoc (frontier advanced), but 25 operations from ~48–50 tool rows in a
  50-slot window is arithmetically exact for paired called/succeeded rows;
  the adjacent census (30 callIDs / 57 tool rows / 60 slots) corroborates the
  mechanism. Parent-inside-window is proven (11565 within any trailing-50
  window ending ≥11565); parent synthesis was NOT required and did not occur.
- Verdict: operation-heavy windows deterministically reduce visible Activity
  cardinality, by contract — grouping is correct, the window is wrong-sized
  for its semantic layer.

## 8. Reconnect behavior

- Browser state survives API restart (React state untouched); server state
  (hub connections, M10 runtime, cursors) resets; on boot the runtime rebuilds
  from full durable history (11k+ rows → 500-capped stream).
- Two distinct reconnect mechanisms proven in source:
  (a) **WS resubscribe + forward catch-up** (`m11b-client.ts:93-104,177-195`;
  server `activity-room-m11b.ts:299-458`: attach at frontier, replay
  `store.query({after, limit:1000})` through ordering connection) — MERGES via
  `handleLiveActivity → mergeStream`, preserves held state;
  (b) **snapshot refetch + REPLACE** (hook mount effect; `offResync` handler
  lines 925-952; `retry()`) — `setStream(items)` discards held state.
- The observed collapse (184 → 1) requires path (b): a snapshot-shaped
  replacement (page/component remount fetches `/v1/snapshot`; resync path does
  the same on `resync-required`). Which of mount vs resync fired cannot be
  determined post-hoc from available evidence — marked UNKNOWN with both
  replace-paths cited; the WS catch-up path is proven merge-preserving and is
  exonerated.
- Header seq correctness alongside collapse is expected: `latestSequence` is
  re-seeded from the snapshot frontier cursor (max-only), independent of how
  few rows the window holds.

## 9. OpenCode repository-path finding

Hypothesis (stale OpenCode repo pointer) **DISPROVEN as a participant**:
`systemctl show vestara-api.service` → `WorkingDirectory=
/home/user/projects/vestara-ai-core`; `/proc/<MainPID>/cwd` → same path;
adapters receive this `abs` as their working directory. The symptom is fully
explained by snapshot cardinality (§6–7) with zero residual requiring a
configuration cause. (No OpenCode configuration was read beyond what was
needed, and nothing was modified.)

## 10. Root-cause classification

- **D — raw-row limit before projection: PROVEN, root cause.** The 50-slot
  limit sits at the raw-observation layer while visible cardinality is
  determined one layer up by grouping.
- **C — snapshot query semantics: PROVEN contributor** (newest-50-raw is the
  wrong contract for a projection-consumed snapshot; retained as secondary
  classification only).
- Disproven with evidence: A (gap-free census + anchors), B (catch-up path
  merges correctly; collapse requires snapshot-replace), E (grouping exactly
  per contract), F (replace-on-snapshot is intended; merge path sound), G
  (filters are downstream display; gap-independent), H (§9).

## 11. Minimum repair boundary (NOT implemented)

Smallest safe follow-up preserving all stated constraints: move the snapshot
limit from the raw-observation layer to the projected-activity layer —
i.e. the snapshot endpoint (or a bounded server-side projection step it
calls) must select the newest N **projectable Activity entities with their
correlated operations attached** (operations travel with parents, consuming
zero entity slots), still returned in canonical ascending order with the
frontier cursor, rather than slicing N raw rows. Explicitly NOT an
arbitrary LIMIT increase (a larger raw slice only moves the cliff). Untouched:
AR-HISTORY-002 backward pagination, rendered chronology, cursor exclusivity,
operation correlation keys, persistence, stream catch-up, projection
authority boundaries (grouping stays client-side unless the chosen design
deliberately relocates a bounded, tested selection step server-side).

## 12. Regression-test design

Deterministic fixture (no live state): seed M9 store with (a) ~10 normal
activity/message records, (b) one recent execution emitting 60 paired tool
rows (30 callIDs) sharing one conversation lineage with a trailing
`agent.completed` parent, (c) 5 older recent activity records below the
execution. Assert against the snapshot-selection function: returned set
contains ALL of (a), the parent with exactly 30 correlated operations, and
all of (c) — i.e. entity count is independent of raw tool-row volume;
assert ascending order, cursor = max seq, and idempotence across rebuilds.
Negative control: raw-slice selection on the same fixture must demonstrably
drop (a)/(c) (locks in why the old layer is wrong). AR-HISTORY-002
protection: keep `m9-backward-pagination.test.ts` untouched and green; add an
integration assertion that snapshot-window + one `beforeSequence` history page
union without gap against the same fixture.

## 13. Explicit non-findings / hypotheses disproven

- No persistence gap; no retention/compaction involvement (`retainNewest`
  unwired in production).
- No projection/grouping bug; "25 operations" is arithmetically correct.
- No client merge/dedup bug; no filter/render bug.
- No OpenCode repository misconfiguration contribution.
- The exact remount-vs-resync trigger for this incident's snapshot refetch:
  UNKNOWN (both replace-paths proven in source; WS catch-up proven
  merge-preserving).
- Exact 50-row composition of the incident window: unrecoverable post-hoc
  (frontier advanced); mechanism proven via adjacent census + live endpoint.

## 14. Recommended next milestone

**AR-SNAPSHOT-002 — Activity Snapshot Projection Cardinality Repair**:
implement §11 (entity-layer snapshot selection), ship §12 regression
(including the negative control and AR-HISTORY-002 coexistence assertion),
and add a stream-header honesty element separating *recovered* count from
*visible* count so a projection-collapsed window can never again read as
missing history. No architecture change required; no other pipeline touched.

---

## Appendix A — Post-reload dogfood evidence (4 records · seq 11594)

Artifact: `assets/screenshots/activity-screen-4-records.png` (note: on-disk
filename is `activity-screen-4-records.png`; the evidence reference supplied
with this dogfood report used the `activity-room-4-records.png` variant).

Capture conditions: deliberate browser reload (cold reconstruction, not an API
restart). Header reads "4 records · seq 11594 · updated just now"; tabs read
All (4) / Operational (3); density Raw; "LOAD OLDER HISTORY" immediately
available. Visible projected records, top to bottom:

1. Conversation Runtime — WORK / Completed (≈1h ago).
2. workspace-ui COMPLETED — MESSAGE "Continue Vestara — AR-SNAPSHOT-001 …"
   with "Activity · 24 operations", ✓ Completed (≈1h ago).
3. Conversation Runtime — LOG / "Started work
   (muse-spark-1.3-contributor-free)" (≈1h ago).
4. Conversation Runtime — WORK / Completed (≈59m ago).

Interpretation (consistent with, and strengthening, the §1 verdict without
altering the classification): the defect is not specifically "1 record after
restart" — the observable symptom is **variable initial projected cardinality
from a fixed raw-observation snapshot window**. Same 50-raw-row contract as
the 1-record case, but a different window composition (fewer tool rows of a
single lineage, more surviving non-tool parents) yields 4 visible records
instead of 1, including a second operation group ("Activity · 24 operations"
attached to the AR-SNAPSHOT-001 audit message's own execution). Cardinality
varies with window composition; the mechanism (limit-before-projection, §6)
is invariant. No source-level proof is contradicted; no new classification is
warranted. Root cause remains D (raw-row limit before projection) with C
(snapshot query semantics) as enabling contract.

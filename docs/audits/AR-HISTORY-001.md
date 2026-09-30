# AR-HISTORY-001 — Activity History Continuity & Pagination Audit

Status: AUDIT ONLY. Zero production mutation. No behavior, persistence,
pagination, retention, stream, projection, or reconstruction code modified. No
service restart, no browser refresh, no live state mutated, nothing staged,
committed, or pushed. Read-only inspection only (source + read-only SQLite
queries + read-only live `GET`s against the running API).

Auditor: Vestara Assistant. Date: 2026-09-25 (UTC).

---

## 1. Executive summary

The ~11-day discontinuity (recent → ~2h ago → Sep 14) is caused by a single
server-side pagination defect, not by data loss, retention, filtering,
ordering, or client merge. The authoritative store holds the complete,
gap-free, contiguous history (11,487 rows, sequences 1–11487 at audit time;
all Sep 25 anchors verified persisted). But the backward-history query sorts
`ORDER BY sequence_number ASC` with `LIMIT 50`, so a "give me records older
than cursor X" request returns the 50 *oldest* records ever (Sep 14, seq 1–50)
instead of the 50 records immediately preceding X. Reproduced live against the
running API: `GET /v1/activities?beforeSequence=11460&limit=50` → seq 1–50.

Classification: **D (pagination/cursor defect), server-side, single root
cause** with presentation-layer factors explaining the exact displayed counts
(22 / 78 / Operational 50). No confirmed data loss. Client merge/dedup,
filters, ordering, and reconstruction windowing are all exonerated as causes
of the gap (details below).

---

## 2. Observed incident timeline

- Warm state: ~184 visible records, header `seq ~11010`, high browser/system
  memory pressure, operation counts accumulating across runtime activity.
- Accidental navigation away + return (cold reconstruction): 22 records,
  `seq ~11413`; recent messages/executions and operation groups reconstructed
  with correct cardinality ("Activity · 14 operations" = 14 visible ops).
- "Load older history": 78 records (Operational 50), `seq ~11419`; recent
  records minutes–~2h old, then a jump to Sep 14 (current date Sep 25).

## 3. Canonical Activity history ownership

- Owner: M9 durable store. API composition (`initM11AActivityRoom`,
  `apps/api/src/routes/activity-room-m11a.ts:137`) opens
  `DurableActivityStore` (= `NativeSqliteActivityStore`,
  `packages/activity-room/src/index.ts:62`) on `<repo>/.vestara/m9-activity.db`
  (live file: 9.4 MB, modified continuously during audit — live system).
- Record identity: `activity_id` PK (`act-<seq>-<eventprefix>`); idempotency on
  `event_id` UNIQUE (`m9-sqlite-store.ts:66-100`, same semantics native).
- Sequence identity: `sequence_number INTEGER`, allocated `MAX+1`, strictly
  increasing and gap-free (proven: `COUNT(*) = MAX-MIN+1 = 11487`).
- Timestamps: ISO-8601 strings at event time; secondary ordering key
  (`sequence.ts`: "Sequence order is the primary ordering key; timestamps are
  secondary").
- Ordering semantics: canonical order is `sequence_number ASC` in every query
  (`query`, `getAfter`, `replay`, `rebuild`).
- Retention/compaction: `retainNewest()` exists on all store implementations
  but has **zero production callers** (only `__tests__`). No scheduled
  compaction, no TTL, no deletion path in the API. Retention is effectively
  infinite; class B excluded by code evidence.
- Activity Room records ARE authoritative persisted facts (M9), not projections.
  M10 `ProjectionRuntime` is a documented pure function of ordered M9 records
  ("Reconstructable: given the same ordered M9 records, rebuilding produces
  equivalent state", `m10-projection-runtime.ts:5`).

Distinctions: event sequence (M9 `sequence_number`, gap-free) ≠ persistence
identity (`activity_id`/`event_id`) ≠ timestamp (ISO string) ≠ history cursor
(`beforeSequence` request param) ≠ live-stream cursor (WS `afterSequence`
subscription + `latestSequence` header) ≠ UI record count (post-eligibility /
density / window rendering).

## 4. Sequence/cursor semantics (the displayed `seq`)

- Header `seq` = hook state `latestSequence`
  (`useM11CActivityRoom.ts:539`), set from exactly two sources: (a) snapshot
  `cursor.sequenceNumber` (M10 `room.cursor` = sequence of last processed
  record = latest persisted seq at snapshot time), and (b) live arrivals via
  `updateSequence`, which is **max-only** (`605-610`).
- It is therefore a **live-stream/projection frontier cursor, not a history
  cursor**. History loads never touch it (`loadOlder` has no `updateSequence`
  call).
- 11413 → 11419: six live events arrived concurrently between snapshot and
  history load (consistent with a system appending ~1–6 seq/min during dogfood;
  DB max advanced 11456 → 11487 across this audit). No history-load path can
  raise it by construction.

## 5. Cold-reconstruction path (why 22 records)

Chain: browser mount → `fetchM11ASnapshot()` → `GET /v1/snapshot` →
`room.runtime.getRawStream().slice(-50)` (route line 852) → client
`streamItemFromSnapshot` (1:1 map, no drops) → `deriveCorrelatedSessions` →
eligibility/density/window rendering.

- The API returns the 50 most recent **raw** stream rows. The live snapshot
  taken during this audit returned exactly 50 items — the endpoint is sound.
- The "22" is the **rendered visible count, not the recovered count**:
  `applyStreamEligibility` removes all `tool-call`/`tool-result` rows from list
  projection (they survive only as correlated "· N operations" evidence), and
  default `operational` density additionally hides `log`/`telemetry`. Type census
  of the trailing window at audit time: the newest 50 persisted records are 26
  × `tool.called` + 24 × `tool.succeeded` — a window dominated by tool rows
  renders as a small visible number. The exact 22 cannot be replayed (window
  composition has since advanced), but the mechanism is proven and sufficient:
  22 = visible-after-projection, not recovered-from-persistence.
- The 22 are expected to be recoverable-adjacent, not the full history: the
  snapshot contract is "last ≤50 raw rows for hydration + live subscribe from
  cursor", i.e. reconstruction-window behavior (class H) **by design** for the
  initial paint; deep history is the job of pagination — which is where the
  actual defect lives (§6).

## 6. "Load older history" call graph (the defect)

```text
M11CActivityStream button "Load older history"
→ room.loadOlder() (useM11CActivityRoom.ts:704)
→ oldest = min(stream.sequence)
→ GET /api/activity-room/v1/activities?beforeSequence=<oldest>&limit=50
→ parseActivityQuery → { beforeSequence, limit: 50 } (route:303-356)
→ NativeSqliteActivityStore.query (m9-native-sqlite-store.ts:189-241):
    WHERE sequence_number < ? ORDER BY sequence_number ASC LIMIT 50
→ returns seq 1–50 (oldest ever) instead of [oldest-50, oldest)
→ client prepends + sorts + dedups by id (correct) → merged stream now spans
  [1..50] ∪ [snapshot window] with the entire middle absent
```

**Root cause (class D, server-side): backward pagination sorts the wrong
direction.** A correct "page before cursor" query is `WHERE seq < ? ORDER BY
seq DESC LIMIT n` (optionally re-sorted ASC for return). The in-memory
`m9-store.ts` sibling implements it correctly (`matches.slice(-limit)`,
`store.ts:75-79`), proving the intended semantics; both SQLite implementations
(`m9-sqlite-store.ts:159`, `m9-native-sqlite-store.ts:240`) share the ASC bug.
The API's `nextCursor` (last row of the wrong page) is additionally ignored by
the client, which recomputes `oldest` from stream state — so a second "load
older" sees `oldest <= 1` and sets `hasMoreHistory=false`: pagination
**terminates after covering only [snapshot] + [seq 1–50]**, leaving
seq 51–~11360 permanently unreachable from the UI.

Live reproduction (read-only GET, running API): `beforeSequence=11460&limit=50`
→ 50 records, seq 1 → 50, all `2026-09-14`, `nextCursor.sequenceNumber: 50`.
This single response shape fully explains the observed chronology.

## 7. Persistence evidence for known Sep 25 anchors (read-only)

All anchors **persisted** (YES). DB is gap-free contiguous 1–11487.

| Anchor | Persisted | Seq | Timestamp (UTC) | Selectable by history query? |
|---|---|---|---|---|
| SYSTEM-OPS-001 roadmap activity | YES (`human.message`) | 11374 | 2026-09-25T13:29:14 | YES if page covered it — never paged |
| ACTOR-IDENTITY-004R-BUILD-001 | YES | 11371, 11399 | 13:19/13:49 | same |
| ACTOR-IDENTITY-004R-BUILD-001A | YES | 11402 | 13:54:39 | same |
| Telegram "Who are you talking to right now?" | YES | 11405 | 14:14:38 | same |
| Canonical HumanPrincipal msg hp-524fd68846015a0b | YES | 11406 | 14:14:41 | same |
| "@reviewer Who are you…" Activity Room msg | YES | 11410 | 14:21:45 | same |

Per-day census confirms every date Sep 14 → Sep 25 present (Sep 25: 433 rows,
seq 11027–11459+). For each anchor: persisted YES; has sequence; WOULD be
selected by a correct contiguous page; is NOT returned by the defective query
(it returns seq 1–50); therefore never reaches client merge or rendering —
not a client, filter, or render loss at any downstream stage.

## 8. Ordering analysis

- Canonical order is `sequence_number` everywhere; per-day seq ranges are
  monotonic and aligned with calendar dates (Sep 14: 1–487 … Sep 25:
  11027+). No ASC/DESC inversion in storage, no timestamp/sequence
  disagreement at day granularity, no timezone anomaly (all UTC ISO).
- Page boundaries use sequence (`beforeSequence`), consistent with canonical
  order — the boundary *parameter* is correct; only the sort direction under
  `LIMIT` is wrong. No timestamp-based boundary is involved. Class E excluded.

## 9. Filter analysis

- `loadOlder` sends **no filter parameters** (`{ beforeSequence, limit }`
  only, hook line 714) — the server page is unfiltered. All/Operational/Needs
  Attention tabs, density modes, type filter, and search are **client-side only**
  (`filterStreamItems` pipeline: eligibility → scope → density → preset →
  category → search).
- The discontinuity exists in merged stream *data* (78 items spanning two
  disjoint seq ranges), before any filter applies — filters cannot explain it.
  "Operational 50" is the operational-density subset count of the 78 merged
  items (line 609 tab-count logic), a display subset, not a second query.
  Class F excluded as cause (presentation counts explained, gap unaffected).

## 10. Pagination/cardinality analysis

- Requested: snapshot ≤50 raw; history pages 50. Actual: snapshot 50 raw
  (rendered fewer after projection); history page 50 rows but the *wrong* 50.
- 22 → 78 (+56): 50 oldest rows merged + ~6 concurrent live arrivals (matches
  the 11413→11419 seq advance exactly). Dedup is by `id` (correct; no false
  merges — M9 ids are unique per record). No hidden-record loss in merge
  (prepend + full sort, `loadOlder` lines 716–730).
- Pagination terminates early **by design of the termination check against
  defective data**: second load computes `oldest = 1` → `hasMoreHistory=false`
  (line 707). Additional middle pages exist in persistence but are unreachable.
  Render window (`RENDER_WINDOW=100`, `rendered = filtered.slice(-(100 +
  olderLoaded))`) did not clip anything at these counts.

## 11. Warm-state vs cold-state comparison

- Warm ~184 = **live-accumulated working set** (snapshot seed + live batches
  merged with id-dedup, capped at `MAX_WORKING_SET=500`), i.e. session-local
  accumulation over the persisted frontier — never canonical full history
  (11k+ rows). Cold 22/78 = snapshot window + one defective page. Both are
  bounded views; neither ever represented the full durable log.
- Memory pressure: no evidence links it to history pagination. 184 stream items
  are small; candidate shared mechanisms that *could* affect both (documented,
  not concluded): `liveBufferRef` + `LIVE_BATCH_MS` flush batching, `freshIds`
  animation set (TTL-pruned at 5s), per-batch attention/participant endpoint
  refreshes, virtualizer overscan/measurement, and the 500-item working set
  with per-batch `pairRespondedChoices` copies. Root-cause sharing is
  **not claimed** — separate investigation required.
- Session-local vs canonical: live arrivals are canonical M9 rows broadcast
  after persist (service persist→broadcast pipeline), so warm accumulation
  converges toward the durable frontier while connected; cold reconstruction
  re-seeds from the same durable source. The sources agree; only the backward
  page query diverges.

## 12. Operation reconstruction supporting evidence

- "Activity · 14 operations" with exactly 14 visible ops after cold rebuild
  proves history reconstruction and live projection share the canonical M9
  payload source: history tool rows carry durable `payload.data`
  (toolName/callID) and `buildWireTool` recorrelates them (`streamItemFromLive`
  history branch, hook lines 457–478); list-eligibility excludes standalone
  tool rows while `deriveCorrelatedSessions` recorrelates them onto owners.
- Correct cardinality from a cold path is evidence that canonical
  tool-execution state is intact and projection is deterministic from durable
  facts. The previously observed warm-state count growth is a separate
  live-projection accumulation question, explicitly out of scope; the only
  shared mechanism noted is the client `mergeStream` path.

## 13. Root-cause classification

- **D. Pagination/cursor defect — CONFIRMED, sole cause of the discontinuity.**
  (`m9-native-sqlite-store.ts:240`, same bug `m9-sqlite-store.ts:159`.)
- A/B/C/E/F/G/H/I: investigated and **excluded** as causes (B: no prod
  retention callers; A: gap-free census + anchors; C: no filters server-side;
  E: order consistent; F: client-only display; G: merge/dedup verified correct;
  H: snapshot window is by design and returns the correct newest-50; I: no
  timestamp defect found).
- Contributing presentation factors (explain counts, not the gap): tool-row
  list exclusion + operational density (the 22), RENDER_WINDOW/tab counts
  (78 / Operational 50), max-only `latestSequence` header (11413→11419 via
  concurrent live events).

## 14. Blast radius

- Every consumer of `store.query({ beforeSequence, limit })` receives oldest-N
  instead of contiguous-N: Activity Room "Load older history" (all filters),
  any present/future client paging backward, and the unused `nextCursor`
  contract (points at seq 50, compounding confusion). Forward pagination
  (`after`/`getAfter`), snapshot, replay, rebuild, and live stream are
  unaffected. Seq 51–~11360 (≈11.3k records, Sep 14–25) are unreachable via
  backward paging until fixed; two "load older" clicks exhaust `hasMoreHistory`
  permanently for the session.

## 15. Data-loss assessment

**No data loss confirmed.** 11,487/11,487 expected sequences present, all
anchors present, no retention path ever invoked in production code, idempotent
append-only store. Every apparently-missing Sep 25 record is retrievable today
by direct sequence query. Severity is availability-of-history (UI), not
durability.

## 16. Reconstruction invariant

Proposed invariant holds with one refinement: *"Cold reconstruction plus
history pagination must be capable of recovering persisted Activity history in
canonical order without client-lifecycle-induced temporal gaps"* — **plus**:
"backward pages MUST be contiguous with the currently held window
(`ORDER BY sequence DESC LIMIT n` under the cursor), and pagination MUST NOT
terminate while unrecovered sequences exist between row 1 and the held
window." No authoritative bounded-history/retention contract was found that
would legitimize incompleteness (retention API exists but is unwired), so
incompleteness is a defect, not a semantic.

## 17. Minimum repair boundary (proven, not implemented)

1. `NativeSqliteActivityStore.query` (+ identical `SqliteActivityStore.query`):
   when `beforeSequence` is set, select `ORDER BY sequence_number DESC LIMIT n`
   and return ASC (or document DESC page contract consistently with the
   in-memory `m9-store` reference behavior). One-line-class fix at the store
   boundary; no API/client changes strictly required.
2. Regression test: seed >2 pages, request `beforeSequence` mid-log, assert the
   returned page is the immediately preceding contiguous window (both SQLite
   stores + `m9-store` parity).
3. Optional hardening (same boundary): make the client consume `nextCursor`
   instead of recomputing `oldest`, so server and client agree on pagination
   state.

## 18. Unknowns / evidence gaps

- Exact composition of the 22-item rendered window at incident time (window has
  advanced; reconstruction is mechanism-proven, not byte-replayed). UNKNOWN at
  row level; mechanism SUPPORTED.
- Warm-session memory-pressure root cause: explicitly not investigated beyond
  shared-mechanism documentation (§11). UNKNOWN.
- Warm operation-count growth: noted as separate concern, not traced. UNKNOWN.
- Whether any other caller depends on the current ASC-under-`beforeSequence`
  behavior: grep shows only the activities route + tests use `query` with
  cursors; no legitimate consumer of oldest-N semantics found, but a
  full-contract search at repair time is advised.

## 19. Recommended next milestone

Record `AR-HISTORY-002 — Contiguous Backward Pagination Repair` (fix §17 items
1–2, plus termination-correctness proof: N sequential loads from frontier
reach seq 1 with no gaps/overlaps), followed by a display-honesty pass
(separate recovered-count vs visible-count in the stream header so "22" can
never again be mistaken for "22 recovered"). Fits naturally as a repair
executor under AR-DIAGNOSTIC-ACTIONS-001 and a consumer of SYSTEM-OPS-001
evidence conventions. No new architecture required.

## 20. Explicit mutation report

Zero mutations performed. No source, test, config, database, service, browser,
or identity state modified. All database access was `mode=ro` SQLite plus
read-only HTTP GETs (`/v1/snapshot`, `/v1/activities?...`) against the already-
running API; no POST/PUT/DELETE issued by this audit (the two `request`
helpers in test files were read, not executed). Live DB max advanced
11456 → 11487 during the audit from the operator's own running system, not
from auditor action. Only this document was created.

---

## Decision gates — explicit answers

- Missing Sep 25 records still persisted? **YES — all of them** (§7 census).
- Can the history API retrieve them directly? **YES by direct sequence query;
  NO via the backward-pagination path as implemented** (returns seq 1–50).
- Does "Load older history" request the correct cursor/boundary? **YES —
  `beforeSequence = min(held sequences)` is the correct boundary.**
- Does the API return a contiguous page? **NO — returns the oldest page.**
- Does the client receive a contiguous page? **Receives exactly what the API
  sends (contiguous-but-wrong); transport is faithful.**
- Does client merge/dedup preserve that page? **YES — prepend + sort + id-dedup
  verified correct.**
- Can filters explain the Sep 14 jump? **NO (gap is in merged data); filters
  explain only the 22/78-vs-50 display-count differences.**
- Confirmed data loss? **NO — affirmatively disproven by gap-free census.**
- Displayed `seq`: history or live-stream cursor? **LIVE-STREAM frontier
  (max-only); history loads cannot move it.**
- Why 22 records? **Snapshot returns newest ≤50 raw rows; tool-row exclusion +
  operational density rendered 22 visible.**
- Why 78 after loading? **22–28 held + 50 oldest-50 page + ~6 concurrent live
  arrivals.**
- Why the ~2h → Sep 14 jump? **The "older" page is `ORDER BY ASC LIMIT 50`
  under the cursor = sequences 1–50 (Sep 14).**
- Server-side, client-side, persistence-side, or multiple? **Single
  server-side store defect (class D)** with presentation-layer count effects.

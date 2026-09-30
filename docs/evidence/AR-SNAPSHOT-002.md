# AR-SNAPSHOT-002 — Activity Snapshot Projection Cardinality Repair Evidence

Status: implemented locally; **not deployed**. Live `vestara-api.service` was
not restarted, no browser state touched, production database untouched.
Nothing staged, committed, or pushed.

```text
MANUAL API RELOAD REQUIRED
pnpm build
sudo systemctl restart vestara-api.service
```

Authority: frozen ownership decision `docs/audits/AR-SNAPSHOT-001B-OWNERSHIP.md`
(M9 = persistence, M10 = reusable StreamItem material, M11A SnapshotProjector
= snapshot membership + entity cardinality, M11C = presentation only).
Implemented exactly that boundary — no reinterpretation, no redesign.

---

## Root cause repaired

Snapshot membership was newest-50 M10 `StreamItem`s
(`getRawStream().map(...).slice(-50)`), so tool-lifecycle rows consumed
snapshot capacity before client correlation; operation-heavy windows collapsed
to 1/4/7/9 visible records (AR-SNAPSHOT-001 + Codex review; refined layer:
M10 StreamItems, not raw M9 rows).

## Implementation boundary

- `packages/activity-room/src/snapshot-projector.ts` (NEW, package-owned):
  `projectActivitySnapshot(deps, { capacity, pageSize, maxPages, startBefore })`
  with injected `fetchPage` (existing M9 backward-history query) and
  `projectRecord` (M10 narrow capability). No API/UI dependencies.
- `packages/activity-room/src/m10-projection-runtime.ts`: additive public
  `projectRecord()` delegating to the existing private mapping. Ordinary M10
  stream, 500-item working set, participants/attention: byte-identical
  behavior, no semantic change.
- `packages/activity-room/src/index.ts`: export block only.
- `apps/api/src/routes/activity-room-m11a.ts`: snapshot route invokes the
  projector; wire shape (`stream` items + frontier `cursor`) unchanged, so
  M11C hydration is untouched (zero client changes).
- M9, AR-HISTORY-002, M11B, M11C, filters, retention, OpenCode: unchanged.

## SnapshotProjector contract

- Entity = any non-tool StreamItem (conversation/activity/progress/log/
  telemetry/evidence/diagnostic/interaction — recovery includes all;
  presentation filters downstream). Tool rows never consume entity slots.
- Capacity N = 50 (`SNAPSHOT_ENTITY_CAPACITY` — same number, new unit:
  entities, not an increase). `entityCount <= N`; `== N` when ≥N eligible
  entities exist in the bounded scan.
- Operation attachment by exact lineage (`execution:`/`session:`/
  `conversation:`) + callID, mirroring client correlation rules; attached and
  orphan tool rows travel as evidence (client list-excludes orphans as before).
- Output canonical ascending order; `complete` flag (capacity reached or
  history exhausted; false = budget-stopped, deterministic, never silent);
  `oldestEntitySequence` for diagnostics.
- Frontier untouched: route still returns `projection.room.cursor`.

## Bounded retrieval strategy (no arbitrary over-fetch)

Demand-paged M9 backward history (page 50, existing contract) from
`cursor+1`, newest-first selection, stop at: capacity + first trailing page
contributing nothing attachable, history exhaustion, or hard cap
`MAX_SNAPSHOT_SCAN_PAGES = 20`. Typical cost 2–4 pages; worst case 20 small
indexed queries per snapshot fetch (mount/resync only).

## Parent-working-set edge-case result: outcome A

Existing bounded retrieval IS sufficient — the projector pages durable M9
(full history), not M10's 500-item working set, so a parent outside M10's set
is still recovered. Proven by test D (budget-exhausted determinism +
fail-closed `complete=false`, then full recovery with sufficient budget).
No new persistence/query capability, no working-set resize, no over-fetch.

## Tests executed

- NEW `packages/activity-room/__tests__/snapshot-projector.test.ts`: 8/8
  PASS — (A) 120-tool-row execution + 5 parents → 5 entities; (B) 200 ops =
  1 slot with correct callID merge; (C) distinct lineages attach correctly;
  (D) budget exhaustion deterministic + fail-closed, full recovery with
  budget; (E) ascending order; (F) frontier-independent membership
  (startBefore 13 vs 100000 identical); (G) snapshot + history page union
  contiguous, no duplicate ids; (I) muted/telemetry recovered, filtering
  downstream; (J) zero-op control exact.
- AR-HISTORY-002 `m9-backward-pagination.test.ts`: 8/8 PASS (code untouched,
  behavior preserved).
- Full `@vestara/activity-room` corpus: 18 files / 123→131 tests PASS.
- M11C `correlated-session.test.ts`: 6/6 PASS (client untouched).
- API route-adjacent suites (`runtime-question-presentation-route`,
  `m9-migration-gate`): 7/7 PASS.
- `pnpm build` (tsc -b): PASS. Dependency boundaries: valid, 119 projects
  (no package relationships changed). Biome on 5 changed files: clean.
  `git diff --check`: clean. (Repo-wide lint still reports 3 pre-existing
  errors in unrelated telegram files from another work program; untouched.)

## Known limitations

- Deeply interleaved lineages spanning more than one quiet page may leave
  some trailing ops to Load Older History composition (client attaches them
  to the held parent — existing tested path).
- Snapshot transport size is variable (bounded by scan: ≤20 pages); selected
  entities are fixed at N.
- `complete=false` is internal/test-visible; the wire shape intentionally
  carries no new field (a future header honesty element may surface it).
- Multi-page scan is point-in-time best-effort under concurrent appends;
  live catch-up (afterSequence) fills any race gap.
- No API-level route harness exists; the contract is proven at projector unit
  level with the real M10 mapping, plus build-level route typecheck.

## Deployment status

NOT DEPLOYED. `MANUAL API RELOAD REQUIRED` — production code changed (route +
activity-room package), so the running API still serves the old raw-tail
snapshot until the operator rebuilds and restarts `vestara-api.service`.

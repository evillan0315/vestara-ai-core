# AR-HISTORY-002 — Contiguous Historical Pagination Repair Evidence

Status: repaired locally; **not deployed**. Live `vestara-api.service` was not
restarted. Deployment requires the operator's existing process:

```text
MANUAL_API_RESTART_REQUIRED
pnpm build
sudo systemctl restart vestara-api.service
```

Authority: repairs ONLY the AR-HISTORY-001 proven pagination defect (class D).
No retention, live-stream, UI filter, client merge/dedup, projection, memory,
lineage, or pagination-redesign changes. Nothing staged, committed, or pushed.

---

## Files changed

Production (2):

- `packages/activity-room/src/m9-native-sqlite-store.ts` — `query()` backward branch
- `packages/activity-room/src/m9-sqlite-store.ts` — `query()` backward branch

Tests (1, new):

- `packages/activity-room/__tests__/m9-backward-pagination.test.ts` — shared
  contract suite executed against BOTH implementations (8 tests)

Evidence (1, new):

- `docs/evidence/AR-HISTORY-002.md` (this file)

Untouched as required: `m9-store.ts` (in-memory reference, already correct),
retention paths, stream/projection, API routes, client hook/components.

## Exact query semantic before / after

Before (both SQLite implementations):

```sql
SELECT * FROM m9_activity_events
WHERE sequence_number < :beforeSequence
ORDER BY sequence_number ASC
LIMIT 50
```

Returned the 50 globally oldest rows (e.g. `beforeSequence=11460` → seq 1–50),
producing the observed recent → Sep-14 discontinuity. Reproduced live pre-repair.

After (both implementations, only when `beforeSequence` is set):

```sql
SELECT * FROM m9_activity_events
WHERE sequence_number < :beforeSequence
ORDER BY sequence_number DESC
LIMIT 50
-- rows reversed to canonical ascending order before return
```

Forward queries (no `beforeSequence`) keep `ORDER BY sequence_number ASC`
byte-identical to before. Filter predicates are untouched; only the sort
direction under `LIMIT` changes, and only for backward pages. This matches the
in-memory store's `slice(-limit)` reference semantics. Callers (notably
`GET /api/activity-room/v1/activities` + client `loadOlder`, which sorts and
dedups) already expect ascending pages.

## Regression tests added

`m9-backward-pagination.test.ts` seeds 130 records (>2 pages of 50) per
implementation (sql.js in-memory + native file-backed) and proves:

1. Newest bounded page via forward cursor → seq 81–130.
2. `beforeSequence=81, limit=50` → seq 31–80 (immediately preceding; the
   pre-repair defect returned 1–50; asserted `first > 1`).
3. Full backward walk (4 iterations): pages `[81..130]`, `[31..80]`, `[1..30]`,
   then `[]` — ≥3 non-empty pages.
4. No gaps, no duplicates, full 1–130 coverage, ascending order within every
   page, boundary exclusivity (`page[i]` starts exactly where `page[i-1]`
   ended), correct termination (`beforeSequence=2` → `[1]`;
   `beforeSequence=1` → `[]`).
5. Filter semantics unchanged: backward page with `type` filter returns the
   newest filtered window below the cursor, ascending; forward filtered query
   keeps oldest-first ascending semantics.

## Contiguous page evidence

- Focused suite: 8/8 passing (4 scenarios × 2 implementations).
- Full `@vestara/activity-room` corpus: 17 files / 123 tests passing.
- Live pre-repair reproduction (read-only): `beforeSequence=11460&limit=50` →
  seq 1–50 (defect); post-repair equivalent is covered by the regression suite
  against both drivers (live API restart is the operator's step, not taken).

## Build result

- `pnpm build` (references regeneration + `tsc -b`): PASS, including the
  architecture boundary generator ("Dependency boundaries valid across 119
  workspace projects") — serves as the dependency boundary check; no
  dependencies were added or changed by this repair.
- `pnpm lint:check` (Biome, error level): the three repaired/new files pass
  cleanly. Repo-wide gate still reports 3 pre-existing errors confined to
  unrelated interleaved work (`apps/api/src/telegram-identity.ts`,
  `apps/api/__tests__/telegram-identity.test.ts` — import order/formatting
  from another work program); intentionally untouched as out of scope.
- `git diff --check`: clean (no whitespace errors).

## Deployment status

NOT DEPLOYED. `MANUAL_API_RESTART_REQUIRED`. The running API still serves the
pre-repair query semantic until the operator rebuilds and restarts
`vestara-api.service`. No live representation, binding, or state was created
or modified by this repair; test databases were temp-dir/file-scoped and
removed by fixtures.

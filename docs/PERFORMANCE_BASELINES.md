---
title: Performance Baselines
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-07
next-review: 2026-10-04
---

# Performance Baselines

## Vestara AI Core — Operational Era

> Baselines are thresholds that must be maintained across releases.
> If a change degrades a baseline, it must be optimized or rolled back.
> Baselines are updated only by explicit operational milestones.

---

## Pipeline Stages

Measured by `pnpm benchmark` (3 iterations on vestara-ai-core self-host).

| Stage | Min | Max | Avg | Threshold | Status |
|-------|-----|-----|-----|-----------|--------|
| Discover | 58ms | 95ms | 74ms | < 100ms | ✅ Pass |
| Fingerprint | 63ms | 107ms | 80ms | < 100ms | ✅ Pass |
| Analyze | 56ms | 71ms | 63ms | < 100ms | ✅ Pass |
| Present | 59ms | 67ms | 62ms | < 500ms | ✅ Pass |
| Pipeline (cold, total) | — | — | ~280ms | < 3s | ✅ Pass |

---

## Knowledge Indexing

Measured by `pnpm benchmark-index` (50 TypeScript files).

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Throughput | ~800 files/sec | > 500 files/sec | ✅ Pass |

---

## Test Suite

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Duration | ~7s | < 10s | ✅ Pass |
| Test files | 39 | — | — |
| Tests | 117 | — | — |

---

## Health Check Latency

Measured by `vestara doctor`. Each service reports health check latency in the diagnosis output.

| Service | Threshold | Status |
|---------|-----------|--------|
| All registered services | < 100ms per check | ✅ Instrumented |
| `vestara doctor` output | Shows per-service latency | ✅ Enriched |

Services report latency via `HealthCheckSummary.latency`, surfaced through `ServiceDiagnosis.latency` in the diagnosis response.

---

## API Performance — Phase 0 Baseline (2026-09-07)

> Measurement only. No runtime optimization, no persistence-semantic change,
> no router redesign, no boot deferral, no commit. Estimated improvement
> percentages from prior plans are NOT acceptance requirements.

### Provenance

| Field | Value |
|-------|-------|
| Commit | `f56309cb08ae1aa20f25c690f196bc62c1b83656`, `main...origin/main [ahead 2]`, dirty tree (see `git status`) |
| Node / pnpm / tsx | `v22.23.2` / `11.21.0` / `tsx v4.23.1` |
| CPU / RAM | 4× `Intel i7-4510U @ 2.00GHz`, total `7.66GB`, free `3.29GB` at start |
| `VESTARA_*` flags | none set in env; full-boot harness used `VESTARA_SKIP_MEMORY_INDEX=1`, `VESTARA_OPENCODE_SUPERVISOR=0`, isolated `VESTARA_REPO=/tmp/opencode/vestara-perf-boot` |
| DB fixtures (prod, stat only) | `activity.db 18329600 B (17.48MB)`, `m9-activity.db 393216 B`, `interactions.db 45056 B`, `plans.db 1171456 B`, `engineering-events.db 534798336 B (510.02MB)` |
| Logging config | `RequestLogger` default `level=debug`, `out=stdout`, redact + `JSON.stringify` ×2 per request; harness silenced `out` to noop for pure timing, microbenched separately |
| Dist | `apps/api/dist/server.js` mtime `2026-09-07T05:51:49Z` (newer than `src/server.ts` `2026-09-06`) |
| Harness location | `/tmp/opencode/phase0-{gateway,persistence,syncfs,boot}.mjs` (repo untouched except this doc) |
| Warm-up / samples / concurrency | gateway: warm-up `20` (`10` for auth), `n=200` (`100` auth), concurrency `20×10=200`; persistence: `5` export/write samples per size + `50×` freq test; syncfs: `n=200`; boot minimal `n=4` child runs, full context `n=2` success |
| Same-process caveat | gateway client + server share one Node event loop; latencies include client fetch cost and are upper bounds |

### Gateway overhead (minimal ctx, `createServer`, no DB)

Run 2 (primary; Run 1 in parentheses for reproducibility):

| Endpoint | p50 | p95 | p99 | avg | rps | n |
|----------|-----|-----|-----|-----|-----|---|
| `GET /api/health/live` | `4.45ms` (`5.29`) | `9.88` (`10.96`) | `13.97` (`15.15`) | `4.85` (`5.70`) | `206` (`175`) | `200` |
| `GET /api/health/ready` | `3.13` (`4.60`) | `5.76` (`8.26`) | `6.84` (`9.46`) | `3.42` (`4.74`) | `292` (`211`) | `200` |
| `GET /api/telemetry/http` | `3.00` (`2.85`) | `5.99` (`8.87`) | `7.61` (`13.26`) | `3.40` (`3.82`) | `294` (`262`) | `200` |
| `GET /api/nonexistent` (404) | `3.23` (`5.10`) | `6.40` (`9.82`) | `7.05` (`14.96`) | `3.67` (`5.67`) | `272` (`176`) | `200` |
| `POST /api/auth/login` (lightweight API) | `4.17` (`5.48`) | `7.23` (`8.99`) | `9.46` (`13.12`) | `4.40` (`5.85`) | `227` (`171`) | `100` |
| Concurrent `20×10` health/live | `p50 19.99`, `p95 38.89`, `p99 44.39`, avg `22.31`, rps `612`, `ok=200/200` (Run 1: `p50 30.21`, `p95 50.07`, `p99 58.08`, rps `448`) | — | — | — | — | `200` |

- Event-loop delay (during gateway bench, same-process): `mean 10.88ms` (`11.52` Run 1), `p95 13.33ms` (`16.52`), `max 33.75ms` (`32.77`). Treat as loaded-loop upper bound, not idle baseline.
- Gateway vs handler: lightweight handler delta `<1ms` (auth/login vs live, telemetry vs live within run variance). Gateway fixed cost dominates lightweight endpoints.

### Handler / service work (isolated, no prod mutation)

| Endpoint / work | Measured |
|-----------------|----------|
| DB read (`activity.db` 18MB copy, read-only) | `COUNT(*) 1.5ms`, `ORDER BY sequence DESC LIMIT 20 2.8ms` |
| DB write (synthetic, `/tmp`, `export+writeFileSync` per op) | `1MB: 5.8ms/op`, `2MB: 9.3ms/op`, `8.8MB: 34.0ms/op`; `INSERT-only` baseline `0.20–0.33ms/op`; ratio `17.8× → 34.0× → 173.2×` with size |
| Docs | `walk docs/ (295 files): 54.8ms`; per-file `readFileSync slice(0,900): p50 0.032ms`; `titleOf` path does per-file sync read |
| Diagnostics | `/proc/stat` read `0.09ms`; full `collect.ts` HTTP route NOT benched (spawns `execFileSync`, `4s` timeouts) — see ranking |

### B1 persistence detail (no debounce applied)

| Size | `db.export` avg | `writeFileSync` avg | Bytes | `50×` with persist | `50×` without | Event-loop impact |
|------|-----------------|---------------------|-------|--------------------|---------------|-------------------|
| `1.0MB` synth | `4.5ms` | `3.0ms` | `1032192` | `290ms (5.8ms/op)` | `16ms (0.33ms/op)` | sync block = export + write |
| `2.0MB` synth | `3.2ms` | `7.0ms` | `2056192` | `467ms (9.3ms/op)` | `14ms` | sync block |
| `8.8MB` synth | `13.5ms` | `18.9ms` | `9244672` | `1699ms (34.0ms/op)` | `10ms` | sync block |
| Prod `activity.db 17.48MB` (copy to `/tmp`, read-only) | `30–46ms` | `~30–40ms` est. from curve | `18329600` | — | — | `copy 34ms warm (502ms cold)`, `read 19–31ms`, `open 7–19ms` |
| Prod `engineering-events.db 510MB` | NOT loaded into WASM (OOM risk on `7.6GB` box) | NOT written | `534798336` | — | — | extrapolated `~28×` the `18MB` cost per persist (seconds-scale block); requires arch decision before any durability change |

Write frequency: production code calls `persistDb` (`db.export()` + `writeFileSync`) on every `INSERT/UPDATE/DELETE/CREATE/DROP` via `exec`/`prepare.free` wrappers (`workspace-context.ts`, `activity-room.ts`, `activity-room-m11a.ts`).

### B5 sync FS detail

`ui exists+stat: p50 0.021ms p95 0.054ms`; `docs-read-900B: p50 0.032ms p95 0.080ms`. Micro-ops are `<1%` of gateway. Exception: docs tree walk `54.8ms` dominates its endpoint.

### B6 boot detail (process start / listen / live / ready)

Minimal gateway child (`n=4`): `listen 11–42ms`, first `live` probe `138–251ms` (JIT + M11B init-failure log), `ready` probe `5–51ms`, `RSS 90–95MB`.

Full `createWorkspaceContext` (isolated temp repo, empty workspace, `SKIP index`, `n=2` success):

| Run | import | context | total | RSS |
|-----|--------|---------|-------|-----|
| A | `1316ms` | `4495ms` | `5811ms` | `128MB` |
| B | `464ms` | `3001ms` | `3465ms` | `133MB` |

Waterfall markers observed: `kernel-booted 2183ms`, `runtime-opened 3939ms`, `memory-initialized 2954–4417ms`, `context-return 2999–4486ms`; workspace `total 1325ms` (`discover 17ms`, `fingerprint 45ms`, `analyze 5ms`, `present 721ms`, `session 1228ms`, index deferred). Production boot (with `510MB` events DB, `5846` files, `607KB` workspace.json) was NOT measured against prod to avoid mutation. No initialization moved past `listen()`; readiness preserved.

### Controlled comparisons

- Logging on vs suppressed (in-memory, `N=5000`, `out=noop`): `debug(info enabled) 0.012–0.017ms/log`, `error(info suppressed) ~0.0000ms/log`. Two logs/request ≈ `0.025–0.034ms` vs `3–5ms` gateway. Real stdout syscall cost NOT measured (suppressed in harness).
- Route position (`RouteDispatcher`, `M=2000`): `claim-first p50 5.3µs`, `claim-last 37.5µs`, `404-none-claim 69.5µs p50 / 96.9µs avg`. Position delta `~30–60µs` vs `3000–5000µs` request.
- Persistence frequency: see B1 table; cost scales with DB bytes, ratio explodes with size.
- Sync FS: see B5; per-op minor, tree walk major for docs endpoint.
- Boot waterfall: see B6; `kernel-booted` + `runtime-opened` dominate.

### Ranked bottlenecks B1–B9 (measured evidence)

| ID | Rank | Evidence |
|----|------|----------|
| B1 persistence write | `CONFIRMED MAJOR` | `5.8→9.3→34.0ms/op` with size; `17.8×→173×` vs no-persist; `18MB` export `30–46ms`; `510MB` prod file extrapolated seconds-scale sync block per write |
| B6 boot composition | `CONFIRMED MAJOR` | `context 3001–4495ms`, `total 3465–5811ms` empty-temp vs `listen 11–42ms` minimal; `RSS 128–133MB` vs `90–95MB`; `kernel-booted 2183ms` |
| B5 sync FS (docs walk) | `CONFIRMED MAJOR (endpoint-specific)` / `CONFIRMED MINOR (gateway avg)` | walk `54.8ms` dominates docs endpoint; micro-ops `0.021–0.032ms` are `<1%` gateway |
| B2 logging CPU | `CONFIRMED MINOR` | `0.025–0.034ms`/request vs `3–5ms`; stdout I/O cost not measured (noop in harness) |
| B3 route position | `CONFIRMED MINOR` | delta `30–60µs` vs `3000–5000µs`; 404 path `69.5µs p50` |
| B9 stringify-compare | `CONFIRMED MINOR` | `0.028ms/op` 5KB payload |
| B7 coarse metrics | `NOT MATERIAL (latency)` | `telemetry p50 3.00ms ≤ live 4.45ms`; attribution gap remains but adds no latency |
| B4 timer/UUID/ALS | `INDETERMINATE` | not isolated from gateway fixed cost in Phase 0 |
| B8 WS fanout/replay | `INDETERMINATE` | no WS bench in Phase 0 |

### Recommendation (one first optimization, no semantics change)

B1 is the largest per-request contributor but any durability change (including
debounce or async persist) requires a separate architectural decision and is
explicitly out of scope here. B6 deferral past `listen()` is likewise out of
scope without preserved readiness.

Recommended first: parallelize independent `createWorkspaceContext` opens
(`conversationStore`, `engineeringEvents`, evidence stores, worktree) with
`Promise.all`, still completing before `listen()` to preserve readiness
semantics. Re-measure with this same Phase 0 harness (`import/context/total`,
`RSS`, gateway `p50/p95/p99`) before any further change.

---

## Baseline Update Policy

1. Baselines are set by the first measurement in an Operational Era milestone.
2. Baselines can be tightened (threshold lowered) at any time.
3. Baselines can be loosened (threshold raised) only by an explicit operational milestone that documents why.
4. Every baseline includes the date and measurement tool used.
5. CI fails if any measurement exceeds its threshold.

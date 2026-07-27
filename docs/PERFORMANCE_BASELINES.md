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

## Baseline Update Policy

1. Baselines are set by the first measurement in an Operational Era milestone.
2. Baselines can be tightened (threshold lowered) at any time.
3. Baselines can be loosened (threshold raised) only by an explicit operational milestone that documents why.
4. Every baseline includes the date and measurement tool used.
5. CI fails if any measurement exceeds its threshold.

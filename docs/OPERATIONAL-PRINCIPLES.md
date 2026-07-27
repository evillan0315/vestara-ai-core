# Operational Era Principles

## Vestara AI Core — v3.7+

---

## 1. Evidence Over Implementation

Every operational milestone must answer a question with data. Implementation is not the deliverable — the measurable improvement is.

```text
Milestone
    ↓
Question (testable hypothesis)
    ↓
Implementation
    ↓
Measurement
    ↓
Evidence (pass/fail against baseline)
```

If a milestone cannot define what success looks like in measurable terms before implementation begins, it is not ready to start.

A reliability milestone's deliverable is not a retry mechanism. Its deliverable is a measured improvement in MTBF or recovery time. The retry mechanism is just the means.

---

## 2. Reliability Is a Feature, Not a Tactic

Reliability improvements receive the same rigor as user-facing capabilities:
- Specification (what behavior is expected)
- Acceptance tests (how reliability is verified)
- Regression protection (reliability tests run in CI)

If a reliability fix has no test that would catch its regression, the fix is incomplete.

This applies to:
- Crash recovery
- Data integrity after interruption
- Graceful degradation when AI providers are unavailable
- File system error handling
- Concurrent access safety

---

## 3. Performance Regressions Block Releases

Every release must maintain or improve established performance baselines.

| Baseline | Threshold | Measured By |
|----------|-----------|-------------|
| Pipeline open (cold) | < 3s | `pnpm benchmark` |
| Pipeline open (warm) | < 500ms | `pnpm benchmark` |
| Knowledge indexing | > 500 files/sec | `pnpm benchmark-index` |
| Test suite | < 10s | CI timing |

If a change degrades a baseline beyond threshold, it must be optimized or rolled back before release. Baselines are stored in `docs/PERFORMANCE_BASELINES.md` and updated only by explicit operational milestones.

---

## 4. Observability Is Part of the Feature

Every feature ships with:
- At least one metric that answers "is it working?"
- At least one log line that answers "what happened?"
- At least one health check that answers "can it serve traffic?"

A feature that cannot be observed in production is not complete. Adding observability after a feature is shipped is a sign that this principle was violated.

Metrics, logs, and health checks are not overhead. They are the interface between the system and the operator, just as the CLI is the interface between the system and the developer.

---

## 5. User Feedback Is Evidence, Not Anecdote

Feedback from users is treated as empirical data, not opinion:

- A single report is a signal to investigate.
- A reproducible pattern is a hypothesis to test.
- A measured improvement based on feedback is a validated change.

Every piece of user feedback that leads to a change must produce a measurable before/after comparison. "A user said it was faster" is not sufficient. "Time-to-first-workflow decreased from 12s to 4s" is sufficient.

---

## 6. Production Behavior Is Continuously Validated

The CI pipeline is extended to include operational validation:

```text
Unit tests → Integration tests → Lint → Build → Benchmark comparison → Reliability checks
```

The benchmark comparison step fails if any performance baseline regresses. The reliability checks step runs chaos-style tests (provider disconnection, file system errors, concurrent access).

This ensures that operational characteristics are verified on every commit, not just during release qualification.

---

## 7. Operational Debt Is Tracked Alongside Technical Debt

Operational debt — gaps in monitoring, reliability, performance, or deployment — is tracked in the same backlog as technical debt. It is prioritized by impact on users, not by implementation convenience.

Examples of operational debt:
- A service without a health check.
- An error path without a log line.
- A slow path without a performance baseline.
- A manual deployment step that could be automated.

Every operational debt item has an owner and a measurable closure criterion.

---

## 8. The Platform Proves Itself

The golden path for operational validation is:

```text
vestara doctor        → Runtime health
vestara open .        → Pipeline timing
pnpm benchmark        → Pipeline stage baselines
pnpm benchmark-index  → Indexing throughput
pnpm test             → Regression coverage
```

Every operational milestone must improve at least one of these measurements or add a new one. The platform demonstrates its own production readiness through these commands — no external validation tool required.

---

## Relationship to Other Governance Documents

| Document | Governs |
|----------|---------|
| Blueprint / Foundation | Architecture contracts |
| PRODUCT-PRINCIPLES.md | Product decisions and capability model |
| AGENTS.md | Repository workflow and agent conventions |
| AI-OS-ROADMAP.md | Platform evolution and roadmap |
| **OPERATIONAL-PRINCIPLES.md** | Production readiness and operational excellence |

The Operational Era does not replace earlier principles. It adds a new layer: a capability is not complete until it has demonstrated operational evidence. Architecture, product, and engineering principles continue to apply — they govern how things are built. Operational principles govern how things are proven.

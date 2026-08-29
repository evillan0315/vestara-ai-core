# Engineering Benchmark Ecosystem — Plan

APE-001 → AQF-001 → VEB-001

**Status:** Proposed (High priority — non-blocking capability)
**Depends on:** `@vestara/workflow-orchestrator` (WFO-001), `@vestara/verification-evidence` (VEF-001), `@vestara/agent-performance` (APE-001), `@vestara/engineering-event-store`

## 1. Objective

Measure how capable a model is **for a specific engineering role, inside the
governed Vestara engineering system** — not raw model capability.

Traditional benchmarks ask "How capable is this model?". The Vestara
benchmark ecosystem asks:

> How capable is this model **for this engineering role, under this workflow,
> with this budget and policy**?

Vestara can answer this because it controls the entire engineering lifecycle:
workflow discipline, approvals, verification, artifacts, evidence, and cost are
all observable. The ecosystem turns that operational telemetry into an
evidence-driven, multi-dimensional engineering benchmark.

## 2. The three-layer architecture

```text
APE-001 — Agent Performance & Behavioral Evaluation
        ↓  collects authoritative performance evidence
AQF-001 — Agent Qualification Framework
        ↓  derives role qualifications from accumulated evidence
VEB-001 — Vestara Engineering Benchmark Suite
        ↓  analyzes evidence across models, workflows, providers, organizations
```

Each layer builds on the previous one. None of them makes routing decisions.

### 2.1 Separate measurement from certification from decision

```text
Benchmark     → produces evidence
Qualification → uses evidence
Assignment    → uses qualification
```

- **Benchmarking measures.** Produces immutable evidence snapshots.
- **Qualification certifies.** Derives role qualifications from accumulated
  evidence (synthetic + production).
- **Assignment decides.** Uses qualification as one input to routing. This stays
  a separate policy decision and is never automatic in the first iterations.

This separation keeps the architecture clean: a benchmark never certifies, and
assignment never evaluates.

## 3. APE-001 — evidence collection (current state)

Already implemented (APE-001A) in `@vestara/agent-performance`:

- Five evaluation dimensions: workflow compliance, engineering effectiveness,
  conversation efficiency, economic efficiency, opportunity discovery.
- `AgentPerformanceSnapshot` — immutable ADR-012 `EvidenceSnapshot` with a
  deterministic content hash.
- `AgentPerformanceComparator` — ADR-012 comparability (role/scope/self →
  incomparable; missing verification conclusion narrows effectiveness →
  partially-comparable) and metric-by-metric per-dimension winners.
- `derivePerformanceEvidence` — comparison + VEF-gated conclusion + overall
  winner + evidence refs.

Remaining APE-001 slices:

- **APE-001B** — collectors that populate snapshots from real sources:
  Workflow Collector (WFO-001 observations), Telemetry Collector (tokens/cost),
  Repository Collector (regressions, changed files).
- **APE-001C–F** — concrete metric computation: workflow compliance, engineering
  effectiveness, conversation efficiency (WFO integration), economic efficiency
  (budget governance integration).
- **APE-001G** — reproducible shadow-mode performance reports.
- **APE-001H** — cost-aware routing *recommendations* only. No automatic model
  replacement.

## 4. AQF-001 — Agent Qualification Framework

Qualification is the layer that turns accumulated evidence into a role
certification. It is not a benchmark.

```text
Qualification Evidence
    Synthetic Benchmark
  + Real Production Workflows
```

Both evidence sources matter: a model may ace synthetic benchmarks yet struggle
with long-running repository work, coordination, or workflow discipline; another
may not top public leaderboards yet consistently deliver verified engineering
outcomes at lower cost.

### 4.1 Multi-dimensional qualification — no single score

Qualification is a vector, never one number. Public leaderboards optimize for a
single score, and people optimize for the score rather than the engineering
outcome. AQF-001 keeps qualification multi-dimensional:

```text
Role: Reviewer

Workflow Compliance          98%
Verification Quality         96%
False Positive Rate           2%
Average Cost            $0.18/workflow
Material Progress Efficiency  94%
Qualification:       Senior Reviewer
```

Users choose what matters most for their environment.

### 4.2 Qualification inputs

- Role-scoped performance evidence from APE-001.
- Verification conclusions and evidence refs from VEF-001.
- Workflow observations (material progress, no-progress turns) from WFO-001.
- Confidence-weighted accumulation across comparable runs (ADR-012).

### 4.3 Qualification outputs

- Per-role qualification records (level, dimension scores, evidence refs,
  expiry/re-evaluation window).
- Qualification must never fabricate evidence: scores are derived only from
  accumulated, comparable snapshots.

## 5. VEB-001 — Vestara Engineering Benchmark Suite

A suite, not one benchmark. Each benchmark evaluates one capability:

```text
Vestara Benchmark Suite

Architecture Benchmark
Implementation Benchmark
Review Benchmark
Verification Benchmark
Planning Benchmark
Documentation Benchmark
Workflow Discipline Benchmark
Cost Efficiency Benchmark
Opportunity Discovery Benchmark
```

### 5.1 Benchmarking the system, not just the models

Vestara can also benchmark the engineering **workflow itself**:

```text
Workflow Profile A                  Workflow Profile B
Completion Rate                     Completion Rate
Regression Rate                     Regression Rate
Average Cost                        Average Cost
Average Duration                    Average Duration
Verification Success                Verification Success
```

This answers "Which workflow design produces better engineering outcomes?" and
makes improvements to Vestara itself measurable.

### 5.2 Long-term benchmark categories

```text
Vestara Engineering Benchmark (VEB)

├── Role Qualification
├── Workflow Benchmark
├── Provider Benchmark
├── Model Benchmark
├── Cost Benchmark
├── Verification Benchmark
├── Repository Benchmark
└── Organization Benchmark
```

Organizations answer from **their own evidence**, not generic internet
benchmarks:

- Which model for security reviews?
- Which workflow minimizes regressions?
- Which provider has the best cost per verified artifact?
- Which verification profile catches the most real defects?
- Which planner has the highest first-pass success rate?

## 6. Guiding principles

1. **Measure what the system controls.** Workflow boundaries, approvals,
   verification, artifacts, evidence, and cost are all observable inside Vestara.
2. **Benchmark → qualify → assign.** Never collapse the three layers.
3. **Evidence over assumptions.** Every score derives from comparable evidence;
   incomparable evidence yields indeterminate, never a conclusion (ADR-012).
4. **Role-scoped, never global.** No single universal "best model" score.
5. **No public leaderboard.** Multi-dimensional qualification only.
6. **Recommendations, not actions.** APE/AQF/VEB observe and evaluate; routing
   remains a policy decision.

## 7. Delivery sequence

| Slice | Deliverable | Depends on |
|-------|-------------|------------|
| APE-001A | Performance contracts + evidence snapshot + comparator | VEF-001 ✅, WFO-001 ✅ |
| APE-001B | Workflow / Telemetry / Repository collectors | APE-001A |
| APE-001C–F | Compliance / Effectiveness / Conversation / Economic metrics | APE-001B, WFO-001, budget governance |
| APE-001G | Reproducible shadow-mode reports | APE-001C–F |
| AQF-001A | Qualification contracts + accumulation | APE-001A |
| AQF-001B | Qualification derivation (vector scores, no single number) | APE-001G |
| VEB-001A | Benchmark suite registry + per-capability runs | AQF-001A |
| VEB-001B | Workflow/system benchmarking (profiles A/B) | VEB-001A |
| VEB-001C | Cross-model / cross-provider / cross-workflow analysis | VEB-001B |
| APE-001H | Cost-aware routing recommendations (advisory only) | APE-001G, VEB-001C |

## 8. Acceptance criteria

The ecosystem is complete when:

- comparable runs are evaluated through evidence (ADR-012);
- workflow compliance, engineering quality, economic efficiency, and
  conversation efficiency are measurable;
- reports are reproducible from stored snapshots;
- qualification is role-scoped and multi-dimensional (no single score);
- benchmarks cover the system (workflow profiles) as well as models;
- comparisons follow ADR-012 comparability rules;
- routing remains policy-driven; qualification and assignment never act on
  their own.

## 9. Non-goals

- No automatic model replacement or automatic rerouting.
- No global model ranking or public leaderboard.
- No overriding workflow policies or human decisions.
- No synthetic-only evaluation: production workflows are first-class evidence.
- No qualification without evidence accumulation.

---
title: CI-OBS-001D/E-000 — Reviewer & Hypothesis Ownership Audit
milestone: CI-OBS-001
status: FROZEN — repository-verified historical ownership baseline (zero-mutation audit; no implementation authorized by this document)
date: 2026-09-15
baseline: docs/ci-obs-001a-ownership-audit.md (FROZEN 2026-09-15)
scope: audit only — ownership matrix, data-flow map, persistence map, KEEP/ADAPT/REBUILD/RETIRE/NEW decisions, 001D/001E boundary, HOLD conditions, prerequisites, verification gates
version: 1.0.0
owner: vestara
last-reviewed: 2026-09-15
next-review: 2026-10-15
---

# CI-OBS-001D/E-000 — Reviewer & Hypothesis Ownership Audit

**Status**: FROZEN as the repository-verified historical ownership baseline for the pipeline
`CIFailureEvidence → CIClassification → CIHypothesis → CIFinding`.
Zero-mutation audit. No contracts, runtime code, persistence, Activity Room, Assistant,
workflows, CI adapter, UI, or documentation beyond this record were changed to produce it.

**Precedence note (normative)**: this document is the *historical ownership baseline*.
It does not override the newer `CI-OBS-001D-001` decision contract. Where this baseline
and 001D-001 differ, the difference is a **HOLD requiring architecture re-review/amendment** —
frozen/accepted contracts must never silently subordinate themselves to later documents,
and later documents must never silently subordinate themselves to this baseline either.

**Frozen boundaries respected**: CI-OBS-001A/B/C and CI-UI-001. No renumbering proposed:
001D/001E keep their milestone slots.

**Governing invariants preserved**: Failure ≠ Root Cause · Observation ≠ Hypothesis ≠ Finding ·
Classification ≠ Diagnosis · Hypothesis ≠ Finding · Confidence ≠ Evidence · Claim ≠ Evidence ·
UNKNOWN is valid · Retrieval failure ≠ CI failure · Historical hypothesis ≠ current finding ·
Recommendation ≠ mutation authority · Activity Room projection ≠ CI/reviewer authority ·
a failed check alone must never authorize an asserted root cause.

---

## 1. Ownership matrix

| Object | Existing owner / candidate | Persistence today | Canonical / derived | Decision |
|---|---|---|---|---|
| CIClassification vocabulary | Frozen 001B (`CODE…UNKNOWN`, transient set) | Closed vocab | Canonical | **KEEP** |
| Classification assignment (evidence→category) | None — Observer categorizes diagnostic health/severity, never CI failure kinds | — | Derived (per observation) | **NEW** — 001D reviewer function |
| CIHypothesis records | None durable; Observer owns lifecycle *rules* only (in-memory) | None | Canonical (new) | **NEW** 001E store; **ADAPT** transition mechanics from `FindingLifecycleManager` with exclusions (§5) |
| CIFinding records | `ObserverFinding` pattern (reference-by-ID, `relatedFindingIds`, merge linkage) | In-memory only | Derived (hypothesis + evidence + gate) | **NEW** promotion function; **ADAPT** reference-not-value + explicit-linkage patterns; do NOT adopt merge-takes-max-confidence |
| CIFailureEvidence content | Frozen 001B type; bytes live provider-side | `BundleStore` (fs, write-once, immutable, keyed by executionId) persists *bundles*, not raw CI logs | Canonical (adapter-produced) | **KEEP** type; **ADAPT** BundleStore immutability + content-addressing for CI evidence records; never duplicate provider log bytes |
| Confidence computation | `ConfidenceEngine` (product of factors + rationale + `limitations` + freshness window) | Derived per evaluation | Derived | **ADAPT** pattern (freshness decay, independence counting, mandatory rationale); do NOT reuse numeric thresholds blindly; do NOT adopt Observer `Math.max` transition floors (inflation vector) |
| Promotion gate (hypothesis→finding) | `VerifierService.evaluate` (criteria + `findContradictions` + gaps + reasoning; `reverify` chains fresh verdicts, never mutates; override recorded separately) | Verdicts (caller-owned) | Derived | **ADAPT** verdict pattern for promotion decisions |
| Reviewer execution role | `agent-reviewer` (code-review role, never-modify, `verification:create`) + `multi-agent-workflow` invocation path | Agent runtime | Role (not CI skill) | **KEEP** agent-reviewer for code review; **NEW** CI reviewer function; **REUSE** workflow invocation/escalation plumbing |
| Hypothesis-memory substrate | `SqliteEngineeringEventStore` (append-only truth events, immutable manifests, content-addressed artifacts, correlation IDs) | sqlite, durable, immutable | Substrate | **ADAPT** as append-only transition log; current-state index lives in NEW 001E store |
| Generic memory | `@vestara/memory` (userId-scoped free text, importance, consolidation/**pruning**) | sqlite, durable | Wrong domain | **RETIRE as candidate** — userId scope ≠ CI scope keys; pruning destroys evidence lineage; unstructured content ≠ structured hypotheses |
| Trust derivation | `DefaultTrustEngine.recordVerificationOutcome` (`sourceType: 'pipeline'` exists) | TrustSnapshot | Derived | **KEEP/ADAPT**: record CI outcomes as `pipeline` source for trust scores only; one-way, never input to diagnosis |
| Activity Room projection | `VerificationProjector` (`harness.verification.*`, `verification.passed/failed`, outcome + `evidenceRefs`) | Projected records | Derived projection | **ADAPT** pattern in 001F only; zero CI projection in 001D/E |
| Assistant context/memory | `conversation-runtime` sessions (`memory_updates` refs), context-intelligence assemblers | sqlite sessions / runtime | Derived | **KEEP out** — assistant consumes verdicts via 001G query bridge; never owns hypotheses |
| Workflow execution state | `WorkflowOrchestrator` + `observation/` (internal convergence, budgets) | sqlite | Internal-only | **KEEP out** — internal orchestration vs external CI authority; no coupling |
| Reviewer telemetry | `metrics` (`MetricsRegistry`) | Counters | Derived | **ADAPT** sink pattern (classification counts, promotion rates, latency) — counts only, never evidence |
| Milestone/task evidence | `MilestoneService` (in-memory), task CLI | Ephemeral | Ephemeral | **RETIRE as candidate** for durability; may reference finding IDs by ID-copy only |

---

## 2. Current call/data-flow map

```text
GitHub API → github-ci-adapter (normalizeRun/Job/Check, extractFailureEvidence,
  buildObservation [trigger default: polling])
  → CIVerificationRun / CIJob / CICheck / CIFailureEvidence / CIObservation  [FROZEN — ends here]
  → (NOTHING consumes these yet: no reviewer, no store, no projector, no assistant bridge)

Existing parallel pipelines (local-verification domain — patterns only, not running systems for CI):
  EvidencePipeline → VerificationEvidenceBundle (immutable) → BundleStore (fs, write-once)
  VerifierService.evaluate(bundle, criteria, claim) → Verdict (contradictions/gaps/reasoning/confidence; reverify chains; override separate)
  ConfidenceEngine(checks, evidence) → score + factors + limitations (freshness-windowed)
  Observer: diagnostic.snapshot → analyzeSnapshot → ObserverFinding (in-memory Map) → transitions → ObserverFindingStore (READ-ONLY interface)
  Trust: VerificationOutcome(sourceType) → recordVerificationOutcome → TrustSnapshot
  Activity Room: ActivitySourceEvent → VerificationProjector → ActivityRecord (evidenceRefs, no evidentiary authority)
  Memory: store/search/getContext (userId-scoped, pruned) — CI-inapplicable
```

**Gap**: between frozen CI observation output and every downstream consumer there is no
reviewer, no hypothesis record, no durable store, no promotion rule, no projection.
That span is NEW-but-patterned work.

---

## 3. Persistence / evidence ownership map

| Layer | Owner | Durability | Mutability rule |
|---|---|---|---|
| Raw CI log bytes | GitHub (provider) | External | Never duplicated into Vestara; referenced by URL/evidenceId |
| CI evidence records | 001D reviewer fn creates refs; 001E store keeps | NEW durable | Immutable once captured |
| Evidence bundles (if CI adopts bundle pattern) | `@vestara/evidence` BundleStore pattern | fs, write-once | Immutable; re-verify chains |
| Hypothesis versions | NEW 001E store (substrate: engineering-event-store append-only log) | sqlite durable | Append-only versions; index points at latest; history never rewritten |
| Promotion verdicts | 001D gate (VerifierService pattern) | With hypothesis record | Fresh verdict per decision, references prior |
| Observer findings | `@vestara/observer` | In-memory only | Transitions validated; `rejected` terminal (CI-incompatible — §5) |
| Trust snapshots | `@vestara/trust` | Durable | Derived; one-way (never input to diagnosis) |
| Activity records | `@vestara/activity-room` | Projected | Derived; link-back, never restate authority |
| Generic/agent memory | `@vestara/memory`, conversation sessions | Durable but pruned/session-scoped | Excluded from CI truth path |

---

## 4. Explicit answers (accepted conclusions)

1. **Who should own CIClassification?** The frozen vocabulary is canonical (KEEP). Assignment
   is owned by the NEW 001D reviewer function; no existing system categorizes provider failures.
2. **Who creates and persists CIHypothesis?** Created by the 001D reviewer function
   (`proposed`/`investigating` only). Persisted by the NEW 001E store as versioned immutable
   records; updates are new versions referencing prior, never in-place rewrites.
3. **Who may promote hypothesis→finding?** A dedicated promotion gate inside 001D execution
   applying explicit adapted-`VerifierService` criteria — the gate rules, not reviewer
   discretion, are the authority. Overrides recorded separately, never edited into verdicts.
4. **Promotion threshold**: (a) ≥1 content-addressed supporting evidenceId; (b) no unresolved
   contradictions (`findContradictions`-analog clean); (c) recomputed confidence ≥ medium with
   rationale; (d) status `investigating` (never from `proposed`); (e) all sibling hypotheses
   resolved explicitly, none silently dropped.
   *Scoping (MINOR-6): items (c)–(e) describe durable-layer promotion/memory behavior for
   001E design. They MUST NOT be read as requirements on the pure 001D decision gate, which
   is governed solely by 001D-001 (promotion rule, sibling semantics, verdicts). Where this
   baseline's shorthand suggests gate requirements beyond 001D-001, 001D-001 controls;
   residual conflict is HOLD → re-review.*
5. **Competing hypotheses**: sibling records sharing scope keys, each resolved with evidence;
   linked via `relatedFindingIds`/`supersedes`-style references. No auto-merge, no
   max-confidence-wins, no recency-wins, no voting. Selection by evidence only.
6. **Confidence evolution**: recomputed from scratch per observation (adapted `ConfidenceEngine`:
   coverage × independence × freshness × …). Repeated identical observations MUST NOT raise
   confidence (evidence-dedupe by ID). Observer `Math.max` transition floors excluded (inflation).
7. **Survival without contamination**: scope keys `(repository, normalized check/workflow
   identity, conclusion-kind, provider-neutral failure-signature hash)`. Commit is history
   (`testedAtCommit`), never scope. Branch is a filter, never scope. Run ID is an instance key,
   never scope. New commits re-test open in-scope hypotheses; scope mismatch opens a new line.
8. **Reusable evidence authority**: `@vestara/evidence` bundle/verdict/confidence patterns +
   engineering-event-store append-only substrate + Observer reference-not-value/linkage patterns.
   CI-specific truth is NEW but patterned.
9. **Projected vs authoritative**: authoritative = hypothesis versions, evidence records,
   promotion verdicts. Projected later only = Activity Room records (IDs + status +
   confidence-level + link-back), assistant snippets (001G), telemetry counts. Projection
   carries no evidentiary weight and must never be consumed as CI state.

---

## 5. 001D/001E boundary — KEEP SEPARATE (no renumbering)

- **001D = stateless pure reviewer function**: `(CIObservation, CIFailureEvidence[]) → (CIClassification, proposed CIHypothesis, promotion verdicts)`. Deterministic, no IO — unit-testable like `VerifierService`. Any LLM involvement constrained to vocabulary-bound statement drafting; classification and promotion stay rule-based and evidence-grounded.
- **001E = stateful hypothesis memory**: scope-key matching, version chains, freshness decay, re-test bookkeeping, durable append-only log + current-state index.
- Rationale: mirrors the proven stateless-verifier / stateful-store split; keeps speculation in a re-validatable pure function; gives each half its own verification gate. Merging would couple speculation to durability.
- *Shorthand scoping (MINOR-6): §5's one-line characterizations and the hypothesis-lifecycle
  language used in §§2/4/7 (statuses, versioning, transitions) are ownership pointers toward
  the durable 001E layer, not gate requirements on the pure 001D function. The 001D decision
  gate's normative requirements live exclusively in 001D-001.*

**Known adaptation exclusions** (Observer patterns that must NOT transfer): `rejected`-terminal
with no reopen path (CI requires reopen-on-contradiction); `Math.max` confidence floors
(inflation-only); `diagnosis` = "root cause identified" (conflicts with Failure ≠ Root Cause);
merge-takes-max-confidence (destroys loser lineage).

---

## 6. Risk register

- LLM speculation → canonical fact: vocabulary-bound drafting only; rule-based promotion; every record carries evidenceIds + rationale + limitations.
- Stale leakage across failures: scope-key equality required; freshness decay; commit/branch excluded from scope; reopen needs new evidence.
- Confidence inflation on repeats: recompute-from-evidence + ID dedupe; upward-only floors forbidden; tested.
- Duplicate double-counting: content-addressed evidenceIds; independence factor; merge semantics forbidden.
- Provider-native status influencing diagnosis: canonical fields only as reviewer input; raw fields provenance-only.
- Reviewer gaining repair/execution authority: 001J boundary; outputs are data, never invocations; pure function, no IO, no workflow handles.
- Rewriting history: append-only versions; reverify-chain pattern; terminal rows immutable; corrections are new versions referencing prior.

---

## 7. HOLD conditions

- H1: engineering-event-store owner does not approve substrate reuse → HOLD 001E persistence (in-memory index only, explicitly non-durable).
- H2: Observer ownership dispute (demand that CI findings flow through `ObserverFinding`/rejected-terminal lifecycle) → HOLD pending resolution; reopen-on-contradiction is non-negotiable.
- H3: Promotion authorization policy unresolved (reviewer-function-alone vs human approval) → HOLD promotion-to-finding; hypotheses may accumulate to `investigating` at most.
- H4: Provider-neutral failure-signature canonicalization undefinable → HOLD cross-run matching; single-run hypotheses only.
- Non-blocking note: the UIM Principal↔ExternalIdentity linkage question does not block 001D/E (CI identities are self-contained).

---

## 8. Prerequisites & verification gates

Prerequisites: frozen 001B/C outputs; evidence-persistence decision; scope-key + signature-hash
specification; confidence specification with anti-inflation rules; promotion criteria
specification; Activity Room CI event-type reservation (001F, no implementation).
Gates: separation-of-concerns tests; promotion-gate boundary tests; anti-inflation tests;
scope-isolation tests; immutability/version-chain tests; override-separation tests;
projection-linkback tests (later).

---

*End of CI-OBS-001D/E-000 ownership audit. Historical baseline — see precedence note above.
No implementation authorized.*

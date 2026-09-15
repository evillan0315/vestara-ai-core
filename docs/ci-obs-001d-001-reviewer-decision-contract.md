---
title: CI-OBS-001D-001 — Reviewer Decision Contract
milestone: CI-OBS-001
status: FROZEN — repository-verified reviewer decision contract (MINOR-6 and OBSERVATION-3 notes closed pre-freeze; no runtime authorized by this document)
date: 2026-09-15
baseline: docs/ci-obs-001a-ownership-audit.md (FROZEN 2026-09-15)
scope: architecture/contracts specification only — no reviewer runtime, no 001E persistence
version: 1.0.0
owner: vestara
last-reviewed: 2026-09-15
next-review: 2026-10-15
---

# CI-OBS-001D-001 — Reviewer Decision Contract

**Status**: FROZEN. Repository-verified reviewer decision contract: architecture/contracts specification only — no runtime, no persistence, no projection, no integration.

**Governing baseline**: the frozen CI-OBS-001A ownership audit (`docs/ci-obs-001a-ownership-audit.md`)
together with the accepted `CI-OBS-001D/E-000` ownership baseline
(`docs/ci-obs-001d-e-000-reviewer-hypothesis-ownership-audit.md`).
No separate ownership authority beyond these baselines is assumed.

**Baseline-contradiction rule (normative)**: if an accepted baseline contradicts this spec,
this spec does NOT silently yield and the baseline does NOT silently override this spec.
A baseline contradiction is a **HOLD requiring architecture re-review/amendment** before any
implementation proceeds under either document. Frozen/accepted contracts must never silently
subordinate themselves to later documents.

**Ownership rows applied** (001A §8):

- 001D (CI Reviewer): evidence → finding classification. **New adapter** — existing `@vestara/observer`
  (finding lifecycle) and `@vestara/evidence` (bundle pattern) are reusable **only through an explicit
  integration boundary**. 001D does not own their internals.
- 001E (Hypothesis Memory): finding persistence, rejection tracking. **Extend** `@vestara/observer`
  (`FindingLifecycleManager`) — 001E owns durability; 001D must not persist.

The accepted D/E-000 baseline refines the 001E row to "NEW durable store with ADAPTED
transition mechanics and explicit exclusions (no rejected-terminal, no confidence floors,
no merge-takes-max)". If that refinement is read as contradicting the 001A "Extend" row,
the baseline-contradiction rule above applies: HOLD for re-review, no silent resolution
in either direction.

---

## 1. Decision boundary

### 1.1 Function shape (specification, not implementation)

```text
review(
  observation : CIObservation,        // frozen 001B contract — what was seen
  evidence    : CIFailureEvidence[],  // frozen 001B contract — what was recorded
  priors      : PriorRecord[]         // read-only references to 001E durable state (by id/summary only)
) -> ReviewerDecision
```

```text
ReviewerDecision {
  classification : CIClassification   // frozen 001B vocabulary — 001D assigns, never extends
  hypotheses     : HypothesisProposal[]  // proposals only — 001E owns durable lifecycle
  promotion      : PromotionDecision     // decision record — §3; never a mutation
}
```

### 1.2 Determinism requirements

1. The reviewer is a **pure decision function** of its three inputs. Same
   `(observation, evidence, priors)` → same `ReviewerDecision`. No wall-clock reads, no network, no LLM
   calls, no ambient state inside the boundary. (Timestamps may be *carried* on the record; they must not
   *influence* the decision.)
2. Evidence is consumed **by reference** (`evidenceId`). The reviewer never re-interprets raw log bytes
   into new evidence records — that production step belongs to the frozen observation/adapter boundary.
3. Priors are consumed **by reference** (hypothesis/finding ids + their recorded status/scope). The
   reviewer never mutates, re-scopes, or re-resolves a prior; it may only *cite* it or *request*
   reconsideration via `hold` with explicit `contradictionRefs` (see §7, case 9).
4. Classification assignment is exclusive to 001D, but the *vocabulary* is frozen 001B: the reviewer
   MUST emit a member of `CI_CLASSIFICATIONS` and MUST NOT invent, rename, or narrow a member.

### 1.4 PriorRecord shape (minimum input for reconsideration, MINOR-4)

```text
PriorRecord {
  priorId         : string              // durable 001E hypothesis/finding id
  kind            : 'hypothesis' | 'finding'
  recordedStatus  : string              // status as recorded by 001E (cited, never re-resolved)
  scopeKeys       : ScopeKeys           // canonical scope per §6.5 (compared, never mutated)
  summaryOrRef    : string              // human-readable summary or durable reference
}
```

Priors are context only: they inform `rationale`, `limitations`, and the `reconsiders` link
(§7 case 9). A prior id MUST NEVER appear in `evidenceRefs` or `contradictionRefs` — those
sets contain `evidence[].evidenceId` values exclusively (§3.3.3, §8.4).

### 1.3 What the boundary does NOT do

- Produce `CIFailureEvidence` (observation/adapter owns production).
- Persist hypotheses, findings, or decisions (001E owns durability).
- Project to Activity Room (001F), answer assistant queries (001G), mutate workflow state (001H),
  notify (001I), or repair/request repair (001J).
- Call an LLM. Any future LLM assistance sits *outside* this boundary. An LLM may propose
  hypothesis wording or reasoning drafts only — and only as *candidate text* for
  `HypothesisProposal.statement` / `rationale`, still subject to all deterministic rules.
  LLM output MUST NEVER enter the evidence channel: it MUST NOT appear in `evidence[]`
  inputs, in `evidenceRefs`, or in `contradictionRefs`. Information surfaced by an LLM
  becomes canonical evidence ONLY by acquisition through an authorized evidence-producing
  boundary (adapter/observation retrieval producing a minted `evidenceId`) before the
  review consumes it (MINOR-5; invariant I13).

---

## 2. Ownership clarification (normative)

| Concern | Owner | 001D relationship |
|---|---|---|
| `CIFailureEvidence` production (retrieval, log extraction, content addressing, provenance) | Frozen observation/adapter boundary (001C + 001B `evidence.ts`) | **Consume/reference only.** 001D MUST NOT mint `evidenceId`s, MUST NOT synthesize evidence records from raw logs, MUST NOT "re-extract" evidence the adapter omitted. If evidence is missing or malformed, 001D records that fact (`unknown`, §7 case 1) — it does not repair the evidence set. 001D becoming a second evidence authority is a **BLOCKER violation**. |
| `CIClassification` vocabulary (11 members, closed) | Frozen 001B (`classification.ts`) | **Assign, never extend.** 001D owns *which* member applies to a given review. Adding/renaming/removing a member requires a 001B contract change, which this spec forbids (§9). |
| Classification assignment + reviewer decisions | **001D (this spec)** | Sole authority for `classification`, `HypothesisProposal`, and `PromotionDecision` within one review. |
| Durable hypothesis/version memory (lifecycle, supersession chains, rejection records) | **001E (future)** | 001D emits *proposals* with stable proposal ids and explicit evidence refs; 001E decides storage, versioning, and lifecycle transitions. 001D MUST NOT assume persistence semantics (no "this will supersede X in memory" — only "this *proposes* supersession of X, see refs"). |
| Rendering, querying, answering | Activity Room / Assistant (001F/001G) | **Consumers only.** They render or answer from `ReviewerDecision` records. They MUST NOT re-derive classification, MUST NOT upgrade `hold` to `promote`, MUST NOT fill in missing `rationale`. A consumer that cannot render a decision faithfully must surface it as unrenderable, not reinterpret it. |

---

## 3. PromotionDecision — a decision record, not a mutation

### 3.1 Type specification

```text
PromotionDecision {
  verdict           : 'promote' | 'hold' | 'reject' | 'unknown'
  evidenceRefs      : evidenceId[]        // affirmative evidence sufficient for the claim (§4)
  contradictionRefs : evidenceId[]        // material contradictory evidence considered (possibly empty)
  rationale         : string              // human-readable: what was claimed, why, on what basis
  limitations       : string[]            // explicit bounds: what was NOT established, what could overturn this
  confidence        : 'low' | 'medium' | 'high'   // summary of evidence quality ONLY (§4)
  verificationState : VerificationState   // where the underlying CI state stands
}

VerificationState =
  | { kind: 'ci-terminal',   conclusion: CIConclusion }  // observation reached terminal CI state
  | { kind: 'ci-nonterminal' }                           // CI still running/queued — decision is interim
  | { kind: 'retrieval-failure', reason: string }        // observation could not be established (§7 case 6)
  | { kind: 'no-observation' }                           // no observation supplied at all (§7 case 1)
```

### 3.2 Verdict semantics

- **`promote`** — the proposed classification/hypothesis is *accepted as the review's finding* and is
  eligible for downstream consumption (001E persistence, 001F projection). Promotion is eligibility,
  not truth: it asserts "affirmative evidence sufficient for the claim exists AND no material
  unresolved contradictory evidence remains" (§4). It MUST NOT trigger any mutation, notification,
  or repair by itself. **Promotion additionally requires terminal CI state** (`verificationState`
  kind `ci-terminal`): sufficient evidence during a nonterminal run may create or update
  hypotheses, but every `PromotionDecision` verdict MUST remain `hold` until the relevant CI
  observation is terminal (MAJOR-1; see H6, T4).
- **`hold`** — decision deferred. Material unresolved contradiction, insufficient evidence, competing
  hypotheses awaiting disposition, or nonterminal CI state. Carries what is missing
  (`limitations`, `contradictionRefs`). Hold is a *stable, first-class outcome*, not a timeout or retry.
- **`reject`** — the proposed classification/hypothesis is *refused on current evidence*. Requires
  affirmative contradictory evidence (not mere absence of support). A rejection MUST cite at least one
  entry in `contradictionRefs` and explain in `rationale` what would overturn it.
- **`unknown`** — the reviewer cannot decide (no evidence, retrieval failure, UNKNOWN classification
  with nothing further to say). `unknown` MUST carry `limitations` describing what would enable a
  decision. `unknown` is valid and terminal *for this review* — it is never a CI failure and never a
  finding of fault.

### 3.3 Record-not-mutation invariants

1. A `PromotionDecision` changes nothing outside itself. No lifecycle transition, no memory write, no
   projection, no notification follows automatically.
2. Every downstream consumer MUST treat `hold` / `reject` / `unknown` as complete answers, not as
   errors to retry or escalate around. Retrying a review with identical inputs MUST yield the identical
   decision (§1.2.1); retry-until-promote is a governance violation.
3. `evidenceRefs` and `contradictionRefs` MUST contain only ids present in the review's
   evidence inputs (`evidence[].evidenceId`) — the affirmative set and the contradiction set
   are disjoint in role though both draw from input evidence (OBSERVATION-2). Prior-record
   ids (`PriorRecord.priorId`) MUST NEVER appear in either set; priors are cited in
   `rationale`, `limitations`, and the `reconsiders` link only (§1.4, §7 case 9). Dangling
   refs, prior ids in either ref set, or empty-`evidenceRefs` promotes invalidate the
   decision (HOLD, §8.4).

---

## 4. Confidence ≠ Evidence (normative)

1. **Confidence summarizes; evidence authorizes.** `confidence` is a summary judgment of evidence
   *quality* (corroboration, provenance strength, specificity). It is an output annotation, never an
   input to the promotion rule.
2. **`confidence >= medium` is NEVER by itself authorization to promote.** A `promote` verdict with
   `evidenceRefs: []` is invalid regardless of `confidence: high`. Reviewers (human or automated)
   MUST reject such records at validation time (HOLD, §8.4).
3. **Promotion rule (conjunctive, both required):**
   - (a) **Affirmative sufficiency**: `evidenceRefs` is non-empty AND each cited item genuinely
     supports the claimed classification/hypothesis (not merely co-occurring with the failure), AND
     `evidenceRefs` contains one entry per distinct signal — duplicate records of the same signal
     live in `rationale`/`limitations`, never in `evidenceRefs` (case 4, OBSERVATION-1); AND
   - (b) **No material unresolved contradiction**: every item in `contradictionRefs` has a recorded
     disposition (explained away with reason, out-of-scope with reason, or re-scoped), OR
     `contradictionRefs` is empty because no contradictory evidence exists in the inputs — where
     "exists" is determined by examination, not assumed.
4. Confidence calibration guidance (non-authoritative, for reviewer consistency):
   - `high`: multiple independent supporting items, provider provenance intact, no contradiction ever observed.
   - `medium`: single strong item or multiple weak-but-convergent items, provenance intact.
   - `low`: single weak item, degraded provenance, or any reliance on priors beyond their recorded scope.
   Calibration NEVER relaxes rule 3.

---

## 5. Competing-hypothesis semantics (normative)

Let *siblings* be two or more `HypothesisProposal`s in one `ReviewerDecision` addressing the same
observation.

1. **Coexistence**: siblings MAY coexist. The decision record carries all of them with independent
   `evidenceRefs` / `contradictionRefs` / `confidence`. There is no slot limit and no requirement to
   rank them.
2. **No winner rule**: there is NO max-confidence-wins, NO recency-wins, NO vote-count-wins. A consumer
   MUST NOT select a "winning" hypothesis by comparing `confidence` values or `proposedAt` order.
3. **No automatic veto**: an unresolved sibling ALONE does not veto promotion of another sibling.
   Promotion is per-proposal: sibling A may `promote` while sibling B `hold`s, provided A's own
   promotion rule (§4.3) is satisfied on A's refs AND the CI observation is terminal (MAJOR-1 —
   nonterminal CI permits no `promote` verdict on any sibling).
4. **Contradiction DOES block**: material contradictory evidence *contributed by or through* a sibling
   (i.e., evidence cited in any sibling's `contradictionRefs`, or supporting sibling B while
   incompatible with sibling A) MUST block or HOLD sibling A's promotion until disposition. The
   blocking item must be named in A's `contradictionRefs` with a disposition, or A's verdict MUST be
   `hold` (not `promote`).
5. **Explicit preservation**: every sibling considered remains explicit in the record, including
   `reject`ed ones with their overturn conditions. Siblings MUST NOT be dropped, merged silently, or
   folded into a "primary + others" summary that loses their refs. Historical preservation across
   reviews is 001E's job; *within* a review, completeness is 001D's job.

### HypothesisProposal shape (specification)

```text
HypothesisProposal {
  proposalId        : string              // stable within the review; 001E maps to durable ids
  statement         : string              // the claim (e.g. "worker OOM — resource exhaustion")
  classification    : CIClassification    // proposed assignment for this hypothesis
  status            : 'proposed'          // proposals are always born 'proposed'; lifecycle is 001E's
  evidenceRefs      : evidenceId[]        // supporting refs (this proposal's §4.3a case)
  contradictionRefs : evidenceId[]        // contradicting refs known to this proposal
  confidence        : 'low' | 'medium' | 'high'   // per-proposal summary (§4)
  verdict           : 'promote' | 'hold' | 'reject' | 'unknown'  // per-proposal promotion
  supersedesProposal?: string            // optional intra-review link; durable supersession is 001E's
}
```

---

## 6. Failure-signature inputs required by 001E (specification only)

001E will need stable, provider-neutral inputs to key durable hypothesis memory (deduplication,
rejection lookup, reopen-on-contradiction). 001D MUST therefore ensure every `ReviewerDecision` *carries*
the following inputs in a canonical, persistable form. **No hashing algorithm, no similarity metric, no
storage schema, and no persistence code is defined here** — that is 001E's design space. This section
defines only the *input contract* 001E may rely on.

Required signature inputs (all provider-neutral, all drawn from frozen 001B contracts):

1. `classification` — the assigned `CIClassification` member.
2. `evidenceKinds` — sorted multiset of `CIFailureEvidence.kind` values over `evidenceRefs`.
3. `evidenceDigests` — the `evidenceId` of each cited item (content hash or provider id as produced by
   the adapter; 001D MUST NOT re-hash or normalize — it passes ids through opaquely).
4. `signalExcerpts` — a bounded, canonical excerpt set: for each cited evidence item, the reviewer
   records *which* sub-signal it relied on (`stepName`, `exitCode`, and a short quoted excerpt of
   `summary`/`logContent`), NOT the full log. Full logs stay behind provenance URLs. Excerpt
   selection is deterministic and bounded (MINOR-2): at most 5 lines and 500 characters per
   item, taken in order from the start of the relied-upon signal, with any truncation marked
   by a single trailing `[…truncated]` marker. No other excerpt content is canonical.
5. `scopeKeys` — `(owner/name via CIRepositoryRef, workflow/run identity CIRunId, commit CICommitId,
   attempt CIAttempt)` identifying *where* the hypothesis was tested. Scope bounds reuse (§7 case 9,
   milestone 001E example: "reuse only when scope remains applicable").
6. `contradictionMarkers` — ids in `contradictionRefs` plus their dispositions, so 001E can detect
   "new contradictory evidence" as *evidence ids not previously dispositioned*.

Non-requirements (explicitly NOT promised to 001E): normalized log text, embedding vectors, fuzzy-match
thresholds, cross-provider canonicalization beyond the 001B vocabularies. If 001E needs those, it defines
and owns them.

---

## 7. Deterministic behavior — case specifications

Each case states required outputs. "Required verdict" means any conforming reviewer MUST produce it
given the stated inputs; alternative verdicts are non-conformant.

### Case 1 — No evidence (`evidence: []`)

- `classification`: `UNKNOWN`.
- `hypotheses`: `[]` (no proposals without evidence — a proposal with empty `evidenceRefs` is invalid).
- `promotion.verdict`: `unknown`. `verificationState`: `no-observation` if observation absent,
  otherwise the observation's actual state.
- `limitations` MUST state what evidence would enable a decision (e.g. "failed-step logs for job X").
- Rationale: absence of evidence is not evidence of any classification.

### Case 2 — Insufficient evidence (evidence exists, none sufficient for a non-UNKNOWN claim)

- `classification`: `UNKNOWN` (per milestone example: "Evidence: Insufficient. Classification: UNKNOWN.").
- `hypotheses`: MAY contain `hold` proposals narrating the leading suspicion, each with its thin
  `evidenceRefs` and `confidence: low`. MUST NOT contain a `promote` proposal.
- `promotion.verdict`: `hold` (review-level) when CI is nonterminal or more evidence is obtainable;
  `unknown` when the evidence set is complete and still insufficient. The distinction MUST be stated
  in `rationale`.
- `limitations` MUST name the missing sufficiency ("single log line corroborates OOM but exit code
  and runner metrics absent").

### Case 3 — Contradictory evidence (support for claim C AND material evidence against C)

- The affected proposal's verdict MUST be `hold` or `reject`, never `promote`, until disposition.
- `hold` when the contradiction is undispositioned (needs investigation, rerun, or more evidence).
- `reject` when the contradiction affirmatively defeats the claim (requires ≥1 `contradictionRefs`
  entry + overturn conditions in `rationale`).
- The review-level `promotion.verdict` MUST be at most `hold` while any material contradiction is
  undispositioned — even if a *different* sibling is otherwise promotable and the contradiction does
  not touch it? No: per §5.3–5.4, the block is per-proposal. The review-level verdict is `hold` iff
  NO sibling promotes; if a clean sibling promotes, the review carries that promotion alongside the
  held sibling. The held sibling's `contradictionRefs` MUST name the blocker.

### Case 4 — Duplicate evidence (same signal, multiple records)

- Duplicate detection uses ONLY adapter-provided identity and deterministic equality over
  existing canonical evidence fields (MINOR-3): same `evidenceId`, adapter-flagged
  re-emission across attempts, or equality on (`kind`, `stepName`, `exitCode`, §6.4 excerpt
  selection). 001D MUST NOT compute new hashes over log bytes or any other content to
  detect duplicates — re-hashing is evidence production outside the reviewer boundary.
- The affirmative sufficiency set (`evidenceRefs`) MUST contain exactly one entry per
  distinct signal (OBSERVATION-1). Duplicate records of an already-cited signal MUST NOT
  appear in `evidenceRefs`; their provenance (duplicate ids and which signal they repeat)
  is recorded in `rationale` and `limitations` instead. Duplicate references MUST NOT
  inflate support.
- A `promote` resting on N copies of a single signal where one copy would be insufficient is invalid
  (HOLD, §8.4). Corroboration requires *independent* signals (different steps, kinds, or attempts).

### Case 5 — UNKNOWN classification (with evidence)

- `UNKNOWN` is a valid terminal assignment, not a fallback error. Used when evidence is genuine but
  nonspecific (e.g. "worker exited unexpectedly", no exit code, no OOM marker).
- Requires: `evidenceRefs` non-empty (something WAS observed), `rationale` quoting/paraphrasing the
  observed-but-nonspecific signal, `limitations` stating what specificity is missing.
- Verdict for an UNKNOWN proposal: `hold` if specificity might be obtainable (logs pending, rerun
  possible), `unknown` if the record is complete. Promoting UNKNOWN-as-finding ("UNKNOWN is the
  accepted finding", rendered downstream strictly as "Investigation required", never as a
  diagnosis) is permitted ONLY when the CI observation is terminal (MAJOR-1) — at nonterminal
  state the verdict MUST be `hold`, never `promote`-as-finding-of-cause and never
  `promote`-as-UNKNOWN-accepted.

### Case 6 — Retrieval failure (adapter reports failure, not CI state)

- The reviewer MUST NOT classify the CI failure at all. `classification`: `UNKNOWN`.
- `promotion.verdict`: `unknown` with `verificationState: { kind: 'retrieval-failure', reason }`.
- The `reason` MUST be carried from the adapter/observation (`isRetrievalFailure` provenance), not
  invented. No `evidenceRefs`, no proposals. Retrieval failure ≠ CI failure (frozen invariant) —
  nothing in this decision may be rendered as "CI failed".
- If a prior review of the same run exists, the reviewer MAY cite it in `rationale` as context but
  MUST NOT re-emit its verdict as this review's decision.

### Case 7 — Multiple competing hypotheses

- Emit all conforming siblings (§5.1). Each carries an independent verdict.
- Allowed outcome matrix (per-proposal verdicts are independent subject to §5.4):
  `(promote, hold)`, `(hold, hold)`, `(hold, reject)`, `(reject, reject)`, `(promote, promote)` ONLY
  if the two claims are compatible (both can be true — e.g. TEST + FLAKE on different checks) AND
  neither's evidence contradicts the other. Incompatible dual-promote is invalid (HOLD, §8.4).
- Review-level `promotion.verdict`: `promote` iff ≥1 sibling promotes (which itself requires
  terminal CI state per MAJOR-1 — at nonterminal state the review verdict is `hold` whenever
  proposals exist, `unknown` when none do); else `hold` iff ≥1 holds; else `reject` iff ≥1
  sibling rejects; else `unknown`. The review-level `evidenceRefs` is the union of
  promoting siblings' refs (empty when nothing promotes).

### Case 8 — Evidence supporting more than one hypothesis

- Shared support MUST be cited in EACH supported proposal's `evidenceRefs` (no exclusive ownership of
  evidence). Each proposal MUST additionally cite at least one *discriminating* consideration in
  `rationale` (what would distinguish it from the sibling), or both proposals MUST be `hold` with
  `limitations` naming the missing discriminator.
- Shared evidence alone can never promote two incompatible hypotheses (follows from case 7 +
  duplicate-signal rule case 4). At most the compatible subset may promote.

### Case 9 — Later evidence contradicting a prior finding (001E interplay)

- 001D inputs include the prior as a cited `PriorRecord` (id + status + scope). The reviewer MUST NOT
  mutate it. Outputs:
  - The new proposal carries the prior id in a `reconsiders` field (an allowed extension of
    `HypothesisProposal` for this case) with `contradictionRefs` naming the new evidence.
  - Verdict on the new proposal follows cases 2–3 normally. The prior's standing is 001E's to update;
    001D expresses only a *recommendation* in `rationale` ("evidence E-new contradicts finding F-old
    within scope S; recommend 001E reopen").
  - Scope discipline (milestone 001E rule): reuse/reopen reasoning MUST compare `scopeKeys` (§6.5).
    Contradictory evidence from OUTSIDE the prior's scope does not reopen it — the reviewer MUST say
    so in `limitations`, and the proposal is a *new-scope* proposal, not a reconsideration.
- "Never convert a historical finding into a universal truth" (frozen): a prior `promote` MUST NOT be
  cited as affirmative evidence (`evidenceRefs`) for a new claim. Priors inform `rationale` and
  `limitations` only.

---

## 8. Transition / decision table

Inputs per row: observation state × evidence condition. Outputs: required classification family,
proposal verdicts, review-level verdict.

**Row precedence (deterministic, OBSERVATION-3)**: the most-specific applicable row governs,
evaluated in this order — (1) T15 self-validation failure (invalid record → HOLD) first;
(2) nonterminal observation → T3/T4 fail-closed regardless of evidence sufficiency (no
`promote` verdict is reachable while CI is nonterminal); (3) terminal rows by specificity:
T14 (prior interplay) > T10 (duplicates-only) > T11/T12 (shared support) > T7/T8
(contradiction/defeat) > T9 (nonspecific) > T6 (clean sufficient) / T13 (non-failed) /
T5 (empty); T1/T2 for absent/retrieval-failure inputs. Ordering among rows that all yield
`hold`/`unknown` is immaterial to the verdict and affects rationale content only.

| # | Observation | Evidence condition | Classification | Proposals | Review verdict |
|---|---|---|---|---|---|
| T1 | absent | — | `UNKNOWN` | none | `unknown` (`no-observation`) |
| T2 | retrieval-failure | — | `UNKNOWN` | none | `unknown` (`retrieval-failure`) |
| T3 | nonterminal, any | empty | `UNKNOWN` | none | `unknown` |
| T4 | nonterminal, any | any non-empty (insufficient OR sufficient) | `UNKNOWN` | `hold` allowed, no `promote` under any evidence condition | `hold` |
| T5 | terminal `failed` | empty | `UNKNOWN` | none | `unknown` + limitations |
| T6 | terminal `failed` | sufficient, no contradiction | specific member | `promote` (compatible set only) | `promote` |
| T7 | terminal `failed` | sufficient + undispositioned contradiction | specific or `UNKNOWN` | `hold` (affected) | `hold` unless a clean sibling promotes (§7 case 3) |
| T8 | terminal `failed` | defeated by contradiction | specific-rejected or `UNKNOWN` | `reject` (≥1 contradictionRef) | `hold`/`reject` per §7 case 7 matrix |
| T9 | terminal `failed` | genuine but nonspecific | `UNKNOWN` | `hold` or `unknown` | `hold` or `unknown` (§7 case 5) |
| T10 | terminal `failed` | duplicates-only sufficiency | `UNKNOWN` | `hold` | `hold` (single-signal, §7 case 4) |
| T11 | terminal `failed` | shared support, no discriminator | `UNKNOWN` or sibling members | both `hold` | `hold` |
| T12 | terminal `failed` | shared support + discriminator | discriminated member | winner `promote`, loser `hold`/`reject` | `promote` |
| T13 | terminal non-failed (`passed`/`cancelled`/`timed_out`/`skipped`) | any | `CANCELLED` only for cancelled runs with no affirmative failure evidence for another member (else the evidenced member); otherwise `UNKNOWN` | none normally; `hold` only if evidence demands review | `unknown` (no failure to classify) |
| T14 | terminal `failed` + prior contradicts/scope-overlaps | new contradictory evidence | per new evidence (T6–T8) | reconsideration proposal + `reconsiders` link | per proposal matrix; recommendation to 001E in rationale |
| T15 | any | dangling refs / confidence-promote / dual-incompatible-promote | — | — | **HOLD** (§8.4 validation failure) |

Notes:

- T13: `CANCELLED` classification is reserved for cancelled runs **with no affirmative
  failure evidence for another member** (MINOR-1): when a cancelled run carries evidence
  sufficient for a different canonical classification, the reviewer MUST assign that member
  and record the cancellation as `rationale`/`limitations` context — never as the
  classification. `conclusion == cancelled → classification CANCELLED` by table lookup is
  non-conformant whenever such evidence exists. All other non-failed terminal conclusions
  (`passed`/`timed_out`/`skipped`/terminal-`unknown`) yield `UNKNOWN` + `unknown` with no
  proposals regardless of attached evidence (MINOR-1 reconciliation with the approved
  fail-closed kernel: only cancellation carries the evidence-sensitive exception, because
  only cancellation can mask an underlying failure; a timed-out/passed/skipped run presents
  no failure to classify, so its evidence is not classified now). The reviewer MUST NOT map
  conclusions to classifications by table lookup — conclusion informs, evidence decides.
- T6 "sufficient" always means §4.3 (affirmative + no unresolved contradiction), never a confidence
  threshold.

---

## 9. Frozen-contract protection (001B)

1. **No 001B change is authorized by this spec.** The vocabularies (`CIClassification`,
   `CIFailureEvidence`, `CIHypothesis`, `CIFinding`, `CIObservation`, conclusions, identities) are
   consumed as-frozen.
2. **HOLD, don't modify.** If reviewer design proves a 001B defect (e.g. a failure mode with no
   honest classification, an evidence kind with no member), the reviewer MUST emit `hold`/`unknown`
   with `limitations` describing the gap, and the program MUST HOLD for a separately authorized 001B
   amendment. Silently widening a vocabulary, stuffing a meaning into `UNKNOWN`, or carrying the gap
   in free-text `rationale` as a shadow vocabulary are all non-conformant.
3. The only 001B members this spec *interprets* (not modifies) are `UNKNOWN` classification/conclusion
   and `isRetrievalFailure` — interpretation is documented in §7 cases 1/5/6 and does not change the
   contracts.

---

## 10. Invariants (normative, testable)

- I1 Observation ≠ Hypothesis ≠ Finding. No output field conflates them: `classification` is a finding,
  `HypothesisProposal` is a claim, the observation is input.
- I2 Failure observation ≠ explanation. A terminal-`failed` observation with no evidence yields
  `unknown`, never an inferred classification.
- I3 Claim ≠ Evidence. Every `promote`/`reject` cites refs; uncited verdicts are invalid.
- I4 Confidence ≠ Evidence. §4.2–4.3 hold for every proposal and review.
- I5 Retrieval failure ≠ CI failure. Case 6 outputs are never rendered or consumed as CI outcomes.
- I6 UNKNOWN is valid. `UNKNOWN` classification and `unknown` verdict are conformant terminal outputs.
- I7 Single evidence authority. 001D mints no `evidenceId`, synthesizes no evidence, re-extracts nothing.
- I8 Closed vocabularies stay closed. Emitted `classification`, evidence `kind` references, and verdict
  strings are members of the frozen sets.
- I9 No silent winners or silent drops. §5.2, §5.5 hold for every multi-sibling review.
- I10 Decision is record, not mutation. No output implies or triggers a state change (§3.3).
- I11 Determinism. Identical inputs → identical decision (§1.2.1).
- I12 Scope-bounded reuse. Priors never serve as `evidenceRefs`; cross-scope contradiction never reopens (§7 case 9).
- I13 LLM output ≠ evidence. No LLM-produced content enters `evidence[]`, `evidenceRefs`,
  or `contradictionRefs`; LLM-sourced information becomes evidence only via an authorized
  evidence-producing boundary (§1.3).

---

## 11. HOLD conditions (reviewer MUST output hold/unknown, downstream MUST NOT override)

- H1 Insufficient evidence for any non-UNKNOWN claim (cases 1–2).
- H2 Material unresolved contradiction (case 3, §5.4).
- H3 Single-signal duplication masquerading as corroboration (case 4).
- H4 Missing discriminator between jointly-supported siblings (case 8).
- H5 Retrieval failure or absent observation (cases 1, 6).
- H6 Nonterminal CI (MAJOR-1): sufficient evidence during a nonterminal run may create or
  update hypotheses, but every `PromotionDecision` verdict MUST remain `hold` until the
  relevant CI observation is terminal. No interim-promotion exception exists; "scope-complete"
  arguments do not authorize promotion. T4 governs all nonterminal non-empty cases.
- H7 Suspected 001B vocabulary gap (spec §9.2 — HOLD for amendment, never improvise).
- H8 Self-validation failure: dangling refs, empty-`evidenceRefs` promote, incompatible dual-promote,
  dropped sibling. The reviewer MUST self-HOLD (T15) rather than emit the invalid record.

---

## 12. Verification cases (acceptance for the future runtime; no code in this milestone)

Each case is stated as input → required output. A conforming implementation (later milestone) MUST pass
all of them; the contract is specified here so conformance is checkable without re-litigating semantics.

- V1 Empty evidence → `UNKNOWN` / no proposals / `unknown` (+ limitations naming needed evidence).
- V2 Single weak log line ("worker exited unexpectedly", no code) → `UNKNOWN`, at most a
  `low`-confidence `hold` proposal, review `hold`/`unknown` — never `promote`.
- V3 Strong test-output evidence (named failing tests, exit code, step) with no contradiction,
  terminal CI state → specific classification (`TEST`), `promote` with non-empty `evidenceRefs`,
  confidence per calibration. At nonterminal state the same inputs MUST yield T4 `hold`.
- V4 V3 + an infra-status excerpt contradicting it → affected proposal `hold`, blocker in
  `contradictionRefs`, review `hold` (unless a clean sibling promotes).
- V5 Two duplicate records of one signal (same `evidenceId`, adapter-flagged re-emission, or
  §6.4 field-equality) as sole support → `hold` with single-signal rationale; duplicates
  recorded in `rationale`/`limitations`, excluded from `evidenceRefs`.
- V6 `check_run_url`-scale retrieval failure input → `unknown` + `retrieval-failure` state, zero
  proposals, nothing renderable as CI failure.
- V7 Two incompatible hypotheses sharing one log line, no discriminator → both `hold`, review `hold`.
- V8 V7 + a discriminating exit-code excerpt, terminal CI state → discriminated sibling
  `promote`, other `hold`/`reject`, review `promote`. At nonterminal state: discriminated
  sibling `hold`, review `hold`.
- V9 Compatible siblings (TEST on check A + FLAKE on check B, disjoint refs, no cross-contradiction),
  terminal CI state → dual `promote` allowed, review `promote` with union refs. At
  nonterminal state: both `hold`, review `hold`.
- V10 `high` confidence with empty `evidenceRefs` → validation HOLD (invalid record, T15).
- V11 Prior REJECTED finding cited as `evidenceRefs` support for a new claim → invalid; priors inform
  rationale only (HOLD).
- V12 Out-of-scope contradictory evidence vs. a prior (scope keys differ) → new-scope proposal, prior
  NOT reconsidered, `limitations` states the scope boundary.
- V13 Non-`UNKNOWN` classification string outside `CI_CLASSIFICATIONS` → invalid output (I8).
- V14 Identical inputs reviewed twice → decisions equivalent on all canonical decision fields
  (verdicts, `evidenceRefs`, `contradictionRefs`, classification, confidence, scope keys,
  excerpt selections per §6.4). `rationale`/`limitations` prose is compared semantically
  (same claims, same cited ids, same overturn conditions) — prose formatting is NOT part
  of canonical identity (MINOR-2).
- V15 UNKNOWN-with-evidence record (V2 evidence, complete set, terminal CI state) →
  `UNKNOWN` promoted-as-finding renders as "Investigation required", with `limitations`
  stating missing specificity. At nonterminal CI state the same inputs MUST yield `hold`.

---

## 13. Explicitly out of scope (not in 001D-001, not implied)

LLM calls; any persistence or lifecycle mutation (001E); Activity Room projection (001F); Assistant
integration (001G); workflow mutation (001H); notifications (001I); repair or repair authorization
(001J); hashing/similarity/storage design for failure signatures (§6 inputs only); 001B amendments;
any runtime code, schemas, migrations, or API routes.

---

## 14. Reviewer checklist for architecture review

1. Does §1 draw the boundary so 001D cannot become a second evidence authority? (§2 row 1, I7, H8)
2. Is `PromotionDecision` purely a record? (§3.3 — any implied mutation is a defect in this spec.)
3. Does §4 make confidence-sets-promotion impossible by construction? (V10 must fail validation.)
4. Are sibling semantics free of winner rules and silent drops? (§5, V7–V9.)
5. Is every §7 case deterministic (required verdict, no discretionary promote)?
6. Are §6 signature inputs sufficient for 001E design without committing 001E to any storage?
7. Is §9 HOLD-instead-of-modify unconditional? Any 001B edit emerging from this review must be
   re-authorized separately.

---

## 15. Remediation record (2026-09-15, documentation/specification only)

Independent architecture review findings dispositioned in this revision; no runtime,
persistence, contracts, or behavior changes were made or authorized:

- **MAJOR-1 (nonterminal CI → no finding promotion) — RESOLVED deterministically.**
  H6 interim-promotion exception removed; T4 now governs all nonterminal non-empty
  cases (`hold`, never `promote`); `promote` requires terminal CI state (§3.2, §5.3,
  §7 cases 5/7, V15 reconciled).
- **MAJOR-2 — NO ACTIONABLE CONTENT.** No MAJOR-2 finding text exists in the review
  authorization or the repository record. Nothing was reinterpreted or invented to fill
  it. Flagged for Reviewer clarification; this item MUST NOT be treated as resolved.
- **MINOR-1 (evidence-sensitive cancellation) — RESOLVED.** T13 + notes: cancelled runs
  carrying affirmative failure evidence take the evidenced classification; cancellation
  remains rationale/limitation context.
- **MINOR-2 (excerpt determinism / equivalence scope) — RESOLVED.** §6.4 bounded excerpt
  rule (≤5 lines / ≤500 chars, ordered, marked truncation); V14 narrowed to canonical
  decision fields + semantic prose equivalence.
- **MINOR-3 (no reviewer-side hashing) — RESOLVED.** Duplicate detection via
  adapter-provided `evidenceId` + deterministic field equality only (§7 case 4, V5).
- **MINOR-4 (PriorRecord shape) — RESOLVED.** Minimum input shape defined (§1.4);
  priors context-only, never refs.
- **MINOR-5 (LLM output ≠ evidence) — RESOLVED.** LLM restricted to wording/reasoning
  drafts; evidence channel barred (§1.3, I13).
- **OBSERVATION-1 (sufficiency vs provenance) — RESOLVED.** `evidenceRefs` holds one
  entry per distinct signal; duplicate provenance lives in `rationale`/`limitations`
  (§4.3a, §7 case 4, V5).
- **OBSERVATION-2 (ref terminology + ordering) — RESOLVED.** `evidenceRefs` /
  `contradictionRefs` draw exclusively from input evidence ids; prior ids confined to
  rationale/`reconsiders` (§3.3.3, §1.4); "strongest" ordering replaced with explicit
  precedence (§7 case 7).

*End of CI-OBS-001D-001 specification. STOP for architecture review — no implementation authorized.*

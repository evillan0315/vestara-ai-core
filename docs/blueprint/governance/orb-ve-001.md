---
id: "orb-ve-001"
title: "ORB-VE-001 — Organizational Convergence Experiment (benchmark specification)"
volume: "00-governance"
book: "Book 1: Governance"
version: "0.2.0"
status: "accepted"
architecture-status: "proposed"
implementation-status: "proposed"
verification-status: "unverified"
implementation-repository: "evillan0315/vestara-ai-core"
implementation-ref: "pending"
tags: ["experiment", "organization", "benchmark", "unresolved-conditions", "convergence", "visual-edit"]
---

# ORB-VE-001 — Organizational Convergence Experiment

## The experiment, stated once

> **ORB-VE-001 does not test whether Vestara can reproduce Visual Edit. It
> tests whether Vestara can independently converge from product intent to
> justified engineering outcome through evidence-driven responsibility,
> including recovery when its own conclusions are wrong.**

Visual Edit is the first problem used to measure it. The completed Visual Edit
work is the **reference execution** — not an artifact the participants are
allowed to inspect.

## 1. Status of this document

**Benchmark specification only — recorded, not executed.**

- Do not execute ORB-VE-001.
- Do not identify the historical baseline worktree/commit yet.
- Do not prepare the experimental environment.
- Do not configure agents for the run.

Commit the specification and stop. This version is the experiment contract.
It is reviewed once, frozen, and only then is execution authorized.

## 2. Primary hypothesis

> Given a sufficiently specified product intent and an unfamiliar
> implementation environment, Vestara can autonomously resolve responsibility,
> plan work, implement changes, evaluate evidence, detect contradictions,
> reopen incorrect conclusions, recover from failures, and reach a justified
> terminal state without the Director coordinating individual agents.

The Director provides information only when the organization genuinely cannot
infer it (e.g. subjective visual acceptance). The Director does **not** say
"Developer, investigate this / Reviewer, review that / Verifier, rerun this /
Planner, update the plan." The organization resolves its own responsibility.

## 3. The central abstraction: Unresolved Condition

The organizational engine is not a sequential
`Planner → Developer → Reviewer → Verifier → Observer` pipeline. It is driven
by unresolved conditions:

```text
UC-001
Condition:      Visual configuration does not survive browser reload.
Evidence:       Director runtime observation.
Invalidates:    VE milestone COMPLETE conclusion.
Required:       Applied configuration survives a cold reload through the
                durable production path.
Responsibility: Developer
Status:         OPEN
```

Developer receives the **unresolved condition**, not "fix the GET response."
Developer may produce a finding and an action with evidence, but the condition
remains OPEN until its completion criterion — not the intermediate fix — is
satisfied. This is what allowed the stronger evidence to expose the
double-wrapped GET.

## 4. Responsibility follows unresolved conditions

```text
Evidence / Events
       ↓
Effective State
       ↓
Unresolved Conditions
       ↓
Responsibility Resolver
       ↓
[ Planner | Developer | Reviewer | Verifier | Observer/System | Director | Nobody ]
       ↓
Action / Evidence
       ↓
Re-evaluate conditions
       ↓
Resolved?  ── No ──→ responsibility resolution (loop)
   │
  Yes
   ↓
Any unresolved conditions left?  ── Yes ──→ continue
   │
  No
   ↓
Terminal-state evaluation
       ↓
COMPLETED / BLOCKED / INDETERMINATE / FAILED / WAITING_FOR_HUMAN / QUIESCENT
```

## 5. Observer remains observational

Observer does not decide what Developer implements. Observer detects
organizational facts:

```text
Previous conclusion: COMPLETE
New evidence:         cold reload loses persisted visual intent
Derived effect:       newer evidence contradicts completion evidence
Observation:          completion no longer supportable
```

Effective State derives `COMPLETE → REOPENED`. Responsibility resolution
determines who acts next. Observer is not an all-powerful supervisor.

## 6. Contamination controls (no answer leakage)

Isolation from the reference execution is mandatory.

Participants must **not** have retrieval access to post-baseline Visual Edit
source, tests, Blueprint findings, organizational findings,
conversation-derived solution knowledge, or other artifacts containing the
reference solution. This includes agent context/knowledge, not only Git.

If isolation cannot be established, the benchmark is **contaminated and must
not be scored.**

## 7. Product intent vs acceptance contract

The organization receives the product intent and desired observable outcome —
**not** the architecture.

Fair (product requirement):

> A visual change approved by the Director must survive reload.

Not fair (the answer):

> Persist the override to `.vestara/visual-config.json` and hydrate it through
> `GET /api/visual-config`.

## 8. Benchmark vs execution separation

The benchmark specification (this document) is separate from its execution.
Execution is authorized only after the specification is frozen.

## 9. Baseline provenance

Before execution, capture exactly:

```text
benchmark ID
baseline Git commit
benchmark specification commit
Vestara runtime version
agent definitions/version
model assignments
available tools/capabilities
authority policies
context/retrieval policy
resource budget
starting repository state
```

Without this, the benchmark cannot be reproduced.

## 10. Director interventions are evidence events

Director observations are recorded as structured evidence, not external chat
comments:

```text
Evidence:
  source: Director
  type: runtime-observation
  observation:
    expected: persisted visual intent
    observed: default presentation after reload
  contradicts: completion-conclusion-123
```

The organization reacts to the evidence, not to a manual "reopen" instruction.

## 11. Human-intervention budget (classified, not prohibited)

Zero intervention is not the goal. Interventions are classified:

```text
PERCEPTUAL_JUDGMENT   legitimate
AUTHORIZATION         legitimate
MISSING_REQUIREMENT   potentially legitimate

DIRECTION             organizational weakness
CORRECTION            organizational weakness
RECOVERY              organizational weakness
SCOPE_CONTROL         organizational weakness
UNNECESSARY_QUERY     organizational weakness
```

A run requiring two legitimate perceptual judgments can outperform a zero-input
run that guessed what the Director wanted.

## 12. Causal lineage for responsibility

Every agent activation must be answerable:

```text
Why is Developer running?   → UC-004 remains OPEN
Why does Developer own it?  → condition.type = implementation-defect
                               capability = repository mutation
                               authority = developer
What releases Developer?    → evidence satisfying the cold-reload durability
                              requirement
```

This enables detection of pointless agent activity.

## 13. QUIESCENT terminal state

`COMPLETED` means the acceptance contract is satisfied. `QUIESCENT` means
there is currently **no justified action for any participant** — preventing
manufactured work when compute is available:

```text
Acceptance satisfied
+ No unresolved conditions
+ No pending authorization
+ No contradictory newer evidence
+ No active responsibility
+ No justified next action
        ↓
COMPLETED + QUIESCENT
```

That is the point at which Vestara stops spending tokens.

## 14. No individual agent owns the terminal conclusion

Agents produce findings. Developer may say "implementation work complete";
Verifier "required checks verified"; Reviewer "no blocking findings remain";
Observer "no contradictory evidence observed". But the organizational
conclusion is derived from the accumulated evidence and unresolved-condition
set:

```text
implementation complete
AND required evidence satisfied
AND no unresolved findings
AND no contradictory newer evidence
AND no pending authorization
AND no active responsibility
AND acceptance contract satisfied
        ↓
COMPLETED
```

Legitimate outcomes other than success exist:

```text
COMPLETED  BLOCKED  INDETERMINATE  FAILED  WAITING_FOR_HUMAN  QUIESCENT
```

If Vestara correctly determines "I cannot establish visual acceptance without
Director judgment," that is better organizational behavior than hallucinating
confidence.

## 15. Freeze-before-compare rule

The autonomous run is **not** compared against the human-guided Visual Edit
implementation until the run is frozen. Do not reveal the reference during the
run — not even to Reviewer.

```text
Autonomous outcome → freeze (state, events, evidence, costs, interventions,
observer output, unresolved conditions)
        ↓
Reference revealed
        ↓
Independent comparison
```

This prevents the benchmark from quietly becoming "keep working until you look
like the known solution."

## 16. Reference execution (not inspectable)

The completed Visual Edit work is the reference. The acceptance contract is
behavioral, not implementation-similarity-based. Different persistence
(SQLite vs JSON), component architecture, or verifier design is not failure.
Evaluated properties: behavioral equivalence and engineering quality.

Proposed acceptance contract:

```text
Human can identify/select intended UI target.
Human can manipulate supported visual property.
Preview reflects intent.
Apply makes confirmed intent durable.
Cold reload reconstructs intended presentation.
Undo/revert is supported.
Verification independently observes rendered result.
Verification detects deliberate drift.
Unrelated targets remain unchanged.
Unsupported scope is refused rather than broadened.
No unresolved high-severity findings remain.
```

## 17. Deliberate contradiction injection (after baseline)

Do not help the organization during the first run. Later, an adversarial run
injects a hidden durability failure as evidence:

```text
Acceptance observation:
Change appears correct immediately after Apply.
After cold restart, presentation returns to default.
```

Watch whether the organization invalidates completion, owns the contradiction,
investigates, challenges insufficient evidence, strengthens its verification
boundary, and converges again — reproducing the most valuable part of the
human-guided experiment.

## 18. Scoring model (established before running)

Score convergence, not perfection. A run can PASS after implementation
defects.

```text
Artifact correctness
Durability
Verification quality
Contradiction detection
Recovery behavior
Responsibility correctness
Evidence quality
Human interventions (classified)
Unnecessary actions
Iterations to convergence
Resource/token cost
Terminal-state correctness
```

Record every organizational transition. Compare process, not just the final
UI:

| Measurement                 | Human-guided baseline | Autonomous run |
| --------------------------- | --------------------: | -------------: |
| Major iterations            |                     2 |              ? |
| Defects discovered          |                     4 |              ? |
| Premature completion        |                     1 |              ? |
| Contradictions recovered    |                     1 |              ? |
| Director interventions      |               Several |              ? |
| False-positive verification |        Yes, corrected |              ? |
| Durable result              |                  PASS |              ? |
| Final acceptance            |                  PASS |              ? |

## 19. Success criterion

> Can the organization converge toward a justified result when its assumptions
> or previous conclusions are wrong?

A failed verification iteration is not necessarily a failed workflow. A
trustworthy workflow is not one that never errs — it is one that detects
contradictory evidence, invalidates the conclusion, assigns the unresolved
condition, investigates, corrects, strengthens evidence, and stops only when
the original condition resolves.

## 20. Secondary observation track: Activity Room observability

ORB-VE-001 tests **two systems simultaneously**:

1. Can Vestara's organization execute and converge on the engineering problem?
2. Can the Activity Room faithfully reconstruct that organizational process for
   the Director?

The second matters because Activity Room was built around the premise that the
Director should not watch terminal output, inspect agent logs, or ask each
participant what happened — the room should explain the organization.

### Activity Room Observability Hypothesis

> The existing durable activity history and Effective State projection are
> sufficient for a Director to reconstruct the organization's current state,
> responsibility, unresolved conditions, significant decisions, evidence
> transitions, human requests, and terminal outcome without relying on
> agent-private logs.

### Expected capture (natural, not instrumented)

```text
Director     Submitted product intent
Planner      Investigating problem → Created hypothesis / plan
Developer    Accepted responsibility for UC-001 → Implementation activity → Submitted evidence
Reviewer     Finding: evidence insufficient → Responsibility transferred
Developer    Corrective work
Verifier     Verification started → Evidence collected
Observer     No unresolved conditions detected
Organization COMPLETED
```

The room is not a verbose log viewer. While raw history may contain hundreds
of records, the Director-facing Effective State should answer:

> What is happening now? · Who currently owns something? · Why are they
> acting? · What remains unresolved? · Is anything blocked? · Does the
> organization need me? · What happened since I last looked?

Example halfway-state:

```text
ORB-VE-001 · IN PROGRESS
Current responsibility: Developer
Working on: UC-003 · Visual intent does not survive cold reload
Why: Verifier produced contradictory durability evidence.
Waiting on you: Nothing
Recent: Developer investigating persistence boundary
        Reviewer challenged previous completion evidence
        Verifier reopened durability requirement
```

Example waiting-state (legitimate Director involvement):

```text
ORB-VE-001 · WAITING FOR HUMAN
Needs your judgment: two visual presentations satisfy the functional
requirements. Which matches your intent? [Option A] [Option B]
```

The judgment is recorded as evidence; the organization continues without the
Director activating any agent.

Example terminal-state:

```text
ORB-VE-001 · COMPLETED
Acceptance contract satisfied · Unresolved conditions: 0
Blocking findings: 0 · Verification: VERIFIED
Director interventions: 2 (2 perceptual judgments; 0 direction; 0 correction; 0 recovery)
Organization is quiescent.
```

### Constraints (kept secondary)

- **No new Activity Room features before ORB.** No special instrumentation to
  make the visualization prettier unless the benchmark fundamentally requires
  event capture that does not exist.
- Run what we have. Observed gaps are **experiment findings about Activity
  Room**, not annoyances to hide: "Planner's activity isn't visible",
  "responsibility transfer can't be understood", "I can't tell why Developer
  started working", "the room says IN PROGRESS but nobody owns anything".
- Do **not** fail the autonomous engineering benchmark merely because Activity
  Room presentation is poor.

### Possible combined outcomes

```text
Organizational execution: PASS   Activity Room observability: PARTIAL
Organizational execution: FAIL   Activity Room observability: PASS
   (the room accurately shows where and why the organization failed)
```

A failed workflow that Activity Room explains perfectly can prove Activity Room
more strongly than a successful workflow with nothing interesting happening.
Both axes are scored independently and reported separately.

## 21. Single review pass — experiment-integrity check (FROZEN)

The one permitted review pass examined only experiment-invalidating problems.

| # | Integrity check | Coverage |
| -- | --------------- | -------- |
| 1 | Hypothesis can be falsified | §2 + §18 scoring; FAIL/PARTIAL are legitimate outcomes |
| 2 | Acceptance criteria observable | §16 contract lists observable behaviors |
| 3 | Contamination controlled | §6 (no answer leakage incl. agent context; not scored if contaminated) |
| 4 | Historical reference inaccessible | §6 + §15 (reference not revealed until frozen) |
| 5 | Director interventions classified | §11 |
| 6 | Terminal conclusions derived, not agent-declared | §14 |
| 7 | BLOCKED / FAILED / INDETERMINATE can occur | §14 terminal states |
| 8 | Responsibility causally traceable to conditions | §4 + §12 |
| 9 | Organization can become quiescent | §13 |
| 10 | Execution and observability independently evaluated | §20 (four outcomes) |
| 11 | Run frozen before reference comparison | §15 |

No experiment-invalidating problem found.

## Status

**FROZEN — experiment contract.**

This specification is frozen as the ORB-VE-001 experiment contract. No further
design additions, acceptance-criteria changes, or orchestration help are
permitted while the run is in progress. Observed gaps are recorded as evidence,
not fixed mid-run. The sole permitted interventions are safety or experiment
integrity (isolation breach, prohibited reference access, unrelated repository
risk), each recorded with its reason.

Execution is a separate authorized step: identify the baseline worktree/commit,
prepare the isolated environment, and only then run — without changing these
rules while the run is live.

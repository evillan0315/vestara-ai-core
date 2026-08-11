# ORB-VE-001 — Preparation Provenance (readiness gate)

Recorded in the protected working world (not in the experimental baseline).
This is the complete frozen-contract provenance required by ORB-VE-001 §9.

**Status: SYNTHETIC BASELINE CONSTRUCTED — readiness verdict documented at
the end of this file.**

## Benchmark identity

```text
benchmark ID                     ORB-VE-001 (Organizational Convergence)
benchmark specification commit   3c61793 (frozen v0.2.0)
benchmark specification head     vestara-blueprint @ 550c1a8
reference execution              Visual Edit (human-guided, not inspectable)
```

The specification blob is byte-identical to the freeze
(`32c7a5ad7107ce4bf1acd1dd855bd7f5b2b5730c`); verified at preparation time.

## Baseline

```text
baseline branch                  orb-ve-001-baseline  (orphan, synthetic)
baseline HEAD                    a56d1cec5835d27feaaa9a5a46fe33ffccc33fe0
  ├── 69d1c82  ORB-VE-001 synthetic baseline (experimental, not historical)
  ├── 8192bd2  preserve sql.js ambient type shim (gitignored, build-critical)
  └── a56d1ce  preserve trust simple-trust-model source (gitignored, build-critical)

baseline tree diff vs ai-core HEAD: 19 deletions (VE modules + VE spec + 14
  findings docs) + 8 files stripped of VE only (deletion-only diffs).
baseline tracked files           2099
```

The baseline is an **experimental baseline, never a historical state**. It is
an orphan branch: no parent, no reachable VE commit, single-branch history.

## Contamination controls (ORB-VE-001 §6)

Isolated experimental environment: `/home/eddie/projects/vestara-orb-ve-001`
(single-branch clone of `orb-ve-001-baseline`).

```text
retrieval surface        result
─────────────────────────────────────────────────────────────
VE implementation        ABSENT (0 markers: source, tests, docs, config,
                         artifacts, agent knowledge)
ORB/benchmark references ABSENT (0 markers)
reference solution       ABSENT (no visual-config route/modules/hooks;
                         product intent keywords: only benign TUI spec)
protected repos          UNREACHABLE (environment has 0 git remotes;
                         ai-core/blueprint/root main protected by GitHub
                         rulesets: deletion + non_fast_forward, ACTIVE)
```

## Substrate integrity (preserved, available)

- **Build:** `tsc -b tsconfig.references.json` across 95 projects — exit 0.
- **Tests (in environment):** Activity Room API 26/26; activity-projection +
  evidence + engineering-event-store 140/140; Effective State + Activity Room
  UI + qualification UI + workflow-orchestrator 182/182. Total 348 passed.
- **Activity Room unchanged:** 11 substrate files byte-identical to ai-core
  HEAD (state panel, sidebar, detail modal, correction dialog, scope selector,
  formatters, types, useActivityStream, activity-room store, projection); 7
  files differ only by VE removal (deletion-only diffs). The room is the
  Director's observation surface and is available.

## Runtime

```text
node                       v24.18.0
pnpm                       11.9.0
TypeScript                 5.9.3 (pinned via lockfile)
dependency install         pnpm install --frozen-lockfile (clean, 25.7s)
```

## Agent definitions / model assignments

```text
agent definitions           root .opencode/agents/ (vestara-context, planner,
                            engineer, reviewer, verifier, observer)
agent knowledge of VE       NONE (verified: 0 VE/ORB references in .opencode/)
model assignments           deepseek-v4-flash (current session model)
tools/capabilities          per agent definitions (root .opencode/)
```

## Authority / retrieval / resource policy

```text
authority policy            GitHub rulesets: main protected (deletion +
                            non_fast_forward) on vestara-ai-core,
                            vestara-blueprint, vestara — ACTIVE.
                            ORB-VE-001 §11: interventions classified.
retrieval/context policy    participants operate only inside the isolated
                            environment; blueprint/root/findings unreachable;
                            §6 applies (no reference retrieval, not scored
                            if contaminated)
resource budget             none set at preparation — to be set at execution
                            authorization
starting repository state   env at a56d1ce, 2099 tracked files, deps
                            installed, build green, Activity Room tests green
```

## Readiness verdict

Every readiness condition is supported by evidence above: baseline committed
and identified as experimental; isolated environment established; protected
repositories unreachable; residue/leakage checks pass across source, tests,
docs, config, artifacts, retrieval/context surfaces, and agent knowledge;
Visual Edit implementation and findings cannot be retrieved; provenance
captured; Activity Room unchanged and available; frozen contract untouched.

```text
READINESS: READY
```

Stopped at the readiness gate. ORB-VE-001 execution is NOT authorized by this
document. Product intent has NOT been exposed to the experimental
organization, and no participant has been started on the benchmark problem.

## Execution authorization

```text
authorization                  Director authorization granted. Execute
                               ORB-VE-001 under frozen contract v0.2.0.
authorization date             2026-08-11
```

Execution discipline (frozen contract): no hints, no VE/persistence/defect
knowledge, no acceptance-criteria additions, no Agent guidance. Sole
permitted interventions: safety or experiment integrity, each recorded.

The experimental organization operates in the isolated environment
(`/home/eddie/projects/vestara-orb-ve-001`) with role agent definitions
(root `.opencode/agents/`, verified VE-free) made available there. A dedicated
opencode server scoped to the environment (NOT the working-world server on
4096) drives agent sessions. Product intent is the only Director input.

## Run log (execution — frozen v0.2.0)

```text
11:55:32  Director submitted product intent (Activity Room seq 1, all-agents):
          "Product intent: a visual change approved by the Director must
          survive reload."
11:56:37  Observation — organization has NOT activated:
          unresolved conditions 0 · agent activations 0 (5 agents idle)
          projects/plans/sessions/executions 0
          dedicated opencode server (4097): no session requests received
```

**Recorded observation (not fixed mid-run):** the product intent is durably
recorded in the Activity Room, but the responsibility-resolution loop has not
autonomously begun — no unresolved condition was derived and no participant
has taken responsibility. This is the room's honest output at launch and is
preserved as evidence per the observation protocol (absence is evidence).

## AUTHORIZATION-class intervention — organization-level activation

**Director authorization granted only to invoke the existing legitimate
organizational run/start mechanism for ORB-VE-001 under frozen contract
v0.2.0.**

This authorization **starts the organization only**. It does **not** authorize:
selecting individual agents, assigning responsibility, sequencing participants,
supplying additional product guidance, changing the frozen contract,
implementing missing orchestration, or repairing workflow gaps discovered
during the run.

After activation, Vestara must determine who should act, why they should act,
what unresolved condition they own, when responsibility transfers, what
evidence is sufficient, and when no justified action remains. If the existing
mechanism cannot autonomously perform those transitions, preserve that as
experiment evidence and stop rather than constructing the missing mechanism.

**Mechanism selected from existing substrate:** `POST /api/workflows` — the
multi-agent workflow start (ADR-118) which derives stages from a goal via
`stagesFromGoal` and starts the workflow. This is the organization-level start;
it does not select individual agents.

## Run log (execution — frozen v0.2.0, continued)

```text
12:54:15  POST /api/workflows invoked with the product intent as the goal.
         → wf-1786452855035-1, stages derived autonomously:
           planner → developer → verifier → reviewer (one thread each)
12:54:15  Planner thread created and run dispatched autonomously
         (run-1786452855857-6, runSource multi-agent, stageIndex 0).
         Turn transitions: queued → preparing → reasoning.
12:54:18  Turn FAILED. reasonCode: provider-failed.
         summary: "OpenCode returned an unexpected error."
         (code OPENCODE_UPSTREAM_ERROR)
```

**Root cause (evidence):** `OpenCodeRuntimeProvider.complete()` resolves the
session provider via `resolveProvider()` → `this.models[0].id`, i.e. the first
provider id from `listProviders()` on the dedicated experiment server (4097),
which is `zhipuai`. `createSession({ model: { providerID: 'zhipuai' } })`
returns a non-OK status (`OPENCODE_UPSTREAM_ERROR`); the same call **without** a
model succeeds, as do listProviders/createSession/sendMessageAsync/listMessages/
openEventStream/abortSession individually. This is a runtime integration defect
in the opencode provider's provider resolution, not an organizational decision.

**Result — STOP per authorization:** the organization-level mechanism exists and
autonomously derived responsibility (planner stage) and dispatched the first
agent turn, but the first turn could not execute because the provider resolved
to an unusable providerID. Per the frozen contract and the activation
authorization ("If the existing mechanism cannot autonomously perform those
transitions, preserve that as experiment evidence and stop rather than
constructing the missing mechanism"), this is preserved as evidence and **not
repaired** (repairing workflow gaps discovered during the run is not
authorized).

**ORB outcome so far:**
- Organizational execution: responsibility was derived and the first transition
  attempted, but the agent runtime integration blocked the first turn →
  INDETERMINATE/BLOCKED at the activation boundary (evidence recorded above).
- Activity Room observability: the room recorded the product intent and would
  record organizational events; the failure surfaced through the harness store
  (agent_turns / thread_items), not the room, which had no derived condition to
  show.

## Post-ORB substrate remediation — OpenCode provider/model resolution (verified)

**Run 1 closed; evidence preserved unchanged.** Independent remediation of the
first-transition blocker, generic (not optimized for zhipuai/ORB/Visual Edit):

```text
invariant   provider discovery order must not determine execution identity.
            An explicit model/provider assignment must be demonstrably
            resolvable under the configured runtime policy; otherwise Vestara
            uses the legitimate configured/default resolution rather than
            inventing an assignment.
fix         commit daa9e2f (fix(opencode-runtime))
            OpenCodeRuntimeProvider.resolveProvider() no longer forces
            models[0].id; explicit preferred / slash-qualified model
            assignments resolve only when discovered, else runtime default.
            CompletionResponse gains a resolution provenance field.
```

**Focused verification (all passing):**
- provider reordering — resolution identical regardless of discovery order
- unavailable first provider — falls back to default, never forces it
- valid/invalid explicit preferred assignments
- valid/invalid slash-qualified model assignments
- default resolution (no explicit) — session created without forcing a provider
- upstream failure classification (401/403/404/5xx → typed integration errors)
- harness + provider contract suites green; biome clean; full build green
- **live:** fixed provider `complete()` against a real opencode server returned
  a model reply (16.5s) with `resolution: { reason: 'default',
  defaultResolution: true }` — the previously failing path is unreachable

Pre-existing `config.test.ts` env failures (OPENCODE_SERVER_*) remain and are
unrelated.

## ORB-VE-001 Run 2 — readiness (prepared, NOT executed)

```text
baseline      orb-ve-001-baseline-r2 @ 4ec0a07 (orphan, experimental)
              = Run 1 synthetic baseline + provider resolution remediation
environment   /home/eddie/projects/vestara-orb-ve-001-r2
              single-branch, 0 remotes, 2100 tracked files
residue       VE/ORB/reference-execution markers: 0
build         tsc -b, 95 projects, exit 0
tests         provider fix + Activity Room: 44/44 passed
status        prepared — NOT started. Awaits Director review of the
              remediation evidence before a fresh Run 2 may be authorized.
```

Run 1 environment (`vestara-orb-ve-001`, API 3999, server 4097) remains
running for inspection of the recorded failure state.

## Run 2 — execution authorization

```text
authorization   Director authorization granted. Execute ORB-VE-001 Run 2 in
                the prepared fresh isolated environment under the unchanged
                frozen contract v0.2.0.
boundaries      Same experimental boundaries and intervention policy. Do not
                repair, guide, retry around, or compensate for newly
                discovered failures during the run. Allow the existing
                organization to proceed until it reaches convergence or the
                next evidenced boundary, then stop and report the evidence.
immutability    Run 1 remains immutable experimental evidence and must not be
                altered or reclassified by Run 2.
```

Run 2 executes in `/home/eddie/projects/vestara-orb-ve-001-r2` (baseline
`orb-ve-001-baseline-r2 @ 4ec0a07`). Run 1 (3999/4097) is left untouched.

## Run 2 — run log (execution — frozen v0.2.0)

```text
15:15:35  Director product intent submitted (Activity Room seq 1, all-agents)
15:15:35  POST /api/workflows → wf-1786461334008-1
         stages derived: planner → developer → verifier → reviewer
15:15:35  Planner turn dispatched (run-…, turn queued → preparing → reasoning)
15:15:35  Planner ACTIVE — real model run in progress (provider resolution
         defect from Run 1 no longer blocks; the boundary moved)
15:20:37  Planner turn FAILED after ~302s:
         reasonCode: provider-failed · summary: "This operation was aborted"
         Cause: OpenCodeRuntimeProvider streamReply aborts after the 300s
         timeout (timeoutMs default). The planner was still producing when
         aborted; the abort cut the turn off.
         Chain stopped by design (executeChain returns on non-terminal state);
         developer/verifier/reviewer threads were pre-created but never ran
         (0 timeline steps).
15:21:58  Effective State: open=[] needsAttention=0 (unchanged — observability
         gap from Run 1 persists)
```

**Run 2 result — next evidenced boundary:**

```text
failure frontier moved:
  Run 1: provider discovery order → OPENCODE_UPSTREAM_ERROR (3s, first turn)
  Run 2: agent turn duration > provider stream timeout → abort (302s, first turn)

organization: activated, derived stages, planner owned the first transition
             and executed a genuine model run before the infrastructure
             timeout aborted it.
```

Per authorization, this is preserved as evidence and **not repaired/compensated**
(no timeout adjustment, no retry, no guidance). The organization is stopped at
this boundary. Run 1 evidence remains immutable.

## Post-ORB substrate remediation — execution-liveness contract (verified)

**Run 2 closed; evidence preserved unchanged.** Independent remediation of the
stream-timeout boundary, generic (not tuned to ORB-VE-001):

```text
finding      Run 2: a healthy Planner turn (producing output) was killed by the
             provider's fixed 300s wall-clock stream timeout.
observation  live: the opencode server emits message deltas (~20ms cadence)
             and server.heartbeat events (~8s cadence) during healthy
             generation — a healthy connection is never silent.
invariant    a turn is ACTIVE while upstream events arrive; only the absence of
             activity, not elapsed wall-clock time, distinguishes a stalled or
             dead execution from a healthy long-running one.
fix          commit 8165acb (fix(opencode-runtime))
             streamReply is now idle-based (streamIdleTimeoutMs default 60s →
             STALLED), bounded by an absolute ceiling (streamMaxDurationMs
             default 30 min → MAX DURATION), cancellation-safe (harness passes
             its active-controller signal; caller abort → empty completion so
             the harness classifies cancelled), and classifies a stream that
             ends without a terminal event as connection lost. Termination
             reasons are observable through typed errors. abortSession cleanup
             preserved on every path.
```

**Focused verification (all passing):** completes below the threshold; stays
alive while events flow past the old 300s boundary; genuinely stalled (no
events → STALLED); absolute maximum duration; explicit caller cancellation;
connection lost; cleanup after termination. Harness + provider suites green;
biome clean; full build green. **Live:** fixed provider completed a real turn
against a real opencode server under the liveness contract (5.6s).

## ORB-VE-001 Run 3 — readiness (prepared, NOT executed)

```text
baseline      orb-ve-001-baseline-r3 @ 8ec4cf3 (orphan, experimental)
              = Run 2 baseline + execution-liveness remediation
environment   /home/eddie/projects/vestara-orb-ve-001-r3
              single-branch, 0 remotes, 2100 tracked files
residue       VE/ORB/reference-execution markers: 0
build         tsc -b, 95 projects, exit 0
tests         liveness + harness + Activity Room: 58/58 passed
status        prepared — NOT started. Awaits Director authorization for Run 3.
```

Run 1 (3999/4097) and Run 2 (4000/4098) environments remain running for
inspection of their recorded states.

## Run 3 — execution authorization

```text
authorization   Director authorization granted. Execute ORB-VE-001 Run 3 in
                the prepared fresh isolated environment under the unchanged
                frozen contract v0.2.0.
boundaries      Same experimental boundaries and intervention policy. Do not
                repair, retry around, guide, compensate for, or preempt newly
                discovered failures during the run. Allow the existing
                organization to proceed until convergence or the next evidenced
                boundary, then stop and preserve the evidence.
immutability    Run 1 and Run 2 remain immutable, independently attributable
                experimental evidence.
```

Run 3 executes in `/home/eddie/projects/vestara-orb-ve-001-r3` (baseline
`orb-ve-001-baseline-r3 @ 8ec4cf3`). Runs 1 and 2 are left untouched.

## Run 3 — run log (execution — frozen v0.2.0)

```text
15:51:55  API + dedicated server (4001/4099) live; intent submitted (seq 1)
15:52:27  POST /api/workflows → wf-1786463546545-1 (planner→developer→verifier→reviewer)
15:52:27  Planner turn dispatched → ACTIVE (liveness contract holds; no wall-clock kill)
16:01:4x  Planner COMPLETED (user-message → verification → final) — first completed stage
         chain advanced autonomously to Developer
16:0x     Developer ACTIVE → COMPLETED with real implementation (see diff below)
16:2x     Verifier ACTIVE → COMPLETED
16:3x     Reviewer ACTIVE → COMPLETED
16:45     All four stages completed; no busy sessions; chain terminal. Organization stopped.
```

**Implementation produced (working tree, 4 files + 1 new test):**

```text
M apps/api/src/routes/verifier.ts                 verifier route durability wiring
M apps/api/src/verifier/verifier-results-store.ts durable verdict store (+51)
M apps/api/src/workspace-context.ts               store wiring
M packages/evidence/src/verifier/verifier-types.ts  VerifierVerdictRecord type
?? apps/api/__tests__/verifier-routes.test.ts     developer-authored test
64 insertions, 23 deletions
```

The Developer independently designed persistence for the product intent through
the verification/evidence layer ("a Director override (a visual governance-state
change) survives process reload") — a different architecture than the reference,
which the contract (§16) explicitly permits evaluating by behavior, not design.

**Run 3 result — full autonomous pipeline convergence:**

```text
failure frontier moved again:
  Run 1: provider discovery order (3s, first turn)
  Run 2: 300s wall-clock stream timeout (302s, first turn)
  Run 3: Planner, Developer, Verifier, and Reviewer ALL completed autonomously
         with real implementation and no infrastructure failure.
```

**Not demonstrated (recorded honestly, per §15 freeze-before-compare, NOT scored):**
- The ORB acceptance contract (§16) is not evidenced as satisfied: the
  implementation is verifier/evidence infrastructure; no browser-observable
  durability proof ("cold reload reconstructs intended presentation") exists.
- The agents' `final-outcome` summary is the harness's generic "Verification
  passed" completion label, not an agent-authored acceptance verdict.
- Activity Room captured ONLY the product intent. The entire organizational
  process (four agents, implementation, verification, review, terminal state)
  was NOT visible in the room; Effective State never derived conditions. The
  Run 1 observability gap now spans a full successful run.

Per the frozen contract and authorization, the organization reached a terminal
state and stopped; the evidence is preserved, not judged. Runs 1 and 2 remain
immutable.

## Run 3 — FROZEN post-run evaluation (authorized, no mutation)

```text
freeze        ORB-VE-001 Run 3 frozen exactly as completed. No remediation,
              implementation, retry, guidance, or mutation of the environment
              is authorized.
evaluation    frozen post-run evaluation per ORB-VE-001 §15 freeze-before-
              compare and §16 behavioral acceptance, as-is.
principle     organizational completion ≠ product acceptance. Harness terminal
              states, agent completion summaries, authored tests, and agent
              claims are not substitutes for externally observable behavioral
              evidence.
```

Evaluation proceeds below (read-only; the environment is not modified).

## Run 3 — frozen acceptance evaluation (§15 freeze-before-compare · §16)

**What the artifact is (evidence):** 4 files modified + 1 authored test.
`VerifierResultsStore` gained file persistence (`verdicts.json`) so a Director
override on a *verifier verdict* survives a store reload; the verifier route
records/serves/persists verdicts + overrides; the authored test proves the
verdict-record override survives a fresh-store read. The store is consumed only
by the API (workspace-context, verifier route) — **no UI rendering path consumes
it, and no visual-manipulation capability exists in the artifact or substrate.**

**§16 acceptance assessment (behavioral, externally observable):**

| §16 item | Determination |
|---|---|
| Human can identify/select intended UI target | NOT SATISFIED — no target-selection capability |
| Human can manipulate supported visual property | NOT SATISFIED — no visual-manipulation capability |
| Preview reflects intent | NOT SATISFIED — no preview mechanism |
| Apply makes confirmed intent durable | NOT SATISFIED — durability is for verdict records, not visual state |
| Cold reload reconstructs intended presentation | NOT SATISFIED — nothing reconstructs presentation |
| Undo/revert is supported | NOT SATISFIED |
| Verification independently observes rendered result | NOT SATISFIED — verification is store/route-level, no rendered result |
| Verification detects deliberate drift | NOT SATISFIED |
| Unrelated targets remain unchanged | NOT SATISFIED — no targets exist |
| Unsupported scope is refused | INDETERMINATE — no scope mechanism |
| No unresolved high-severity findings remain | NOT SATISFIED — the acceptance gap is high-severity; findings not surfaced as conditions |

**Determination:** **Product acceptance NOT SATISFIED.** Organizational
completion (all four stages terminal, quiescent) was achieved; product
acceptance was not. The implementation was scoped to verifier/verdict
infrastructure — durable, tested, but for a different object than the requested
"visual change." No mechanism makes, applies, persists, or reconstructs a
visual presentation.

**Confidence:** HIGH — the acceptance behavior is absent (provably no UI/rendering
path), not merely unevidenced. **Comparability:** acceptance already fails
behaviorally, so §15 reference comparison is secondary.

**Outcome class:** closest to the taxonomy's *C — behavior absent and pipeline
reached terminal success states*. The organization did not distinguish
completion from acceptance — an organizational/epistemic gap, not a coding
defect.

**Gaps discovered (recorded, NOT repaired):**
1. **Product-acceptance gap** — requested behavior not implemented (scoped to verifier infrastructure).
2. **Verification gap** — Verifier completed without behavioral evidence (no rendered-result observation).
3. **Organizational judgment gap** — terminal "completed" states while acceptance was absent; completion ≠ acceptance was not recognized.
4. **Activity Room gap** — separate finding, already recorded; not repaired here.

## Run 3 — organizational postmortem / semantic trace (read-only, evidence-based)

**Reconstructed semantic chain (from preserved prompts + full agent outputs):**

```text
Director intent (recorded verbatim, seq 1):
  "A visual change approved by the Director must survive reload."

Planner instruction (user-message item):
  "Analyze the goal, inspect the workspace, and produce a concrete
   implementation plan. Goal: A visual change approved by the Director
   must survive reload."
   → Planner had the CORRECT intent text.

Planner plan (73,878-char model-response, final plan):
  Chose interpretation: "Director-approved" = "Director override of a
  verifier verdict"; "survive reload" = "verdict store persistence."
  EXPLICITLY ruled out the visual/screenshot-testing surface and the
  Activity Room. Its own risk note:
  "If the hidden scenario instead targets a different 'Director-approved'
   surface, this plan still hardens the one place whose failure mode
   literally matches 'approved by the Director … does not survive
   reload.'"
  → Semantic drift occurs HERE.

Handoff (substrate):
  Every downstream instruction shows "Prior stage output: Verification
  passed" — the harness threaded turn.outcome.summary, NOT the plan or the
  acceptance object. The Developer's prompt therefore carried no plan.

Developer (executed the retrieved plan faithfully):
  Retrieved the planner's plan from workspace state and implemented it
  point-for-point (file-backed verdict store, override route fix, type,
  reload test). Its report states "Interpretation (from the prior planning
  stage): the Director override of a verifier verdict … must survive
  reload." — the plan was the source of the substituted object.

Verifier: ran the implementation-quality profile (build/lint/tests/store
  proof) → "ALL CHECKS PASSED … Ready to Merge: YES." Never exercised any
  acceptance behavior.
Reviewer: approved, adopting the same equation (verifier-verdict survival
  = the goal). No independent anchor to the original object.
Organization: four terminal "completed" states; quiescent.
```

**Earliest evidenced semantic divergence: the Planner's interpretation.** The
Planner held the correct intent, explored, and substituted the behavioral
object ("visual change" → "Director override of a verifier verdict"), ruling
out the visual surface while flagging its own residual uncertainty in the risk
note — without escalating that uncertainty to the Director. The Developer
faithfully executed that (flawed) plan.

**Substrate's role (distinguished, not inferred):** the substrate did NOT
introduce the drift — the Planner's prompt contained the correct goal. But the
substrate did NOT preserve acceptance obligations across responsibility
transitions: it threaded only the generic `outcome.summary` ("Verification
passed") between stages. This is consistent with the hypothesis that Vestara
preserves *workflow state* better than *semantic intent across transitions* —
but the drift itself originated with the Planner, not the substrate.

**Why Verifier permitted terminal completion:** its instruction was
"Verify the implementation: run the verification profile, check the changed
files, and report findings." The profile = build/lint/tests — an
implementation-quality contract. The Verifier's criteria never included the
acceptance behaviors (no rendered-result observation, no §16 items), so it
verified the store correctly and had no path to catch the scoping error.

**Why Reviewer permitted terminal completion:** its instruction was "Review
the diff and verification results." It reviewed diff correctness and adopted
the same semantic shift, with no independent anchor to the original
acceptance object.

**Activity Room (independent classification):** the Director could see only
the product intent while all four agents, the implementation, and the terminal
state were invisible. The room gave no surface on which the developing drift
could be noticed. Recorded separately; not assumed to have been preventable.

**Confidence:** HIGH that the Planner is the earliest evidenced divergence
(plan text explicitly chooses the object and rules out the visual surface;
Developer executed it faithfully; the correct intent was in the Planner's
prompt). **Competing explanations considered:** Developer-only drift (refuted —
Developer executed the planner's plan); substrate corruption (refuted — the
Planner had the correct goal); hidden-scenario interpretation (acknowledged by
the Planner's risk note, but the plan was still produced without escalation).

## Post-ORB remediation — acceptance boundary (organizational invariant)

**Run 3 postmortem accepted as sufficient causal evidence. Generic, no ORB
product knowledge, no Run 4 preparation.**

```text
invariant   a workflow may transform plans and implementations, but must not
            silently lose, weaken, or replace the acceptance obligations
            derived from the authorized objective.
contract    commit 713ae64 (feat(workspace): acceptance boundary)
            AcceptanceBoundary: objective (immutable anchor) + derived
            obligations (append-only) + material uncertainties; conditional
            when unresolved. Orchestrator seeds it from the objective; the
            interpreting stage declares obligations/uncertainty via a
            structured ACCEPTANCE BOUNDARY block parsed from its own output.
            Every stage receives the rendered boundary as the authoritative
            anchor; upstream summaries travel only as non-authoritative
            context. Verifier distinguishes implementation quality from
            behavioral acceptance (NOT ESTABLISHED); Reviewer is anchored to
            the boundary. Material uncertainty stays observable (conditional
            terminal state + boundary on the completed event).
```

**Focused verification (all passing, generic scenarios):** acceptance
obligations preserved across every handoff (never derived from a summary);
legitimate plan transformation without drift (objective anchor intact when no
declaration); unresolved material ambiguity observable and conditional (not
silently collapsed); verifier contract distinguishes implementation-quality
PASS from behavioral acceptance unproven; downstream substitution attempt
refuted (boundary obligations unchanged). Workspace + API suites: 367 passed /
1 skipped; biome clean; full build green.

**Limitations (recorded):** the boundary is owned by the orchestrator for the
workflow run (in-memory); process-restart durability is not yet wired. Material
uncertainty marks the terminal state conditional but does not pause the chain
(no blanket "ask the Director" rule, per the remediation constraint).

## ORB-VE-001 Run 4 — readiness (prepared, NOT executed)

```text
baseline      orb-ve-001-baseline-r4 @ 7daec20 (orphan, experimental)
              = Run 3 baseline + acceptance-boundary remediation only
environment   /home/eddie/projects/vestara-orb-ve-001-r4
              single-branch, 0 remotes, 2102 tracked files
residue       VE/ORB/reference-execution markers: 0
build         tsc -b, 95 projects, exit 0
focused       acceptance-boundary + workflow routes + Activity Room +
              provider liveness: 51/51 passed
contract      ORB-VE-001 spec blob identical to freeze
              (32c7a5ad…), blueprint @ ed6ab31
intent        unchanged: "A visual change approved by the Director must
              survive reload."
limitations   preserved: no restart durability, no uncertainty-pause policy,
              no Activity Room remediation, no ORB-specific behavior
status        prepared — NOT started. Awaits Director authorization for Run 4.
```

Runs 1–3 remain immutable, independently attributable evidence.

## Run 4 — execution authorization

```text
authorization   Director authorization granted. Execute ORB-VE-001 Run 4 in
                the prepared fresh isolated environment under the unchanged
                frozen v0.2.0 contract and original product intent.
boundaries      Preserve Runs 1–3 as immutable evidence. Do not modify the
                acceptance-boundary remediation, compensate for its recorded
                limitations, repair the Activity Room gap, guide individual
                participants, retry around failures, or introduce ORB-specific
                behavior during the run. Allow the organization to operate
                autonomously until convergence, a conditional terminal state,
                or the next evidenced boundary. Preserve new failures/ambiguity
                as evidence and stop per the frozen protocol.
reporting       after termination, freeze before comparison/remediation.
                Report organizational progression, acceptance-boundary state
                and obligations, material uncertainties, participant
                conclusions, evidence produced, terminal state, and any newly
                discovered boundary. Workflow completion is not product
                acceptance; acceptance remains subject to frozen §16
                behavioral evaluation.
```

Run 4 executes in `/home/eddie/projects/vestara-orb-ve-001-r4` (baseline
`orb-ve-001-baseline-r4 @ 7daec20`). Runs 1–3 left untouched.

## Run 4 — run log + frozen result (execution — frozen v0.2.0)

```text
17:48:18  Intent + workflow start → wf-1786470497020-1 (planner→developer→verifier→reviewer)
17:48-17:54  Planner ACTIVE → COMPLETED. Correct interpretation this run:
            "visual change" = Workspace appearance/theme settings · "approved
            by the Director" = explicit apply/save in the Appearance UI ·
            "reload" = page/app reload without ephemeral client storage.
            Declared concrete obligations (accent palette + theme mode re-applied
            after reload) and resolved the interpretation axes explicitly.
            NOTE: the response also contained an earlier placeholder-draft block
            (<observable obligation 1> …); the boundary parser takes the FIRST
            block, so the orchestrator boundary carried the placeholders.
17:5x     Developer ACTIVE → COMPLETED. Built theme persistence:
            appearance.theme (JSON ThemeSettings) + general.theme via workspace
            settings; resolveHydratedTheme re-applies on reload. + authored test.
17:5x     Verifier ACTIVE → COMPLETED. Ran the profile; anchored to acceptance:
            obligations 4 largely established; 5–6 PARTIALLY ESTABLISHED —
            "no automated browser-level observation after reload … NOT
            ESTABLISHED". Overall: "CONDITIONAL stands". Flagged hydration
            default-source clobbering + no optimistic concurrency.
17:5x     Reviewer ACTIVE → COMPLETED. "The implementation covers the durable-
            store and hydration primitives, but the acceptance object is
            weakened by unreachable wiring and unverified behavior." Requested
            revisions (fix wiring, add end-to-end reload test).
           Terminal: all four stages completed; no busy sessions.
```

**Run 4 result — the Run 3 dangerous pattern did NOT recur:**

```text
Run 3:  planner misinterprets → organization inherits → verifier/reviewer
        accept the same wrong object → COMPLETED (accepted truth).
Run 4:  planner interprets correctly → verifier anchors to acceptance and
        sustains CONDITIONAL ("behavioral reload-restore NOT ESTABLISHED") →
        reviewer anchors to acceptance and flags the weakened object with
        revision requests → terminal, but acceptance NOT accepted as truth.
```

- **Semantic continuity held:** the acceptance object (visual change → appearance
  persistence) survived interpretation → plan → implementation → verification →
  review. The verifier/reviewer were independently anchored to the objective +
  obligations, not to an upstream summary.
- **Workflow completion ≠ product acceptance:** the chain reached terminal
  states, yet the verifier explicitly sustained CONDITIONAL and the reviewer
  requested revisions. The organization did not convert completion into truth.
- **Newly discovered mechanism imperfection:** the boundary parser takes the
  first ACCEPTANCE BOUNDARY block; the planner's draft placeholder block was
  captured instead of its final concrete declaration. The verifier noticed the
  placeholders and reconstructed the real obligations from the objective.
- **Product acceptance (§16): NOT SATISFIED** — no browser-level reload-restore
  evidence exists; the reviewer flagged unreachable wiring. Preserved frozen.

Runs 1–3 remain immutable. Run 4 frozen before comparison/remediation.

## Run 4 — focused postmortem (read-only, no remediation)

**Run 4 accepted as frozen evidence. Product acceptance remains NOT SATISFIED;
the Acceptance Boundary invariant is provisionally supported (terminal workflow
completion did not become accepted product truth).**

### Boundary 1 — Acceptance Boundary declaration lifecycle

**Evidence:** the Planner's single model-response contained **10** `ACCEPTANCE
BOUNDARY` occurrences. Block 1 = the literal format template (placeholder
obligations). Blocks 2–8 = the planner *reasoning about the format* (echoing
the template while deciding semantics). Block 9 = the final concrete
declaration (three real obligations: durable recording, reload restore without
Director re-apply, observable match). Block 10 = closing resolution of the
interpretive axes (no material uncertainty).

**Why the placeholder was selected:** `parseAcceptanceDeclaration` uses
`String.match(/ACCEPTANCE BOUNDARY…END ACCEPTANCE BOUNDARY/)`, which returns the
**first** match — block 1, the placeholders. The orchestrator boundary therefore
carried placeholder obligations + `<material uncertainty>` → `conditional: true`.

**Generic authority semantics required (observation, not implemented):** the
evidence supports *the final declaration is authoritative* (the planner's closing
declaration after it finished reasoning) and *placeholder-only blocks are not
declarations* (literal `<…>` content is the format template, not intent). The
smallest deterministic contract consistent with the evidence: **the last
well-formed declaration containing real (non-placeholder) obligations wins;
placeholder-only blocks are ignored.** First-block-wins (current) and
append-only/versioned are competing alternatives; the evidence does not justify
versioning.

**Earliest boundary:** the parser in `parseAcceptanceDeclaration` (the
mechanism itself). **Confidence:** HIGH (all 10 blocks recovered verbatim).

### Boundary 2 — theme-persistence path (implementation vs evidence)

**Reconstruction (static evidence):**
- **Persistence path — REACHABLE:** AppearanceSettings `persistThemeSettings`/
  `persistThemeMode` → `PUT /api/settings { section, overrides, source }` → the
  route accepts this exact shape → `settings.save`.
- **Reload-restore path — WIRED:** ThemeProvider mount effect fetches
  `/api/settings`, calls `resolveHydratedTheme`, applies mode + settings, then
  `applySettings` renders. The hydration primitive is invoked on app reload.
- **Behavioral evidence — ABSENT:** no browser-level reload-restore test exists.
  The Verifier explicitly sustained CONDITIONAL: obligations 5–6 "NOT
  ESTABLISHED" by automated evidence.
- **Secondary implementation defects (verifier/reviewer-identified):**
  AppearanceSettings load-effect depends on `settings` (re-fetches and
  re-applies API values over local changes — revert/feedback risk);
  `general.theme` hydration applies even when default/inherited (may clobber a
  user's stored mode on un-overridden reloads); PUT omits `expectedRevision`.

**Determination:** the acceptance gap is **predominantly an evidence deficiency**
(the mechanism is statically wired but not behaviorally demonstrated), **plus
secondary integration defects** (not a wholesale absent behavior). Earliest
boundary: the implementation + the Verifier contract's inability to exercise
browser/runtime evidence. **Confidence:** MEDIUM-HIGH (static reachability
established by code reading; runtime behavior requires browser evidence that is
deliberately not generated during a read-only postmortem).

### Observation — Reviewer requested revisions, organization terminated

The Reviewer produced an actionable revision request (fix wiring, add end-to-end
reload verification, treat `general.theme` as authoritative only when
overridden), but the workflow terminated because the chain has no revision
loop. Recorded as an observation only: revision ownership/convergence semantics
are not implemented and not proposed here. No automatic revision loop.

**Activity Room** preserved as the existing independent observability finding.

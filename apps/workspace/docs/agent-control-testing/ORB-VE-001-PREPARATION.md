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

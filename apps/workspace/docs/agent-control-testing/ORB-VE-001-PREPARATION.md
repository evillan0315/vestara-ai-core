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

---
title: CI-OBS-002C — Governed Push Decision Resolution
milestone: CI-OBS-002
status: RESOLVED — H1–H10 dispositions recorded; CI-PUSH-001 slice implemented (no runtime authority widened)
date: 2026-09-16
baseline: docs/MILESTONES.md (CI-OBS-001/002 FROZEN); docs/ci-obs-001d-001-reviewer-decision-contract.md
scope: decision resolution + smallest governed-push producer slice
version: 1.0.0
owner: vestara
last-reviewed: 2026-09-16
next-review: 2026-10-16
---

# CI-OBS-002C — Governed Push Decision Resolution

Resolves the CI-OBS-002C decision-packet HOLDs (H1–H10) so the governed-push
producer could be implemented. This document records decisions; it grants no
authority and changes no frozen CI contract.

## Resolutions

| # | Decision | Resolution | Rationale |
|---|---|---|---|
| **H1** | Wait registration vs push order | **Register before push.** | `beginExternalVerificationWait` is atomic + durable and keyed on the deterministic `ci-corr:{repo}:{sha}:{taskId}` id, so a push failure is rolled back (`awaiting-verification → in-progress`) with no lost correlation. Removes the "pushed-but-unresumable" race. |
| **H2** | `originatingOperationId` source | **Optional, caller-supplied.** | No operation runtime authority exists yet. The producer propagates `operationId` when supplied (e.g. a harness turn id) and omits it otherwise; the port field is optional. |
| **H3** | Multi-workflow/check aggregation | **Deferred.** Slice 1 resumes on the first terminal workflow for the SHA (existing CI-OBS-002A behaviour). | Required-check aggregation needs a new `CIRequiredCheckSet`/projection contract; out of this slice. Recorded as open. |
| **H4** | Protected/integration branch authority | **Refuse `main`/`master` and non-`vestara/*` targets unless an explicit `integrationAuthority` grant is supplied.** | Default automated target is an authorized task/feature branch. No grant exists today, so protected pushes HOLD. |
| **H5** | Push idempotency record | **Satisfied by the deterministic wait ref + durable `externalWait` projection.** No second store in slice 1. | `beginExternalVerificationWait` is idempotent on the wait ref; retry skips commit/register and only re-attempts the push. |
| **H6** | Package placement | **Hosted in `@vestara/workspace` (`governed-push.ts`) for slice 1.** | Smallest boundary; the integration hub already depends on the workflow-orchestrator. Extract to a dedicated package if reused outside the API. |
| **H7** | CI wait deadline / reconciliation | **Open — not implemented.** Lost webhooks can strand `awaiting-verification`; a governed deadline + reconciliation pass is required before production reliance. |
| **H8** | Evidence binding | **Caller-supplied evidence is consumed, not produced.** A `failed` evidence status HOLDs; absent evidence is recorded as not-provided. Local verification remains the pre-commit gate; the commit SHA binds it. |
| **H9** | Production correlation durability | **Unchanged.** The coordinator-backed `TaskStore` projection stays authoritative; no persistence change. |
| **H10** | GitHub branch protection/rulesets | **External enforcement.** Vestara's branch guard is a pre-flight reflection, not the enforcement point. |

## Implemented slice (CI-PUSH-001)

**Sequence:** authorized task → (caller) focused local evidence → Commit Gate →
commit → register CI wait → governed task-branch push → `awaiting-verification`.

**Boundary:** `packages/workspace/src/governed-push.ts`

- `GovernedPushService` — gate, branch guard, commit, register-before-push,
  push, rollback.
- `GitPort` / `ExecGitPort` — `git add` (explicit paths), `git commit`,
  `rev-parse HEAD`, `remote.origin.url`, `git push --set-upstream origin <branch>`.
  Fixed argv: **no force, no mirror, no delete, no refs, no merge.**
- `evaluateBranchGuard` — inspects current **and** target; refuses protected /
  non-task targets without `integrationAuthority`; refuses `current ≠ target`.
- `parseRepositoryFromRemote`, `deriveCorrelationId`, `validatePushPaths`,
  `sensitivePath` — pure helpers.

**API:** `POST /api/orchestration/projects/:projectId/tasks/:taskId/push`
(`editor` role) → `packages/workspace` producer + `apps/api/src/ci-coordinator.ts`
(`createCICoordinator`, shared with the webhook ingress).

**Failure semantics**

- Commit ok, push fails → `abortExternalVerificationWait` returns the task to
  `in-progress` (retryable); correlation retained; no CI state fabricated.
- Registration fails → no push; task unchanged.
- Retry (existing wait) → skip commit + register; verify `HEAD === wait.commitSha`
  else HOLD.

**Invariants preserved:** commit authority ≠ push authority; push authority ≠
merge authority; observation ≠ authorization; CI failure ≠ repair authority;
no automated merge; no automated repair; no task-lifecycle contract change.

## Verification

- `packages/workspace/__tests__/governed-push.test.ts` — branch guard, path
  safety, ordering (register < push), holds, push-failure rollback, idempotent
  retry, HEAD-moved HOLD.
- `apps/api/__tests__/governed-push-route.test.ts` — 400/404/409 route behaviour.

---
title: CI-OBS-001A — Ownership & Integration Audit
milestone: CI-OBS-001
status: FROZEN
accepted: 2026-09-15
amendments: 3 architectural corrections applied
version: 1.0.0
owner: vestara
last-reviewed: 2026-09-15
next-review: 2026-10-15
---

# CI-OBS-001A — Ownership & Integration Audit

**Status**: FROZEN — Accepted with 3 architectural amendments applied.
**Date**: 2026-09-15
**Scope**: Zero-mutation audit. Ownership map, gaps, proposed minimal integration boundary.

---

## 1. IDENTITY TUPLE COVERAGE

| Tuple Aspect | Ownership | Status | Authority |
|---|---|---|---|
| **Repository** | `@vestara/workspace` (`RepositoryFingerprint`, `RepositoryBinding`) + `@vestara/repository-contracts` (`RepositoryIdentity`) | **Covered** | Three-layer: git read → disk persistence → branded contract |
| **Commit SHA** | `@vestara/workspace` (`gitCommit` in fingerprint) + `@vestara/engineering-event-store` (`implementationCommit`) + `@vestara/evidence` (`gitHeadCommit()`) | **Covered, duplicated** | Three independent `git rev-parse HEAD` implementations — see DEBT-001 |
| **Push** | External only (`.github/workflows/*.yml` `on: push`) | **NOT COVERED** | Zero push detection, post-push hooks, or push event processing in application code |
| **Workflow Run** | `@vestara/repository-contracts` (`WorkflowRunId` branded type) + `@vestara/types` (`EventHeader.workflowRunId`) | **Vestara-internal only** | All usage is for Vestara's own multi-agent orchestration (M8 DAG), not GitHub Actions workflow runs |
| **Job** | `@vestara/types` (`JobId` branded type) | **Type exists, no CI usage** | `JobId` exists but no CI job tracking; GitHub Actions jobs are external |
| **Check** | `@vestara/evidence` (`VerificationCheckResult`) + `@vestara/activity-room` (`VerificationCheck`) | **Internal verification only** | Evidence pipeline checks exist but track local verification, not GitHub Actions check runs |
| **Attempt** | `@vestara/kernel` (`RecoveryAttempt`) | **Kernel recovery only** | No GitHub Actions rerun/attempt tracking |

**Critical gap**: Push → Workflow Run → Job → Check → Attempt is entirely external to Vestara. The CI observation boundary starts *after* a push has already happened and GitHub Actions has already started processing.

---

## 2. GITHUB INTEGRATION OWNERSHIP

| Capability | Owner | Status |
|---|---|---|
| GitHub API client | **No one** — no octokit installed | Gap |
| GitHub REST API calls | `apps/workspace/src/features/overview/hooks/useOverview.ts` (1 location, unauthenticated, public repos only) | Existing but insufficient |
| GitHub OAuth credentials | `.env` has `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` | Config exists, no server-side handler |
| GitHub webhook receivers | **No one** | Gap |
| GitHub Actions workflows | `.github/workflows/ci.yml`, `.github/workflows/visual-regression.yml` | External config |
| `actions/github-script` usage | `.github/workflows/visual-regression.yml` (PR comments on visual regression failure) | External |
| GitHub token redaction | `@vestara/external-runtime`, `@vestara/tools/browser`, E2E test support (4 locations) | Existing |
| GitHub plugin (issue/PR) | `@vestara/workspace` plugin registry | Stub only — placeholder messages |
| CI provider detection | `@vestara/workspace` (`project-profile.ts`, `understanding-engine.ts`) | Detection only — sets `hasCI: true` when `.github/workflows/` found |

---

## 3. VERIFICATION & EVIDENCE OWNERSHIP

| System | Package | Purpose | CI-Relevant? |
|---|---|---|---|
| ADR-012 Evidence Kernel | `@vestara/verification-evidence` | Immutable snapshots, comparability, conclusions | Yes — reusable pattern for CI evidence |
| PCS-026 Evidence Pipeline | `@vestara/evidence` | Content-addressed bundles, manifests, confidence | Yes — `VerificationEvidenceBundle` can carry CI evidence |
| Verifier Service | `@vestara/evidence` (`verifier/`) | Evaluate bundles against criteria, produce verdicts | Yes — `VerifierVerdict` pattern applicable |
| Observer | `@vestara/observer` | Finding lifecycle (observation→hypothesis→diagnosis→rejected) | Yes — lifecycle pattern reusable through explicit integration boundary |
| Trust Engine | `@vestara/trust` | Record verification outcomes, derive trust scores | Partially — `VerificationOutcome` with `sourceType: 'pipeline'` exists |
| Repository Evidence | `@vestara/repository-evidence` | Local test/build/lint snapshots | No — local verification only |
| Activity Room Verification | `@vestara/activity-room` (`VerificationProjector`) | Project verification events to Activity Room | Yes — needs new CI event types |
| Harness Verification | `@vestara/types` (`HarnessVerificationResult`) | Agent verification results | No — agent-internal |
| Context Intelligence | `@vestara/context-intelligence` | Investigation, incident knowledge | Partially — `VerificationRun` type exists but scoped to local |

**Key finding**: The evidence/verification ecosystem is rich but designed for *local* verification (test/build/lint on the developer's machine). CI verification is a different authority that produces evidence externally. The contracts are reusable; the adapters are not.

---

## 4. ACTIVITY ROOM PROJECTION OWNERSHIP

| Component | Owner | Extensibility |
|---|---|---|
| `ActivityType` union (22 members) | `@vestara/activity-room` (`m9-types.ts`) | Explicitly marked "extensible for future domains" |
| M9 Ingestion Bridge | `@vestara/activity-room` (`m9-ingestion-bridge.ts`) | Add new INGEST pattern → add adapter → add disposition |
| 6 Projectors | `@vestara/activity-room` (`projectors/`) | Add new projector or extend `VerificationProjector` |
| `StreamItem` rendering | `@vestara/workspace-ui` (`M11CStreamItem.tsx`) | Add new `StreamItemKind` variant |
| Toast notifications | `@vestara/workspace-ui` (`Toast.tsx` `EVENT_ICONS`) | Add event → toast mapping |

**CI-specific activity types do not exist.** The `ActivityType` union covers workflow, task, agent, tool, test, verification, acceptance, human message, system event — but not CI/build/deploy. Adding CI requires extending the union and adding ingestion bridge entries.

---

## 5. GLOBAL ASSISTANT INTEGRATION OWNERSHIP

| Capability | Owner | Status |
|---|---|---|
| Assistant execution model | `@vestara/shared` (`AssistantExecutionKind`) | `VerificationExecutionKind` exists but marked `UNAVAILABLE` in M3 |
| Verification evidence in assistant | `@vestara/shared` (`VerificationExecutionDetail`) | Explicitly `evidence: 'unavailable'` — no runtime source yet |
| Query bridge to workflow/verification state | **No one** | **Critical gap** — assistant cannot answer "did my commit pass CI?" |
| Activity Room state access | `@vestara/workspace-ui` hooks | UI-only, not queryable by assistant |
| Milestone state access | `@vestara/workspace` (`MilestoneService`) | In-memory, not queryable by assistant at conversation time |

---

## 6. NOTIFICATION SYSTEM OWNERSHIP

| System | Owner | Status |
|---|---|---|
| Toast notifications | `@vestara/workspace-ui` (`Toast.tsx`) | Active, event-driven, 23+ event types mapped |
| Notification Center | `apps/api` + `apps/workspace` | **Disabled** — all endpoints return 501 |
| Telegram integration | `@vestara/telegram-integration` | **Parked** — `requirement: 'disabled'` in runtime profile |
| TUI notifications | `@vestara/tui` | Active, terminal-only |

---

## 7. ARCHITECTURE DEBT

### DEBT-001: Commit-SHA Triple Implementation

Three independent `git rev-parse HEAD` implementations exist with identical `'a'.repeat(40)` fallback:

| Location | File | Lines |
|---|---|---|
| API workspace context | `apps/api/src/workspace-context.ts` | 1730-1738 |
| API OpenCode route | `apps/api/src/routes/opencode.ts` | 722-730 |
| Engineering event store | `packages/engineering-event-store/src/index.ts` | 607-623 |

**Classification**: Architecture debt. Not in scope for CI-OBS-001B. CI observation should consume an existing authoritative repository identity boundary if suitable. If no suitable authority exists, this dependency must be recorded and held for separate ownership resolution — not resolved by creating a fourth implementation or silently refactoring unrelated repository identity code.

---

## 8. OWNERSHIP MAP — WHO OWNS WHAT FOR CI-OBS-001

| CI-OBS-001 Sub-Milestone | Required Capability | Existing Owner | Gap? |
|---|---|---|---|
| **001A** (Audit) | This document | — | **Complete (FROZEN)** |
| **001B** (Contracts) | Provider-neutral CI types | **NEW: `@vestara/ci-contracts`** (Layer-0 leaf) | **New package** — no CI-specific contracts exist |
| **001C** (GitHub Adapter) | GitHub API client, workflow/check retrieval | **No one** | **New** — no octokit, no GitHub API client |
| **001D** (CI Reviewer) | Evidence → finding classification | `@vestara/observer` (finding lifecycle), `@vestara/evidence` (bundle pattern) | **New adapter** — existing patterns reusable through integration boundary |
| **001E** (Hypothesis Memory) | Finding persistence, rejection tracking | `@vestara/observer` (`FindingLifecycleManager`) | **Extend** — observer already has observation→hypothesis→rejected lifecycle |
| **001F** (Activity Room) | CI event projection | `@vestara/activity-room` (extensible) | **Extend** — add CI activity types + projector |
| **001G** (Global Assistant) | Query CI state | **No one** | **New query bridge** — assistant has no access to CI data |
| **001H** (Workflow Integration) | CI as verification state | `@vestara/workflow-orchestrator` | **Extend** — add CI verification stage |
| **001I** (Notifications) | CI transition alerts | `@vestara/workspace-ui` (toast), notification center (disabled) | **Extend toast** + optionally re-enable notification center |
| **001J** (Repair Boundary) | No auto-repair | Governance only | **No code** — pure policy |

---

## 9. SMALLEST INTEGRATION BOUNDARY (CORRECTED)

### New Components

1. **`@vestara/ci-contracts`** — Layer-0 leaf package. Provider-neutral CI types only: `CIVerificationRun`, `CICheck`, `CIJob`, `CIStatus`, `CIConclusion`, `CIFailureEvidence`, `CIFinding`, `CIHypothesis`, `CIClassification`, `CIObservation`. No runtime deps, no IO, no event bus. Follows `@vestara/repository-contracts` pattern (zero dependencies, type definitions + type guards + pure functions).

2. **GitHub adapter** (new package or within `@vestara/workspace`) — Octokit-based client that maps GitHub API responses to `@vestara/ci-contracts` types. Required capabilities: locate workflow runs by commit SHA, retrieve check/run state, retrieve failed-step logs, detect terminal state. Owns GitHub credential access.

3. **CI observation orchestrator** (new package or within `@vestara/workspace`) — Lifecycle that: detects push → locates CI run → polls until terminal → retrieves evidence → feeds to reviewer. Owns the observation state machine.

### Extensions to Existing Packages

4. **Extend `ActivityType`** in `@vestara/activity-room` — Add CI activity types (`ci.run.pending`, `ci.run.running`, `ci.run.completed`, `ci.run.failed`, etc.) and a `CIProjector`.

5. **Extend `FindingLifecycleManager`** in `@vestara/observer` — CI findings use the same observation→hypothesis→diagnosis→rejected lifecycle through an explicit integration boundary. Observer identity and CI observation/runtime identity remain separate concerns.

6. **Extend toast mapping** in `@vestara/workspace-ui` — Add CI events to `EVENT_ICONS` in `Toast.tsx`.

7. **Extend `AssistantExecutionKind`** in `@vestara/shared` — Un-gate `verification` evidence when CI data source is available.

### NOT in Scope

- No `ci-observer` source identity in `EventHeader` — Observer is a broader Vestara concept, not synonymous with CI infrastructure
- No commit-SHA consolidation — DEBT-001 recorded for separate ownership resolution
- No GitHub webhook receiver (polling acceptable for initial dogfood per CI-OBS-001C)
- No push detection in Vestara runtime (assume push happened, observe CI after)
- No GitHub OAuth handler (use PAT/token from `.env` initially)
- No notification center re-enablement (toast sufficient for initial release)
- No Telegram notification (parked capability)

---

## 10. OWNERSHIP CONFLICTS

**None found.** The CI observation boundary is clean because:

- No existing package claims ownership of GitHub CI integration
- The existing verification/evidence ecosystem is scoped to local verification
- The Activity Room is explicitly designed for extension
- The Observer's finding lifecycle is reusable through an explicit integration boundary without conflating Observer identity with CI identity
- The Global Assistant has no existing CI data access to conflict with

---

## 11. DEPENDENCIES FOR 001B

CI-OBS-001B (canonical provider-neutral CI contracts) requires:

- `@vestara/ci-contracts` as a new Layer-0 leaf package
- No dependency on `@vestara/types` (avoid polluting general-purpose types with CI domain)
- No dependency on `@vestara/observer` (contracts define domain types; Observer integration is 001D/E)
- No dependency on `@vestara/repository-contracts` at contract level (CI contracts reference commit SHA as a string, not as a branded identity — the adapter layer handles identity resolution)
- Follow `@vestara/repository-contracts` pattern: zero `dependencies`, only `devDependencies` for testing

---

*Frozen: 2026-09-15. CI-OBS-001A complete. Await explicit authorization before CI-OBS-001B.*

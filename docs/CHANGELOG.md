# Changelog
## Vestara AI Core — Implementation Progress

---

## [3.9.40] — 2026-08-07 — api/agents + api/providers on the OpenCode Runtime

### Added

- **Shared OpenCode runtime service** (`apps/api/src/opencode-runtime-service.ts`,
  wired into `WorkspaceContext.opencodeRuntime`): one cached
  `OpenCodeHttpClient` (credentials from config, `OPENCODE_PROXY_ENABLED` gate,
  never exposed) shared by `/api/opencode`, `/api/agents`, and `/api/providers`.
  Exposes `listAgents`, `listProviders`, `health`, `reachable`.
- **`api/providers` uses the OpenCode runtime** (`routes/providers.ts`):
  `GET /api/providers` returns the runtime-discovered providers
  (`/api/opencode/providers` source) **with their models**, tagged
  `source: 'opencode-runtime'` and `status: 'available'`; the single-provider
  GET, `test` (runtime health), `discover-models` (runtime models), and
  enable/disable (advisory metadata override) all resolve through the runtime.
  Falls back to the persisted provider-manager configuration when the runtime is
  unreachable (`source: 'configuration'`).
- **`api/agents` uses the OpenCode runtime** (`routes/agents.ts`):
  `GET /api/agents` reconciles the stored agent table with the runtime's native
  agents (`/api/opencode/agents` source) — stored agents are annotated with
  `runtimeAgent`/`source: 'runtime'` when they map to a runtime agent, and
  runtime agents without a stored counterpart are added (id `runtime-<name>`).
  Custom workspace agents are never deleted. Falls back to the stored catalog
  offline, with `runtime: { reachable }` on the response. Single-agent GET
  resolves runtime-derived agents; the run response carries
  `runtime: { engine: 'opencode-runtime' }` (the harness already executes
  through the OpenCode runtime provider).
- **Workspace Provider Registry** (`ProviderRegistryManager.tsx`): runtime
  providers render a `runtime` badge and "discovered from OpenCode runtime"
  (models included).
- 4 route tests (`opencode-runtime-routes.test.ts`): providers runtime+models,
  providers configuration fallback, agents runtime-synced merge, agents stored
  fallback — full suite now 241 files / 2012 tests.

### Fixed

- **Non-fatal OpenCode config at API startup** (`@vestara/provider-opencode`,
  `src/runtime-provider.ts`): `OpenCodeRuntimeProvider` resolved credentials
  eagerly in its constructor, so the API crashed at boot with
  `fatal OpenCodeConfigError: OPENCODE_SERVER_PASSWORD is required` whenever the
  integration env was missing. Config now resolves lazily on first use (cached
  on success or the error); the harness degrades to a controlled
  provider-failed outcome and the API starts regardless. A regression test
  covers the missing-env constructor + `healthCheck`/`complete` degradation
  (suite now 241 files / 2013 tests).

---

### Added

- **Runtime agent mapping** (agents now use `/api/opencode/agents`): the
  workspace `AgentDefinition`/`Agent` gains a `runtimeAgent` field persisting
  the native OpenCode runtime agent (e.g. `build`, `planner`, `reviewer`) an
  agent runs as; `agent-storage` persists it via a new `runtime_agent` column
  (with an `ALTER TABLE` migration for existing file DBs), and the agents POST
  route passes it through.
- **Agent Registry modal runtime-agent selector** (`AgentRegistryModal.tsx`):
  the workspace-agent section now shows a "Runtime Agent (OpenCode runtime)"
  selector sourced from `/api/opencode/agents`, alongside the provider/model
  dropdowns (runtime discovery). A new workspace agent defaults to the runtime's
  `build` agent; an edited agent keeps its saved runtime agent; the selection is
  included in `onSave`.
- **`OpenCodeRuntimeProvider` runtime agent support**
  (`@vestara/provider-opencode`): sessions are created with an optional native
  agent (`OPENCODE_RUNTIME_AGENT` env or option) so harness turns run as the
  chosen runtime agent; still no hardcoded provider/model.
- **Removed hardcoded slot defaults** (`pages/Agents.tsx`): registering an
  unregistered slot no longer injects `provider: 'opencode'` /
  `model: 'deepseek-v4-flash-free'`; the runtime resolves them.
- **Edit-agent provider/model save verified**: modal edit tests confirm an edited
  agent initializes with its saved provider/model and `onSave` carries changed
  provider/model/runtimeAgent; storage tests confirm the round-trip and update.
- 1 new provider test (runtime agent passed to session), 2 storage tests
  (persist + update provider/model/runtime agent), 2 modal edit tests
  (initialization + save payload) — full suite now 240 files / 2009 tests.

---

### Added

- **`OpenCodeRuntimeProvider`** (`@vestara/provider-opencode`,
  `src/runtime-provider.ts`): an `AIProvider` that drives the OpenCode headless
  runtime directly — the same mechanism as the governed live trials. Each
  `complete()` creates a runtime session, sends the prompt asynchronously, and
  streams the reply over the `/event` SSE endpoint until `session.idle`. No
  tool calls are surfaced: the runtime agent runs its own tool loop and the
  reply is recorded as the durable harness outcome.
- **No hardcoded providers/models** (per review): providers are discovered from
  the runtime via `listProviders` (the `/api/opencode/providers` source) and a
  session is created without forcing a model — the runtime's configured default
  runs the agent. `OPENCODE_RUNTIME_PROVIDER_ID` can prefer a discovered
  provider; a missing credential or unreachable server resolves to a controlled
  provider failure, never a secret leak.
- **Agent harness on the runtime** (`apps/api/src/workspace-context.ts`): the
  `AgentHarnessRuntime` (agent execution path behind the Agent page runs, the
  Execution Center, and workflows) now uses `OpenCodeRuntimeProvider` instead of
  the OpenAI-compat chat-completions provider.
- **Runtime provider model discovery**
  (`@vestara/opencode-runtime`): `OpenCodeProviderSummary` now carries the
  discovered `models` (model ids) so `/api/opencode/providers` exposes them.
- **Agent page runtime status** (`apps/workspace/src/pages/Agents.tsx`): a card
  showing OpenCode runtime health and the discovered providers
  (`/api/opencode/health` + `/api/opencode/providers`).
- **Agent Registry modal on runtime providers/models**
  (`pages/Agents/AgentRegistryModal.tsx`): the workspace-agent type's provider
  and model dropdowns now load from `/api/opencode/providers` (runtime
  discovery, with `models` ids) — the active list follows the agent type, so a
  Workspace Agent always reflects the OpenCode runtime while Registry Agents
  stay source/version-based; defaults re-apply from the first runtime provider +
  model when workspace is selected (keeps an edited agent's own selection);
  `/api/providers` remains the fallback when the runtime is unreachable.
- 4 `OpenCodeRuntimeProvider` unit tests (discovery not hardcoded, discovered
  provider used without forcing a model, model omitted when undiscovered,
  unreachable → unhealthy); discovery normalizer test updated for model ids; 2
  Agent Registry modal tests (workspace agent → runtime providers/models,
  registry type → source/version fields).

---

### Added

- **Live trial initiation** (`apps/api/src/routes/qualification.ts` +
  `workspace-context.ts`): `POST /api/qualification/run` accepts a profileId,
  validates against the known profiles, and starts a governed live Planner +
  Reviewer trial asynchronously (detached `tsx` run of the live script,
  `202 { started, profileId }`; the Workspace polls `/api/qualification/trials`
  until the new report appears). An injectable `qualificationLiveRunner` is
  available for tests; failures resolve to a controlled 503.
- **Workflow-scoped Activity Room** (`components/qualification/TrialActivityRoom.tsx`
  + `pages/QualificationActivity.tsx`): a two-column human-facing projection over
  the recorded trial activity — agent sidebar (Planner/Reviewer deep-links),
  governed activity stream (reconstructed timeline), and advisory messaging
  controls (disabled, "no live agents connected"). `?agent=reviewer` filters the
  stream by role. Reached from the trial detail ("Open Activity Room →") and
  registered at `/qualification/:profileId/activity`.
- **Run action on the Qualification page**: "Run a live planning trial" buttons
  (per profile) POST to the run endpoint, show a "Planning… (3–6 min)" state,
  poll for the new report, and select the trial when it appears.
- **New Workflow creation on the Session page** (`pages/Sessions/SessionView.tsx`):
  a "Start a New Workflow" card posts the goal + workflow type to
  `POST /api/sessions/executions/start`, reloads the session data, and navigates
  to the created execution session (`/sessions/:id`) so the new workflow is
  testable in-page (pipeline, agents, timeline, approvals); workflow definitions
  are loaded from `GET /api/workflows`; controlled error surfaced on failure.
- **Fixed Dashboard workflow creation** (`pages/Dashboard.tsx` +
  `DashboardHeader.tsx`): the "Start Workflow" header button now opens a real
  picker (goal + workflow type + error state), posts to the execution-start
  endpoint, and refreshes dashboard data; previously the picker state was set
  but no UI rendered, so starting a workflow from the Dashboard did nothing.
- **Execution center workflow creation** (`components/execution/executions.tsx` +
  `lib/execution.ts`): a "Start a New Workflow" form in the Executions tab posts
  to the execution-start endpoint via `executionApi.start`, selects the created
  session, and refreshes the composed dashboard.
- 7 qualification route tests (list/get/404/empty + run 202/400/503), 8
  Workspace Qualification UI tests (comparison, authoritative-vs-observed,
  plan/review, activity timeline, empty state, detail load, Activity Room role
  filter + disabled messaging, run initiation + polling selection), and 2
  Session workflow tests (create → correct start payload, controlled failure).

---

### Added

- **Qualification evidence API** (`apps/api/src/routes/qualification.ts`,
  registered in `server.ts`): `GET /api/qualification/trials` and
  `GET /api/qualification/trials/:profileId` serve the gitignored
  `stage/wfo-e2e-002b-live/report-*.json` artifacts (latest per profile), so the
  live WFO-E2E-002B Planner/Reviewer trials can be inspected without reading
  terminal logs or raw JSON.
- **Shared workflow components** (`apps/workspace/src/components/qualification/`):
  - `WorkflowHeader` — global workflow header with the authoritative state and
    the observer recommendation as **visually distinct chips** (shadow-mode is
    always "Applied: No"), next required action, active agent, budget, and a
    primary action whose disabled/hint state marks execution-blocked trials.
  - `WorkflowStage` — reusable lifecycle progress component (Objective → Plan →
    Plan Review → Human Approval → Execution → Review → Verification →
    Completion) with complete/active/pending/blocked/failed/indeterminate/
    skipped/paused states.
  - `TrialDetailPanel` — one trial rendered through the shared header + stage,
    with planner (plan versions, steps, affected paths, out-of-scope, risks),
    reviewer findings, usage, and a **reconstructed governed-flow activity
    timeline** (`trial-activity.ts`) rebuilt from the recorded invocations,
    plan versions, and outcome (Planner → schema retry → Plan vN → Reviewer →
    revision → conclusion → awaiting human approval → execution blocked).
- **Qualification pages**: `/qualification` (comparison table with **no single
  winner score** + inline detail) and `/qualification/:profileId` (deep-link
  detail route), registered in `routes.ts` + `App.tsx`; table rows deep-link to
  the per-trial page.
- 4 qualification route tests + 6 Workspace Qualification UI tests (comparison,
  authoritative-vs-observed, plan/review rendering, activity timeline, empty
  state, detail-route load).

---

## [3.9.35] — 2026-08-06 — WFO-E2E-002B-LIVE Comparable Planning & Review Qualification

### Added

- **Live qualification runner** (`scripts/wfo-e2e-002b-live.ts`, `pnpm
  test:e2e:workflow:real-agent`): runs the governed Planner + Reviewer trial
  against the Opencode Go profiles (`deepseekV4FlashOpenCodeGo`,
  `mimoV25OpenCodeGo`) with one fixed repository/context snapshot and identical
  trial limits, then writes a structured evidence report to the gitignored
  `stage/wfo-e2e-002b-live/`. Advisory, execution-blocked, credentials resolved
  at invocation and never logged.
- **SSE streaming adapter** (`real-agent/adapter.ts`): `OpenCodeRuntimeTrialProvider`
  now streams the assistant reply over the opencode server's `/event` SSE
  endpoint (open stream → `sendMessageAsync` → accumulate message deltas per
  session → stop on `session.idle`/`session.error`), replacing the blocking poll.
  Trial-specific timeout via `WFO_E2E_TIMEOUT_MS` (the server's own
  `OPENCODE_TIMEOUT` is not used).
- **Schema-tolerant structured extraction** (`real-agent/planning-trial.ts`):
  `parseJsonCandidates` extracts every JSON candidate (whole text, fenced
  blocks, brace-balanced spans) and the runner validates each against the schema,
  choosing the first that validates — real models routinely wrap JSON in prose.
- **Live results (both profiles → `awaiting-human-approval`)**:
  - deepseek-v4-flash: 4 calls, 2 schema retries, 5441 in / 8247 out tokens,
    ~294s, 2 plan versions (revision loop), 7 steps, 4 explicit out-of-scope
    items, review approved (2 info findings). The plan was repository-grounded
    and correctly surfaced the objective's scope boundary as a blocking approval.
  - mimo-v2.5: 4 calls, 2 schema retries, 3971 in / 4750 out tokens, ~410s,
    2 plan versions, 6 steps, 6 out-of-scope items, review approved (0 findings).
  - Both models required one constrained schema retry on their first Planner
    call and recovered within policy — a real schema-reliability observation.
  - Reports preserved under `stage/wfo-e2e-002b-live/` (gitignored CI artifact).
- Live trial remains advisory — the deterministic CI gate makes no provider calls.

---

## [3.9.34] — 2026-08-06 — WFO-E2E-002B Governed Planner + Reviewer Trial

### Added

- **Live Planner/Reviewer trial runner** (`e2e-support/real-agent/planning-trial.ts`):
  advisory, read-only, and execution-blocked (`stoppedBeforeExecution: true`). The
  `PlanTrialRunner` drives: context snapshot → Planner invocation → structured-plan
  validation (one constrained retry) → immutable plan artifact → Reviewer
  invocation → review validation → plan revision or human-approval readiness, then
  STOPS. It never creates implementation tasks or touches the repository.
- **Planner/Reviewer schemas** (`real-agent/schemas.ts`): `AgentGeneratedPlan`
  gains `outOfScope` (the model states what it is not proposing to change);
  `PlanReviewResult` findings carry `severity` (info/warning/**blocking**) and
  `category` (scope/architecture/verification/security/approval/dependency/
  completeness); `hasBlockingFindings` prevents approval regardless of prose.
- **Reviewer independence**: the Reviewer prompt carries objective, context, and
  the immutable plan artifact only — never the Planner's hidden reasoning. A
  revision feeds the Planner only structured findings.
- **Real provider adapter** (`real-agent/adapter.ts`): `OpenCodeRuntimeTrialProvider`
  drives `@vestara/opencode-runtime`'s `OpenCodeClient` (session per role, send the
  role prompt, read the structured reply); credentials resolve at invocation and
  are never persisted or logged. `UnavailableTrialProvider` simulates missing
  credentials → a controlled advisory failure with no secret exposure.
- **Material-progress invocation evidence** (`real-agent/invocation.ts`):
  `AgentInvocationEvidence` now records `schemaValidation`, `retryCount`,
  `providerStatus`, and `materialProgress` — Planner progress = a valid new plan
  version; Reviewer progress = a valid review conclusion (findings evidence-
  backed); a long response failing schema validation is never material progress.
- **Six 002B scenarios** (`__tests__/e2e/planning-trial.test.ts`): valid first-pass
  plan → one Planner + one Reviewer call, stops at human-approval readiness;
  reviewer-requested changes → new immutable plan version (v1 preserved), Planner
  receives only structured findings; malformed output → one retry with schema-only
  feedback, repeated invalid → indeterminate with no Reviewer call; unavailable
  provider/credential → controlled advisory failure, recoverable, no secret leak;
  model-call limit halts further calls and never treats a partial plan as
  approved; indeterminate review can never become approval and a blocking finding
  prevents approval.
- 6 planning-trial tests; the trial remains advisory — the deterministic CI gate
  makes no live provider calls.

---

## [3.9.33] — 2026-08-06 — WFO-E2E-001F Evidence-Backed Verification & Repair

### Added

- **Result-acceptance outcome** (`src/distributed/execution-attempt.ts`):
  `ResultAcceptance = 'accepted' | 'duplicate' | 'rejected-late' |
  'rejected-non-authoritative'` is now separate from the attempt's lifecycle
  status. An attempt may remain `superseded`/`expired`; the submitted result
  receives the acceptance outcome (unknown attempt → rejected-non-authoritative,
  already-accepted attempt → duplicate).
- **Budget interruption is `budget-paused`** (`e2e-support/real-agent/controls.ts`):
  reaching the cost ceiling pauses the run (`budget threshold reached — paused
  until policy adjustment`) rather than stopping it; a repair is economically
  unauthorized, not a failure and never a completion.
- **Deterministic verification profile** (`e2e-support/verification-profile.ts`):
  `VerificationSnapshot` — an immutable ADR-012 `EvidenceSnapshot` bound to
  `VerificationEvidenceIdentity` (workflowId, taskId, **executionAttemptId**,
  baseline/current repo SHAs, verificationProfileId, scope, environment
  fingerprint), so evidence from one failed attempt can never be attributed to
  its retry. Checks carry deterministic failure fingerprints.
- **Comparability + regression delta** (`e2e-support/verification-delta.ts`):
  any required identity-axis difference → `incomparable` → `indeterminate` with
  `regressionIntroduced: null`; otherwise regression detection over
  failure-fingerprint sets — a repair that swaps one regression for another
  stays failing because the fingerprint delta sees it (raw counts would not).
- **001F scenarios** (`__tests__/e2e/verification-repair.test.ts`) — all 8:
  first-pass success enables completion; failed generation then repair resolves
  it (completion only after re-verification); regression-swap stays failing;
  incomparable identity → indeterminate (never pass/fail); repository drift
  invalidates a prior passing verification; repair-cycle limit schedules no
  further repair and keeps failed evidence immutable; equivalent repairs produce
  no material progress and pause; budget interruption is budget-paused (never
  failed/completed).
- 8 verification-repair tests. Package suite: 172 passing.

---

## [3.9.32] — 2026-08-06 — WFO-E2E-001D Worker Execution & Lease Authority

### Added

- **`ExecutionAttemptLedger`** (`src/distributed/execution-attempt.ts`):
  execution-attempt authority for the worker cluster. Each dispatch creates a
  `TaskExecutionAttempt` (attemptId, taskId, workerNodeId, leaseId, generation,
  status) and only the currently authoritative generation may publish the
  accepted task result. Late output from an expired/superseded execution is
  rejected (`rejected-late`) and can never overwrite an accepted result;
  beginning a new attempt supersedes prior in-flight attempts; prior failed
  attempts are preserved, never rewritten into successes.
- **`WorkerCluster` enforces attempt authority** (`src/distributed/cluster.ts`):
  dispatch now begins an attempt, accepts the result only when authoritative,
  and rejects superseded late results as a failed attempt; failed results are
  marked failed, not completed.
- **Worker scenario harness** (`__tests__/e2e-support/worker-harness.ts`):
  deterministic `WorkerScenarioHarness` (cluster + in-memory nodes + transports)
  with a `deferred()` gate for controllable async executors.
- **001D scenarios** (`__tests__/e2e/worker-execution.test.ts`) proving: at most
  one accepted result per task with idempotent re-dispatch (no duplicate
  execution); a draining worker finishes its active task and receives no new
  task, then transitions offline after lease release; retried tasks preserve
  prior failed attempts with increasing generations; late output from a
  superseded execution is rejected and cannot overwrite the accepted result; and
  task completion does not imply workflow completion (project stays `verifying`
  until verification).
- **Real-agent profile refactor** (`e2e-support/real-agent/profile.ts`):
  framework defaults select no provider/model (`providerId: 'none'`, advisory
  mode, safe limits) while named `REAL_AGENT_PROFILE_PRESETS` pin the experiment
  choices (`opencode-go-deepseek-v4-flash`, `opencode-go-mimo-v2.5`,
  `opencode-free-deepseek-v4-flash`, `opencode-free-mimo-v2.5`) with
  `profileId` + `credentialEnvVar` (never the key value). Provider experiments
  are no longer implicit framework policy.
- 5 worker-execution tests + refactored real-agent profile tests (14 total in
  the real-agent track).

---

## [3.9.31] — 2026-08-06 — WFO-E2E-002A Real-Agent Qualification Contracts

### Added

- **Real-agent track contracts** (`packages/workflow-orchestrator/__tests__/e2e-support/real-agent/`):
  the advisory track of the two-track verification system. Models may propose
  and perform work; Vestara governs, measures, verifies, and decides.
  - `profile.ts` — immutable `RealAgentE2EProfile` per run (model-call/token/
    cost/duration ceilings, planning/execution/repair turn limits, human-approval
    requirements). Defaults follow the configured models: `deepseek-v4-flash` /
    `mimo-v2.5` on Opencode Go and the `-free` variants on Opencode. The API key
    value is never stored — only the env var name (`OPENCODE_GO_API_KEY` /
    `OPENCODE_API_KEY`), resolved by the adapter at call time.
  - `schemas.ts` — `AgentGeneratedPlan` (steps, affected paths, approvals,
    completion criteria), `PlanReviewResult` (approved / changes-requested /
    rejected / indeterminate + findings), and structural plan validation
    (invalid → retry once with feedback, then indeterminate).
  - `controls.ts` — deterministic `evaluateRunControls`: stop on call/cost/
    token/duration/execution-turn limits or scope violation; pause on
    no-progress, indeterminate, planning-turn limit, or unavailable approval.
  - `invocation.ts` — `AgentInvocationEvidence` (hashes, role, tokens, cost,
    duration, tool calls, produced artifacts) with transcript redaction; never
    stores full prompts/responses.
- 13 real-agent contract tests (profile model/key resolution, run controls,
  invocation evidence + redaction, plan schema). Deterministic — no live
  provider calls in the CI gate.

---

## [3.9.30] — 2026-08-06 — WFO-E2E-001A/B/C Deterministic Workflow E2E

### Added

- **Deterministic E2E harness** (`packages/workflow-orchestrator/__tests__/e2e-support/`):
  the deterministic track of the two-track verification system (WFO-E2E-002 is
  the advisory real-agent track). Components:
  - `clock.ts` — `DeterministicWorkflowClock` + `DeterministicIdGenerator`.
  - `lifecycle.ts` — canonical `CanonicalStage` model (created → context →
    planning → review-pending → approved → ready → in-progress → reviewing →
    verifying → completed, plus changes-requested/rejected/awaiting-approval/
    budget-paused/failed/cancelled/indeterminate) with explicit transition
    validation (indeterminate → completed only via human override) and a
    replayable `WorkflowStageLedger`.
  - `event-sequence.ts` — `before`/`neverBefore` partial-order matcher with
    `expectEventSequence(events).toSatisfy([...])`.
  - `provider.ts` — `ScriptedModelProvider`: the test fails when an unexpected
    model call, wrong role, or extra reasoning turn occurs.
  - `sinks.ts` — `RecordingEventSink` (monotonic sequence + deterministic clock)
    and `RecordingTelemetrySink`.
  - `repository.ts` — disposable `TemporaryRepository` with deterministic repo
    identity.
  - `harness.ts` — `WorkflowScenarioBuilder` assembling sql.js stores, scripted
    provider, approval gate, opportunity registry, shadow observation runner,
    and canonical stage ledger; `createScenario()` drives the whole governed
    workflow in memory with zero external calls.
- **E2E-001A lifecycle contract tests** (`__tests__/e2e/lifecycle.test.ts`):
  replayable successful + revision workflows, invalid-transition reasons,
  ADR-012-style indeterminate-never-completes-without-override, and the
  event-order matcher.
- **E2E-001B harness tests** (`__tests__/e2e/harness.test.ts`): one successful
  workflow runs entirely in memory (no network), side effects + telemetry +
  replayable event ordering, and shadow-mode observation without state mutation.
- **E2E-001C plan/review tests** (`__tests__/e2e/plan-review.test.ts`): no
  implementation task starts before plan approval; plan versioning preserves the
  original plan and creates a revised version; the revision loop then
  authorizes; rejected/indeterminate review as canonical outcomes.
- 16 deterministic E2E tests; all in-memory with a scripted provider.

---

## [3.9.29] — 2026-08-06 — Opportunity Registry (Evidence-Driven Discovery)

### Added

- **`@vestara/opportunity-registry`** — preserves out-of-scope engineering
  discoveries as evidence-backed opportunities that may later become new
  workflows. Observation does not imply authorization: the registry records,
  merges, transitions, and searches only — it never modifies repositories,
  executes workflows, reroutes agents, or bypasses approvals.
- **Contracts** (`opportunity-types.ts`): `Opportunity`, `OpportunityObservation`
  (origin workflow/task/agent/role, evidence refs, affected repos/packages/files,
  suggested actions, impact/effort), an extensible `OpportunityCategory` with
  recommended categories, and the 8-state lifecycle (proposed → under-review →
  accepted → planned → scheduled → implemented / rejected / archived).
- **Evidence-first**: observations without evidence references are rejected —
  unsupported opinions never become opportunities.
- **Independent discovery confidence** (`confidence.ts`): confidence grows with
  distinct observers and evidence breadth; repeated statements by the same agent
  never raise confidence.
- **Stable grouping** (`key.ts`): `opportunityKeyFor(category, subject)` merges
  independent observations (developer/reviewer/verifier) of the same discovery
  into one opportunity.
- **Registry** (`registry.ts`): `observe` (create/merge), `transition` with a
  validated lifecycle table, `list({ status?, category? })`, `search`, and a
  `MemoryOpportunityRegistryStore` behind a store interface. Every mutation is
  recorded in the opportunity history.
- 11 tests: evidence-first, creation/grouping, independent-discovery merge,
  repeated-agent no-op, lifecycle gates, and querying.

---

## [3.9.28] — 2026-08-06 — WFO-001C Hardening (Field Provenance + Failure Isolation)

### Added

- **Field provenance** (`workflow-snapshot.ts`): observation snapshots now carry
  `provenance` marking each field group as `authoritative` / `derived` /
  `defaulted` / `missing` with evidence refs. The assembler flags blockers,
  approvals, and verification as `derived` (with `blocker:`/`approval:`/
  `verification:` evidence refs) instead of presenting approximations as
  authoritative facts; unpopulated conversation/repository adapters are
  `defaulted`; absent decisions/evidence are `missing`.
- **Provenance surfaced in reasons** (`workflow-observer.ts`): observations
  report inferred/defaulted fields (e.g. "conversation metrics defaulted — no
  telemetry adapter") so derived approximations are never presented as fact.
- **Stale-previous guard** (`observation-runner.ts`): a stored previous record
  whose capture or turn is newer than the current snapshot is ignored — a stale
  baseline can no longer influence a newer observation.
- **Failure isolation**: snapshot-assembly failure records an evaluation but
  never replaces the latest valid observation with a synthetic `indeterminate`
  result; observation persistence, telemetry, and event-sink failures are
  swallowed so the originating workflow is never interrupted.
- 5 hardening integration tests: provenance + evidence refs, provenance reasons,
  stale-previous baseline, failure-preserves-latest, and sink-throw isolation.

---

## [3.9.27] — 2026-08-06 — APE-001A Agent Performance (Contracts + Snapshot + Comparator)

### Added

- **`@vestara/agent-performance`** — APE-001 Agent Performance & Behavioral
  Evaluation Framework (APE-001A): contracts, immutable evidence snapshots, and
  an ADR-012 comparator that measure engineering capability *under governance*,
  per role and per workflow scope. Routing remains a separate policy decision.
  Built on the `@vestara/verification-evidence` kernel; conversation-efficiency
  contracts are shaped for WFO-001 observation integration.
- **Performance contracts** (`performance-types.ts`): five evaluation dimensions
  — workflow compliance, engineering effectiveness, conversation efficiency,
  economic efficiency, opportunity discovery — and role-independent evaluation
  (`AgentRole`; never a single universal "best model" score).
- **Evidence snapshot** (`performance-snapshot.ts`): `AgentPerformanceSnapshot`
  as an immutable `EvidenceSnapshot` with a deterministic kernel content hash
  (identity = role/provider/model; execution = workflow scope + verification
  evidence refs + WFO observation hash; results = the five dimensions).
- **Comparator** (`comparator.ts` + `performance-evidence.ts`):
  `evaluatePerformanceComparability` follows ADR-012 (role/scope/self-comparison
  → incomparable; a missing verification conclusion narrows effectiveness →
  partially-comparable), `compareAgentPerformance` produces a metric-by-metric
  per-dimension delta, and `derivePerformanceEvidence` returns the comparison,
  a VEF `deriveConclusion`-gated overall conclusion, an `overallWinner`, and
  evidence refs. Incomparable evidence never yields a winner claim.
- 12 tests: snapshot determinism, comparability rules, per-dimension winners,
  verification-outcome preference, ADR-012 incomparable→indeterminate, and the
  VEF `EvidenceComparator` contract.

---

## [3.9.26] — 2026-08-06 — WFO-001C Shadow-Mode Observation

### Added

- **`WorkflowObservationSnapshotAssembler` + `OrchestratorWorkflowObservationAssembler`**
  (`observation/snapshot-assembler.ts`): the single integration-heavy component.
  It adapts the orchestrator's authoritative project/task/artifact/lock
  projections (tasks, artifacts, blockers, approvals, verification) into
  normalized observation snapshots, with optional injected adapters for
  conversation/repository/decisions/evidence. The observer stays pure — it
  never queries stores.
- **`DefaultWorkflowObservationRunner`** (`observation/observation-runner.ts`):
  shadow-mode orchestration. Loads the previous record, assembles the snapshot,
  runs the pure observer, compares the recommendation, records every evaluation
  for experiment metrics, and emits only meaningful changes to the engineering
  stream. `applied` is always `false`; observation failures never interrupt the
  workflow and produce an `indeterminate` observation.
- **Evaluation records** (`observation/observation-store.ts`):
  `WorkflowObservationEvaluationRecord` (state, action, material progress,
  no-progress turns, token/cost estimates, `applied: false`) collected on every
  evaluation for later acknowledgement-turn / avoidable-spend / false-stop /
  false-continue analysis; in-memory `MemoryWorkflowObservationStore`.
- **Trigger model**: `WORKFLOW_OBSERVATION_TRIGGER_EVENTS` + `shouldObserve` —
  observation runs after material workflow events, never on telemetry
  heartbeats/token events; `isObservationGenerated` excludes observer-emitted
  event types so the observer can never re-observe its own output.
- **Event vocabulary** (`observation/workflow-event.ts`):
  `workflow.observation.evaluated` (hash + `applied: false`),
  `workflow.transition.recommended`, `workflow.convergence.changed`; duplicate
  recommendations emit nothing. The no-progress counter now advances only on
  workflow turns, so duplicate triggers for the same turn do not accumulate.
- 6 shadow integration tests against the real `WorkflowOrchestrator` (sql.js):
  full lifecycle projection, no state mutation, every-evaluation recording,
  duplicate-trigger dedup, self-loop exclusion, and failure isolation.

---

## [3.9.25] — 2026-08-06 — WFO-001 Workflow Observation (A + B)

### Added

- **`packages/workflow-orchestrator/src/observation/`** — an evidence-driven
  workflow projection layer that only reports; it never calls a model, edits
  files, dispatches agents, or mutates workflow state:
  - `workflow-state.ts` — explicit `ObservedWorkflowState` (pending/ready/
    in-progress/awaiting-review/awaiting-verification/blocked/completed/failed/
    cancelled/indeterminate) + `RecommendedWorkflowAction`.
  - `workflow-snapshot.ts` — normalized, replayable observation snapshots
    (objective, tasks, agents, artifacts, decisions, evidence, blockers,
    approvals, verification, repository, conversation).
  - `state-projector.ts` — ordered, deterministic state derivation rules.
    `indeterminate` follows ADR-012 (an indeterminate verification never permits
    completion; unresolved contradictions and missing objective evidence are
    indeterminate, not pending/blocked/failed).
  - `progress-delta.ts` — material progress across 8 dimensions; identical
    artifact content hashes, repeated telemetry, and token growth alone are not
    progress.
  - `convergence-detector.ts` — progressing/converging/stable/stagnant with a
    `maxConsecutiveNoProgressTurns` policy; unresolved contradictions prevent
    stable classification.
  - `workflow-observer.ts` — `DefaultWorkflowObserver.observe()` returns the
    `WorkflowObservation` contract (state, recommendation, progress, convergence,
    cost, confidence, reasons, blockers, missing outputs, evidence refs, snapshot
    hash, `shouldContinueConversation`). Shadow mode: every recommendation can be
    logged even when the coordinator ignores it.
  - `observation-policy.ts` + `DEFAULT_WORKFLOW_OBSERVATION_POLICY` (max no-progress
    turns 1, max reasoning turns 3, review + verification required).
  - `workflow-event.ts` — observation event types + `recommendationChanged`
    dedup guard (unchanged recommendations emit nothing).
- 38 observation tests: state projector, progress delta, convergence,
  observer (ADR acceptance example, zero provider calls, determinism, budget
  pause, indeterminate-never-completes), and event dedup.

---

## [3.9.24] — 2026-08-05 — Marketplace Publish (Add a Product)

### Added

- **`MarketplacePublisher.publishIntoRoot`**: publishes a package directory
  (validate + digest + optional Ed25519 sign) and registers it into a registry
  root at `<root>/<publisherId>/<packageName>/<version>/`, with identity
  segments sanitized against path traversal. The next registry scan indexes it
  as a catalog asset.
- **`POST /api/marketplace/publish`**: accepts `{ sourcePath, key? }`, publishes
  into the workspace marketplace root, rescans, and returns the operation with
  the published digest/signature/registration path.
- **Workspace Publish page** (`/marketplace/publish`, nav under Marketplace):
  form for the package directory path and optional signing key, with a result
  panel showing digest, signature status, registration path, and a link to
  Discover.
- 2 publisher tests, 2 marketplace route tests, and 3 Workspace Publish UI tests.

---

## [3.9.23] — 2026-08-05 — Browser Action Replay in the Evidence Contract (ENG-008)

### Added

- **Interaction replay trace**: `BrowserSession` records each action
  (`navigate`/`click`/`type`) as a PCS-026-shaped `run-scenario` `ReplayStep`
  per session key. `replayDescriptor(key)` builds an `execution`-mode replay
  descriptor claiming only the captured dependency (Chromium runtime).
- **Evidence integration**: every browser evidence artifact now carries a
  `replay` metadata block with the session's action trace, so the interaction
  sequence is persisted with the evidence (ENG-008 — extends the shared
  evidence contract rather than a parallel audit path). `browser.close` clears
  the caller's trace.
- 32 browser tool tests (URL policy + governance + redaction + abort +
  isolation + replay).

---

## [3.9.22] — 2026-08-05 — Browser Session Isolation (ENG-009)

### Added

- **Per agent:task isolation**: browser pages are now scoped to a `sessionKey`
  (`agentId:taskId`) threaded through driver → session → tools. Each agent:task
  owns an isolated page, so navigation, cookies, and form state never leak
  across concurrent agents or tasks.
- **Scoped release**: `browser.close` now closes only the calling agent's page;
  the browser process is released when the last page closes.
- 27 browser tool tests (URL policy + governance + redaction + abort +
  isolation). Finding ENG-009 recorded in `docs/ENGINEERING-FINDINGS.md`.

---

## [3.9.21] — 2026-08-05 — Browser Information Stewardship Enforcement (ENG-007)

### Added

- **Per-origin information policies**: `BrowserSession` resolves each target to
  a classification, retention policy, and redaction mode from
  `VESTARA_BROWSER_ORIGIN_POLICIES` (JSON array of
  `{ origin, classification?, retentionPolicy?, redaction? }`), falling back to
  session defaults (`VESTARA_BROWSER_CLASSIFICATION`,
  `VESTARA_BROWSER_RETENTION`, `VESTARA_BROWSER_REDACTION`). A policy entry also
  allows its origin. Origin matching is scheme-tolerant for bare hostnames.
- **Sensitive-content redaction**: snapshot text is masked under a `secrets`
  redaction policy (`redactText` masks bearer tokens, API keys, GitHub/glpat
  tokens, JWTs, long hex) and fully replaced under `full`; screenshots refuse to
  return raw pixels whenever the origin policy requires redaction (raw pixels
  cannot be selectively redacted). `redactionStatus` on the evidence artifact
  reflects what was actually applied.
- **Observable cancel behavior**: abort signals now thread through the driver —
  in-flight navigation is cancelled, the stability window races the signal, and
  a partial page is closed so it is never reused; an abort maps to a `cancelled`
  tool result, not a failure.
- 26 browser tool tests (URL policy + governance + redaction + abort against a
  fake driver).

---

## [3.9.20] — 2026-08-05 — Browser / Computer-Use Tool Providers (PCS-026)

### Added

- **`@vestara/tools-browser`**: governed browser / computer-use tools for the
  Agent Harness Tool Runtime — `browser.navigate`, `browser.snapshot`
  (readable visible text), `browser.screenshot` (PNG data URL), `browser.click`
  (selector or coordinates), `browser.type` (fill + optional submit), and
  `browser.close`. One lazy-launched Playwright Chromium session per ToolRuntime
  instance; a driver boundary keeps the session unit-testable without a browser.
- **Navigation policy**: targets resolve against a configured base URL and are
  confined to the base origin plus `allowedOrigins` (`*` allows any http/https
  target); `data:` and `javascript:` targets are rejected.
- **Information-governance metadata (ENG-007)**: every browser evidence artifact
  retains origin, route, information classification (`VESTARA_BROWSER_CLASSIFICATION`),
  derived information risk, redaction status, retention policy
  (`VESTARA_BROWSER_RETENTION`), and the requesting agent — separating
  operational risk (read-only vs mutating) from information risk.
- **Wiring**: the tools register in the API's `createAgentTools` when
  `VESTARA_BROWSER_URL` (falling back to `VESTARA_SCREENSHOT_URL`) is set;
  `VESTARA_BROWSER_ALLOWED_ORIGINS` (comma-separated) widens the allowlist.
  Read-only actions run automatically; `click`/`type` are medium-risk
  (allowed-with-notification) and flow through the existing approval policy.
- 18 browser tool tests (URL policy + behavior + governance metadata against a
  fake driver). Findings ENG-007 and ENG-008 recorded in
  `docs/ENGINEERING-FINDINGS.md`.

---

## [3.9.19] — 2026-08-05 — Visual Baseline Review UI + Scenario Matrix (PCS-026)

### Added

- **Baseline review UI**: the Workspace **Evidence** page now lists visual
  baseline records (`/api/evidence/baselines`) with per-scenario status,
  inline candidate screenshot replay from the content-addressed artifact store,
  and **Approve**/**Reject** governance actions that POST to the existing
  baseline endpoints.
- **Visual scenario matrix**: `resolveVisualScenarios` derives one
  `VisualEvidenceCollector` per scenario from `VESTARA_SCREENSHOT_MATRIX`
  (JSON array of `{ route/url, viewport, theme, tolerance }`), expanding the
  single `VESTARA_SCREENSHOT_URL` scenario into a routes × viewports × themes
  matrix. The legacy `VESTARA_SCREENSHOT_ROUTE` / `VESTARA_SCREENSHOT_THEME`
  single-scenario form remains the fallback; baseline governance stays keyed
  per scenario.
- 8 scenario-matrix resolver tests; 4 Evidence baseline-review UI tests.

---

## [3.9.18] — 2026-08-03 — Distributed Workers over WebSocket + evidence follow-ons (PCS-027 slice 2, PCS-026)

### Added

- **WebSocket worker transport**: `WorkerSocketServer` (API, `/ws/worker`) +
  `WorkerSocketClient` (node side) + `worker-node-bootstrap` (node process entry
  loading `VESTARA_WORKER_EXECUTOR`). Real WS round-trip tests (register,
  dispatch, executionId idempotency, unknown-node rejection).
- **Orchestrator integration**: `WorkerCluster` wired in the API (WorkerStore/
  Registry/Scheduler), `worker.*` events projected into the engineering event
  store, `/api/workers/nodes|leases|dispatch`, and the Workspace **Workers**
  page (`/workers`, nav under Engineering).
- **PCS-026 follow-ons**: per-check evidence attribution
  (`check.evidenceKinds` in the pipeline) and `PlaywrightScreenshotSource`
  (lazy browser adapter; visual collector enabled via `VESTARA_SCREENSHOT_URL`).
- **Orchestrator uses the cluster**: the API's orchestrator dispatcher is a
  `FallbackTaskDispatcher` — prefers the `WorkerCluster` when worker nodes are
  online, else the durable harness.

---

## [3.9.17] — 2026-08-03 — Distributed Worker Cluster (PCS-027 slice 1)

### Added

- `packages/workflow-orchestrator/src/distributed/`: worker contracts
  (`WorkerNode`, `WorkerHeartbeat`, `TaskLease`, `WorkerRequest`/`Response`,
  `WorkerTransport`, `WorkerExecutor`), `WorkerStore` (nodes + leases, sql.js),
  `WorkerNodeRuntime` (pluggable executor + `executionId` result cache for
  idempotent re-dispatch), `RemoteWorkerDispatcher` (a `TaskDispatcher` over a
  transport), `WorkerRegistry` (registration/heartbeats/reap), `WorkerScheduler`
  (capability match + least-load), `WorkerCluster` (schedule → lease → dispatch
  → release), `MemoryWorkerTransport`.
- 7 cluster tests. WebSocket transport + orchestrator integration are the
  follow-ons.

---

## [3.9.16] — 2026-08-03 — PCS-027 Distributed Worker Cluster (spec)

### Added

- `docs/PCS-027-distributed-worker-cluster.md` — the next milestone spec:
  worker nodes execute the `TaskDispatcher` contract over a WebSocket
  transport; registration, heartbeats/liveness, capability + least-load
  scheduling in `WorkerPool`, lease-based idempotent failure recovery, and the
  PCS-026 evidence pipeline on remote results. Design only — slice-1
  implementation is the follow-on.

---

## [3.9.15] — 2026-08-03 — Workspace Evidence Viewer (PCS-026)

### Added

- `BundleStore` persists finalized `VerificationEvidenceBundle`s; the pipeline
  writes through it, and `/api/evidence/bundles[/:executionId]` +
  `/api/evidence/artifacts/:digest` serve them (artifact replay, immutable
  cache headers).
- Workspace **Evidence** page (`/evidence`, nav under Engineering): bundles
  with confidence levels, checks, evidence references + provenance, inline
  image artifact replay, confidence factors, and replay steps.
- `harness.verification-bundle` surfaces as a toast. 5 route tests.

---

## [3.9.14] — 2026-08-03 — Evidence Visual Comparison + Baselines (PCS-026 slice 2)

### Added

- `VisualComparisonEngine` — pngjs pixel diff with per-channel tolerance, diff
  ratio, and a diff-mask PNG.
- `BaselineStore` — human-reviewed visual baselines: candidates are recorded,
  only explicit `approve`/`reject` promote them (a collector never does).
- `VisualEvidenceCollector` — captures a screenshot through an injected
  `ScreenshotSource`, content-addresses it, and compares against the approved
  baseline → `pass` / `fail` / `needs-review`.
- 7 visual tests. Browser adapter provisioning + Workspace evidence viewer
  remain the integration follow-ups.

---

## [3.9.13] — 2026-08-03 — Engineering Evidence Pipeline (PCS-026 slice 1)

### Added

- **`@vestara/evidence`** package: `EvidencePipeline` (collect → content-address →
  immutable manifest → `VerificationEvidenceBundle`), slice-1 collectors
  (command output, filesystem change set, source diff), `ConfidenceEngine`
  (six derived dimensions: coverage, success, integrity, independence,
  replayability, freshness — never agent-assigned), and the PCS-026 contracts
  (bundle, evidence reference + provenance, checks, replay descriptor,
  confidence, visual baseline governance model).
- The harness verifier now persists a verification bundle after every run and
  emits `harness.verification-bundle` (bundle id + confidence).
- `docs/PCS-026-engineering-evidence-pipeline.md` — spec + slice-1 delivery
  record. 6 evidence tests.

---

## [3.9.12] — 2026-08-03 — Remote worker contract (PCS-025 §12)

### Added

- `WorkerPool` + `runWithConcurrency`: a bounded worker pool where each worker is
  a `TaskDispatcher`; the orchestrator's wave dispatch uses bounded concurrency.
- `SubprocessTaskDispatcher`: executes each task (and review/test) in an
  isolated child process over IPC (`dist/workers/subprocess-worker.js`), with a
  pluggable executor module (`VESTARA_WORKER_EXECUTOR`) — the `remote` worker
  boundary made real for the subprocess case.
- 7 worker tests (concurrency bound, round-robin, pool size, subprocess
  dispatch/review/test, executor failure propagation).

---

## [3.9.11] — 2026-08-03 — Orchestration create + detail UX and route tests

### Added

- Workspace Orchestration page: **New project** dialog (name, goal, repo path,
  task rows with files + capabilities) that drives create → analyze → plan →
  architecture → approve → execute; **expandable project cards** with per-project
  detail (task list + revision/attempt counters, audit trail, plan approval when
  `pending-approval`, resume execution).
- **Route-level tests** (`apps/api/__tests__/orchestration-routes.test.ts`) —
  create/list, missing-goal 400, approval-gateway round-trip through the real
  event bridge, and metrics/audit endpoints (4 tests).

---

## [3.9.10] — 2026-08-03 — Orchestration Workspace Dashboard (PCS-025 §18)

### Added

- Workspace **Orchestration** page (`/orchestration`, nav under Engineering):
  lists orchestrated projects with phase/status badges and task metrics
  (completed/total, retries, artifacts, elapsed), plus the Approval Gateway
  queue rendered inline with Approve/Deny actions.
- `GET /api/orchestration/projects` — lightweight project list for the UI;
  `WorkflowOrchestrator.listProjects(workspaceId)`.
- Route registered in the app manifest + nav (covered by the visual framework).

---

## [3.9.9] — 2026-08-03 — Multi-Repo Parent Orchestration (PCS-025 §16)

### Added

- `MultiRepoOrchestrator` + `ParentProjectStore`: one `WorkflowOrchestrator`
  per repository, a parent project aggregates the per-repo sub-projects
  (`runParentProject`, `parentStatus`, `aggregateMetrics`, `children`).
  `parent.created` / `parent.completed` events join the orchestration log.
- `runVerification` no longer fails when a blocked project reopens execution
  (guards the `executing -> executing` transition).
- 3 multi-repo tests.

---

## [3.9.8] — 2026-08-03 — Event-Sourced Rebuild (PCS-025 Phase 3)

### Added

- `task.created` events now carry the full task definition (summary,
  description, files, dependencies, required capabilities, effort), making the
  event log self-sufficient for replay.
- `WorkflowOrchestrator.rebuild(projectId, events, context)` reconstructs the
  project, plan, and tasks (with statuses) purely from `orchestration.*` events
  — project phase, cancellation, task definitions, revision/attempt counters.
- 3 event-sourced rebuild tests.

---

## [3.9.7] — 2026-08-03 — Multi-Agent Workflow Observability (PCS-025 §18)

### Added

- `WorkflowOrchestrator.onTelemetry` callback emitted on every lifecycle
  operation (dispatch, review, test, approval, task completion) with agent/
  status/phase/duration; wired to `TelemetryRuntime.track` in the API.
- `metrics(projectId)` / `listMetrics(workspaceId)` aggregates and
  `GET /api/orchestration/[projects/:id/]metrics` endpoints (task state counts,
  retries, revisions, artifacts, elapsed).
- 3 observability tests.

---

## [3.9.6] — 2026-08-03 — Multi-Agent Workflow Phase 2 + Phase 3 foundations (ADR-118 / PCS-025)

### Added

- **Reviewer + tester stages** with bounded revision loops: `TaskDispatcher`
  gains optional `review`/`test`; tasks flow `needs-review → reviewing →
  approved | changes-requested → assigned | rejected → blocked`, with a
  revision cap from the retry policy. `HarnessTaskDispatcher` implements both
  via reviewer/tester harness turns with a deterministic decision parser.
- **High-risk-change Approval Gateway**: `DefaultRiskApprovalPolicy` (delete,
  `.env`/sensitive paths, >10 files) + `awaiting-approval` task state +
  `resolveTaskApproval`/`pendingApprovals` + `/api/orchestration/.../tasks/:id/approval`.
- **Parallel task waves** with file-lock contention handling (`maxParallelTasks`,
  bounded lock-wait then block).
- **Capability-based assignment** via `@vestara/capabilities` resolver
  (exact/wildcard/implied matches).
- **Phase 3 foundations**: `TokenBudget` (blocks dispatch when exhausted) and
  event-sourced `reconcile(projectId, events)` drift detection; failure-
  injection and load tests for large task DAGs.

### Changed

- `task.approved` is a distinct event (no longer conflated with
  `task.completed`); `approved → testing | completed` in the task machine.

---

## [3.9.5] — 2026-08-03 — Multi-Agent Workflow Orchestration Core (ADR-118 / PCS-025 Phase 1)

### Added

- New `@vestara/workflow-orchestrator` package: `WorkflowOrchestrator` (single
  writer of project/plan/task state), project/plan/task state machines on
  `@vestara/state-machine`, sql.js `TaskStore`/`ArtifactStore`/`FileLockRegistry`,
  task-graph parallel waves + cycle detection, bounded retry/revision policy,
  and idempotent resume from persisted checkpoint. 28 tests.
- `HarnessTaskDispatcher` (`packages/workspace`) — tasks execute as durable
  harness threads tagged with a shared `workflowId`; capability-based agent
  resolution. 4 tests.
- `orchestration.*` event bridge — workflow mutations append to the temporal
  engineering event store (`correlationId` = projectId), replayable alongside
  `harness.*`/`change.*`.
- `/api/orchestration/*` routes — create/start/analyze/plan/architecture/
  approve/execute/verify/cancel/archive/resume + snapshot + audit.

### Changed

- ADR-118 (blueprint) and ADR-004 (implementation) moved **proposed → accepted**:
  Phase 1 orchestration core is implemented (partial). Phases 2-3 pending.
- `projectWorkflowAcrossThreads` resolves the shared `workflowId` from thread
  metadata (multi-thread aggregation for orchestrated projects).
- `AgentWorkflowService` marked deprecated — superseded by the orchestrator.

### Fixed

- Type errors in in-progress multi-agent work (`ChangeProjectorLike` variance,
  readonly options) and `readonly` array types in `multithread.ts` so `pnpm build`
  passes across the solution.

---

## [3.9.4] — 2026-08-01 — Screenshot Automation CLI

### Added

- `vestara screenshots` command surface for visual comparison, explicit baseline updates, report generation, artifact cleanup, and framework checks.
- Validated viewport, theme, route, URL, tolerance, maximum-difference, stability, role, network-wait, and CI controls.
- Structured JSON execution results for CI and agent consumers.
- CLI argument and safety tests proving comparison is the default and baseline mutation requires an explicit action.

### Reused

- The CLI delegates to the existing Workspace Playwright scripts and configuration instead of introducing a parallel screenshot runner.

## [3.9.3] — 2026-08-01 — Semantic Documentation Validation

### Added

- Deterministic validation for implementation-reference existence, approved ownership, package-version alignment, review ordering and expiry, verification evidence, public barrel coverage, package commands, ADR status, and kind/authority classification.
- Repository-local approved-owner registry at `docs/documentation-owners.json`, with package metadata ownership supported through `package.json.documentation.owner`.
- Application package manifests in implementation inventory so documented app commands validate against real scripts.
- Mutation-style acceptance coverage that corrupts each semantic claim in the independently conforming `@vestara/settings-framework` documents.

### Behavior

- Overdue documents declared current are projected as stale.
- Existing semantic debt remains baseline-visible while newly introduced violations fail CI.
- The `@vestara/documentation` and `@vestara/settings-framework` reference packages have zero semantic findings.
- Repository-local owner registries resolve all 110 previously unregistered Blueprint and Specifications owners; placeholder owners remain unapproved.
- Typed cross-repository implementation references accept configured repository IDs or GitHub-style repository slugs and path arrays.
- A checksum-protected, human-approval-required proposal maps all 20 symbolic Blueprint implementation references without modifying Blueprint architecture documents.
- Governance decision catalogs may enumerate proposed ADRs without treating them as accepted dependencies; ordinary related-ADR claims still require accepted/current status.
- ADR-004's proposed status versus PCS-025 dependency is captured as a checksum-protected human decision proposal.

## [3.9.2] — 2026-08-01 — Executable Public-Package Documentation Standard

### Added

- Canonical governed package documentation in `packages/documentation/README.md` with implementation, lifecycle, failure, health, security, API, ownership, ADR, and verification evidence.
- Executable public-package README section and frontmatter contracts in `@vestara/documentation`.
- Package privacy-aware requirement resolution and typed findings for missing README metadata or sections.
- Required `README.md`, `ARCHITECTURE.md`, `TESTING.md`, and `API.md` coverage for non-private packages.
- Reference-conformance and violation tests for the canonical README contract.

### Changed

- VSDE now defines the human-readable public-package documentation standard and points to its executable and reference implementations.
- Documentation status parsing now preserves all supported status values, including `current`.
- Generated package README links now resolve correctly to repository documentation.
- Documentation baseline refreshed to record existing migration debt under the new standard while preserving fail-on-new-finding behavior.

### Independent conformance

- Migrated `@vestara/settings-framework`, Vestara's first non-private package, to the canonical standard.
- Added governed `README.md`, `ARCHITECTURE.md`, `TESTING.md`, and `API.md` documents backed by implementation and test references.
- Corrected the package test scripts so all 144 tests across five suites execute from the monorepo Vitest root.
- Resolved 27 baseline findings with no newly introduced package requirement findings.

## [3.9.1] — 2026-08-01 — Workspace Notification Queue Reliability

### Changed

- Workspace toasts now display one at a time through a bounded five-entry queue.
- Identical type/message notifications received within three seconds collapse into one toast with a repetition count.
- Waiting errors are prioritized without interrupting the currently visible toast.
- Each toast receives a full five-second display window; manual dismissal advances the queue.
- Vitest and Playwright collection boundaries are explicit: only the Playwright visual entrypoint is excluded from Vitest.

### Verification

- Added deterministic queue tests for duplicate collapse, window expiry, error priority, FIFO ordering, and queue limits.
- Declared `jsdom` and Testing Library as workspace test dependencies.
- Workspace Vitest suite and production build pass.

## [0.0.0] — Pre-Development

### Added
- Repository initialized
- Project structure created
- Architecture traceability documents established
- Milestones defined through v1.0

### Architecture Frozen (ADR-016)
- Vestara Architecture v1.0 declared complete
- Engineering Phase begins
- All 5 repositories: Blueprint, Specifications, Foundation, Runtime, AI Core
- Golden Path defined: Boot → Chat → Read File → Persist → Restart → Resume

---

## [3.8.0] — 2026-07-30 — Development Lifecycle & Governance

### Added
- **Epistemic Principles** — four-layer model (Behavior, Knowledge, Confidence, Governance), three categories of truth, derivation principle, epistemic governance — codified in AIDL v1.3.0
- **Daily Operational Lifecycle** — 5-agent workflow (Context → Planner → Engineer → Reviewer → Verifier) with `/init`, `/morning`, `/work`, `/review`, `/verify`, `/evening` commands
- **Engineering Knowledge System (EKS)** — organizational memory with structured entries, promotion gate, knowledge maturity lifecycle (Hypothesis → Observation → Emerging Pattern → Verified Practice → Engineering Principle), and derived confidence model
- **5 specialized agents** in `.opencode/agents/` with strict role boundaries:
  - `vestara-context` — read-only discovery
  - `vestara-planner` — analyze, prioritize, recommend (never implements)
  - `vestara-engineer` — implement approved tasks (never invents scope)
  - `vestara-reviewer` — inspect, report (never modifies)
  - `vestara-verifier` — prove via evidence (never interprets)
- **Lifecycle skill** at `.opencode/skills/vestara-lifecycle/SKILL.md`
- **Foundation document** at `docs/foundation/02-development-lifecycle.md`
- **EKS runtime** seeded with first entry: `workspace-rewrite-incremental-migration.md`

### Changed
- `vestara-blueprint/00-governance/03-ai-development-lifecycle.md` — expanded from 395 to 840+ lines with daily lifecycle, EKS, confidence model, and epistemic principles (v1.0.0 → v1.3.0)
- `opencode.json` — added `context`, `engineer`, `verifier` profiles; updated `planner` and `reviewer` with strict tool restrictions; added lifecycle prompt to instructions
- `AGENTS.md` — documented 5 agents, lifecycle skill, and participant permission matrix
- Removed old single-purpose agents (`vestara-build`, `vestara-plan`, `vestara-review`, `plan`, `ollama_dev`)

### Philosophy
- "Agents don't perform work. They participate in a software development lifecycle."
- "The organization learns, not the individual."
- "Prefer deriving information over storing duplicate state."

---

## [3.9.0] — 2026-07-31 — Agent Filesystem Capabilities & Multi-Agent Workflow Design

### Added
- **FilesystemRuntime hardening** (`packages/filesystem-runtime`) — path traversal + absolute-path containment, deny list (`.env`, `credentials.json`, …), `update` (patch-based), `stat`, `copy`, dry-run mode, bounded operation history with `onOperation` audit hook, structured `FsObservation` results
- **AgentCapabilityManager** (`packages/workspace`) — capability boundary between agents and the filesystem; 12 `filesystem.*` capabilities (`read`, `write`, `update`, `delete`, `create`, `rename`, `copy`, `list`, `stat`, `exists`, `search`, `references`) gated by `(resource, action)` permissions; mutations require a reason
- **AgentRuntime.executeCapability()** — permission-gated capability execution with observation feedback into session memory; developer agent parses LLM JSON operations or Claude-style `<invoke>` tool calls and executes them
- **Capability tools** — `filesystem.*` exposed as ActionRuntime tools via `createFilesystemCapabilityTools()`
- **API** — `POST /api/agents/:id/capabilities` route; `ImplementationService.apply()` routed through the capability manager
- **Specs** — `docs/PCS-024-agent-filesystem-capabilities.md`, `docs/PCS-025-multi-agent-project-management.md`
- **Repository distribution** — `vestara-blueprint`, `vestara-foundation`, `vestara-labs`, `vestara-reference`, `vestara-runtime`, `vestara-specifications` published as standalone public repos under `github.com/evillan0315`

### Changed
- `packages/workspace` now depends on `@vestara/filesystem-runtime`
- `AGENTS.md` — repo layout updated for published documentation repos

### Security
- Agents never touch the filesystem directly — all access flows through `AgentCapabilityManager` → `FilesystemRuntime`
- Delete and high-risk operations require explicit approval; workspace-root escape and deny-list paths are rejected

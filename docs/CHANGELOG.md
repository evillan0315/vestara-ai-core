# Changelog
## Vestara AI Core — Implementation Progress

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

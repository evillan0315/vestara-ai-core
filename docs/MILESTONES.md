# Milestones

## Vestara — Architecture Era to Product Era

> **Each milestone builds on the previous one. Architecture milestones validated internal contracts; product milestones validate user-facing capabilities.**

---

## Architecture Era Milestones (Phase 3)

### v0.1.0 — Bootable Runtime

**Objective**: The kernel boots, loads configuration, initializes services, loads a provider, and shuts down gracefully.

**Verification**: `pnpm vestara doctor` returns healthy.

**Key subsystems**: Kernel, EventBus, Logger, Metrics, Configuration, ServiceRegistry, Health, ProviderRuntime, OpenCodeProvider

**Status**: ✅ Complete

---

### v0.2.0 — Executive Brain

**Objective**: Conversations create, messages stream, tools execute with permission checks, state persists across restarts.

**Verification**: `pnpm vestara demo golden-path` passes all 10 steps.

**Key subsystems**: ConversationService, ContextAssembler, StreamProcessor, ActionRuntime, PermissionEngine, StateRuntime (SQLite), MemoryRuntime, CognitiveEngine, KnowledgeEngine, ReasoningRuntime, FilesystemTool

**Status**: ✅ Complete

---

## Product Era Milestones

### v0.3.0 — Repository Comprehension ✅

**Objective**: A developer can point Vestara at any repository and understand it in minutes instead of hours.

**Command**: `vestara open .`

**Pipeline**: Discover → Fingerprint → Analyze → Manifest → Index → Present → Session

**Key artifacts**:

- `@vestara/workspace` package with `WorkspaceRuntime` state machine
- `RepositoryWorkspace` canonical domain object
- `.vestara/` directory with workspace manifest + knowledge + memory
- RepositoryPresenter with deterministic facts + best-effort AI narrative
- Stage timing instrumentation

**Performance baselines** (vestara-ai-core/, 194 files):

```
Discover      15ms
Fingerprint   34ms
Analyze       32ms
Index        413ms
Present      410ms
Session       17ms
Pipeline     924ms
Total       2142ms  (includes kernel boot)
```

**Spec**: `docs/PCS-001-repository-comprehension.md`

**Status**: ✅ Complete

---

### v0.3.1 — Repository Intelligence Expansion ✅ Complete

**Objective**: Deterministic repository analysis deepens — dependency graphs, circular dependency detection, architectural layer identification, entry-point confidence scoring, TODO hotspot mapping, test coverage discovery.

**Command**: `vestara open .` (enriched output)

**Key artifacts**:

- `DependencyEdge`, `DependencyGraph` types in `@vestara/workspace`
- `Layer`, `LayerAssignment` types
- `detectDependencyGraph()` — builds adjacency graph from `PackageNode[]`, detects cycles via DFS, reports strongly-connected components
- `assignLayers()` — heuristics-based layer classification per package (contracts, infrastructure, services, tools, UI, app)
- `scoreConfidence()` — per-entry-point confidence score (0.0–1.0) based on detection strategies matched and file existence
- Expanded `DetectedRisk` categories: `circular-dependency`, `layer-violation`, `low-confidence-entry`
- Updated `RepositoryProfile` with `dependencyGraph` and `layers` fields
- Updated `RepositoryPresenter` to render enriched output
- Updated existing tests + new tests for each new function

**Heuristic layer model**:

| Layer | Heuristic | Examples |
| ------- | ----------- | ---------- |
| `contracts` | Zero deps, named `shared`, `types`, `contracts` | `@vestara/shared` |
| `infrastructure` | Depends on contracts, provides plumbing | `logger`, `configuration`, `state-runtime` |
| `services` | Depends on infrastructure, provides business logic | `workspace`, `knowledge`, `memory` |
| `tools` | Named `tools/*` or depends on `action` | `tools/filesystem`, `tools/shell` |
| `app` | Has `bin` or `main` entry point | `cli`, `api` |
| `ui` | Has react/vue/svelte dependency | `workspace-ui` |

**Status**: ✅ Complete

---

### v0.3.2 — Incremental Workspace ✅ Complete

**Objective**: Workspace ready before indexing completes — the pipeline splits into fast path (required) and deferred path (indexing). Re-opens of unchanged repos are sub-second. File watching keeps knowledge fresh without manual re-index.

**Command**: `vestara.open .` (workspace REPL), `vestara open .` (CLI)

**Pipeline change**: The open pipeline is split into synchronous required stages and asynchronous deferred stages:

```
Fast path (required, synchronous):
  Discover → Fingerprint → Analyze → Manifest → Present → Session → Ready

Deferred (background, after Ready):
  Index → emit workspace:index.completed
```

**Key artifacts**:

- `WorkspaceStatus` gains `'deferred-index'` state
- `WorkspaceRuntime.open()` — moves `transition('ready')` before indexing; forks indexing as a background promise stored on the session
- `RepositoryDiscovery.discover()` — captures per-file mtime map alongside file list; supports `changedSince` filtering for incremental re-opens
- `WorkspaceManifestData` gains `files` block: `{ count, totalSizeKB, byExtension, mtimeCache: Record<string, string> }` — stores the file list + mtimes for incremental diff on next open
- `MonitorService` auto-started after session init — uses `fs.watch` to detect file additions/changes/deletions; triggers incremental reindex for changed files
- `WorkspaceSession.knowledgeReady` — a `Promise<void>` that resolves when deferred indexing completes; consumers (search, explain) await it before querying knowledge
- CLI output shows pipeline timing split: "Workspace ready in Xms (indexing in background)"

**Incremental re-open flow**:

1. Load manifest, compare stored `mtimeCache` against current disk mtimes
2. If no files changed → skip all stages, load from cache → sub-second
3. If some files changed → only re-analyze changed packages, re-index changed files
4. If config files changed (`repositoryHash` mismatch) → full pipeline as before

**Status**: ✅ Complete

---

### v0.3.3 — Explain ✅ Complete

**Objective**: Explain any architecture, module, symbol, or data flow within an opened workspace.

**Command**: `vestara explain <target>` (workspace-aware REPL)

**Key artifacts**:

- `docs/PCS-002-explain.md` — Product Capability Specification
- `docs/UX-002-explain.md` — User Experience Specification
- `docs/ATS-002-explain.md` — Acceptance Test Specification
- `ExplainService` in `@vestara/workspace` — three-tier service (deterministic → knowledge → AI)
- REPL integration — `explain` built-in command with memory enrichment

**Three-tier design**:

| Tier | Method | Always works? |
| ------ | -------- | --------------- |
| Deterministic | `RepositoryProfile` lookup | Yes |
| Knowledge-augmented | FTS search in indexed documents | Yes |
| AI-synthesized | Provider call with context | No (graceful fallback) |

**Supported targets**: `architecture`, `<module-path>`, `<package-name>`, `dependencies`, `risks`

---

### The Artifact Model

Each capability produces a durable artifact that enriches the workspace:

```
Command              Durable artifact       Purpose
────────────────────────────────────────────────────────
vestara open         RepositoryWorkspace    Persistent repository understanding
vestara explain      Explanation            Accessible accumulated knowledge
vestara plan         Plan                   Executable intent
vestara implement    Change Set             Applied approved changes
vestara verify       Verification Report    Evidence of correctness
vestara collaborate  Collaboration State    Coordinated execution
```

Artifacts form a dependency chain rather than existing in isolation. A `Plan` references Explanations. An `Implementation` references a `Plan`. A `Verification Report` references an `Implementation`. The workspace is the root aggregate that owns all artifact collections.

---

### v0.4 — Planning ✅ Complete

**Objective**: Transform understanding into executable intent. A plan is a first-class durable artifact with its own lifecycle, identity, and traceability.

**Command**: `vestara plan <goal>` (workspace-aware REPL)

**Key artifacts**:

- `docs/PCS-003-plan.md` — Product Capability Specification
- `Plan` type in `@vestara/workspace` types — `Plan`, `Task`, `PlanStatus`, `TaskStatus`
- `PlanStorage` — SQLite-backed persistence in `.vestara/plans/plans.db`
- `PlanningService` — two-tier orchestration (deterministic → AI)
- REPL commands — `plan <goal>`, `plan list`, `plan show <id>`, `plan approve <id>`

**Plan lifecycle**: `draft → proposed → approved → executing → completed → cancelled`

**Two-tier design**:

| Tier | Method | Always works? |
|------|--------|---------------|
| Deterministic | Task framework from workspace context | Yes |
| AI-synthesized | Structured plan with specific files and deps | No (graceful fallback) |

---

### v0.5 — Implementation ✅ Complete

**Objective**: Transform an approved `Plan` into a durable `Change Set` — an execution artifact recording every file modification with full traceability back to the originating plan.

**Command**: `vestara implement <plan-id>`, `implement apply <cs-id>`, `implement show <cs-id>`

**Key artifacts**:

- `docs/PCS-004-implement.md` — Product Capability Specification
- `ChangeSet` type in `@vestara/workspace` — `ChangeSet`, `FileChange`, `ChangeSetStatus`
- `ChangeSetStorage` — SQLite-backed persistence in `.vestara/plans/plans.db`
- `ImplementationService` — code generation per task + filesystem apply
- REPL commands — `implement <plan-id>`, `implement show <cs-id>`, `implement apply <cs-id>`

**Design**:

| Tier | Method | Always works? |
|------|--------|---------------|
| Deterministic | Placeholder comments with task guidance | Yes |
| AI-synthesized | Complete file content generation per task | No (graceful fallback) |

**Safety**: Changes are generated as a `Change Set` artifact. User reviews before applying. `apply` writes to disk.

---

### v0.6 — Verification ✅ Complete

**Objective**: Transform implementation outcomes into verifiable engineering evidence. The AI never decides pass/fail — verification is deterministic.

**Command**: `vestara verify <cs-id>`, `verify show <vr-id>`

**Key artifacts**:

- `docs/PCS-005-verify.md` — Product Capability Specification
- `VerificationReport` type — `VerificationReport`, `VerificationCheck`, `VerificationStatus`
- `VerificationStorage` — SQLite-backed persistence
- `VerificationService` — 5 deterministic checks
- REPL commands — `verify <cs-id>`, `verify show <vr-id>`

**Five checks**:

| Check | Method |
| ------- | -------- |
| Filesystem integrity | Verify all expected files exist |
| Change Set consistency | Verify disk content matches proposed |
| TypeScript typecheck | `npx tsc --noEmit` |
| Test execution | `pnpm test` |
| Build validation | `pnpm build` |

**Principle**: Evidence first, AI interpretation second. The AI never decides pass/fail.

---

### v0.7 — Collaboration ✅ Complete

**Objective**: Introduce the human coordination layer around engineering artifacts. AI may propose. Humans approve. System records.

**Commands**: `collab submit/submit <cs-id>`, `collab approve <cr-id>`, `collab reject <cr-id>`, `collab comment <cr-id>`, `collab status <cr-id>`, `collab list`

**Key artifacts**:

- `docs/PCS-006-collaboration.md` — Product Capability Specification
- `CollaborationRecord` type — `CollaborationRecord`, `Approval`, `CollaborationComment`, `Ownership`, `ReviewStatus`
- `CollaborationStorage` — SQLite-backed with append-only approvals table
- `CollaborationService` — review lifecycle state machine
- REPL commands — collab submit/approve/reject/comment/status/list

**Review lifecycle**: `draft → submitted → reviewing → approved/rejected → completed`

**Safety invariants**:

- Approvals are immutable append-only events — never overwritten
- AI may never approve its own changes
- Status transitions follow a strict state machine

---

### v0.8 — Agent Runtime ✅ Complete

**Objective**: Transition from a single AI assistant to a governed ecosystem of specialized AI agents collaborating through artifacts. Agents operate through the Vestara lifecycle — they do not control repositories directly.

**Commands**: `agent list`, `agent inspect <agent>`, `agent run <agent> <task>`

**Key artifacts**:

- `docs/PCS-007-agent-runtime.md` — Product Capability Specification
- `AgentDefinition`, `AgentExecution`, `AgentPermission` types
- `AgentStorage` — SQLite-backed with 4 built-in agents
- `AgentPermissionEngine` — resource-based permission checking
- `AgentRuntime` — per-role execution through the Vestara lifecycle
- REPL commands — agent list/inspect/run

**Built-in agents**:

| Agent | Role | Capabilities |
| ------- | ------ | ------------- |
| Architect | architect | Architecture analysis, design review, dependency analysis |
| Developer | developer | Code generation, refactoring, bug fixing |
| Verifier | verifier | Testing, diagnostics, quality analysis |
| Documenter | documenter | Documentation, summarization, knowledge management |

**Safety invariant**: Agents can act. Artifacts provide accountability. Humans retain authority.

---

### v0.9 — Memory & Knowledge Graph ✅ Complete

**Objective**: Introduce persistent organizational memory. Build a connected knowledge layer across repositories, artifacts, decisions, agents, and architectural evolution. Vestara learns from its own history.

**Commands**: `memory index`, `memory search <query>`, `memory explain <concept>`, `memory graph`

**Key artifacts**:

- `docs/PCS-008-memory.md` — Product Capability Specification
- `KnowledgeNode`, `KnowledgeRelation` types with 7 node types and 6 relation types
- `KnowledgeGraphStorage` — SQLite-backed graph with nodes, relations, search
- `MemoryService` — indexes workspace artifacts into a queryable knowledge graph
- REPL commands — memory index/search/explain/graph

**Knowledge sources**: RepositoryWorkspace, Plans, Change Sets, Collaboration Records, Agent Executions

**Safety**: Memory may inform decisions. Memory may not silently change decisions. Every learned fact has provenance.

---

### v1.0 — Autonomous Engineering Workspace ✅ Complete

**Objective**: Combine all prior capabilities into a unified, session-driven operating model. An engineering session represents a complete objective — from understanding through planning, execution, verification, governance, and agent coordination — within a single persistent context.

**Commands**: `workspace create <title>`, `workspace run <id>`, `workspace status <id>`, `workspace list`, `workspace events <id>`

**Key artifacts**:

- `docs/PCS-009-engineering-session.md` — Product Capability Specification
- `EngineeringSession` type — `EngineeringSession`, `SessionParticipant`, `SessionStatus`
- `AgentWorkflow` — defines multi-agent orchestration
- `WorkspaceEvent` — platform event stream
- `SessionStorage` — SQLite-backed with event log
- `SessionService` — orchestrates the 4-step feature workflow
- REPL commands — workspace create/run/status/list/events

**Built-in workflow — Feature Development**:

| Step | Agent | Produces |
| ------ | ------- | ---------- |
| 1 | Architect | Plan |
| 2 | Developer | Change Set |
| 3 | Verifier | Verification |
| 4 | Human | Approval (gate) |

**Safety**: Automation may execute. Governance decides. All agent actions are recorded as immutable events.

---

### v1.1 — Workspace UI ✅ Complete

**Objective**: Create the first graphical client for the Vestara Engineering Workspace. UI consumes Vestara but does not become Vestara. CLI remains a first-class client.

**Application**: `apps/workspace` (React 19 + Vite + Tailwind CSS)

**Screens**: Dashboard, Session List, Session View, Artifact Explorer, Agent Monitor, Knowledge Graph

**Architecture rule**: Workspace UI consumes Vestara. Workspace UI does not become Vestara. No business logic in the UI.

---

### v1.6 — Cloud Execution Environment ✅ Complete

**Objective**: Extend agent and workspace execution beyond the local machine with job queues, worker pools, and remote execution orchestration.

**Commands**: `cloud status`, `cloud workers`, `cloud job list`, `cloud job submit <type> <target>`

**Key artifacts**:

- `docs/PCS-015-cloud-execution.md` — Product Capability Specification
- `CloudJob`, `CloudWorker` types with 3 worker types
- `CloudStorage` — SQLite-backed with 3 seeded workers
- `CloudService` — job lifecycle (pending → running → completed/failed)
- REPL commands — cloud status/workers/jobs

### v2.2 — Auto-Indexing & Knowledge Propagation ✅ Complete

**Objective**: Automatically propagate artifact changes into the knowledge graph without requiring explicit `memory index` commands.

**Commands**: `auto-index run`, `auto-index status`

**Key artifacts**:

- `AutoIndex` class — indexes Plans, ChangeSets, Collaboration records into the knowledge graph
- Single-artifact indexing (`indexPlan`, `indexChangeSet`, `indexCollaboration`)
- Bulk indexing (`indexAll` for existing artifacts)

**Design**: Artifacts become knowledge graph nodes automatically when created, keeping memory current without manual steps.

---

### v2.3 — Repository Health Scoring ✅ Complete

**Objective**: Add a composite health score to repository analysis combining code quality, test coverage, dependency health, and documentation metrics.

**Commands**: Displayed in `vestara open .` summary output

**Key artifacts**:

- `HealthScore` type with 4 weighted categories and overall score (0.0–10.0)
- Deterministic computation in `RepositoryIntelligence`
- Display in `RepositoryPresenter.renderCli()`

**Scoring model**:

| Category | Weight | Factors |
| ---------- | -------- | --------- |
| Code Quality | 25% | Large file ratio, TODO/FIXME density |
| Test Coverage | 25% | Packages with tests / total packages |
| Dependency Health | 25% | Risk count, dependency hygiene |
| Documentation | 25% | README presence, doc file ratio |

**Properties**: Repeatable, fast, offline, composable, auditable. No AI required.

---

### v2.7 — Outcome Verification ✅ Complete

**Objective**: Verify outcomes, not just outputs. Validate that the implemented change fulfilled the approved plan, stayed within predicted impact, and improved the repository as expected.

**Commands**: `verify <cs-id>`, `verify plan <id>`, `verify workspace`, `verify accuracy`

**Key artifacts**:

- `docs/capabilities/CSP-017-verify/` — First Capability Specification Package (6 documents)
- `PredictionAccuracy` type and storage — closed feedback loop between prediction and outcome
- `verifyPlan()` — validates plan task completion against linked ChangeSets
- `verifyWorkspace()` — overall health, category breakdown, accuracy summary

**Validation dimensions**: Plan completion, implementation coverage, prediction accuracy, quality checks, health delta.

**Principle added**: Documentation-First Engineering — no implementation begins until the capability documentation is complete, internally consistent, and approved.

---

### v2.4 — Predictive Engineering ✅ Complete

**Objective**: Turn repository understanding into actionable engineering insight. Before implementing a change, predict its likely consequences through deterministic impact analysis with optional AI narrative.

**Commands**: `predict <goal>`, `predict plan <id>`, `predict history`, `predict compare <id1> <id2>`

**Key artifacts**:

- `docs/PCS-018-predictive-engineering.md` — Product Capability Specification
- `ImpactAssessment` — durable artifact with `ScopeAnalysis`, `RiskAssessment`, `EffortEstimate`, `HealthPrediction`, `Recommendation[]`
- `ImpactStorage` — SQLite-backed persistence in `impact/impact.db`
- `PredictionService` — deterministic analysis + optional AI narrative

**Engineering lifecycle**:

```text
Open → Explain → Plan → Predict → Implement → Verify → Collaborate
```

Prediction creates an explicit decision point between planning and execution, answering "What is likely to happen?"

---

### v2.1 — Async Execution Engine ✅ Complete

**Objective**: Introduce a first-class async execution engine for all platform services with streaming progress, cancellation, and persistent job history.

**Commands**: `exec <type> <target>`, `exec list`, `exec status <id>`, `exec cancel <id>`

**Key artifacts**:

- `docs/PCS-017-execution-engine.md` — Product Capability Specification
- `ExecJob`, `ExecProgressEvent` types with 5 status values and 5 event types
- `ExecutionEngine` — async job queue with AbortController-based cancellation
- REPL commands — exec submit/status/list/cancel

### v2.0 — Vestara AI OS Integration ✅ Complete

**Objective**: Vestara becomes a native operating system capability with boot registration, service management, and system-level workspace provisioning.

**Commands**: `os info`, `os status`, `os services`, `os daemon`

**Key artifacts**:

- `docs/PCS-016-os-integration.md` — Product Capability Specification
- `OSService`, `SystemInfo` types
- `OSSystemService` — system info, service registry, health monitoring
- 5 registered OS services: Kernel, Workspace, Agent, Plugin, Cloud

### v1.5 — Plugin Ecosystem ✅ Complete

**Objective**: Introduce controlled extensibility through enterprise-governed plugins with identity, permissions, hooks, and audit events.

**Commands**: `plugin list`, `plugin info <id>`, `plugin toggle <id>`

**Key artifacts**:

- `docs/PCS-014-plugin-ecosystem.md` — Product Capability Specification
- `PluginDefinition`, `PluginPermission`, `PluginExecution` types
- `PluginRegistry` — SQLite-backed with 4 built-in plugins
- `PluginRuntime` — hook execution lifecycle
- REPL commands — plugin list/info/toggle

**4 built-in plugins**:

| Plugin | Hooks | Permissions |
| -------- | ------- | ------------- |
| GitHub Integration | after-verify, after-approve | repository:read, collaboration:read |
| Jira Connector | after-plan, after-approve | collaboration:read |
| Slack Notifier | after-verify, after-approve | collaboration:read |
| Structured Log Export | after-execution | repository:read |

---

### v1.4 — Enterprise Organizations ✅ Complete

**Objective**: Add enterprise-grade organizational structure on top of the multi-repository foundation.

**Commands**: `enterprise status`, `enterprise team create/list`, `enterprise project create/list`, `enterprise policy list`, `enterprise audit`

**Key artifacts**:

- `docs/PCS-013-enterprise.md` — Product Capability Specification
- `Team`, `EnterpriseProject`, `ApprovalPolicy`, `AuditEvent` types
- `EnterpriseStorage` — SQLite-backed with 4 tables
- `EnterpriseService` — RBAC, policies, audit trail
- REPL commands — full enterprise management

**3 default policies**: Plan Approval, Change Set Approval, Verification Review

---

### v1.3 — Multi-Repository Intelligence ✅ Complete

**Objective**: Extend the knowledge graph across multiple repositories for organization-wide intelligence.

**Commands**: `org init <name>`, `org add-repo <path>`, `org list-repos`, `org search <query>`, `org graph`, `org impact <repo>`, `org list`

**Key artifacts**:

- `docs/PCS-012-multi-repository.md` — Product Capability Specification
- `Organization`, `OrganizationRepository` types
- `OrganizationStorage` — SQLite-backed with relation tracking
- `OrganizationService` — cross-repo search, dependency detection, impact analysis, knowledge graph

**Capabilities**: Cross-repo search, knowledge graph, impact analysis

---

### v1.2 — Remote Agent Execution ✅ Complete

**Objective**: Introduce execution isolation for agents with streaming logs, resource management, and permission enforcement.

**Key artifacts**:

- `docs/PCS-011-agent-execution.md` — Product Capability Specification
- `AgentWorker` — 3 execution modes (in-process, subprocess, remote)
- `AgentCoordinator` — dispatch/monitor/cancel lifecycle
- `WorkerEvent` — typed event stream (log, output, progress, error, complete)

**Worker types**:

| Type | Isolation | Communication |
| ------ | ----------- | --------------- |
| In-process | None | Direct memory |
| Subprocess | Process-level | IPC messages |
| Remote | Network | Events stream |

---

### v3.0 — Quality Infrastructure

**Objective**: Establish the engineering quality fundamentals that make the codebase maintainable, verifiable, and contributor-ready. Every package has tests, a linter enforces code standards, CI gates every commit, and build artifacts are excluded from version control.

**Verification**:

- `pnpm test` passes with 100% package coverage (every live package contributes at least one test)
- `pnpm lint` enforces consistent style with zero exceptions
- CI workflow runs tests + lint on every push/PR
- `git status` after a build shows no untracked compiled artifacts

**Gaps to close (from audit)**:

| Gap | Current state | Target |
| ----- | --------------- | -------- |
| `.gitignore` | None anywhere in repo | Excludes `dist/`, `node_modules/`, `*.tsbuildinfo`, `*.js.map`, compiled `.js`/`.d.ts` next to `.ts` |
| CI/CD | No automation | GitHub Actions: `pnpm install → build → test → lint` on push/PR |
| Linter | No ESLint or Biome | Biome (fast, zero-config, covers lint+format) configured and passing |
| Untested packages | 6 packages with source but no tests | Every live package has at least one `.test.ts` |
| Untested apps | 3 apps (`api`, `cli`, `workspace-ui`) with no tests | Smoke tests for each app |
| Stale compiled artifacts | 5 `.js`/`.d.ts`/`.js.map` triplets in `workspace/__tests__/`, plus `vitest.config.js` detritus at root | Cleaned and excluded by `.gitignore` |
| Missing per-package `test` scripts | 15/23 packages with tests lack a `"test"` script | Every package with a `__tests__/` directory has `"test": "vitest run"` in `package.json` |
| Empty placeholder test dirs | `tests/integration/`, `tests/performance/` are empty | Populated or removed with a decision record |
| Implicit vitest dependency | Most packages rely on root hoisting | Every package that needs vitest declares it in `devDependencies` |
| Stale docs | `IMPLEMENTATION_STATUS.md` claims "No test files exist" and misses `events-server`, `os-controller`, `apps/api` | Reconciled with actual codebase state |

**Key artifacts**:

- `.gitignore` at `vestara-ai-core/` root
- `.github/workflows/ci.yml` — CI workflow
- `biome.json` or equivalent linter/formatter config
- Test files for: `events`, `providers/opencode`, `tools/{knowledge,memory,project,shell}`, `apps/{api,cli,workspace}`
- Updated `IMPLEMENTATION_STATUS.md`

**Principle**: Quality infrastructure is not optional. Tests, linting, CI, and `.gitignore` are prerequisites for accepting external contributions and for trusting automated refactoring.

**Status**: ✅ Complete

---

### v3.1 — Codebase Cleanup ✅ Complete

**Objective**: Run Biome across the entire codebase, fix all lint and formatting violations, and set up pre-commit hooks so the codebase stays clean automatically.

**Verification**:

- `pnpm lint` exits with zero warnings
- `pnpm format` produces no changes
- Pre-commit hook runs biome + tests on staged files
- `pnpm test` still passes (101 tests)

**Key artifacts**:

- Cleaned codebase (all files pass Biome `recommended` ruleset)
- `scripts/pre-commit.sh` — git pre-commit hook running biome + tests
- `.husky/pre-commit` or `.githooks/pre-commit` — installed hook

**Gaps to close**:

| Gap | Current state | Target |
| ----- | --------------- | -------- |
| Biome violations | Untested — likely thousands across 600+ files | Zero violations |
| Pre-commit hooks | None | Biome + tests on every commit |
| `pnpm lint` status | Not run yet | Clean exit |

**Status**: ✅ Complete

**Verification results**:

- `pnpm lint` → zero errors (202 files checked, auto-fixed 149 + 55 + 1 files)
- `pnpm format` → 202 files formatted, no fixes remaining
- `pnpm test` → 938 tests pass, 88 test files (1 skipped)
- Pre-commit hook installed at `.githooks/pre-commit`, configured via `git config core.hooksPath .githooks`
- `apps/workspace` (React UI) excluded from Biome to avoid React-specific false positives

---

### v3.2 — Documentation Generation ✅ Complete

**Objective**: Generate API reference documentation from TypeScript source code across all packages. Produce a browsable docs site with package descriptions, type signatures, dependency graphs, and changelog.

**Verification**:

- `pnpm docs` generates HTML output in `docs/api/`
- All 28 packages are represented in the generated docs
- Entry points (index.ts) are documented with their exports
- No TypeDoc warnings for missing JSDoc comments (graceful)

**Key artifacts**:

- `typedoc.json` — TypeDoc configuration
- `scripts/generate-docs.sh` — documentation generation script
- `docs/api/` — generated HTML documentation (gitignored)
- `pnpm docs` — npm script alias

**Approach**:

- TypeDoc reads all `packages/*/src/index.ts` entry points
- Generates a unified API reference site
- Includes package descriptions from `package.json`
- Dependency graph rendered as part of the docs
- `.gitignore` excludes generated `docs/api/`

**Status**: ✅ Complete

**Verification results**:

- `pnpm run docs` → HTML generated at `docs/api/` from all 58 discovered package entrypoints
- `docs/api/PACKAGE_CATALOG.md` — workspace packages cataloged with versions, descriptions, and internal dependency counts
- TypeDoc configured with `excludePrivate`, `excludeProtected`, `skipErrorChecking`
- Generated `docs/api/` is gitignored

---

### v3.3 — Pipeline Integration Tests & Benchmarks ✅ Complete

**Objective**: Establish integration tests for the full workspace open pipeline and benchmark baselines for stage timings. Replace manual verification with automated tests that prove the pipeline works end-to-end.

**Verification**:

- `pnpm test` passes with integration tests (pipeline stages verified)
- `pnpm benchmark` reports stage timings and compares against v0.3.0 baselines
- No regressions in existing unit tests (101+ tests)

**Key artifacts**:

- `packages/workspace/__tests__/pipeline-integration.test.ts` — end-to-end pipeline test
- `scripts/benchmark.sh` or `packages/workspace/__tests__/benchmark.test.ts` — timing benchmarks
- `pnpm benchmark` — npm script alias

**Benchmark targets** (baselines from v0.3.0, vestara-ai-core/):

| Stage | Target |
| ------- | -------- |
| Discover | < 50ms |
| Fingerprint | < 100ms |
| Analyze | < 100ms |
| Present | < 500ms |
| Pipeline (fast path) | < 1s |

**Status**: ✅ Complete

**Verification results**:

- `pnpm test` → 107 tests, 38 files, all passing (+ integration test file, +6 tests)
- `pnpm benchmark` → all stages under targets (Discover ~74ms, Fingerprint ~80ms, Analyze ~63ms, Present ~62ms)
- Pipeline integration test validates: discover → analyze → present end-to-end
- Benchmark script at `scripts/benchmark.sh`, runs `ITERATIONS` times and reports min/max/avg/median

**Benchmark results** (3 iterations, tiny test project):

| Stage | Min | Max | Avg | Target |
| ------- | ----- | ----- | ----- | -------- |
| Discover | 58ms | 95ms | 74ms | < 100ms |
| Fingerprint | 63ms | 107ms | 80ms | < 100ms |
| Analyze | 56ms | 71ms | 63ms | < 100ms |
| Present | 59ms | 67ms | 62ms | < 500ms |

---

### v3.4 — Repository Hygiene ✅ Complete

**Objective**: Add standard repository governance files: issue templates, PR template, contributing guide, security policy, code of conduct.

**Verification**:

- `.github/ISSUE_TEMPLATE/` contains bug report + feature request templates
- `.github/PULL_REQUEST_TEMPLATE.md` exists
- `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` at repo root

**Key artifacts**:

- `.github/ISSUE_TEMPLATE/bug-report.md`
- `.github/ISSUE_TEMPLATE/feature-request.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`

**Status**: ✅ Complete

**Created files**:

- `.github/ISSUE_TEMPLATE/bug-report.md` — structured bug report template
- `.github/ISSUE_TEMPLATE/feature-request.md` — structured feature request template
- `.github/PULL_REQUEST_TEMPLATE.md` — PR checklist (tests, lint, manual verification)
- `CONTRIBUTING.md` — dev setup, testing, docs, milestones
- `SECURITY.md` — vulnerability reporting policy
- `CODE_OF_CONDUCT.md` — community standards and enforcement

---

### v3.5 — AI-Powered Suggestions ✅ Complete

**Objective**: Add a `suggest` command that uses OpenCode to analyze the workspace and recommend what to work on next. Falls back to deterministic suggestions when AI is unavailable.

**Verification**:

- `pnpm test` passes (all 107 tests)
- `pnpm lint` passes
- `suggest` command works in workspace REPL

**Key artifacts**:

- `SuggestionService.aiSuggest()` — new method that builds a workspace state prompt and calls AI provider
- `suggest` — workspace REPL command
- Deterministic fallback when AI unavailable

**Status**: ✅ Complete

**Verification results**:

- `pnpm test` → 107 tests, 38 files, all passing
- `pnpm lint` → clean
- `SuggestionService.aiSuggest()` — AI-powered with deterministic fallback
- New REPL command: `suggest`

---

### v3.6 — End-to-End Workflow Tests ✅ Complete

**Objective**: Write integration tests that exercise the full deterministic tiers of the Vestara workflow: discover → fingerprint → analyze → explain → plan → implement → verify — all without an AI provider.

**Verification**:

- `pnpm test` passes with e2e workflow tests
- Full chain tested: open → explain → plan → implement → verify
- All deterministic tiers verified to produce correct output shapes

**Key artifacts**:

- `packages/workspace/__tests__/workflow-e2e.test.ts` — end-to-end workflow test
- Tests each stage without AI provider (deterministic fallback)

**Status**: ✅ Complete

**Verification results**:

- `pnpm test` → 938 tests pass across 88 files (1 skipped), including deterministic implementation and verification composition
- Full chain tested: discover → fingerprint → analyze → present → explain → plan → implement → verify
- All deterministic tiers produce correct output shapes
- No AI provider required for any test

---

### v3.7 — Knowledge Engine Performance Optimization ✅ Complete

**Objective**: Optimize the knowledge engine indexing path — the heaviest stage of the open pipeline. Batch SQLite writes, reduce I/O overhead, and add indexing benchmarks.

**Verification**:

- `pnpm test` passes (all 117+ tests)
- `pnpm benchmark-index` reports indexing throughput

**Optimization targets**:

| Change | Current | Target |
| -------- | --------- | -------- |
| `saveChunks` | Loop of individual INSERTs (N queries for N chunks) | Single batch INSERT (1 query) |
| `saveDocument` | Per-document INSERT (1 query per file) | Batch INSERT with transaction |
| `indexFiles` | Separate saveDocument + saveChunks per file | Transaction wrapping all saves per batch |
| SQLite sync | Default synchronous mode | `PRAGMA synchronous = OFF` during bulk insert |

**Key artifacts**:

- Batched `saveChunks` using multi-row INSERT
- Transaction-wrapped batch saves in `indexFiles`
- SQLite `PRAGMA` optimizations during bulk insert
- `scripts/benchmark-index.sh` — indexing throughput benchmark
- `pnpm benchmark-index` — npm script alias

**Status**: ✅ Complete

**Benchmark results** (50 TypeScript files, 2 iterations):

- Iteration 1: 52 files in 41ms (~1268 files/sec)
- Iteration 2: 52 files in 45ms (~1156 files/sec)
- Iteration 3: 52 files in 36ms (~1444 files/sec)
- Batch INSERT in `saveChunks` replaces N individual INSERTs
- `bulkSave` wraps document + chunk saves in a single SQLite transaction with `PRAGMA synchronous = OFF` during bulk insert
- `indexFiles` collects each parallel batch then bulk-saves, reducing transaction overhead

---

### v3.8 — Development Lifecycle & Governance ✅ Complete

**Date**: 2026-07-30

**Objective**: Transition from AI-assisted development to engineering process orchestration. Define how specialized agents collaborate through a governed lifecycle with organizational knowledge, confidence calibration, and epistemic governance.

**Philosophy**: *Agents don't perform work. They participate in a software development lifecycle.*

**Verification**:
- 5 specialized agents defined with strict role boundaries
- Daily Operational Lifecycle codified in Blueprint
- Engineering Knowledge System with promotion gate and confidence model
- Epistemic Principles document in AIDL v1.3.0

**Key artifacts**:

| Artifact | Location |
|----------|----------|
| Epistemic Principles | `03-ai-development-lifecycle.md` (4 layers, 3 truths, derivation principle, epistemic governance) |
| Daily Operational Lifecycle | `03-ai-development-lifecycle.md` (5 agents, 6 commands, workflow diagram) |
| Engineering Knowledge System | `03-ai-development-lifecycle.md` (structure, promotion, confidence model, maturity lifecycle) |
| Context Agent | `.opencode/agents/vestara-context.md` — read-only discovery |
| Planner Agent | `.opencode/agents/vestara-planner.md` — analyze, prioritize, recommend |
| Engineer Agent | `.opencode/agents/vestara-engineer.md` — implement approved tasks only |
| Reviewer Agent | `.opencode/agents/vestara-reviewer.md` — inspect, never modify |
| Verifier Agent | `.opencode/agents/vestara-verifier.md` — prove via evidence, never interpret |
| Lifecycle Skill | `.opencode/skills/vestara-lifecycle/SKILL.md` — workflow commands |
| Foundation Doc | `docs/foundation/02-development-lifecycle.md` — philosophy and architecture |
| Engineering Knowledge | `.vestara/knowledge/architecture/workspace-rewrite-incremental-migration.md` — first seeded entry |
| EKS Runtime | `.vestara/knowledge/{architecture,workflows,lessons,decisions}/` + `sessions/` + `metrics/` |

**Agents**:

| Agent | Role | Can Edit? | Can Plan? | Can Decide Scope? |
|-------|------|-----------|-----------|-------------------|
| Context | Discover | No | No | No |
| Planner | Recommend | No | Yes | No |
| Engineer | Implement | Yes | No | No |
| Reviewer | Inspect | No | No | No |
| Verifier | Prove | No | No | No |
| Human | Approve | Yes | Yes | Yes |

**Lifecycle commands**: `/init` (onboarding), `/morning` (briefing), `/work` (execute), `/review` (inspect), `/verify` (evidence), `/evening` (knowledge capture)

**Knowledge Confidence Model**: Five-stage maturity lifecycle — `Hypothesis → Observation → Emerging Pattern → Verified Practice → Engineering Principle`. Confidence is derived from evidence, never assigned.

**Spec**: `vestara-blueprint/00-governance/03-ai-development-lifecycle.md` (v1.3.0)

**Status**: ✅ Complete

---

## Conversational Onboarding — The Human Era

v4.0 marks the inflection point where Vestara shifts from an **AI engineering platform** to an **AI engineering companion** — a system that understands who you are before it concerns itself with what you're building.

| Era | Question it answers |
| ----- | -------------------- |
| **v0.x** | Can Vestara understand software? |
| **v1.x** | Can Vestara become an engineering workspace? |
| **v2.x** | Can Vestara become an operating system? |
| **v3.x** | Can Vestara become production-ready? |
| **v4.x** | **Can Vestara interact naturally with humans?** |
| **v5.x** | Can Vestara operate reliably at scale? |
| **v6.x** | Can Vestara provide a complete visual experience? |

### v4.0 — Conversational Onboarding ✅ Complete

**Objective**: A first-time user boots Vestara AI OS and immediately begins talking. No keyboard, terminal, or setup wizard required — just a conversational greeting that welcomes the user, establishes identity, and transitions naturally into the engineering workspace.

**Status**: ✅ Complete

**Delivered**:

| Component | Status |
| ----------- | -------- |
| `UserProfile` type + SQLite store | ✅ Complete |
| `ConversationSession` type + SQLite store | ✅ Complete |
| `ConversationEngine` with profile enrichment | ✅ Complete |
| `ProviderRouter` with intent-based model routing | ✅ Complete |
| `OpenCodeCloudProvider` adapter | ✅ Complete |
| `LocalProvider` (Ollama/vLLM detection) | ✅ Complete |
| `@vestara/audio` — VAD + mic/speaker abstraction | ✅ Complete |
| `@vestara/stt` — Whisper detection stub | ✅ Complete |
| `@vestara/tts` — Piper detection stub | ✅ Complete |
| `@vestara/activity-log` — domain event system | ✅ Complete |
| `apps/onboarding-lab` — developer test rig | ✅ Complete |
| `vestara doctor audio` command | ✅ Complete |
| `vestara doctor conversation` command | ✅ Complete |
| `vestara benchmark conversation` command | ✅ Complete |
| `vestara conversation-audit` command | ✅ Complete |
| Workspace onboarding boot sequence | ✅ Complete |
| Conversational greeting (first-time / returning) | ✅ Complete |
| PCS-020, UX-011, ATS-011 specifications | ✅ Complete |

**Built-in agents created for v4.0 development**:

- `Conversation Developer` — designs conversation flows, voice pipelines, STT/TTS
- `Dashboard Curator` — monitors development progress, auto-advances milestones
- `Dashboard Developer` — builds and maintains the Workspace Dashboard UI

**Architecture**:

```
Microphone → VAD → STT → ConversationEngine → TTS → Speaker
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
        UserProfile                ConversationSession
              │                           │
              └─────────────┬─────────────┘
                            ▼
                    ProviderRouter
                    ├──────────────┐
                    ▼              ▼
              OpenCode Cloud    Local LLM
              (Online)         (Offline)
```

### v4.1 — Conversation Platform Validation ✅ Complete

**Objective**: Prove the conversation stack is truly provider-independent. Validate that the same onboarding workflow works with multiple providers without architectural changes to `ConversationEngine`, `UserProfile`, or `ConversationSession`.

**Primary question**: Can the same onboarding workflow work with any provider without architectural changes?

**Verification**:

- `pnpm test` passes (195 tests, 48 files)
- `bash build-order.sh` passes (zero errors)
- `pnpm conversation-audit` reports 12/12 packages, 0 issues
- All 10 AT scenarios pass across 3 provider types

**Specification documents**:

- `docs/PCS-022-conversation-platform-validation.md` — Product Capability Specification
- `docs/UX-012-conversation-platform-validation.md` — User Experience Specification
- `docs/ATS-012-conversation-platform-validation.md` — Acceptance Test Specification

**Validation criteria met**:

| # | Criterion | Evidence |
| --- | ----------- | ---------- |
| 1 | Same onboarding workflow works with OpenCode Cloud | ✅ Integration test passes with online stub provider |
| 2 | Same onboarding workflow works with OpenAI-compatible provider | ✅ OpenAICompatibleProvider adapter passes all scenarios |
| 3 | Same onboarding workflow works fully offline | ✅ Offline degradation test proves deterministic fallback |
| 4 | No engine changes required when switching providers | ✅ Same `DefaultConversationEngine` code, different provider registration |
| 5 | Provider selection is configuration-driven | ✅ `selectProvider()` / `clearSelection()` controls routing |

**Key artifacts**:

- `packages/conversation-runtime/src/provider/openai-compat.ts` — OpenAI-compatible ConversationProvider adapter for API-compatible endpoints
- `packages/conversation-runtime/__tests__/provider-independence.test.ts` — 10 acceptance tests covering all validation criteria
- Enhanced `pnpm vestara benchmark conversation` — now measures real provider resolve, profile load, session save, health check, and E2E message timing instead of simulated delays

**Acceptance test scenarios**:

| AT | Scenario | Status |
| ---- | ---------- | -------- |
| AT-001 | First Boot Greeting | ✅ |
| AT-002 | Returning User Recognition | ✅ |
| AT-003 | Profile Enrichment from Message | ✅ |
| AT-004 | Greeting Extraction Patterns | ✅ |
| AT-005 | Provider Switching — Same Workflow | ✅ |
| AT-006 | Offline Degradation | ✅ |
| AT-007 | Session Persistence | ✅ |
| AT-008 | Provider Configuration-Driven | ✅ |
| AT-009 | Health Check Accuracy | ✅ |
| AT-010 | OpenAI-Compatible Provider Export | ✅ |

**Conversation benchmarks** (updated targets):

| Benchmark | Target | Method |
| ----------- | -------- | -------- |
| Provider resolve | < 50ms | `router.resolve()` |
| Profile load (SQLite) | < 20ms | `profileStore.load()` |
| Session save (SQLite) | < 20ms | `sessionStore.save()` |
| Health check (local) | < 100ms | `provider.health()` |
| E2E message (stub) | < 100ms | Full `sendMessage()` cycle |

**Provider independence architecture verified**:

- `ConversationEngine` never references a specific provider — all routing through `ProviderRouter`
- Provider adapters normalize differences (streaming format, error handling, health check)
- Route resolution follows deterministic priority: user-selected → online → offline → graceful degradation
- `OpenAICompatibleProvider` proves the abstraction works with alternative API formats
- `OpenCodeProvider` — standalone `ConversationProvider` directly calling OpenCode API
- `OllamaProvider` — local Ollama provider with graceful offline stub
- `GeminiProvider` — remote Gemini provider with SSE streaming
- `ProviderFactory` — config-driven provider creation (`create({ kind })`)
- `packages/conversation-runtime/src/provider/` — organized barrel exports from `provider/index.ts`

**Supported provider matrix**:

| Provider | Streaming | Health | Model Discovery | Local | Remote |
| ------------------- | :---------: | :------: | :---------------: | :-----: | :------: |
| Ollama | ✅ | ✅ | ✅ | ✅ | Optional |
| Gemini | ✅ | ✅ | ✅ | ❌ | ✅ |
| OpenAI-Compatible | ✅ | ✅ | ✅ | Depends | ✅ |
| **OpenCode** | ✅ | ✅ | ✅ | Depends | ✅ |

**Tests**: 215 passing (48 files), +5 acceptance tests (AT-011–AT-015) for new providers + factory.

**Status**: ✅ Complete

### v4.2 — Project Management & Dashboard Intelligence ✅ Complete

**Objective**: Transform the Dashboard from a monitoring interface into an interactive engineering operations center with project management, real-time activity intelligence, and cross-data search.

**Key artifacts**:

- `Project`, `ProjectTask`, `Sprint` types with full SQLite storage
- `ProjectService` with event-bus integration
- `api/projects` REST endpoints (CRUD + task management + sprints)
- `apps/workspace/src/pages/Projects.tsx` — full project workspace
- `apps/workspace/src/pages/Dashboard.tsx` — 20+ interactive sections

**Dashboard features delivered**:

| Feature | Description |
| --------- | ------------- |
| Activity Stream | Real-time event timeline with sparkline, category breakdown, search, filters, detail popup, copy, icons, pagination |
| Global Search | Cross-data search across events, projects, agents, milestones |
| Data Export | One-click JSON download of dashboard state |
| Quick Stats Bar | Compact metrics bar showing events, projects, agents, milestones |
| Collapsible Sections | Per-section collapse/expand with localStorage persistence |
| View Mode Toggle | Compact/detailed view mode |
| Keyboard Shortcuts | `?` key modal showing all shortcuts |
| Status Banner | Build, tests, audit, agents, executions, milestone status pills |
| Event Detail | Click any event for full metadata, resource, actor detail |
| Category Breakdown | Interactive colored bar — click to filter activity stream |
| Agent Status | Animated agent cards with execution success rate bar |
| Era Progress | Per-era milestone progress bars |
| Active Development | In-progress and upcoming milestone tracking |
| Recent Completions | Latest 5 completed milestones |
| Project Cards | Inline project management with expandable task previews |
| Conversation Analytics | Session, response, and event counts from stream |

**Agent executions tracked and rendered**: Status badges, duration, task names, agent attribution. Execution success rate visualized in the agents panel.

**Status**: ✅ Complete

---

### v4.3 — Agent Orchestration & Teams ✅ Complete

**Objective**: Transform the agent system from single-assistant to multi-agent OS with specialized agents, teams, registry, and provider-per-agent configuration.

**Key artifacts**:

- `AgentTeam` type and `agent_teams` SQLite table
- Agent CRUD (create/update/delete) via REST API
- Provider/model selection per agent (each agent can use a different model)
- Agent Registry modal in the Agent Control Center
- Agent Control Center with status filters, team filters, capabilities view
- 7 built-in agents: Architect, Developer, Verifier, Documenter, Conversation Developer, Dashboard Curator, Dashboard Developer
- `Dashboard Developer Agent` (role: `frontend`) — React/Tailwind specialist
- `Dashboard Curator Agent` (role: `dashboard-curator`) — milestone tracking, workspace monitoring
- `Conversation Developer Agent` (role: `conversation`) — voice pipeline, STT/TTS, profile enrichment
- `frontend` and `dashboard-curator` agent roles with extended capability types

**New capabilities added**: `react-development`, `ui-development`, `tailwind-css`, `dashboard-design`, `data-visualization`, `dashboard-monitoring`, `progress-tracking`, `milestone-management`, `feature-detection`, `development-velocity`, `conversation-design`, `voice-ux`, `prompt-engineering`, `stt-integration`, `tts-integration`, `vad-integration`, `audio-pipeline`

**Status**: ✅ Complete

---

### v4.4 — Agent Scheduling & Automation ✅ Complete

**Objective**: Enable automated agent execution through configurable schedules. Agents can run on hourly, daily, weekly, or one-time schedules without manual invocation.

**Key artifacts**:

- `AgentSchedule` type with `ScheduleFrequency` (`once | hourly | daily | weekly | custom`)
- `agent_schedules` SQLite table with indexes on agent_id and next_run_at
- Schedule CRUD via `GET/POST/DELETE /api/schedules`
- `POST /api/schedules/run-due` — executes all due schedules via AgentRuntime
- Automatic next-run calculation based on frequency (hourly→+1h, daily→+24h, weekly→+7d)
- Dashboard "Scheduled Tasks" section showing upcoming and due schedules
- Due schedules highlighted with amber pulsing indicator

**API Endpoints**:

| Method | Path | Action |
| -------- | ------ | -------- |
| `GET` | `/api/schedules` | List all + due schedules |
| `POST` | `/api/schedules` | Create schedule (agentId, task, frequency) |
| `DELETE` | `/api/schedules/:id` | Delete schedule |
| `POST` | `/api/schedules/run-due` | Execute all due schedules |

**Status**: ✅ Complete

---

### v4.5 — Conversation Audit & System Status ✅ Complete

**Objective**: Add conversation feature auditing and comprehensive system status reporting to CLI and Dashboard.

**Key artifacts**:

- `ConversationScanner` — scans 12 conversation packages for health, build, test coverage
- `ConversationAuditReport` — structured report with package status, issues, recommendations
- `pnpm conversation-audit` CLI command with formatted output and `--json` flag
- `vestara status` CLI command — comprehensive system overview (runtime, audio, agents, projects, conversation features)
- HelpService updated with 19 help topics (was 12), 10-step welcome tour
- Dashboard improvements: section navigation, shortcuts modal, sprint tracking, Knowledge Graph with real data, Artifact Explorer with dependency chain

**Conversation Audit**:

```
Packages:    12/12 present
Built:       12/12 packages
Tested:      11/12 packages
Source:      4468 lines
```

**Status**: ✅ Complete

---

### v4.6 — AI Operations Center & Settings ✅ Complete

**Objective**: Create a centralized AI Operations Center for real-time agent monitoring and a Settings page for provider/model configuration.

**Key artifacts**:

- `apps/workspace/src/pages/OpsCenter.tsx` — Live agent monitoring with 8-role grid, real-time event stream, pipeline health
- `apps/workspace/src/pages/Settings.tsx` — Provider/model config UI with intent-based routing
- `GET/PUT/DELETE /api/settings` — Settings persistence via PreferenceService
- Agent fleet status: Running/Idle/Unregistered per role with animated indicators
- Provider status, pipeline latency, runtime metrics in OpsCenter sidebar
- Keyboard shortcut navigation: `g + key` for all pages, `?` for help

**Status**: ✅ Complete

---

### v4.7 — Agent Service, Capabilities & Teams ✅ Complete

**Objective**: Add formal agent service layer with capability management, permission validation, and team-based agent organization with bidirectional sync.

**Key artifacts**:

- `packages/workspace/src/agent-service.ts` — AgentService with capability validation, permission checks, execution stats
- `GET /api/capabilities` — 36 capabilities with descriptions
- `GET /api/agents/:id/stats` — Per-agent execution statistics
- Team-agent bidirectional sync: updating team members updates agent.teamId and vice versa
- `POST /api/teams/:id/members` — Add/remove members with leader assignment
- Full team management UI in Agent Control Center
- `vestara teams` CLI — list, create, assign agents to teams
- `vestara doctor teams` CLI — team health diagnostics with recommendations
- Shared database access between CLI and API via `.vestara/plans/plans.db`
- Auto-persist wrapper: every DB write is immediately synced to disk

**API Endpoints**:

| Method | Path | Description |
| -------- | ------ | ------------- |
| `GET` | `/api/capabilities` | List 36 capabilities with descriptions |
| `GET` | `/api/agents/:id/stats` | Agent execution stats |
| `GET` | `/api/teams` | Teams with member details and stats |
| `GET` | `/api/teams/:id` | Team detail with unassigned agents |
| `POST` | `/api/teams` | Create team |
| `PUT` | `/api/teams/:id` | Update team |
| `POST` | `/api/teams/:id/members` | Manage members (add/remove/leader) |
| `DELETE` | `/api/teams/:id` | Delete team |

**CLI Commands**:

| Command | Description |
| --------- | ------------- |
| `vestara agents` | List all agents with stats |
| `vestara teams` | List teams with members |
| `vestara teams create <name>` | Create a team |
| `vestara teams assign <team> <agent>...` | Assign agents to team |
| `vestara doctor agents` | Agent health diagnostics |
| `vestara doctor teams` | Team health diagnostics |

**Kernel health fix**: Kernel service now reports healthy instead of unknown. `diagnose()` runs fresh health checks and special-cases kernel status from its own `_status` field.

**Status**: ✅ Complete

---

## Operational Era

### v5.0 — Operational Baselines ✅ Complete

**Objective**: Establish the measurement framework for the Operational Era. Codify performance baselines, add regression gates to CI, verify every service has a health check, and prove the platform can measure itself before we ask it to improve.

**Primary question**: Can we measure the platform's operational characteristics?

**Evidence**:

- `pnpm benchmark` produces output that can be compared against `docs/PERFORMANCE_BASELINES.md`
- CI workflow includes a benchmark comparison step that fails on regression
- Every registered service has a corresponding health check
- A reliability test proves graceful degradation when AI provider is unavailable
- `vestara doctor` reports all services healthy with latency metrics

**Key artifacts**:

- `docs/PERFORMANCE_BASELINES.md` — codified baseline thresholds for all pipeline stages
- CI benchmark comparison step in `.github/workflows/ci.yml`
- Reliability test: `packages/workspace/__tests__/reliability.test.ts` — provider failure, file system errors
- Health check inventory documented in `docs/PERFORMANCE_BASELINES.md`

**Baselines to establish**:

| Measurement | Tool | Threshold |
| ------------- | ------ | ----------- |
| Pipeline open (cold) | `pnpm benchmark` | < 3s total |
| Discover stage | `pnpm benchmark` | < 100ms |
| Fingerprint stage | `pnpm benchmark` | < 100ms |
| Analyze stage | `pnpm benchmark` | < 100ms |
| Present stage | `pnpm benchmark` | < 500ms |
| Knowledge indexing | `pnpm benchmark-index` | > 500 files/sec |
| Test suite | CI timing | < 10s |
| Health check latency | `vestara doctor` | < 100ms per check |

**Operational principle validated**: #8 (The Platform Proves Itself) and #4 (Observability Is Part of the Feature)

**Status**: ✅ Complete

**Verification results**:

- `pnpm test` → 122 tests, 40 files, all passing (+5 reliability tests)
- `docs/PERFORMANCE_BASELINES.md` — 10 baseline thresholds codified
- CI workflow includes benchmark comparison step after tests
- Reliability tests prove: ExplainService degrades gracefully without AI, SuggestionService falls back to deterministic, discovery handles non-existent dirs, analysis handles empty file lists
- Every baseline has a measurement tool, threshold, and update policy

---

### v5.1 — Observability ✅ Complete

**Objective**: Add health check latency instrumentation, enrich `vestara doctor` output, and add a `vestara metrics` command that exposes runtime state.

**Primary question**: Can operators understand the system's health in real time?

**Key artifacts**:

- `ServiceDiagnosis.latency` — new field in shared types, populated by kernel diagnose
- `vestara doctor` — shows per-service latency in ms beside health status
- `vestara metrics` — new CLI command (memory, node version, platform)
- `docs/PERFORMANCE_BASELINES.md` — health check latency section updated

**Operational principle validated**: #4 (Observability Is Part of the Feature)

**Status**: ✅ Complete

---

### v5.2 — Provider & Model Selection ✅ Complete

**Objective**: Allow users to select which AI provider and model to use, persist the choice across sessions, and surface available models via the CLI.

**Primary question**: Can users control which AI model powers their workspace?

**Key artifacts**:

- `WorkspaceSession.prefs` — `PreferenceService` instance on every session
- `config` — workspace REPL command (`config list`, `config set <key> <value>`, `config reset <key>`)
- `config set provider <id>` — switch AI provider
- `config set model <id>` — select model (lists available models if `<id>` is omitted)
- `config list` — show all preferences, mark non-defaults
- Model preference wired into conversation service, explain, plan, implement, verify, suggest

**User flow**:

```
my-repo > config list
  provider                  opencode
  model                     deepseek-v4-flash-free
  theme                     dark
  autoIndex                 true
  ...

my-repo > config set model deepseek-v4-flash
  Model updated to: deepseek-v4-flash

my-repo > config list
  provider                  opencode
  model                     deepseek-v4-flash       *
  ...
```

**Operational principle validated**: #5 (User Feedback Is Evidence — users choose the model that works best for their workflow)

**Status**: ✅ Complete

**Verification results**:

- `pnpm test` → 122 tests, 40 files, all passing
- `model` preference added to defaults (`deepseek-v4-flash-free`)
- `config` REPL command: `config list`, `config set <key> <value>`, `config reset <key>`
- `PreferenceService` wired into `WorkspaceSession` as `session.prefs`
- Model preference passed to `sendMessageStream` and `sendMessage` calls in REPL

---

### v5.3 — Agent Workflow Orchestration ✅ Complete

**Objective**: Orchestrate multi-agent workflows that run agents in sequence, passing artifacts between steps. Built-in "Feature Development" workflow: Architect creates a plan → Developer implements it → Verifier checks it.

**Primary question**: Can agents collaborate through artifacts without manual step-by-step invocation?

**Key artifacts**:

- `AgentWorkflowService` — orchestrates sequential agent runs with artifact passing
- Built-in workflow: `feature` (architect → developer → verifier)
- `workflow` REPL command (`workflow list`, `workflow start <id>`, `workflow status`, `workflow run`)
- `agent run` on workflow steps automatically passes plan IDs, change set IDs

**User flow**:

```
my-repo > workflow list
  feature     Feature Development      3 agents (architect → developer → verifier)

my-repo > workflow start feature "Add input validation"
  → Architect analyzing... plan P-1 created
  → Developer implementing... change set CS-1 created
  → Verifier checking... report VR-1: all checks passed
  ✅ Feature workflow complete

my-repo > workflow status
  ✓ architect: plan P-1 (completed)
  ✓ developer: change set CS-1 (completed)
  ✓ verifier: report VR-1 (completed)
```

**Operational principle validated**: #5 (User Feedback Is Evidence — automated workflows reduce time-to-completion)

**Status**: ✅ Complete

**Verification results**:

- `pnpm test` → 122 tests, 40 files, all passing
- `AgentWorkflowService` — orchestrates agents in sequence with artifact passing
- Built-in workflow: `feature` (architect → plan → developer → changeset → verifier → report)
- `workflow` REPL commands: `list`, `start <id> "<goal>"`, `status`
- Workflow steps execute: PlanningService → ImplementationService → VerificationService automatically

---

## Interactive Dashboard Era

### v6.0 — Interactive Workspace Dashboard (Agents & Suggestions) ✅ Complete

**Objective**: Turn the read-only Agents and Suggestions panels into actionable UI components. Users can run agents directly from the dashboard, view execution logs, and one-click convert suggestions into plans.

**Verification**:

- Agent cards show real-time status with execution history viewer
- Click "Run" on an agent → task input opens → execution streams progress
- Suggestion cards have "Plan It" button → auto-creates a plan via `/api/plans`
- Suggestion history persists (shown/accepted/dismissed)
- `pnpm test` passes (all 122+ tests)

**Key artifacts**:

- `AgentDetail` component — drill-down view with capabilities, permissions, execution history
- `RunAgentDialog` component — task input modal with streaming progress output
- `SuggestionCard` component — priority-badged card with "Plan It" / "Dismiss" actions
- `SuggestionHistory` — persistent list of past suggestions with outcome tracking
- `/api/agents/:id/run` — REST endpoint to execute an agent
- `/api/suggestions/:id/accept` — REST endpoint to turn a suggestion into a plan

**Status**: ✅ Complete

**Verification results**:

- Agent page with run dialog and execution detail modal renders and works
- Suggestion cards with "Plan It" button create plans via `/api/suggestions/:id/accept`
- Full pipeline: suggest → create plan → approve → implement → verify → collab
- `pnpm test` → 122 tests, 40 files, all passing

---

### v6.1 — In-Browser CLI Terminal ✅ Complete

**Objective**: Embed the Vestara CLI REPL directly in the dashboard as an interactive terminal component. Users can run any CLI command (explain, plan, implement, verify, collab, agent, memory, etc.) without leaving the browser.

**Verification**:

- Terminal component renders at `/terminal` route with full-height xterm.js emulator
- WebSocket-based REPL streams command output in real time
- CLI commands work identically to the native `vestara <command>` experience
- Tab-completion and command history work in the browser terminal
- `pnpm test` passes (all 122+ tests)

**Key artifacts**:

- `TerminalPage` component — full-screen xterm.js terminal at `/terminal`
- `TerminalProvider` — WebSocket-backed REPL bridge (`/ws/repl`)
- `ReplSession` — server-side REPL session manager per WebSocket connection
- `/api/repl/execute` — REST endpoint for one-shot command execution
- Sidebar navigation link to `/terminal`
- Command history persisted to localStorage

**Backend changes**:

- WebSocket subprotocol for REPL: client sends `{ op: "repl", command: "..." }`, server streams `{ op: "output", text: "..." }` and `{ op: "prompt", text: "..." }`
- `ReplSession` wraps `apps/cli/src/repl-workspace.ts` logic per socket
- Session isolation: each browser tab gets its own REPL session context

**Status**: ✅ Complete

**Verification results**:

- Terminal component renders at `/terminal` route with full-height xterm.js emulator
- WebSocket-based REPL streams command output in real time with auto-reconnect
- Tab-completion for all common commands (help, status, agents, teams, etc.)
- Command history persisted to localStorage across page reloads
- ArrowUp/ArrowDown for history navigation, Ctrl+L to clear screen
- Connection status bar with live/reconnecting indicator
- `pnpm test` passes (177 tests)

---

### v6.2 — Chatbot Assistant Panel ✅ Complete

**Objective**: Add an interactive chatbot assistant panel to the dashboard that lets users hold natural-language conversations with Vestara's AI. The chat panel provides a conversational alternative to the CLI terminal, with streaming responses, conversation history, and inline slash commands for triggering capabilities.

**Verification**:

- Chat panel renders as a collapsible sidebar or overlay in the dashboard
- Users can type messages and receive streaming AI responses
- Conversation history persists across page reloads
- Slash commands (`/explain`, `/plan`, `/suggest`, `/help`) trigger corresponding capabilities inline
- Chat context is aware of the current workspace session
- `pnpm test` passes (all 122+ tests)

**Key artifacts**:

- `ChatPanel` component — collapsible chat interface with message bubbles, streaming text, and input bar
- `ChatProvider` — WebSocket-backed conversation bridge (`/ws/chat`)
- `ChatSession` — server-side conversation manager per WebSocket connection with message history
- `/api/chat/send` — REST endpoint for one-shot message exchange
- `/api/chat/history` — REST endpoint for loading past conversations
- Slash command parser — routes `/explain`, `/plan`, `/suggest`, `/help` to existing services
- Conversation history storage — persisted in `.vestara/` workspace directory

**Backend changes**:

- WebSocket subprotocol for chat: client sends `{ op: "chat", message: "..." }`, server streams `{ op: "token", text: "..." }` deltas and `{ op: "done" }` signal
- `ChatSession` wraps conversation with AI provider, maintains message history, supports slash command routing to existing WorkspaceRuntime services
- Conversation persistence via SQLite in `.vestara/conversations/`

**Integration points**:

- Chat can reference artifacts from the current workspace (plans, changesets, verifications)
- Chat panel toggles from the dashboard toolbar alongside the terminal nav link
- Chat sessions are scoped to the workspace session

**Status**: ✅ Complete

**Verification results**:

- `POST /api/chat/send` returns AI-generated responses with workspace context
- WebSocket chat protocol streams tokens via `{ op: "chat-token" }` messages
- ChatPage renders at `/chat` with message bubbles, streaming text, and input bar
- Sidebar nav link added to `/chat`
- Chat context includes workspace name, language, framework, packages, health score
- Backend graceful fallback when AI provider is unavailable

---

### v6.3 — Interactive Enhancement: Streaming Chat, Ops Detail & Data Export ✅ Complete

**Objective**: Enhance the ChatPage with streaming responses, enrich the OpsCenter with clickable agent details and event inspection, and add section-specific data export on the Dashboard.

**Verification**:

- `pnpm test` passes (177 tests)
- `bash build-order.sh` passes (zero errors)
- `pnpm --filter @vestara/workspace-ui build` passes
- No conversation audit issues (12/12 packages, 0 issues)

**Key artifacts**:

- `POST /api/chat/stream` — SSE endpoint streaming token-by-token responses
- ChatPage — streaming response rendering, auto-resizing textarea, timestamps, copy button, clear button
- OpsCenter — clickable agent cards expanding to show recent 5 executions per agent; activity events clickable for detail panel (type, actor, timestamp, message)
- Dashboard — `ExportButton` component on Projects, Agent Executions, and Conversation Activity sections, downloading formatted JSON

**Backend**:

- `/api/chat/stream` returns `text/event-stream` with `data: { type: "text", content }` chunks and `data: { type: "done" }` termination
- Uses provider's `AsyncIterable<StreamChunk>` stream method for real-time token delivery
- Graceful error handling: inline error events, always clean connection termination

**Dashboard data export**:

| Section | Filename | Data |
| --------- | ---------- | ------ |
| Projects | `vestara-projects-{date}.json` | All project objects with stats |
| Agent Executions | `vestara-executions-{date}.json` | All execution records |
| Conversation Activity | `vestara-conversation-{date}.json` | Computed conversation stats |

**Status**: ✅ Complete

---

## Multi-Agent Filesystem Era

### v6.4 — Agent Filesystem Capabilities, Multi-Agent Workflow Design & Open Repo Distribution ✅ Complete

**Objective**: Give agents controlled read/write/update/delete access to workspace files through a named capability boundary, and publish the Vestara documentation volumes as standalone public repositories.

**Primary question**: Can agents execute filesystem operations safely without direct filesystem access?

**Key artifacts**:

- `FilesystemRuntime` hardened — path traversal/absolute-path containment, deny list, `update` (patch), `stat`, `copy`, dry-run mode, bounded operation history, structured `FsObservation` results
- `AgentCapabilityManager` — the only path agents use to reach the filesystem; 12 `filesystem.*` capabilities mapped to `(resource, action)` permission gates
- `AgentRuntime.executeCapability()` — gated execution + observation feedback into session memory
- `AgentCapabilityManager` wired into API (`POST /api/agents/:id/capabilities`), CLI ActionRuntime, and `ImplementationService.apply()`
- `PCS-024 — Agent Filesystem Capabilities` spec
- `PCS-025 — Multi-Agent Project Management` design blueprint (Repository Analyst → Planner → Architect → Developer → Reviewer → Tester → Verifier lifecycle, state machines, event model, failure recovery)
- Repository distribution — `vestara-blueprint`, `vestara-foundation`, `vestara-labs`, `vestara-reference`, `vestara-runtime`, `vestara-specifications` published as standalone public repos under `github.com/evillan0315`

**User flow**:

```
POST /api/agents/agent-developer/capabilities
  {"capability":"filesystem.write","input":{"path":"src/feature.ts","content":"export const answer = 42;","reason":"..."}}
  → ok:true, observation: {operation:"write", status:"success", changes:{added:1,removed:0}}
```

**Operational principle validated**: #5 (User Feedback Is Evidence) + #6 (Trust is earned — capabilities are permission-gated, not assumed)

**Status**: ✅ Complete

**Verification results**:

- `pnpm test` → 843 tests passing (43 new across `filesystem-runtime` + `workspace` agent-capability suites)
- Path traversal, absolute-path escapes, and `.env`-style deny list rejected end-to-end
- Delete requires explicit approval before touching disk
- `agent run` → LLM output parsed → `filesystem.create` executed → file created on disk
- Observations recorded via `session.storeMemory('event', …)` feed the Understanding Runtime

---

## Artifact Dependency Chain

```
vestara open
        ↓
  RepositoryWorkspace  (Knowledge — "What exists?")
        ↓
vestara explain
        ↓
  Explanation(s)      (Knowledge — "What does it mean?")
        ↓
vestara plan
        ↓
  Plan                (Intent — "What should happen?")
        ↓
vestara implement
        ↓
  Change Set          (Execution — "What changed?")
        ↓
vestara verify
        ↓
  Verification Report (Evidence — "Did it succeed?")
        ↓
vestara collaborate
        ↓
  Collaboration State (Coordination — "Who did what?")
```

Each artifact answers a distinct question. The classes are orthogonal: Knowledge, Intent, Execution, Evidence, Coordination. Each capability builds on the artifacts of its predecessors. You can't explain without a workspace. You can't plan without explanations. You shouldn't implement without an approved plan. You shouldn't verify without implementation.

---

## Definition of a Release

> A release is complete when it introduces or enriches a durable workspace artifact that enables the next capability in the ladder while preserving the existing architectural contracts.

Acceptance criteria operate at two levels:

| Level | Question |
|-------|----------|
| Capability | Can the user successfully complete the workflow? |
| Artifact | Was the correct durable artifact created, linked, and reusable? |

A command isn't complete because it prints output. It's complete when a subsequent capability can consume its artifact without reconstructing it.

---

## Product Era Discipline

For every new command, create three documents before implementation:

1. **PCS-00X** — Product Capability Specification (user problem, command, inputs/outputs, success criteria, failure modes, telemetry, evolution)
2. **UX-00X** — User Experience Specification (terminal interaction, progress output, error messages, recovery flow)
3. **ATS-00X** — Acceptance Test Specification (golden scenarios, performance targets, regression cases)

The complete traceability chain:

```
Blueprint → Specification → Foundation → Runtime → Implementation → PCS → UX → ATS

---

## Future Roadmap

### v7.0 — Artifact Pipeline & Operational Dashboard ✅ Complete

**Objective**: Surface the Explain, Plan, Implement, and Verify capabilities as visual pipeline stages within the Workspace Dashboard. Transform the artifact chain from a conceptual model into an operational view that answers "What is happening in my engineering workspace right now?"

**Key features**:
- WorkflowPipeline component — visual artifact chain (Workspace → Explanation → Plan → Change Set → Verification → Evidence) with color-coded stage status
- SessionTimeline component — vertical event timeline driven by `ExecutionSession.timeline`
- Active Sessions widget — running sessions with progress bars and agent attribution
- Agent Utilization widget — real-time agent status grid (running/idle/complete/failed)
- Background Services widget — continuous agent service status (Analyst, Security, Performance, Documentation)
- Repository Health widget — health gauge with trend, test rate, package/dep counts
- Engineering State header — health gauge, 8-column stats grid, online/offline status, LIVE/REFRESH toggle
- Left navigation restructured: Workspace → Engineering → Agents → Tools → System
- WorkflowPipeline integrated into Dashboard and SessionList pages

**Artifact pipeline stages**:

```

◈ Workspace → ? Explanation → △ Plan → ◇ Change Set → ✓ Verification → ⟐ Evidence

```

**Component architecture**:

| Component | File | Used on |
|-----------|------|---------|
| `WorkflowPipeline` | `components/WorkflowPipeline.tsx` | Dashboard, SessionList |
| `SessionTimeline` | `components/SessionTimeline.tsx` | Dashboard (inline) |
| `ActiveSessionWidget` | `components/OperationalWidgets.tsx` | Dashboard |
| `AgentUtilizationWidget` | `components/OperationalWidgets.tsx` | Dashboard |
| `BackgroundServicesWidget` | `components/OperationalWidgets.tsx` | Dashboard |
| `RepoHealthWidget` | `components/OperationalWidgets.tsx` | Dashboard |

**Design principles**:
- Stages represent durable artifacts, not transient commands
- Components consume existing artifacts directly (`ExecutionSession`, `timeline`, `metrics`)
- Pipeline is persistent across pages — Dashboard and SessionList share the same component
- Operational widgets replace navigational shortcuts with live state

**Status**: ✅ Complete

### v7.1 — Theme System & Dashboard Customization ✅ Complete

**Objective**: Allow users to customize the dashboard appearance with theme support (light/dark/system) and personalize which sections are visible and in what order.

**Key features**:
- Light/dark/system theme toggle with CSS variable system
- Dashboard layout editor: drag-and-drop section reordering
- Per-user section visibility preferences (persisted to localStorage)
- Saved dashboard presets (default, compact, analytics-focused, development-focused)
- Theme-aware chart colors and component styling

**Delivered**:
- `ThemeProvider` context at `src/lib/theme.tsx` — manages `'dark' | 'light' | 'system'` modes, resolves system preference via `matchMedia`, persists to `localStorage('vestara-theme')`
- CSS variable system at `src/styles/index.css` — 20+ variables for bg, surface, border, text, accent, and chart colors toggling between dark and light values on `[data-theme="light"]`
- Theme toggle button in `ShellLayout` header — ☀/☾ switches between light/dark with hover tooltip showing current mode
- Theme mode selector in `Settings` page — three-button toggle (Dark/Light/System) with amber highlight on active mode
- `useChartColors()` hook — returns theme-aware colors for ReCharts components (grid, axis, tooltip)
- System theme listener — real-time update when OS preference changes in `system` mode
- Smooth `transition` on `background-color` and `color` for theme switches
- PCS-023 theme system specification

**Status**: ✅ Complete

### v7.2 — AI-Powered Implementation Recommendations ✅ Complete

**Objective**: Enhance the suggestion system to provide plan-specific implementation recommendations and feature analysis powered by OpenCode. Wire suggestions with the ExecutionPlanner for automatic agent assignment recommendations.

**Key features**:
- `planRecommendations(planId)` — AI-powered analysis of a specific plan, returning implementation order, task prioritization, and risk mitigation
- `featureAnalysis(feature)` — OpenCode-powered analysis of a feature request, returning complexity, estimated effort, affected areas, suggested approach, risks, and required agents
- Deterministic fallback when AI is unavailable — effort estimation, completion percentage, execution strategy
- ExecutionPlanner integration — recommendations include agent role assignments, task counts, and estimated durations
- `GET /api/plans/:id/recommendations` — API endpoint for plan-specific implementation guidance
- `POST /api/analyze-feature` — API endpoint for feature request analysis

**How it works**:

When a plan is created, users can request implementation recommendations:
```

GET /api/plans/:id/recommendations

→ Implementation Recommendations for "Add OAuth Login":
  ⚠ [high] Start with backend implementation first
     The authentication service has no frontend dependency but UI needs the API
     Suggested order: Create OAuth Service → Update Auth Middleware → Add UI → Write Tests
  
  • [medium] Security review should happen before testing
     Authentication code requires security validation before test coverage

  Recommended Agent Assignments:
    architect: 1 tasks (normal priority, ~2h)
    developer: 2 tasks (high priority, ~4h)
    tester: 1 tasks (normal priority, ~2h)

```

Feature requests can be pre-analyzed before planning:
```

POST /api/analyze-feature
{ "feature": "Build an employee leave management system" }

→ Feature Analysis: Build an employee leave management system
  Summary: Complete leave management module with request/approval workflow
  Complexity: High · Estimated: 3-5 days
  Affected Areas: Database, API, UI, Notifications
  Agents Needed: architect, developer, tester, security, documentation
  Suggested Approach:
    1. Design leave domain models
    2. Create database schema and migrations
    3. Build REST APIs
    4. Develop React UI components
    5. Add approval workflow and notifications
  Risks:
    [Database] Schema migration may require downtime
    [Security] Leave approval needs role-based access

```

**Status**: ✅ Complete

---

### v7.3 — Workspace Analyst Agent ✅ Complete

**Objective**: Create a dedicated analysis agent that deeply examines the workspace and sends structured insights to OpenCode for AI-powered recommendations. Provide a reusable analysis pipeline that feeds into planning, agent assignment, and operational dashboards.

**Key artifacts**:
- `packages/workspace/src/workspace-analyst.ts` — `WorkspaceAnalyst` class with:
  - `analyze(session)` — collects workspace metrics, risks, and agent data
  - AI-powered analysis via OpenCode provider (`_aiAnalyze`)
  - Deterministic fallback (`_deterministicAnalysis`) when AI unavailable
  - `renderAnalysis()` — formatted terminal output
- Agent runtime integration — `runAnalyst()` handler for the `analyst` role
- `POST /api/analyze-workspace` — API endpoint returning structured `WorkspaceAnalysis` JSON
- AgentMemory auto-recording — every analysis result stored as memory entry

**Analysis output**:

```json
{
  "summary": "vestara-ai-core — Monorepo with 28 packages using TypeScript. 194 files across 28 packages with 156 dependencies. 16 active agents available.",
  "architecture": "Monorepo with 28 packages using TypeScript",
  "health": "Health score 9.4/10 (code: 85%, tests: 94%, docs: 72%)",
  "risks": [
    {"severity": "high", "area": "agents", "finding": "3 failed agent executions"}
  ],
  "recommendations": [
    {"priority": "high", "action": "Improve test coverage", "rationale": "Current coverage is 94%"},
    {"priority": "medium", "action": "Address identified risks", "rationale": "1 risks detected"}
  ],
  "metrics": {
    "totalFiles": 194, "totalPackages": 28, "totalDeps": 156,
    "entryPoints": 12, "testCoverage": 94, "docCoverage": 72,
    "agentCount": 16, "executionCount": 45
  },
  "agentAssignments": [
    {"role": "architect", "reason": "Design review"},
    {"role": "developer", "reason": "Implementation"}
  ]
}
```

**Integration with agent runtime**:

- `runAnalyst()` handler in `AgentRuntime` — sends workspace profile + entry points + risks to OpenCode
- Records analysis results as `execution` type in AgentMemory
- Output artifacts tagged with `analysis:` prefix

**Status**: ✅ Complete

---

### v7.4 — Build Tools & Dev Server Access ✅ Complete

**Objective**: Add build and development server access buttons directly to the Dashboard operational widgets. Instantly launch common build scripts, dev server startup, and CI pipeline commands without leaving the Workspace UI.

**Key features**:

- BuildToolsWidget component in Dashboard operational widgets:
  - "Build All" button: triggers `pnpm lint && pnpm typecheck && pnpm build && pnpm test` with real-time feedback
  - "GitHub Actions" button: opens GitHub Actions workflow panel for CI/CD runs
  - Quick-access display showing key build commands and their status
- Dev server shortcuts in operational widgets:
  - "Start UI" button: Launches `pnpm --filter @vestara/workspace-ui dev` (Vite dev server)
  - "Start API" button: Launches `pnpm --filter @vestara/api dev` (Fastify server)
  - "Build UI" button: Runs `pnpm --filter @vestara/workspace-ui build`
  - "Build API" button: Runs `pnpm --filter @vestara/api build`
- Integration with Dashboard stats widget: shows build pipeline health, lint errors, test results
- Quick access bar at top of Dashboard: persistent access to build commands without widget changes

**Delivered Artifacts**:

- `components/OperationalWidgets.tsx` — added BuildToolsWidget component
- Updated `src/pages/Dashboard.tsx` — added BuildToolsWidget to grid

**Status**: ✅ Complete

---

### v7.5 — API Builder & Testing Console ✅ Complete

**Objective**: Build an interactive API explorer and testing console in the Workspace UI that discovers and lists all endpoints from `@vestara/api`, provides a Postman-like request builder for testing GET/POST/PUT/DELETE calls, and offers an endpoint automation interface for creating new API routes.

**Key features**:

- Endpoint Discovery & Browser: Lists all `@vestara/api` routes (`/api/health`, `/api/settings`, `/api/sessions`, `/api/agents`, `/api/projects`, `/api/workflows`, `/api/activity`, `/api/analyze-workspace`, `/ws`, etc.) with metadata
- Request Builder Panel: Method selector (GET, POST, PUT, DELETE, PATCH), URL/headers/body input, and send button with real-time response display
- Response Viewer: Status code badge, latency, formatted JSON response body with line numbers and copy button
- Dashboard API Testing Widget: Compact version of the request builder available in the Dashboard operational widget grid for quick endpoint testing
- Request History: Saves last 20 requests with timestamps, replay capability, and status indicators
- Keyboard navigation: `g b` shortcut to open API Builder from anywhere

**Delivered Artifacts**:

- `pages/ApiBuilder.tsx` — full API builder page with endpoint list, request builder, and response viewer
- `components/OperationalWidgets.tsx` — API test widget added
- Updated `components/ShellLayout.tsx` — API Builder added to Tools nav with keyboard shortcut
- Updated `src/App.tsx` — `/api-builder` route registered

**Status**: ✅ Complete

---

### v7.6 — Notification Center & Alerting ✅ Complete

**Objective**: Build a comprehensive notification system with persistent alerts, in-app toast notifications, and a dedicated notification center UI. Leverage the existing EventBus → ActivityService → WebSocket pipeline to auto-generate notifications from domain events.

**Key features delivered**:

| Component | File | Description |
|-----------|------|-------------|
| `NotificationStore` | `packages/activity-log/src/notification-store.ts` | SQLite-backed persistent notifications with read/unread state, category filtering, pagination |
| `NotificationService` | `packages/activity-log/src/notification-service.ts` | Bridges ActivityService events into notifications; auto-records for 18+ event types (plan.*, changeset.*, verification.*, collab.*, agent.*, session.*, system.error, memory.indexed) |
| `GET /api/notifications` | `apps/api/src/server.ts` | List notifications with `?unreadOnly`, `?category`, `?limit`, `?before` query params, includes `unreadCount` |
| `POST /api/notifications/:id/read` | `apps/api/src/server.ts` | Mark single notification as read |
| `POST /api/notifications/read-all` | `apps/api/src/server.ts` | Mark all as read, returns count |
| `useNotifications()` hook | `apps/workspace/src/lib/notifications.ts` | React hook with auto-polling (15s), `markRead`, `markAllRead`, `refresh` |
| `HeaderNotifications` (rewired) | `apps/workspace/src/components/layout/AppHeader/HeaderNotifications.tsx` | Bell icon with unread badge + dropdown showing latest 10 unread notifications with mark-read and "View all" link |
| `NotificationsPage` | `apps/workspace/src/pages/Notifications.tsx` | Full notification history view with type-colored cards, timestamps, mark-read on click, mark-all-read button, refresh, empty state |
| Toast queue | `apps/workspace/src/components/Toast.tsx`, `toast-queue.ts` | Auto-toast listener with one-at-a-time display, bounded FIFO queue, non-interrupting error priority, three-second duplicate collapse, repetition counts, and five-second auto-dismiss |

**Architecture**: Events flow `EventBus → ActivityService (domain translation) → NotificationService (persist) → API WebSocket → UI`. The notification center is a consumer of the existing activity stream — no new event pipeline required.

**Verification**:
- `bash build-order.sh` — zero errors (all 52 packages + apps)
- `pnpm test` — 684 tests pass across 63 files (zero regressions)
- `pnpm --filter @vestara/workspace-ui build` — UI builds cleanly
- Notifications auto-populated from: plan creation/approval/cancellation, change set creation/apply, verification completion (pass/fail), collaboration submissions/approvals/rejections, agent start/complete, system errors
- Toast queue policy is deterministic and covered by `apps/workspace/__tests__/toast-queue.test.ts`

### v7.7 — Workspace UI Tester Automation ✅ Complete

**Objective**: Create an automated test + build pipeline for the workspace-ui package. A dedicated `Workspace UI Tester` agent (role: `continuous-tester`) watches file changes in `apps/workspace/` directory and milestone updates, then runs `pnpm --filter @vestara/workspace-ui test && pnpm --filter @vestara/workspace-ui build` automatically.

**Key features**:

- Tester Agent (`agent-workspace-ui-tester`): Built-in agent with `continuous-tester` role that executes the UI test+build pipeline and reports results as execution artifacts
- File Change Monitoring: `WorkspaceUiWatcher` service watches `apps/workspace/` for file changes with 2-second debounce to batch rapid edits
- Milestone Integration: Updating a milestone via `PUT /api/milestones` auto-triggers the tester agent
- API Endpoint: `GET/POST /api/workspace-ui/test-build` triggers the tester on-demand from the Dashboard or external tools
- Agent Runtime Integration: `continuous-tester` role in `AgentRuntime.run()` routes to dedicated `runContinuousTester()` handler
- Result Reporting: Test output, build output, and status are recorded as agent executions in the workspace database
- Runner isolation: Vitest owns UI and visual-framework unit tests; `tests/visual/visual.spec.ts` is reserved for Playwright and excluded from Vitest collection
- Governed CLI adapter: `vestara screenshots run|update|report|clean|check`, with validated filters, structured JSON results, and explicit baseline-mutation intent

**Delivered Artifacts**:

- `packages/workspace/src/agent-runtime.ts` — `runContinuousTester()` handler for the new role
- `packages/workspace/src/workspace-ui-watcher.ts` — debounced file watcher for `apps/workspace/`
- `packages/workspace/src/agent-storage.ts` — built-in `agent-workspace-ui-tester` agent definition
- `apps/api/src/server.ts` — `POST /api/workspace-ui/test-build` endpoint + milestone trigger hook
- `apps/api/src/workspace-context.ts` — watcher wired into service graph, started on boot
- `packages/workspace/src/types.ts` — `continuous-tester` role added to AgentRole

**Status**: ✅ Complete

---

### v7.8 — API Builder UI/UX Enhancement ✅ Complete

**Objective**: Redesign the API Builder page with improved layout, live endpoint discovery from Vestara API, request history persistence, code snippet generation, environment variables, and keyboard shortcuts for faster workflow.

**Key features**:

- Live endpoint discovery: Fetch available routes from `/api/routes` instead of hardcoded sample list with search/filter
- Request history persistence: Save last 50 requests to localStorage with replay, timestamp, and latency display
- Keyboard shortcuts: `Ctrl+Enter` to send, `Escape` to clear inputs
- Environment variables: Saved base URLs and auth tokens in localStorage that auto-inject `Authorization: Bearer` headers
- Code snippet generation: Copy any request as cURL, fetch, or Python snippet
- Method selector: Toggle between GET/POST/PUT/PATCH/DELETE
- Custom headers: JSON header injection alongside auth token
- Status bar: Color-coded success/error responses with latency timing
- Request history: Replay past requests, clear history, colored method badges
- **Response schema tree view**: Collapsible typed JSON tree with type annotations (string, number, boolean, null, array, object), auto-expand up to 2 levels, toggle between Tree/Raw modes
- **Tabbed interface**: Multiple concurrent request tabs with add (`Ctrl+T`), close (`Ctrl+W`), inline rename, per-tab URL/method/body/headers/result/history, all persisted to localStorage

**Delivered Artifacts**:

- `apps/workspace/src/pages/ApiBuilder.tsx` — redesigned page with live endpoints, history persistence, code snippets, env vars, keyboard shortcuts, tree view, and tabs
- `apps/workspace/src/components/JsonTreeView.tsx` — reusable collapsible typed JSON tree component

**Status**: ✅ Complete — 7/7 features delivered

---

### v7.11 — Provider Registry & Local Provider Support ✅ Complete

**Objective**: Replace the single hardcoded OpenCode provider with a persistent provider registry stored in `.vestara/workspace.json`. Users can add multiple providers (including local ones like Ollama), enable/disable them, and manage per-provider model lists.

**CLI commands added**:

| Command | Description |
|---------|-------------|
| `vestara provider add <id>` | Register a new provider (`--name`, `--base-url`, `--api-key-env`) |
| `vestara provider add-local [name]` | Register a local provider with Ollama defaults |
| `vestara provider remove <id>` | Remove a provider and all its models |
| `vestara provider enable <id>` | Enable a provider |
| `vestara provider disable <id>` | Disable a provider |
| `vestara provider list` | List all providers with status and model counts |
| `vestara provider status <id>` | Registry entry + live health check |
| `vestara provider models <id>` | List models with enable/disable state |
| `vestara provider model add <pid> <mid>` | Add a model to a provider |
| `vestara provider model enable <pid> <mid>` | Enable a model |
| `vestara provider model disable <pid> <mid>` | Disable a model |

**Key artifacts**:

- `ProviderConfig` / `ModelConfig` types in `@vestara/workspace` (`workspace-manifest.ts`)
- `providers` field on `WorkspaceManifestData` — persisted in `.vestara/workspace.json`
- `apps/cli/src/commands/provider.ts` — all provider management commands use `WorkspaceManifest` for persistence
- Provider registry is a plain JSON array — inspectable and editable directly in `workspace.json`

**Local provider support**:

Any OpenAI-compatible API (Ollama, LM Studio, LocalAI) can be added:
```
vestara provider add-local ollama
vestara provider model enable ollama llama3
vestara provider status ollama
```

**Verification**:
- `build-order.sh` — zero errors
- Provider CRUD persists across CLI sessions
- Enable/disable state survives restart
- Model enable/disable per-provider works independently

**Status**: ✅ Complete

---

### v8.0 — Multi-User Collaboration 🔶 In Progress

**Objective**: Enable multiple users to collaborate within the same workspace with real-time presence, shared dashboards, and role-based access control.

**Key features**:

- User authentication and session management
- Shared workspace state across multiple users
- Real-time presence indicators (who's viewing what)
- Shared dashboards with per-user cursors
- Role-based access control (admin, editor, viewer)
- Collaborative agent execution review
- Shared notification preferences per workspace
- Audit log of all user actions

**Delivered**:

| Component | Status |
|-----------|--------|
| `UserStore` — SQLite-backed users table with API token auth | ✅ Complete |
| `User` type — id, username, role, token, createdAt | ✅ Complete |
| `POST /api/auth/login` — login by username (creates if new) or token exchange | ✅ Complete |
| `GET /api/auth/me` — current user info + user list | ✅ Complete |
| Auth middleware — Bearer token extraction from `Authorization` header | ✅ Complete |
| `VESTARA_API_KEY` env var — preset admin token on first boot | ✅ Complete |
| Auto-generated admin token — printed to console when no env key set | ✅ Complete |
| Role hierarchy — admin > editor > viewer with `hasRole()` helper | ✅ Complete |
| `requireRole()` helper — sends 403 + JSON error if user lacks minimum role | ✅ Complete |
| Role enforcement on settings mutation PUT/DELETE /api/settings | ✅ Complete |
| Role enforcement on POST /api/agents, POST /api/agents/:id/run | ✅ Complete |
| Role enforcement on POST /api/plans, POST /api/implement, POST /api/implement/apply | ✅ Complete |
| Role enforcement on POST /api/projects, POST /api/schedules, POST /api/schedules/run-due | ✅ Complete |
| Role enforcement on DELETE /api/schedules/:id (admin only) | ✅ Complete |
| `GET /api/admin/users` — list all users (admin only) | ✅ Complete |
| `POST /api/admin/users` — create user with role (admin only) | ✅ Complete |
| `POST /api/admin/users/:id/rotate-token` — rotate API key (admin only) | ✅ Complete |
| Actor context — all 15 event routes now use real user identity instead of hardcoded `{ id: 'user', name: 'User' }` | ✅ Complete |
| Legacy support — `X-Vestara-Actor` header still works as fallback | ✅ Complete |

**Remaining**:
- Shared workspace state across users
- Real-time presence indicators
- Collaborative agent execution review
- Audit log

**Target**: Q2 2027

---

### v8.1 — Advanced Project Management 🔶 Planned

**Objective**: Extend the project management system with Kanban boards, Gantt charts, time tracking, and resource allocation.

**Key features**:

- Kanban board view for tasks (drag-and-drop between status columns)
- Gantt chart view for sprint/project timeline
- Time tracking with start/stop per task
- Resource allocation across projects and agents
- Task dependencies visualization
- Sprint burndown charts
- Project templates for common workflows
- Integration with agent scheduling for automated task assignment

**Target**: Q2 2027

---

### v8.2 — AI-Assisted Development Workflows 🔶 Planned

**Objective**: Create guided, AI-assisted development workflows that walk users through common tasks with intelligent suggestions at each step.

**Key features**:

- Workflow wizard for common tasks (add feature, fix bug, refactor, add tests)
- AI-suggested next steps based on workspace state
- One-click plan generation from natural language descriptions
- Automated code review with AI suggestions
- Smart default configurations per project type
- Learning mode — AI adapts suggestions based on user patterns
- Workflow templates for CI/CD, deployment, and release management

**Target**: Q2 2027

---

### v9.0 — Enterprise Scale 🔶 Planned

**Objective**: Scale Vestara to enterprise deployments with multi-workspace management, organization-wide analytics, SSO integration, and compliance reporting.

**Key features**:

- Multi-workspace management from a single dashboard
- Organization-wide knowledge graph across all workspaces
- Single Sign-On (SSO) with OAuth2/OIDC providers
- Compliance reporting (SOC2, GDPR, HIPAA audit trails)
- Enterprise role-based access control with custom roles
- Workspace quotas and resource limits
- Organization analytics dashboard
- Cross-workspace search and dependency tracking
- Backup and disaster recovery for all workspace data

**Target**: Q3 2027

---

### v9.1 — Plugin Ecosystem v2 🔶 Planned

**Objective**: Evolve the plugin system with a registry, sandboxed execution, version management, and a developer SDK for building plugins.

**Key features**:

- Public plugin registry with search and discovery
- Sandboxed plugin execution with resource limits
- Plugin version management and auto-updates
- Plugin SDK with TypeScript types and documentation
- Lifecycle hooks for all major events (plan.created, changeset.applied, etc.)
- Plugin analytics (usage, performance, error rates)
- Enterprise plugin approval workflow
- Community plugin marketplace — local foundation shipped (2026-08-02:
  `packages/marketplace`, `vestara marketplace` CLI, Workspace API/UI); remote
  distribution and publishing remain open

**Target**: Q3 2027

---

### v9.2 — Mobile & API-First Access 🔶 Planned

**Objective**: Make Vestara accessible from mobile devices and third-party tools through a comprehensive REST API and mobile-optimized web interface.

**Key features**:

- Mobile-responsive web interface for all pages
- Comprehensive REST API with OpenAPI/Swagger documentation
- API rate limiting and authentication
- Webhook system for external integrations
- Mobile push notifications for important events
- Offline-capable mobile experience
- Third-party API client libraries (Python, JavaScript, Go)
- API playground for testing endpoints

**Target**: Q4 2027

---

### v10.0 — AI-Native Development Platform 🔶 Vision

**Objective**: Transform Vestara from an AI-assisted development tool into an AI-native development platform where agents autonomously manage the entire software lifecycle while humans provide strategic direction.

**Key features**:

- Autonomous agent teams that self-organize around goals
- AI-driven code review and quality gates
- Automated dependency management and security patching
- Self-documenting codebases with AI-generated documentation
- Predictive performance optimization
- Automated test generation and maintenance
- AI-driven architecture evolution suggestions
- Natural language interface for all operations
- Autonomous incident response and debugging
- Continuous improvement through learned patterns

**Principles**:

- Humans define strategy; AI executes tactics
- All autonomous actions are auditable and reversible
- The platform learns from every interaction
- Quality is never compromised for speed
- Every artifact has human-verifiable provenance

**Target**: 2028

---

### v10.1 — Universal Protocol & Interoperability 🔶 Vision

**Objective**: Make Vestara's agent ecosystem interoperable with other AI development platforms through standard protocols and data formats.

**Key features**:

- Open Agent Protocol for cross-platform agent communication
- Standardized artifact formats for interchange
- Integration adapters for popular development platforms (GitHub, GitLab, Jira, Linear)
- Bidirectional sync with external issue trackers
- Import/export workspace data in standard formats
- Federation protocol for multi-platform agent teams
- Open-source reference implementations

**Target**: 2028

---

## Summary Dashboard

| Era | Version | Theme | Status |
| ----- | --------- | ------- | -------- |
| Architecture | v0.1–v0.2 | Bootable Runtime, Executive Brain | ✅ Complete |
| Product | v0.3–v0.9 | Repository Comprehension, Planning, Implementation, Verification, Collaboration, Agents, Memory | ✅ Complete |
| Product | v1.0–v1.6 | Engineering Workspace, UI, Multi-Repo, Enterprise, Plugins, Cloud, OS | ✅ Complete |
| Product | v2.0–v2.7 | Predictive Engineering, Async Execution, Auto-Indexing, Health Scoring, Outcome Verification | ✅ Complete |
| Quality | v3.0–v3.7 | Quality Infrastructure, Codebase Cleanup, Docs, Tests, Hygiene, Suggestions, E2E Tests, Knowledge Perf | ✅ Complete |
| Conversational | v4.0–v4.5 | Onboarding, Platform Validation, Dashboard Intelligence, Agent Teams, Scheduling, Audit | ✅ Complete |
| Operational | v5.0–v5.3 | Operational Baselines, Observability, Provider Selection, Workflow Orchestration | ✅ Complete |
| Interactive | v6.0–v6.3 | Dashboard, Agents & Suggestions, Terminal, Chat, Streaming, Data Export | ✅ Complete |
| **Dashboard** | **v7.0–v7.1** | **Conversation Analytics, Theme System** | ✅ Complete |
| Dashboard | v7.0–v7.1 | Artifact Pipeline, Operational Widgets, Theme System | ✅ Complete |
| Recommendations | v7.2 | AI-Powered Plan Recommendations, Feature Analysis | ✅ Complete |
| Analyst | v7.3 | Workspace Analyst Agent, OpenCode Integration | ✅ Complete |
| Build Tools | v7.4 | Build Tools & Dev Server Access (build buttons, dev server launch) | ✅ Complete |
| API Builder | v7.5 | API Explorer & Testing Console (Postman-like interface, endpoint browser) | ✅ Complete |
| UI Tester | v7.7 | Workspace UI Tester Automation (auto test+build on file changes, milestone triggers) | ✅ Complete |
| Notification Center | v7.6 | Notification Center & Alerting (persistent notifications, toast alerts, notification center UI) | ✅ Complete |
| API Builder UI | v7.8 | API Builder UI/UX Enhancement (live endpoints, history persistence, env vars, code snippets, keyboard shortcuts, response tree view, tabs) | ✅ Complete |
| Dashboard UI | v7.9 | Dashboard & Settings UI Consistency (MUI→Tailwind, CSS variable fixes) | ✅ Complete |
| CLI/API Alignment | v7.10 | CLI/API Runtime Alignment (boot sequence, context pattern, lifecycle management) | ✅ Complete |
| **Collaboration** | **v8.0–v8.2** | **Multi-User, Advanced PM, AI Workflows** | 🔶 In Progress |
| **Enterprise** | **v9.0–v9.2** | **Enterprise Scale, Plugin v2, Mobile/API** | 🔶 Planned |
| **AI-Native** | **v10.0–v10.1** | **Autonomous Platform, Universal Protocol** | 🔶 Vision |

---

## Definition of Done

Every milestone must satisfy this checklist before being marked complete:

### Documentation

- [ ] **PCS** — Product Capability Specification written and accepted
- [ ] **UX** — User Experience Specification written and accepted
- [ ] **ATS** — Acceptance Test Specification written and accepted
- [ ] **README updates** — Relevant README files updated
- [ ] **API docs** — API documentation generated or updated

### Implementation

- [ ] **Code** — All planned features implemented
- [ ] **Tests** — Unit + integration tests passing
- [ ] **Benchmarks** — Performance benchmarks meet targets
- [ ] **Build** — `bash build-order.sh` passes with zero errors
- [ ] **Lint** — `pnpm lint` passes with zero errors

### Governance

- [ ] **Milestone status** — MILESTONES.md updated with completion evidence
- [ ] **Implementation status** — IMPLEMENTATION_STATUS.md updated
- [ ] **Artifact catalog** — ARTIFACT-CATALOG.md updated if new artifacts introduced
- [ ] **Exit criteria** — All exit criteria verified with evidence

---

## Vision Beyond

These are enduring aspirations that guide the project beyond any specific milestone. They provide direction without committing to particular releases.

### Continuous Learning

The platform learns from every engineering activity — conversations, plans, implementations, verifications — and applies that learning to improve future outcomes. No two users have the same experience because the platform adapts to each team's patterns.

### Federated Multi-Organization Collaboration

Organizations can connect their Vestara instances to share knowledge, cross-reference repositories, and coordinate multi-team engineering efforts while maintaining data sovereignty and access control.

### Portable AI Workstation

A developer's complete engineering environment — workspace state, agent configurations, project data, knowledge graph — is portable across machines, clouds, and operating systems. Moving between devices is as simple as copying a directory.

### Fully Offline Engineering

Vestara operates at full capability without any internet connection. Local AI providers, local STT/TTS, and local knowledge graphs ensure that the only difference between online and offline is response quality, not capability availability.

### Human-Governed Autonomous Engineering

AI agents autonomously manage the entire software lifecycle — from planning through implementation, verification, and deployment — while humans provide strategic direction and retain ultimate authority through configurable governance gates.

### Open Protocol for AI Engineering Interoperability

Vestara's agent protocol, artifact formats, and workspace model are open standards. Any AI engineering platform can interoperate with Vestara, enabling a diverse ecosystem of specialized tools and agents to collaborate on the same workspace.

---

## Governance Model

The project is governed by a layered document hierarchy where each layer has a distinct responsibility:

```
Vision
    │
    ▼
Blueprint / Architecture
    │
    ▼
Product Principles
    │
    ▼
Operational Principles
    │
    ▼
Milestones (MILESTONES.md)
    │
    ▼
Roadmap Governance (ROADMAP-GOVERNANCE.md)
    │
    ▼
Artifact Catalog (ARTIFACT-CATALOG.md)
    │
    ▼
PCS / UX / ATS
    │
    ▼
Implementation
    │
    ▼
Evidence
```

Each layer constrains the layers below it and enables the layers above it. No layer may violate the contracts established by the layers above.

---

## Product Evolution Milestones

### EV-003a — Shared Understanding ✅ Complete

**Objective**: Produce exactly one immutable `WorkspaceUnderstanding` snapshot per observation cycle. All product components consume this shared snapshot. No component independently reconstructs semantic context from repository, memory, or conversation state.

**Primary invariant**: Every consumer references the same `WorkspaceUnderstanding.id`.

**Architecture**:

```
WorkspaceSession
        │
        ▼
UnderstandingEngine
        │
        ├── WorkspaceObservation   (raw signals, no interpretation)
        │
        ├── WorkspaceUnderstanding  (immutable snapshot with id)
        │
        └── PlanningContext        (task-specific projection)
                │
                ├── Conversation (via UnderstandingContextAssembler)
                ├── Planner
                ├── Overview UI
                ├── Voice
                └── Agents
```

**Key artifacts**:

- `packages/understanding/` — four type files + interface, zero runtime deps
- `packages/workspace/src/understanding-engine.ts` — `DefaultUnderstandingEngine` with `observe()` and `understand()`
- `packages/workspace/src/understanding-context-assembler.ts` — replaces `DefaultContextAssembler`; projects understanding into conversation prompts
- `workspace:understood` — product lifecycle event emitted after each observation cycle
- `WorkspaceSession.publishUnderstanding()` — single mutation point for the snapshot
- ADR-043 — Shared Understanding Snapshot (architectural invariant)
- 5 contract tests verifying: deterministic ids, same-id-across-consumers, fallback behavior, system prompt enrichment

**Lifecycle**: `workspace.opening → workspace.ready → workspace.understood → workspace.interactive`

**Design principle recorded**:
> Runtime ensures every component progresses through the same lifecycle. Understanding ensures every component begins from the same mental model.

**Status**: ✅ Complete

---

### EV-003b Infrastructure — Evaluation Framework ✅ Complete

**Objective**: Build the measurement infrastructure for understanding quality. Separate evaluation from implementation so every analyzer earns its place by measurably improving shared understanding without regressing existing knowledge.

**Key artifacts**:

- `packages/evaluation/` — corpus assertion types, harness, metrics, traceability
- `CorpusEntryAssertions` — language, framework, architecture, maturity, risks, health — each with `minimumConfidence`
- `EvaluationHarness` — opens each corpus entry, runs `observe()` → `understand()`, evaluates assertions against the snapshot
- `EvaluationReport` — per-entry results, aggregate metrics (accuracy, coverage, confidence, traceability, regression count)
- 3 fixture repositories: `vite-react-basic`, `nestjs-monorepo`, `empty-project`
- Regression detection — reports assertions that passed previously but fail on current run
- Traceability metric — verifies every assertion traces to observation sources
- Build order updated: `understanding` and `evaluation` added to sequential build

**Metrics**:

| Metric | Purpose |
|--------|---------|
| Accuracy | What percentage of assertions pass? |
| Coverage | What percentage of assertions could be evaluated? |
| Confidence | Average confidence of passing assertions |
| Traceability | Can every conclusion be traced to an observation source? |
| Regression | Did previously passing assertions regress? |

**Calibration loop**:

```text
Corpus Report → Find weakest dimension → Improve one producer → Run evaluation → Verify no regressions → Repeat
```

**Design principle recorded**:
> Runtime executes. Workflow acts. Understanding knows. Evaluation measures.

**Status**: ✅ Complete

---

### EV-003b — Producer Architecture ✅ Complete

**Objective**: Factor `DefaultUnderstandingEngine.understand()` into 7 independent producers, each owning exactly one semantic dimension of `WorkspaceUnderstanding`. The engine becomes orchestration; producers own knowledge.

**Architecture**:

```
UnderstandingEngine
        │
        ▼
UnderstandingAssembler
        │
        ├── LanguageProducer    → identity.primaryLanguage
        ├── FrameworkProducer   → identity.framework
        ├── ArchitectureProducer → architecture.kind
        ├── MaturityProducer    → maturity.level
        ├── RiskProducer        → maturity.risks
        ├── HealthProducer      → maturity.healthScore, state.*
        └── ActivityProducer    → activity.*, memory.*
```

**Producer contract**: Every producer implements `UnderstandingProducer`, returns `DeepPartial<WorkspaceUnderstanding>` (only fields it owns), and reports confidence + evidence. Producers never mutate — they contribute. The assembler composes.

**Key artifacts**:

- `UnderstandingProducer` interface in `@vestara/understanding`
- `DefaultUnderstandingAssembler` — merge strategy with field-level ownership
- 7 producers in `packages/workspace/src/producers/`
- Evaluation harness updated with per-producer metrics (`ProducerMetric`)
- Producer interface replaces 150-line inline method with delegation
- `DeepPartial<WorkspaceUnderstanding>` ensures each producer only sets the fields it owns

**Architectural pattern**: This is the third recurrence of the same pattern:
```
Runtime                → RuntimeGroup + specialized runtimes
WorkspaceRuntime       → WorkspaceRuntime + pipeline stages
UnderstandingEngine    → UnderstandingAssembler + specialized producers
```

**Evaluation loop**:

```text
Read evaluation report → Pick weakest producer → Improve only that producer → Run corpus → Accept only if accuracy increases, confidence remains calibrated, regressions remain zero → Repeat
```

**Status**: ✅ Complete

---

### EV-003c — Workspace Overview ✅ Complete

**Objective**: Expose the same `WorkspaceUnderstanding` model to the user through the Overview UI. The UI renders the same snapshot the planner and conversation already consume — no separate model, no duplicate logic.

**Key artifacts**:

- `GET /api/understanding` — returns `session.understanding` directly (503 if not yet available)
- `apps/workspace/src/pages/Overview.tsx` — loads understanding via `useUnderstanding()` hook, renders 6 cards in responsive grid
- 6 card components: `IdentityCard`, `HealthCard`, `ActivityCard`, `ArchitectureCard`, `DecisionsCard`, `StateCard`
- Every component receives `understanding: UnderstandingData` as its only prop — zero repository analysis, memory queries, or git parsing in the UI
- Nav link in ShellLayout sidebar
- Route registered at `/overview`

**Design principle validated**:
> Compute once, consume everywhere. The first screen of the product renders the same semantic model that the planner, conversation, and evaluation harness already use.

**Status**: ✅ Complete

---

### v7.9 — Dashboard & Settings UI Consistency ✅ Complete

**Objective**: Eliminate stale Material UI dependencies from Dashboard components, replace with Tailwind equivalents, and fix broken CSS variable references across Settings pages to align with the theme system's `--vestara-*` variables.

**Key changes**:

| File | Before | After |
|------|--------|-------|
| `apps/workspace/src/pages/Dashboard.tsx` | MUI `Box`, `Tabs`, `Tab`, `Button`, `AddIcon` | Pure Tailwind toggle tabs + inline SVG button |
| `apps/workspace/src/components/WorkspaceContinuityCard.tsx` | MUI `Card`, `CardContent`, `Typography`, `Chip`, `Button`, `Box`, `HistoryIcon` | Pure Tailwind div layout |
| `apps/workspace/src/pages/Settings/SettingsPage.tsx` | Broken `--accent-primary/--text-primary` | Correct `--vestara-accent/--vestara-text` |
| `apps/workspace/src/pages/Settings/components/layout/SettingsBreadcrumbs.tsx` | Broken `--text-primary/--text-secondary/--text-tertiary` | Correct `--vestara-text/--vestara-text-2/--vestara-text-muted` |
| `apps/workspace/src/pages/Settings/components/layout/SettingsSidebar.tsx` | Broken `--accent-primary/--bg-secondary/--border-primary/--text-inverse` | Correct `--vestara-accent/--color-zinc-900/--vestara-accent-border/white` |
| `apps/workspace/src/pages/Settings/SettingsRouter.tsx` | Broken `--text-primary/--text-error/--bg-secondary/--border-primary` | Correct `--vestara-text/--vestara-red/--color-zinc-900/--vestara-accent-border` |
| `apps/workspace/src/pages/Settings/SettingsLayout.tsx` | Broken `--bg-primary` | Correct `--color-zinc-950` |
| `apps/workspace/src/pages/Settings/components/ai/providers/AIProvidersSettings.tsx` | 12 broken `--accent-primary/--text-*/--bg-*/--border-*` | All corrected to `--vestara-*`/`--color-zinc-*` |

**Cleanup**: Removed 10 empty stale theme files (ThemeSettings, ThemePreview, Models, useThemeSettings, SettingsHeader, SettingsGrid, StatusBanner, etc.)

**Verification**:
- `bash build-order.sh` — zero errors
- `pnpm lint` — clean (pre-existing unused-variable warnings only)
- Zero MUI imports remain in dashboard or settings source files
- Unused dependencies identified: `@mui/icons-material`, `@mui/material`, `@emotion/react`, `@emotion/styled`

**Status**: ✅ Complete

---

### v7.10 — CLI/API Runtime Alignment ✅ Complete

**Objective**: Align `@vestara/cli` with `@vestara/api` so both apps follow the same boot sequence, runtime lifecycle, and service-initialization pattern. The CLI had 1800+ lines of inline boot logic in `index.ts` — extract into the same 3-layer pattern (`entry → context → runtime`) used by the API.

**Before/After**:

| Aspect | Before | After |
|--------|--------|-------|
| Boot logic location | Inline in `index.ts` (`main()`, ~230 lines) | Extracted to `context/cli-context.ts` |
| Lifecycle manager | `CliRuntime` created but unused in boot flow | `CliRuntime` created by `createCliContext()`, manages lifecycle |
| `startRepl()` signature | 6 individual parameters | Single `CliContext` parameter |
| Cleanup | Duplicated in 3 places (REPL line handler, close handler, non-watch path) | Single `ctx.close()` tear down |
| Stale artifacts | `.js`/`.d.ts`/`.js.map` in `src/` alongside `.ts` | Cleaned |

**Key artifacts created**:

| File | Pattern |
|------|---------|
| `apps/cli/src/context/cli-context.ts` | Mirrors `api/src/workspace-context.ts` |
| `apps/cli/src/runtime/cli-runtime.ts` (refactored) | Mirrors `api/src/runtime/api-runtime.ts` |
| `apps/cli/src/index.ts` (refactored) | Thin entry point, mirrors `api/src/index.ts` |

**`CliRuntime` services added**: `stateRuntime`, `audioService`, `sttService`, `ttsService`, `providerRouter` — with proper lifecycle hooks (`onStop` stops activity, ends conversation, checkpoints state, shuts down kernel)

**Verification**:
- `bash build-order.sh` — zero errors (all 52 packages + apps)
- `pnpm test` — **684 tests pass across 63 files** (zero regressions)
- Stale compiled JS artifacts removed from `src/` directories

**Status**: ✅ Complete

---

## Capability Validation Era

### CAP-001 Validation Run #001 ✅ Complete

**Objective**: Execute the first end-to-end CAP-001 Workspace Orientation validation. Demonstrate that `pnpm vestara validate <path>` produces a measurable orientation experience from the existing `WorkspaceUnderstanding` snapshot.

**Command**: `pnpm vestara validate <path>`

**Observation protocol**: `docs/validation/CAP-001/protocol.md`

**Artifacts created**:

- `apps/cli/src/commands/validate.ts` — `vestara validate` command, a consumer of the existing `WorkspaceUnderstanding` snapshot. No special validation code paths, no experimental AI prompts, no duplicated analysis.
- `docs/validation/CAP-001/run-001.md` — first completed validation report against vite-react-basic fixture
- `docs/validation/CAP-001/observations.md` — pattern tracking across runs
- `docs/validation/CAP-001/findings.md` — improvement owner determination
- `docs/evidence/learning-log.md` — organizational memory for validation findings

**Validation flow**:

```
Developer → pnpm vestara validate <workspace> → WorkspaceUnderstanding → Orientation Output → CAP-001 Protocol → Validation Report → Finding → Targeted Improvement
```

**Performance**: Orientation completes in ~530ms for cached workspace (vestara monorepo), ~292ms for smaller fixture.

**Finding from Run #001**:

> The largest remaining cognitive gap is historical decision context because the evidence shows that after orientation, the developer understood identity, architecture, and health but had no context on why the project was structured that way or what decisions preceded its current state.

**Improvement owner**: Memory / ActivityProducer — decisions exist in the memory runtime but are not automatically promoted from engineering sessions into the memory store consumed by the ActivityProducer.

**Design principle validated**:
> Orientation must explain, not merely summarize. The validate command is the first consumer of `WorkspaceUnderstanding` designed specifically for human validation rather than system validation.

**Status**: ✅ Complete

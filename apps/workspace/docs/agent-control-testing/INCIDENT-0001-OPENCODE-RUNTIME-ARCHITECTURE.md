# Incident #0001 — OpenCode Runtime Architecture Investigation

> Status: **OPEN — investigation complete; fix planned, not implemented.**
> Living artifact: updated as the fix proceeds through implementation and
> verification. Companion docs: `PHASE-0-GENERATION-BOUNDARY.md`,
> `PHASE-0.5-OPENCODE-GENERATION-AUDIT.md`, `GAP-ANALYSIS.md`.

## Title

OpenCode Runtime Architecture Investigation.

## Observed symptom

Agent Control configuration appeared inconsistent with execution: an Agent's
saved `provider`/`model` did not govern generation, and the `/run` response
claimed `runtime.engine: "opencode-runtime"` without proof. The Agent Control
surface looked like it was driving generation when the evidence said otherwise.

## Investigation

- **Phase 0** — code-level call-graph trace of `POST /api/agents/:id/run`
  through every layer to the actual generation request.
- **Phase 0.5** — platform-wide audit of every production generative consumer,
  the Agent configuration propagation chain, runtime feature utilization,
  worker parity, and tool governance.

## Evidence

- `apps/api/src/workspace-context.ts:828` — `AgentHarnessRuntime` is wired with
  `provider: new OpenCodeRuntimeProvider()`, `model: 'opencode-runtime'`.
- `packages/providers/opencode/src/runtime-provider.ts:147` — `complete()`
  creates an OpenCode runtime session, sends the prompt, streams SSE to
  `session.idle`, aborts in `finally`. Doc comment: "No tool calls are
  surfaced — the runtime agent runs its own tool loop."
- `packages/providers/opencode/src/index.ts:204` — `OpenCodeProvider.complete()`
  calls `fetch(https://opencode.ai/zen/v1/chat/completions)` directly
  (OpenAI-compatible gateway), bypassing `@vestara/opencode-runtime`.
- `apps/api/src/workspace-context.ts` — Conversation, Planning, Explain,
  Suggestions, Workspace Analyst all receive `provider: opencode`
  (`OpenCodeProvider`, direct gateway).
- `packages/workflow-orchestrator/src/distributed/worker-node.ts` +
  `apps/api/src/worker/worker-node-bootstrap.ts:32` — WorkerNodes run a
  pluggable `WorkerExecutor`; the default is scripted (non-generative).
- `packages/opencode-runtime/src/runtime/opencode-runtime.ts` — `OpenCodeRuntime`
  class exists but is constructed nowhere in production.
- `packages/workspace/src/{prediction-service,decision-service,ev001/ai-project-planner}.ts`
  — take an `AIProvider`, never constructed in production wiring.

## Incorrect hypotheses

1. **"Agent execution bypasses `opencode-runtime` entirely."** Refuted by
   evidence: the harness does route through `OpenCodeRuntimeProvider` →
   `OpenCodeHttpClient` (headless runtime). Classification corrected from
   "direct gateway" to `CANONICAL_RUNTIME_ADAPTER`.
2. **"The issue is isolated to Agent Control."** Refuted in Phase 0.5: the
   direct-gateway integration is used by Conversation, Planning, Explain,
   Suggestions, the CLI, and the onboarding lab. The policy inconsistency is
   platform-wide, not Agent-specific.
3. **"`runtime.engine: 'opencode-runtime'` proves the path."** Refuted: it is
   response metadata; only the call graph proves the path.

## Architecture discoveries

1. The canonical boundary exists and is used for Agent execution
   (`CANONICAL_RUNTIME_ADAPTER`), but is **not** the platform-wide generation
   boundary.
2. The platform has **two parallel OpenCode integrations** — the headless
   runtime (`opencode-runtime`) and the direct gateway
   (`provider-opencode` / `conversation-runtime`) — plus remote worker
   executors as a third path.
3. Agent `provider`, `model`, and `runtimeAgent` are persisted but **not applied
   to generation** (`DEAD_CONFIGURATION`). The runtime session uses the OpenCode
   runtime's own default provider/model.
4. Runtime-driven generation runs **OpenCode's internal tool loop**; Vestara
   capability/approval policy is dormant. Only Chat/`runToolLoop` enforces
   Vestara `ToolRuntime` policy (path A); the Agent path uses the OpenCode
   permission bridge (path B).
5. `OpenCodeRuntime` (the intended runtime class) is unused; the generation
   boundary lives in a provider adapter; `OpenCodeRuntimeService` is control-only.

## Final root cause

Two-fold:

1. **No single `GenerationRuntime` boundary.** Generation + session lifecycle
   are owned by `OpenCodeRuntimeProvider` (a provider adapter); control is owned
   by `OpenCodeRuntimeService`; the `OpenCodeRuntime` class is unused. There is
   no one place that owns "generate a turn for an Agent."
2. **Agent configuration never reaches the runtime session.** `provider`,
   `model`, and `runtimeAgent` are stored but ignored; the harness always uses a
   fresh runtime session with the runtime's default provider/model.

## Implemented solution

Not yet implemented. Planned migration order (from Phase 0.5):

- **P0** — decide the tool-governance model (govern OpenCode runtime permission
  prompts against Vestara capability/approval policy, or route runtime tool
  calls through Vestara `ToolRuntime`).
- **P1** — make `provider`/`model`/`runtimeAgent` operational and record
  session + resolved provider/model provenance on execution records.
- **P2** — promote `OpenCodeRuntime` (or a thin runtime service) to the
  generation boundary; keep `OpenCodeRuntimeProvider` as the `AIProvider`
  adapter; converge `OpenCodeRuntimeService`.
- **P3** — consolidate legacy direct-gateway consumers; resolve worker parity.

Preserved contracts: Agent, Task, Workflow, Evidence, Verification.

## Verification

**Pending.** Phase 1 (Agent CRUD) does not depend on the generation boundary and
can proceed first. Generation-boundary verification belongs to Phase 2 after the
P0/P1 decisions.

## Lessons learned

- Do not trust metadata (`runtime.engine`) or comments — trace actual function
  calls and object dependencies.
- A subsystem existing somewhere does **not** prove Agent Control integrates
  with it; audit each consumer against the boundary it actually crosses.
- The incident was bigger than the symptom: "Agent config doesn't control
  runtime" was a platform-wide pattern, not an Agent Control bug.
- Investigation before implementation; revise the model when evidence demands it
  (the Phase 0 → 0.5 correction is itself an example of this).

## Engineering principles extracted

- **Trust the evidence, not the agent** — the core design principle that made
  this investigation possible.
- **One projection / one generation boundary, many consumers.**
- **Generation completion ≠ engineering correctness** (verification is
  independent; OpenCode saying "done" never implies `verification = passed`).
- **Configuration must reach the runtime to be real** — a saved field that is
  never read during execution is dead configuration.

## Status log

| Phase | Result |
|---|---|
| Phase 0 | Classification **B — Transitional**; agent execution converges on `opencode-runtime`, control surface split. |
| Phase 0.5 | Platform-wide divergence confirmed; tool governance is path-B for agents, path-A for chat; worker parity failed by default. |
| Phase 1 | 14 automated CRUD tests green; **live verification exposed a schema-migration defect** — `POST/PUT /api/agents` → 500 `table agents has no column named agent_type`. False-success fix verified live (error toast, no success toast, no false persistence). |
| Phase 1.1 | **Schema drift audit**: `agents.agent_type` (added in `d838201`) was never migrated; `runtime_agent` (uncommitted WIP) was migrated via ad-hoc `ALTER`. Systemic: 74 `CREATE TABLE IF NOT EXISTS`, only 2 `ALTER TABLE`, zero DB versioning → schema creation without schema evolution. Fixture preserved. |
| Phase 1.1 (design) | Migration architecture design produced, then **revised after reviewer round 1** (`PHASE-1.1-MIGRATION-DESIGN.md` rev 2): 1-based versions (v1 baseline, v2 agent_type, v3 runtime_agent); explicit **legacy adoption** rule (pristine vs legacy-known vs `UNKNOWN_LEGACY_SCHEMA`); composition-root-owned file-level sequence; **explicit persistence + mandatory restart verification** (verified `openSqlDb` does not auto-persist `ALTER`/`PRAGMA`); `DATABASE_VERSION_INCOMPATIBLE` on newer-than-binary; applied-log invariant `MAX(version)==user_version`; semantic drift guard. Reviewer confirmed migration-0 defect + sql.js persistence gap. |
| Phase 1.1a | **AgentStorage migration proof DONE.** `@vestara/sqlite-migrations` runner + agent migrations v1/v2/v3; **migration execution moved to entrypoint composition roots** (API `openSqlDb`, CLI `openSharedDb`); `AgentStorage` no longer migrates (reviewer round 2). 23 automated migration tests green. **Live workspace migrated** (18 rows preserved, `user_version=3`). **Full live Agent Control lifecycle verified** under an available-slot condition (create → persist → reload → update → reload → disable → reload → delete). |
| Phase 1.1a (review) | **Final verdict: Phase 1.1a VERIFIED; Phase 1 correctly withheld.** Migration proof / API CRUD / historical migration / false-success: VERIFIED. Agent Control CRUD lifecycle: VERIFIED (available-slot condition). **Slot finding**: valid presentation/domain mismatch — the many-agent domain (arbitrary, non-unique roles) is projected into a one-representative-per-canonical-role slot UI. Direction chosen: **separate Agent Catalog (all agents) from Role Assignment (organizational slots)**; do not constrain the domain to preserve the slot UI. Surfaces **Identity ≠ Role**. **Implementation NOT authorized** — pending a product/UX decision on how Vestara represents the *Who*. |

## Addendum — the live-verification finding (Phase 1 → 1.1)

The automated suite reported CRUD green because it exercises the schema the
*current* `CREATE TABLE` produces. The live product proved the *actual*
workspace database predates a schema change and is never upgraded:

```
Unit/component tests: green (fresh in-memory DB, current schema)
Broader suite: 2,020 tests, mostly green
Live browser verification: product broken (create/update → 500)
```

Principle recorded: **fresh-state tests verify today's architecture; migration
tests verify the history of the product. Vestara needs both.** The
pre-migration `plans.db` is preserved as an upgrade-path fixture
(`docs/agent-control-testing/fixtures/plans-pre-migration.db`) and must not be
deleted.

## Success metric (as proposed by the Reviewer)

How many times did the workflow correct itself because of evidence? In this
incident alone: **(1)** the hypothesis "generation bypasses opencode-runtime"
was corrected by evidence; **(2)** the hypothesis "isolated to Agent Control"
was corrected by the platform-wide audit. Both corrections reduced dependence
on intuition and increased dependence on observation.

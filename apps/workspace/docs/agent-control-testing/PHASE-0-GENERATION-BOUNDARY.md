# Phase 0 — Agent Generation Boundary Verification

Analysis only. No production code was modified during this phase.

## Preserved Phase 1 WIP (interrupted)

Uncommitted changes present before Phase 0, **preserved without expansion**:

- `apps/api/src/routes/agents.ts` — Phase 1 WIP: create now rejects duplicate id/name
  (409), trims `id`/`name`, enforces name ≤ 200 / id ≤ 100, honors a
  create-time `status`; PUT added a role guard + name-collision check +
  `AGENT_UPDATE` audit; DELETE added a role guard + `AGENT_DELETE` audit.
- `apps/api/src/audit-log.ts` — added `AGENT_UPDATE` / `AGENT_DELETE` actions.
- `apps/workspace/docs/agent-control-testing/GAP-ANALYSIS.md` — created.

**Held (proposed, NOT final):** globally-unique agent names, name max 200,
id max 100, create-time enabled/disabled policy. These are domain-contract
decisions and remain open — see Authentication note below.

---

## 1. Current Generation Architecture — exact call graphs

### 1a. Direct Agent run (`POST /api/agents/:id/run`)

| # | File | Class/function | Caller → callee | Responsibility | Generation? |
|---|------|----------------|-----------------|----------------|-------------|
| 1 | `apps/api/src/routes/agents.ts:231` | route handler `runAgentMatch` | `handleAgentsRoute` → `ctx.agentService.runAgent(agentId, task, session)` | HTTP entry, editor role, audit `AGENT_RUN` | no (control) |
| 2 | `packages/workspace/src/agent-service.ts:82` | `AgentService.runAgent` | → `this.runtime.run(agentId, task, session)` | checks agent exists / not disabled / repo-read permission; emits `agent:completed` | no (orchestration) |
| 3 | `packages/workspace/src/agent-runtime.ts:70` | `AgentRuntime.run` | → `createExecution` + `runViaHarness` (`:83`) | creates durable execution record | no |
| 4 | `packages/workspace/src/agent-runtime.ts:95` | `HarnessExecutionAdapter.execute` | → `harness.createThread` + `harness.run` (`harness-session.ts:270`) | adapts agent run to a durable harness thread | no |
| 5 | `packages/agent-harness/src/index.ts:281` | `AgentHarnessRuntime.run` | → `continueTurn` → `:547 this.options.provider.complete({...})` | durable turn loop, model call | **yes (initiates)** |
| 6 | `packages/providers/opencode/src/runtime-provider.ts:147` | `OpenCodeRuntimeProvider.complete` | → `OpenCodeHttpClient.createSession` + `sendMessageAsync` + `openEventStream` (SSE) until `session.idle` → `abortSession` (finally) | drives OpenCode headless runtime per turn | **yes** |
| 7 | `packages/opencode-runtime/src/client/opencode-http-client.ts` | `OpenCodeHttpClient` | HTTP to OpenCode headless runtime | transport for health/providers/sessions/events/abort | yes (transport) |
| 8 | OpenCode headless runtime | — | → provider/model via runtime's own resolution | actual generation | **yes** |

**Wiring evidence:** `apps/api/src/workspace-context.ts:828` constructs
`AgentHarnessRuntime` with `provider: new OpenCodeRuntimeProvider()` (no options →
no `preferredProviderId`, no `agent`) and `model: 'opencode-runtime'` (sentinel).
Comment: "Agents execute through the OpenCode runtime… Provider/model are
discovered from the runtime (`/api/opencode/providers`), never hardcoded."

### 1b. Workflow Agent execution

`WorkflowOrchestrator` (workflow-orchestrator) → `FallbackTaskDispatcher`
(workspace-context:967):
- primary = `WorkerCluster` (distributed remote nodes) — **separate execution
  path** (remote worker runtime).
- fallback = `HarnessTaskDispatcher({ runner: agentHarness, session: harnessSession })`
  (workspace-context:985) → `agentHarness.run` → same boundary as 1a (steps 5–8).

Multi-agent workflows: `MultiAgentWorkflowOrchestrator.start`
(`packages/workspace/src/multi-agent-workflow.ts:98`) → `this.session.harness`
(workspace-context:886 wires `harnessSession`) → same harness/provider boundary.

### 1c. Task-triggered execution

`HarnessTaskDispatcher` → `agentHarness.run` → same boundary. Converges locally.

### 1d. Parallel generative integration (NOT agent execution)

`OpenCodeProvider` (`packages/providers/opencode/src/index.ts`) — OpenAI-compatible
`fetch` to `https://opencode.ai/zen/v1/chat/completions` — is used for
**Conversation, Planning, Explain, Suggestions** (workspace-context:401, :521,
:522, :1136) via `runToolLoop`. It does **not** use `@vestara/opencode-runtime`.
`OpenCodeGoProvider` / `OpenCodeProvider` subclasses share this path.

---

## 2. `OpenCodeRuntimeService` — what it actually owns

`apps/api/src/opencode-runtime-service.ts` — thin wrapper over
`OpenCodeHttpClient` (`@vestara/opencode-runtime`):
- `reachable()` (health gate), `listAgents()`, `listProviders()`, `health()`.
- **Does NOT own**: session creation, generation, streaming, cancellation,
  events, compatibility, execution.

## 3. `@vestara/opencode-runtime` — what it actually owns today

| Capability | Used in production generation? |
|---|---|
| `OpenCodeHttpClient` (health, providers, agents, sessions, events, abort) | **yes — generation transport** (via `OpenCodeRuntimeProvider`) and control (via `OpenCodeRuntimeService` + `/api/opencode/*`) |
| `OpenCodeEventBridge` (persistent SSE) | control/events — `/api/opencode` route (`opencode.ts:63`), incl. `onPermissionRequest` → `InMemoryPermissionRegistry` |
| `compatibility` engine | CI contract guard only |
| `config` / `resolveOpenCodeConfig` | control/generation config resolution |
| `permissions` (registry/types) | governance of OpenCode runtime permission prompts (`/api/opencode/permissions`) |
| `sessions` (registry/ownership) | control |
| `OpenCodeRuntime` class (`runtime/opencode-runtime.ts`) | **unused in production** (no `new OpenCodeRuntime(` anywhere outside the package) |
| `evidence`, `discovery-normalizers`, `session-normalizers` | control/telemetry |

## 4. Session ownership

`OpenCodeRuntimeProvider` (provider-opencode) creates + aborts the generation
session (`createSession`/`abortSession`). The OpenCode runtime's session
registry/lifecycle is **not** owned by `opencode-runtime`'s `OpenCodeRuntime`
class nor by `OpenCodeRuntimeService`. Sessions for the `/api/opencode/*`
control surface are listed through the same HTTP client.

## 5. Provider/model ownership

- **Agent configuration**: `provider`/`model` on the Agent record is **not
  passed to generation**. `AgentService.runAgent` forwards only agentId/task;
  the harness provider is a fixed `new OpenCodeRuntimeProvider()`.
- **Vestara selection**: none — no routing/selection layer feeds the harness.
- **OpenCode resolution**: `OpenCodeRuntimeProvider.resolveProvider()` →
  `preferredProviderId` (unset) → first discovered provider → runtime default.
- **Final executed provider/model**: decided by the OpenCode runtime.

## 6. Tool execution + policy boundary

`OpenCodeRuntimeProvider.complete` (runtime-provider.ts:140-146): "No tool calls
are surfaced — the runtime agent runs its own tool loop." The harness builds
Vestara tool definitions (agent-harness `:550`) but the runtime provider ignores
them. **Vestara's `ToolRuntime` / `AgentCapabilityManager` / harness
`awaiting-approval` path is dormant for runtime-driven generation.** OpenCode's
own runtime tools run instead; their permission prompts flow over the event
bridge to `InMemoryPermissionRegistry` → user approval via
`/api/opencode/permissions` (audited `OPENCODE_PERMISSION_APPROVE/REJECT`).
This is a *different* policy system from Vestara capability/approval policy.

## 7. Streaming

`OpenCodeRuntimeProvider` consumes the runtime SSE internally and returns plain
text; token streaming is **not** surfaced. UI "streaming" is harness event
telemetry (`harness.*` → `createHarnessEngineeringEventBridge` →
engineering events → `publish` → WS → UI), not generation tokens.

## 8. Cancellation

Per-turn: `abortSession` in `finally` (post-completion). Mid-run: the harness
`active.controller` (AbortController) gates **Vestara** tool invocation only;
it is not passed into `OpenCodeRuntimeProvider.complete`, so an external cancel
does not abort an in-flight runtime generation session.

## 9. Error propagation

Provider throw → `AgentHarnessRuntime.run` outcome failed → `HarnessExecutionAdapter`
maps to `failed`/`blocked` → `AgentRuntime` updates execution status + returns
message → `AgentService.runAgent` returns `{ success: false, message }` → route
400/500 → UI toast. Harness `harness.*` events also write engineering events
and telemetry (→ UI via WS).

---

## Architecture classification

**B — Transitional**, with a partial divergence:

- Agent/Task/Workflow generation **does** converge on `@vestara/opencode-runtime`
  via `OpenCodeRuntimeProvider` → `OpenCodeHttpClient`. (Not the raw direct
  gateway for agent execution.)
- **Gap:** generation + session ownership lives in a provider adapter
  (`provider-opencode`), while `OpenCodeRuntime` (the intended runtime class) is
  unused and `OpenCodeRuntimeService` is control-only. No single `GenerationRuntime`
  boundary.
- **Divergence (generation path):**
  - Worker-cluster task dispatch runs on remote worker nodes (separate path).
  - Conversation/Planning/Explain use `OpenCodeProvider` (direct gateway), a
    parallel OpenCode integration that bypasses `opencode-runtime`.

## Ownership matrix

| Responsibility | Current owner | Desired owner | Gap |
|---|---|---|---|
| Runtime health | `OpenCodeHttpClient.getHealth` via `OpenCodeRuntimeService` + `OpenCodeRuntimeProvider.healthCheck` | opencode-runtime | two callers, no shared abstraction |
| Provider discovery | `OpenCodeRuntimeProvider.discoverProviders` + `OpenCodeRuntimeService.listProviders` | opencode-runtime | duplicated |
| Model discovery | `OpenCodeRuntimeProvider` (synthesizes an AIModel per provider id) | opencode-runtime | synthesized, not real model lists |
| Generation | `OpenCodeRuntimeProvider.complete` → OpenCodeHttpClient | opencode-runtime | owned in provider adapter |
| Session lifecycle | `OpenCodeRuntimeProvider` (create/abort) | opencode-runtime | provider-owned |
| Streaming | runtime SSE consumed internally; UI gets harness events | opencode-runtime | tokens not surfaced |
| Cancellation | per-turn `abortSession`; no mid-run hook | opencode-runtime | missing |
| Tool requests | OpenCode runtime tool loop; prompts → Vestara permission registry | opencode-runtime + Vestara policy | Vestara capability/approval NOT in loop |
| Workflow orchestration | Vestara (WorkflowOrchestrator, MultiAgentWorkflowOrchestrator) | Vestara | — |
| Verification | Vestara (EngineeringVerificationProfiles + evidence) | Vestara | — |

## Generation entry-point matrix

| Entry | Runtime | Converges? |
|---|---|---|
| Direct Agent run | OpenCodeRuntimeProvider → opencode-runtime | ✓ |
| Task dispatch (local) | HarnessTaskDispatcher → harness → OpenCodeRuntimeProvider | ✓ |
| Task dispatch (worker cluster) | remote WorkerNode runtime | ✗ divergence |
| Workflow Agent | WorkflowOrchestrator → FallbackTaskDispatcher → harness | ✓ (local) |
| Multi-agent workflow | MultiAgentWorkflowOrchestrator → harness | ✓ |
| Retries / rework | same harness path | ✓ |
| Verifier (generative reasoning in multi-agent) | harness | ✓; conclusion = non-generative engine |
| Conversation / Planning / Explain | `OpenCodeProvider` direct gateway | ✗ parallel integration |

---

## Prioritized gaps

**P0 — Architecture correctness**
- `ARCHITECTURE GAP`: no single `GenerationRuntime` boundary; generation owned
  by a provider adapter; `OpenCodeRuntime` class unused; `OpenCodeRuntimeService`
  control-only.
- `ARCHITECTURE GAP — GENERATION PATH DIVERGENCE`: worker-cluster dispatch and
  Conversation/Planning/Explain use different OpenCode integration paths.
- **Trust-model gap**: runtime-driven generation runs OpenCode's own tool loop;
  Vestara capability/approval policy is not in the loop (AC-TST-008 cannot pass
  as specified without a decision).

**P1 — Security / data integrity**
- Duplicate agent id silently overwritten (`INSERT OR REPLACE`) — data loss.
- `PUT`/`DELETE /api/agents/:id` lacked a role guard (Phase 1 WIP adds one —
  held pending auth analysis).
- Authentication: unauthenticated/local requests default to **admin**
  (`auth.ts:46-51`, `x-vestara-actor` fallback). Classification: deliberate
  local/offline-first behavior for the loopback API; it is **not** a
  production-hardened model. Do not change it while fixing CRUD; gate by
  bind address (loopback vs exposed) when addressing authz.

**P2 — Integration**
- Agent-configured provider/model never reaches generation (harness uses runtime
  default). Blocks AC-TST-005/025 attribution.
- Mid-run cancellation of runtime sessions missing.
- Worker-cluster generation path unverified against the same boundary.

**P3 — Test gaps**
- Recorded in the revised backlog below.

## Recommended migration (NOT implemented)

Smallest change that yields one primary generation boundary while preserving
contracts:

1. Promote generation + session lifecycle into `opencode-runtime`
   (implement `OpenCodeRuntime.generate(session, prompt)` / `startSession` /
   `stream` / `cancel`), keeping `OpenCodeRuntimeProvider` as a thin `AIProvider`
   adapter so the harness contract is unchanged.
2. Converge `OpenCodeRuntimeService` onto the same runtime service.
3. **Decide the tool boundary** — either (a) evaluate OpenCode runtime
   permission prompts against Vestara capability/approval policy in the bridge,
   or (b) have the harness execute tools and feed results back into the runtime
   turn. This is the trust-model decision; until then runtime tool use is
   governed only by OpenCode prompts + the Vestara permission registry.
4. Decide whether Conversation/Planning/Explain migrate to the runtime boundary
   or remain gateway-based (document the divergence).

Do not add a `GenerationRuntime` abstraction unless the migration needs it; if
`OpenCodeRuntime` can become the boundary cleanly, prefer that.

## Phase 1 impact

- Agent CRUD tests are **independent of the generation boundary**; Phase 1 can
  proceed.
- Phase 1 API tests must **not** assert agent-configured provider/model reaches
  generation (it does not today) — that belongs to Phase 2 after the boundary
  decision.
- CRUD authz: the unauthenticated-admin default must be preserved for local
  operation; the PUT/DELETE role guard is still justified (consistency with
  POST), but verification must run under the actual local-auth model.

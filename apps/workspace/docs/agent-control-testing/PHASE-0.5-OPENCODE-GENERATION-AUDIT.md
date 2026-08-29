# Phase 0.5 — Vestara OpenCode Generation Path Audit

Analysis only. No production code modified. Phase 1 WIP preserved untouched.

## 1. Executive finding

**The canonical boundary exists and is used by Agent execution, but it is not
the platform-wide generation boundary.**

Only **one** production generation path crosses the canonical boundary
(`opencode-runtime` → OpenCode headless runtime): the **Agent harness path**,
via `OpenCodeRuntimeProvider` (`AgentHarnessRuntime` → `provider.complete`).

Every other generative consumer — Conversation/Chat, Planning, Explain,
Suggestions, Workspace Analyst, the CLI, the onboarding lab, and the
conversation-runtime provider stack — generates through **`OpenCodeProvider`
(direct OpenAI-compatible gateway: `https://opencode.ai/zen/v1/chat/completions`)**
or equivalent direct provider HTTP integrations that **bypass
`opencode-runtime` entirely**.

So the "Agent Control issue" is **not isolated**. The platform has two parallel
OpenCode integrations:
- `opencode-runtime` (headless runtime) — used by Agent execution + control routes
- `provider-opencode`/`conversation-runtime` direct gateway — used by most other
  generative services

And a **third** path: distributed WorkerNodes execute through a pluggable
`WorkerExecutor` (default: scripted, non-generative).

Tool governance is likewise split: only Chat/`runToolLoop` executes tools through
Vestara's `ToolRuntime`; the Agent runtime path runs OpenCode's internal tool loop
governed by OpenCode permission prompts bridged to a Vestara permission registry.

## 2. Full consumer matrix

| Consumer | Entry point | Generation implementation | Runtime path | Provider/model source | Tool loop | Permission boundary | Classification |
|---|---|---|---|---|---|---|---|
| Agent Control direct run | `POST /api/agents/:id/run` → `AgentService.runAgent` → `AgentRuntime` → `HarnessExecutionAdapter` → `AgentHarnessRuntime.run` (`agent-harness:281`) | `OpenCodeRuntimeProvider.complete` (`provider-opencode/runtime-provider.ts:147`) | CANONICAL: `OpenCodeHttpClient` → OpenCode headless (createSession → sendMessageAsync → SSE → abort) | OpenCode runtime default (provider discovery; agent config NOT used) | B — OpenCode runtime internal tool loop | OpenCode permission prompts → `OpenCodeEventBridge` → `InMemoryPermissionRegistry` (`/api/opencode/permissions`) | **CANONICAL_RUNTIME_ADAPTER** |
| Agent Task dispatch (local) | `HarnessTaskDispatcher` → `agentHarness.run` | same | CANONICAL | same | B | same | **CANONICAL_RUNTIME_ADAPTER** |
| Agent Task dispatch (worker cluster) | `WorkerCluster` → WorkerNode | pluggable `WorkerExecutor` (default scripted) | REMOTE — not harness/opencode-runtime by default | executor-dependent | D/unknown | executor-dependent | **REMOTE_RUNTIME (PARITY_FAILED default)** |
| Workflow Agent | `WorkflowOrchestrator` → `FallbackTaskDispatcher` (primary worker / fallback harness) | harness (fallback) or WorkerExecutor (primary) | CANONICAL (local fallback) / REMOTE (primary) | runtime default | B / D | OpenCode registry / executor | **CANONICAL_RUNTIME_ADAPTER / REMOTE** |
| Multi-agent workflow | `MultiAgentWorkflowOrchestrator.start` → `this.session.harness` | `OpenCodeRuntimeProvider` | CANONICAL | runtime default | B | OpenCode registry | **CANONICAL_RUNTIME_ADAPTER** |
| Conversation/Chat | `/api/chat`, `/api/conversations` → `DefaultConversationService` → `ProviderExecutor` → `runToolLoop` (`routes/chat.ts:54`) | `OpenCodeProvider.complete`/`stream` (`provider-opencode/index.ts`) | DIRECT GATEWAY: `fetch opencode.ai/zen/v1/chat/completions` | routed provider/model from `ProviderManager` (persisted config, `routes/providers.ts:258`) | A — Vestara `ToolRuntime` (`toolsRuntime.invoke`) | Vestara tool policy (approvals via tool runtime) | **LEGACY_DIRECT_GATEWAY** (tools governed by Vestara) |
| PlanningService | `PlanningService.generatePlan` → `provider.complete` (`planning-service.ts:285`) | `OpenCodeProvider` | DIRECT GATEWAY | persisted/routed provider | D (no tools) | none | **LEGACY_DIRECT_GATEWAY** |
| ExplainService | `ExplainService.explain` → `provider.complete` (`explain-service.ts:257`) | `OpenCodeProvider` | DIRECT GATEWAY | routed | D | none | **LEGACY_DIRECT_GATEWAY** |
| SuggestionService | `provider.complete` (`suggestion-service.ts:420/480/580`) | `OpenCodeProvider` | DIRECT GATEWAY | routed | D | none | **LEGACY_DIRECT_GATEWAY** |
| WorkspaceAnalyst | `provider.complete` (`workspace-analyst.ts:143`) | `OpenCodeProvider` | DIRECT GATEWAY | routed | D | none | **LEGACY_DIRECT_GATEWAY** |
| CLI REPL / commands | `cli-runtime` → `DefaultConversationEngine`/`ProviderRouter` (conversation-runtime) | conversation-runtime providers (`opencode.ts` zen/v1, Gemini, Ollama, openai-compat) | DIRECT GATEWAY (their own HTTP providers) | provider factory/router | D/limited | none | **LEGACY_DIRECT_GATEWAY** |
| Onboarding lab | `ProviderRouter` + `OpenCodeProvider` (conversation-runtime + provider-opencode) | direct gateway | DIRECT GATEWAY | router | D | none | **LEGACY_DIRECT_GATEWAY** |
| knowledge-producer | dynamic `@vestara/conversation-runtime` providers | conversation-runtime providers | DIRECT GATEWAY | factory | D | none | **LEGACY_DIRECT_GATEWAY** |
| Persisted providers (`/api/providers`) | `OpenCodeGoProvider`/`OpenAIProvider`/`OpenCodeProvider` registered into `ProviderManager` | direct gateway | DIRECT GATEWAY | persisted config | D | none | **LEGACY_DIRECT_GATEWAY** |
| PredictionService / DecisionService / ev001 AiProjectPlanner | `provider.complete` | injected AIProvider | not wired in production | n/a | D | none | **UNKNOWN — vestigial (not constructed)** |
| OpenCodeRuntimeService + `/api/opencode/*` | control surface | `OpenCodeHttpClient` (health/providers/agents/sessions/events/permissions) | CANONICAL (control, NON_GENERATIVE) | runtime | n/a | OpenCode permission registry | **CANONICAL_RUNTIME_NATIVE (control)** |
| WorkerNodeRuntime | executor side of a worker node | pluggable `WorkerExecutor` (`VESTARA_WORKER_EXECUTOR`) | REMOTE | executor | executor | executor | **REMOTE_RUNTIME** |

## 3. Agent configuration propagation matrix

| Field | Written by UI | Persisted | Read during execution | Applied to runtime | Evidence/provenance recorded | Status |
|---|---|---|---|---|---|---|
| `id` | yes (modal) | yes (`agents.id`) | yes — identity for execution record + harness thread metadata | yes (thread/execution identity) | execution record agentId | **OPERATIONAL** |
| `name` | yes | yes | yes (messages, disabled-reject text) | no | execution result message | OPERATIONAL |
| `role` | yes | yes | yes — `runtimeSyncedAgents` matches runtime agents by role | no (not passed to runtime session agent) | catalog source | **PARTIALLY_OPERATIONAL** |
| `agentType` | yes | yes | no | no | catalog | **PRESENTATION_ONLY** |
| `runtimeAgent` | yes | yes | yes — runtime-sync merge (`byRuntimeAgent`) | **no** — `new OpenCodeRuntimeProvider()` has no `agent` option, so the native runtime agent is never selected | catalog source | **PARTIALLY_OPERATIONAL** |
| `provider` | yes (modal) | yes | **no** — harness uses `new OpenCodeRuntimeProvider()` with no preferred provider | **no** | none | **DEAD_CONFIGURATION** |
| `model` | yes (modal) | yes | **no** — harness uses `model: 'opencode-runtime'` sentinel; runtime decides | **no** | none | **DEAD_CONFIGURATION** |
| `capabilities` | yes | yes | yes — `AgentCapabilityManager`/`AgentPermissionEngine` (Vestara tool path only) | partial — only if Vestara tools execute (dormant on runtime path) | none | **PARTIALLY_OPERATIONAL** |
| `permissions` | yes | yes | yes — `AgentService.runAgent` gates `repository.read` | yes (gate) | none | OPERATIONAL (limited) |
| `teamId` | yes | yes | no | no | catalog | **PRESENTATION_ONLY** |
| `status` | yes (implicit active) | yes | yes — disabled agents rejected in `runAgent` | yes (gate) | audit on create/run | OPERATIONAL |

## 4. Runtime feature-utilization matrix (canonical consumers)

For `AgentHarnessRuntime` via `OpenCodeRuntimeProvider`:

| Runtime capability | Used? | Detail |
|---|---|---|
| Session creation | yes | per-turn `createSession` (fresh, no shared history) |
| Provider discovery | yes | `discoverProviders` (30s cache) |
| Model discovery | partial | synthesizes one `AIModel` per provider id — not real model lists |
| Runtime event stream | yes | `openEventStream` (SSE) consumed internally until `session.idle` |
| Token/message streaming | **no** | stream consumed inside provider; UI gets harness *event* telemetry, not generation tokens |
| Cancellation | **no (mid-run)** | `abortSession` only in `finally`; no external abort hook into `complete` |
| Permission events | no (from provider) | handled separately by `/api/opencode` route `OpenCodeEventBridge` → registry |
| Session state | partial | terminal `idle` only |
| Execution/session provenance | partial | returns resolved provider/model id; session id not propagated to agent execution record |
| Runtime errors | partial | provider throws → agent run fails; no structured runtime error codes surfaced |
| Runtime retry/recovery | no | none in provider; retries live at orchestrator/harness level |

**`uses opencode-runtime`: yes. Fully integrates lifecycle features: no.**

## 5. Worker parity analysis

- `WorkerNodeRuntime` (`packages/workflow-orchestrator/src/distributed/worker-node.ts`) executes a pluggable `WorkerExecutor` (`dispatch`/`review`/`test`).
- Production bootstrap (`apps/api/src/worker/worker-node-bootstrap.ts:32`): default executor returns a **scripted result**; a custom executor module can be injected via `VESTARA_WORKER_EXECUTOR`.
- A remote task therefore reaches generation **only if the injected executor does**. There is no default path to `AgentHarnessRuntime → OpenCodeRuntimeProvider → opencode-runtime` on worker nodes.
- Classification: **PARITY_FAILED** by default (divergent); an executor could restore parity but that is an external plugin contract, unverified.

## 6. Tool-governance matrix

| Generative path | Tool loop | Governance boundary |
|---|---|---|
| Agent harness (runtime provider) | **B** — OpenCode runtime internal tool loop | OpenCode permission prompts → `OpenCodeEventBridge` → `InMemoryPermissionRegistry` → user approve/reject (`/api/opencode/permissions`, audited) — NOT Vestara capability/approval policy |
| Chat / `runToolLoop` | **A** — Vestara `ToolRuntime` (`toolsRuntime.invoke`) | Vestara tool policy + approvals |
| Planning / Explain / Suggest / Analyst | **D** — no tools | none |
| conversation-runtime (CLI/onboarding) | **C/D** — provider-native or none | provider-specific |
| WorkerNode | **D/unknown** — executor-dependent | executor |

**Finding: the policy inconsistency is platform-wide, not Agent-specific.** Only
Chat enforces Vestara tool policy; the Agent runtime path relies on OpenCode's
own permission bridge (a different policy system).

## 7. Legacy integration inventory

- `OpenCodeProvider` (`provider-opencode/index.ts`) — direct gateway; used by
  Conversation, Planning, Explain, Suggest, Analyst, CLI, onboarding, provider
  registry.
- `conversation-runtime` providers (`opencode.ts` zen/v1, Gemini, Ollama,
  openai-compat, `OpenCodeCloudProvider` wrapping `provider-opencode`) — CLI,
  onboarding-lab, knowledge-producer.
- `OpenCodeGoProvider` / `OpenAIProvider` (direct gateway) — `/api/providers`.

## 8. Dead / vestigial provider fields and services

- `OpenCodeRuntime` class (`opencode-runtime/src/runtime/opencode-runtime.ts`) —
  **unused** in production (no construction outside the package).
- `PredictionService`, `DecisionService`, `ev001/ai-project-planner` — defined,
  take an `AIProvider`, **never constructed** in production wiring.
- `AgentRuntime.provider` field — vestigial (run goes through `harnessSession`,
  not `this.provider`).
- `AgentHarnessRuntime` `model: 'opencode-runtime'` — sentinel, ignored by the
  runtime provider.
- Agent `provider`, `model`, `agentType`, `teamId`, and `runtimeAgent`
  (runtime-session selection) — persisted but **not applied to generation**.

## 9. Prioritized findings

**P0 — Agent execution correctness / governance**
- Runtime-driven generation runs OpenCode's internal tool loop; Vestara
  capability/approval policy is **not** in the loop. AC-TST-008 and the
  platform trust model require a decision (govern OpenCode permission prompts
  against Vestara policy, or route tools through Vestara).
- `runtimeAgent` is never selected on the runtime session — Agent Control cannot
  actually choose which OpenCode native agent performs generation.

**P1 — Agent configuration does not control actual runtime**
- Agent `provider` / `model` are saved but **ignored** during generation
  (`DEAD_CONFIGURATION`). Blocks AC-TST-005/025 attribution and any provider
  switching semantics.
- No mid-run cancellation of runtime sessions; no provenance (session id) on
  execution records.

**P2 — Legacy generation integrations**
- Conversation/Planning/Explain/Suggest/Analyst + CLI + onboarding generate via
  the direct gateway, bypassing `opencode-runtime`. Duplicated integration and
  duplicated provider/model resolution.
- conversation-runtime provider stack is a second parallel provider system.

**P3 — Consolidation / cleanup**
- `OpenCodeRuntime` class unused; PredictionService/DecisionService/AiProjectPlanner
  unwired; `AgentRuntime.provider` vestigial; `model` sentinel; duplicate
  provider discovery (`OpenCodeRuntimeProvider` + `OpenCodeRuntimeService`).

## Recommended migration order (NOT implemented)

1. **Decide the tool-governance model** (P0) — evaluate OpenCode runtime
   permission prompts against Vestara capability/approval policy in the bridge,
   or route runtime tool calls through Vestara `ToolRuntime`.
2. **Make Agent configuration operational** (P1) — pass `provider`/`model`/`
   runtimeAgent` into the runtime session (`OpenCodeRuntimeProvider` options or a
   per-session model/provider selection); record session + resolved provider/model
   provenance on execution records.
3. **Promote `OpenCodeRuntime` (or a thin runtime service) to the generation
   boundary** (P0/P2) — move session/generation/stream/cancel into
   `opencode-runtime`; keep `OpenCodeRuntimeProvider` as the `AIProvider`
   adapter; converge `OpenCodeRuntimeService` onto it.
4. **Migrate direct-gateway consumers** (Planning/Explain/Suggest/Analyst/CLI/
   conversation) onto the runtime boundary or document them as a deliberate
   gateway-only tier (P2).
5. **Resolve worker parity** — decide whether remote executors must host the
   harness/runtime boundary or remain a documented extension contract (P2).

Preserved: Agent, Task, Workflow, Evidence, Verification contracts.

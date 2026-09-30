# AGENT-CORE-001 — Canonical Agent Ownership Audit

> Status: COMPLETE — Tasks 01–06 evidenced. AGENT-CORE-001 closed as audit/synthesis; successor design NOT started.
> Discipline: zero-mutation, read-only inspection. No refactor/rename/move/delete/migration/UI/stage/commit.
> Labels: PROVEN = directly observed in source; INFERRED = reasoned but not directly observed; MISSING = no authority found.
> Authority classes (per audit discipline): DECLARED / AUTHORITATIVE / DERIVED / DUPLICATE / LEGACY / MISSING.
> Rule: KEEP/ADAPT/MOVE/REMOVE follows evidence of actual ownership, never package placement alone.
> Chain traced where practical: contract → creation → persistence → mutation → consumption → runtime effect.

## 1. Executive findings (Task 01 scope only)

1. PROVEN: `@vestara/agent-types` is DECLARED-only. It declares `AgentDefinition`, `AgentRole` (28), `AgentCapability` (42, closed), `RoutingRole`, `PerformanceRole` — but has zero runtime importers, zero dependents in `packages/workspace/package.json`, and is never imported by the effective path. It does not control production behavior.
2. PROVEN: Effective Definition authority is split three ways: (a) `CANONICAL_AGENTS` code array = creation authority for 7 system agents; (b) `AgentStorage` SQLite `agents` table in `plans.db` = persistence authority for identity/provider/model/status/capabilities; (c) `rowToAgent()` in-memory overlay = DERIVED runtime projection for `mode`/`opencodePermissions`/`runtimeAgent` backfill. No single component owns the full Definition end-to-end.
3. PROVEN: `packages/workspace/src/types.ts` carries DUPLICATE contracts: `AgentRole` (29 values, incl. `assistant` not in agent-types), `AgentCapability` (with `(string & {})` escape hatch agent-types deliberately removed), `AgentPermission`, `AgentDefinition` (superset with `origin`/`runtimeAgent`/`mode`/`opencodePermissions`), `CanonicalAgent`. Workspace never imports `@vestara/agent-types`. The duplicate is AUTHORITATIVE in practice.
4. PROVEN: Instructions (`opencodePrompt`) and runtime policy (`opencodePermissions`, `mode`, `runtimeAgent`) are NOT persisted. `agents` table has no columns for them (see `agent-migrations.ts` v1/v2/v3 + `POST_PLANS` origin column). They live in `CANONICAL_AGENTS` code and are overlaid per-read by `rowToAgent()` (agent-storage.ts:409-425) or rendered straight from code by `/api/agents/sync` + `scripts/agents-sync.mjs` (which imports `CANONICAL_AGENTS`, not DB rows). DB is authority for identity/binding; code is authority for prompt/policy.
5. PROVEN: Mutation bypasses declared contracts: `PUT /api/agents/:id` (`apps/api/src/routes/agents.ts:188-236`) does `saveAgent({...existing, ...cleanBody})` with no catalog/role/capability/provider validation; `updateAgentModel`/`updateAgentStatus` write free-form strings. Runtime effect is direct: `resolveAgentExecutionFor` (workspace-context.ts:1863-1897) returns `agent.model` verbatim when truthy, bypassing routing policy entirely.
6. INFERRED (needs Task 03/04 confirmation): provider/model coupling embedded in Definition rows is the de-facto routing authority for harness turns, competing with `FileRoutingStore` role selections. Not yet fully traced — recorded here, proven in Task 03.

Remaining: §18 full matrix, §20 canonical boundary (Task 06). §§2–17 evidenced in Tasks 01–05 below.

## 2. Current architecture map (Task 01 partial)

```
@vestara/agent-types (DECLARED leaf, zero deps, zero importers)
  AgentDefinition / AgentRole(28) / AgentCapability(42 closed) / RoutingRole / PerformanceRole
  ── ✕ no edge to runtime (PROVEN: no imports, no package.json dep) ──

packages/workspace/src/agents.registry.ts:100 CANONICAL_AGENTS (AUTHORITATIVE creation for system agents)
  │ 7 rows: agent-context|developer|planner|reviewer|verifier (workspace) + assistant (registry) + browser (workspace)
  │ each: id/name/role/agentType/origin=system/description/capabilities/permissions/provider=model=opencode-go/muse-spark-1.3…/color/status + runtimeAgent/mode/opencodePermissions/opencodePrompt (code-only)
  ├─→ AgentStorage.reconcileCanonical()/saveAgentSync (agent-storage.ts:55-117) → plans.db agents table (persistence)
  ├─→ scripts/agents-sync.mjs:21 (imports CANONICAL_AGENTS from dist) → .opencode/agents/*.md (7 files observed)
  └─→ POST /api/agents/sync (routes/agents.ts:381-416, renders from CANONICAL_AGENTS, NOT from DB) → .opencode/agents/*.md

packages/workspace/src/types.ts:456-641 (DUPLICATE but AUTHORITATIVE in practice)
  AgentRole(29) / AgentCapability(+string&) / AgentPermission / AgentDefinition(superset) / CanonicalAgent(+mode+opencodePermissions+opencodePrompt)

AgentStorage (packages/workspace/src/agent-storage.ts:37-567) — persistence + DERIVED projection
  agents table cols: id,name,role,agent_type,origin,description,capabilities,permissions,provider,model,runtime_agent,team_id,color,status,created_at
  NO cols: mode, opencodePermissions, opencodePrompt (PROVEN via agent-migrations.ts:33-46 v1 cols + v2 agent_type + v3 runtime_agent)
  rowToAgent() (391-425): overlays CANONICAL_AGENTS.mode/opencodePermissions/runtimeAgent onto system rows per read; user rows pass through fail-closed
  reconcileCanonical() (55-86): inserts missing canonicals, backfills origin=system + runtime_agent, deletes DROPPED_BUILT_IN_AGENT_IDS (14 ids, agents.registry.ts:520-535)

API mutation surface (apps/api/src/routes/agents.ts)
  POST /api/agents (111-159): creates user agents, free-form role/capabilities/provider/model (defaults role=custom, provider=model='')
  PUT /api/agents/:id (188-236): INSERT OR REPLACE any field except id/createdAt; system-identity guard only (origin=system blocks id change; name non-empty check); NO validation vs agent-types vocabularies
  DELETE (238-256) + AgentStorage.deleteAgent (156-162): system agents undeletable (403/throw); user deletable
  GET /api/agents (87-110): stored rows + runtimeSyncedAgents overlay (listAgents twin match by runtimeAgent|role) + agentService stats; runtime unreachable → stored catalog unchanged
  POST /api/agents/:id/run (278-307): agentService.runAgent → harness via OpenCode runtime (engine=opencode-runtime)

Consumption → runtime effect (Task 01 slice; full call graph in Task 04/06)
  harness turns: resolveAgentExecutionFor (workspace-context.ts:1863-1897): match stored by id|runtimeAgent|role → if agent.model truthy return {providerId,modelId,runtimeAgent} VERBATIM (policy bypass); else FileRoutingStore role selection; else harness default
  conversation turns: resolveConversationPersona (agent-persona-resolver.ts:30-75): getAgent(id) → require runtimeAgent+opencodePermissions else REJECT (fail-closed); generic agent-assistant → vestara-assistant default policy
  generated runtime: .opencode/agents/vestara-*.md frontmatter (mode/model/permission:) + body=opencodePrompt (observed vestara-planner.md:1-16)
```

## 3. Runtime call graph — Task 04 evidence (execution paths; routing §9)

```
HARNESS: AgentRuntime.run → storage.createExecution(queued) → HarnessExecutionAdapter.execute
  → harness.createThread{metadata.agentId} → createForRun → harness.run({threadId,instruction,agentId})
  → continueTurn: resolveExecutionOverride → context.assemble → provider.complete({model: executionModel(), messages, tools, agent, title, runtimeSessionId})
  → tool loop → verifyAndFinish → finish(state) → syncFromReplay → ExecutionSession
  → storage.updateExecutionStatus(running→completed|failed)
CONVERSATION: sendMessage → DefaultConversationService → ProviderExecutor(OpenCode|Codex)
  → runAssistantOpenCodeTurn: resolveTurnPersona + resolveProviderModel + sessionRegistry.acquire → sendMessageAsync{parts,agent,model?,system?,tools?} → /event stream → chunks → persisted response
  → OpenCodeAdapter(proof-only, NO production callers): execute(request,binding) → createSession + sendMessageAsync + observation stream (DECLARED boundary)
WORKFLOW: stage spec → instructionForStage → harness.run (same harness path; static agentId, no routing)
PARTICIPANT: harness/agent events --EventBus--> agent-lifecycle-bridge (harness.* → agent:started/completed + model resolve) --ingest--> M9 --project--> M10 ParticipantProjection{agent-*, membership/presence/workState} --serve--> M11A/M11B --> UI
```
Full per-path detail in §§9–12. OpenCode session reuse: conversation-registry keyed by conversationId (in-memory + persisted runtime_session_id adoption w/ liveness probe); harness via environment.runtimeSessionId (M7 passthrough).

## 4. Contract inventory (Task 01 — with declared-vs-effective classification)

| Symbol | Declared in | Effective classification | Creation | Persistence | Mutation | Consumption → runtime effect | Evidence |
|---|---|---|---|---|---|---|---|
| `AgentDefinition` | `packages/agent-types/src/agent-definition.ts:38-52` (id,name,role,agentType,description?,capabilities,permissions,provider?,model?,teamId?,color?,status,createdAt) | DECLARED (canonical-claimed, zero effect) | — (type only, no factory) | None | None | Zero importers (PROVEN: grep `@vestara/agent-types` hits only docs/self; `packages/workspace/package.json` has no dep) | agent-definition.ts:1-52; agent-types/package.json:12 `dependencies:{}`; workspace package.json deps list (no agent-types) |
| `AgentDefinition` | `packages/workspace/src/types.ts:607-629` (+origin?,runtimeAgent?,mode?,opencodePermissions?) | DUPLICATE + AUTHORITATIVE (effective Definition contract) | `CANONICAL_AGENTS` literals (agents.registry.ts:100-513); `POST /api/agents` (routes/agents.ts:130-151) | `agents` table via `saveAgent`/`saveAgentSync` (agent-storage.ts:93-143) | `PUT /api/agents/:id` merge+REPLACE (routes/agents.ts:213-220); `updateAgentStatus`/`updateAgentModel` (agent-storage.ts:164-170); `reconcileCanonical` backfill (55-86) | `listAgents`/`getAgent` → `resolveAgentExecutionFor`, `resolveConversationPersona`, UI, bridges | types.ts:607-629; agent-storage.ts:119-153; routes/agents.ts:188-236 |
| `CanonicalAgent` | `packages/workspace/src/types.ts:636-641` (mode+opencodePermissions required, opencodePrompt) | AUTHORITATIVE (system-agent runtime persona contract) | `CANONICAL_AGENTS` array only | NOT persisted (no columns; overlaid per-read) | Code edit only (+PUT can inject ad-hoc fields into user rows, unvalidated) | `renderAgentMd` + `/api/agents/sync` + `agents-sync.mjs` → `.opencode/agents/*.md`; `resolveConversationPersona` requires runtimeAgent+grants | types.ts:631-641; agent-storage.ts:409-425 comment; routes/agents.ts:11-47,381-416; agents-sync.mjs:21,74 |
| `AgentRole` | `packages/agent-types/src/agent-role.ts:21-49` (28, closed, no escape) | DECLARED | — | None | `role-compat.ts` pure mappers only | None observed | agent-role.ts:1-86 |
| `AgentRole` | `packages/workspace/src/types.ts:456-485` (29: +`assistant`) | DUPLICATE + AUTHORITATIVE | Code literal; `POST` default `custom` | `agents.role` TEXT col | `PUT` free-form | `resolveAgentExecutionFor` role match; `normalizeRoutingRole` | types.ts:456-485 |
| `AgentCapability` (qualification labels) | `packages/agent-types/src/agent-capability.ts:19-61` (42, closed, `isAgentCapability` guard) | DECLARED | — | None | None | None observed | agent-capability.ts:1-158 |
| `AgentCapability` | `packages/workspace/src/types.ts:514-557` (same 42 + `(string & {})`) | DUPLICATE + AUTHORITATIVE (stored vocabulary) | `CANONICAL_AGENTS.capabilities`; `POST` body | `agents.capabilities` JSON TEXT | `PUT` free-form | `rowToAgent` passthrough; UI display; (execution gating unproven — Task 02) | types.ts:514-557 |
| `AgentCapabilityName` (filesystem ops, 12) | `packages/workspace/src/agent-capability.ts:17-29` + `agent-capability-manager.ts:32-45` permission map + `capabilityDefinitions()` risk table | AUTHORITATIVE (executable capability boundary) | Code constants | None (stateless gate) | Code edit only | `AgentCapabilityManager` → `FilesystemRuntime` → observation (full trace Task 02/D) | agent-capability.ts:1-70; agent-capability-manager.ts:1-45 |
| `RoutingRole` (6) + `PerformanceRole` (6) | `packages/agent-types/src/role-compat.ts:33-58` + mappers `mapAgentRoleToRoutingRole`/`routingRoleToAgentRole`/`normalizeLegacyRole` | DECLARED (mappers pure, deterministic, no callers found in Task 01 slice) | — | None | None | Claimed owner CORE-002; comment says do NOT move to routing-types (role-compat.ts:29-32). Callers MISSING in Task 01 scope — Task 03 to confirm | role-compat.ts:1-179 |
| `AgentPermission` (resource×action+approvalRequired) | agent-types `agent-definition.ts:24-28` AND workspace `types.ts:559-563` (identical) | DECLARED (agent-types) / DUPLICATE+AUTHORITATIVE (workspace copy actually stored) | `CANONICAL_AGENTS.permissions` | `agents.permissions` JSON TEXT | `PUT` free-form | `AgentCapabilityManager` gate (repository read/modify) + `AgentPermissionEngine` (Task F/06 detail) | both files; agent-capability-manager.ts:27-45 |
| `OpenCodePermissions` / `OpenCodePermissionGrant` | `packages/workspace/src/types.ts:565-593` (ask/allow/deny per tool) | AUTHORITATIVE (runtime grant vocabulary) | `FULL/READONLY/INSPECT/ASSISTANT_GRANT` consts (agents.registry.ts:6-67) | NOT persisted (no columns) | Code edit; per-read overlay | Rendered into `.md` frontmatter; `resolveConversationPersona` → `createPolicyForAgent` turn policy | types.ts:577-593; agents.registry.ts:6-67; agent-persona-resolver.ts:72-74 |
| `AgentMode` | agent-types `agent-definition.ts:16` AND workspace `types.ts:596` (identical `primary\|subagent\|all`) | DECLARED / DUPLICATE+AUTHORITATIVE (workspace copy used) | `CANONICAL_AGENTS.mode` | NOT persisted | Code edit | `.md` frontmatter `mode:`; subagent-vs-primary dispatch (Task 04) | both files |
| `AgentType` (`workspace\|registry`) | agent-types `:13` AND workspace `:598` | DECLARED / DUPLICATE+AUTHORITATIVE | Registry literals (assistant=registry, rest=workspace) | `agents.agent_type` (v2 col) | `PUT` free-form | Observed: no behavioral branch found in Task 01 slice — MISSING effect (flag for Task 06) | agent-migrations.ts:42 |
| `AgentOrigin` (`system\|user`) | `packages/workspace/src/types.ts:605` only (no agent-types counterpart) | AUTHORITATIVE (ownership guard) | `CANONICAL_AGENTS.origin=system`; POST default `user` | `agents.origin` (POST_PLANS migration, not v1-v3) | `reconcileCanonical` user→system backfill; system delete/identity-change blocked | `deleteAgent` throw; API 403/400 guards | types.ts:600-605; agent-storage.ts:55-86,156-162; routes/agents.ts:200-248 |
| Agent identity/IDs | `agent-context|developer|planner|reviewer|verifier|assistant|browser` (registry ids) + `vestara-*` runtimeAgent twins + `DROPPED_*` (14 retired ids) | AUTHORITATIVE (registry ids + runtimeAgent mapping) | Registry literals; `agent-${Date.now()}` for POST | `agents.id` PK | Immutable in practice (PUT `id` forced; system id-change 400) | Triple-match `id\|runtimeAgent\|role` in resolvers (workspace-context.ts:1869-1874; index.ts:124) | agents.registry.ts:100-535; routes/agents.ts:124,202-217 |
| Agent status/state | `status: active\|disabled` in both Definition contracts | AUTHORITATIVE (definition enablement) | Registry `active`; POST `active` | `agents.status` | `updateAgentStatus`; PUT | Read back verbatim; enforcement point NOT found in Task 01 slice — MISSING (flag: who blocks disabled agents?) | agent-storage.ts:164-166 |
| Agent metadata/config | description/teamId/color/createdAt (+`BUILT_IN_CREATED_AT` deterministic `2026-08-12`) | AUTHORITATIVE (stored) | Registry literals; POST body | Columns per row | `PUT` merge | UI display; `listAgents ORDER BY created_at ASC` | agents.registry.ts:4,100-513; agent-storage.ts:145-153 |
| Agent registry | `CANONICAL_AGENTS` (code) + `AgentStorage` (persistence) + `scripts/agents-sync.mjs` + `POST /api/agents/sync` (renderers) | AUTHORITATIVE (split: code=creation/prompt/policy; DB=identity/binding/state) | See rows above | `plans.db agents` | See rows above | See consumption column; `.opencode/agents/` 7 files observed live | agents.registry.ts:88-99 comment; agents-sync.mjs:21-147; routes/agents.ts:381-416 |
| Agent persistence | `agents` table (cols listed §2) via `@vestara/sqlite-migrations` chain (`agent-migrations.ts` v1+v2+v3+origin) | AUTHORITATIVE (durable Definition state, minus prompt/policy/mode) | Migrations (entrypoint composition roots, NOT storage ctor) | `plans.db` (shared; also agent_executions/teams/schedules/memory/execution_sessions tables) | `INSERT OR REPLACE` everywhere (no partial-update path) | `rowToAgent` deserialization (JSON.parse capabilities/permissions) | agent-migrations.ts:19-46; agent-storage.ts:40-46 comment |
| Competing `CanonicalAgent` UIs/docs | `apps/workspace/src/pages/activity/AgentProjectionDrawer.tsx:46-59` (local 12-field interface, `role:string`, caps `string[]`) + `docs/blueprint/VESTARA-INTELLIGENCE-GA4-PREFLIGHT.md:117`, `docs/PCS-007-agent-runtime.md:41` | DUPLICATE (UI-local, untyped) / LEGACY-or-doc (blueprint snapshots — not compiled) | UI hand-copy (comment claims values from workspace types but type import blocked by boundary) | None (fetches `/api/agents/:id`) | Draft editing → PUT | PUT passthrough; `ALL_ROLES` 28-literal copy (Drawer:84-91, missing `assistant` vs DB's 29) | AgentProjectionDrawer.tsx:46-93 |
| `AgentSkillName`/`AgentSkill` | `packages/workspace/src/types.ts:487-512` (20 skills w/ proficiency) | DECLARED-or-DEAD (no storage column, no manager, no consumers found in Task 01 slice) | — | None (no skill columns/tables) | — | MISSING consumers — flag for Task 02/D (Skill authority unproven) | types.ts:487-512 |

## 5. Persistence ownership (Task 01 slice)

- AUTHORITATIVE durable store: `plans.db` `agents` table — columns `id,name,role,agent_type,origin,description,capabilities,permissions,provider,model,runtime_agent,team_id,color,status,created_at` (agent-storage.ts:93-143; migrations v1/v2/v3+origin). Evolution owned by `@vestara/sqlite-migrations` chain executed at entrypoint composition roots (API `openSqlDb`, CLI `openSharedDb`); `AgentStorage` ctor does NOT migrate (agent-storage.ts:40-46).
- NOT persisted (code-authoritative, memory-overlaid): `mode`, `opencodePermissions`, `opencodePrompt` — no columns; `rowToAgent()` overlays from `CANONICAL_AGENTS` per read (agent-storage.ts:409-425, comment states design intent explicitly: "DB remains authority for identity, provider/model binding, status, color, capabilities").
- Creation paths: system = `CANONICAL_AGENTS` → `reconcileCanonical`/`saveAgentSync` (deterministic, idempotent, `VESTARA_DISABLE_AGENT_SEED=1` kill-switch); user = `POST /api/agents` → `saveAgent`; dropped = `DROPPED_BUILT_IN_AGENT_IDS` delete-where-system.
- Mutation paths: `PUT` full-row REPLACE (unvalidated merge), `updateAgentStatus`, `updateAgentModel`, `reconcileCanonical` backfills. All `INSERT OR REPLACE` — no field-level guards except system-identity/delete protections.
- DERIVED artifacts (not authorities): `.opencode/agents/*.md` (rendered from code by both renderers — note `/api/agents/sync` renders `CANONICAL_AGENTS`, ignoring DB edits, so POST/PUT provider/model changes do NOT reach generated `.md` via that endpoint; `agents-sync.mjs` likewise reads registry dist), `GET /api/agents` runtime-twin annotation (ephemeral spread, not written back).

## 6. Agent Definition analysis (Task 01: owns vs references)

| Field (B checklist) | Declared (agent-types) | Effective (workspace row) | Verdict |
|---|---|---|---|
| identity (id/name) | owns (required) | AUTHORITATIVE in DB; immutable in practice | Definition OWNS identity — PROVEN |
| role | owns (`AgentRole` 28) | DB stores free-form TEXT; workspace vocab 29 (+assistant); UI copy 28 (missing assistant) — three divergent vocabs in production | References a vocabulary it does not enforce — DUPLICATE vocabularies, no validation — PROVEN |
| description | owns (optional) | Stored verbatim; rendered to `.md` frontmatter | OWNS — PROVEN |
| instructions (`opencodePrompt`) | explicitly EXCLUDED by design (agent-definition.ts:4-7,34-36) | Code-owned (`CANONICAL_AGENTS`), never persisted, rendered to `.md` body | Definition does NOT own; CanonicalAgent/system layer owns — PROVEN separation (correct per file comment) |
| capabilities (qualification labels) | owns (42 closed) | Stored JSON; workspace copy widens with `string&{}`; execution gating unproven in Task 01 | OWNS storage; AUTHORITY over behavior MISSING/pending Task 02 — PROVEN split |
| tools (filesystem ops) | not present (correctly absent) | Separate `AgentCapabilityName` + manager gate | Definition REFERENCES via permissions map, does not own tools — PROVEN (detail Task 02) |
| skills | not present | `AgentSkillName` declared, no persistence/consumers found | MISSING authority — PROVEN gap in Task 01 slice |
| routing requirements | not present | No routing-requirements field on either Definition; routing resolved externally (agent row vs FileRoutingStore — Task 03) | MISSING from Definition — PROVEN (belongs elsewhere or MISSING entirely) |
| provider/model | owns as optional `provider?/model?` strings | DB-stored; harness resolver treats non-empty as verbatim override bypassing policy | EMBEDDED machine-specific runtime state in Definition — belongs to routing/runtime assignment per target model; current source truth = Definition row wins — PROVEN |
| context policy | not present | MISSING in Task 01 slice | MISSING or Task 02/03 — recorded |
| permission policy | owns `AgentPermission[]` (agent-side declaration; "runtime enforcement is separate" per agent-definition.ts:19-23) | Stored JSON + separate `opencodePermissions` runtime grants (code-owned, unpersisted) | SPLIT by design: declaration in Definition, enforcement in runtime grants — PROVEN; whether split is correct = Task F |
| runtime policy (mode/grants/twin) | excluded by design | Code-owned, unpersisted, overlaid | NOT owned by persisted Definition — PROVEN |
| resource limits | not present | MISSING in Task 01 slice | MISSING or later task — recorded |
| metadata/versioning (color/team/createdAt) | owns color/teamId?/createdAt | Stored; `BUILT_IN_CREATED_AT` deterministic | OWNS — PROVEN; no version field exists (no `version` on either contract) — MISSING versioning PROVEN |
| enabled/disabled | owns `status` | Stored; enforcement point not found | OWNS state; AUTHORITY over effect MISSING in slice — PROVEN gap |

Embedded-but-belonging-elsewhere (PROVEN, Task 01): `provider`/`model` (runtime assignment), `runtimeAgent` (adapter twin address), `opencodePermissions`/`opencodePrompt`/`mode` (runtime persona — correctly kept out of persisted row but still inside the `CanonicalAgent` code object, i.e. code couples Definition+runtime in one literal).

## 7–17. EVIDENCED (Tasks 02–05) — see §§7–8 (Task 02), §§9–10 (Task 03), §§11–12 (Task 04), §§13–17 (Task 05) below

### §7. Instructions analysis — Task 02 evidence (PROVEN unless noted)

Authority chain (creation → persistence/source → transformation → assembly → runtime consumption):

1. Creation (AUTHORITATIVE): `CANONICAL_AGENTS[].opencodePrompt` (`packages/workspace/src/agents.registry.ts:123,202,251,300,355,429,485` — string arrays joined with `\n`, each embedding the `UI_UX_GOVERNANCE` footer `:77-86`). No other persistent instruction store exists — `agents` table has no prompt column (Task 01 §5), `AgentDefinition` in agent-types explicitly excludes prompts (`agent-definition.ts:4-7`).
2. Transformation Vestara→OpenCode (AUTHORITATIVE renderers, unidirectional PROVEN):
   - `scripts/agents-sync.mjs:23-60 renderMd()` reads `CANONICAL_AGENTS` by transpiling the registry TS in-memory (`:15-21`, no DB read) → writes `.opencode/agents/<runtimeAgent>.md` into TWO repos (vestara-ai-core + root, `:98-101,129-131`) + strips any hand-maintained `agent:` block from both `opencode.json` files (`syncOpencodeJson :107-121`). `--check` mode fails CI on drift (`:62-96,136-146`).
   - `POST /api/agents/sync` (`apps/api/src/routes/agents.ts:11-47 renderAgentMd + 381-416`) renders from imported `CANONICAL_AGENTS` (line 4 import, line 390 loop) — NOT from `AgentStorage` rows. Frontmatter: `description/mode/model: opencode/<model>/permission:` + body `opencodePrompt.trim()`.
   - No reverse reader exists in runtime source: no `readFile` of `.opencode/agents` in `packages/*/src` or `apps/api/src` (grep PROVEN: only writers + `listAgents()` runtime discovery + docs references). `INSTRUCTIONS.md:10` + `AGENTS.md:66` + `UNIFIED-AGENT-PLATFORM.md:74` all state "generated, never hand-edited".
   - Verdict: `.opencode/agents/*.md` = DERIVED generated materialization (not authoritative, not duplicate authority, not ambiguous). Sync direction = Vestara → OpenCode ONLY. OpenCode → Vestara does not exist.
3. OpenCode-side consumption (AUTHORITATIVE runtime read): OpenCode server reads `.md` files at session time from the request `directory` (PROVEN by defect archaeology: `VESTARA-INTELLIGENCE-RUN-BINDING-AUDIT.md:58-221` — missing `directory` ⇒ fallback to default `Build` agent; `M7-REPOSITORY-DIRECTORY-DEFECT.md:98-110`; `runtime-provider.ts:47-48` "directory required for OpenCode to resolve agent definitions"). OpenCode owns native agent loading; Vestara owns the file content upstream.
4. Execution-time instruction layering (AUTHORITATIVE, separate from `.md`):
   - Persistent role behavior = `.md` body already loaded server-side by `agent:` name reference — Vestara turns NEVER re-send `opencodePrompt` text. Harness `provider.complete({agent: executionOverride?.runtimeAgent || active.agentId, ...})` (`agent-harness/src/index.ts:642-658`) and conversation `sendMessage{agent: config.agent}` (`conversation-runtime/src/provider/opencode.ts:122-126,177-181`) and assistant `sendMessageAsync{agent: turnPersona.runtimeAgent}` (`assistant-opencode-adapter.ts:693-700`) all pass the twin NAME only. RoleInstruction carries reference, never text — conformance contract `@vestara/execution-types` `instruction.ts:1-57` (`RoleInstructionRef{agentId,role}` + `isDeltaOnlyEnvelope` guard `:150-161`).
   - Per-turn delta = execution/task instruction: harness `run({threadId, instruction, agentId})` (`harness-session.ts:305-310`; `multi-agent-workflow.ts:499-504` stage instruction = acceptance-boundary + stage spec + prior output as non-authoritative context `:512-525`); `AgentRuntime.run → HarnessExecutionAdapter.execute({agentId, instruction: task, goal: task})` (`agent-runtime.ts:71-97`); stored as harness `user-message` item (`agent-harness/index.ts:376-380`) → assembled into provider `messages[]` (`:999-1013`: system=assembled context, then user/assistant/tool deltas).
   - Runtime/system instructions (turn-scoped, NOT Definition): assistant `system:` field = `buildSurfaceSystem()` bounded app-context block only (`assistant-opencode-adapter.ts:467-491,606-608,704-708` — "trusted turn-time surface context… never repository/execution authority"); per-turn `tools:` map from resolved persona policy (`:607,709-714`); `model:{providerId,modelId}` binding rides the prompt (`:700-703`). Harness system = `context.assemble({thread,turn,replay,environment})` (`agent-harness/index.ts:624-629`) + compacted summary (`messages()` `:999-1013`).
   - Human/user instructions: harness `user-message`/`steering-message` items → `messages[]` role=user (`:1004-1007`); assistant `lastUserText(request.messages)` (`:542`) submitted as `parts:[{type:text}]` (`:693-696`); conversation `lastUserText` likewise (`conversation-runtime/provider/opencode.ts:105-113`).
   - Workflow instructions: `MultiAgentStageSpec.instruction` templates (`multi-agent-workflow.ts:40-266`) composed per stage with goal suffix (`:328,342`) + acceptance boundary prepend (`:512-525`).
   - Generated context: understanding/context assemblers (`understanding-context-assembler.ts:31-32`, `workspace-context-provider.ts:53-54` system-prompt builders) feed harness `context.assemble`, NOT the Definition.
   - Final OpenCode consumption: `POST /session/:id/prompt_async {parts, agent, model?, system?, tools?}` (`opencode-http-client.ts:328-355`); alternative harness path uses provider `complete({model, messages, tools, agent, title, runtimeSessionId})` (`agent-harness/index.ts:642-658`) via `OpenCodeRuntimeProvider` (creates session, sends prompt async, streams `/event` till idle — `providers/opencode/runtime-provider.ts:1-20`).
5. Conversation persistence (AUTHORITATIVE, not instruction authority): human message persisted before turn, assistant response after, via Activity pipeline (`assistant-turn.ts:22-28` invariants: human survives provider failure, no fabricated success); harness turns persist `user-message/model-response/tool-result/agent-message` thread items (`agent-harness/index.ts:1031-1048 append()`), outcome via `finish()` (`:1063-1082`).
6. Split-brain answer (PROVEN): BOTH paths reach the model with SEPARATE boundaries and NO merge:
   - Path A (persona/behavior): `CANONICAL_AGENTS.opencodePrompt+opencodePermissions+mode` → `.md` files → OpenCode server-side agent load keyed by `agent:` name. Affects system prompt, server-side permission defaults, model default (`model: opencode/...` frontmatter). DB edits NEVER reach this path (`/api/agents/sync` ignores DB). Conflict semantics: code wins absolutely; operator PUTs to provider/model are invisible to Path A.
   - Path B (binding/policy): `AgentStorage` row → `getAgent/listAgents` → per-turn resolvers (`resolveAgentExecutionFor` harness model override; `resolveConversationPersona` runtimeAgent+grants→`createPolicyForAgent`→`buildToolsMap`→`tools:` map + `model:` override). Affects which twin name is addressed, per-turn tool availability, and explicit model selection. Code `.md` permission frontmatter does NOT constrain Path B (Vestara re-evaluates via `evaluatePermission` + interaction broker).
   - Overlap point: the `agent:` NAME string. Path A defines what that name DOES server-side; Path B decides which name is INVOKED per turn. A renamed/deleted twin breaks Path B silently (no validation observed); a DB provider/model edit changes Path B while Path A still advertises the old frontmatter model. No conflict-resolution logic exists — MISSING (flag for Task 06).

### §8. Capabilities/Tools/Skills analysis — Task 02 evidence

Reconciled WITHOUT merging (seven distinct concepts):

| # | Concept | Location | Class | Creation→persistence→mutation→consumption→effect |
|---|---|---|---|---|
| 1 | `AgentCapability` 42 qualification labels (closed) | `packages/agent-types/src/agent-capability.ts:19-158` | DECLARED | Type only; zero importers (Task 01); no factory/persistence/consumers. |
| 2 | Workspace capability representation (42 + `string&{}` + `CAPABILITY_DESCRIPTIONS` dup) | `packages/workspace/src/types.ts:514-557` + `agent-service.ts:17-56` (36-entry local description table — NOTE: 36 not 42, missing web- quartet + others) | DUPLICATE + AUTHORITATIVE (stored) | Created in registry literals / POST body → persisted `agents.capabilities` JSON → mutated free-form via PUT → consumed by `AgentPermissionEngine.hasCapability` (`agent-permission.ts:48-50` naive `includes`) + UI `getAgentCapabilities` (`agent-service.ts:130-145`); NO observed gate on run path (`runAgent` checks only repository-read `:82-89`, never capability labels). Stored-but-unenforced for execution. |
| 3 | Executable `AgentCapabilityName` 12 fs-ops | `packages/workspace/src/agent-capability.ts:17-70` + definitions/permission-map/risk table (`agent-capability-manager.ts:32-134`) | AUTHORITATIVE (only executable capability) | Code constants → stateless (no persistence) → code-edit mutation → `AgentCapabilityManager.execute(agent,name,input)` (`:181-200`: unknown→reject; disabled→reject; `isPermitted`→reject; reason-required→reject) → `executeOp` switch → `FilesystemRuntime` (`:217-268`). Parallel bypass exists: `executeAsTool` (`:208-215`) skips agent gate (ActionRuntime path, own engine). |
| 4 | Persisted capabilities | `agents.capabilities` JSON TEXT column | AUTHORITATIVE (durable record, not enforcement) | `saveAgent(Sync)` → `rowToAgent` passthrough (`agent-storage.ts:399` no validation) → `getCapabilitiesForAgent` filter (`manager:162-164`). |
| 5 | Permission-related capability concepts | `AgentPermission[]` (declaration) + `AgentPermissionEngine.check` (`agent-permission.ts:20-43`: disabled→deny; exact resource+action match else deny) + `OpenCodePermissions` grants + `AssistantCapabilityPolicy` (`assistant-capability-policy.ts`: default `createDefaultAssistantPolicy` ALLOW-all-known `:72-115` vs per-agent `createPolicyForAgent` exact-match-per-tool + write→edit fallback `:138-164` + `evaluatePermission` first-match-wins `:180-212` + `buildToolsMap` ALLOW→true else false `:249-266` + `ALL_TOOL_NAMES` 16 `:220-237`) | AUTHORITATIVE (split: declaration vs enforcement, PROVEN by design) | Grants created in registry consts → NOT persisted → overlaid per-read → `createPolicyForAgent(repositoryDir, id, grants)` per turn → `tools:` map on `prompt_async` + `evaluatePermission` on each OpenCode permission request → broker allow/ask/deny. `CAPABILITY_PERMISSION` map (`manager:32-45`) binds 12 fs-ops → repository read/modify for the harness path. |
| 6 | Tools / tool registry / runtime tools | OpenCode native tools (`read,edit,glob,grep,list,bash,task,external_directory,todowrite,webfetch,websearch,lsp,skill,question,doom_loop` — `.md` permission keys `agents-sync.mjs:29-45`); harness `tools.definitions()` passed to provider (`agent-harness:645`); `normalizePermissionAction` mapping | AUTHORITATIVE (OpenCode server owns tool execution; Vestara owns per-turn availability map) | Server tool loop executes; Vestara constrains via `tools:` map + permission mediation (`respondToPermission` `opencode-http-client.ts:388-408`; broker `awaitPermission` keyed by conversationId+permissionId). Unknown tools → DENY (`defaultDecision: deny`). |
| 7 | `AgentSkillName`/`AgentSkill` (20 + proficiency) | `packages/workspace/src/types.ts:487-512` | DECLARED-or-DEAD (no storage/manager/consumers in slice) | No creation/persistence/mutation/consumption path found. ONLY skill references: `skill: allow` grant key, `skill/` tool-map entry, and policy comment "Skills remain instructional: skill authority ⊆ current Assistant authority. A skill must never transform DENY→ALLOW" (`assistant-capability-policy.ts:20-21`). Skill = instruction text under existing authority, NOT an authority. MISSING dedicated Skill authority PROVEN (in slice). |

Read/write/edit end-to-end (Agent config → capability → permission/gate → runtime/tool → OpenCode → callID → ExecutionObservation → conversation persistence → Activity/detail projection):

- READ: config `repository:read` grant → `isPermitted(filesystem.read)` → `manager.execute` → `filesystem.read(path)` (`filesystem-runtime/index.ts:486-499`: evaluate→allow/approval→readFileSync→`success(op,data)` with `observation{operation:read,file,status:success}` `:407-430,451-461`) → `AgentCapabilityResult{ok, observation(FsObservation), data}` → session memory store (`agent-runtime.ts:144-161`) → Understanding runtime. OpenCode path: `message.part.updated` tool=read → `projectReadObservation` (file identity from `state.input`, NO content/range claims `:406-421`).
- WRITE: requires `repository:modify` + `reason` (`manager:195-197`) → `filesystem.write(path,content,{agentId,reason})` (`:501-552`: sha256 contentHash + preStateHash envelope BEFORE evaluate `:506-521` → approval-gate → hash revalidation `:528-530` → writeFileSync + `diffLineSummary` → `observation{operation:write,file,status,changes}`) → result+observation same chain. OpenCode path: `message.part.updated` tool=write + authoritative `part.callID` + `state.input.filePath` → `projectWriteObservation` (`assistant-execution-projection.ts:482-520`): file from runtime input (provenance runtime-provided), `finalContent` ONLY when completed + string content present, `diffRepresentation/provenance: unavailable`, `beforeAfterProvenance: unavailable` — VERIFIES the stated behavior: write carries authoritative path/final content, never a fabricated diff. PROVEN.
- EDIT (update/patch): requires `repository:modify` + `reason` → `filesystem.update(path, patch:FsPatch{replace/insert/removeLines})` (`:557-612`: pre-state hash, `applyPatch`, envelope, revalidation, summary) → same observation chain (`operation:update`). OpenCode path: `message.part.updated` tool=edit + `callID` + `state.input.filePath` → `projectEditObservation` (`:433-475`): file from same part's input (no cross-event matching), patch accepted ONLY from same part's `state.metadata.filediff.patch` (`:449-450`), else `diffRepresentation: unavailable` / `diffProvenance: unavailable`; `file.edited` event alone yields running-detail with NO diff (`projectEditStarted :611-626`). VERIFIES the stated behavior: edit may carry runtime patch evidence, write may not — and absence stays `unavailable`, never fabricated. PROVEN. Grouping rule preserved: evidence attaches to owning activity via callID envelope (`baseEnvelope(callID,...)`), not standalone agent state.
- callID authority: OpenCode `part.callID` is the operation identity for tool details; harness tool path uses its own `callId` (`agent-harness/index.ts:687-691,989-996` tool-result payload) — two callID families (OpenCode vs harness), correlation MISSING in slice (flag Task H).
- Conversation persistence: harness appends `tool-result` items with `{callId,toolName,status,output,error,evidence}` (`:988-997`); assistant mirrors tool lifecycle as `opencode.message.part.updated{part:{type:tool,callID,tool,state:{status}}}` for M9 ingestion (`assistant-opencode-adapter.ts:652-668`, keyed on OpenCode callID, fire-and-forget).

OpenCode leakage (identified, NOT moved/removed):
1. `runtimeAgent` twin names (`vestara-*`) address OpenCode agents directly in all three execution paths (harness `:647`, conversation `:123,179`, assistant `:699`) — adapter addressing vocabulary is OpenCode-native. PROVEN.
2. `opencodePrompt`/`opencodePermissions`/`mode` live inside the Vestara Definition object (`CanonicalAgent`) though only meaningful to OpenCode generation/consumption — OpenCode-specific fields embedded in domain contract. PROVEN.
3. Generated `.md` frontmatter keys (`read/edit/glob/grep/list/bash/task/external_directory/todowrite/webfetch/websearch/lsp/skill/question/doom_loop`, no `write` key by design) + `model: opencode/...` + `mode:` are OpenCode's native schema inside Vestara-owned repo files. PROVEN.
4. OpenCode tool names (`read/write/edit/...`) treated as policy keys in `AssistantCapabilityPolicy`/`ALL_TOOL_NAMES`/`buildToolsMap` and as projection kinds (`read/write/edit` details) — OpenCode tool taxonomy doubles as Vestara capability/policy taxonomy. Borderline-leakage: REQUIRED for mediation, but conflates Tool with Capability vocabularies (see §8 table). INFERRED assessment, PROVEN mechanism.
5. Session assumption: OpenCode session reuse keyed by `conversationId` (`assistant-conversation-sessions.ts` binding + `sessionRegistry`), `directory` required for agent resolution — OpenCode session lifecycle shapes Vestara conversation identity handling. PROVEN mechanism; identity-collapse verdict deferred to Task G/H.
6. `AgentCapabilityManager.executeAsTool` (`:208-215`) + harness `ToolRuntime` naming show filesystem ops routable WITHOUT agent identity — tool execution separable from Agent authority (supports target invariant). PROVEN.

- §7 Instructions analysis — Task 02. §8 Capabilities/Tools/Skills — Task 02. §9 Routing/provider/model — Task 03. §10 Permission/governance — Task 03. §11 Runtime-instance/session — Task 04. §12 Execution — Task 04. §13 Activity Room — Task 05. §14 Workflow — Task 05. §15 Agents UI — Task 05. §16 Marketplace — Task 05. §17 State-machine — Task 05.

- §7 Instructions analysis — Task 02 done. §8 Capabilities/Tools/Skills — Task 02 done. §9 Routing/provider/model — Task 03 BELOW. §10 Permission/governance — Task 03 BELOW. §11 Runtime-instance/session — Task 04. §12 Execution — Task 04. §13 Activity Room — Task 05. §14 Workflow — Task 05. §15 Agents UI — Task 05. §16 Marketplace — Task 05. §17 State-machine — Task 05.

## 9. Routing / provider / model analysis — Task 03 evidence (PROVEN unless noted)

Task 02 split preserved — persona path vs execution path NOT reconciled.

### 9.1 Routing call graph (production)

```
HARNESS turns (durable single-turn loop):
  AgentRuntime.run(agentId, task) [agent-runtime.ts:71-77: getAgent → createExecution → runViaHarness]
    → HarnessExecutionAdapter.execute({agentId, instruction: task, goal: task}) [harness-session.ts:293-322: createThread{metadata.agentId} → createForRun → harness.run({threadId, instruction, agentId, environment})]
      → AgentHarnessRuntime.continueTurn [agent-harness/index.ts:611-658]
        → resolveExecutionOverride(agentId) → resolveAgentExecutionFor(agents, routingStore) [workspace-context.ts:1863-1897]
        → context.assemble({thread,turn,replay,environment}) [workspace-context.ts:978-1032]
        → provider.complete({model: executionModel(override, 'opencode-runtime'), messages, tools, agent: override?.runtimeAgent || agentId, title, runtimeSessionId}) [:642-658]
          → OpenCodeRuntimeProvider [providers/opencode/runtime-provider.ts:1-20: session-per-turn, prompt_async, /event till idle]

CONVERSATION turns (assistant):
  conversationService.sendMessage(conversationId, content, {agentId?, provider?, model?})
    → DefaultConversationService → ProviderExecutor (openCodeConversationExecutor | codex) [workspace-context.ts:949-960]
      → assistant-opencode-adapter runAssistantOpenCodeTurn:
        resolveTurnPersona → resolveConversationPersona(agents, dir, agentId) [agent-persona-resolver.ts:30-75]
        resolveProviderModel → assistantBindingResolver.resolve({providerId, modelId}) [assistant-binding-resolver.ts:95-122: discovery listProviders + fail-closed]
        sessionRegistry.acquire(conversationId) reuse [assistant-conversation-sessions.ts]
        → client.sendMessageAsync(sessionId, {parts, agent: runtimeAgent, model?, system: buildSurfaceSystem(), tools: buildToolsMap(policy)}) [:693-717]
      → binding validation at route ingress: resolveExecutionBinding [routes/conversations.ts:95-104]
  Conversation-local provider (legacy/alternate): conversation-runtime/provider/opencode.ts complete/stream [createSession + sendMessage{agent: config.agent, model: modelRef(request)} :115-181; modelRef = AgentDefinition provider/model ONLY, omitted when absent :99-103]

TELEGRAM turns: resolveTelegramAgentBinding [routes/telegram.ts:260-279: definition binding when complete else identity-only] → conversationService.sendMessage({agentId, provider?, model?}) [:293-301]

WORKFLOW turns: MultiAgentStageSpec.instruction → instructionForStage (boundary + spec + prior output) [multi-agent-workflow.ts:512-525] → harness.run({threadId, instruction, agentId: spec.agentId}) [:499-504] — NO routing call; agentId is the stage's static spec id.

ROUTING API (parallel, mostly unconsumed by execution):
  GET /api/routing/catalog → providerManager.routing.catalog.list(health) [routes/routing.ts:69-75]
  GET/PATCH|PUT /api/routing/selection → FileRoutingStore routing.json {profileId, roles:{role: ProviderModelRef}} + revision OCC [routing-state.ts:42-77; routes/routing.ts:77-117]
  POST /api/routing/preview → getRoutingProfile + selection.roles[role] as preferred → providerManager.routing.resolve({taskId?, role, agentId, requiredCapabilities, policy, source, exclude}) [:119-178]
  POST/GET/PATCH /api/routing/assignments → FileRoutingAssignmentStore routing-assignments.json {taskId, revision, agentId, route: ProviderModelRef, status, sideEffects...} + OCC + availability gate availableCandidate [:180-313; routing-assignments.ts:17-127]
```

### 9.2 Routing-contract classifications

| Symbol | Location | Class | Rationale |
|---|---|---|---|
| `@vestara/routing-types` (RoutingCapability 14, RoleRoutingPolicy, EngineeringRoutingPolicy/Selection, RoutingAssignment/Status, RoutingDecisionEvidence, RoutingRequest/Resolution, ProviderId/ModelId brands, ProviderAvailability/OperationalState) | `packages/routing-types/src/routing.ts, provider-model.ts, provider-state.ts` | DECLARED (vocabulary, largely unconsumed by execution) | No execution-path importer observed except API preview route + docs; `role-compat` comment forbids moving RoutingRole into it. `RoutingAssignment` here is the task→provider binding contract. |
| `provider-runtime` DUPLICATE routing vocabulary (`EngineeringAgentRole` 6, `EngineeringCapability`, `RoleRoutingPolicy`, `EngineeringRoutingPolicy`, `RoutingAssignment` + `RoutingAssignmentConflictError`) | `packages/provider-runtime/src/routing-types.ts:59-191` | DUPLICATE + AUTHORITATIVE (the implementation the API/manager actually use) | `routes/routing.ts:1-14` imports from `@vestara/provider-runtime`, NOT `@vestara/routing-types`. Two parallel type homes for the same concepts — PROVEN duplication. |
| `FileRoutingStore` (routing.json, versioned selection) | `provider-runtime/src/routing-state.ts:42-77` | AUTHORITATIVE (selection persistence) but SECONDARY in execution effect | Durable OCC file store; read by `resolveAgentExecutionFor` as fallback ONLY when agent.model empty + by preview route. Never consulted by conversation/assistant/telegram paths. |
| `FileRoutingAssignmentStore` (routing-assignments.json, OCC, status machine, side-effect gate, reassign approval) | `provider-runtime/src/routing-assignments.ts:17-127` | DECLARED-or-DEAD for execution (AUTHORITATIVE as record store only) | Full lifecycle API exists (assign/updateStatus/recordSideEffect/reassign) with availability gate at write time, but ZERO readers in harness/conversation/assistant/workflow execution paths (grep: only routes + workspace-context construction `workspace-context.ts:665`). `WorkflowOrchestrator.runTask` never reads it (corroborates AR-P1-AUDIT:281,316). RoutingAssignment is NOT runtime-authoritative — merely declared/recorded. PROVEN. |
| `EngineeringRoutingRuntime.resolve()` + `EngineeringProviderCatalog` + `ProviderHealthTracker` | `provider-runtime/src/engineering-routing.ts, index.ts:55-64` | AUTHORITATIVE (routing-decision engine) but UNWIRED to execution | Used by preview route only; no harness/conversation call observed. Catalog availability logic (`available && providerAvailable && modelAvailable` `:93-95`) is the real availability composition — but nothing in the turn path calls it. |
| `resolveAgentExecutionFor` | `apps/api/src/workspace-context.ts:1863-1897` | AUTHORITATIVE (harness binding decider) | Triple-match id\|runtimeAgent\|role → agent.model verbatim wins; else routingStore role fallback; else undefined→harness default. THE precedence implementation for harness turns. |
| `AssistantBindingResolver` | `apps/api/src/assistant-binding-resolver.ts:73-122` | AUTHORITATIVE (conversation binding validator) | Requested provider/model validated vs live `listProviders` discovery (30s cache); incomplete request → agent-assistant fallback binding (`workspace-context.ts:868-878`); unresolvable → `AssistantBindingError` fail-closed (no silent substitution). |
| Agent `provider/model` row fields | `agents` table | AUTHORITATIVE (de-facto per-agent override) | Wins harness path verbatim; feeds conversation `modelRef` (local provider) and telegram binding; bypasses all policy when set. |
| `.md` frontmatter `model:` | generated files | DERIVED default (OpenCode server-side) | Only governs when prompt carries NO explicit `model:`; harness always sends explicit model string (`executionModel`), assistant sends `model:` when `turnModel` defined — so frontmatter is the weakest default. |
| Execution-request routing intent | `CompletionRequest.model/provider`, `sendMessage body.provider/model`, `TaskEnvelope`, `WorkflowTask` | MISSING-or-UNWIRED as routing authority | Carried as requested binding (conversation) or absent (harness/workflow pass instruction+agentId only); no `RoutingRequest{requiredCapabilities, policy}` is ever built in turn paths; `isDeltaOnlyEnvelope` forbids prompt text but no turn constructs a routing intent object. No agent declares routing requirements (Task 01 §6). MISSING PROVEN. |

### 9.3 Provider/model precedence graph (current source truth — PROVEN, do not redesign)

HARNESS turn (per `continueTurn` + `executionModel`):
```
1. agents row (agent.model non-empty) → `${provider}/${model}` or bare modelId  [workspace-context.ts:1875-1881; agent-harness:243-246]
   — bypasses everything below when hit
2. ELSE FileRoutingStore selection.roles[normalizeRoutingRole(agent.role)] → {providerId, modelId}  [:1882-1891]
3. ELSE harness default: options.model = 'opencode-runtime' [workspace-context.ts:1124] → OpenCodeRuntimeProvider preferredProviderId/modelId envs or runtime default [runtime-provider.ts:114-116]
4. OpenCode server default (when model string is sentinel/default) + .md frontmatter model as agent default
```
CONVERSATION turn (assistant path):
```
1. Browser-requested provider/model (if both present) → AssistantBindingResolver vs live discovery → binding or THROW (fail-closed, never fallback) [assistant-binding-resolver.ts:95-122; routes/conversations.ts:95-104]
2. ELSE agent-assistant Definition binding (provider/model row) as fallback [workspace-context.ts:868-878]
3. ELSE error ('No provider/model was requested and no default binding configured') — no silent default
4. prompt carries model: binding → OpenCode; ABSENT model: field omitted → server/.md default [adapter :700-703]
5. Per-turn persona agent name: resolveConversationPersona row (fail-closed) — independent of model path
```
Conversation-local provider path: `modelRef` = Definition provider+model ONLY; absent → field OMITTED → local `vestara-assistant` config decides [conversation-runtime/provider/opencode.ts:99-103].
TELEGRAM: Definition complete binding → propagated; else identity-only → canonical fallback governs [routes/telegram.ts:260-301].
WORKFLOW/harness stages: NO binding input — inherits harness precedence via static spec.agentId.
`RoutingAssignment` store: NO position in any graph above (unread). `resolve()` engine: NO position (preview-only).

### 9.4 Availability/state separation (PROVEN: separate stores, no unified gate)

- Definition `status active|disabled`: enforced at `AgentService.runAgent` (`agent-service.ts:85` reject) + `AgentCapabilityManager.isPermitted/execute` (`:170-189` deny) + `AgentPermissionEngine.check` (`agent-permission.ts:29-31` deny). NOT checked in observed harness `continueTurn`, conversation adapter, or telegram paths in this slice — enforcement is path-dependent (flag Task 11/12 + state-machine Task 05).
- Provider availability: `ProviderHealthTracker.availability()` = installed+authenticated+reachable+allowed+busy+state (`provider-health-tracker.ts:72-104`); catalog composes `availability.available && providerAvailable && modelAvailable` (`engineering-routing.ts:93-95`); write-time gate `availableCandidate` on assignments (`routes/routing.ts:51-60,203-206,284-287`); `AssistantBindingResolver` live-discovery check per conversation turn. Harness turns: NO availability check observed before `provider.complete` (override string passed blind; failure surfaces as provider failure at runtime).
- Model availability: same catalog composition; discovery `listProviders` is the live source for conversation validation; harness relies on override string validity.
- Runtime availability: OpenCode reachability — conversation fails fast w/ `AssistantBindingError runtime-unavailable` or transport-unavailable executor (`workspace-context.ts:925-941`); `GET /api/agents` reports `runtime.reachable` annotation (`routes/agents.ts:87-110`); harness `OpenCodeRuntimeProvider` degrades to controlled provider failure (never crash) per its header contract.
- Execution status: `agent_executions.status queued|running|completed|failed` (`agent-storage.ts:172-241`); harness turn states incl. `awaiting-approval/blocked/cancelled` (`agent-harness/index.ts`); `RoutingAssignmentStatus assigned|running|paused|completed|failed` (record store only). Verdict: FIVE SEPARATE state machines, no conflation in storage — but also no cross-guard (disabled agent with healthy provider is rejected only on paths that check; unavailable provider with active agent fails only at call time). SEPARATE-but-UNGATED. INFERRED assessment from PROVEN stores.

## 10. Permission / governance analysis — Task 03 evidence

### 10.1 Permission call graph (production)

```
HARNESS fs path: ToolRuntime.invoke → AgentCapabilityManager.execute(agent, name, input) [manager:181-200: unknown/disabled/permission/reason gates]
  → FilesystemRuntime.evaluate(op, approvalId?, envelope) [filesystem-runtime/index.ts:311-395: approvalId→revalidate repo+preState (delete on use); policyEngine ask→escalate; high-risk→create/store MutationEnvelope + pending]
  → high-risk? pending{approvalId} : execute → FsObservation
  → approval continuation: harness.pendingApprovals(threadId) [agent-harness:402] → decideApproval(threadId, approvalId, approved) [:430-451: requires awaiting-approval state]
  → bridged to generic Interaction system: harness-approval-interaction-bridge [subscribes interaction:responded → decideApproval; reconciles at boot]

ASSISTANT/CONVERSATION OpenCode path: OpenCode permission/question event → adapter evaluates AssistantCapabilityPolicy.evaluatePermission(action, resources) [assistant-capability-policy.ts:180-212]
  → allow: respondToPermission approve (once/session) [opencode-http-client.ts:388-408]
  → ask: interactionBroker.awaitPermission(conversationId, permissionId, 10min) [broker:50-58] ← browser POST decision → decidePermission [:75-77] → respond; timeout/undefined → fail-safe reject
  → deny: auto-reject. Unknown tools → defaultDecision deny. Tools map pre-constrains model: buildToolsMap [:249-266].
  → durable mirror (tools only): opencode.message.part.updated events → M9 [adapter:652-668]
  → questions: durable RuntimeQuestionInteractionStore ingestion BEFORE awaiting (fire-and-forget) [adapter hook :899-909 workspace-context; open rule :237-266] + broker path preserved

AGENT API path: requireRole(editor) [auth.ts:64-81] on POST/PUT/DELETE/run/capability/sync; getActor = authenticate = Bearer→UserStore else X-Vestara-Actor header else local-operator/admin [auth.ts:23-52; routes/types.ts:36-39]

APPROVALS surfaces: GET /api/execution/approvals (collectApprovals), /api/agent-threads/:id/approvals + resolve, /api/approvals (memory adapter), workflow approvalRequested bridge (orchestration.task.approval-requested → present → respond → continue).
```

### 10.2 Kept-separate findings (declared vs effective vs request vs decision vs approval vs enforcement vs evidence)

| Layer | Authority | Persistence | Evidence |
|---|---|---|---|
| Declared policy | `AgentPermission[]` rows; `OpenCodePermissions` grants (code); `AssistantCapabilityPolicy` rules; `CAPABILITY_PERMISSION` map; `capabilityDefinitions()` risk table | Grants NOT persisted (code); AgentPermission JSON persisted; policy objects constructed per turn | agent-definition.ts:19-23 comment "agent-side declaration; runtime enforcement is separate" — separation BY DESIGN |
| Effective policy | Per-turn constructed: `createPolicyForAgent` (harness override? NO — conversation/assistant only) or `createDefaultAssistantPolicy`; harness uses `AgentPermissionEngine + CAPABILITY_PERMISSION + FilesystemRuntime.evaluate` | In-memory per turn | assistant-capability-policy.ts:138-164; agent-capability-manager.ts:170-200 |
| Permission request | OpenCode `permission.asked` events (assistant path); harness tool-call intents; `PermissionRequest{id,action,resources,risk}` contract | Ephemeral event; `PermissionRecord` contract exists but no store observed in turn paths | permission-request.ts:21-33; projection projectPermissionRequested |
| Policy decision | `PolicyDecision allow|ask|deny` (`permission-contracts/policy-decision.ts:15`); `PolicyEvaluation`; `PermissionEvaluation` | Ephemeral return value | policy-decision.ts; assistant-capability-policy.ts:180-212 |
| Human approval | Browser decision via broker `decidePermission/decideQuestion`; workflow Director approval; harness `decideApproval` | Broker: PROCESS-LOCAL `Map` (no persistence) — LOST ON RESTART (PROVEN broker:44). Harness approvals: DURABLE via `FileThreadStore` threads/turns/items (`threads/agent-harness.db`, `workspace-context.ts:584`) + `awaiting-approval` turn state — SURVIVES restart + boot reconciliation (PROVEN bridge:148-183). Filesystem approvals: PROCESS-LOCAL `pendingApprovals: Map` (`filesystem-runtime/index.ts:211`) — LOST ON RESTART (PROVEN). RuntimeQuestion: DURABLE `RuntimeQuestionInteractionStore` SQLite (M11A room, explicit migration) — survives (PROVEN m11a:148-175). | See paths above |
| Runtime enforcement | `respondToPermission` to OpenCode; `FilesystemRuntime.evaluate` gate; `ToolRuntime` policy; `evaluatePermission` pre-check | Enforcement-time only | opencode-http-client.ts:388-408; filesystem-runtime:311-395 |
| Authorization evidence | `FsOperationRecord` history (in-memory ring, historyLimit); `tool-result` thread items w/ evidence array; `audit_log` rows for agent CRUD/run (`logAudit` in routes/agents.ts); M9 durable tool facts via mirror; verification evidence bundles | Thread items + audit_log + M9 durable; Fs history volatile; broker decisions unlogged | agent-harness:980-997; routes/agents.ts:153-295; evidence pipeline workspace-context.ts:1077-1112 |

### 10.3 Actor authority (tested vs Identity ≠ Authority ≠ Context ≠ Intelligence)

- Requesting-actor candidates observed: OS/user principal (Bearer `UserStore.findByToken` → AuthUser{user}; else header/anonymous `local-operator` admin — `auth.ts:23-52`); workspace actor (`getActor` per mutating route → `logAudit` attribution); Agent (Definition row id/role used for `resolveAgentExecutionFor`, persona resolution, `agentId` thread metadata, `actor:{id: runtimeAgent, role: agent}` emissions); participant (Activity Room projection, NOT a request authority — Task 05); execution actor (harness `active.agentId`, tool `agentId`); runtime session (OpenCode sessionId, conversationId-keyed registry).
- PROVEN findings:
  1. HTTP mutation authority = coarse `requireRole(editor)` on the HUMAN/caller principal — agent identity plays NO role in API authorization. Agent ≠ HTTP authority. PROVEN.
  2. Turn-time tool authority = Agent row grants (repository read/modify; per-tool OpenCode grants) — the AGENT is the requesting actor for capability/tool gates. Human approval is consulted only on `ask`/high-risk. Agent = tool authority (scoped). PROVEN.
  3. `authenticate` fallback: any request WITHOUT Bearer token and WITHOUT header becomes `local-operator` with role `admin` (`auth.ts:43-51`). Authorization INFERRED from absence of identity — the weakest actor claim carries the strongest role. PROVEN mechanism; severity flagged (bypass inventory B5).
  4. Harness context mentions agents by `@mention`/role matching (`messageTargetsAgent`, `workspace-context.ts:1014-1024`) for OBSERVATION routing only; no authorization derived from mention. PROVEN separation (context ≠ authority).
  5. `actor:{id: turnPersona.runtimeAgent}` / `agent-harness` / `orchestrator` / `system` emissions are ATTRIBUTION labels on events, not capability grants — intelligence/content never authorizes. No case observed where model output text alone grants authority (envelopes/decisions mediate). PROVEN in slice (absence of text-as-authority path).
  6. Role/name-inferred authorization: `runtimeSyncedAgents` twin match by `runtimeAgent|role` (annotation only, not auth — benign); `resolveAgentExecutionFor` triple-match INCLUDING bare `role` (`candidate.role === input.agentId`) — a turn addressed by ROLE string resolves to the first stored agent with that role and inherits ITS provider/model/grants. Authorization (binding+policy selection) INFERRED from role name, not agent identity. PROVEN (`workspace-context.ts:1869-1874`). Flagged HIGH (identity collapse, feeds Task G/H).
  7. Session-identity inference: conversation session reuse keyed by `conversationId` only ("never by provider/model" — sessions file comment); `directory` (repo root) scopes agent resolution. No evidence that possessing a sessionId alone authorizes (routes require conversation flows), but session binding is IN-MEMORY (`AssistantConversationSessionRegistry` Map + single-flight locks) — restart drops continuity (see durability). INFERRED risk, PROVEN store.

### 10.4 Approval durability (PROVEN)

| Approval family | Request → persistence → decision → consumption | Survives restart? | Envelope wired? |
|---|---|---|---|
| Assistant OpenCode ASK (permission/question) | event → broker `pending Map` → browser POST → `decide()` resolves promise → adapter `respondToPermission` | NO — Map is process-local; 10-min timeout then fail-safe reject; restart orphan turns (no reconciler observed) | NO MutationEnvelope involvement (OpenCode-native permission ids) |
| Harness tool-call approval | tool policy → turn `awaiting-approval` + `PendingApproval` in thread store → Interaction presentation → `decideApproval(threadId, approvalId, bool)` → turn resume | YES — `threads/agent-harness.db` durable + `harness-approval-interaction-bridge` boot reconciliation (retries, `reconciled N` log) | NO envelope (harness-native approvalIds; envelope is filesystem-layer) |
| Filesystem high-risk mutation | `evaluate` → `pendingApprovals Map{op, envelope: MutationEnvelope}` + `onPendingApproval` → `approve()/reject()` or approvalId re-call → hash revalidation (repo + preState + content) | NO — Map process-local; restart loses pending + envelope (re-request required; in-flight `approvalId` re-calls fail closed as unknown) | YES — envelope created BEFORE evaluate, stored with pending, revalidated on repo/preState/content (`index.ts:311-395,501-552,557-612,798-800`). Immutable默认为 `repositoryDir+relativePath+operationType+preStateHash+contentHash+createdAt` (`types.ts:40-55`). BUT: only wired into the `AgentCapabilityManager→FilesystemRuntime` path (harness/direct capability calls). OpenCode-native tool path (assistant/conversation turns executing via OpenCode server tools) does NOT pass through `FilesystemRuntime.evaluate` — envelope governance DOES NOT cover model-driven OpenCode file operations. PROVEN gap. |
| Workflow approval | `orchestration.task.approval-requested` → presentation w/ `approvalInteractionId` → response → continuation | Depends on orchestration store (durable task `awaiting-approval` + revision) — YES (task-gated, revision-pinned) | NO envelope |
| Routing reassign approval | `reassign{reason, approved}` → `approval-required` + `routing.execution-paused` event when side-effects recorded | YES (record store) but UNCONSUMED by execution | NO envelope |
| RuntimeQuestion ASK | `question.asked` → `ingestRuntimeQuestionAsked(store)` durable THEN broker await | YES (SQLite store, explicit migration) | NO envelope |

### 10.5 Bypass inventory (classified, not auto-defect)

- B1. Agent-model verbatim override (harness): non-empty row bypasses routing policy + availability pre-check. INTENTIONAL per comment ("agent configured in Agent Control modal wins") but UNVALIDATED. Class: intentional precedence, missing guard. [workspace-context.ts:1875-1881]
- B2. `executeAsTool` skips agent permission gate (ActionRuntime-owned). INTENTIONAL (own engine gates). Class: designed separation. [manager:208-215]
- B3. `AgentService.checkPermission` hardcoded `{allowed:true}` ("Simplified — full RBAC coming in v9.0"). Any caller of THIS method bypasses. Class: stub bypass, HIGH if reachable (callers: none observed in turn paths — MISSING reachability, flag). [agent-service.ts:150-152]
- B4. PUT full-row REPLACE with no vocabulary/availability validation (role/caps/provider/model/permissions arbitrary). INTENTIONAL flexibility, missing validation. [routes/agents.ts:188-236]
- B5. `authenticate` absent-credential → `local-operator/admin`. Achieves availability without authN; every `requireRole(editor)` gate passes. Class: intentional local-dev affordance with production bypass semantics. [auth.ts:43-51]
- B6. OpenCode-server tool execution (assistant/conversation model-driven file ops) bypasses `FilesystemRuntime` + MutationEnvelope governance entirely (different executor). Class: architectural bypass — two mutation substrates, one governed. PROVEN by path separation.
- B7. Role-string triple-match (B-identity collapse): bare role resolves to first matching agent's full binding. Class: convenience aliasing with authorization side effects. [workspace-context.ts:1869-1874]
- B8. `VESTARA_DISABLE_AGENT_SEED=1` skips canonical reconciliation (env-gated authority removal). Class: intentional break-glass. [agent-storage.ts:56]
- B9. Conversation `modelRef` omission: absent Definition binding → field omitted → server default decides (OpenCode/.md default, NOT Vestara policy). Class: intentional fallback w/ authority transfer to runtime default. [conversation-runtime/provider/opencode.ts:99-103]
- B10. Codex path (`assistantRuntime==='codex'`): separate executor w/ own default model (`gpt-5.5`/env), no persona/policy/binding machinery observed in slice. Class: parallel execution substrate outside audited governance (flag Task 04/06). [workspace-context.ts:942-960]

## 11. Runtime-instance / session analysis — Task 04 evidence (PROVEN unless noted)

### 11.0 Runtime representation inventory (creation → identity → persistence → lifecycle → mutation → termination/recovery)

| # | Representation | Creation | Identity | Persistence | Lifecycle/mutation | Termination/recovery |
|---|---|---|---|---|---|---|
| 1 | Agent registry/runtime objects (`AgentStorage` rows + `AgentRuntime`/`AgentService` adapters) | `CANONICAL_AGENTS` / POST | `agents.id` | `plans.db agents` durable | `PUT`/status/model updates; `run()` creates executions, no self-state change | N/A (definitions, not live) — no runtime presence |
| 2 | OpenCode sessions (server-side) | `client.createSession` per conversation-first-turn / harness `OpenCodeRuntimeProvider` per-turn session / conversation-local provider per-turn session | OpenCode `sessionId` (opaque server id) | SERVER-side (OpenCode process) + Vestara-side binding refs (registry Map / `runtime_session_id` col / `runtimeSessionId` env passthrough) | `prompt_async` turns; `session.status→idle` completion signal; `abortSession` on cancelled/timeout/failed (assistant) | Restart: server sessions survive API restart IFF OpenCode process survives; Vestara mapping: registry Map LOST, adopted back via persisted id + liveness probe (conversation path PROVEN `assistant-conversation-sessions.ts:22-30,127-145`); harness env passthrough has no adoption logic observed |
| 3 | Conversation participants | Implicit — no Participant table (corroborates AR-P1-AUDIT:249) | `conversationId` + actor ids in messages | `conversations.db` (SqliteConversationStore) + `runtime_session_id` column | sendMessage/stream appends | Survives (SQLite); session binding re-adopted per §11.0#2 |
| 4 | Execution actors | Per-turn attribution (`actor:{id: runtimeAgent}`, `active.agentId`, `actor:{id: agentId, role: agent}`) | Agent id / twin name strings | Ephemeral event fields + durable copies in thread items / M9 records | Set at turn/dispatch creation | Ephemeral; durable copies survive in records |
| 5 | Harness sessions (`HarnessSession` composition + threads/turns) | `HarnessExecutionAdapter.execute` → `createThread` + `createForRun` | `TaskThreadId` / `AgentTurnId` (`@vestara/types` brands) | DURABLE `threads/agent-harness.db` (`FileThreadStore.open`, THREAD_MANIFEST; tables task_threads/agent_turns/thread_items) | `transition()` state machine (11 `AgentRunState`s); `decideApproval`/steering/resume mutate; `syncFromReplay` projects ExecutionSession | Survives (SQLite); `awaiting-approval` reconciled at boot via bridge |
| 6 | Assistant sessions (conversation→session registry) | `AssistantConversationSessionRegistry.acquire` (single-flight per conversationId) | `conversationId → {sessionId, repositoryDir}` | Process-memory Map (+ persisted `runtime_session_id` for adoption) | Immutable repo binding (mismatch throws); reuse-or-create-or-adopt | Map lost on restart; adopted when server session alive (PROVEN) |
| 7 | Workflow agent state (stage specs + acceptance boundaries + thread metadata.workflowId) | Workflow start (specs carry static `agentId`+`instruction`) | `workflowId` / stage `agentId` strings | Workflow/orchestration stores (durable task `awaiting-approval` + revision) | Boundary refine from stage output; approval continuation revision-pinned | Survives (store); continuation via interaction bridge |
| 8 | Activity Room participants (`ParticipantProjection`) | DERIVED — `M10 ProjectionRuntime` upserts on record ingest (`m10-projection-runtime.ts:150-202`: new `agent-*` id or update metadata/workState/assignment; `interaction.presented/responded` toggles waiting/available `:204-250`) | `participantId` (`agent-<id>` for agents; actor ids otherwise) | IN-MEMORY `Map` in projection runtime (rebuilt from M9 on boot; presence resolved independently, default `offline`) | `deriveMembership` (human.message/agent.* → joined), `deriveWorkState` (started→working, completed→available, failed→attention-required, waiting→waiting, workflow.failed→blocked), `deriveAssignment` | Reconstructed from durable M9 on boot; transient presence/workState recomputed (not restored verbatim) |
| 9 | Provider/runtime sessions (OpenCodeRuntimeProvider sessions; Codex threads) | Per-turn create (harness + conversation-local) or registry reuse (assistant) | Provider-local session ids | Server-side | Stream-till-idle; abort on terminal-failure classes | Server lifetime; Vestara holds no lease table (AR-P1.5 proposed bindings tables NOT observed as run — MISSING) |
| 10 | Execution records (`agent_executions` rows; `ExecutionSession` rows) | `storage.createExecution` (queued) / `saveExecutionSession` | `exec-<ts>-<ctr>` / session uuid | `plans.db` durable | `updateExecutionStatus` (queued→running→completed|failed + result text); timeline/status updates | Survive as history; no resume (terminal-only updates) |

### 11.A AgentInstance verdict: PROVEN NO

No authoritative `AgentInstance` exists. Grep for `AgentInstance|RuntimeInstance` in domain scope returns ONLY `ExternalRuntimeInstance` (external-runtime connection inventory for foreign runtimes — different concept: connection snapshot, not a Vestara agent live object) plus UI workforce views. No class/table/store/registry keyed as a live agent with lifecycle exists. What exists instead: DEFINITIONS (durable, inert) + TURNS/THREADS/SESSIONS/EXECUTIONS (live, scoped to work) + DERIVED participant projections (observability). Liveness is always scoped to a thread/turn/session/execution — never to an agent. The seven `CANONICAL_AGENTS` are always "present" as config and never "running" as entities; `AgentRuntime.run()` changes execution rows, never an agent row state. Answer: PROVEN NO authoritative AgentInstance; liveness is per-(thread|turn|session|execution), identity carried as agent-id strings.

### 11.C OpenCode session semantics (PROVEN: continuity container + tool-operation namespace; NOT agent/instance/execution/conversation)

An OpenCode session is a server-side continuity container + tool-operation namespace: it scopes message history, tool-call `callID`s, permission/question request ids, and `idle` completion signaling for ONE OR MORE turns. Evidence: assistant path reuses ONE session across MANY turns/sequential executions of the SAME conversation (`sessionRegistry.acquire`, "one runtime session MAY serve multiple sequential executions" per AR-GA-CORE-005); harness provider creates a session per turn yet passes the same `agentId` across many sessions; the SAME session can serve turns addressed to DIFFERENT twin names over its life (persona is per-`prompt_async`, not per-session). Therefore session ≠ provider session (provider is bound per-prompt `model:`), ≠ conversation (many conversations → many sessions, but mapping lives Vestara-side), ≠ Agent instance (no agent lifecycle; many agents can address one session across turns), ≠ execution (one session serves multiple executions). Creation: `createSession` (first use); reuse: registry/env/persisted-id adoption; recovery: liveness-probe adoption (conversation path only); termination: `abortSession` ONLY on cancelled/timeout/failed — completed/detached sessions are left idle for reuse (GA-DETACH-001 `:1342-1350` — disconnect never aborts).
Session-as-identity misuse: NO code equates sessionId with agentId (all three paths carry BOTH: `conversationId+sessionId` logging, `runtimeSessionId` alongside `executionId` in handles, `sessionId` + `runtimeAgent` in traces). BUT near-miss PROVEN: `GET /api/agents/:id` fallback matches stored agents by id (`candidate.id === id`) AND twin/role — and session-scoped `listMessages`/`getSession` reads are keyed by session alone, so any caller holding only a sessionId observes model/agents opaquely. No positive session==agent conflation found in slice — verdict: NOT misused as identity in current source, but the registry key (`conversationId→sessionId`) makes session the de-facto continuity identity for conversations (by design).

### 11.G Agent lifecycle words (idle/running/waiting/blocked/completed/failed) — PROVEN: they describe executions/turns/sessions/participants, NEVER an Agent

- `AgentRunState` 11 states (`@vestara/types` harness.ts:13-24: queued/preparing/reasoning/awaiting-tool/executing-tool/awaiting-approval/verifying/blocked/completed/failed/cancelled) = TURN states (`AgentTurn.state`), transitioned by `harness.transition()` with terminal set {blocked,completed,failed,cancelled}.
- `TaskThreadStatus` (active/blocked/completed/failed/cancelled/archived) = THREAD states.
- `agent_executions.status` (queued/running/completed/failed) + `ExecutionSessionStatus` (+cancelled) = EXECUTION/SESSION records.
- `ExecutionStatus` 8-state canonical (`execution-types/lifecycle.ts:47-55`: requested/binding/ready/running/completed/failed/cancelled/timed_out + transition table) = DECLARED (no production turn writes these values — see §12).
- `ExecutionActivityState` (idle/reasoning/tool_call/waiting/enriching) = within-execution ACTIVITY, explicitly "not lifecycle" (`lifecycle.ts:100-112`).
- `WorkState` (available/working/waiting/blocked/attention-required) + `MembershipState` + `PresenceState` (`@vestara/types` activity.ts:65-76) = PARTICIPANT projection (`deriveWorkState` maps agent.started→working, completed→available, failed→attention-required, waiting→waiting).
- OpenCode `session.status` (idle/error/...) = SESSION idleness signal consumed as turn-completion (`execution-adapter.ts:389-400`).
- Assistant `TurnTermination` (completed/failed/timeout/cancelled/detached) + `AssistantTurnStatus` = TURN outcome attribution.
- NO `AgentStatus`/`AgentState`/`AgentInstanceState` type, column, or runtime variable exists. The eventual Agents screen MUST NOT render turn/thread/participant states as agent states without a new defining authority (no new machine created here per instruction).

### 11.H Participant relationship + cardinality (PROVEN from implementation, not intent)

- Chain: Definition (`agents` row) → turn/thread actor id strings → EventBus events → M9 records → M10 `ParticipantProjection{participantId: 'agent-'+id}` (DERIVED, `m10-projection-runtime.ts:150-202`) → M11A/B → UI. Participant identity is DERIVED per record-ingest, NOT persistent (Map rebuilt from M9; `joinedAt` = first-seen timestamp, metadata merged preferentially).
- `isCanonicalAgentId` guard (`m9-ingestion-bridge.ts:251-261,357-366`) prevents manufacturing Human participants from agent-id-authored messages — participant TYPE derivation is guarded, PROVEN.
- Cardinality (proven): ONE Definition → MANY conversations (no exclusivity check anywhere; same `agentId` in N threads/conversations concurrently); → MANY sessions (assistant registry is per-conversation; harness per-turn sessions); → CONCURRENT executions (no per-agent lock observed — single-flight locks are per-`conversationId` in the session registry `:60-61,87-110`, NOT per-agent; harness iterations are per-turn sequential, NOT per-agent mutual exclusion). One conversation → one session (single-flight converge PROVEN); one session → many sequential turns/executions (PROVEN §11.C); one execution → many operations (tool calls per turn loop); one operation → one tool call (`callId` 1:1 in both families).
- Workflow waves may sequence stages, but NO global per-agent concurrency cap was found in slice (wave policy = task ordering, not agent mutual exclusion — do not generalize; Task K verdict: per-conversation single-flight PROVEN, per-agent exclusivity MISSING).

### 11.I Restart/recovery matrix (PROVEN)

| Representation | After API/process restart |
|---|---|
| `agents` rows, `agent_executions`, `ExecutionSession`, conversations, workflow tasks | SURVIVE (SQLite) |
| Harness threads/turns/items (incl. `awaiting-approval`) | SURVIVE + RECONCILE (bridge retries `decideApproval` continuation) |
| Assistant registry Map | DISAPPEARS → RECONSTRUCTS via persisted `runtime_session_id` + liveness probe (adopt-if-alive else fresh) |
| Filesystem `pendingApprovals` + broker `pending` | DISAPPEAR (process-local Maps; 10-min entries die with process; no reconciler) |
| M10 participants Map | DISAPPEARS → RECONSTRUCTS from durable M9 (presence defaults offline; workState re-derived) |
| OpenCode server sessions | SURVIVE iff server process survives; else DISAPPEAR (Vestara holds no server-side lease; orphaned server sessions have no Vestara GC observed in slice) |
| In-flight turn observables/SSE readers | DISAPPEAR (readerPromise dies; DETACHED semantics: server execution CONTINUES — SSE disconnect ≠ cancellation, Task 03 GA-DETACH-001) |
| Execution lineage (`exec-*` ids, thread/turn ids, M9 records) | SURVIVES as history; in-flight是什么意思 continuation only where a reconciler exists (harness approvals) |

### 11.J Cancellation (PROVEN: targets the TURN/operation/session, never the Agent; evidence partially durable)

- User/system request paths: assistant `POST /cancel` → `cancelTurn(conversationId)` → controller.abort() (`routes/conversations.ts:309-315` + `activity-turn-controls.ts:101-105`); opencode route `abortSession` direct (`routes/opencode.ts:417,524-529`); orchestrator `cancelProject` (workflow scope); harness `decideApproval` rejection path + `active.controller.signal` abort checks per iteration.
- Adapter semantics (`assistant-opencode-adapter.ts:1339-1423`): `request.signal` abort → termination `cancelled` → `abortSession` (server interruption, best-effort) + `assistant.turn.ended/abortSession` logs (attribution w/ conversationId+sessionId+reason). TIMEOUT/FAILED also abort; COMPLETED never aborts; DETACHED (disconnect) never aborts — execution continues server-side.
- Harness: abort checks per iteration (`:634,668`) → `finish(cancelled)` durable outcome + `harness.outcome.cancelled` event → lifecycle bridge maps to `agent:cancelled`-class projection.
- Targets: execution/turn (signal+outcome), operation (abort of in-flight prompt), OpenCode session (abort call), workflow run (cancelProject). NO path addresses "cancel the Agent" — agents have no cancellable live handle (corollary of PROVEN-NO AgentInstance).
- Evidence durability: turn-end logs (logger sink), M9 `cancelled` lifecycle records (durable via bridge), harness `final-outcome` items (durable). In-flight SSE chunks + broker pendings are not durable.

### 11.K Concurrency cardinalities (PROVEN)

Definition→sessions 1:N · Definition→executions 1:N (concurrent) · session→executions/turns 1:N sequential (single-flight acquire per conversation; harness per-turn provider sessions 1:1) · execution→operations 1:N (tool loop) · operation→tool-calls 1:1. Single-flight/sequential enforcement EXISTS ONLY for (a) conversation→session acquire (per-conversationId lock) and (b) within-turn tool loop determinism + harness iteration loop. NO per-agent mutex, NO global agent concurrency cap in slice.

### 11.L Identity-collapse audit (follows Task 03 B7; severity ranked, no repair)

1. Role-as-identity (triple-match `candidate.role === input.agentId`): HIGH — any harness turn addressed by bare role string (`planner`, `developer`…) binds the FIRST stored agent with that role (list order = `created_at ASC`) and inherits its provider/model/grants. Concrete: `resolveAgentExecutionFor({agentId:'developer'})` → first developer-row wins. PROVEN mechanism (`workspace-context.ts:1869-1874`); wrong-agent binding requires only a role-string caller (workflow specs use twin names today, but nothing constrains future callers).
2. Twin-name-as-identity (`candidate.runtimeAgent === input.agentId`): MEDIUM-HIGH — twin names are OpenCode addresses, not Vestara ids; two Definitions sharing a twin (possible via unvalidated PUT) make resolution order-dependent. No uniqueness constraint observed on `runtime_agent`. PROVEN gap.
3. Session-as-identity: LOW in current source (no session==agent equation found) — but session is the de-facto continuity key, and session-scoped reads (`listMessages/getSession`) are agent-opaque. INFERRED risk if future UI keys agent views off session alone.
4. Participant-as-Agent-identity: MEDIUM — `ParticipantProjection.participantId = 'agent-'+id` LOOKS like agent identity but is a DERIVED, re-built, presence-carrying projection; `displayName` falls back to agentId for unnamed agents, inviting UI to treat projection as definition. Guard exists only for the human-type direction (`isCanonicalAgentId`). PROVEN structure; misuse would be UI-side (Task 05 to verify).
5. Fallback-resolution wrong-agent: MEDIUM — generic `agent-assistant` default policy applies ONLY to absent/assistant ids (explicit, safe); BUT harness `undefined` override → silent harness default model (no rejection), and conversation-local `modelRef` omission → silent server default. Explicitly-targeted unknown agents REJECT in conversation path (safe) but triple-match FUZZY-matches in harness path (unsafe asymmetry). PROVEN.
6. `callID` vs `callId` (Task 02 follow-up): PROVEN two families — OpenCode `callID` (conversation/assistant/projection path, `part.callID` authoritative) vs harness `callId` (thread `tool-call`/`tool-result` payloads). The proof adapter normalizes `payload?.callID ?? payload?.callId` (`execution-adapter.ts:247,262,278`) for DISPLAY, but no join/correlation table or mapping function links a harness `callId` to an OpenCode `callID` for the same logical operation. VERDICT: do NOT correlate — cross-family lineage is MISSING. Any UI joining them today would be inference.

## 12. Execution analysis — Task 04 evidence

### 12.D Execution contracts (`@vestara/execution-types` — file-by-file verdict)

| Contract | Location | Class | Production callers observed |
|---|---|---|---|
| `ExecutionId/OperationId/TurnId/RuntimeSessionId/WorkflowRunId/WorkflowTaskId` (+brands, lineage helpers) | `identity.ts`, `@vestara/types` ids/harness | DECLARED (vocabulary; brands unenforced at runtime) | Types only; runtime code uses plain strings (`exec-${Date.now()}`, thread/turn uuids, OpenCode ids) — no brand-checked construction in turn paths |
| `ExecutionStatus` 8-state + transitions + `ExecutionActivityState` | `lifecycle.ts` | DECLARED (well-designed, zero production writers found) | No turn path writes `requested|binding|ready|timed_out`; actual states live in harness/agent_executions/session/projection machines (§11.G). Canonical machine exists on paper only. |
| `ExecutionRequest{actor,objective,context,routing?,permissions?,lineage}` + `ExecutionActor/Context/RoutingIntent/PermissionContext` | `request.ts` | DECLARED | No production constructor observed (harness passes `{agentId,instruction,goal}`; assistant passes `CompletionRequest`; conversation passes message args). RoutingIntent/PermissionContext as bundled envelopes: MISSING from turn calls. |
| `RoleInstructionRef/TaskInstruction/TaskEnvelope/isDeltaOnlyEnvelope` | `instruction.ts` | AUTHORITATIVE as CONFORMANCE rule (reference-not-text) | Referenced by design docs + conformance tests; turns comply behaviorally (name-only agent passing) though they don't construct the types. Boundary verdict: AUTHORITATIVE-conformance, not runtime-constructed. |
| `RuntimeBinding/BindingInput` | `binding.ts` | DECLARED | Binding-like objects exist inline (`{providerId,modelId,runtimeAgent}`, `{providerID,modelID}`) but are NOT constructed as `RuntimeBinding` in turn paths. |
| `ExecutionObservation` family (+ `CanonicalPermissionAction` dup of permission-contracts) | `observations.ts` | DECLARED (proof-adapter only) | Yielded ONLY by `OpenCodeAdapter.createObservationStream` (no production callers). Production observations are `FsObservation`, `StreamChunk`, `AssistantExecutionDetail`, harness thread items — separate families. |
| `ExecutionResult/TerminalStatus/Timing/Usage/VerificationOutcome` | `result.ts` | DECLARED | Terminal outcomes recorded as harness `AgentRunOutcome`, `agent_executions.result` text, conversation `ConversationResponse` — not as these types. |
| `ExecutionLineageNode/ancestorIds/...` | `lineage.ts` | DECLARED | Lineage carried ad hoc (`parentExecutionId?` unused; `correlationId/causationId` on thread items; `conversationId/workflowRunId` string fields). No lineage-node construction observed. |
| `ExecutionArtifact/Evidence` (+references-not-payloads) | `artifacts.ts` | DECLARED | Artifacts carried as string arrays (`inputArtifacts/outputArtifacts`), thread evidence arrays, M9 records — not as these types. |
| `ExecutionActivity/ActivityItemState` | `activity.ts` | DECLARED | Activity lives in projection/thread-item vocabularies instead. |
| `RuntimeExecutionPort/Handle{execute,isAvailable,runtimeId}` | `port.ts` | DECLARED (proof boundary) | ONE implementation: `OpenCodeAdapter` (`opencode-runtime/execution-adapter.ts:126-180`, header: "proof of the boundary", "wraps proven infrastructure"). ZERO production consumers in `apps/api/src` (grep PROVEN). Docs confirm migration explicitly deferred: "Migrate GA adapter to RuntimeExecutionPort: No (Phase 2)" (AR-GA-CORE-004:461-462). The OpenCode adapter is therefore NOT the authoritative runtime boundary today — production BYPASSES it on all four paths (harness via `OpenCodeRuntimeProvider+provider.complete`; conversation via `ProviderExecutor`; assistant via bespoke `runAssistantOpenCodeTurn`; workflow via harness). |

### 12.E RuntimeExecutionPort authority: PROVEN NOT authoritative (bypassed everywhere in production)

Per-path verdict: harness — bypasses (direct provider+tools+context assembly, no `ExecutionRequest`/`RuntimeBinding` constructed); conversation — bypasses (`ConversationRequest`/`ProviderExecutor`, own binding resolver); assistant — bypasses (bespoke turn function, own persona/policy/session machinery); workflow — bypasses (inherits harness bypass). The port remains the CANDIDATE canonical boundary (well-specified, proven portable via FakeRuntimeAdapter per docs) but today it is DECLARED proof-only. `isAvailable()` (listSessions probe) vs production liveness (`listProviders` discovery, transport try/catch, `runtime.reachable` annotation) are three parallel availability notions — DUPLICATE liveness concepts (feeds §19).

### 12.F Execution lifecycle: PROVEN reconstructed, no single authority; competing completions

Authoritative-in-one-place? NO. Lifecycle is assembled per consumer: harness turns own `AgentRunState` transitions (durable); `agent_executions` rows own a coarser queued→running→completed|failed (durable, mapped non-1:1: harness `blocked|cancelled` → `failed` per `agent-runtime.ts:98-99` — COMPETING completion semantics PROVEN); conversations own response-or-error settlement; OpenCode owns `idle` signaling consumed as completion; M10 owns participant workState derivation; UI owns timeline composition. Completion disagreements possible: harness `blocked` (iteration limit) vs execution row `failed`; turn `timeout`+abort vs session `idle` later; DETACHED server-continued work vs client-observed end. No cross-machine reconciliation observed.

## 13. Activity Room relationship — Task 05 evidence (PROVEN unless noted)

### 13.1 Ownership map (Definition → execution/conversation → M9 → M10 → UI)

```
AgentDefinition (AgentStorage: identity/team/binding) + AgentTeam (membership)
  ──consumed, never written──▶ composeParticipants (activity-room-m11a.ts:706-808)
M10 ProjectionRuntime (lifecycle-derived: workState/assignment from M9 records)
  ──rebuilt from store──▶ same composer (lifecycleById lookup :718-722)
M9 DurableActivityStore (m9-activity.db: agent.*, task.*, tool.*, interaction.*, conversation:*)
  ◀── M9IngestionBridge (EventBus INGEST patterns only, m9-ingestion-bridge.ts:290-310)
Harness/agent/conversation/assistant events ──▶ EventBus ──▶ bridge ──▶ M9 ──▶ M10
  ──▶ M11A snapshot/activities/participants/attention/workflow-summary ──▶ M11B WS ──▶ M11C UI
```

### 13.2 Own / persist / derive / copy / reconstruct verdict

- OWNS: M9 event records (durable truth, own sqlite file), M10 in-memory projection, M11A cursors/snapshots served, RuntimeInteraction question store (durable SQLite, explicit migration), presentation decisions (preview budgets, grouping, drill-down assembly).
- PERSISTS: activity events, interaction present/respond records, runtime questions. Does NOT persist: definitions, teams, bindings, routing, executions, sessions.
- DERIVES: ParticipantProjection (M9 records + AgentStorage enrichment), workState/membership/assignment (record-type switches in `deriveWorkState :262-279` / `deriveMembership :252-260` / `deriveAssignment :284`), attention, workflow summaries, execution details (tool parts by callID).
- COPIES (denormalized, per-request, read-only): agent name/role/model/provider/team into composed participants (`:757-769` spread-then-overwrite); team names; model display names. Never stored — refreshed each GET.
- RECONSTRUCTS: M10 Map from M9 on boot/staleness (`rebuild()` when `Date.now()-lastProjectionAt > MAX_CURSOR_AGE_MS`, `:711-715`); presence defaults `offline`, never resolved (see §15.4).
- Boundary PRESERVED in code AND behavior: "Activity Room is a generic consumer… does NOT define teams, roles, or model bindings" (m11a header); "Agent/Team authority answers who belongs; M10 answers what is happening" (`:700-704`); composer writes NOTHING back to AgentStorage/threads/conversations (mutations only to RuntimeInteraction presentation state). No Definition mutation, no session control, no execution dispatch from AR paths observed. VERDICT: projection/control-surface rule HOLDS — with ONE structural exception below.

### 13.3 The exception: roster fabrication (PROVEN)

`composeParticipants` 3a (`:749-790`) emits EVERY AgentStorage agent as a participant, including agents with ZERO lifecycle history, synthesizing `membership: joined, presence: offline, workState: available, joinedAt/lastActivityAt: createdAt`. A Definition that never executed appears as a joined-available participant with birth-date timestamps. Catalog presented as room state: "who belongs" becomes indistinguishable from "who is present" in the served roster. The M10-only list exists one call earlier (`lifecycleParticipants`) but is never served unmerged. Severity: MEDIUM-HIGH for any roster-counting consumer (§15). Rule holds for WRITES, bends for READS.

### 13.4 AR-STREAM-TOOL-001 semantics (PROVEN as implemented)

Durable tool evidence = M9 `tool.called/succeeded/failed` facts from the adapter `opencode.message.part.updated` mirror (OpenCode `callID`-keyed); stream timeline rows are NOT one-row-per-tool — tools surface through the OWNING activity's detail (aggregate drill-down retains M9 refs; M11C criterion 11). `filediff.patch` absence stays `unavailable`, never synthesized (Task 02 §8). Correlated operations remain recoverable through owning activity/detail BECAUSE the callID envelope joins part-updates to their activity. No standalone-tool-row path in M11A/M11C composition observed.

## 14. Workflow relationship — Task 05 evidence

Call graph: `WorkflowPanel` (goal + templateId: default/agent-control-restructure/activity-room-premium-redesign) → `workflowApi.start(goal, undefined, template)` (`Agents.tsx:236-250`) → `MULTI_AGENT_WORKFLOW_TEMPLATES[template].stages` (`multi-agent-workflow.ts:116+`) → per-stage `harness.run({threadId, instruction: instructionForStage(spec...), agentId: spec.agentId})` (`:499-504`); `instructionForStage` = acceptance-boundary + `spec.instruction` + prior-output-as-non-authoritative-context (`:512-525`).

Representation verdict (PROVEN): stages reference NEITHER Definition ids NOR AgentRole NOR provider/model. `MultiAgentStageSpec{role, agentId, instruction}` carries ROUTING-BUCKET roles (`planner/developer/verifier/reviewer`) + OPENCODE TWIN names (`vestara-planner/...`). Definition resolution happens only via the Task-03 triple-match (twin-name leg). Workflow supplies NO binding; turns inherit harness precedence. Leakage direction: WORKFLOW OWNS TWIN-NAME ADDRESSING (OpenCode vocabulary in workflow specs) while AGENT OWNS the twin registry — a rename in `agents.registry.ts` silently breaks all templates (no referential check observed). No workflow config in Definition rows; no agent config in workflow stores (beyond thread `metadata{agentId, workflowId}` strings). Leakage = shared twin-name namespace without contract, not field embedding. No redesign per instruction.

## 15. Agents UI audit — Task 05 evidence (PROVEN unless noted)

### 15.1 Surface inventory

`Agents.tsx` page (catalog tabs All/My/System/Custom/**Skill Library**; filters; `AgentCard` grid; `AgentDetailPanel`; `AgentRegistryModal`; `TeamCreatorModal`; `TeamsPanel`; `WorkflowPanel`; `ExecutionSummaryPanel`/`ExecutionChart`; `AgentExecutionHistory`; `AgentHarnessSessions`; `LiveActivityPanel`; `RuntimeStatusBar`; `AgentControlHeader` w/ `.md` sync button) · `AgentProjectionDrawer` (M11C drawer tabs overview/work/configuration/capabilities/activity; draft name/role/description/provider/model/runtimeAgent/capabilities/color/teamId `:528-531`; draft→PUT `:628-663`) · `M11CParticipantRail` + `M11CLiveNowStrip` · legacy `ActivitySidebar/AgentListItem` (telemetry) · `EnhancedComposer` @mention picker (presence-gated `:142-164`) · `GlobalAssistant` online dot · `Routing.tsx` editors · `overview.types.ts` v2 presence comment.

### 15.2 Field authority matrix (UI field → API → domain → authority → class)

| UI field | API | Domain/persistence | True authority | Class |
|---|---|---|---|---|
| name | POST/PUT `/api/agents` | `agents.name` | Definition | Definition configuration |
| role (freeform, placeholder "banana-engineer"; suggestions from persisted rows) | same | `agents.role` TEXT | Stored, unenforced vocab (28/29/UI-28 split) | Definition configuration (unvalidated) |
| agentType workspace\|registry ("Available across workspaces…") | same | `agents.agent_type` | Stored; cross-workspace federation UNPROVEN (single-db product, no federation observed) | Definition configuration; copy OVERCLAIMS (INFERRED) |
| description | same | `agents.description` | Definition (+`.md` frontmatter) | Definition configuration |
| team | `/api/teams` + row `teamId` | `agent_teams.memberIds` AND row back-ref (composer reads both, m11a `:730-743`) | Team authority, dual-source | Definition configuration (dual-write split-brain) |
| color | PUT | `agents.color` | Display-only | Definition configuration |
| capabilities (comma free-text + chips) | PUT | `agents.capabilities` JSON | Stored-but-unenforced labels (Task 02) | Definition configuration (unenforced) |
| provider/model (runtime-vs-config source switch; custom-model fallback; routing-selection prefill `:122-133`) | PUT | `agents.provider/model` | ROUTING configuration w/ verbatim-override effect; "Model configuration / Authoritative registry" caption (`AgentDetailPanel:99-105`) TRUE for Path B, FALSE for Path A (`.md` untouched) | Routing configuration (mislabeled as registry) |
| registrySource/registryVersion ("Marketplace package", "semver") | PUT **as `provider`/`model`** (`AgentRegistryModal:168-169`) | `agents.provider/model` columns | Marketplace strings become routing overrides → `executionModel()` emits e.g. `@vestara/agent-pack/^1.0.0` as model | Routing configuration via MISLABELED control (PROVEN wrong-authority write) |
| runtimeAgent (twin select from `/api/opencode/agents`, labeled "(OpenCode runtime)") | PUT | `agents.runtime_agent` | Persona/adapter address | Persona configuration (correctly labeled) |
| permissions / opencodePermissions / mode / opencodePrompt / status / skills / tools | NO control (neither modal nor drawer draft) | — | Govern behavior but uneditable (status only via card menu PUT) | MISSING controls (by omission) |
| status badge (`active/disabled/unregistered`; `unregistered` = UI-only absent-row state) | GET row `status` | Definition `status` | Definition configuration, NOT liveness (badge file honest: "status value comes from the backend") | Definition configuration |
| card dot + ping + "N active" + stats bar + done counts | `GET /api/agents` enriched `stats` + FUZZY attribution (`Agents.tsx:82-87`: `e.agentId===a.id` OR name-contains OR `e.agentId.includes(a.role)`) | Execution history | Derived metric w/ unsound attribution (role-substring credits stranger executions) | Derived metric (inference — §19) |
| Skills/Tools/Models/Settings detail tabs | NO backing data | — | Static "no additional metadata exposed" for 4/5 tabs | Placeholder/fabricated (PROVEN dead tabs; only Overview wired) |
| Skill Library catalog tab (`capabilities.length>0`) | same rows | capability labels | Relabels agents as "skills" w/o Skill authority (Task 02) | Placeholder/fabricated (PROVEN mislabel) |
| RuntimeStatusBar (Runtime healthy/unknown, upstream, provider list) | `/api/opencode/health` + `/api/opencode/providers` | OpenCode discovery | Runtime availability, correctly NOT agent-scoped | Runtime availability (honest) |
| Harness Sessions (goal/status + thread timeline + WorkflowRail) | harness/workflow APIs | Threads/sessions | Execution state, correctly scoped | Execution state |
| LiveActivityPanel (actor-type=agent groups) | WS event stream | Ephemeral events | Execution activity | Execution state |
| Drawer Overview/Work/Activity tabs | M11A participant + records | M10/M9 | Participant projection (labels say "projected") | Participant projection |
| Drawer Configuration/Capabilities tabs → PUT draft | PUT `/api/agents/:id` | Definition row | Correct target, projection-confused entry (opened via `participantId→agentId` slice) | Definition configuration via projection entry-point |
| Routing page selections + assignments | `/api/routing/*` | `routing.json` / `routing-assignments.json` | Selection real; assignments record-only (Task 03) yet presented as governorship | Routing configuration; assignments UI implies absent authority |

### 15.3 Agent status UX — Task-04 PROVEN-no-liveness applied

- Card dot: `active` → color else grey (`AgentCard:44-58`); ping overlay iff `stats.running>0` — execution-derived decoration on a Definition dot (honest composite, misreadable as alive).
- "N active": `stats.running` = queued|running rows under fuzzy attribution — backlog, not aliveness.
- Detail pill: raw `agent.status` on ALWAYS-success-green styling (`AgentDetailPanel:56-58`) — cosmetic bug: `disabled` renders green.
- `AgentStatusBadge`: only `active/disabled/unregistered` — honest Definition states.
- Legacy `ActivitySidebar.presenceOf` + `AgentListItem` dots: telemetry `AgentState.status` (TEXT-INFERRED from `✓/✗` prefixes and `started/reading/writing` substrings, `TelemetryContext.inferStatus :86-94`, over a HARDCODED 5-agent roster `:58-64` whose ids match NEITHER `agent-*` NOR `vestara-*`) mapped to presence groups active/waiting/idle/failed. THREE inference layers as presence. Versus M11C rail which OMITS presence ("M10 never resolves presence today (uniform 'offline')", "no presence tracking", workState buckets only). Two philosophies: legacy fabricated, M11C honest.
- `EnhancedComposer` @mention gating on heartbeat-socket presence (`/ws/presence`, `use-realtime-presence.ts`) — FOURTH presence source, server publisher NOT established in slice (MISSING provenance — flag Task 06). `overview.types.ts:151` "v2 online/busy presence" — FIFTH vocabulary (DECLARED comment).
- FLAGGED alive-implying displays: card ping + "N active", green-on-disabled pill, legacy presence dots, composer gating, M11A zero-history roster rows. NONE proves "Agent currently alive" from a live-agent authority — none exists (Task 04 PROVEN NO).

### 15.4 Participant-state map (durable / derived / inferred / UI-only)

| State | Value | Verdict | Evidence |
|---|---|---|---|
| presence | `offline` uniform | UI-DEFAULT (hardcoded at construction; "resolved independently" aspirational) | m10 `:193,230`; rail honesty comments |
| workState | available/working/waiting/blocked/attention-required | DERIVED from M9 record types | m10 `deriveWorkState :262-279` |
| status (lifecycle words) | started/completed/failed per record | DERIVED per record; NO participant-level status field exists | projection-types (no status member) |
| membership | joined/left/assigned | DERIVED (`deriveMembership`) | m10 `:252-260` |
| current task (assignment) | workflowRunId/taskId/title | DERIVED when record carries it | m10 `deriveAssignment :284` |
| current execution | NO such field (only `pendingInteractionId`) | MISSING | projection-types `:161-229` |
| last activity | `lastActivityAt` per ingest; zero-history rows use `createdAt` | DERIVED (or FABRICATED-from-birth for zero-history rows) | m10 `:178,198`; m11a `:785-786` |

## 16. Marketplace / installability — Task 05 evidence

- EXISTS: `VestaraPackageManifest{type: 'agent-pack' (+8), contributions.agents: ContributionReference{id,entrypoint?,metadata?}, capabilities: string[], permissions: VestaraPermissionRequest{capability,scope,resources?,approval?}, dependencies[], compatibility{vestara/node/os/arch}, isolation, integrity}` (`extension-contracts:1-112`); detector `*agent*pack|bundle` → `agent-pack` (`type-mapper.ts:22`); `MarketplaceService` + HTTP adapter (search/install/plan/permission-warnings/publish/detect, operation records).
- Declarable TODAY: package identity/version/compat/capability-strings/permission-requests/dependencies/isolation/integrity + OPAQUE agent refs. NOT declarable: role-vocab conformance, persona prompt contract, capability-label semantics, tool-dependency resolution, skill deps (no authority), provider/runtime requirement binding, per-agent grants, twin contract, pinned Definition fields. Envelope exists; agent payload schema MISSING.
- Portable (serializable): id/name/role-label/description/capability-labels/permission-declarations/instruction TEXT. Machine-bound: `provider/model` values, `runtimeAgent` twin (requires twin present), `opencodePermissions` server-schema grants, `.md` frontmatter default, `teamId` FK, `origin/system` flags, absolute directory/repo bindings, session/execution/participant state. Current row mixes both unmarked.
- The registry-type modal path (Source+Version → provider/model columns) is the only "install" gesture and writes into machine-bound routing columns — PROVEN anti-portability.

### Portability verdict (§J): PARTIAL (leaning NO for behavior preservation)

Qualifications travel (labels/declarations/instructions are portable text) but BEHAVIOR does not: twin binding, provider/model override, server-schema grants, and frontmatter default are installation-specific and required for intended execution — fail-closed in conversation path, silently-defaulted in harness path. Portable definition ≠ portable behavior today. PROVEN from Tasks 01–04 chains.

## 17. State-machine inventory — Task 05 consolidation (PROVEN; no unification invented)

| Owner | Machine | States | Persistence | Collisions (same name, different semantics) |
|---|---|---|---|---|
| Definition configuration | `agents.status` | active/disabled (+UI-only `unregistered`) | `agents` col | `active` ≠ presence-active; `disabled` (agent) ≠ `disabled` (provider) ≠ offline |
| Participant projection | membership/presence/workState | joined/left/assigned · online/offline/idle/disconnected (default offline, unresolved) · available/working/waiting/blocked/attention-required | derived/in-memory (+M9) | `waiting` (participant) ≠ `awaiting-approval` (turn) ≠ `waiting` (activity-state); `blocked` (participant←workflow.failed) ≠ `blocked` (turn limit) ≠ `blocked` (verification); `available` (participant) ≠ provider/model `available` |
| Conversation/thread | thread status; conversation-session binding | active/blocked/completed/failed/cancelled/archived; bound/unbound/adopted | `agent-harness.db`; registry Map | completed/failed/cancelled recur across 6+ machines, different writers |
| Turn | `AgentRunState` + outcome + termination + `AssistantTurnStatus` | 11 states; outcome {blocked,completed,failed,cancelled}; termination {completed,failed,timeout,cancelled,detached}; status {completed,failed,cancelled} | durable items | `cancelled` (turn) vs execution-row `failed`-mapping; `blocked` (turn) vs (participant) |
| Execution | `agent_executions` + `ExecutionSession` + DECLARED `ExecutionStatus` | queued/running/completed/failed (+cancelled sessions); requested/binding/ready/…/timed_out (zero writers) | `plans.db` | `running` (row) ≠ `reasoning/awaiting-tool` (turn) ≠ `working` (participant) |
| Workflow | task/projector states; approval awaiting-approval | started/progress/waiting/completed/failed/cancelled + projector variants | orchestration stores | `waiting` × 3 (above) |
| Runtime/session | OpenCode session status; binding lifecycle; DECLARED RuntimeSessionLifecycle | idle/error/…; acquired/adopted/created | server + Map + persisted id | `idle` (session) ≠ `idle` (presence) ≠ card-idle |
| Provider/model availability | health tracker + catalog + discovery | healthy/degraded/unavailable/cooling-down/disabled/auth-required/rate-limited; installed/authenticated/reachable/available/allowed/busy | in-memory + discovery | `available` × 3 scopes; `healthy` (provider) ≠ `healthy` (runtime bar) |
| Permission/approval | policy decisions; approval lifecycles; envelope states | allow/ask/deny (+harness allow-and-notify/require-approval/require-sandbox); pending/approved/rejected/expired (scopes once/session); FsOperation pending/completed/failed/rejected | Maps + thread store + RuntimeInteraction SQLite | `approved` (permission) ≠ `approved` (verification); `session` (approval scope) vs (runtime session) |
| Extension lifecycle | `ExtensionLifecycleState` (marketplace) | discovered/…/enabled/active/disabled/…/quarantined/removed (15) | marketplace stores | `active/disabled` (extension) ≠ `active/disabled` (agent) — same words, different owners |

### §I Global surfaces (scoped note)

No Agent UI was found to OWN Terminal/File Browser/Assistant drawer state: drawer persists only its size via `storageKey`; Agent pages consume WS/SSE + REST, never drawer architecture. Codex Global Terminal/File Browser work is OUT OF SCOPE — dependency found: NONE (PROVEN in slice). No global-drawer change.

## 18. Ownership matrix — Task 06 FINAL (consolidates Tasks 01–05)

### Disposition definitions (architectural ownership, NOT deletion orders)

- **KEEP** — current ownership and semantics already appropriate; successor work preserves them.
- **ADAPT** — correct conceptual owner exists, but contract/semantics/wiring need correction in a successor milestone.
- **MOVE** — concept is valid but currently belongs to the wrong authority/boundary; successor work relocates it (data migration + reference, not erasure).
- **REMOVE** — duplicate/dead/fabricated concept that must not survive as canonical architecture. A REMOVE disposition does NOT authorize deleting source during this audit.
- **MISSING** — required authority/contract does not currently exist; successor work must create it.

### Full matrix (Concept | Declared contract | Current authority | Creation | Persistence | Mutation | Runtime consumer → effect | Projection/UI consumer | Portability | Classification | Disposition | Evidence)

| Concept | Declared contract | Current authority | Creation | Persistence | Mutation | Runtime consumer → effect | Projection/UI consumer | Portability | Class | Disposition | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Agent identity | agent-types `AgentDefinition.id` + workspace `types.ts:607` | Split: `CANONICAL_AGENTS` + `agents.id` PK | Registry literals / POST `agent-${Date.now()}` | PK column | Immutable in practice (PUT forces id; system id-change 400) | Triple-match resolvers (fuzzy) | Drawer/M11A `agent-<id>` composition | Portable (opaque string) | AUTHORITATIVE (split) | ADAPT (exact-match resolution + twin uniqueness; kill role-leg) | Task 01 §4; Task 04 §11.L |
| Agent Definition (system) | agent-types (inert) vs workspace `types.ts:607-629` (effective) | Code + DB rows (split: code=persona, DB=identity/binding/state) | `CANONICAL_AGENTS` literals | Code + `agents` table | Code edit + `reconcileCanonical` | Resolvers, persona, bridges | Agents UI, drawer, M11A roster | Mixed (see §16) | DUPLICATE + AUTHORITATIVE | ADAPT (one contract; split persona out; validate writes) | Task 01 §§4–6 |
| Agent Definition (user) | workspace contract | POST body + row | POST `/api/agents` | `agents` table | PUT REPLACE (unvalidated) | Same minus `.md` renderers | Same minus roster-sync | Mixed | AUTHORITATIVE | ADAPT (same as above) | routes/agents.ts:111-236 |
| agent-types leaf (Definition/Role/Capability) | `@vestara/agent-types` (claims canonical) | NOBODY (zero importers, zero dependents) | — | None | None | None | None (docs only) | N/A | DECLARED | REMOVE (as canonical claim; 002 may keep a re-export shim — implementation detail) | Task 01 §4; workspace package.json (no dep) |
| AgentRole (28/29/UI-28) | agent-types 28 closed; workspace 29 (`+assistant`); UI 28-literal | Workspace TEXT col (effective) | Literals / POST default `custom` | `agents.role` TEXT | PUT freeform | `resolveAgentExecutionFor` role-leg; routing normalization | Dropdowns, badges, drawer lists | Label portable; semantics unenforced | DUPLICATE + AUTHORITATIVE | ADAPT workspace copy (close + validate; rule on `assistant`); REMOVE the other two as authorities | Task 01 §4; Drawer:84-91 |
| RoutingRole / PerformanceRole | `role-compat.ts` (6+6 + pure mappers) | Nobody (no turn-path callers found) | — | None | None | None observed | Docs only | Portable labels | DECLARED / LEGACY | RoutingRole: ADAPT (confirm routing-side home in 002; current seat documented); PerformanceRole: REMOVE (historical only) | role-compat.ts:29-58 |
| AgentType workspace\|registry | Both contracts | Stored; NO behavioral branch found | Registry literals / POST | `agents.agent_type` (v2) | PUT freeform | None observed | Modal copy "Available across workspaces" | N/A | DUPLICATE + AUTHORITATIVE (stored) | ADAPT (define semantics or drop authority claims + copy) | Task 01 §4 gap |
| Description/metadata (name/desc/color/teamId/createdAt) | Both contracts | Definition row | Registry / POST | Columns | PUT merge | `.md` description render; display | Cards, drawer, roster | Portable | AUTHORITATIVE | KEEP (fields); ADAPT team membership (single-writer — dual `memberIds`+back-ref) | agents.registry.ts; m11a:730-743 |
| Persona instructions (`opencodePrompt`) | Explicitly excluded from agent-types BY DESIGN | `CANONICAL_AGENTS` code | Code literals | NOT persisted (rendered to `.md` only) | Code edit | OpenCode server-side load by twin name | — (never re-sent) | Text portable; binding not | AUTHORITATIVE (code) | MOVE (text → persona/materialization authority; Definition keeps REFERENCE per `RoleInstructionRef`) | Task 02 §7 |
| `opencodePermissions` / `mode` | Excluded from agent-types; required on `CanonicalAgent` | Code consts (`FULL/READONLY/INSPECT/ASSISTANT_GRANT`) | Code | NOT persisted (per-read overlay) | Code edit | `.md` frontmatter + `createPolicyForAgent` per-turn policy | — | Server-schema → machine-bound | AUTHORITATIVE (code) | MOVE (runtime persona authority; Definition keeps policy REFERENCE) | agent-storage.ts:409-425 |
| `runtimeAgent` twin name | Workspace extension field | Registry literals / PUT freeform | Code / POST / PUT | `agents.runtime_agent` (v3) | PUT; reconcile backfill | Twin addressing in all 3 turn paths | Twin select UI | Requires twin present → machine-bound | AUTHORITATIVE | MOVE (adapter-address registry; Definition references, never owns) | Task 02 §8; Task 04 §11.L |
| `provider` / `model` on Definition | Optional strings, both contracts | Row wins verbatim (harness); validated fallback (conversation) | Registry / POST / PUT | `agents.provider/model` cols | PUT unvalidated; `updateAgentModel` | `executionModel()` override; `modelRef`; telegram binding; `.md` frontmatter default | "Model configuration" panels | Installation-specific → machine-bound | AUTHORITATIVE (misplaced) | MOVE (to binding/assignment authority; Definition may carry REQUIREMENTS only) | Task 03 §9.3 |
| Capability labels (42) | agent-types 42 closed; workspace 42+`string&{}`; service 36-table | Stored JSON (unenforced) | Registry / POST freeform | `agents.capabilities` JSON | PUT freeform | `hasCapability` display only; NO run-path gate | Filters, tabs, Skill Library | Labels portable; semantics void | DUPLICATE + AUTHORITATIVE (stored) | ADAPT workspace copy (close + validate; labels = qualifications, not gates); REMOVE the other two tables | Task 02 §8; conflict 9 |
| Executable capabilities (12 fs-ops) | `agent-capability.ts` + manager definitions/map/risk | `AgentCapabilityManager` + `FilesystemRuntime` | Code consts | Stateless | Code edit | `execute()` gate → observation | Capability tools; `/capabilities` exec | Mechanism portable; rootDir bound | AUTHORITATIVE | KEEP (only executable capability; correct owner) | manager:32-200 |
| Tools (OpenCode taxonomy + ToolRuntime + per-turn map) | `ALL_TOOL_NAMES` 16; `OpenCodePermissions` keys | OpenCode server executes; Vestara constrains per turn | Server + policy construction | Ephemeral | Policy code | `tools:` map + `respondToPermission` mediation | Projection kinds read/write/edit | Server-bound | AUTHORITATIVE (split) | KEEP (mediation required; taxonomy doubling is load-bearing) | Task 02 §8 |
| Skills (`AgentSkillName/Skill` 20) | `types.ts:487-512` (no columns/manager/consumers) | NOBODY | — | None | None | None ("skill authority ⊆ current authority" — instruction text only) | Skill Library tab (mislabeled caps) | N/A | DECLARED-or-DEAD | MISSING (authority); REMOVE (dead type as canonical) | Task 02 §8; conflict 6 |
| Permission declarations (`AgentPermission[]`) | agent-types + workspace (identical) | Stored rows (declaration side) | Registry / POST | `agents.permissions` JSON | PUT freeform | `AgentPermissionEngine.check` + `CAPABILITY_PERMISSION` map | — | Portable declarations | AUTHORITATIVE (declaration) | KEEP (declaration≠enforcement split is correct by design) | agent-permission.ts |
| Effective policy (capability policy, engine, maps) | `AssistantCapabilityPolicy`; engine; `CAPABILITY_PERMISSION` | Per-turn construction | Code consts + row grants | In-memory per turn | Code | `evaluatePermission` → allow/ask/deny → broker/tools-map | — | Mechanism portable | AUTHORITATIVE | KEEP | assistant-capability-policy.ts |
| `PolicyDecision` vocabularies | permission-contracts 3-valued (canonical) vs harness 5-valued | Both used, different paths | Code | Ephemeral | Code | Assistant path vs harness tool path | — | N/A | DUPLICATE | ADAPT (converge to one vocabulary in 002) | policy-decision.ts:15; harness.ts:47 |
| Human approval (broker ASK) | Broker contract | `AssistantInteractionBroker` Map | Event-time | PROCESS-LOCAL (lost on restart) | N/A (promise resolve) | Turn awaits 10 min → fail-safe reject | Browser POST decision | N/A (ephemeral) | AUTHORITATIVE (volatile) | ADAPT (durable broker or explicit ephemeral semantics) | broker:44; conflict 18 |
| Harness/workflow/RuntimeQuestion approvals | Thread/interaction contracts | Thread store / orchestration store / RuntimeInteraction SQLite | Tool-call time | DURABLE (+boot reconciliation) | `decideApproval` / response continuation | Turn resume/continue | Approval surfaces | N/A | AUTHORITATIVE | KEEP | Task 03 §10.4 |
| MutationEnvelope | `filesystem-runtime/types.ts:40-55` (immutable) | `FilesystemRuntime.pendingApprovals` Map | Pre-evaluate per mutation | PROCESS-LOCAL | N/A | Hash revalidation (repo+preState+content) | — | Mechanism portable | AUTHORITATIVE (one substrate) | KEEP (substrate) + MISSING (envelope-equivalent over OpenCode-native substrate) | index.ts:311-395; conflict 19 |
| Routing requirements/intent | `RoutingIntent` (execution-types, unused) | NOBODY (no field, no turn-path construction) | — | None | — | None | Routing page (no intent input) | N/A | MISSING | MISSING (define in 002: requirements live on Definition see §20) | Task 03 §9.2 |
| `RoutingAssignment` (governor claim) | routing-types + provider-runtime dup | NOBODY reads it in execution | POST `/api/routing/assignments` | `routing-assignments.json` (OCC) | assign/status/side-effects/reassign | NONE (preview/assign APIs only) | Assignments UI (implies governorship) | N/A | DECLARED (as governor) | REMOVE (governor claim + UI implication; see record row) | Task 03 §9.2; conflicts 14-15 |
| `RoutingAssignment` (record store) | Same contracts | `FileRoutingAssignmentStore` | Same API | Same file (durable, OCC, availability-gated writes) | Same API | None | GET list | Portable file | AUTHORITATIVE (as record) | KEEP (as record/audit store; stop presenting as governor) | routing-assignments.ts |
| `resolve()`/catalog/health engine | `EngineeringRoutingRuntime` + catalog + tracker | Engine (preview-only wiring) | Code + discovery | In-memory + `routing.json` selection | Selection API (OCC) | Preview route ONLY | Catalog/selection UI | Mechanism portable | AUTHORITATIVE (engine) / UNWIRED | ADAPT (wire into turn paths or explicitly scope to advisory in 002) | engineering-routing.ts |
| `FileRoutingStore` selection | `VersionedRoutingSelection` | File store (`routing.json`, OCC) | Selection API | Durable file | OCC update | Harness fallback leg ONLY (conversation ignores) | Selection editor | Portable file | AUTHORITATIVE (selection) | ADAPT (document single-fallback semantics; converge paths or scope) | routing-state.ts |
| Provider/model availability | `ProviderAvailability` + tracker + discovery | Tracker + catalog + `listProviders` | Runtime/discovery | In-memory + discovery cache | Health events | Conversation validation; assignment write-gate; NOT harness turns | RuntimeStatusBar; catalog | Environment-bound | AUTHORITATIVE | KEEP (owners right); ADAPT harness (validate-before-complete) | Task 03 §9.4 |
| Participant | `ParticipantProjection` (projection-types) | M10 runtime + M11A composer | Record ingest (`agent-*` derivation) | In-memory Map (rebuilt from M9) | Ingest-only | None (observability only) | Rails/strips/drawer/tabs | N/A (derived) | DERIVED | KEEP (as derived projection); REMOVE catalog-merge (roster fabrication → §20.J) | Task 04 §11.H; Task 05 §13.3 |
| Presence | `PresenceState` (4 vals) | NOTHING (hardcoded `offline`) | Construction default | None | None | None | Dots/gates/rails (5 philosophies) | N/A | UI-DEFAULT (fabricated where shown) | REMOVE (presence claims) + MISSING (real presence iff product requires; else drop UX) | Task 05 §15.3; conflict 33 |
| WorkState | `WorkState` (5 vals) | M10 `deriveWorkState` | Record ingest | In-memory | Ingest-only | None | Rails/strips (honest: workState buckets) | N/A | DERIVED | KEEP | m10:262-279 |
| Conversation | Conversation store contracts | `SqliteConversationStore` + service | sendMessage | `conversations.db` (+`runtime_session_id`) | Message appends | Provider executors | Activity composer; drawer | Workspace-bound | AUTHORITATIVE | KEEP | Task 04 |
| Thread/Turn | `@vestara/types` harness.ts (11 states, items) | `AgentHarnessRuntime` + `FileThreadStore` | `createThread/run` | `threads/agent-harness.db` | `transition/decideApproval`/steering | provider.complete; verification; evidence | Timelines; WorkflowRail; bridges | Machine-durable, portable schema | AUTHORITATIVE | KEEP | harness.ts; Task 04 |
| Execution rows | `AgentExecution`/`ExecutionSession` (workspace) | `AgentStorage` | `createExecution`/`saveExecutionSession` | `plans.db` | Status/timeline updates | Stats; history; run API | Cards; detail; history | Workspace-bound | AUTHORITATIVE (coarse) | ADAPT (reconcile `blocked\|cancelled→failed` conflation; separate terminal vocabularies) | agent-storage.ts; conflict 25 |
| Canonical `ExecutionStatus` (8-state) | execution-types `lifecycle.ts` | NOBODY (zero writers) | — | None | — | None | None | N/A | DECLARED | ADAPT (adopt-via-wiring in 002; until then never read as authoritative) | Task 04 §12.D |
| `ExecutionRequest`/`Binding`/`Observation`/`Result`/`Lineage`/`Artifact` family | execution-types | NOBODY in production (proof adapter only) | — | None | — | None | None | N/A | DECLARED | ADAPT (adopt-via-wiring; `RoleInstructionRef` rule already KEEP) | Task 04 §12.D; conflict 23 |
| `RuntimeExecutionPort` | `port.ts` | Proof `OpenCodeAdapter` (zero callers) | — | None | — | None (all 4 paths bypass) | None | N/A | DECLARED | ADAPT (phased migration target; migration deferred Phase 2 already) | execution-adapter.ts; AR-GA-CORE-004:461 |
| Runtime session (conversation registry) | Registry contract | `AssistantConversationSessionRegistry` Map | First-turn acquire (single-flight) | Map + persisted id (adoption) | Immutable repo; reuse/adopt | Turn continuity | — | Process-bound + server-bound | AUTHORITATIVE (continuity) | ADAPT (document as continuity authority, never agent authority) | assistant-conversation-sessions.ts |
| OpenCode session | Server session | OpenCode server | `createSession` | Server-side | prompt_async/abort | Turns across personas | — | Server-bound | AUTHORITATIVE (container/namespace) | KEEP (with boundary: never identity) | Task 04 §11.C |
| Operation / callID / callId | `OperationId` brand; OpenCode `callID`; harness `callId` | Two families, no join | Event/tool-call time | Ephemeral + thread items / M9 | None | Detail grouping (per family) | Detail drawers (per family) | N/A | AUTHORITATIVE (per family) / MISSING (join) | ADAPT (single correlation record or explicit non-correlation contract) | Task 04 §11.L; conflict 13 |
| Workflow stage refs | `MultiAgentStageSpec{role,agentId twin,instruction}` | Template literals | Template def | Code (+thread metadata strings) | Code edit | Harness triple-match (twin leg) | Template picker | Twin-namespace bound | AUTHORITATIVE (static) | ADAPT (migrate to Definition-identity refs in 002) | multi-agent-workflow.ts:68-100; conflict 36 |
| M9 evidence / M10 projection | activity-room contracts | Durable store / projection runtime | Ingest/derive | m9 sqlite / Map | Append-only / rebuild | Bridges; M11A/B | Room UI (honest paths) | Schema portable | AUTHORITATIVE | KEEP | Task 05 §13 |
| Marketplace agent-pack | `VestaraPackageManifest` + `agent-pack` + opaque `contributions.agents[]` | Detector + MarketplaceService | Publish/detect | Marketplace stores | Install/update ops | None for agents (no agent installer) | Registry modal Source/Version (mislabeled) | Envelope portable; payload schemaless | AUTHORITATIVE (envelope) / MISSING (agent schema) | KEEP envelope; MISSING agent payload schema (002+); REMOVE modal mislabel write | extension-contracts; conflict 30/37 |
| Team membership | `AgentTeam` | Dual: `memberIds` + row back-ref | Team API + PUT | Both stores | Both writers, first-wins read | Composer merge | Teams UI; roster | Workspace-bound | AUTHORITATIVE (split) | ADAPT (single-writer) | m11a:730-743; conflict 34 |
| HTTP actor auth | `AuthUser` + `requireRole` | `authenticate()` (Bearer→header→local-operator/admin) | Request-time | `UserStore` tokens | User admin | Mutation gates (editor) | — | Deployment-bound | AUTHORITATIVE | ADAPT (explicit local-dev vs production modes) | auth.ts:23-81; conflict 20 |
| Legacy telemetry agent universe | `TelemetryContext` (5 hardcoded agents, text-inferred status) | UI context (legacy sidebar) | Hardcode | Ephemeral | Event inference | Legacy sidebar dots | `ActivitySidebar/AgentListItem` | N/A | DUPLICATE (UI-owned domain) | REMOVE (migrate sidebar to M11A-derived state, then retire) | TelemetryContext:58-94; conflict 38 |
| Codex parallel substrate | Codex executor + own defaults | Separate executor | Request-time | None | Env/config | Codex turns (no persona/policy) | — | Vendor-bound | AUTHORITATIVE (parallel) | ADAPT (bring under persona/policy/binding or explicitly scope) | workspace-context.ts:942-960 |
| `CanonicalAgent` code object | `types.ts:636-641` | Registry array | Code | Code (+DB identity half) | Code edit | Renderers + overlays | — | Mixed | AUTHORITATIVE (coupled) | ADAPT (split: Definition record + persona materialization inputs) | Task 01 §6 |
| `DROPPED_BUILT_IN_AGENT_IDS` reconciliation | Registry const | `reconcileCanonical` | Code | Effect on rows | Startup reconcile | — | — | N/A | AUTHORITATIVE (cleanup) | KEEP | agents.registry.ts:520-535 |

## 19. Duplication/conflict report (Tasks 01–05 slice — ranked by architectural risk)

1. **Effective Definition contract is a DUPLICATE, declared canonical is inert** — workspace `types.ts:607` shadows agent-types `agent-definition.ts:38`; zero-importer leaf cannot govern. Risk: HIGH — any future edit to agent-types silently diverges from production. Evidence: import grep, workspace package.json deps.
2. **Role vocabulary triple-split** (agent-types 28 / workspace 29+assistant / UI 28-minus-assistant) with zero validation on write paths. Risk: HIGH — `assistant` rows valid in DB, rejected-or-misrendered downstream; `custom` default escapes routing maps. Evidence: types.ts:456-485; agent-role.ts:21-49; Drawer:84-91; POST default `role||'custom'`.
3. **Capability union divergence** (`string & {}` retained in workspace, removed in agent-types). Risk: MEDIUM-HIGH — stored rows can carry arbitrary capability strings the declared guard would reject; no write-path `isAgentCapability` check observed. Evidence: types.ts:557 vs agent-capability.ts:14-17.
4. **Provider/model embedded in Definition with verbatim-override semantics** (`resolveAgentExecutionFor` bypass). Risk: HIGH — per-agent machine state defeats routing policy; PUT allows arbitrary values unvalidated. Evidence: workspace-context.ts:1875-1881; routes/agents.ts:213-220.
5. **Prompt/policy/mode unpersisted yet persona-critical** — DB rows for system agents are incomplete without code overlay; `/api/agents/sync` renders code ignoring DB, so operator edits to provider/model via UI never reach regenerated `.md` through that path. Risk: MEDIUM — split-brain between stored config and generated runtime. Evidence: agent-storage.ts:409-425; routes/agents.ts:390-395.
6. **`AgentSkill` declared with no authority** (no columns, manager, or consumers in slice). Risk: MEDIUM — marketplace/installability (L) cannot rely on skills until authority proven or declared MISSING. Evidence: types.ts:487-512; no skill columns in migrations.
7. **`runtimeAgent` triple-match fallback** (`id|runtimeAgent|role`) risks identity collapse (role-as-identity). Risk: MEDIUM — recorded for Task G/H to prove. Evidence: workspace-context.ts:1869-1874; assistant-opencode-adapter flows.
8. **No Definition versioning; status enforcement unproven; `AgentType` effect unproven.** Risk: LOW-MEDIUM individually — recorded for state-machine Task. Evidence: no `version` field; no disabled-gate found in slice.

Dead/legacy in slice: `DROPPED_BUILT_IN_AGENT_IDS` (14 retired ids, cleanup-active — not dead code but legacy-surface); `PerformanceRole` (retained for historical normalization, package removed — LEGACY by its own comment); blueprint `CanonicalAgent` snapshots in docs (non-compiled — LEGACY/doc, not runtime DUPLICATE).

Task 02 additions:
9. **Capability description table divergence**: `AgentService.CAPABILITY_DESCRIPTIONS` (`agent-service.ts:17-56`, 36 entries) vs canonical 42 (`agent-types`) vs `CAPABILITY_DESCRIPTIONS` in agent-types — a third DUPLICATE vocabulary used by `GET /api/capabilities`; web-* capabilities absent from the service table. Risk: MEDIUM — UI/API capability catalog disagrees with stored/declared sets. PROVEN.
10. **Stored capability labels unenforced on execution**: `runAgent` gates only `repository:read` (`agent-service.ts:82-89`); `hasCapability` naive `includes` (`agent-permission.ts:48-50`); no label→tool binding observed. Risk: MEDIUM-HIGH — qualification labels present as data, absent as authority. PROVEN (in slice).
11. **Split-brain Path A vs Path B (no conflict resolution)**: code→`.md`→OpenCode persona vs DB→resolvers→per-turn binding/policy. Overlap only at the `agent:` name string. No reconciler, no drift detector between DB provider/model and `.md` frontmatter model, no twin-existence check. Risk: HIGH — silent persona/binding divergence. PROVEN mechanism; impact INFERRED pending runtime probe (no probe run per zero-mutation discipline).
12. **`executeAsTool` agent-identity bypass**: filesystem ops executable without agent gate (ActionRuntime path). Risk: LOW-MEDIUM as designed (own engine gates) but proves Tool ≠ Agent Capability separation is load-bearing — collapsing them would be incorrect. PROVEN (`agent-capability-manager.ts:208-215`).
13. **Two callID families**: OpenCode `part.callID` (conversation/assistant path) vs harness `callId` (tool-result items). Correlation between them MISSING in slice — lineage join unproven. Risk: MEDIUM — recorded for Task H. PROVEN gap.

Task 03 additions:
14. **Routing vocabulary duplicated across packages**: `@vestara/routing-types` vs `@vestara/provider-runtime/routing-types.ts` define parallel `RoleRoutingPolicy/RoutingAssignment/...`; API imports the latter. Risk: HIGH — canonical-claimed package is not the consumed one. PROVEN (`routes/routing.ts:1-14`).
15. **RoutingAssignment is record-only, not runtime-authoritative**: full write API + OCC + availability gate, zero execution readers; `resolve()` engine preview-only. Any operator mental model "assign task → execution follows" is unsupported. Risk: HIGH. PROVEN.
16. **No routing-intent concept in turn paths**: no `RoutingRequest` built, no agent routing requirements, workflow passes static agentIds. Routing = post-hoc override/fallback, never intent-driven. Risk: HIGH for target model (MISSING authority). PROVEN.
17. **Harness turns skip availability validation** (override string passed blind; failure at call time). Conversation validates per turn. Two reliability contracts. Risk: MEDIUM. PROVEN asymmetry.
18. **Approval durability split**: harness + workflow + RuntimeQuestion durable; broker + filesystem-pending process-local. A restart silently converts pending ASK/filesystem approvals into reject/re-request while harness approvals resume — inconsistent operator experience. Risk: MEDIUM-HIGH. PROVEN.
19. **MutationEnvelope governs only one of two mutation substrates**: OpenCode-native file ops bypass it entirely. "Immutable approval-envelope governance" is TRUE for direct capability calls, FALSE for model-driven OpenCode tools. Risk: HIGH (governance coverage claim vs reality). PROVEN.
20. **Absent-credential admin fallback** (`local-operator/admin`) + stub `checkPermission→true` + unvalidated PUT + role-string identity collapse + Codex parallel substrate: five authorization-weakening paths, three intentional-affordance, two shortcut/gap. Risk: HIGH in aggregate (each PROVEN mechanism; exploitability INFERRED, not probed).
21. **Availability/state machines separate-but-ungated**: five stores (definition status, provider health, model discovery, runtime reachability, execution/assignment status) with no cross-guard; disabled-status checked only on some paths. Risk: MEDIUM. PROVEN stores, INFERRED cross-path gaps (full path×gate matrix = Task 06).

Task 04 additions:
22. **No AgentInstance (PROVEN NO)** — liveness is per-thread/turn/session/execution with agent-id strings; nothing is ever "an agent running". Any Agents-screen "agent status" built today would be projection mislabeled as entity state. Risk: HIGH for UI redesign (blocks Task 05/K design). PROVEN by absence across 10 representation families.
23. **`@vestara/execution-types` is a DECLARED city**: ~12 contracts, exactly ONE production-adjacent implementation (proof-only `OpenCodeAdapter`, zero callers; migration explicitly deferred Phase 2). `ExecutionStatus` canonical machine has zero writers; `ExecutionRequest` never constructed in turns. Risk: HIGH — designing against these types as if authoritative repeats the RoutingAssignment error. PROVEN.
24. **Three parallel liveness notions** (`OpenCodeAdapter.isAvailable` listSessions probe vs `AssistantBindingResolver` listProviders discovery vs `GET /api/agents runtime.reachable` annotation) + provider `healthAll` — DUPLICATE availability authorities, none consulted by harness turns. Risk: MEDIUM. PROVEN.
25. **Competing completion semantics**: harness `blocked|cancelled` → execution-row `failed` mapping; DETACHED server-continues vs client-ends; timeout-abort vs later-idle. No reconciliation. Risk: MEDIUM-HIGH for evidence/activity truth. PROVEN (`agent-runtime.ts:98-99`; GA-DETACH-001).
26. **Participant derived-identity masquerading risk**: `agent-<id>` projection ids + displayName fallback invite treating projection as definition; only the human-direction guard exists. Risk: MEDIUM (UI-side; Task 05 to confirm/deny). PROVEN structure.
27. **Restart asymmetry**: durable harness/workflow/questions vs volatile broker/filesystem-pendings/registry-Map/M10-Map. In-flight turns DETACH (server continues, client gone) with lineage surviving only where reconcilers exist. Risk: MEDIUM-HIGH for ops truth after restarts. PROVEN.
28. **Role/twin fuzzy-match wrong-agent binding** (concrete triple-match cases + twin uniqueness gap + harness-fuzzy vs conversation-strict asymmetry) + `callID/callId` non-correlation verdict. Risk: HIGH (identity), MEDIUM (lineage). PROVEN mechanisms.

Task 05 additions:
29. **Roster fabrication (M11A 3a)**: zero-history Definitions served as joined-available participants with birth-date timestamps. Any "agents in room" count or presence inference built on this endpoint inherits catalog-as-liveness. Risk: MEDIUM-HIGH. PROVEN (`activity-room-m11a.ts:749-790`).
30. **`registrySource/registryVersion → provider/model` mislabeled write**: the only install-flavored gesture writes marketplace strings into routing-override columns. Risk: HIGH (wrong-authority mutation path, user-invoked). PROVEN (`AgentRegistryModal:168-169`).
31. **Skill Library tab + Skills/Tools/Models/Settings tabs**: full tab surfaces over nonexistent authorities (Skill MISSING, tools/models/settings unwired). Risk: MEDIUM (fabricated affordances invite reliance). PROVEN dead tabs.
32. **Stats fuzzy attribution** (`Agents.tsx:82-87` name/role substring): execution credit inference presented as agent metrics. Risk: MEDIUM (evidence-grade metrics contaminated). PROVEN mechanism.
33. **Presence five ways**: M10 hardcoded-offline (honest-default) vs legacy telemetry text-inference (fabricated) vs heartbeat socket (unproven publisher) vs overview-v2 comment (declared) vs composer gating (consumer of unproven). Same word, five owners, two honest. Risk: MEDIUM-HIGH for any presence-driven UX. PROVEN.
34. **Team dual-membership** (`memberIds` + row `teamId` back-ref, composer reads both): two writers, first-wins merge, no precedence rule. Risk: MEDIUM. PROVEN (`activity-room-m11a.ts:730-743`).
35. **Green-on-disabled pill + "N active" + ping composites**: styling/wording implies aliveness from Definition+backlog signals. Risk: LOW-MEDIUM individually (copy/styling), HIGH in aggregate if the redesigned screen copies the grammar. PROVEN.
36. **Workflow twin-name namespace sharing** (specs address `vestara-*`, registry owns them, no referential integrity): rename-breaks-silently. Risk: MEDIUM. PROVEN.
37. **Agent-pack envelope without agent schema** (`contributions.agents[]` opaque refs): marketplace can carry, not constrain, agent semantics. Risk: MEDIUM for installability claims. PROVEN.
38. **Legacy TelemetryContext parallel universe** (hardcoded 5-agent roster, alien id namespace, text-inferred status): UI-owned domain state duplicating Agent/Execution authorities. Risk: MEDIUM (dead-or-live ambiguous in slice — consumers: legacy sidebar only, INFERRED scope). PROVEN existence.

### Task 06 conflict resolution (conflict | evidence | severity | affected authority | disposition | rationale | successor)

| # | Disposition | Rationale (1 line) | Successor |
|---|---|---|---|
| 1 inert-leaf vs authoritative duplicate | REMOVE leaf claim | Zero-importer type cannot govern; effective contract is workspace copy | AGENT-CORE-002 (contract home) |
| 2 role triple-split, unvalidated writes | ADAPT workspace / REMOVE others | One closed validated vocabulary; role-leg of triple-match dies with it | 002 (validation) |
| 3 capability `string&{}` divergence | ADAPT (close) / REMOVE agent-types copy | Stored rows must satisfy the guard the leaf already proves correct | 002 |
| 4 provider/model verbatim override | MOVE (binding authority) | Machine assignment is not definition; current precedence is the finding, not the design | 002 (requirements vs assignment) + routing integration |
| 5 unpersisted persona-critical fields | MOVE (persona authority) | Overlay/render split-brain needs one materialization owner | 002 (persona split) |
| 6 skill without authority | MISSING authority / REMOVE dead type | No columns/manager/consumers; tabs claim what doesn't exist | 002+ (skill authority or tab removal in UI redesign) |
| 7 triple-match identity collapse | ADAPT (exact-match + alias table + twin uniqueness) | Role-leg and twin collisions are proven wrong-agent vectors | 002 (resolution rule) |
| 8 no versioning / unproven gates | ADAPT | Status/type need enforced semantics or dropped claims | 002 |
| 9 third capability-desc table (36) | REMOVE | Serve catalog from the single closed vocabulary | 002 |
| 10 stored labels unenforced | ADAPT | Decide: labels qualify selection/display, never gate execution — then enforce THAT | 002 |
| 11 Path A/B no reconciler | ADAPT | One materialization + binding pipeline with drift detection | 002 (persona/binding convergence) |
| 12 `executeAsTool` bypass | KEEP (designed separation) | Own engine gates; proves Tool≠Agent (do not merge) | None (document) |
| 13 dual callIDs, no join | ADAPT | Single correlation record or explicit non-correlation contract | 002 (lineage) |
| 14 routing-types double home | REMOVE provider-runtime dup OR leaf dup (002 decides by consumers, not names) | API consumes provider-runtime copy; canonical claim sits elsewhere | 002 (contract home) |
| 15 assignments record-only | REMOVE governor claim / KEEP record store | Zero execution readers; UI/docs must stop implying governorship | UI redesign (copy) + routing integration |
| 16 no routing intent | MISSING | No requirements field, no `RoutingRequest` construction | 002 (requirements) |
| 17 harness skips availability | ADAPT | Validate-before-complete parity with conversation path | Routing integration |
| 18 approval durability split | ADAPT | Durable broker or explicit ephemeral semantics per family | Permission/runtime convergence |
| 19 envelope covers 1 of 2 substrates | KEEP + MISSING | True for direct calls; envelope-equivalent MISSING for OpenCode-native ops | Permission/runtime convergence |
| 20 five auth-weakening paths | ADAPT (modes/stubs/validation) | Affordances need explicit modes; stub needs owner; PUT needs validation | 002 (validation/auth modes) |
| 21 five ungated state machines | ADAPT | Cross-guard matrix (disabled×unavailable×in-flight) per path | 002 (path×gate matrix) |
| 22 no AgentInstance | KEEP (the finding) | Absence proven across 10 families; UI must not invent entity state | UI redesign (truth table §20.L) |
| 23 execution-types DECLARED city | ADAPT (adopt-via-wiring) | Well-specified; unread-as-authoritative until producers/consumers exist | Phased port migration (existing Phase 2 plan) |
| 24 three liveness notions | ADAPT | One availability composition consulted by all turn paths | Routing integration |
| 25 competing completions | ADAPT | Reconcile or separate terminal vocabularies per machine | 002 (lifecycle) |
| 26 participant masquerade risk | ADAPT (entry-point hygiene) | `agent-<id>` + fallbacks invite definition-confusion; guard the agent direction too | UI redesign |
| 27 restart asymmetry | ADAPT | Reconcile-or-explicit per family; DETACH semantics documented | Permission/runtime convergence |
| 28 twin collisions + fuzzy/strict asymmetry | ADAPT | Same as 7 + per-path parity | 002 |
| 29 roster fabrication | REMOVE (auto-fabrication) | Definition existence ≠ participation; serve lifecycle-derived roster (§20.J) | Activity Room projection correction |
| 30 registry→provider/model mislabel | REMOVE (the write path) | Marketplace strings must never land in routing columns | UI redesign (immediate candidate) |
| 31 dead tabs + Skill Library | REMOVE (surfaces) | No backing authorities; MISSING skill authority tracked separately | UI redesign |
| 32 fuzzy stats attribution | REMOVE (inference) / ADAPT (exact attribution) | Role-substring credit contaminates evidence-grade metrics | UI redesign |
| 33 presence five ways | REMOVE claims / MISSING-or-drop | Only M10-default (honest) + socket (unproven) have standing; pick one or drop UX | UI redesign |
| 34 team dual-membership | ADAPT (single-writer) | First-wins merge is not precedence | 002 |
| 35 aliveness styling grammar | REMOVE (grammar) | Ping/"N active"/green-disabled imply entity liveness that doesn't exist | UI redesign |
| 36 workflow twin-namespace sharing | ADAPT (Definition-identity refs) | Rename-breaks-silently needs referential integrity | Workflow identity migration |
| 37 agent-pack schemaless payload | MISSING (agent schema) | Envelope carries, cannot constrain | Marketplace portability |
| 38 telemetry parallel universe | REMOVE | UI-owned domain duplication; migrate sidebar to M11A-derived state | Legacy cleanup (with verification of liveness) |

## 20. Canonical boundary — Task 06 synthesis (evidence-backed; no implementation)

### D. What belongs to an Agent Definition (verdict on the hypothesis)

The hypothesized shape survives with corrections. An Agent Definition OWNS: stable identity · descriptive metadata (name/description/color/team-refسان) · closed validated role classification · instruction/persona REFERENCE (never prompt text) · declared capability labels + tool/skill REQUIREMENTS-or-references · permission REQUIREMENTS/policy reference · runtime/routing REQUIREMENTS (capabilities needed, constraints, preferences — never concrete binding). ADAPT items: role vocabulary (close it), capability labels (close + unenforce-as-gate), team (single-writer), type (define or drop).

Explicitly NOT persisted on Definition (each evaluated): `provider` NO (concrete assignment — MOVE to binding; a `preferredProvider` requirement MAY stay) · `model` NO (same) · `runtimeAgent` NO (adapter address — MOVE to twin registry; Definition references) · OpenCode permissions NO (server-schema grant — MOVE to persona materialization) · OpenCode prompt NO (runtime text — MOVE; reference stays) · OpenCode mode NO (dispatch hint — MOVE) · presence/workState/online-offline NO (derived projection, recomputed) · current execution NO (MISSING field correctly absent; executions reference agents, not vice versa) · runtime session NO (continuity container outlives and outscopes any agent) · participant membership NO (team authority + derived projection own it).

### E. AgentInstance verdict PRESERVED: PROVEN NO (no contradictory evidence in Tasks 01–05)

Nothing found reopens it. The synthesis therefore uses the proven decomposition: `AgentDefinition` → (participant projection · execution actor attribution · runtime binding per turn · requirements/policy refs); `Execution` → `Runtime Session` (continuity) → `Operations` (tool calls). No `AgentInstance` box appears in the diagram (§O) because no evidence requires one.

### F. Requirement vs assignment (conceptual, not implementation)

| Requirement (Definition-owned, portable, validated at rest) | Assignment (execution-owned, ephemeral, resolved per turn) |
|---|---|
| provider/model REQUIREMENTS (ids wanted, capabilities needed, constraints) | provider/model ASSIGNMENT (concrete binding on the prompt; today's row-override becomes a resolution INPUT, never a verbatim bypass) |
| capability declaration (labels: what the agent is qualified for) | executable capability (the 12 fs-ops + policy gate at call time) |
| permission requirement (resource×action×approval-required rows) | PolicyDecision + human approval + enforcement event (per request, durable where required) |
| persona reference (`RoleInstructionRef`: registry id + role + optional pin) | runtime materialization (`.md` render + per-turn `agent:`/`tools:`/`model:`/`system:` assembly) |

Today's override/fallback behavior is RECORDED as current-authoritative but must NOT be preserved silently: verbatim row-wins bypassing policy and availability is classified MOVE + ADAPT, i.e. the resolution pipeline in 002 re-derives precedence from requirements, and any preserved override becomes an explicit, validated, logged precedence rule — not an accident of column placement.

### G. OpenCode leakage matrix (concept | OpenCode representation | coupling today | desired boundary | disposition)

| twin names (`vestara-*`) | `prompt_async.agent` + workflow specs + `.md` filenames | Addressing vocabulary shared across 3 turn paths + workflow + files | Twins live in an adapter-address registry; Vestara core references Definition ids; resolution at the boundary | ADAPT (resolution rule + uniqueness) |
| `.opencode/agents/*.md` | Generated agent files (both repos) | Vestara renders; OpenCode loads; no reverse read | Stays DERIVED materialization; single renderer; drift-checked (already) | KEEP (with twin-registry inputs) |
| frontmatter (`mode/model/permission`) | Server agent defaults | Code-authored; DB edits invisible to it | Rendered FROM persona authority (post-MOVE), never from Definition rows directly | ADAPT (source alignment) |
| `opencodePrompt` | `.md` body = server system prompt | Code-embedded in Definition object | Persona authority owns text; Definition holds reference | MOVE |
| `opencodePermissions` | Server permission defaults + per-turn policy seed | Code-embedded; dual-consumed (render + policy) | Persona authority; per-turn policy derived at boundary | MOVE |
| `mode` | Server dispatch hint | Code-embedded, unpersisted | Persona materialization input | MOVE |
| OpenCode tool taxonomy | Policy keys + projection kinds + `tools:` map | Required for mediation; conflates Tool with Capability vocabularies | Keep mediation; NAME the vocabularies distinctly (Tool vs Capability vs PermissionAction) | KEEP mechanism + ADAPT naming |
| OpenCode session ID | Continuity key | Carried alongside (never equated with) agent ids | Continuity container/tool namespace; never identity | KEEP boundary (proven clean) |
| `directory` binding | Agent-resolution scope | Required repo root; `.vestara`-dir defect history | Composition-owned constant, never UI-supplied | KEEP |
| `callID` | Tool-operation identity (conversation path) | Authoritative per family; no cross-family join | Per-family authority + explicit correlation-or-non-correlation contract | ADAPT |

`.md` = DERIVED materialization and session = continuity container are PRESERVED as architectural invariants into 002.

### H. Routing boundary synthesis

- Currently authoritative: agent-row override (harness) · requested+validated binding (conversation) · `FileRoutingStore` role fallback (harness only) · server/runtime defaults · `EngineeringRoutingRuntime` as DECISION ENGINE (but preview-wired) · file stores as DURABLE RECORDS.
- Declared but unused: `RoutingAssignment` as governor · `resolve()` in turn paths · `RoutingIntent` in turns · routing requirements on agents.
- Architecturally missing: intent/requirements vocabulary on Definition · resolution pipeline invoked by all turn paths · availability pre-check parity · assignment write-back (execution records its binding for lineage) · twin-existence validation.
- 002 directive (design, not implementation): make resolution EXPLICIT (requirements → candidates → evidence → binding → recorded lineage) and make today's silent fallbacks either explicit rules or errors. No new pipeline built here.

### I. Permission boundary synthesis (final split)

Agent policy declaration (rows; portable; versioned with Definition) ≠ effective execution policy (per-turn constructed from grants + request context) ≠ PolicyDecision (ephemeral, three-valued, single vocabulary post-convergence) ≠ human approval (durable where the turn may outlive the process: harness/workflow/questions; explicitly-ephemeral where it may not: broker ASK with fail-safe) ≠ immutable mutation envelope (direct substrate today; envelope-equivalent MISSING for OpenCode-native substrate — discrepancy PRESERVED, not normalized) ≠ runtime enforcement (per-substrate gates) ≠ evidence (thread items + audit_log + M9 + bundles; volatile histories labeled as such). The two-substrate reality (direct capability calls vs model-driven OpenCode tools) is the central permission finding: one governance story cannot cover both until envelope-equivalence exists.

### J. Activity Room boundary + roster-fabrication disposition

Preserved: Activity Room = projection/control surface; M9 = durable evidence; M10 = projection (in-memory, rebuilt). Roster-fabrication disposition: REMOVE the auto-merge. Architecturally the participants endpoint serves (a) lifecycle-derived participants (M10) as THE roster, plus optionally (b) a separately-typed, explicitly-labeled catalog section ("configured agents without observed activity" — never `joined`, never `available`, timestamps labeled `configuredAt`, not `joinedAt`). Definition existence alone is NOT participation evidence. Implementation belongs to the projection-correction milestone, not this audit.

### K. Workflow boundary

Current twin-name coupling RECORDED with disposition ADAPT (Definition-identity references). Canonical workflow configuration should reference: Definition identity (YES — stable, resolvable, auditable) · role (YES as routing-bucket hint, validated against the closed vocabulary) · runtime twin (NO — resolved at dispatch from the twin registry, never stored in specs) · routing assignment (NO — assignments are execution-time records addressed by task, not configuration). No workflow modified here.

### L. UI truth table (what the redesigned Agents screen may truthfully claim)

| UI concept | May claim (truthful today) | Must NOT claim (unsupported/fabricated) |
|---|---|---|
| configured | Field values as stored (name/role/desc/caps/provider/model/twin/team/color) | That stored values are validated, closed-vocabulary, or effective on all paths (Path A/B split) |
| enabled | `status` is `active` (Definition flag) | That `active` means alive, available, or enforced on every path (path-dependent) |
| available | Provider discovery says the configured provider/model exists RIGHT NOW (fresh probe, timestamped) | That availability at render time implies availability at execution time (no pre-check on harness path) |
| participating | M10-derived participant with observed lifecycle records (show the records) | That catalog membership = participation (roster fabrication); that presence is known (uniform `offline`) |
| executing | Attributed running/queued execution ROWS with exact-match (`agentId===id`) attribution + links | Fuzzy name/role-substring attribution; backlog counts as aliveness ("N active") |
| waiting | Durable `awaiting-approval` turn or pending interaction with id + link | Participant `waiting` as agent-state; broker pendings (volatile) as durable |
| blocked | Named owner + cause: turn-iteration-limit vs workflow-failure vs verification-blocked (three different `blocked`s) | A single "blocked agent" state |
| online | NOTHING today (no presence authority) — omit or label UNKNOWN (M11C-correct) | Any dot/label derived from status, telemetry text-inference, socket of unproven provenance, or roster presence |
| healthy | Runtime/server health + provider health, scoped and timestamped — never per-agent | Per-agent health (no such authority); green styling as health evidence |

### M. Portability boundary

Portable definition concerns: identity · descriptive metadata · closed role label · persona REFERENCE (id+role+pin; text resolved at install) · capability labels · tool/skill REQUIREMENT refs · permission requirement rows · routing REQUIREMENTS (capabilities/constraints/preferences). Installation-bound bindings: concrete provider/model · twin name · server-schema grants · frontmatter defaults · team FKs · origin flags · directory/repo bindings. Generated artifacts (`.md`, sessions, participants, executions) NEVER travel. Workspace-specific authority (teams, routing files, stores) re-resolves at install. verdict stays PARTIAL-leaning-NO until the agent payload schema exists (Marketplace portability milestone).

### O. Canonical boundary diagram (evidence-backed; every box proven, no symmetry filler, no AgentInstance)

```
                        ┌─────────────────────────┐
                        │     AgentDefinition     │  stable identity · metadata ·
                        │  (requirements + refs)  │  closed role · persona REF ·
                        │   ports: config reads;  │  capability labels · tool/skill
                        │   NEVER live state      │  REQs · permission REQs · routing REQs
                        └────┬────────┬───────┬───┘
              persona REF │    │ binding REQs │ policy REFs
                          ▼    ▼              ▼
               ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
               │Persona/Adapter│  │Routing       │  │Permission        │
               │materialization│  │resolution    │  │evaluation        │
               │(twin registry │  │(requirements │  │(PolicyDecision   │
               │ + .md DERIVED │  │ → candidates │  │ + human approval │
               │ + per-turn    │  │ → EVIDENCED  │  │ + envelope(s))   │
               │ assembly)     │  │ binding)     │  └────────┬─────────┘
               └──────┬───────┘  └──────┬───────┘           │ allow/ask/deny
                      │ agent: name     │ binding           │
                      └────────┬────────┴──────────┬────────┘
                               ▼                   ▼
                     ┌─────────────────────────────────┐
                     │            Execution            │  actor=agent-id · objective ·
                     │  (durable rows: queued→running  │  recorded binding lineage ·
                     │   →completed|failed; terminal   │  per-path completion semantics
                     │   vocabularies SEPARATE)        │  reconciled, not conflated)
                     └───────────────┬─────────────────┘
                                     ▼
                     ┌─────────────────────────────────┐
                     │   Runtime Session (continuity)  │  conversation registry /
                     │   OpenCode session = tool/op    │  harness env passthrough /
                     │   namespace (NEVER identity)    │  server sessions
                     └───────────────┬─────────────────┘
                                     ▼
                     ┌─────────────────────────────────┐
                     │  Operations / Tools (callID     │  per-family op identity ·
                     │  vs callId + correlation        │  capability-gated (direct)
                     │  contract)                      │  or policy-mediated (OpenCode)
                     └───────────────┬─────────────────┘
                                     ▼
                     ┌─────────────────────────────────┐
                     │  Evidence (M9 durable → M10     │  observations/artifacts/
                     │  projection → Activity Room     │  bundles; owning-activity
                     │  PROJECTION ONLY)               │  grouping by callID
                     └─────────────────────────────────┘
   Participant projection (DERIVED, lifecycle-only roster) feeds the room;
   Workflow references Definition identity + role hint (twin resolved at dispatch);
   Marketplace carries portable Definition + refs (bindings re-resolve at install).
```

Boxes omitted deliberately: AgentInstance (PROVEN NO), unified agent lifecycle (proven distributed), RoutingAssignment-as-governor (record-only), canonical ExecutionStatus-as-authority (zero writers — adopted only via wiring).

## 21. Recommended successor milestones — Task 06 FINAL (ordered by dependency/authority, not UI convenience)

1. **AGENT-CORE-002 — Canonical contracts + Definition home.** Single Definition contract; closed validated vocabularies (role/capability); write-path validation; persona split (reference vs text); requirements-vs-assignment fields; resolution rule (exact-match + alias + twin uniqueness); path×gate matrix. Unblocks everything below.
2. **Authority/persistence migration.** Persona materialization owner; binding store (durable per-execution binding lineage); team single-writer; approval durability per family; `blocked|cancelled→failed` reconciliation. (Runs with 002; ordered after contract shape.)
3. **Routing integration.** Wire `resolve()`+catalog+availability into all turn paths; availability pre-check parity; twin-existence validation; assignments either governed or de-scoped in docs/UI. Depends on 1–2.
4. **Permission/runtime convergence.** Single `PolicyDecision` vocabulary; durable-or-explicit broker semantics; envelope-equivalence for the OpenCode-native substrate (or explicit two-substrate governance); Codex substrate scoped; auth modes explicit; stub resolved. Depends on 1–2.
5. **OpenCode adapter isolation.** Twin registry; single `.md` renderer from persona authority; per-turn assembly from binding+policy; `RuntimeExecutionPort` phased migration (existing Phase 2 plan); taxonomy naming (Tool vs Capability vs PermissionAction). Depends on 1–4.
6. **Workflow identity migration.** Stage refs → Definition identity + role hint; twin resolved at dispatch; referential integrity. Depends on 1, 5.
7. **Activity Room projection correction.** Remove roster auto-fabrication (§20.J); lifecycle-only roster + labeled catalog section; participant entry-point hygiene. Depends on 1 (identity rule). No execution-authority change (rule already holds).
8. **Agents UI redesign.** Built on the §20.L truth table: exact attribution; validated inputs; mislabeled controls removed (registry→provider/model path first); dead tabs removed; presence omitted until an authority exists; Path A/B presented honestly. Depends on 1–7 (claims must exist before screens show them).
9. **Marketplace portability.** Agent payload schema (portable vs installation-bound split per §20.M); install re-resolution of bindings; twin/grant/provider requirement satisfaction. Depends on 1–5.
10. **Legacy cleanup.** TelemetryContext retirement (after sidebar migration to M11A-derived state); PerformanceRole sunset; agent-types leaf re-export-or-retire; `agent:` block guards retained. Last — nothing above may depend on it.

---
*AGENT-CORE-001 COMPLETE. Tasks 01–06 evidenced. No source mutated except this audit document. No implementation, migrations, contract edits, UI edits, cleanup, staging, or commit performed. All 21 required sections present; every material conclusion cites source files/symbols/lines and carries PROVEN / INFERRED / MISSING. KEEP/ADAPT/MOVE/REMOVE assigned as architectural dispositions only (Task 06 authority).*

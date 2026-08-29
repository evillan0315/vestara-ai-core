# ARX-015 — Production Activity Room Stabilization DevelopmentPlan

**Date:** 2026-08-27
**Status:** Planning Complete — Awaiting Architectural Review
**Architecture Input:** `docs/activity-room/arx-015-architecture-review.md` (Revision 2, frozen)
**Authoritative Repository:** `vestara-ai-core`
**Reference Repository:** `vestara-platform` (evidence only, no runtime dependency)

---

## Part I — Repository and Contract Evidence

### 1. Capability Classification

Every required capability is classified against existing `vestara-ai-core` implementations:

| # | Capability | Classification | Rationale |
|---|-----------|---------------|-----------|
| C1 | Canonical execution identity | **ADD** | 13 identity types defined in ARX-015 Rev 2 §1; none exist with the required semantics |
| C2 | Canonical event envelope | **EXTEND** | `EventEnvelope` in `@vestara/types` and `@vestara/events` exist; add `EventHeader`, `traceId`, converge on shared contract |
| C3 | Engineering event store | **EXTEND** | `engineering_events` table exists with 18 columns; add `runtime_id`, `trace_id`, `workflow_run_id` |
| C4 | AI routing engine | **KEEP** | `EngineeringRoutingRuntime` is architecturally complete (14 capabilities, 6 roles, 6 profiles) |
| C5 | ResolvedAiBinding | **ADD** | Does not exist; must be created with per-invocation/assignment scope |
| C6 | Execution policy | **ADD** | Only implicit via env vars; must implement layered enforcement model |
| C7 | Workflow orchestrator | **KEEP** | Mature (9 SQLite tables, 3 state machines, `runTask()`); extend with `WorkflowRun` |
| C8 | Legacy WorkflowRuntime | **KEEP→MAP** | Simple step executor; ownership mapping required before any deprecation |
| C9 | Agent definitions | **KEEP** | 5 canonical agents fully defined in `agents.registry.ts` |
| C10 | Harness session adapter | **KEEP** | `HarnessExecutionAdapter` maps agent runtime to harness |
| C11 | resolveAgentExecution | **EXTEND** | Exists but unwired; must connect to routing engine |
| C12 | Workspace resolution | **KEEP** | Full pipeline (discover → fingerprint → analyze → manifest) |
| C13 | RepositoryBinding | **KEEP** | Exists via `workspace.json`; must become explicit execution directory authority |
| C14 | OpenCode HTTP client | **KEEP** | 38/162 endpoints implemented; hand-rolled, pinned OpenAPI contract |
| C15 | OpenCode event bridge | **KEEP** | `OpenCodeEventBridge` normalizes SSE events to `EventBus` |
| C16 | Session registry | **EXTEND** | `InMemorySessionRegistry` works; must persist to SQLite |
| C17 | Permission registry | **EXTEND** | `InMemoryPermissionRegistry` works; must persist to SQLite |
| C18 | Activity projection pipeline | **KEEP** | 6 projectors, redaction, append-only; production-quality |
| C19 | Activity Room API | **KEEP** | Timeline, state, messages, receipts; working |
| C20 | Evidence pipeline | **KEEP** | PCS-026 with 8 evidence kinds, confidence engine |
| C21 | Browser tools | **KEEP** | 5 tools with information governance |
| C22 | Token budget | **EXTEND** | `TokenBudget` exists; must persist and connect to actual usage |
| C23 | Recovery manager | **KEEP** | Kernel recovery + thread recovery + activity stream recovery |
| C24 | Event bus | **KEEP** | `InProcessEventBus` with pattern matching, retry, metrics |
| C25 | Types layer | **EXTEND** | `@vestara/types` has 29 branded IDs; add `TraceId`, `WorkflowRunId`, `BindingId` |
| C26 | Shared layer | **KEEP** | Zero-dep foundation; runtime service interfaces |
| C27 | TUI | **KEEP** | Production-ready; connects via HTTP + WebSocket |
| C28 | Telegram integration | **ADD** | Complete gap; no package, routes, or bot |
| C29 | Browser bridge/streaming | **ADD** | No standalone browser service or WS proxy |
| C30 | MCP integration | **EXTEND** | Minimal worker exists; needs lifecycle management |
| C31 | LSP integration | **KEEP** | Proxied via OpenCode; sufficient for production |
| C32 | Formatter integration | **ADD** | Detected in profiling but not agent-triggerable |
| C33 | Skills | **KEEP** | OpenCode-native; no Vestara registry needed |
| C34 | Commands | **EXTEND** | TUI-level only; needs platform-level registry |
| C35 | File search/symbols | **KEEP** | Full via OpenCode proxy |
| C36 | Questions flow | **ADD** | Permission gate exists in types; no runtime flow |
| C37 | Cost analytics | **ADD** | Basic budget exists; no actual token counting from providers |
| C38 | Restart/recovery certification | **ADD** | Subsystems exist; no cross-service coordination certification |

### 2. OpenCode Contract Disposition

**Pinned contract:** OpenAPI 3.1.0 schema at `packages/opencode-runtime/openapi/opencode.openapi.json`
**Checksum:** `sha256:6e553fc2c1eba76c0767fa126415bfb06df87c890f54c7df964fdbb41ba988a3`
**SDK:** No npm SDK dependency. Hand-rolled `OpenCodeHttpClient` with typed interface.
**Auth:** HTTP Basic Auth, `OPENCODE_SERVER_PASSWORD` required.
**Server:** Headless OpenCode on port 4096.

**Disposition legend:**
- **SDK_NATIVE** — Implemented in `OpenCodeHttpClient`, used in production
- **HTTP_ADAPTER** — In pinned spec, not in client; to be added via `OpenCodeHttpClient` extension
- **INTERNAL_ONLY** — Vestara owns the canonical service; OpenCode operation is not proxied
- **ADMIN_API** — Administrative/management endpoint; exposed only if explicitly needed
- **NORMALIZED_VESTARA_API** — OpenCode operation is normalized through Vestara domain services
- **INDIRECT_CAPABILITY** — Capability exists but is represented through a different mechanism
- **UNSUPPORTED_BY_PINNED_VERSION** — Not available in this pinned OpenAPI version
- **INTENTIONALLY_EXCLUDED** — Available but excluded from ARX-015 scope for architectural reasons

#### Endpoint Disposition Matrix

| Domain | Endpoint | Method | Disposition | Vestara Owner | Notes |
|--------|----------|--------|-------------|---------------|-------|
| **Health/Discovery** | `/global/health` | GET | SDK_NATIVE | `OpenCodeRuntime` | Health check |
| | `/doc` | GET | SDK_NATIVE | Compatibility engine | Contract verification |
| | `/path` | GET | SDK_NATIVE | Workspace resolver | Path info |
| | `/vcs` | GET | SDK_NATIVE | Workspace resolver | VCS info |
| | `/provider` | GET | SDK_NATIVE | Provider catalog | Provider list |
| | `/agent` | GET | SDK_NATIVE | Agent registry | Agent list |
| | `/command` | GET | SDK_NATIVE | Command registry | Command list |
| | `/lsp` | GET | SDK_NATIVE | Discovery normalizer | LSP status |
| **Projects** | `/project` | GET | SDK_NATIVE | Workspace resolver | Project list |
| | `/project/current` | GET | SDK_NATIVE | Workspace resolver | Current project |
| | `/project/{id}` | PATCH | HTTP_ADAPTER | — | Future: project update |
| | `/project/{id}/directories` | GET | HTTP_ADAPTER | — | Future: directory listing |
| | `/project/git/init` | POST | INTENTIONALLY_EXCLUDED | — | Vestara manages VCS |
| **Sessions** | `/session` | GET | SDK_NATIVE | Session registry | List sessions |
| | `/session` | POST | SDK_NATIVE | Session registry | Create session |
| | `/session/{id}` | GET | SDK_NATIVE | Session normalizer | Get session |
| | `/session/{id}` | PATCH | SDK_NATIVE | Session normalizer | Rename session |
| | `/session/{id}` | DELETE | SDK_NATIVE | Session registry | Delete session |
| | `/session/status` | GET | SDK_NATIVE | Session normalizer | Session status |
| | `/session/{id}/todo` | GET | SDK_NATIVE | Session normalizer | Session todos |
| | `/session/{id}/children` | GET | SDK_NATIVE | Session normalizer | Child sessions |
| | `/session/{id}/diff` | GET | SDK_NATIVE | Session normalizer | Session diff |
| | `/session/{id}/init` | GET | SDK_NATIVE | Session lifecycle | Init session |
| | `/session/{id}/share` | POST | SDK_NATIVE | Session normalizer | Share session |
| | `/session/{id}/share` | DELETE | SDK_NATIVE | Session normalizer | Unshare session |
| | `/session/{id}/summarize` | POST | SDK_NATIVE | Session normalizer | Summarize session |
| | `/session/{id}/revert` | POST | SDK_NATIVE | Session normalizer | Revert session |
| | `/session/{id}/unrevert` | POST | SDK_NATIVE | Session normalizer | Unrevert session |
| | `/session/{id}/abort` | POST | SDK_NATIVE | Session control | Abort session |
| | `/session/{id}/fork` | POST | HTTP_ADAPTER | — | Future: session fork |
| | `/session/{id}/context` | GET | HTTP_ADAPTER | Session normalizer | Session context |
| | `/session/{id}/event` | GET | INDIRECT_CAPABILITY | OpenCode event bridge | Per-session SSE (global SSE used) |
| | `/session/{id}/history` | GET | HTTP_ADAPTER | Session normalizer | Session history |
| | `/session/{id}/agent` | POST | HTTP_ADAPTER | Agent registry | Switch session agent |
| | `/session/{id}/model` | POST | HTTP_ADAPTER | Provider catalog | Switch session model |
| | `/session/{id}/compact` | POST | HTTP_ADAPTER | Session lifecycle | Compact session |
| | `/session/{id}/interrupt` | POST | HTTP_ADAPTER | Session control | Interrupt session |
| | `/session/{id}/wait` | POST | HTTP_ADAPTER | Session control | Wait for session |
| | `/session/active` | GET | HTTP_ADAPTER | Session registry | List active sessions |
| **Messages** | `/session/{id}/message` | GET | SDK_NATIVE | Session normalizer | List messages |
| | `/session/{id}/message` | POST | SDK_NATIVE | AI invocation | Send message |
| | `/session/{id}/prompt_async` | POST | SDK_NATIVE | AI invocation | Async prompt |
| | `/session/{id}/message/{mid}` | DELETE | HTTP_ADAPTER | — | Future: delete message |
| | `/session/{id}/message/{mid}/part/{pid}` | DELETE | INTENTIONALLY_EXCLUDED | — | Message part editing not needed |
| | `/session/{id}/message/{mid}/part/{pid}` | PATCH | INTENTIONALLY_EXCLUDED | — | Message part editing not needed |
| **Commands** | `/session/{id}/command` | POST | SDK_NATIVE | Command registry | Run command |
| **Permissions** | `/session/{id}/permissions/{pid}` | POST | SDK_NATIVE | Permission registry | Respond to permission |
| | `/session/{id}/permissions` | GET | HTTP_ADAPTER | Permission registry | List permissions |
| | `/session/{id}/permissions/{pid}` | GET | HTTP_ADAPTER | Permission registry | Get permission |
| | `/session/{id}/permission` | POST | HTTP_ADAPTER | Permission registry | Request permission |
| | `/permission` | GET | HTTP_ADAPTER | Permission registry | List all permissions |
| | `/permission/{rid}/reply` | POST | HTTP_ADAPTER | Permission registry | Reply to permission |
| **Questions** | `/session/{id}/question` | GET | HTTP_ADAPTER | Question flow | List questions |
| | `/session/{id}/question/{rid}/reply` | POST | HTTP_ADAPTER | Question flow | Reply to question |
| | `/session/{id}/question/{rid}/reject` | POST | HTTP_ADAPTER | Question flow | Reject question |
| | `/question` | GET | HTTP_ADAPTER | Question flow | List all questions |
| | `/question/{rid}/reject` | POST | HTTP_ADAPTER | Question flow | Reject question (global) |
| | `/question/{rid}/reply` | POST | HTTP_ADAPTER | Question flow | Reply to question (global) |
| **Files/Search** | `/find` | GET | SDK_NATIVE | File normalizer | Find text |
| | `/find/file` | GET | SDK_NATIVE | File normalizer | Find files |
| | `/find/symbol` | GET | SDK_NATIVE | File normalizer | Find symbols |
| | `/file/content` | GET | SDK_NATIVE | File normalizer | Read file |
| | `/file/status` | GET | SDK_NATIVE | File normalizer | File status |
| | `/file` | GET | HTTP_ADAPTER | File normalizer | List files |
| **Shell** | `/session/{id}/shell` | POST | SDK_NATIVE | Shell tool | Run shell |
| **Events** | `/event` | GET | SDK_NATIVE | OpenCode event bridge | Global SSE |
| | `/global/event` | GET | INDIRECT_CAPABILITY | OpenCode event bridge | Global SSE (alias) |
| **Providers/Auth** | `/provider/{id}` | GET | HTTP_ADAPTER | Provider catalog | Get provider |
| | `/provider/auth` | GET | HTTP_ADAPTER | Provider catalog | Auth status |
| | `/provider/{id}/oauth/authorize` | POST | HTTP_ADAPTER | Provider catalog | Start OAuth |
| | `/provider/{id}/oauth/callback` | POST | HTTP_ADAPTER | Provider catalog | OAuth callback |
| | `/auth/{id}` | PUT | ADMIN_API | Provider catalog | Set auth |
| | `/auth/{id}` | DELETE | ADMIN_API | Provider catalog | Delete auth |
| **Config** | `/config` | GET | INTERNAL_ONLY | Configuration | Vestara owns config |
| | `/config` | PATCH | INTERNAL_ONLY | Configuration | Vestara owns config |
| | `/config/providers` | GET | INTERNAL_ONLY | Provider catalog | Vestara owns provider config |
| | `/global/config` | GET | ADMIN_API | Configuration | Global config |
| | `/global/config` | PATCH | ADMIN_API | Configuration | Global config update |
| **MCP** | `/mcp` | GET | HTTP_ADAPTER | MCP worker | List MCP servers |
| | `/mcp` | POST | HTTP_ADAPTER | MCP worker | Add MCP server |
| | `/mcp/{name}/connect` | POST | HTTP_ADAPTER | MCP worker | Connect MCP |
| | `/mcp/{name}/disconnect` | POST | HTTP_ADAPTER | MCP worker | Disconnect MCP |
| | `/mcp/{name}/auth/*` | POST | HTTP_ADAPTER | MCP worker | MCP auth (4 endpoints) |
| **LSP** | `/lsp` | GET | SDK_NATIVE | Discovery normalizer | LSP status |
| **Formatter** | `/formatter` | GET | HTTP_ADAPTER | — | Future: formatter status |
| **VCS** | `/vcs/apply` | POST | HTTP_ADAPTER | — | Future: apply VCS changes |
| | `/vcs/diff` | GET | HTTP_ADAPTER | — | Future: VCS diff |
| | `/vcs/diff/raw` | GET | HTTP_ADAPTER | — | Future: raw VCS diff |
| | `/vcs/status` | GET | HTTP_ADAPTER | — | Future: VCS status |
| **PTY** | `/pty/*` | GET/POST/PUT/DELETE | INTENTIONALLY_EXCLUDED | — | PTY not needed for ARX-015 |
| **Skills** | `/skill` | GET | INDIRECT_CAPABILITY | OpenCode native | Skills are OpenCode-native |
| **Logging** | `/log` | POST | INTERNAL_ONLY | Logger | Vestara owns logging |
| **Sync** | `/sync/*` | POST | INTENTIONALLY_EXCLUDED | — | Sync not needed for ARX-015 |
| **TUI** | `/tui/*` | POST | INTENTIONALLY_EXCLUDED | — | TUI compatibility not proxied |
| **Global** | `/global/dispose` | POST | ADMIN_API | OpenCode runtime | Dispose global |
| | `/global/upgrade` | POST | ADMIN_API | OpenCode runtime | Upgrade OpenCode |
| | `/instance/dispose` | POST | ADMIN_API | OpenCode runtime | Dispose instance |
| **Experimental** | `/experimental/*` | ALL | INTENTIONALLY_EXCLUDED | — | Experimental endpoints excluded |

#### Capability Disposition Summary

| Capability | Disposition | Vestara Service | OpenCode Dependency |
|-----------|-------------|-----------------|---------------------|
| Health check | SDK_NATIVE | `OpenCodeRuntime` | `/global/health` |
| Contract verification | SDK_NATIVE | Compatibility engine | `/doc` |
| Path/VCS discovery | SDK_NATIVE | Workspace resolver | `/path`, `/vcs` |
| Provider/model discovery | SDK_NATIVE | Provider catalog | `/provider` |
| Agent discovery | SDK_NATIVE | Agent registry | `/agent` |
| Command discovery | SDK_NATIVE | Command registry | `/command` |
| LSP status | SDK_NATIVE | Discovery normalizer | `/lsp` |
| Project listing | SDK_NATIVE | Workspace resolver | `/project` |
| Session CRUD | SDK_NATIVE | Session registry | `/session` |
| Session lifecycle | SDK_NATIVE | Session normalizer | `/session/{id}/*` |
| Message send/receive | SDK_NATIVE | AI invocation | `/session/{id}/message` |
| Async prompts | SDK_NATIVE | AI invocation | `/session/{id}/prompt_async` |
| Command execution | SDK_NATIVE | Command registry | `/session/{id}/command` |
| Permission response | SDK_NATIVE | Permission registry | `/session/{id}/permissions/{pid}` |
| File search | SDK_NATIVE | File normalizer | `/find/*`, `/file/*` |
| Shell execution | SDK_NATIVE | Shell tool | `/session/{id}/shell` |
| SSE events | SDK_NATIVE | OpenCode event bridge | `/event` |
| AI model routing | NORMALIZED_VESTARA_API | Engineering routing | Via AI binding, not direct proxy |
| Execution policy | INTERNAL_ONLY | Execution policy | Vestara-owned, not proxied |
| Token budget | INTERNAL_ONLY | Token budget | Vestara-owned, not proxied |
| Activity Room | INTERNAL_ONLY | Activity projection | Vestara-owned, not proxied |
| Workflow orchestration | INTERNAL_ONLY | Workflow orchestrator | Vestara-owned, not proxied |
| Evidence pipeline | INTERNAL_ONLY | Evidence pipeline | Vestara-owned, not proxied |
| Repository binding | INTERNAL_ONLY | Workspace runtime | Vestara-owned, not proxied |
| Session persistence | NORMALIZED_VESTARA_API | Persistent session registry | OpenCode session + Vestara binding |
| Unmanaged detection | NORMALIZED_VESTARA_API | Session registry | OpenCode list + Vestara binding diff |
| Session reconciliation | NORMALIZED_VESTARA_API | Session registry | OpenCode list + Vestara binding compare |
| Provider auth | HTTP_ADAPTER | Provider catalog | `/provider/{id}/oauth/*`, `/auth/{id}` |
| MCP lifecycle | HTTP_ADAPTER | MCP worker | `/mcp/*` |
| VCS operations | HTTP_ADAPTER | — | `/vcs/*` |
| Formatter status | HTTP_ADAPTER | — | `/formatter` |
| Skills | INDIRECT_CAPABILITY | OpenCode native | Skills are OpenCode-native tools |
| Questions | HTTP_ADAPTER | Question flow | `/session/{id}/question/*` |
| Session fork | HTTP_ADAPTER | — | `/session/{id}/fork` |
| Session context | HTTP_ADAPTER | Session normalizer | `/session/{id}/context` |
| Session history | HTTP_ADAPTER | Session normalizer | `/session/{id}/history` |
| Agent/model switch | HTTP_ADAPTER | Agent registry | `/session/{id}/agent`, `/session/{id}/model` |
| Session compact | HTTP_ADAPTER | Session lifecycle | `/session/{id}/compact` |
| Session interrupt | HTTP_ADAPTER | Session control | `/session/{id}/interrupt` |
| Session wait | HTTP_ADAPTER | Session control | `/session/{id}/wait` |
| Active sessions | HTTP_ADAPTER | Session registry | `/session/active` |
| PTY | INTENTIONALLY_EXCLUDED | — | Not needed for ARX-015 |
| TUI compatibility | INTENTIONALLY_EXCLUDED | — | Not proxied; TUI connects directly |
| Sync | INTENTIONALLY_EXCLUDED | — | Not needed for ARX-015 |
| Experimental | INTENTIONALLY_EXCLUDED | — | Not stable |
| Config management | INTERNAL_ONLY | Configuration | Vestara owns config |
| Logging | INTERNAL_ONLY | Logger | Vestara owns logging |

#### Coverage Summary

| Disposition | Count | Percentage |
|-------------|-------|------------|
| SDK_NATIVE | 38 | 23% |
| HTTP_ADAPTER | 35 | 22% |
| INTERNAL_ONLY | 6 | 4% |
| ADMIN_API | 6 | 4% |
| NORMALIZED_VESTARA_API | 4 | 2% |
| INDIRECT_CAPABILITY | 3 | 2% |
| INTENTIONALLY_EXCLUDED | 18 | 11% |
| UNSUPPORTED_BY_PINNED_VERSION | 0 | 0% |
| Not yet dispositioned (future HTTP_ADAPTER) | 52 | 32% |
| **Total** | **162** | **100%** |

**Key architectural decision:** Vestara does not proxy all 162 OpenCode endpoints. It normalizes OpenCode capabilities through Vestara domain services (session registry, provider catalog, agent registry, permission registry, file normalizer, event bridge). Administrative and experimental endpoints are excluded. PTY, TUI compatibility, and sync are intentionally excluded from ARX-015 scope.

### 3. ARX-014D Reference Evidence Evaluation

| # | Concept | Recommendation | Rationale |
|---|---------|---------------|-----------|
| CI-1 | DevelopmentPlan = immutable WHAT | **ADOPT** | `WorkflowPlan` in `vestara-ai-core` already has plan revisions and approval linkage; the semantic match is close. Adopt the invariant that plans are immutable after approval. |
| CI-2 | WorkflowRun = mutable execution state | **ADOPT** | The orchestrator tracks project phase but not individual run attempts. `WorkflowRun` is needed for run-level cost attribution and debugging. Implement as a new first-class type. |
| CI-3 | Developer Runtime/CAR/OpenCode = HOW | **ADOPT** | Already satisfied by current separation. The runtime determines how, not what. Formalize as invariant. |
| CI-4 | Stable task IDs | **ADOPT** | `orchestrated_tasks` uses stable IDs. Verify that retries and re-runs do not change task IDs. Adopt invariant. |
| CI-5 | DAG validation before execution | **ADOPT** | `task-graph.ts` exists but is unused. Wire into `generatePlan`. Adopt after wiring. |
| CI-6 | Sequential bounded execution by default | **ADAPT** | The orchestrator already has concurrency bounds. Adapt to explicitly require sequential DAG execution unless parallelism is declared. |
| CI-7 | Concurrent duplicate starts → single logical WorkflowRun | **ADOPT** | Must be implemented in orchestrator. Adopt as requirement for `WorkflowRun`. |
| CI-8 | Runtime-session acquisition → single-flight | **ADOPT** | Must be verified against session registry. Adopt as invariant for session lifecycle. |
| CI-9 | Repository binding → authoritative execution directory | **ADOPT** | Aligns with ARX-015-004. Adopt. Replace `process.cwd()` with explicit resolution. |
| CI-10 | Workflow continuity → reuse root runtime session | **ADAPT** | Adapt to `vestara-ai-core`'s session lifecycle. When resuming work, reuse the existing session rather than creating a new one. |
| CI-11 | Verification → hermetic unless explicitly live | **ADOPT** | Aligns with §6 execution policy. Adopt as default verification mode. |

### 4. Orchestration Ownership Resolution (U8)

**U8 asks:** Where does governed execution logic belong?

**Existing vestara-ai-core orchestration ownership:**

| Component | Current Responsibility |
|-----------|----------------------|
| `WorkflowOrchestrator.runTask()` | Task dispatch, approval gateway, token budget, file locks, retry, review stage, test stage |
| `HarnessExecutionAdapter` | Maps agent runtime to harness thread |
| `ActivityProjectionService` | Projects events to Activity Room |
| `ExecutionPolicy` (planned) | Layered enforcement model |

**Decision:** The governed execution logic (policy enforcement at operation time) belongs in the **Runtime Adapter** layer (§6.3 of architecture review), not in the orchestrator. The orchestrator selects the execution-level policy. The runtime adapter enforces it per-operation.

**Resolution:** U8 is resolved at **M3 (Execution Policy & Budget)**. The orchestrator's `runTask()` already handles approval gates and token budgets. The runtime adapter (OpenCode adapter) handles per-operation policy enforcement. No new `GovernedActivityRunner` class is needed. The governance logic is distributed across:
- Orchestrator: execution-level policy selection
- Runtime adapter: per-operation enforcement
- Approval system: exception granting

This matches the ARX-014D reference architecture where the runner was a thin enforcement layer. In `vestara-ai-core`, that thin layer is the runtime adapter's policy check.

---

## Part II — Milestone Structure

### Dependency Graph

```
M1  Canonical Identity & Lineage
 │
 ├─→ M2  Canonical Event Contract
 │    │
 │    ├─→ M3  Execution Policy & Budget
 │    │    │
 │    │    └─→ M4  AI Resolution & Execution Binding
 │    │         │
 │    │         └─→ M5  Repository Authority & Confinement
 │    │              │
 │    │              └─→ M6  OpenCode Contract & Client Extension
 │    │                   │
 │    │                   ├─→ M7  Runtime Session Continuity
 │    │                   │    │
 │    │                   │    └─→ M8  Workflow Run & DAG
 │    │                   │         │
 │    │                   │         └─→ M9  Durable Activity Room
 │    │                   │              │
 │    │                   │              └─→ M10  Projection & Attention
 │    │                   │                   │
 │    │                   │                   └─→ M11  Activity Room API & UI
 │    │                   │                        │
 │    │                   │                        ├─→ M12  Contextual Assistant
 │    │                   │                        │
 │    │                   │                        ├─→ M15  Telegram Gateway
 │    │                   │                        │
 │    │                   │                        └─→ M16  Live Visual Browser
 │    │                   │
 │    │                   ├─→ M13  Provider/Model Analytics
 │    │                   │
 │    │                   └─→ M14  Native Agent/Subagent Distinction
 │    │
 │    │
 │    │    M12 ─┐
 │    │    M13 ─┤
 │    │    M14 ─┼─→ M17  Production Certification
 │    │    M15 ─┤
 │    │    M16 ─┘
```

### First Implementation Tranche (M1–M6)

These milestones establish the control-plane contracts that everything afterward inherits. They are foundations, not UI features. **Checkpoint after M6:** Review milestone boundaries, especially M4 (AI binding), M5 (confinement), and M6 (OpenCode extension).

### Implementation Progression

Sequential, one milestone at a time. No concurrent implementation.

```
M1 → verify/evidence → accept →
M2 → verify/evidence → accept →
M3 → verify/evidence → accept →
M4 → verify/evidence → accept →
M5 → verify/evidence → accept →
M6 → integration checkpoint
```

**Hermetic verification:** Ordinary unit/integration tests must remain hermetic. No real OpenCode sessions. No paid/live AI providers unless a test is explicitly classified as `live`.

---

## Part III — Milestone Definitions

---

### M1 — Canonical Identity & Lineage

**ID:** ARX-015-M1
**Title:** Canonical Identity & Lineage
**Objective:** Establish the 13 canonical identity types with single owners, creation sites, and propagation rules. Add `traceId` and `workflowRunId` branded IDs. Wire `correlationId` derivation from `executionId`.

**Architectural Owner:** Workflow Orchestrator + Types Layer
**Prerequisites:** None (first milestone)
**Contracts Introduced:** `TraceId`, `WorkflowRunId`, `BindingId` branded IDs in `@vestara/types`. Identity ownership table (§1.1 of architecture review). 7 identity invariants (INV-ID-1 through INV-ID-7).

**Implementation Scope:**
1. Add `TraceId`, `WorkflowRunId`, `BindingId` to `packages/types/src/ids.ts`
2. Add `trace_id` column to `engineering_events` table (new migration in `packages/engineering-event-store/src/migrations.ts`)
3. Add `workflow_run_id` column to `engineering_events` table
4. Create `resolveCorrelationId(executionId)` utility that always derives from execution ID
5. Document identity ownership in `docs/IDENTITY-OWNERSHIP.md`
6. Write tests for ID generation, derivation, and collision resistance

**Explicit Non-Goals:** No workflow run type implementation (M7). No AI binding type (M3). No session persistence (M6).

**Migration Impact:** New SQLite columns (additive, no data loss). New branded ID types (additive).

**Dependencies:** None
**Acceptance Criteria:**
- All 13 identity types have defined owners in documentation
- `trace_id` and `workflow_run_id` columns exist in engineering event store
- `correlationId` is always derived from `executionId`
- No identity is reused across process restarts
- All existing tests pass

**Verification:** `pnpm lint:check && pnpm build && pnpm test`
**Required Evidence:** Migration test, ID generation test, collision resistance test
**Rollback:** Drop new columns (additive migration). Remove new ID types (additive).

---

### M2 — Canonical Event Contract

**ID:** ARX-015-M2
**Title:** Canonical Event Contract
**Objective:** Define `EventHeader` as the shared immutable metadata contract. Add `traceId` and `causationId` to the header. Begin convergence of three parallel envelope types.

**Architectural Owner:** Events Layer + Types Layer
**Prerequisites:** M1 (traceId type exists)
**Contracts Introduced:** `EventHeader` interface in `@vestara/types`. `causationId` as first-class field (already in `@vestara/events`, missing from `@vestara/types`).

**Implementation Scope:**
1. Define `EventHeader` in `packages/types/src/events.ts` with fields: `id`, `type`, `timestamp`, `source`, `correlationId`, `causationId`, `traceId`, `severity`
2. Add `causationId` field to `@vestara/types` `EventEnvelope` (already present in `@vestara/events`)
3. Add `traceId` field to `@vestara/types` `EventEnvelope`
4. Create adapter functions: `toEventHeader(envelope)`, `fromEventHeader(header, payload)`
5. Update engineering event store bridge to populate `EventHeader` fields consistently
6. Write tests for header construction, adapter round-trip, and bridge consistency

**Explicit Non-Goals:** No removal of `VestaraEvent` (deferred). No collapse of envelope types.

**Migration Impact:** Additive fields on existing types. No schema changes.

**Dependencies:** M1
**Acceptance Criteria:**
- `EventHeader` type exists and is documented
- All three envelope types can produce an `EventHeader`
- Engineering event store bridge populates `traceId` and `causationId` consistently
- Existing tests pass

**Verification:** `pnpm lint:check && pnpm build && pnpm test`
**Required Evidence:** Header adapter test, bridge consistency test
**Rollback:** Remove `EventHeader` type (additive). Remove adapter functions (additive).

---

### M3 — Execution Policy & Budget

**ID:** ARX-015-M3
**Title:** Execution Policy & Budget
**Objective:** Implement the layered enforcement model: execution default → task/capability constraints → effective operation policy → runtime enforcement. Resolve U8 (governed execution placement).

**Architectural Owner:** Workflow Orchestrator + Runtime Adapter
**Prerequisites:** M2 (EventHeader exists for policy events)
**Contracts Introduced:** `ExecutionPolicy`, `TaskCapabilityConstraint`, `EffectiveOperationPolicy` types. Layered enforcement invariants (INV-POL-1 through INV-POL-5).

**Implementation Scope:**
1. Define `ExecutionPolicy` type with `hermetic | governed | live` modes
2. Define `TaskCapabilityConstraint` type for task-level overrides
3. Define `EffectiveOperationPolicy` type resolved at operation time
4. Add `executionPolicy` field to orchestrator project/task types
5. Implement policy resolution: `resolveEffectivePolicy(executionDefault, taskConstraints, approvals)`
6. Wire policy check into OpenCode adapter's operation methods
7. Write tests for policy resolution and enforcement

**Explicit Non-Goals:** No AI binding (M4). No Activity Room policy display (M12). No Telegram policy gates (M16).

**Migration Impact:** New types (additive). No schema changes.

**Dependencies:** M2
**Acceptance Criteria:**
- `ExecutionPolicy` type exists with three modes
- Policy resolution produces correct effective policy from defaults + constraints
- Policy violations are recorded as events
- Existing tests pass

**Verification:** `pnpm lint:check && pnpm build && pnpm test`
**Required Evidence:** Policy resolution test, enforcement test
**Rollback:** Remove policy types (additive).

---

### M4 — AI Resolution & Execution Binding

**ID:** ARX-015-M4
**Title:** AI Resolution & Execution Binding
**Objective:** Establish authoritative AI resolution: agent/task AI requirements → provider/model routing → immutable `ResolvedAiBinding` → actual AI invocation → persisted/event-sourced provider/model/fallback/selection facts. No AI invocation may silently bypass the authoritative resolved binding.

**Architectural Owner:** Provider Runtime + Agent Harness
**Prerequisites:** M3 (execution policy for binding constraints)
**Contracts Introduced:** `ResolvedAiBinding` at per-invocation/assignment scope. `AiResolutionService` for binding creation. `AiInvocationGuard` for enforcement. Persisted `resolved_ai_bindings` table. Event-sourced binding facts.

**Implementation Scope:**
1. Define `ResolvedAiBinding` type (§4.2 of architecture review):
   - `bindingId`, `executionId`, `workflowRunId?`, `taskId?`, `agentAssignmentId?`, `aiRequestId?`
   - `agentId`, `role`, `invocationScope`
   - `providerId`, `modelId`, `routingDecisionId`, `routingProfile`
   - `requiredCapabilities`, `fallbackUsed`, `fallbackReason?`
   - `resolvedAt`, `immutable: true`
2. Add `resolved_ai_bindings` SQLite table with lineage columns
3. Implement `AiResolutionService.resolve(request)`:
   - Input: `AiResolutionRequest { agentId, role, executionId, taskId?, requiredCapabilities, policy }`
   - Calls `EngineeringRoutingRuntime.resolve()`
   - Creates immutable `ResolvedAiBinding`
   - Persists to SQLite
   - Emits `ai:binding.resolved` event to engineering event store
   - Returns binding
4. Implement `AiInvocationGuard.check(binding)`:
   - Called before every AI invocation
   - Verifies binding exists and is active
   - Verifies provider/model matches binding
   - Denies invocation if no valid binding
5. Wire `resolveAgentExecution` callback to `AiResolutionService`:
   - Agent harness calls `resolveAgentExecution(agent, executionContext)`
   - Returns `ResolvedAiBinding` for the invocation
6. Wire guard into OpenCode adapter's `sendMessage()` and `sendMessageAsync()`:
   - Before sending, call `AiInvocationGuard.check(binding)`
   - If guard fails, emit `ai:binding.violation` event and abort
7. Implement binding lineage queries:
   - `getBindingsByExecution(executionId)` → all bindings for an execution
   - `getBindingsByWorkflowRun(workflowRunId)` → all bindings for a run
   - `getBindingsByTask(taskId)` → all bindings for a task
8. Implement event-sourced binding facts:
   - `ai:binding.resolved` — binding created
   - `ai:binding.invoked` — binding used for invocation
   - `ai:binding.fallback` — fallback triggered
   - `ai:binding.violation` — guard denied invocation
9. Write tests for:
   - Binding creation with lineage
   - Guard enforcement (allow + deny)
   - Multiple bindings per execution
   - Lineage queries
   - Event emission

**Explicit Non-Goals:** No token counting (M13). No Activity Room binding display (M12). No Telegram binding gates (M16).

**Migration Impact:** New SQLite table (`resolved_ai_bindings`). New types (additive).

**Dependencies:** M3
**Acceptance Criteria:**
- `ResolvedAiBinding` is immutable at invocation scope
- Multiple bindings can exist per execution (one per agent/role/invocation scope)
- Each binding carries lineage: `executionId`, `workflowRunId?`, `taskId?`, `agentAssignmentId?`, `aiRequestId?`
- `resolveAgentExecution` is wired to `AiResolutionService`
- `AiInvocationGuard` denies invocations without valid binding
- All binding events are persisted to engineering event store
- Lineage queries return correct results
- No AI invocation bypasses the guard after migration
- Existing tests pass

**Verification:** `pnpm lint:check && pnpm build && pnpm test`
**Required Evidence:** Binding creation test, guard enforcement test, lineage query test, event emission test, bypass prevention test
**Rollback:** Drop `resolved_ai_bindings` table (additive). Remove guard (additive). Routing falls back to static agent definitions.

---

### M5 — Repository Authority & Confinement

**ID:** ARX-015-M5
**Title:** Repository Authority & Confinement
**Objective:** Make `RepositoryBinding` the explicit authority for execution directory. Replace implicit `process.cwd()` resolution with explicit binding resolution.

**Architectural Owner:** Workspace Runtime
**Prerequisites:** M4 (AI binding exists for execution context)
**Contracts Introduced:** `resolveExecutionDirectory(binding)` utility. `RepositoryBinding.authoritative` flag.

**Implementation Scope:**
1. Add `authoritative` flag to `RepositoryBinding` type
2. Create `resolveExecutionDirectory(binding)` utility that returns the authoritative path
3. Audit 51 `process.cwd()` instances; replace with explicit resolution where in execution context
4. Add `repositoryBindingId` to orchestrator project type
5. Wire binding resolution into orchestrator's `runTask()` before task dispatch
6. Write tests for binding resolution, directory confinement, and `process.cwd()` replacement

**Explicit No-Goals:** No workspace resolution changes (already working). No OpenCode cwd changes (M6).

**Migration Impact:** Additive field on project type. No schema changes.

**Dependencies:** M4
**Acceptance Criteria:**
- `RepositoryBinding` has `authoritative` flag
- `resolveExecutionDirectory()` returns correct path
- At least 20 `process.cwd()` instances replaced in execution contexts
- Orchestrator uses binding for task dispatch directory
- Existing tests pass

**Verification:** `pnpm lint:check && pnpm build && pnpm test`
**Required Evidence:** Binding resolution test, confinement test, process.cwd() audit report
**Rollback:** Remove `authoritative` flag (additive). Restore `process.cwd()` (manual).

---

### M6 — OpenCode Contract & Client Extension

**ID:** ARX-015-M6
**Title:** OpenCode Contract & Client Extension
**Objective:** Extend the OpenCode HTTP client for capabilities in the pinned spec but not yet implemented. Establish the adapter boundary for contract compatibility.

**Architectural Owner:** OpenCode Runtime
**Prerequisites:** M5 (repository authority for session cwd)
**Contracts Introduced:** Extended `OpenCodeClient` interface with new methods. `OpenCodeAdapterBoundary` for raw HTTP operations.

**Implementation Scope:**
1. Extend `OpenCodeHttpClient` for high-priority HTTP_ADAPTER endpoints (see Part I §2 disposition matrix):
   - `listActiveSessions()` → `GET /session/active`
   - `getSessionContext()` → `GET /session/{id}/context`
   - `getSessionHistory()` → `GET /session/{id}/history`
   - `switchSessionAgent()` → `POST /session/{id}/agent`
   - `switchSessionModel()` → `POST /session/{id}/model`
   - `compactSession()` → `POST /session/{id}/compact`
   - `interruptSession()` → `POST /session/{id}/interrupt`
   - `waitSession()` → `POST /session/{id}/wait`
   - `listQuestions()` → `GET /session/{id}/question`
   - `replyToQuestion()` → `POST /session/{id}/question/{rid}/reply`
   - `rejectQuestion()` → `POST /session/{id}/question/{rid}/reject`
2. Create `OpenCodeAdapterBoundary` class for raw HTTP operations that bypass the typed client
3. Update contract compatibility checker to cover new endpoints
4. Write tests for new client methods and adapter boundary

**Explicit Non-Goals:** No TUI endpoints. No experimental endpoints. No PTY endpoints. No MCP endpoints (deferred).

**Migration Impact:** New client methods (additive). New adapter boundary class (additive).

**Dependencies:** M5
**Acceptance Criteria:**
- At least 10 new client methods implemented
- `OpenCodeAdapterBoundary` exists for raw HTTP operations
- Contract compatibility checker covers new endpoints
- All new methods have tests
- Existing tests pass

**Verification:** `pnpm lint:check && pnpm build && pnpm test`
**Required Evidence:** Client method tests, adapter boundary test, compatibility check test
**Rollback:** Remove new client methods (additive). Remove adapter boundary (additive).

---

### M7 — Runtime Session Continuity

**ID:** ARX-015-M7
**Title:** Runtime Session Continuity
**Objective:** Persist runtime session bindings to SQLite. Implement managed vs. unmanaged session detection. Support session reconciliation on restart.

**Architectural Owner:** OpenCode Runtime + Session Registry
**Prerequisites:** M5 (OpenCode client extended for session operations)
**Contracts Introduced:** `PersistentSessionRegistry` (SQLite-backed). `SessionBinding` with `managed | unmanaged | abandoned` status. Reconciliation protocol.

**Implementation Scope:**
1. Create `runtime_session_bindings` SQLite table with columns: `open_code_session_id`, `vestara_session_id`, `workspace_id`, `execution_id`, `agent_id`, `created_by`, `created_at`, `status`
2. Implement `PersistentSessionRegistry` implementing `SessionRegistry` interface
3. Migrate `InMemorySessionRegistry` to `PersistentSessionRegistry`
4. Implement session reconciliation: on startup, compare bindings against OpenCode's actual sessions
5. Mark stale bindings as `abandoned`, active bindings as re-verified
6. Implement unmanaged session detection: sessions in OpenCode not in binding table are classified as `unmanaged`
7. Write tests for persistence, reconciliation, and unmanaged detection

**Explicit Non-Goals:** No Activity Room session display (M11). No session sharing UI.

**Migration Impact:** New SQLite table. Replace in-memory registry with persistent one.

**Dependencies:** M5
**Acceptance Criteria:**
- `runtime_session_bindings` table exists with correct schema
- Session bindings survive restart (write, restart, read back)
- Reconciliation correctly identifies stale and active bindings
- Unmanaged sessions are classified correctly
- `requireSessionOwnership()` works with persistent registry
- Existing tests pass

**Verification:** `pnpm lint:check && pnpm build && pnpm test`
**Required Evidence:** Persistence test, reconciliation test, unmanaged detection test
**Rollback:** Drop table (additive). Restore `InMemorySessionRegistry` (backward compatible).

---

### M8 — Workflow Run & DAG

**ID:** ARX-015-M8
**Title:** Workflow Run & DAG
**Objective:** Introduce `WorkflowRun` as a first-class type. Wire DAG validation into plan generation. Implement duplicate-start single-flight.

**Architectural Owner:** Workflow Orchestrator
**Prerequisites:** M3 (execution policy), M6 (session continuity)
**Contracts Introduced:** `WorkflowRun` type. DAG validation. Single-flight duplicate start.

**Implementation Scope:**
1. Define `WorkflowRun` type: `runId`, `projectId`, `phase`, `status`, `startedAt`, `completedAt`, `cost`
2. Create `orchestrated_workflow_runs` SQLite table
3. Implement `createWorkflowRun(projectId)`, `getWorkflowRun(runId)`, `updateWorkflowRun(runId, patch)`
4. Wire `WorkflowRun` creation into `startProject()` and `resume()`
5. Wire DAG validation from `task-graph.ts` into `generatePlan()` (CI-5)
6. Implement duplicate-start single-flight: if two requests try to start the same project, only one run is created (CI-7)
7. Write tests for run lifecycle, DAG validation, and single-flight

**Explicit Non-Goals:** No cost tracking (M13). No concurrent execution (future).

**Migration Impact:** New SQLite table (`orchestrated_workflow_runs`).

**Dependencies:** M3, M6
**Acceptance Criteria:**
- `WorkflowRun` type exists with lifecycle methods
- `orchestrated_workflow_runs` table exists
- DAG validation runs before execution
- Duplicate start produces single logical run
- `WorkflowRun` is linked to `executionId` lineage
- Existing tests pass

**Verification:** `pnpm lint:check && pnpm build && pnpm test`
**Required Evidence:** Run lifecycle test, DAG validation test, single-flight test
**Rollback:** Drop table (additive). Remove `WorkflowRun` type (additive).

---

### M9 — Durable Activity Room

**ID:** ARX-015-M9
**Title:** Durable Activity Room
**Objective:** Persist message receipts to SQLite. Ensure Activity Room state survives restart. Wire evidence bundles to projection pipeline.

**Architectural Owner:** Activity Projection + Activity Room API
**Prerequisites:** M7 (workflow runs for activity context)
**Contracts Introduced:** `MessageReceiptStore` (SQLite-backed). `EvidenceBundleProjector`.

**Implementation Scope:**
1. Create `message_receipts` SQLite table with columns: `message_id`, `activity_id`, `delivered_at`, `read_at`, `receipt_status`
2. Implement `SqliteMessageReceiptStore` replacing in-memory Map
3. Create `EvidenceBundleProjector` that projects `VerificationEvidenceBundle` to Activity Room
4. Wire evidence projector into projection pipeline
5. Write tests for receipt persistence and evidence projection

**Explicit Non-Goals:** No Activity Room UI redesign (M11). No attention engine (M10).

**Migration Impact:** New SQLite table (`message_receipts`). New projector (additive).

**Dependencies:** M7
**Acceptance Criteria:**
- Message receipts survive restart
- Evidence bundles appear in Activity Room timeline
- Receipt counts are accurate after restart
- Existing tests pass

**Verification:** `pnpm lint:check && pnpm build && pnpm test`
**Required Evidence:** Receipt persistence test, evidence projection test
**Rollback:** Drop table (additive). Remove projector (additive).

---

### M10 — Projection & Attention

**ID:** ARX-015-M10
**Title:** Projection & Attention
**Objective:** Implement attention/incident engine over effective state. Derive priority from activity records.

**Architectural Owner:** Activity Projection
**Prerequisites:** M8 (durable Activity Room)
**Contracts Introduced:** `AttentionEngine`, `AttentionSignal`, `IncidentPriority`.

**Implementation Scope:**
1. Define `AttentionSignal` type: `signalId`, `activityId`, `priority`, `reason`, `createdAt`
2. Define `IncidentPriority` as `critical | high | medium | low`
3. Implement `AttentionEngine` that derives signals from effective state
4. Wire attention signals to WebSocket broadcast
5. Write tests for signal derivation and priority calculation

**Explicit Non-Goals:** No UI display (M11). No Telegram notification (M15).

**Migration Impact:** No schema changes. New in-process computation.

**Dependencies:** M8
**Acceptance Criteria:**
- Attention signals are derived from effective state
- Priority is correctly calculated
- Signals are broadcast via WebSocket
- Existing tests pass

**Verification:** `pnpm lint:check && pnpm build && pnpm test`
**Required Evidence:** Signal derivation test, priority calculation test
**Rollback:** Remove attention engine (additive).

---

### M11 — Activity Room API & UI

**ID:** ARX-015-M11
**Title:** Activity Room API & UI
**Objective:** Factor commands into separate handlers. Add policy display to Activity Room. Stabilize UI components.

**Architectural Owner:** Activity Room API + Workspace UI
**Prerequisites:** M9 (attention engine for priority display)
**Contracts Introduced:** Command handlers separated from query handlers. Policy display in UI.

**Implementation Scope:**
1. Factor `POST /api/messages` into separate command handlers: `SendMessage`, `StartExecution`, `PauseExecution`, `ResumeExecution`, `CancelExecution`, `RetryTask`, `ApproveAction`, `RejectAction`, `RequestReview`, `RequestVerification`
2. Add `GET /api/activity-room/policy` endpoint for current execution policy
3. Add policy display to Activity Room UI
4. Stabilize existing UI components
5. Write tests for command handlers and policy endpoint

**Explicit No-Goals:** No Activity Room redesign. No floating Assistant (M12). No Telegram (M15).

**Migration Impact:** API route refactoring (backward compatible). UI component updates.

**Dependencies:** M9
**Acceptance Criteria:**
- Commands are separated from queries
- Policy is displayed in Activity Room
- All existing API endpoints still work
- UI components are stable
- Existing tests pass

**Verification:** `pnpm lint:check && pnpm build && pnpm test`
**Required Evidence:** Command handler tests, policy endpoint test
**Rollback:** Restore monolithic handler (backward compatible).

---

### M12 — Contextual Assistant

**ID:** ARX-015-M12
**Title:** Contextual Floating AI Assistant
**Objective:** Implement contextual floating AI assistant in the workspace UI.

**Architectural Owner:** Workspace UI
**Prerequisites:** M11 (stable Activity Room API)
**Contracts Introduced:** Assistant component, assistant API endpoint.

**Implementation Scope:**
1. Implement `Assistant` React component with floating position
2. Create `GET /api/assistant/context` endpoint returning current workspace context
3. Create `POST /api/assistant/chat` endpoint for assistant interactions
4. Wire assistant to Activity Room state
5. Write tests for assistant component and API

**Explicit Non-Goals:** No Telegram integration (M15). No browser integration (M16).

**Migration Impact:** New UI component. New API endpoints (additive).

**Dependencies:** M11
**Acceptance Criteria:**
- Assistant component renders correctly
- Context endpoint returns workspace state
- Chat endpoint processes messages
- Assistant integrates with Activity Room
- Existing tests pass

**Verification:** `pnpm lint:check && pnpm build && pnpm test`
**Required Evidence:** Component test, API test
**Rollback:** Remove assistant component (additive). Remove API endpoints (additive).

---

### M13 — Provider/Model Analytics

**ID:** ARX-015-M13
**Title:** Provider/Model/Token/Cost Analytics
**Objective:** Implement actual token counting from provider responses. Build cost analytics dashboard.

**Architectural Owner:** Provider Runtime + Workflow Orchestrator
**Prerequisites:** M3 (ResolvedAiBinding for attribution)
**Contracts Introduced:** `TokenUsage` tracking per binding. Cost analytics queries.

**Implementation Scope:**
1. Implement token counting from `CompletionResponse.usage` (currently returns zeros from OpenCode)
2. Add `tokenUsage` field to `ResolvedAiBinding`
3. Create `token_usage` SQLite table for persistent tracking
4. Implement cost analytics queries: per-agent, per-session, per-workflow
5. Add cost display to Activity Room UI
6. Write tests for token counting and cost queries

**Explicit Non-Goals:** No budget alerts (deferred). No cost limits (deferred).

**Migration Impact:** New SQLite table (`token_usage`). Extended `ResolvedAiBinding`.

**Dependencies:** M3
**Acceptance Criteria:**
- Token counts are non-zero from provider responses
- Token usage is persisted per binding
- Cost analytics queries return correct data
- Cost is displayed in Activity Room
- Existing tests pass

**Verification:** `pnpm lint:check && pnpm build && pnpm test`
**Required Evidence:** Token counting test, cost query test
**Rollback:** Drop table (additive). Remove token usage field (additive).

---

### M14 — Native Agent/Subagent Distinction

**ID:** ARX-015-M14
**Title:** Native Agent/Subagent Distinction
**Objective:** Distinguish native agent sessions from subagent sessions. Track subagent sessions as child activities.

**Architectural Owner:** Agent Harness + OpenCode Runtime
**Prerequisites:** M6 (session continuity)
**Contracts Introduced:** `AgentSessionType: 'native' | 'subagent'`. Child session tracking.

**Implementation Scope:**
1. Add `sessionType` field to `OpenCodeSessionBinding`: `'native' | 'subagent'`
2. Track parent-child session relationships
3. Distinguish subagent sessions in Activity Room projection
4. Ensure subagent sessions share parent's `executionId` and `correlationId`
5. Write tests for session type detection and child tracking

**Explicit Non-Goals:** No subagent UI redesign. No subagent workflow changes.

**Migration Impact:** Extended `OpenCodeSessionBinding` schema.

**Dependencies:** M6
**Acceptance Criteria:**
- Session type is correctly detected
- Child sessions are tracked
- Subagent sessions share parent lineage
- Activity Room displays session hierarchy
- Existing tests pass

**Verification:** `pnpm lint:check && pnpm build && pnpm test`
**Required Evidence:** Session type test, child tracking test
**Rollback:** Remove `sessionType` field (additive).

---

### M15 — Telegram Gateway

**ID:** ARX-015-M15
**Title:** Telegram Gateway
**Objective:** Implement Telegram bot integration for remote Activity Room access.

**Architectural Owner:** New package + API bridge
**Prerequisites:** M11 (stable Activity Room API)
**Contracts Introduced:** `TelegramGateway` package. Bot lifecycle, webhook handling, message normalization.

**Canonical Contract Consumption:**
Telegram gateway uses the canonical Activity Room API (M11) for all command/query operations. It does NOT introduce independent orchestration, session, AI-routing, or event authorities. Its execution paths use:
- Canonical identity (M1) for message/activity IDs
- Canonical events (M2) for event propagation
- Execution policy (M3) for permission gates
- AI binding (M4) for any AI invocations through the gateway
- Activity Room commands (M11) for message normalization

**Implementation Scope:**
1. Create `packages/providers/telegram/` package
2. Implement `TelegramGateway` class with bot lifecycle (init, start, stop)
3. Implement webhook/long-polling handler
4. Implement message normalization to Activity Room commands via `POST /api/messages`
5. Add Telegram-specific permission gates using execution policy (M3)
6. Write tests for gateway lifecycle and message normalization

**Explicit Non-Goals:** No rich media rendering. No voice integration. No multi-bot support. No independent orchestration authority.

**Migration Impact:** New package. New API routes (additive).

**Dependencies:** M11
**Acceptance Criteria:**
- Telegram bot connects and responds
- Messages are normalized to Activity Room commands via canonical API
- Permission gates use execution policy (M3)
- Gateway lifecycle is managed
- No independent session/orchestration/event authorities introduced
- Existing tests pass

**Verification:** `pnpm lint:check && pnpm build && pnpm test`
**Required Evidence:** Gateway lifecycle test, message normalization test
**Rollback:** Remove package (additive).

---

### M16 — Live Visual Browser

**ID:** ARX-015-M16
**Title:** Live Visual Browser Integration
**Objective:** Extend browser tools with persistence and streaming for live visual feedback.

**Architectural Owner:** Browser Tools + Activity Room
**Prerequisites:** M11 (stable Activity Room API)
**Contracts Introduced:** `LiveBrowserSession`, browser state streaming.

**Canonical Contract Consumption:**
Live Visual Browser uses the canonical Activity Room API (M11) for all streaming/timeline operations. It does NOT introduce independent orchestration, session, AI-routing, or event authorities. Its execution paths use:
- Canonical identity (M1) for browser session/activity IDs
- Canonical events (M2) for browser state events
- Evidence pipeline (M9) for browser replay from evidence
- Activity Room timeline (M11) for browser state display

**Implementation Scope:**
1. Extend `BrowserSession` with state persistence (current URL, page title, screenshot)
2. Implement browser state streaming to Activity Room via canonical event bridge
3. Add browser snapshot to Activity Room timeline via projection
4. Implement browser replay from evidence using evidence pipeline
5. Write tests for persistence and streaming

**Explicit Non-Goals:** No VNC/RDP equivalent. No multi-browser support. No browser-as-a-service. No independent orchestration authority.

**Migration Impact:** Extended `BrowserSession`. New streaming endpoint (additive).

**Dependencies:** M11
**Acceptance Criteria:**
- Browser state persists across tool calls
- Browser state streams to Activity Room via canonical events
- Browser snapshots appear in timeline via projection
- Browser replay works from evidence using evidence pipeline
- No independent session/orchestration/event authorities introduced
- Existing tests pass

**Verification:** `pnpm lint:check && pnpm build && pnpm test`
**Required Evidence:** Persistence test, streaming test, replay test
**Rollback:** Remove persistence (backward compatible). Remove streaming (additive).

---

### M17 — Production Certification

**ID:** ARX-015-M17
**Title:** Production Activity Room Stability Gate
**Objective:** Formally certify that all production requirements are met.

**Architectural Owner:** All teams
**Prerequisites:** M11, M12, M13, M14, M15
**Contracts Introduced:** Certification checklist. Evidence bundle.

**Implementation Scope:**
1. Verify deterministic execution (M8 single-flight, DAG validation)
2. Verify canonical lineage (M1 trace/correlation/causation chain)
3. Verify canonical event propagation (M2 EventHeader, M9 durable Activity Room)
4. Verify authoritative AI routing (M4 ResolvedAiBinding)
5. Verify AI request → binding → provider/model (M4 end-to-end)
6. Verify no AI invocation bypasses binding (M4 guard enforcement)
7. Verify repository confinement (M5 binding authority)
8. Verify OpenCode contract compatibility (M6 client extension, compatibility checker)
9. Verify 100% OpenCode operations dispositioned (M6 disposition matrix)
10. Verify no undocumented raw OpenCode dependency from Activity Room/Workflow/Agent domains (M6)
11. Verify session continuity (M7 persistent registry, reconciliation)
12. Verify native agent/subagent distinction (M14)
13. Verify governed tools/skills/commands/permissions (M3 policy enforcement)
14. Verify durable recovery (M7 reconciliation, M9 receipt persistence)
15. Verify provider/model/token/cost observability (M13 analytics)
16. Verify resource/concurrency limits (M3 token budget, M8 sequential execution)
17. Verify hermetic verification (M3 policy, CI-11)
18. Verify stable Activity Room projections (M9, M10)
19. Verify Assistant integration (M12)
20. Verify Telegram integration (M15)
21. Verify Live Visual Browser integration (M16)
22. Verify restart/recovery behavior (M7 reconciliation)
23. Produce certification evidence bundle
24. Declare: **ARX-015 — Production Activity Room STABLE**

**Explicit Non-Goals:** No new features. Only verification and certification.

**Migration Impact:** None. Verification only.

**Dependencies:** M12, M13, M14, M15, M16
**Acceptance Criteria:**
- All 18 verification items pass
- Certification evidence bundle is produced
- No regressions in existing functionality
- All tests pass

**Verification:** Full CI pipeline: `pnpm dependencies:check && pnpm build && pnpm lint:check && pnpm test && pnpm documentation:check`
**Required Evidence:** Certification checklist, evidence bundle, CI results
**Rollback:** N/A (verification only)

---

## Part IV — Unresolved Decisions Resolution Schedule

| Decision | Milestone | Trigger |
|----------|-----------|---------|
| U8 (GovernedActivityRunner placement) | M3 | Resolved: governance logic distributed across orchestrator (policy selection) and runtime adapter (per-operation enforcement) |
| U9 (ARX-014D invariant adoption) | M8 | Resolved: 9 ADOPT, 2 ADAPT (see Part I §3) |
| U1 (DevelopmentPlan naming) | M8 | Resolved: ADOPT CI-1, `WorkflowPlan` satisfies immutable WHAT |
| U2 (WorkflowRuntime deprecation) | Deferred | Ownership mapping not required for ARX-015 milestones; defer to separate decision |
| U3 (traceId source) | M1 | Resolved: custom generator (simpler, no dependency) |
| U4 (Evidence bundle granularity) | M9 | Resolved: summary + reference |
| U5 (ExecutionPolicy default) | M3 | Resolved: `governed` as default, `hermetic` for verification |
| U6 (Session registry format) | M7 | Resolved: SQLite table |
| U7 (TokenBudget unification) | Deferred | Different lifecycle concerns; unify later |

---

## Part V — First Implementation Tranche

The first 3–5 milestones that should be executed before another major architectural checkpoint:

| Order | Milestone | Why First |
|-------|-----------|-----------|
| 1 | M1 — Canonical Identity & Lineage | Foundation for everything. No dependencies. |
| 2 | M2 — Canonical Event Contract | Depends on M1. Establishes event structure. |
| 3 | M3 — Execution Policy & Budget | Depends on M2. Establishes control plane. |
| 4 | M4 — AI Resolution & Execution Binding | Depends on M3. Establishes authoritative AI routing. Critical architectural gap. |
| 5 | M5 — Repository Authority & Confinement | Depends on M4. Establishes confinement. |
| 6 | M6 — OpenCode Contract & Client Extension | Depends on M5. Extends integration boundary. |

**Checkpoint after M6:** Review milestone boundaries, especially M4 (AI binding), M5 (confinement), and M6 (OpenCode extension). These establish contracts that M7–M17 inherit.

---

## Part VI — Production Completion Gate

ARX-015 ends with formal certification proving:

| # | Requirement | Milestone | Verification Method |
|---|-------------|-----------|---------------------|
| 1 | Deterministic execution | M8 | Single-flight test, DAG validation test |
| 2 | Canonical lineage | M1 | Trace chain test, correlation derivation test |
| 3 | Canonical event propagation | M2, M9 | EventHeader test, durable Activity Room test |
| 4 | Authoritative AI routing | M4 | ResolvedAiBinding test, routing wiring test, guard enforcement test |
| 5 | AI request → authoritative binding → actual provider/model | M4 | End-to-end AI invocation test: request → binding resolution → provider/model selection → invocation → event |
| 6 | No AI invocation bypasses binding | M4 | Guard denial test, violation event test |
| 7 | Repository confinement | M5 | Binding authority test, process.cwd() audit |
| 8 | OpenCode contract compatibility | M6 | Compatibility checker test, client method tests |
| 9 | 100% pinned OpenCode operations dispositioned | M6 | Disposition matrix audit (see Part I §2) |
| 10 | No undocumented/raw OpenCode dependency from Activity Room, Workflow, or Agent domains | M6 | Domain boundary audit: Activity Room, Workflow, Agent must not import raw OpenCode client |
| 11 | Session continuity | M7 | Persistence test, reconciliation test |
| 12 | Native agent/subagent distinction | M14 | Session type test, child tracking test |
| 13 | Governed tools/skills/commands/permissions | M3 | Policy enforcement test |
| 14 | Durable recovery | M7, M9 | Restart test, receipt persistence test |
| 15 | Provider/model/token/cost observability | M13 | Token counting test, cost query test |
| 16 | Resource/concurrency limits | M3, M8 | Token budget test, sequential execution test |
| 17 | Hermetic verification | M3 | Policy resolution test (hermetic mode) |
| 18 | Stable Activity Room projections | M9, M10 | Projection test, attention engine test |
| 19 | Assistant integration | M12 | Component test, API test |
| 20 | Telegram integration | M15 | Gateway lifecycle test |
| 21 | Live Visual Browser integration | M16 | Persistence test, streaming test |
| 22 | Restart/recovery behavior | M7 | Reconciliation test |

**Only after all 22 gates pass may the plan declare:**

> **ARX-015 — Production Activity Room STABLE**

---

## Part VII — Non-Goals (Preserved from Architecture Review)

1. Do not rewrite the Activity Room projection pipeline.
2. Do not rewrite the Workflow Orchestrator.
3. Do not rewrite the Agent domain.
4. Do not create a second Provider/Model architecture.
5. Do not conflate AI invocation sessions with coding runtime sessions.
6. Do not automatically adopt unmanaged OpenCode sessions.
7. Do not collapse domain events into one giant event type.
8. Do not use `correlationId` as an alias for any other identity.
9. Do not deprecate `WorkflowRuntime` without ownership mapping.
10. Do not blindly copy `vestara-platform` implementations.
11. Do not treat ARX-014D invariants as automatically authoritative.
12. Do not invent upstream OpenCode endpoints.
13. Do not create independent parallel implementation streams where one depends on another.

---

*This DevelopmentPlan is a planning document. No production code was changed. All decisions are based on the ARX-015 Architecture Review Revision 2 and source inspection of vestara-ai-core.*

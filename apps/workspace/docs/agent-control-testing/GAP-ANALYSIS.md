# Agent Control — Testing Gap Analysis (revised after Phase 0)

Per-requirement status. Subsystem = "does a production implementation exist
somewhere". A present subsystem does NOT prove Agent Control integrates with it.

Classification values: `TEST GAP` · `PRODUCTION BEHAVIOR GAP` ·
`SECURITY/GOVERNANCE GAP` · `INTEGRATION GAP` · `ARCHITECTURE GAP` ·
`BLOCKED / REQUIRES DECISION`

## AC-TST-001 — Test architecture
- Subsystem: Implemented
- Agent runtime integration: Implemented (harness routes tests)
- API integration: Implemented (route tests)
- Workspace UI integration: Partial (modal component tests only)
- Existing tests: `agent-registry-*.test.tsx`, `agent-harness-routes.test.ts`, `multi-agent-workflow-routes.test.ts`
- Classification: TEST GAP
- Confidence: High

## AC-TST-002 — Agent lifecycle CRUD
- Subsystem: Implemented (`AgentStorage`, `routes/agents.ts`)
- Agent runtime integration: N/A for CRUD
- API integration: **Implemented + tested** (`agent-crud-routes.test.ts`, 9 tests: create/read/update/delete, validation, duplicate-id 409, 404s, audit, role guard)
- Workspace UI integration: **Partial → tested** (list slots, empty-via-search, create payload + toast, refresh persistence, save-failure toast — `agent-control-page.test.tsx`, 5 tests)
- Existing tests: `agent-crud-routes.test.ts`, `agent-control-page.test.tsx` (+ existing modal tests)
- Classification: **TEST GAP → CLOSED for CRUD core**; detail/edit-dialog validation and delete-with-dependencies remain (D2)
- Confidence: High
- Notes: duplicate-id overwrite fixed (409). Name-uniqueness / max-length / create-status rules remain **HELD** (documented as current-behavior test, not finalized).

## AC-TST-003 — Agent state machine
- Subsystem: Partial (`AgentRunState`, telemetry `AgentStatus`, `AgentStatusBadge`)
- Agent runtime integration: Implemented
- API integration: Untested
- Workspace UI integration: Partial (badge renders states)
- Existing tests: none for transitions
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-004 — Provider integration
- Subsystem: Implemented (`OpenCodeRuntimeProvider.healthCheck`, `OpenCodeRuntimeService`, `/api/opencode/health`)
- Agent runtime integration: Partial (health surfaced; no failure matrix)
- API integration: Untested
- Workspace UI integration: Partial (runtime health badge on Agents page)
- Existing tests: none
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-005 — Model integration
- Subsystem: Partial (`OpenCodeRuntimeProvider.discoverProviders` synthesizes models)
- Agent runtime integration: **Gap** — agent-configured provider/model never reaches generation (harness uses runtime default)
- API integration: Untested
- Workspace UI integration: Implemented (modal provider→model binding, tested)
- Existing tests: `agent-registry-edit.test.tsx` (UI only)
- Classification: INTEGRATION GAP (BLOCKED for execution attribution until Phase 2)
- Confidence: High (Phase 0 trace)

## AC-TST-006 — Provider/model fallback
- Subsystem: Not implemented
- Agent runtime integration: Not implemented
- API integration: Not implemented
- Workspace UI integration: Not implemented
- Existing tests: none
- Classification: PRODUCTION BEHAVIOR GAP
- Confidence: High

## AC-TST-007 — Capability integration
- Subsystem: Implemented (`AgentCapabilityManager`, `ToolRuntime`, `/api/agents/:id/capabilities`)
- Agent runtime integration: Partial (capability enforcement for Vestara tools)
- API integration: Untested (denied-capability invocation not tested)
- Workspace UI integration: Partial (capability assignment in modal)
- Existing tests: none for enforcement
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-008 — Permission/approval integration
- Subsystem: Implemented (harness `awaiting-approval` + `decideApproval`; OpenCode permission registry)
- Agent runtime integration: **Gap** — runtime-driven generation runs OpenCode's own tool loop; Vestara capability/approval policy NOT in the loop
- API integration: Partial (`/api/opencode/permissions` + audit)
- Workspace UI integration: Partial
- Existing tests: none for the runtime path
- Classification: ARCHITECTURE GAP / REQUIRES DECISION
- Confidence: High (Phase 0 trace)

## AC-TST-009/010 — Workflow integration + stage execution
- Subsystem: Implemented (WorkflowOrchestrator, MultiAgentWorkflowOrchestrator, `WorkflowRail`)
- Agent runtime integration: Implemented (multi-agent → harness)
- API integration: Partial (`multi-agent-workflow-routes.test.ts`)
- Workspace UI integration: Partial (`WorkflowRail`)
- Existing tests: multi-agent workflow route tests
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-011/012 — Task integration + concurrency
- Subsystem: Partial (HarnessTaskDispatcher; orchestrator tasks; no agent concurrency limit)
- Agent runtime integration: Implemented
- API integration: Partial (orchestration routes)
- Workspace UI integration: Partial
- Existing tests: orchestration route tests
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-013 — Agent-to-agent delegation
- Subsystem: Partial (`MultiAgentWorkflowOrchestrator`)
- Agent runtime integration: Implemented
- API integration: Partial
- Workspace UI integration: Missing (no lineage view)
- Existing tests: multi-agent workflow tests
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-014 — Agent communication
- Subsystem: Implemented (harness event bridge, thread timeline)
- Agent runtime integration: Implemented
- API integration: Implemented (bridge → engineering events)
- Workspace UI integration: Partial (HarnessThreadTimeline)
- Existing tests: `agent-harness-routes.test.ts` (bridge)
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-015 — Telemetry integration
- Subsystem: Implemented (TelemetryRuntime, `useEventStream`, WS)
- Agent runtime integration: Implemented
- API integration: Implemented (harness bridge → telemetry)
- Workspace UI integration: Partial
- Existing tests: telemetry + event-bridge tests
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-016/017 — Execution history + config snapshots
- Subsystem: Partial (`agent_executions`; **no immutable config snapshot per execution**)
- Agent runtime integration: Partial
- API integration: Implemented (list executions)
- Workspace UI integration: Partial (ExecutionDetailModal)
- Existing tests: none for snapshots
- Classification: PRODUCTION BEHAVIOR GAP (config snapshots)
- Confidence: Medium

## AC-TST-018 — Evidence integration
- Subsystem: Implemented (PCS-026 evidence pipeline)
- Agent runtime integration: Partial (harness verifier → evidence bundle)
- API integration: Implemented (evidence routes)
- Workspace UI integration: Missing (Agent Control does not surface execution→evidence)
- Existing tests: evidence package tests only
- Classification: INTEGRATION GAP
- Confidence: High

## AC-TST-019/020 — Observer + verifier integration
- Subsystem: Implemented (workflow observer; verification engines)
- Agent runtime integration: Implemented (observer reads states; verifier engine is non-generative)
- API integration: Partial
- Workspace UI integration: Missing (no separate execution vs verification status)
- Existing tests: observation + verification tests
- Classification: INTEGRATION GAP
- Confidence: Medium

## AC-TST-021 — Error handling
- Subsystem: Partial (structured `{ error }` envelopes; some generic messages)
- Agent runtime integration: Partial
- API integration: Partial
- Workspace UI integration: Partial (toasts)
- Existing tests: none
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-022 — Retry and recovery
- Subsystem: Partial (orchestrator retry policy)
- Agent runtime integration: Implemented (retry policy)
- API integration: Untested
- Workspace UI integration: Missing (no retry UI)
- Existing tests: workflow retry tests
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-023 — Persistence/restart
- Subsystem: Implemented (engineering event store, thread recovery, harness restore)
- Agent runtime integration: Implemented
- API integration: Implemented
- Workspace UI integration: Untested
- Existing tests: recovery + event-store tests
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-024 — Multi-agent scenario
- Subsystem: Implemented
- Agent runtime integration: Implemented
- API integration: Partial (`multi-agent-workflow-routes.test.ts`)
- Workspace UI integration: Untested
- Existing tests: multi-agent workflow route tests
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-025 — Provider switching
- Subsystem: Partial (modal supports switch)
- Agent runtime integration: **Gap** (config does not reach generation)
- API integration: Untested
- Workspace UI integration: Implemented (tested in modal)
- Existing tests: `agent-registry-edit.test.tsx`
- Classification: INTEGRATION GAP
- Confidence: High

## AC-TST-026 — Agent disable/enable
- Subsystem: Implemented (`updateAgentStatus`; service rejects disabled agents)
- Agent runtime integration: Implemented
- API integration: Untested (no enable/disable endpoint contract test)
- Workspace UI integration: Missing
- Existing tests: none
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-027 — Search/filter/sort
- Subsystem: Implemented (UI status/team filters + search)
- Agent runtime integration: N/A
- API integration: N/A (client-side)
- Workspace UI integration: Implemented, untested
- Existing tests: none
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-028 — Pagination/scale
- Subsystem: Implemented (`Pagination`)
- Agent runtime integration: N/A
- API integration: Untested
- Workspace UI integration: Implemented, untested
- Existing tests: none
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-029 — Accessibility
- Subsystem: N/A
- Agent runtime integration: N/A
- API integration: N/A
- Workspace UI integration: Untested
- Existing tests: none
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-030 — Responsive
- Subsystem: Implemented (Playwright viewport matrix)
- Agent runtime integration: N/A
- API integration: N/A
- Workspace UI integration: Untested for Agent Control
- Existing tests: visual suite (other pages)
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-031 — Visual regression
- Subsystem: Implemented (visual suite + baselines)
- Agent runtime integration: N/A
- API integration: N/A
- Workspace UI integration: No Agent Control baselines
- Existing tests: visual suite (other pages)
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-032 — Security
- Subsystem: Partial (`requireRole` on POST/run only; PUT/DELETE had no guard — Phase 1 WIP adds it, held)
- Agent runtime integration: N/A
- API integration: Untested (no role matrix)
- Workspace UI integration: Untested
- Existing tests: none
- Classification: SECURITY/GOVERNANCE GAP
- Confidence: High
- Notes: unauthenticated/local requests default to `admin`
  (`apps/api/src/auth.ts:46-51`) — deliberate local/offline-first behavior,
  not production-hardened. Analyze before changing authz.

## AC-TST-033 — Secret handling
- Subsystem: Unverified
- Agent runtime integration: Unverified
- API integration: Unverified (credentials resolved from env, not stored)
- Workspace UI integration: Unverified
- Existing tests: none
- Classification: TEST GAP
- Confidence: Low

## AC-TST-034 — Audit trail
- Subsystem: Partial (`AGENT_CREATE`/`AGENT_RUN`; update/delete missing — Phase 1 WIP adds them, held)
- Agent runtime integration: Implemented (audit store)
- API integration: Partial
- Workspace UI integration: N/A
- Existing tests: none for agent actions
- Classification: SECURITY/GOVERNANCE GAP
- Confidence: High

## AC-TST-035 — Engineering Graph integration
- Subsystem: **Gap** (no agent CRUD → graph projection)
- Agent runtime integration: N/A
- API integration: Missing
- Workspace UI integration: Missing
- Existing tests: none
- Classification: INTEGRATION GAP
- Confidence: Medium

## AC-TST-036 — UI State Reconciliation (corrected; was "Query Cache")
- Subsystem: Implemented (local React state + manual refetch + WS/event updates; no query cache)
- Agent runtime integration: Implemented (WS/telemetry events)
- API integration: Implemented
- Workspace UI integration: Implemented, untested
- Existing tests: none
- Classification: TEST GAP
- Confidence: Medium
- Invariant to test: mutation → local/temp state → API/server state → concurrent
  runtime event → refresh/reconciliation → converge to authoritative state.

## AC-TST-037 — Duplicate submission protection
- Subsystem: Partial (`saving`/`running` flags)
- Agent runtime integration: N/A
- API integration: N/A (no idempotency keys)
- Workspace UI integration: Partial
- Existing tests: none
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-038 — Network degradation
- Subsystem: Partial (AbortController in providers; no UI degradation handling)
- Agent runtime integration: Partial
- API integration: Untested
- Workspace UI integration: Untested
- Existing tests: none
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-039 — Performance acceptance
- Subsystem: N/A
- Agent runtime integration: N/A
- API integration: N/A
- Workspace UI integration: Not benchmarked
- Existing tests: none
- Classification: TEST GAP
- Confidence: Medium

## AC-TST-040 — Required E2E acceptance suite
- Subsystem: Implemented (visual E2E infra)
- Agent runtime integration: Implemented
- API integration: Implemented
- Workspace UI integration: Not implemented (15 scenarios)
- Existing tests: partial
- Classification: TEST GAP
- Confidence: High

---

## Backlog (post-Phase-0)

| Phase | Scope | Blocking notes |
|---|---|---|
| 1 | CRUD contract tests + loading/error/empty + refresh persistence + audit/role-guard (held rules flagged) | **DONE** — 14 tests; false-success mutation bug fixed; duplicate-id/authz/audit fixes kept; held rules reverted |
| 2 | Generation boundary: converge on `opencode-runtime`; provider/model attribution; session/stream/cancel | requires Phase 0 boundary + tool decision |
| 3 | Capabilities + approvals: enforcement + convergence | tool decision gates runtime path |
| 4 | Tasks: assign/reassign/queue/concurrency/retry/cancel | concurrency model decision |
| 5 | Workflows + multi-agent lifecycle (rework) fixtures | none |
| 6 | Telemetry + WS sync (live/disconnect/reconcile) | none |
| 7 | Evidence + verification (execution vs verification status) | none |
| 8 | Engineering Graph + audit integration | graph projection gap |
| 9 | Failure/recovery fault matrix | none |
| 10 | UI quality gates (a11y, responsive, visual, scale, secrets, authz) | authz analysis first |

## Phase 0 findings carried forward

1. **ARCHITECTURE GAP** — no single `GenerationRuntime` boundary; `OpenCodeRuntime`
   class unused; `OpenCodeRuntimeService` control-only; generation owned by a
   provider adapter.
2. **GENERATION PATH DIVERGENCE** — worker-cluster dispatch + Conversation/
   Planning/Explain use different OpenCode integration paths.
3. **Trust-model gap** — runtime-driven generation tools run inside OpenCode;
   Vestara capability/approval policy not in the loop (decision required).
4. Agent-configured provider/model does not reach generation (blocks 005/025).
5. Mid-run cancellation of runtime sessions missing.
6. Duplicate agent id overwrite (data integrity) + PUT/DELETE authz — open.
7. Unauthenticated/local requests default to admin — deliberate local behavior.

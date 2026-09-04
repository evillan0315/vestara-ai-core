---
title: Print Status Info — Capability Implementation Plan
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Print Status Info — Capability Implementation Plan

## Overview

Implement "Print status info" as a governed Activity Room capability that surfaces system health, runtime status, and workspace diagnostics through the execution spine. This capability reuses the existing `vestara status` CLI command logic and exposes it via the Activity Room intent → execution → verification flow.

**Goal**: Enable users to request system status from Activity Room and receive a structured, verified status report with evidence.

---

## Milestones

### M1: Capability Contract & Intent Resolution
**Target**: Define the execution contract and wire intent resolution for "print status info" requests.

| Task | Description | Owner | Verification |
|------|-------------|-------|--------------|
| M1.1 | Define `PrintStatusInfoIntent` type in `src/execution/intent-resolver.ts` | planner | Type compiles |
| M1.2 | Add intent kind `inspect.status` to resolver classification | developer | Unit test: "print status info" → `inspect.status` |
| M1.3 | Add complexity classification: `simple` (no code gen needed) | developer | Unit test: complexity = simple |
| M1.4 | Define `PrintStatusInfoExecutionPlan` schema | planner | Schema validates |
| M1.5 | Document capability in `docs/activity-room/capability-matrix.md` | planner | Doc updated |

**Exit Criteria**: Intent resolver correctly classifies "print status info" requests; capability documented.

---

### M2: Execution Domain Composition
**Target**: Compose the execution workflow from existing status-gathering modules.

| Task | Description | Owner | Verification |
|------|-------------|-------|--------------|
| M2.1 | Create `src/execution/capabilities/print-status-info.ts` capability module | developer | Module exports `PrintStatusInfoCapability` |
| M2.2 | Implement `gatherRuntimeStatus()` — Node, platform, memory | developer | Unit test returns expected shape |
| M2.3 | Implement `gatherProviderHealth()` — provider status, latency | developer | Unit test with mocked provider |
| M2.4 | Implement `gatherAgentWorkspaceStatus()` — agents, executions, projects | developer | Unit test with test DB |
| M2.5 | Implement `gatherMilestoneProgress()` — milestone status | developer | Unit test with MilestoneService |
| M2.6 | Implement `gatherConversationFeatures()` — package audit | developer | Unit test with ConversationScanner |
| M2.7 | Wire capabilities into `ExecutionWorkflowComposer` for `inspect.status` | developer | Integration test: workflow composed |
| M2.8 | Add execution event types: `status-gathering-started`, `status-section-complete`, `status-report-ready` | developer | Events emitted in test |

**Exit Criteria**: All status sections gather correctly; workflow composes deterministically.

---

### M3: Agent Assignment & Runtime Policy
**Target**: Assign the capability to the appropriate agent/runtime with proper permissions.

| Task | Description | Owner | Verification |
|------|-------------|-------|--------------|
| M3.1 | Register `PrintStatusInfoCapability` in agent capability registry | developer | Registry lists capability |
| M3.2 | Assign to `inspector` agent role (read-only, no code gen) | planner | Agent assignment test passes |
| M3.3 | Configure runtime policy: no filesystem write, no network egress | planner | Permission gate test passes |
| M3.4 | Define tool bindings: none required (pure data aggregation) | developer | No tools bound in test |
| M3.5 | Add permission rule: `inspect.status` allowed for all authenticated principals | planner | Permission test passes |

**Exit Criteria**: Capability assigned to inspector agent; permissions enforce read-only.

---

### M4: Verification & Evidence Integration
**Target**: Connect execution completion to VCTRL verification with evidence.

| Task | Description | Owner | Verification |
|------|-------------|-------|--------------|
| M4.1 | Define required evidence: `status-report.json` with all sections | planner | Evidence schema documented |
| M4.2 | Implement evidence emission in `PrintStatusInfoCapability.execute()` | developer | Evidence file written to execution dir |
| M4.3 | Add VCTRL verification rule: status report must contain all 6 sections | planner | VCTRL fails incomplete reports |
| M4.4 | Add verification test: evidence passes VCTRL for valid report | developer | `pnpm verify` passes |
| M4.5 | Add verification test: evidence fails VCTRL for missing section | developer | `pnpm verify` catches regression |

**Exit Criteria**: Execution produces verifiable evidence; VCTRL validates completeness.

---

### M5: Activity Room Projection Surface
**Target**: Surface the status report in Activity Room UI with inspector integration.

| Task | Description | Owner | Verification |
|------|-------------|-------|--------------|
| M5.1 | Add `PrintStatusInfo` DTO to frontend API client (`vestara-apps/ai/src/api/`) | developer | TypeScript compiles |
| M5.2 | Extend `ExecutionInspector` with Status Report section | developer | Component renders mock data |
| M5.3 | Add status report rendering: collapsible sections per category | developer | Visual regression test passes |
| M5.4 | Wire inspector API: `GET /api/v2/activity-room/history/:id/inspector` includes status | developer | Integration test: inspector returns status |
| M5.5 | Add "Print Status Info" quick action to Activity Room header | developer | E2E test: action triggers execution |

**Exit Criteria**: Activity Room displays status report end-to-end; quick action works.

---

### M6: Vertical Slice Validation (CP8 Extension)
**Target**: Prove the full spine with "Print status info" as a second vertical slice.

| Task | Description | Owner | Verification |
|------|-------------|-------|--------------|
| M6.1 | Add integration test: "Print status info" goal → execution → evidence | tester | `pnpm test` passes new test |
| M6.2 | Verify idempotency: same goal → same executionId | tester | Dedup test passes |
| M6.3 | Verify history listing includes status execution | tester | History test passes |
| M6.4 | Verify snapshot includes status workflow definition | tester | Snapshot test passes |
| M6.5 | Run `pnpm verify` for affected scope | verifier | Evidence recorded |

**Exit Criteria**: Full vertical slice works; verification evidence recorded.

---

## Dependencies

| Milestone | Depends On |
|-----------|------------|
| M1 | Checkpoint 3 (Intent Resolution) complete |
| M2 | Checkpoint 4 (Workflow Composition) complete; M1 done |
| M3 | Checkpoint 5 (Agent Assignment) complete; M2 done |
| M4 | Checkpoint 6 (Verification) complete; M3 done |
| M5 | Checkpoint 7 (AR Projection) complete; M4 done |
| M6 | Checkpoint 8 (First Slice) complete; M5 done |

---

## Verification Rule

Each milestone must end with:
- Implementation complete
- Targeted tests complete
- `pnpm verify` (scoped to affected modules)
- Evidence recorded in `.vestara/evidence/verification/`

Do not advance to next milestone until current milestone verification passes.

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Status gathering fails in restricted environments | Graceful degradation: mark section "unavailable" not "failed" |
| Provider health check hangs | Timeout + circuit breaker (3s max per provider) |
| Large workspace slows agent scan | Paginate/limit agent/execution queries; add `--brief` flag |
| Evidence schema drift | Lock schema in `docs/activity-room/evidence-schemas.md` |

---

## Success Metrics

- **Latency**: Status report generated < 2s (p95)
- **Completeness**: All 6 sections present in 100% of successful runs
- **Verification**: VCTRL passes 100% of valid reports
- **UX**: Activity Room shows report within 500ms of completion
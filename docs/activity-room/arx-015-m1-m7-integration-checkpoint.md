# ARX-015 M1–M7 Integration Checkpoint Evidence

**Status:** FROZEN  
**Date:** 2026-08-27  
**Build:** `tsc -b` clean, `pnpm lint:check` clean  
**Tests:** 179/179 opencode-runtime, 143/143 agent-harness, 36/36 engineering-event-store, 47/47 repository-binding, 29/29 m6-contract, 21/21 m4-evidence

---

## Checkpoint Objective

Verify composition of frozen milestones M1–M7. Not re-prove individual invariants — verify that the frozen milestones compose correctly and no cross-milestone bypasses exist.

---

## Lineage Chain Verification

```
request (req-comp-001)
  ↓ M1: canonical identity
  requestId: req-comp-001
  traceId: trace-comp-001
  correlationId: cor-exec-composition-001  (derived from executionId)
  executionId: exec-composition-001
  workflowRunId: wf-composition-001
  ↓ M2: canonical event envelope
  envelope carries all M1 identity fields
  ↓ M3: effective execution policy
  mode: governed, maxToolRisk: high, requiresApproval: false
  ↓ M4: ResolvedAiBinding (×4 stages)
  bindingId: binding-{stage}-{i}
  executionId: exec-composition-001
  workflowRunId: wf-composition-001
  providerModel: { test-provider, test-model }
  ↓ M5: RepositoryBinding (×1)
  bindingId: rb-composition-001
  canonicalPath: /home/user/projects/vestara/vestara-ai-core
  ↓ M6: OpenCode typed integration boundary
  typed client (OpenCodeClient), no raw HTTP
  ↓ M7: RuntimeSessionBinding (×1)
  runtimeSessionId: rt-*
  workflowRunId: wf-composition-001
  physicalSessionId: ses-comp-001
  repositoryBindingId: rb-composition-001
  continuityPolicy: SHARED_WORKFLOW
  creationReason: workflow-start
  directory: /home/user/projects/vestara/vestara-ai-core
```

All lineage fields survive composition. No authority bypass detected.

---

## Composition Counts

| Entity | Count | Authority |
|--------|-------|-----------|
| WorkflowRuns | 1 | M1 identity |
| ExecutionSessions | 4 | Workflow concern (separate) |
| ResolvedAiBindings | 4 | M4 (one per stage) |
| RepositoryBindings | 1 | M5 (single source of truth) |
| RuntimeSessionBindings | 1 | M7 (SHARED_WORKFLOW) |
| Physical sessions | ≤ 1 | M7 (maxPhysicalSessions=1) |
| Live provider calls | 0 | Hermetic verification |
| Live OpenCode sessions | 0 | Hermetic verification |

---

## Cross-Milestone Authority Boundaries

### No Bypasses Detected

| Check | Result |
|-------|--------|
| Legacy correlation identity not substituted for execution correlation | ✅ PASS |
| No AI provider/model invocation bypassing M4 authority | ✅ PASS |
| No operation bypassing effective M3 policy | ✅ PASS |
| No repository execution authority from process.cwd() or OpenCode server CWD | ✅ PASS |
| No raw undocumented OpenCode HTTP dependency outside M6 boundary | ✅ PASS |
| No session-bearing runtime creating physical sessions outside M7 authority | ✅ PASS |
| No sessionless runtime forced into OpenCode | ✅ PASS |
| No agent assignment implicitly becoming runtime-session authority | ✅ PASS |

### Authority Surface Separation

| Authority | Owned By | Fields |
|-----------|----------|--------|
| AI provider/model | M4 ResolvedAiBinding | providerModel, routingReason, budget, guard |
| Repository/directory | M5 RepositoryBinding | canonicalPath, vestaraDir, source, authoritative |
| Runtime session continuity | M7 RuntimeSessionBinding | physicalSessionId, continuityPolicy, creationReason |

No field is shared between any two authority surfaces. M7 carries `directory` as a copy from M5, but M5 is the source of truth.

---

## Frozen Milestone Test Suite Results

| Suite | Tests | Status | Evidence File |
|-------|-------|--------|---------------|
| M1 (identity) | via M2 event contract | ✅ PASS | `m2-canonical-event-contract.test.ts` |
| M2 (events) | 36 | ✅ PASS | `engineering-event-store/__tests__/m2-canonical-event-contract.test.ts` |
| M3 (policy) | via agent-harness | ✅ PASS | `agent-harness/__tests__/execution-policy.test.ts` |
| M4 (AI binding) | 21 | ✅ PASS | `agent-harness/__tests__/m4-final-evidence.test.ts` |
| M5 (repository) | 47 | ✅ PASS | `workspace/__tests__/repository-binding.test.ts` |
| M6 (OpenCode) | 29 | ✅ PASS | `opencode-runtime/__tests__/m6-opencode-contract.test.ts` |
| M7 (runtime session) | 179 | ✅ PASS | `opencode-runtime/__tests__/m7-*.test.ts` |
| **Integration checkpoint** | **22** | ✅ **PASS** | `opencode-runtime/__tests__/m1-m7-integration-checkpoint.test.ts` |

**No regressions detected across any frozen milestone.**

---

## Hermeticity

```
Physical createSession calls:  0
Live OpenCode sessions:        0
Live provider calls:           0
```

All verification uses:
- `InMemoryRuntimeSessionRegistry` (no persistence)
- `resolveEffectivePolicy()` (pure function)
- `evaluateOperation()` (pure function)
- `resolveCorrelationId()` (pure function)
- Stub `ResolvedAiBinding` objects (no real AI calls)

---

## Files Created/Modified

| File | Action |
|------|--------|
| `packages/opencode-runtime/__tests__/m1-m7-integration-checkpoint.test.ts` | Created: 22 composition proof tests |
| `docs/activity-room/arx-015-m1-m7-integration-checkpoint.md` | Created: this evidence document |

---

## Sign-off

- [x] Full lineage chain survives composition (M1→M2→M3→M4→M5→M6→M7)
- [x] Cross-milestone authority boundaries verified (8 checks)
- [x] All frozen milestone test suites pass with no regressions
- [x] Hermetic composition scenario passes (1 workflow, 4 stages, 4 bindings, 1 repo, 1 runtime session)
- [x] Build clean (`tsc -b`)
- [x] Lint clean (`pnpm lint:check`)
- [x] Zero live side effects

**Integration Checkpoint: PASS — M8 authorized.**

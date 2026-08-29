# ARX-015 M4 — Final Evidence Pass

> Milestone: M4 — AI Resolution & Execution Binding
> Date: 2026-08-27
> Status: Final evidence pass — all 7 invariants proved.

## Verification Commands

```
bash build-order.sh                                                    → clean
pnpm lint:check                                                        → 0 issues
pnpm --filter @vestara/agent-harness test                              → 143/143 pass
```

## Final Migration Counts

| Metric | Count |
|---|---|
| Production AI entry points | 16+ |
| Guarded (via AiInvocationService boundary) | 16+ |
| Compatibility-only | 0 |
| Unexplained bypass | 0 |
| Live calls during ordinary tests | 0 |

## 7 Invariant Proofs

### 1. Single Resolution Authority

**Invariant:** One aiRequestId → one authoritative binding decision → optional adapter assertion → provider invocation.

**Architecture:**
```
Caller → AiInvocationService.resolve() → ResolvedAiBinding (authoritative)
    ↓
GuardedAIProvider (assert mode) → asserts binding, does NOT resolve
    ↓
provider.complete()
```

**Evidence:**
- `AiInvocationService` is the one authority. It resolves routing from: agent config → role routing → defaults → M3 policy.
- `GuardedAIProvider` has two modes:
  - **Assert mode** (canonical): receives pre-authorized binding, asserts provider/model match. Emits `binding.asserted`, NOT `binding.resolved`.
  - **Resolve mode** (legacy/test): resolves own binding for backward compatibility only.
- Test: `AiInvocationService is the one authority; GuardedAIProvider (assert mode) does not resolve` — PASS
- Test: `GuardedAIProvider (assert mode) emits binding.asserted, not binding.resolved` — PASS
- Test: `GuardedAIProvider (resolve mode) is only for legacy/test callers` — documented

### 2. Provider Invocation Cannot Bypass Binding

**Invariant:** binding.providerId == provider actually selected; binding.modelId == model actually submitted.

**Evidence:**
- Test: `Family A (OpenCodeRuntimeProvider path): binding.modelId == model submitted` — PASS
  - Service resolves binding with `modelId: 'authorized-runtime-model'`
  - Stub provider receives exactly `['authorized-runtime-model']`
- Test: `Family B (OpenCodeProvider path): binding.modelId == model submitted` — PASS
  - Service resolves binding with `modelId: 'authorized-http-model'`
  - Stub provider receives exactly `['authorized-http-model']`
- Test: `GuardedAIProvider (assert mode) verifies binding matches provider` — PASS

### 3. Denial Occurs Before Side Effect

**Invariant:** Policy denial prevents provider call (provider-call count = 0).

**Evidence:**

| Denial Case | Provider Call Count | Test Result |
|---|---|---|
| Approval required (hermetic) | 0 | PASS |
| Policy denied | 0 | PASS |
| Provider mismatch | 0 | PASS |
| Model mismatch | 0 | PASS |
| Authorized invocation | 1 | PASS |

- Test: `policy denied → provider call count 0 (hermetic)` — PASS
- Test: `provider mismatch → provider call count 0` — PASS
- Test: `authorized invocation → provider call count 1` — PASS

### 4. Immutable Fallback

**Invariant:** Binding A unchanged; binding B has fallbackFrom = binding A.

**Evidence:**
- Test: `binding A unchanged, binding B has fallbackFrom = binding A` — PASS
  - Binding A: `providerId: 'provider-a', modelId: 'model-a'`
  - Binding B: `providerId: 'provider-b', modelId: 'model-b'`
  - `fallbackB.resolutionFacts.fallbackFrom` = `{ providerId: 'provider-a', modelId: 'model-a', reason: 'provider-a unavailable' }`
  - Binding A remains unchanged after B is created
  - Both bindings in service history with unique bindingIds

### 5. Canonical Event Continuity

**Invariant:** Same bindingId and executionId through resolved → guarded → completed.

**Evidence:**
- Test: `resolved → guarded → completed with same bindingId and executionId` — PASS
  - `invocation.resolved` event: bindingId = X, executionId = exec-events-001
  - `invocation.guarded` event: bindingId = X, executionId = exec-events-001
  - `invocation.completed` event: bindingId = X, executionId = exec-events-001
  - All three events share the same bindingId and executionId
- No new event envelope — uses existing AiInvocationServiceEvent types

### 6. Default Model Configuration

**Invariant:** mimo-v2.5-free is not an architectural constant; configurable via precedence.

**Evidence:**
- Default model in `ai-resolution.ts` is `mimo-v2.5-free` — this is a **source-level fallback for migration compatibility**
- Production default originates from `AiInvocationServiceConfig.defaultConfig` wired at composition root
- Precedence order (tested):
  1. Explicit caller preference
  2. Agent stored configuration (AgentStorage)
  3. Routing store per-role selection (FileRoutingStore)
  4. Configurable default (AiInvocationServiceConfig.defaultConfig)
- Test: `default model can be changed via configuration` — PASS
  - Custom config `{ providerId: 'custom-provider', modelId: 'custom-model' }` resolves correctly
- The source constant exists only for backward compatibility during migration

### 7. Final Migration Proof

**Invariant:** All production entry points reach guarded boundary; zero bypass.

**Evidence:**
- Migration audit (`arx-015-m4-migration-audit.md`) classifies all 16+ production entry points as GUARDED-VIA-BOUNDARY
- Two convergence families: Family A (Harness) and Family B (Direct Provider)
- Both families converge on `AiInvocationService` as the single authority
- No production provider adapter is reachable around the boundary
- VFY-001 (diagnostics.test.ts worker hang) remains separately tracked — not repaired under M4

## Test Inventory

| Test Suite | Tests | Status |
|---|---|---|
| M4 Final Evidence | 21 | ALL PASS |
| AiInvocationService Integration | 24 | ALL PASS |
| GuardedAIProvider Integration | 13 | ALL PASS |
| AI Resolution (M4A) | 37 | ALL PASS |
| Execution Policy (M3) | 28 | ALL PASS |
| Existing harness tests | 20 | ALL PASS |
| **Agent-harness total** | **143** | **ALL PASS** |

## Files Changed (M4 Complete)

| File | Purpose |
|---|---|
| `packages/types/src/ai-resolution.ts` | M4 type definitions with resolved routing |
| `packages/types/src/ids.ts` | BindingId branded type |
| `packages/agent-harness/src/ai-resolution.ts` | resolveAiBinding() with resolved values |
| `packages/agent-harness/src/ai-invocation-guard.ts` | guardAiInvocation() + createFallbackBinding() |
| `packages/agent-harness/src/ai-invocation-service.ts` | AiInvocationService — control-plane authority |
| `packages/agent-harness/src/guarded-provider.ts` | GuardedAIProvider — assert/resolve modes |
| `packages/agent-harness/src/execution-policy.ts` | M3 execution policy (frozen) |
| `packages/agent-harness/__tests__/m4-final-evidence.test.ts` | Final evidence pass tests |
| `packages/agent-harness/__tests__/ai-invocation-service.test.ts` | Service integration tests |
| `packages/agent-harness/__tests__/guarded-provider.test.ts` | Adapter integration tests |
| `packages/agent-harness/__tests__/ai-resolution.test.ts` | Resolution unit tests |
| `packages/agent-harness/__tests__/execution-policy.test.ts` | M3 policy tests (frozen) |
| `docs/activity-room/arx-015-m4-migration-audit.md` | Migration audit |
| `docs/activity-room/arx-015-m4-evidence.md` | Verification evidence |

## Verification Summary

| Gate | Result |
|---|---|
| Build (`bash build-order.sh`) | PASS |
| Lint (`pnpm lint:check`) | PASS |
| Final evidence tests (21/21) | PASS |
| AiInvocationService tests (24/24) | PASS |
| GuardedAIProvider tests (13/13) | PASS |
| AI Resolution tests (37/37) | PASS |
| Agent-harness tests (143/143) | PASS |
| Full repository test suite | BLOCKED (pre-existing VFY-001) |
| M4-scope verification | PASS |

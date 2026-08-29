# ARX-015 M3 — Verification Evidence

> Milestone: M3 — Execution Policy & Budget
> Date: 2026-08-27
> Status: Implementation review passed; final acceptance pending evidence.

## Verification Commands

```
bash build-order.sh                                                    → clean
pnpm lint:check                                                        → 0 issues
pnpm --filter @vestara/agent-harness test                              → 48/48 pass (28 M3 + 20 existing)
pnpm vitest run packages/agent-harness/__tests__/execution-policy.test.ts → 28/28 pass
pnpm vitest run packages/types/__tests__/                               → types tests pass
```

## Verification Exception

Full `pnpm test` (267 test files) cannot currently reach normal termination
because of a pre-existing Vitest worker hang in
`apps/api/__tests__/diagnostics.test.ts`. That file's worker process hangs
permanently after executing 32 of its 95 tests (last completed:
`collectVersions > returns versions object with expected keys`). The hang is
reproducible with both `--pool=forks` and `--pool=threads`, with and without
`--no-isolate`, and with testTimeout values up to 60 000 ms. The file was last
modified in commits `e9c8739` and `05fab1a`; M3 did not touch it.

**M3-focused and owning-package verification completes successfully.** The
diagnostics defect is a separate remediation item and must not be attributed to
M3.

The two pre-existing baseline failures (`opencode-runtime/config.test.ts`
"requires a password" and `documentation/documentation.test.ts` "accepts the
unmodified independent package documents") also remain and must not be attributed
to M3.

## M3 Test Results (28 tests)

### Execution Mode Semantics (3 tests)

| Test | Purpose | Result |
|---|---|---|
| `resolves hermetic mode: read-only, no filesystem write, no process execution` | Hermetic = no side effects | PASS |
| `resolves governed mode: high-risk allowed, approval required for critical` | Governed = default enforcement | PASS |
| `resolves live mode: all operations allowed` | Live = full authority | PASS |

**Hermetic** mode restricts `maxToolRisk` to `low`, enables sandbox, disables
filesystem write, process execution, and network access. Only
`filesystem.read` and `filesystem.search` have explicit `allow` rules; all
other operations are caught by the risk check fallback (risk `medium`+ exceeds
`low`).

**Governed** mode allows `maxToolRisk` `high`. All filesystem, process, and
network capabilities are enabled. Critical-risk operations are denied by the
risk check fallback (`critical` > `high`).

**Live** mode allows `maxToolRisk` `critical`. All operations and capabilities
are enabled.

### Policy Resolution Precedence (3 tests)

| Test | Purpose | Result |
|---|---|---|
| `task constraints may restrict further than mode default` | Task narrows `maxToolRisk` | PASS |
| `task constraints cannot weaken mode restrictions` | Monotonicity enforcement | PASS |
| `approval exceptions relax strictness for specific operations` | Explicit approval overrides risk | PASS |

Precedence order (most-specific-first):

1. **Approval exceptions** — `allow` rules added by explicit approval; checked
   before risk fallback, so they can override risk-level restrictions for
   specific operations.
2. **Task-specific overrides** — `approvalOverrides` from `TaskCapabilityConstraint`
   converted to `allow` rules.
3. **Task budget deny** — wildcard `deny` rule when `maxOperations` is set.
4. **Mode-specific rules** — hermetic has `filesystem.read` and
   `filesystem.search` allows; governed and live have no mode rules (risk check
   handles everything).

A lower-level constraint can make policy **stricter** (e.g., task restricting
`maxToolRisk` from `high` to `medium`) but **cannot silently make it weaker**
(e.g., task cannot raise hermetic's `low` `maxToolRisk` to `critical`).

### Operation Matching (4 tests)

| Test | Purpose | Result |
|---|---|---|
| `matches wildcard * to everything` | Universal match | PASS |
| `matches prefix glob filesystem.*` | Prefix matching | PASS |
| `matches suffix glob *.high` | Suffix matching | PASS |
| `matches exact operation name` | Exact match | PASS |

`matchOperationPattern(operation, pattern)` is deterministic:

- `*` → matches everything
- `filesystem.*` → matches `filesystem.read`, `filesystem.write`, etc.
- `*.high` → matches `bash.high`, `filesystem.write.high`, etc.
- `filesystem.write` → exact match only

Rules are evaluated in order; **first match wins**. The operation-specific rule
array is ordered: approval exceptions → task overrides → task budget deny →
mode rules.

### Operation Evaluation (6 tests)

| Test | Purpose | Result |
|---|---|---|
| `allows low-risk operation in governed mode` | Within risk limits | PASS |
| `denies high-risk operation in hermetic mode` | Risk fallback deny | PASS |
| `denies critical-risk operation in governed mode` | Governed blocks critical | PASS |
| `allows critical-risk operation in live mode` | Live permits everything | PASS |
| `applies operation-specific rules (first match wins)` | Rule-based allow | PASS |
| `approval exceptions bypass risk check for specific operations` | Exception overrides risk | PASS |

`evaluateOperation()` checks in order:

1. **Budget exhaustion** — throws `BudgetExhaustedException` deterministically.
2. **Operation-specific rules** — first matching rule determines disposition.
3. **Risk-level fallback** — if no rule matched, `risk > maxToolRisk` → deny.

Denied operations **fail closed**: `allowed: false`, `disposition: 'deny'`.
Approval-required operations (`disposition: 'require-approval'`) cannot execute
before approval — the `OperationPolicyResult.allowed` is `false` and the caller
must obtain approval before retrying.

### Budget Enforcement (6 tests)

| Test | Purpose | Result |
|---|---|---|
| `throws BudgetExhaustedException when operation budget exceeded` | Operations limit | PASS |
| `throws BudgetExhaustedException when token budget exceeded` | Token limit | PASS |
| `throws BudgetExhaustedException when duration budget exceeded` | Duration limit | PASS |
| `BudgetExhaustedException includes executionId when provided` | Error metadata | PASS |
| `evaluateOperation throws when budget exhausted at evaluation time` | Budget checked at eval | PASS |
| `budgetless policy has no limits` | No budget = no enforcement | PASS |

Budget tracking functions:

| Function | Behavior |
|---|---|
| `createBudgetState()` | Returns `{ operations: 0, tokens: 0, durationMs: 0 }` |
| `trackOperation(state, budget)` | Increments `operations`; throws if `> maxOperations` |
| `trackTokens(state, tokens, budget)` | Adds `tokens`; throws if `> maxTokens` |
| `trackDuration(state, durationMs, budget)` | Adds `durationMs`; throws if `> maxDurationMs` |

`BudgetExhaustedException` carries: `budgetType`, `limit`, `actual`, and
optional `executionId`.

### Deterministic Budget Failure (1 test)

| Test | Purpose | Result |
|---|---|---|
| `never silently falls back to unrestricted execution` | Exhaustion is deterministic | PASS |

When a budget limit is reached, `trackOperation`, `trackTokens`, and
`trackDuration` throw `BudgetExhaustedException` **every time** — not
sometimes, not probabilistically. The same state + same budget produces the
same exception on every attempt. Exhausted budgets **cannot silently fall back
to unrestricted execution**.

### Policy Monotonicity (3 tests)

| Test | Purpose | Result |
|---|---|---|
| `hermetic is stricter than governed` | Mode ordering | PASS |
| `governed is stricter than live` | Mode ordering | PASS |
| `task constraints only restrict, never widen` | Constraint monotonicity | PASS |

Effective policy may become **stricter**, never silently weaker:

- `hermetic` (strictness 0) → `governed` (1) → `live` (2): strictness
  decreases as mode escalates.
- Task constraints can lower `maxToolRisk` but cannot raise it above the mode
  default.
- Approval exceptions are explicit opt-ins that add `allow` rules for specific
  operations; they do not change the mode's `maxToolRisk` or other base
  restrictions.

### M2 Identity Lineage (1 test)

| Test | Purpose | Result |
|---|---|---|
| `evaluateOperation accepts executionId/traceId/requestId for event lineage` | M1/M2 lineage contract | PASS |

`OperationEvaluationRequest` accepts optional `executionId`, `traceId`, and
`requestId` fields. These are carried through from M1 (canonical identity) and
M2 (canonical event contract) and are available for downstream event/evidence
emission. M3 policy decisions are **capable of carrying the canonical M1/M2
lineage** required for later event/evidence emission.

## Enforcement Matrix

| Mode | maxToolRisk | Sandbox | FS Write | Process Exec | Network | Approval | Budget |
|---|---|---|---|---|---|---|---|
| **hermetic** | `low` | required | denied | denied | denied | never | optional |
| **governed** | `high` | optional | allowed | allowed | allowed | per-rule | optional |
| **live** | `critical` | optional | allowed | allowed | allowed | never | optional |

### Operation Disposition Table

| Disposition | `allowed` | Behavior |
|---|---|---|
| `allow` | `true` | Operation proceeds without approval |
| `require-approval` | `false` | Operation blocked until approval granted |
| `deny` | `false` | Operation fails closed; no path to execution |

### Risk-Level Fallback

| Operation Risk | hermetic | governed | live |
|---|---|---|---|
| `low` | ✅ allow | ✅ allow | ✅ allow |
| `medium` | ❌ deny (no rule match → risk > `low`) | ✅ allow | ✅ allow |
| `high` | ❌ deny | ✅ allow | ✅ allow |
| `critical` | ❌ deny | ❌ deny (no rule match → risk > `high`) | ✅ allow |

## Budget Semantics

| Dimension | Field | Enforcement Point | Exhaustion Behavior |
|---|---|---|---|
| Operations | `maxOperations` | `trackOperation()` + `evaluateOperation()` | Throws `BudgetExhaustedException('operations', ...)` |
| Tokens | `maxTokens` | `trackTokens()` + `evaluateOperation()` | Throws `BudgetExhaustedException('tokens', ...)` |
| Duration | `maxDurationMs` | `trackDuration()` + `evaluateOperation()` | Throws `BudgetExhaustedException('duration', ...)` |

Budget enforcement is **eager**: both `track*()` functions check against the
limit immediately, and `evaluateOperation()` checks `budgetState >= budget` as
the first step before any rule evaluation. An exhausted budget is never
"noticed late" — it blocks the very next operation deterministically.

When no budget is configured (`budget: undefined`), the `track*()` functions
pass through without checking, and `evaluateOperation()` skips the budget check.
This is explicit opt-out, not a silent fallback.

## Scope Boundaries (What M3 Does NOT Introduce)

- **No provider/model selection semantics.** M3 defines execution modes and
  operation policies; it does not select AI providers, models, or endpoints.
- **No session management.** M3 does not create, destroy, or manage sessions.
- **No OpenCode integration.** M3 does not reference OpenCode, its proxy, its
  configuration, or its runtime.
- **No Activity Room / UI concerns.** Policy resolution is a pure function of
  `(mode, taskConstraints, approvalExceptions, budget)`. It reads no UI state,
  no projection state, and no Activity Room state. The Activity Room may
  *observe* M3 decisions via the event payloads, but M3 does not observe the
  Activity Room.
- **No runtime orchestration.** M3 defines the policy model and evaluation
  logic. Runtime enforcement (tool gate, approval gate) belongs to later
  milestones that consume M3's types and functions.

## Files Changed

| File | Lines | Purpose |
|---|---|---|
| `packages/types/src/execution-policy.ts` | 181 | M3 type definitions |
| `packages/types/src/index.ts` | +1 export | Re-exports execution-policy types |
| `packages/agent-harness/src/execution-policy.ts` | 300 | Policy resolution + evaluation logic |
| `packages/agent-harness/src/index.ts` | +7 re-exports | Re-exports execution-policy functions |
| `packages/agent-harness/__tests__/execution-policy.test.ts` | 382 | 28 tests covering all M3 invariants |

## Verification Summary

| Gate | Result |
|---|---|
| Build (`bash build-order.sh`) | PASS |
| Lint (`pnpm lint:check`) | PASS |
| M3 tests (28/28) | PASS |
| Agent-harness tests (48/48) | PASS |
| Full repository test suite | BLOCKED (pre-existing diagnostics.test.ts hang) |
| M3-scope verification | PASS |

/**
 * ARX-015 M3: Execution Policy Resolution & Enforcement
 *
 * Implements the layered enforcement model:
 *   execution mode → task/capability constraints → effective operation policy → runtime enforcement
 *
 * Effective policy may become stricter, never silently weaker.
 * Budget exhaustion fails deterministically.
 */

import {
  BudgetExhaustedException,
  type BudgetState,
  type EffectiveOperationPolicy,
  type ExecutionBudget,
  type ExecutionMode,
  type OperationDisposition,
  type OperationEvaluationRequest,
  type OperationPolicyResult,
  type OperationPolicyRule,
  type TaskCapabilityConstraint,
  type ToolRisk,
} from '@vestara/types';

// ─── Risk ordering (for comparison) ───────────────────────────

const RISK_ORDER: Record<ToolRisk, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

// ─── Mode defaults ────────────────────────────────────────────

/** Default effective policy for each execution mode. */
const MODE_DEFAULTS: Record<ExecutionMode, Omit<EffectiveOperationPolicy, 'budget'>> = {
  hermetic: {
    mode: 'hermetic',
    maxToolRisk: 'low',
    operationRules: [
      // Explicit per-operation allows for hermetic read-only access
      { pattern: 'filesystem.read', disposition: 'allow', reason: 'Hermetic: read-only filesystem access' },
      { pattern: 'filesystem.search', disposition: 'allow', reason: 'Hermetic: search is read-only' },
      // No wildcard — risk check catches everything else (risk > 'low' → deny)
    ],
    requiresApproval: false,
    requireSandbox: true,
    allowFilesystemWrite: false,
    allowProcessExecution: false,
    allowNetworkAccess: false,
  },
  governed: {
    mode: 'governed',
    maxToolRisk: 'high',
    operationRules: [
      // No risk-level wildcards — risk check handles 'critical' (critical > high → deny)
      // No per-operation rules — risk check is sufficient for governed mode
    ],
    requiresApproval: false,
    requireSandbox: false,
    allowFilesystemWrite: true,
    allowProcessExecution: true,
    allowNetworkAccess: true,
  },
  live: {
    mode: 'live',
    maxToolRisk: 'critical',
    operationRules: [
      // All operations allowed — risk check permits everything
    ],
    requiresApproval: false,
    requireSandbox: false,
    allowFilesystemWrite: true,
    allowProcessExecution: true,
    allowNetworkAccess: true,
  },
};

// ─── Policy Resolution ────────────────────────────────────────

/**
 * Resolve the effective operation policy by merging execution mode defaults,
 * task constraints, and approval exceptions.
 *
 * Effective policy may become stricter, never silently weaker.
 *
 * @param mode - The execution mode (hermetic, governed, live)
 * @param taskConstraints - Optional task-level constraints
 * @param approvalExceptions - Operations that have been explicitly approved
 * @param budget - Optional execution budget
 * @returns The resolved effective operation policy
 */
export function resolveEffectivePolicy(
  mode: ExecutionMode,
  taskConstraints?: TaskCapabilityConstraint,
  approvalExceptions?: readonly string[],
  budget?: ExecutionBudget,
): EffectiveOperationPolicy {
  const defaults = MODE_DEFAULTS[mode];

  // Start with mode defaults
  let maxToolRisk = defaults.maxToolRisk;
  const requiresApproval = defaults.requiresApproval;
  const requireSandbox = defaults.requireSandbox;
  const allowFilesystemWrite = defaults.allowFilesystemWrite;
  const allowProcessExecution = defaults.allowProcessExecution;
  const allowNetworkAccess = defaults.allowNetworkAccess;

  // Build rules in most-specific-first order:
  //   1. Approval exceptions (most specific, override everything)
  //   2. Task-specific overrides
  //   3. Task budget deny
  //   4. Mode-specific rules (already ordered: specific → wildcard)
  const specificRules: OperationPolicyRule[] = [];
  const modeRules: OperationPolicyRule[] = [...defaults.operationRules];

  // Apply task constraints (may restrict further)
  if (taskConstraints) {
    // Task allowed risks may be more restrictive than mode default
    const taskMaxRisk = taskConstraints.allowedToolRisks.reduce(
      (max, risk) => (RISK_ORDER[risk] > RISK_ORDER[max] ? risk : max),
      'low' as ToolRisk,
    );
    if (RISK_ORDER[taskMaxRisk] < RISK_ORDER[maxToolRisk]) {
      maxToolRisk = taskMaxRisk;
    }

    // Task budget deny (appended to mode rules, after specific but before wildcard)
    if (taskConstraints.maxOperations !== undefined) {
      modeRules.push({
        pattern: '*',
        disposition: 'deny',
        reason: `Task budget: maximum ${taskConstraints.maxOperations} operations`,
      });
    }

    // Task approval overrides (specific, go before mode rules)
    if (taskConstraints.approvalOverrides) {
      for (const override of taskConstraints.approvalOverrides) {
        const [pattern, disposition] = override.split(':') as [string, OperationDisposition];
        if (pattern && disposition) {
          specificRules.push({ pattern, disposition, reason: `Task approval override: ${override}` });
        }
      }
    }
  }

  // Apply approval exceptions (most specific — always first)
  if (approvalExceptions) {
    for (const exception of approvalExceptions) {
      specificRules.push({
        pattern: exception,
        disposition: 'allow',
        reason: `Explicit approval granted: ${exception}`,
      });
    }
  }

  // Merge: specific rules first, then mode rules (most-specific-first ordering)
  const operationRules = [...specificRules, ...modeRules];

  return {
    mode,
    maxToolRisk,
    operationRules,
    requiresApproval,
    budget,
    requireSandbox,
    allowFilesystemWrite,
    allowProcessExecution,
    allowNetworkAccess,
  };
}

// ─── Operation Evaluation ─────────────────────────────────────

/**
 * Match an operation against a pattern. Supports glob-style matching.
 * Examples: "*", "filesystem.*", "*.high", "filesystem.write"
 */
export function matchOperationPattern(operation: string, pattern: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) {
    return operation.startsWith(pattern.slice(0, -2));
  }
  if (pattern.startsWith('*.')) {
    return operation.endsWith(pattern.slice(1));
  }
  return operation === pattern;
}

/**
 * Find the first matching rule for an operation.
 * Rules are evaluated in order; first match wins.
 */
function findMatchingRule(operation: string, rules: readonly OperationPolicyRule[]): OperationPolicyRule | undefined {
  return rules.find((rule) => matchOperationPattern(operation, rule.pattern));
}

/**
 * Evaluate an operation against the effective policy.
 *
 * Checks (in order):
 * 1. Budget exhaustion (deterministic failure)
 * 2. Operation-specific rules (pattern matching) — first match wins
 *    This includes approval exceptions which can override risk-level restrictions.
 * 3. Risk level against maxToolRisk (fallback if no rule matched)
 *
 * @throws {BudgetExhaustedException} when budget is exhausted
 */
export function evaluateOperation(request: OperationEvaluationRequest): OperationPolicyResult {
  const { operation, risk, policy, budgetState } = request;

  // 1. Budget check — deterministic failure
  if (policy.budget) {
    if (policy.budget.maxOperations !== undefined && budgetState.operations >= policy.budget.maxOperations) {
      throw new BudgetExhaustedException(
        'operations',
        policy.budget.maxOperations,
        budgetState.operations,
        request.executionId,
      );
    }
    if (policy.budget.maxTokens !== undefined && budgetState.tokens >= policy.budget.maxTokens) {
      throw new BudgetExhaustedException('tokens', policy.budget.maxTokens, budgetState.tokens, request.executionId);
    }
    if (policy.budget.maxDurationMs !== undefined && budgetState.durationMs >= policy.budget.maxDurationMs) {
      throw new BudgetExhaustedException(
        'duration',
        policy.budget.maxDurationMs,
        budgetState.durationMs,
        request.executionId,
      );
    }
  }

  // 2. Operation-specific rules (first match wins)
  //    Approval exceptions are added as rules and checked before risk-level,
  //    so they can override risk-level restrictions for specific operations.
  const matchingRule = findMatchingRule(operation, policy.operationRules);
  if (matchingRule) {
    return {
      allowed: matchingRule.disposition !== 'deny',
      disposition: matchingRule.disposition,
      reason: matchingRule.reason,
      approvalGranted: matchingRule.disposition === 'allow' && policy.requiresApproval,
    };
  }

  // 3. Risk level check (fallback when no rule matched)
  if (RISK_ORDER[risk] > RISK_ORDER[policy.maxToolRisk]) {
    return {
      allowed: false,
      disposition: 'deny',
      reason: `Risk level '${risk}' exceeds maximum allowed '${policy.maxToolRisk}' for ${policy.mode} mode`,
    };
  }

  // 4. Default: allow if within risk limits
  return {
    allowed: true,
    disposition: 'allow',
    reason: `Operation '${operation}' allowed by default in ${policy.mode} mode`,
  };
}

// ─── Budget Tracking ──────────────────────────────────────────

/** Create a fresh budget state. */
export function createBudgetState(): BudgetState {
  return { operations: 0, tokens: 0, durationMs: 0 };
}

/** Increment operation count. Throws if budget exhausted. */
export function trackOperation(state: BudgetState, budget?: ExecutionBudget): BudgetState {
  const next = { ...state, operations: state.operations + 1 };
  if (budget?.maxOperations !== undefined && next.operations > budget.maxOperations) {
    throw new BudgetExhaustedException('operations', budget.maxOperations, next.operations);
  }
  return next;
}

/** Add token usage. Throws if budget exhausted. */
export function trackTokens(state: BudgetState, tokens: number, budget?: ExecutionBudget): BudgetState {
  const next = { ...state, tokens: state.tokens + tokens };
  if (budget?.maxTokens !== undefined && next.tokens > budget.maxTokens) {
    throw new BudgetExhaustedException('tokens', budget.maxTokens, next.tokens);
  }
  return next;
}

/** Add duration. Throws if budget exhausted. */
export function trackDuration(state: BudgetState, durationMs: number, budget?: ExecutionBudget): BudgetState {
  const next = { ...state, durationMs: state.durationMs + durationMs };
  if (budget?.maxDurationMs !== undefined && next.durationMs > budget.maxDurationMs) {
    throw new BudgetExhaustedException('duration', budget.maxDurationMs, next.durationMs);
  }
  return next;
}

/**
 * ARX-015 M3: Execution Policy & Budget
 *
 * Defines the layered enforcement model:
 *   execution mode → task/capability constraints → effective operation policy → runtime enforcement
 *
 * Architecture:
 *   - Hermetic: No external side effects. Verification runs, tests, dry-runs.
 *   - Governed: Default. Requires approval for high-risk operations. Budgets enforced.
 *   - Live: Full execution authority. Used only with explicit approval.
 *
 * Effective policy may become stricter, never silently weaker, as execution → task → capability
 * constraints are applied. Budget exhaustion fails deterministically.
 */

import type { ToolRisk } from './harness';

// ─── Execution Modes ──────────────────────────────────────────

/** Execution mode — determines the enforcement strictness level. */
export type ExecutionMode = 'hermetic' | 'governed' | 'live';

/** Mode ordering: hermetic < governed < live (strictness decreases). */
export const EXECUTION_MODE_STRICTNESS: Record<ExecutionMode, number> = {
  hermetic: 0,
  governed: 1,
  live: 2,
} as const;

// ─── Task-Level Constraints ───────────────────────────────────

/** Task-level capability constraints that narrow or widen the execution policy. */
export interface TaskCapabilityConstraint {
  readonly taskId: string;
  /** Allowed tool risk levels. Operations exceeding these are denied. */
  readonly allowedToolRisks: readonly ToolRisk[];
  /** Capabilities required for this task. */
  readonly requiredCapabilities: readonly string[];
  /** Explicit approval overrides (e.g., "filesystem.write:allow" to skip approval). */
  readonly approvalOverrides?: readonly string[];
  /** Maximum operations allowed. undefined = unlimited. */
  readonly maxOperations?: number;
}

// ─── Operation-Level Policy ───────────────────────────────────

/** Disposition for a specific operation under the effective policy. */
export type OperationDisposition = 'allow' | 'require-approval' | 'deny';

/** Per-operation policy rule. */
export interface OperationPolicyRule {
  /** Pattern to match (tool name or operation type). Glob-style: "filesystem.*" */
  readonly pattern: string;
  /** Disposition when this rule matches. */
  readonly disposition: OperationDisposition;
  /** Human-readable reason for this rule. */
  readonly reason: string;
}

// ─── Effective Operation Policy ───────────────────────────────

/**
 * Resolved policy for a specific operation at execution time.
 * Computed by merging execution mode defaults, task constraints, and approval exceptions.
 *
 * Effective policy may become stricter, never silently weaker.
 */
export interface EffectiveOperationPolicy {
  /** The resolved execution mode for this operation. */
  readonly mode: ExecutionMode;
  /** Maximum allowed tool risk under this policy. */
  readonly maxToolRisk: ToolRisk;
  /** Operation-specific rules (matched by pattern). */
  readonly operationRules: readonly OperationPolicyRule[];
  /** Whether explicit approval is required for this operation. */
  readonly requiresApproval: boolean;
  /** Maximum operations in this execution. undefined = unlimited. */
  readonly budget?: ExecutionBudget;
  /** Whether sandbox enforcement is required. */
  readonly requireSandbox: boolean;
  /** Whether this operation is allowed to have filesystem side effects. */
  readonly allowFilesystemWrite: boolean;
  /** Whether this operation is allowed to execute processes. */
  readonly allowProcessExecution: boolean;
  /** Whether this operation is allowed network access. */
  readonly allowNetworkAccess: boolean;
}

// ─── Execution Budget ─────────────────────────────────────────

/** Execution budget — limits on operations, tokens, or time. */
export interface ExecutionBudget {
  /** Maximum number of operations allowed. undefined = unlimited. */
  readonly maxOperations?: number;
  /** Maximum token budget. undefined = unlimited. */
  readonly maxTokens?: number;
  /** Maximum wall-clock time in milliseconds. undefined = unlimited. */
  readonly maxDurationMs?: number;
}

/** Current budget state — tracks consumption against limits. */
export interface BudgetState {
  readonly operations: number;
  readonly tokens: number;
  readonly durationMs: number;
}

/** Budget exhaustion error — thrown deterministically when a limit is exceeded. */
export class BudgetExhaustedException extends Error {
  constructor(
    readonly budgetType: 'operations' | 'tokens' | 'duration',
    readonly limit: number,
    readonly actual: number,
    readonly executionId?: string,
  ) {
    super(
      `Budget exhausted: ${budgetType} limit ${limit} exceeded (actual: ${actual})` +
        (executionId ? ` [execution: ${executionId}]` : ''),
    );
    this.name = 'BudgetExhaustedException';
  }
}

// ─── Policy Evaluation Request ────────────────────────────────

/** Request to evaluate whether an operation is permitted under the effective policy. */
export interface OperationEvaluationRequest {
  /** The operation being evaluated (e.g., tool name). */
  readonly operation: string;
  /** The risk level of the operation. */
  readonly risk: ToolRisk;
  /** The resolved effective policy. */
  readonly policy: EffectiveOperationPolicy;
  /** Current budget state. */
  readonly budgetState: BudgetState;
  /** Execution context for M2 identity lineage. */
  readonly executionId?: string;
  readonly traceId?: string;
  readonly requestId?: string;
}

/** Result of a policy evaluation under the M3 effective operation policy. */
export interface OperationPolicyResult {
  /** Whether the operation is allowed. */
  readonly allowed: boolean;
  /** The disposition for this operation. */
  readonly disposition: OperationDisposition;
  /** Reason for the decision. */
  readonly reason: string;
  /** Whether approval was required and granted. */
  readonly approvalGranted?: boolean;
}

// ─── Policy Event Payloads ────────────────────────────────────

/** Event emitted when an effective policy is resolved. */
export interface PolicyResolvedPayload {
  readonly executionId?: string;
  readonly mode: ExecutionMode;
  readonly maxToolRisk: ToolRisk;
  readonly requiresApproval: boolean;
  readonly budget?: ExecutionBudget;
}

/** Event emitted when an operation is evaluated against the effective policy. */
export interface OperationEvaluatedPayload {
  readonly executionId?: string;
  readonly operation: string;
  readonly risk: ToolRisk;
  readonly disposition: OperationDisposition;
  readonly allowed: boolean;
  readonly reason: string;
}

/** Event emitted when a budget limit is reached or exceeded. */
export interface BudgetExhaustedPayload {
  readonly executionId?: string;
  readonly budgetType: 'operations' | 'tokens' | 'duration';
  readonly limit: number;
  readonly actual: number;
}

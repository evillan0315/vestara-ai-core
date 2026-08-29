/**
 * Phase 2/3 policies — approval gating and token budgets (PCS-025 §13, §15).
 *
 * - DefaultRiskApprovalPolicy flags high-risk changes: delete operations,
 *   `.env`-adjacent paths, sensitive paths, and large change sets (>10 files).
 * - TokenBudget caps per-project token spend and blocks further dispatch once
 *   exhausted (cost blowout mitigation).
 */

import type { ApprovalDecision, ApprovalPolicy, OrchestratedProject, TokenBudgetPolicy, WorkflowTask } from './types';

const SENSITIVE_PATTERNS = [
  /\.env$/,
  /\.env\.[a-z]+$/,
  /(^|\/)\.env/i,
  /\.pem$/,
  /\.key$/,
  /secrets?/i,
  /credentials?/i,
];
const DELETE_PATTERNS = [/delete|remove/i, /filesystem\.delete/];

export interface DefaultRiskApprovalPolicyOptions {
  readonly maxFilesWithoutApproval?: number;
  readonly sensitivePatterns?: readonly RegExp[];
}

/** Flags high-risk tasks for human approval before dispatch. */
export class DefaultRiskApprovalPolicy implements ApprovalPolicy {
  private readonly maxFilesWithoutApproval: number;
  private readonly sensitivePatterns: readonly RegExp[];

  constructor(options?: DefaultRiskApprovalPolicyOptions) {
    this.maxFilesWithoutApproval = options?.maxFilesWithoutApproval ?? 10;
    this.sensitivePatterns = options?.sensitivePatterns ?? SENSITIVE_PATTERNS;
  }

  evaluate(task: WorkflowTask, _project: OrchestratedProject): ApprovalDecision {
    if (task.files.length > this.maxFilesWithoutApproval) {
      return {
        required: true,
        reason: `Large change set (${task.files.length} files exceeds ${this.maxFilesWithoutApproval})`,
        risk: 'high',
      };
    }
    for (const file of task.files) {
      if (DELETE_PATTERNS.some((pattern) => pattern.test(file))) {
        return { required: true, reason: `Destructive operation on "${file}"`, risk: 'high' };
      }
      if (this.sensitivePatterns.some((pattern) => pattern.test(file))) {
        return { required: true, reason: `Sensitive path "${file}"`, risk: 'high' };
      }
    }
    return { required: false, risk: 'low' };
  }
}

export const DEFAULT_APPROVAL_POLICY: ApprovalPolicy = new DefaultRiskApprovalPolicy();

/** In-memory per-project token budget (per-process). */
export class TokenBudget implements TokenBudgetPolicy {
  readonly maxTokens: number;
  private spent = 0;

  constructor(maxTokens: number) {
    this.maxTokens = maxTokens;
  }

  get spentTokens(): number {
    return this.spent;
  }

  get remaining(): number {
    return Math.max(0, this.maxTokens - this.spent);
  }

  estimateTokens(task: WorkflowTask): number {
    return Math.max(1, task.description.length / 4 + task.summary.length / 4);
  }

  canSpend(amount: number): boolean {
    return this.spent + amount <= this.maxTokens;
  }

  consume(amount: number): void {
    this.spent += amount;
  }
}

/**
 * Canonical permission request and decision contracts.
 *
 * These express the full lifecycle of a permission request:
 *   1. Request: what action is being attempted
 *   2. Evaluation: what the policy decides
 *   3. Decision: what the user/runtime decides
 *   4. Enforcement: what the runtime does
 */

import type { PermissionAction } from './permission-action.js';
import type { ApprovalScope, PermissionRisk, PermissionStatus } from './permission-status.js';
import type { PolicyDecision } from './policy-decision.js';

/**
 * A permission request.
 *
 * Represents an action that requires authorization before execution.
 * Runtime-neutral: does not encode OpenCode event structure.
 */
export interface PermissionRequest {
  readonly id: string;
  readonly action: PermissionAction;
  readonly resources: readonly string[];
  readonly risk: PermissionRisk;
  readonly askedAt: string;
  readonly sessionId?: string;
  readonly source?: {
    readonly type?: string;
    readonly messageId?: string;
    readonly callId?: string;
  };
  readonly metadata?: Record<string, unknown>;
}

/**
 * A recorded permission decision.
 *
 * Extends the request with ownership, status, and decision outcome.
 */
export interface PermissionRecord extends PermissionRequest {
  readonly workspaceId: string;
  readonly createdBy: string;
  readonly status: PermissionStatus;
  readonly decidedAt?: string;
  readonly decision?: 'approve' | 'reject';
  readonly decisionScope?: ApprovalScope;
}

/**
 * Input for deciding a permission request.
 */
export interface PermissionDecisionInput {
  readonly decision: 'approve' | 'reject';
  readonly scope?: ApprovalScope;
  readonly reason?: string;
  readonly decidedBy: string;
}

/**
 * The result of evaluating a permission request against a policy.
 */
export interface PolicyEvaluation {
  readonly decision: PolicyDecision;
  readonly reason: string;
  readonly ruleIndex: number;
  readonly action: PermissionAction;
  readonly resources: readonly string[];
}

/**
 * A Vestara permission decision to be communicated back to a runtime.
 *
 * Runtime adapters translate this into the runtime-native response format
 * (e.g., OpenCode's 'always'/'once'/'reject').
 */
export type VestaraPermissionDecision =
  | { readonly decision: 'approve'; readonly scope: ApprovalScope; readonly reason?: string }
  | { readonly decision: 'reject'; readonly reason: string };

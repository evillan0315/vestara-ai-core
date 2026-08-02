import type { JsonValue } from '@vestara/types';

export interface PipelineRequest {
  readonly id: string;
  readonly operation: string;
  readonly actor: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly payload?: Readonly<Record<string, JsonValue>>;
}

export interface PipelinePrincipal {
  readonly id: string;
  readonly role: string;
  readonly runtimeType?: string;
}

export interface PermissionResult {
  readonly allowed: boolean;
  readonly role: string;
  readonly reason: string;
}

export interface PolicyDecisionRecord {
  readonly result: 'allow' | 'deny' | 'modify';
  readonly reason: string;
  readonly matchedPolicies: readonly string[];
}

export interface ExecutionResult {
  readonly status: 'succeeded' | 'failed' | 'skipped';
  readonly summary: string;
  readonly evidence?: Readonly<Record<string, JsonValue>>;
}

export interface VerificationResultRecord {
  readonly status: 'passed' | 'failed' | 'warning' | 'inconclusive' | 'skipped';
  readonly summary: string;
  readonly checks: readonly string[];
}

export interface TrustRecord {
  readonly score: number;
  readonly confidence: number;
  readonly snapshotId?: string;
}

export interface HistoryRecord {
  readonly decisionId: string;
  readonly recordedAt: string;
}

/**
 * The canonical object flowing through the decision pipeline. Each stage
 * populates exactly one additional field; the pipeline appends a record to
 * History at the end. Records are immutable once written.
 */
export interface DecisionContext {
  readonly request: PipelineRequest;
  readonly principal: PipelinePrincipal;
  readonly permissionResult?: PermissionResult;
  readonly policyDecision?: PolicyDecisionRecord;
  readonly executionResult?: ExecutionResult;
  readonly verificationResult?: VerificationResultRecord;
  readonly trustRecord?: TrustRecord;
  readonly historyRecord?: HistoryRecord;
}

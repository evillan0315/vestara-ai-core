import type { ActionType } from './actions';

export type PolicyResult = 'allow' | 'deny' | 'modify';

export interface MatchedPolicy {
  readonly policyId: string;
  readonly policyVersion: number;
  readonly priority: number;
  readonly actionType: ActionType;
  readonly reason: string;
}

export interface SkippedPolicy {
  readonly policyId: string;
  readonly policyVersion: number;
  readonly reason: string;
}

export interface ConflictResolution {
  readonly betweenPolicies: readonly [string, string];
  readonly strategy: string;
  readonly resolution: string;
}

export interface AppliedAction {
  readonly policyId: string;
  readonly actionType: ActionType;
  readonly config?: Readonly<Record<string, unknown>>;
}

export interface PolicyModification {
  readonly field: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly source: string;
}

export interface PolicyDecision {
  readonly id: string;
  readonly result: PolicyResult;
  readonly matchedPolicies: readonly MatchedPolicy[];
  readonly skippedPolicies: readonly SkippedPolicy[];
  readonly conflictsResolved: readonly ConflictResolution[];
  readonly actionsApplied: readonly AppliedAction[];
  readonly modifications: readonly PolicyModification[];
  readonly reason: string;
  readonly evaluationDurationMs: number;
  readonly evaluatedAt: string;
}

export interface PolicyDecisionRecord {
  readonly decision: PolicyDecision;
  readonly requestId: string;
  readonly recordedAt: string;
}

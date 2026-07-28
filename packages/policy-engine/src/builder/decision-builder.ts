import type {
  AppliedAction,
  MatchedPolicy,
  PolicyDecision,
  PolicyDefinition,
  PolicyModification,
  PolicyResult,
} from '@vestara/policy-types';

let decisionCounter = 0;

export class DecisionBuilder {
  buildFromPolicy(
    policy: PolicyDefinition,
    matched: MatchedPolicy,
    applied: AppliedAction[],
    modifications: PolicyModification[],
  ): PolicyDecision {
    const hasDeny = policy.actions.some((a) => a.type === 'deny');
    const hasModify = policy.actions.some((a) =>
      ['modify_priority', 'modify_retry', 'delay', 'inject_metadata'].includes(a.type),
    );
    const hasRequireApproval = policy.actions.some((a) => a.type === 'require_approval');

    let result: PolicyResult = 'allow';
    if (hasDeny) result = 'deny';
    else if (hasRequireApproval || hasModify) result = 'modify';

    const reason = matched.reason;

    return {
      id: `pd-${++decisionCounter}-${Date.now()}`,
      result,
      matchedPolicies: [matched],
      skippedPolicies: [],
      conflictsResolved: [],
      actionsApplied: applied,
      modifications,
      reason,
      evaluationDurationMs: 0,
      evaluatedAt: new Date().toISOString(),
    };
  }

  buildAllow(skipped: Array<{ id: string; version: number; reason: string }>): PolicyDecision {
    return {
      id: `pd-${++decisionCounter}-${Date.now()}`,
      result: 'allow',
      matchedPolicies: [],
      skippedPolicies: skipped.map((s) => ({
        policyId: s.id,
        policyVersion: s.version,
        reason: s.reason,
      })),
      conflictsResolved: [],
      actionsApplied: [],
      modifications: [],
      reason: 'All policies passed',
      evaluationDurationMs: 0,
      evaluatedAt: new Date().toISOString(),
    };
  }
}

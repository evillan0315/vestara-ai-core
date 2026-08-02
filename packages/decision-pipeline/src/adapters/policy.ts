import type { DecisionContext, PolicyDecisionRecord } from '../context';
import type { StageRunner } from '../stages';

export interface PolicyAdapter {
  evaluate(input: { actor: string; operation: string; targetType: string; targetId: string }): PolicyDecisionRecord;
}

/**
 * Stage runner for the Policy stage. Composes an existing policy engine
 * (e.g. @vestara/policy-engine DefaultPolicyEngine) behind a thin adapter.
 */
export function policyStage(adapter: PolicyAdapter): StageRunner {
  return {
    stage: 'policy',
    run: (context: DecisionContext) => ({
      field: 'policyDecision',
      value: adapter.evaluate({
        actor: context.principal.id,
        operation: context.request.operation,
        targetType: context.request.targetType,
        targetId: context.request.targetId,
      }),
    }),
  };
}

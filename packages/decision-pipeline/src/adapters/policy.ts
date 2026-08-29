import type { DecisionContext, PolicyDecisionRecord } from '../context';
import type { StageRunner } from '../stages';

export interface PolicyAdapter {
  evaluate(input: {
    actor: string;
    operation: string;
    targetType: string;
    targetId: string;
  }): PolicyDecisionRecord | Promise<PolicyDecisionRecord>;
}

/**
 * Stage runner for the Policy stage. Composes an existing policy engine
 * (e.g. @vestara/policy-engine DefaultPolicyEngine) behind a thin adapter.
 */
export function policyStage(adapter: PolicyAdapter): StageRunner {
  return {
    stage: 'policy',
    run: async (context: DecisionContext) => ({
      field: 'policyDecision',
      value: await adapter.evaluate({
        actor: context.principal.id,
        operation: context.request.operation,
        targetType: context.request.targetType,
        targetId: context.request.targetId,
      }),
    }),
  };
}

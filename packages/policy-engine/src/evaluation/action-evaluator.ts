import type { AppliedAction, MatchedPolicy, PolicyDefinition } from '@vestara/policy-types';

export class ActionEvaluator {
  evaluate(definition: PolicyDefinition): { matched: MatchedPolicy; applied: AppliedAction[] } {
    const action = definition.actions[0];
    const matched: MatchedPolicy = {
      policyId: definition.id,
      policyVersion: definition.version,
      priority: definition.priority,
      actionType: action.type,
      reason: action.config?.reason ?? `Policy: ${definition.name}`,
    };

    const applied: AppliedAction[] = definition.actions.map((a) => ({
      policyId: definition.id,
      actionType: a.type,
      config: a.config as Record<string, unknown> | undefined,
    }));

    return { matched, applied };
  }
}

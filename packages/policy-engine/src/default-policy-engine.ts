import type { PolicyDecision, PolicyEngine, PolicyEvaluationRequest } from '@vestara/policy-types';
import { DecisionBuilder } from './builder/decision-builder';
import { ActionEvaluator } from './evaluation/action-evaluator';
import { ConditionEvaluator } from './evaluation/condition-evaluator';
import { CompositionEngine } from './resolution/composition-engine';
import { ConflictResolver } from './resolution/conflict-resolver';

export class DefaultPolicyEngine implements PolicyEngine {
  private readonly conditionEvaluator: ConditionEvaluator;
  private readonly actionEvaluator: ActionEvaluator;
  private readonly conflictResolver: ConflictResolver;
  private readonly compositionEngine: CompositionEngine;
  private readonly decisionBuilder: DecisionBuilder;

  constructor() {
    this.conditionEvaluator = new ConditionEvaluator();
    this.actionEvaluator = new ActionEvaluator();
    this.conflictResolver = new ConflictResolver();
    this.decisionBuilder = new DecisionBuilder();
    this.compositionEngine = new CompositionEngine(
      this.conditionEvaluator,
      this.actionEvaluator,
      this.conflictResolver,
      this.decisionBuilder,
    );
  }

  async evaluate(request: PolicyEvaluationRequest): Promise<PolicyDecision> {
    const strategy = (request.metadata?.compositionStrategy as string) ?? 'deny_overrides';

    const { decision } = this.compositionEngine.compose(
      request.policies,
      request.context,
      strategy as Parameters<typeof this.compositionEngine.compose>[2],
    );

    return decision;
  }
}

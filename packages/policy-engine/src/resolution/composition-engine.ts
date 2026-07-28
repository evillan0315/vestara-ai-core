import type {
  CompositionStrategy,
  PolicyContext,
  PolicyDecision,
  PolicyDefinition,
  PolicyModification,
} from '@vestara/policy-types';
import type { DecisionBuilder } from '../builder/decision-builder';
import type { ActionEvaluator } from '../evaluation/action-evaluator';
import type { ConditionEvaluator } from '../evaluation/condition-evaluator';
import type { ConflictResolver } from './conflict-resolver';

export interface CompositionResult {
  decision: PolicyDecision;
  skipped: Array<{ id: string; version: number; reason: string }>;
}

export class CompositionEngine {
  constructor(
    private readonly conditionEvaluator: ConditionEvaluator,
    private readonly actionEvaluator: ActionEvaluator,
    private readonly conflictResolver: ConflictResolver,
    private readonly decisionBuilder: DecisionBuilder,
  ) {}

  compose(
    policies: readonly PolicyDefinition[],
    context: PolicyContext,
    strategy: CompositionStrategy,
  ): CompositionResult {
    const matchedDecisions: PolicyDecision[] = [];
    const skipped: Array<{ id: string; version: number; reason: string }> = [];

    for (const policy of policies) {
      if (!policy.enabled) {
        skipped.push({ id: policy.id, version: policy.version, reason: 'Policy disabled' });
        continue;
      }

      const conditionsMet = this.conditionEvaluator.evaluate(policy.conditions, context);
      if (!conditionsMet) {
        skipped.push({ id: policy.id, version: policy.version, reason: 'Conditions not met' });
        continue;
      }

      const { matched, applied } = this.actionEvaluator.evaluate(policy);
      const modifications = this.collectModifications(policy, context);
      const individual: PolicyDecision = this.decisionBuilder.buildFromPolicy(policy, matched, applied, modifications);
      matchedDecisions.push(individual);
    }

    if (matchedDecisions.length === 0) {
      return {
        decision: this.decisionBuilder.buildAllow(skipped),
        skipped,
      };
    }

    const resolved = this.conflictResolver.resolve({
      decisions: matchedDecisions,
      strategy,
    });

    const allMatched = matchedDecisions.flatMap((d) => [...d.matchedPolicies]);
    const allApplied = matchedDecisions.flatMap((d) => [...d.actionsApplied]);
    const allMods = matchedDecisions.flatMap((d) => [...d.modifications]);

    const decision: PolicyDecision = {
      ...resolved,
      matchedPolicies: allMatched,
      actionsApplied: allApplied,
      modifications: allMods,
    };

    return { decision, skipped };
  }

  private collectModifications(policy: PolicyDefinition, _context: PolicyContext): PolicyModification[] {
    const mods: PolicyModification[] = [];
    for (const action of policy.actions) {
      if (action.type === 'modify_priority' && action.config?.priority !== undefined) {
        mods.push({
          field: 'spec.priority',
          oldValue: null,
          newValue: action.config.priority,
          source: policy.id,
        });
      }
      if (action.type === 'delay' && action.config?.delayMs !== undefined) {
        mods.push({
          field: 'spec.delayMs',
          oldValue: null,
          newValue: action.config.delayMs,
          source: policy.id,
        });
      }
      if (action.type === 'modify_retry') {
        if (action.config?.maxRetries !== undefined) {
          mods.push({
            field: 'spec.maxRetries',
            oldValue: null,
            newValue: action.config.maxRetries,
            source: policy.id,
          });
        }
        if (action.config?.retryDelayMs !== undefined) {
          mods.push({
            field: 'spec.retryDelayMs',
            oldValue: null,
            newValue: action.config.retryDelayMs,
            source: policy.id,
          });
        }
      }
    }
    return mods;
  }
}

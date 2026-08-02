import type { Constraint, IntentId, IntentInfo, IntentPriority, SuccessCriterion } from '@vestara/types';
import { Intent } from './intent';
import type { ExecPlan } from './planner';
import { Planner } from './planner';

function matchesCriterionId(criterion: SuccessCriterion): string {
  return criterion.id;
}

export interface SubmitIntentInput {
  goal: string;
  owner: string;
  priority?: IntentPriority;
  constraints?: Constraint[];
  successCriteria?: SuccessCriterion[];
}

export class IntentManager {
  private readonly _intents: Map<IntentId, Intent> = new Map();
  private readonly _planner: Planner;
  private _order: number = 0;

  constructor(planner?: Planner) {
    this._planner = planner ?? new Planner();
  }

  submit(input: SubmitIntentInput): Intent {
    const id = `intent-${++this._order}` as IntentId;
    const intent = new Intent({
      id,
      goal: input.goal,
      owner: input.owner,
      priority: input.priority ?? 'medium',
      constraints: input.constraints,
      successCriteria: input.successCriteria,
    });
    this._intents.set(id, intent);
    return intent;
  }

  plan(intentId: IntentId, options?: { maxJobs?: number }): ExecPlan | null {
    const intent = this.get(intentId);
    if (!intent) return null;
    intent.startPlanning();
    const plan = this._planner.planFor(intent, options);
    intent.planCreated(plan);
    return plan;
  }

  approve(intentId: IntentId): void {
    this.get(intentId)?.approvePlan();
  }

  complete(intentId: IntentId, criteriaMet?: boolean): void {
    const intent = this.get(intentId);
    if (!intent) return;
    if (criteriaMet) {
      for (const criterion of intent.successCriteria) {
        intent.markCriterionMet(matchesCriterionId(criterion));
      }
    }
    intent.complete();
  }

  markCriterionMet(intentId: IntentId, criterionId: string): void {
    this.get(intentId)?.markCriterionMet(criterionId);
  }

  cancel(intentId: IntentId, reason?: string): void {
    this.get(intentId)?.cancel(reason);
  }

  pause(intentId: IntentId, reason?: string): void {
    this.get(intentId)?.pause(reason);
  }

  resume(intentId: IntentId): void {
    this.get(intentId)?.resume();
  }

  fail(intentId: IntentId, error: string): void {
    this.get(intentId)?.fail(error);
  }

  get(intentId: IntentId): Intent | undefined {
    return this._intents.get(intentId);
  }

  list(): IntentInfo[] {
    return Array.from(this._intents.values()).map((i) => i.info);
  }

  listByStatus(status: string): IntentInfo[] {
    return this.list().filter((i) => i.status === status);
  }

  getInfo(intentId: IntentId): IntentInfo | null {
    return this.get(intentId)?.info ?? null;
  }

  hasActiveIntents(): boolean {
    return this.list().some((i) => ['submitted', 'planning', 'executing', 'paused'].includes(i.status));
  }
}

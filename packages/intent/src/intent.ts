import type { StateMachine } from '@vestara/state-machine';
import { createStateMachine } from '@vestara/state-machine';
import type {
  Constraint,
  ExecutionPlan,
  IntentId,
  IntentInfo,
  IntentPriority,
  IntentStatus,
  SuccessCriterion,
  Timestamp,
} from '@vestara/types';

const INTENT_TRANSITIONS: Record<IntentStatus, readonly IntentStatus[]> = {
  submitted: ['planning', 'cancelled', 'failed'],
  planning: ['executing', 'paused', 'cancelled', 'failed'],
  executing: ['completed', 'paused', 'cancelled', 'failed'],
  paused: ['executing', 'cancelled', 'failed'],
  completed: [],
  failed: [],
  cancelled: [],
};

export interface IntentConfig {
  id: IntentId;
  goal: string;
  owner: string;
  priority: IntentPriority;
  constraints?: Constraint[];
  successCriteria?: SuccessCriterion[];
}

export interface IntentObserver {
  onTransition?: (from: IntentStatus, to: IntentStatus) => void;
}

export class Intent {
  readonly id: IntentId;
  readonly goal: string;
  readonly owner: string;
  readonly priority: IntentPriority;
  readonly createdAt: Timestamp;

  private readonly _constraints: Constraint[];
  private readonly _successCriteria: SuccessCriterion[];
  private _stateMachine: StateMachine<IntentStatus>;
  private _plan: ExecutionPlan | null = null;
  private _updatedAt: Timestamp;
  private _completedAt: Timestamp | null = null;
  private _error: string | null = null;
  private _observer: IntentObserver | null = null;

  constructor(config: IntentConfig, observer?: IntentObserver) {
    this.id = config.id;
    this.goal = config.goal;
    this.owner = config.owner;
    this.priority = config.priority;
    this.createdAt = new Date().toISOString() as Timestamp;
    this._constraints = config.constraints ?? [];
    this._successCriteria = config.successCriteria ?? [];
    this._updatedAt = this.createdAt;
    this._observer = observer ?? null;

    this._stateMachine = createStateMachine<IntentStatus>({
      initial: 'submitted',
      states: INTENT_TRANSITIONS,
    });
  }

  get state(): IntentStatus {
    return this._stateMachine.state;
  }

  get constraints(): readonly Constraint[] {
    return [...this._constraints];
  }

  get successCriteria(): readonly SuccessCriterion[] {
    return [...this._successCriteria];
  }

  get plan(): ExecutionPlan | null {
    return this._plan;
  }

  get updatedAt(): Timestamp {
    return this._updatedAt;
  }

  get completedAt(): Timestamp | null {
    return this._completedAt;
  }

  get error(): string | null {
    return this._error;
  }

  get info(): IntentInfo {
    return {
      id: this.id,
      goal: this.goal,
      constraints: [...this._constraints],
      successCriteria: [...this._successCriteria],
      plan: this._plan,
      status: this.state,
      priority: this.priority,
      owner: this.owner,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
      completedAt: this._completedAt,
    };
  }

  private transition(target: IntentStatus, error?: string): void {
    const from = this.state;
    if (!this._stateMachine.canTransition(target)) {
      throw new Error(`Intent ${this.id} cannot transition from "${from}" to "${target}"`);
    }
    if (error) this._error = error;
    this._stateMachine.transition(target);
    this._updatedAt = new Date().toISOString() as Timestamp;
    if (target === 'completed' || target === 'failed' || target === 'cancelled') {
      this._completedAt = this._updatedAt;
    }
    this._observer?.onTransition?.(from, target);
  }

  planCreated(plan: ExecutionPlan): void {
    this._plan = plan;
    this.transition('executing');
  }

  startPlanning(): void {
    this.transition('planning');
  }

  approvePlan(): void {
    if (!this._plan) {
      throw new Error(`Intent ${this.id} has no plan to approve`);
    }
    this._plan = { ...this._plan, approved: true };
  }

  complete(): void {
    this.transition('completed');
  }

  pause(reason?: string): void {
    this.transition('paused', reason ?? undefined);
  }

  resume(): void {
    this.transition('executing');
  }

  fail(error: string): void {
    this.transition('failed', error);
  }

  cancel(reason?: string): void {
    this.transition('cancelled', reason ?? undefined);
  }

  touch(): void {
    this._updatedAt = new Date().toISOString() as Timestamp;
  }

  markCriterionMet(criterionId: string): void {
    const criterion = this._successCriteria.find((c) => c.id === criterionId);
    if (!criterion) return;
    criterion.met = true;
    this.touch();
  }

  isFulfilled(): boolean {
    return this._successCriteria.every((c) => c.met);
  }
}

import type { EventBus } from '@vestara/event-bus';
import type { Logger } from '@vestara/logger';

/**
 * SRE-style failure budget (ADR-029). Tracks the error rate of a component
 * over a sliding window and, when the budget is exhausted, triggers a
 * mitigation action (alert/notify/degrade/quarantine). This is the objective
 * measure of component health that complements the recovery manager's retry
 * policy.
 */

export type FailureBudgetStatus = 'healthy' | 'consuming' | 'exhausted';

export type FailureBudgetMitigation = 'notify' | 'degrade' | 'quarantine' | 'halt';

export interface FailureBudgetConfig {
  /** Maximum tolerated error rate (0..1) over the window. */
  readonly errorRateLimit: number;
  /** Sliding window length in milliseconds. */
  readonly windowMs: number;
  /** Minimum outcomes required before the budget is considered. */
  readonly minOutcomes: number;
  /** Action taken when the budget is exhausted. */
  readonly mitigation: FailureBudgetMitigation;
}

export interface FailureBudgetState {
  readonly status: FailureBudgetStatus;
  readonly errorRate: number;
  readonly total: number;
  readonly failures: number;
  readonly windowMs: number;
  readonly exhaustedAt?: string;
}

interface Outcome {
  readonly timestamp: number;
  readonly ok: boolean;
}

const DEFAULT_CONFIG: FailureBudgetConfig = {
  errorRateLimit: 0.5,
  windowMs: 60_000,
  minOutcomes: 5,
  mitigation: 'quarantine',
};

/**
 * Windowed failure budget for a single component. Call `recordOutcome` after
 * each operation; the budget computes the error rate over the sliding window
 * and flips to `exhausted` once the rate breaches the limit (and the minimum
 * outcome count is met). Exhaustion fires once, resetting requires a
 * `reset()`.
 */
export class FailureBudget {
  private readonly config: FailureBudgetConfig;
  private readonly eventBus?: EventBus;
  private readonly logger?: Logger;
  private outcomes: Outcome[] = [];
  private exhaustedAt?: string;
  private notified = false;

  constructor(
    config?: Partial<FailureBudgetConfig>,
    opts?: { eventBus?: EventBus; logger?: Logger; componentId?: string },
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventBus = opts?.eventBus;
    this.logger = opts?.logger;
    this.componentId = opts?.componentId ?? 'component';
  }

  private readonly componentId: string;

  get status(): FailureBudgetStatus {
    const state = this.state();
    return state.status;
  }

  get isExhausted(): boolean {
    return this.status === 'exhausted';
  }

  recordOutcome(ok: boolean): FailureBudgetState {
    this.outcomes.push({ timestamp: Date.now(), ok });
    this.prune();
    const state = this.state();
    if (state.status === 'exhausted' && !this.notified) {
      this.exhaustedAt = new Date().toISOString();
      this.notified = true;
      void this.emit(state);
    }
    return state;
  }

  state(): FailureBudgetState {
    this.prune();
    const total = this.outcomes.length;
    const failures = this.outcomes.filter((o) => !o.ok).length;
    const errorRate = total > 0 ? failures / total : 0;
    let status: FailureBudgetStatus = 'healthy';
    if (total >= this.config.minOutcomes) {
      if (errorRate > this.config.errorRateLimit) status = 'exhausted';
      else if (errorRate > 0) status = 'consuming';
    }
    return {
      status,
      errorRate,
      total,
      failures,
      windowMs: this.config.windowMs,
      exhaustedAt: status === 'exhausted' ? (this.exhaustedAt ?? undefined) : undefined,
    };
  }

  reset(): void {
    this.outcomes = [];
    this.exhaustedAt = undefined;
    this.notified = false;
  }

  get mitigation(): FailureBudgetMitigation {
    return this.config.mitigation;
  }

  private prune(): void {
    const cutoff = Date.now() - this.config.windowMs;
    this.outcomes = this.outcomes.filter((o) => o.timestamp >= cutoff);
  }

  private async emit(state: FailureBudgetState): Promise<void> {
    this.logger?.warn('Failure budget exhausted', { componentId: this.componentId, ...state });
    await this.eventBus?.emit({
      type: 'recovery:failure-budget.exhausted',
      source: 'failure-budget',
      payload: {
        componentId: this.componentId,
        errorRate: state.errorRate,
        mitigation: this.config.mitigation,
      },
    });
  }
}

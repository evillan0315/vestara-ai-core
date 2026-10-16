/**
 * WFO-E2E canonical workflow lifecycle.
 *
 * A replayable, explicit stage model for the governed engineering workflow.
 * Invalid transitions fail with explicit reasons. The ledger records each
 * transition so a scenario can be replayed and verified against the persisted
 * final stage.
 */

import type { DeterministicWorkflowClock } from './clock';

export type CanonicalStage =
  | 'created'
  | 'context'
  | 'planning'
  | 'review-pending'
  | 'changes-requested'
  | 'rejected'
  | 'approved'
  | 'ready'
  | 'in-progress'
  | 'awaiting-approval'
  | 'budget-paused'
  | 'reviewing'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'indeterminate';

export const CANONICAL_STAGE_TRANSITIONS: Record<CanonicalStage, readonly CanonicalStage[]> = {
  created: ['context', 'cancelled', 'failed'],
  context: ['planning', 'indeterminate', 'cancelled', 'failed'],
  planning: ['review-pending', 'indeterminate', 'cancelled', 'failed'],
  'review-pending': ['approved', 'changes-requested', 'rejected', 'indeterminate', 'cancelled', 'failed'],
  'changes-requested': ['planning', 'rejected', 'cancelled', 'failed'],
  rejected: ['cancelled', 'failed'],
  approved: ['ready', 'cancelled', 'failed'],
  ready: ['in-progress', 'cancelled', 'failed'],
  'in-progress': ['reviewing', 'awaiting-approval', 'budget-paused', 'failed', 'cancelled'],
  'awaiting-approval': ['in-progress', 'failed', 'cancelled'],
  'budget-paused': ['in-progress', 'failed', 'cancelled'],
  reviewing: ['verifying', 'changes-requested', 'rejected', 'indeterminate', 'failed', 'cancelled'],
  verifying: ['completed', 'changes-requested', 'indeterminate', 'failed', 'cancelled'],
  completed: [],
  failed: ['cancelled'],
  cancelled: [],
  indeterminate: ['context', 'planning', 'reviewing', 'verifying', 'changes-requested', 'failed', 'cancelled'],
};

export interface StageTransitionOptions {
  /** Human policy override — the only path that permits completion from indeterminate evidence. */
  readonly override?: boolean;
}

export function validateStageTransition(
  from: CanonicalStage,
  to: CanonicalStage,
  options: StageTransitionOptions = {},
): { allowed: boolean; reason?: string } {
  if (from === to) return { allowed: false, reason: `cannot re-enter stage ${from}` };
  if (CANONICAL_STAGE_TRANSITIONS[from].includes(to)) return { allowed: true };
  if (from === 'indeterminate' && to === 'completed' && options.override) {
    return { allowed: true, reason: 'human policy override accepted the indeterminate result' };
  }
  return { allowed: false, reason: `invalid transition: ${from} → ${to}` };
}

export interface StageTransitionRecord {
  readonly from: CanonicalStage;
  readonly to: CanonicalStage;
  readonly reason: string;
  readonly at: string;
}

export class WorkflowStageLedger {
  private readonly records: StageTransitionRecord[] = [];
  private stage: CanonicalStage = 'created';

  constructor(private readonly clock: DeterministicWorkflowClock) {}

  transition(to: CanonicalStage, reason: string, options: StageTransitionOptions = {}): void {
    const outcome = validateStageTransition(this.stage, to, options);
    if (!outcome.allowed) throw new Error(outcome.reason ?? `invalid transition to ${to}`);
    this.records.push({ from: this.stage, to, reason, at: this.clock.now() });
    this.stage = to;
  }

  current(): CanonicalStage {
    return this.stage;
  }

  history(): readonly StageTransitionRecord[] {
    return this.records;
  }

  /** Replay from the recorded history — returns the reconstructed final stage. */
  replay(): CanonicalStage {
    let stage: CanonicalStage = 'created';
    for (const record of this.records) {
      const outcome = validateStageTransition(stage, record.to);
      if (!outcome.allowed) throw new Error(outcome.reason ?? 'replay produced an invalid transition');
      stage = record.to;
    }
    return stage;
  }
}

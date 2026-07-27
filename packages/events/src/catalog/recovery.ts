import type { RuntimeId, WorkerId } from '@vestara/types';

export const RecoveryEventTypes = {
  Triggered: 'recovery:triggered',
  Progress: 'recovery:progress',
  Completed: 'recovery:completed',
  Exhausted: 'recovery:exhausted',
  FailureBudgetUpdated: 'failure-budget:updated',
  FailureBudgetExhausted: 'failure-budget:exhausted',
} as const;

export interface RecoveryAction {
  type: 'restart' | 'replace' | 'escalate' | 'quarantine';
  targetId: string;
}

export interface RecoveryTriggeredPayload {
  runtimeId: RuntimeId;
  workerId: WorkerId | null;
  failureCount: number;
  action: RecoveryAction;
  reason: string;
}

export interface RecoveryProgressPayload {
  runtimeId: RuntimeId;
  step: string;
  status: 'running' | 'completed' | 'failed';
}

export interface RecoveryCompletedPayload {
  runtimeId: RuntimeId;
  duration: number;
  action: RecoveryAction;
}

export interface RecoveryExhaustedPayload {
  runtimeId: RuntimeId;
  attempts: number;
  escalatedTo: string;
}

export interface FailureBudgetUpdatedPayload {
  workerId: WorkerId;
  budget: number;
  remaining: number;
  failures: number;
}

export interface FailureBudgetExhaustedPayload {
  workerId: WorkerId;
  budget: number;
  failures: number;
  action: RecoveryAction;
}

export type RecoveryEventPayloads = {
  [RecoveryEventTypes.Triggered]: RecoveryTriggeredPayload;
  [RecoveryEventTypes.Progress]: RecoveryProgressPayload;
  [RecoveryEventTypes.Completed]: RecoveryCompletedPayload;
  [RecoveryEventTypes.Exhausted]: RecoveryExhaustedPayload;
  [RecoveryEventTypes.FailureBudgetUpdated]: FailureBudgetUpdatedPayload;
  [RecoveryEventTypes.FailureBudgetExhausted]: FailureBudgetExhaustedPayload;
};

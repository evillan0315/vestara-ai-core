import type { EventSeverity, LockState, RuntimeHealth, RuntimeId, RuntimeState, RuntimeType } from '@vestara/types';

export const RuntimeEventTypes = {
  Created: 'runtime:created',
  Initializing: 'runtime:initializing',
  Started: 'runtime:started',
  Suspended: 'runtime:suspended',
  Resumed: 'runtime:resumed',
  Degraded: 'runtime:degraded',
  Recovering: 'runtime:recovering',
  Quarantined: 'runtime:quarantined',
  Stopping: 'runtime:stopping',
  Stopped: 'runtime:stopped',
  Failed: 'runtime:failed',
  Destroyed: 'runtime:destroyed',
  HealthChanged: 'runtime:health-changed',
  LockAcquired: 'resource:locked',
  LockReleased: 'resource:unlocked',
} as const;

export interface RuntimeCreatedPayload {
  runtimeId: RuntimeId;
  runtimeType: RuntimeType;
}

export interface RuntimeStartedPayload {
  runtimeId: RuntimeId;
  runtimeType: RuntimeType;
  health: RuntimeHealth;
}

export interface RuntimeStateChangedPayload {
  runtimeId: RuntimeId;
  previousState: RuntimeState;
  currentState: RuntimeState;
}

export interface RuntimeHealthChangedPayload {
  runtimeId: RuntimeId;
  runtimeType: RuntimeType;
  previous: RuntimeHealth['status'];
  current: RuntimeHealth['status'];
}

export interface RuntimeDegradedPayload {
  runtimeId: RuntimeId;
  runtimeType: RuntimeType;
  checks: string[];
  severity: EventSeverity;
}

export interface RuntimeFailedPayload {
  runtimeId: RuntimeId;
  runtimeType: RuntimeType;
  error: string;
  previousState: RuntimeState;
}

export interface RuntimeRecoveringPayload {
  runtimeId: RuntimeId;
  runtimeType: RuntimeType;
  attempt: number;
  maxAttempts: number;
}

export interface RuntimeQuarantinedPayload {
  runtimeId: RuntimeId;
  runtimeType: RuntimeType;
  failureCount: number;
  reason: string;
}

export interface RuntimeDestroyedPayload {
  runtimeId: RuntimeId;
  runtimeType: RuntimeType;
  uptime: number;
}

export interface ResourceLockedPayload {
  resourceId: string;
  lockState: LockState;
  lockHolder: RuntimeId;
}

export interface ResourceUnlockedPayload {
  resourceId: string;
  lockState: LockState;
  holderReleased: RuntimeId;
}

export type RuntimeEventPayloads = {
  [RuntimeEventTypes.Created]: RuntimeCreatedPayload;
  [RuntimeEventTypes.Initializing]: RuntimeStateChangedPayload;
  [RuntimeEventTypes.Started]: RuntimeStartedPayload;
  [RuntimeEventTypes.Suspended]: RuntimeStateChangedPayload;
  [RuntimeEventTypes.Resumed]: RuntimeStateChangedPayload;
  [RuntimeEventTypes.Degraded]: RuntimeDegradedPayload;
  [RuntimeEventTypes.Recovering]: RuntimeRecoveringPayload;
  [RuntimeEventTypes.Quarantined]: RuntimeQuarantinedPayload;
  [RuntimeEventTypes.Stopping]: RuntimeStateChangedPayload;
  [RuntimeEventTypes.Stopped]: RuntimeStateChangedPayload;
  [RuntimeEventTypes.Failed]: RuntimeFailedPayload;
  [RuntimeEventTypes.Destroyed]: RuntimeDestroyedPayload;
  [RuntimeEventTypes.HealthChanged]: RuntimeHealthChangedPayload;
  [RuntimeEventTypes.LockAcquired]: ResourceLockedPayload;
  [RuntimeEventTypes.LockReleased]: ResourceUnlockedPayload;
};

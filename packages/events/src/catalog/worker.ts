import type { LoadLevel, TrustScore, WorkerId, WorkerType } from '@vestara/types';

export const WorkerEventTypes = {
  Registered: 'worker:registered',
  Unregistered: 'worker:unregistered',
  Available: 'worker:available',
  Busy: 'worker:busy',
  Unhealthy: 'worker:unhealthy',
  Recovered: 'worker:recovered',
  TrustChanged: 'worker:trust-changed',
} as const;

export interface WorkerRegisteredPayload {
  workerId: WorkerId;
  workerType: WorkerType;
  capabilities: string[];
  trustScore: TrustScore;
}

export interface WorkerUnregisteredPayload {
  workerId: WorkerId;
  reason: string;
}

export interface WorkerAvailablePayload {
  workerId: WorkerId;
  load: LoadLevel;
}

export interface WorkerBusyPayload {
  workerId: WorkerId;
  load: LoadLevel;
}

export interface WorkerUnhealthyPayload {
  workerId: WorkerId;
  error: string;
  lastSeen: string;
}

export interface WorkerRecoveredPayload {
  workerId: WorkerId;
}

export interface WorkerTrustChangedPayload {
  workerId: WorkerId;
  previous: TrustScore;
  current: TrustScore;
  reason: string;
}

export type WorkerEventPayloads = {
  [WorkerEventTypes.Registered]: WorkerRegisteredPayload;
  [WorkerEventTypes.Unregistered]: WorkerUnregisteredPayload;
  [WorkerEventTypes.Available]: WorkerAvailablePayload;
  [WorkerEventTypes.Busy]: WorkerBusyPayload;
  [WorkerEventTypes.Unhealthy]: WorkerUnhealthyPayload;
  [WorkerEventTypes.Recovered]: WorkerRecoveredPayload;
  [WorkerEventTypes.TrustChanged]: WorkerTrustChangedPayload;
};

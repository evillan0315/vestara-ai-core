import type { Timestamp } from '@vestara/types';

export const SystemEventTypes = {
  BootStarting: 'system:boot-starting',
  BootProgress: 'system:boot-progress',
  BootComplete: 'system:boot-complete',
  Shutdown: 'system:shutdown',
  Error: 'system:error',
  ConfigChanged: 'system:config-changed',
} as const;

export interface BootStartingPayload {
  phase: string;
  version: string;
  startedAt: Timestamp;
}

export interface BootProgressPayload {
  phase: string;
  component: string;
  status: 'started' | 'completed' | 'failed';
  duration: number;
}

export interface BootCompletePayload {
  duration: number;
  runtimes: number;
  workers: number;
  components: number;
}

export interface ShutdownPayload {
  reason: string;
  force: boolean;
  activeJobs: number;
  activeRuntimes: number;
}

export interface SystemErrorPayload {
  error: string;
  context: Record<string, unknown>;
  severity: 'warning' | 'error' | 'critical';
}

export interface ConfigChangedPayload {
  key: string;
  previous: unknown;
  current: unknown;
  changedBy: string;
}

export type SystemEventPayloads = {
  [SystemEventTypes.BootStarting]: BootStartingPayload;
  [SystemEventTypes.BootProgress]: BootProgressPayload;
  [SystemEventTypes.BootComplete]: BootCompletePayload;
  [SystemEventTypes.Shutdown]: ShutdownPayload;
  [SystemEventTypes.Error]: SystemErrorPayload;
  [SystemEventTypes.ConfigChanged]: ConfigChangedPayload;
};

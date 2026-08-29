// ─── Kernel ──────────────────────────────────────────────────

import type { ServiceStatus } from './lifecycle.js';

export type KernelStatus = 'powered-off' | 'booting' | 'running' | 'degraded' | 'draining' | 'stopped';

export interface BootReport {
  bootDuration: number;
  servicesStarted: number;
  servicesFailed: number;
  configVersion: string;
  errors: BootError[];
}

export interface BootError {
  component: string;
  error: string;
  severity: 'warning' | 'error';
  action: 'continue' | 'retry' | 'fail';
}

export interface SystemDiagnosis {
  status: KernelStatus;
  uptime: number;
  version: string;
  kernel: {
    status: KernelStatus;
    bootDuration: number;
    configVersion: string;
  };
  services: ServiceDiagnosis[];
  health: {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    healthyCount: number;
    degradedCount: number;
    unhealthyCount: number;
  };
  scheduler: {
    tasks: number;
    paused: boolean;
  };
  resources: ResourceDiagnosis;
}

export interface ServiceDiagnosis {
  id: string;
  version: string;
  status: ServiceStatus;
  health: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  latency: number;
  capabilities: string[];
}

export interface ResourceDiagnosis {
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    percentUsed: number;
  };
  cpu: {
    user: number;
    system: number;
  };
}

import type { Brand, Timestamp } from './common';
import type { RuntimeId } from './ids';

export type RuntimeType =
  | 'runtime'
  | 'system'
  | 'kernel'
  | 'host'
  | 'boot'
  | 'workspace'
  | 'agent'
  | 'ai-agent'
  | 'workflow'
  | 'session'
  | 'repository'
  | 'project'
  | 'plugin'
  | 'widget'
  | 'memory'
  | 'tool'
  | 'model'
  | 'service'
  | 'build'
  | 'terminal'
  | 'git'
  | 'intent'
  | 'planner'
  | 'scheduler'
  | 'job-manager'
  | 'event-bus'
  | 'verification'
  | 'trust'
  | 'recovery'
  | 'lock'
  | 'permission'
  | 'state'
  | 'config'
  | 'health'
  | 'worker-pool'
  | 'dashboard'
  | 'tui';

export type RuntimeCategory = 'core' | 'extension' | 'custom';

export type RuntimeState =
  | 'created'
  | 'initializing'
  | 'running'
  | 'suspended'
  | 'degraded'
  | 'recovering'
  | 'quarantined'
  | 'stopping'
  | 'stopped'
  | 'failed'
  | 'destroyed';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export type RuntimeHealthLevel = 'healthy' | 'degraded' | 'exhausted';

export interface HealthDependency {
  id: RuntimeId;
  status: HealthStatus;
  latency: number;
  lastChecked: Timestamp;
}

export interface RuntimeHealth {
  status: HealthStatus;
  serviceId: RuntimeId;
  runtimeType: RuntimeType;
  version: string;
  uptime: number;
  lastHealthCheck: Timestamp;
  dependencies: HealthDependency[];
  message?: string;
}

export type RuntimeLifecycleConfig = {
  maxDegradedMs: number;
  maxRecoveryAttempts: number;
  healthCheckIntervalMs: number;
  quarantineTimeoutMs: number;
};

export interface RuntimeMetadata {
  displayName?: string;
  description?: string;
  icon?: string;
  tags?: string[];
  custom?: Record<string, unknown>;
}

export interface RuntimeDefinition {
  type: RuntimeType;
  parent: RuntimeType | null;
  category: RuntimeCategory;
  singleton: boolean;
  persistable: boolean;
  capabilities: string[];
  lifecycle: RuntimeLifecycleConfig;
  dependencies: RuntimeType[];
  metadata: RuntimeMetadata;
  version: string;
}

export interface RuntimeInfo {
  id: RuntimeId;
  type: RuntimeType;
  state: RuntimeState;
  health: RuntimeHealth;
  metadata: RuntimeMetadata;
  startedAt: Timestamp | null;
}

export type LockState = 'unlocked' | 'locked' | 'readonly' | 'verifying';

export interface ResourceLock {
  resourceId: Brand<string, 'ResourceId'>;
  lockState: LockState;
  lockHolder: RuntimeId | null;
  acquiredAt: Timestamp | null;
  ttl: number;
}

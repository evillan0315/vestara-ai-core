import type { Range, Timestamp } from './common';
import type { WorkerId } from './ids';
import type { RuntimeHealthLevel } from './runtime';

export type WorkerType = 'human' | 'ai' | 'docker' | 'ci' | 'remote' | 'process' | 'mcp';

export type WorkerStatus = 'available' | 'busy' | 'unhealthy' | 'offline' | 'quarantined';

export type Availability = 'online' | 'offline' | 'away' | 'dnd';

export interface CostProfile {
  perJob: number;
  perHour: number;
  currency: string;
}

export interface LatencyProfile {
  p50: number;
  p95: number;
  p99: number;
}

export type TrustScore = Range<0, 100>;

export type LoadLevel = Range<0, 100>;

export interface WorkerInfo {
  id: WorkerId;
  type: WorkerType;
  capabilities: string[];
  trustScore: TrustScore;
  load: LoadLevel;
  priority: number;
  availability: Availability;
  cost: CostProfile;
  latency: LatencyProfile;
  health: 'healthy' | 'degraded' | 'unhealthy';
  metadata: Record<string, unknown>;
  registeredAt: Timestamp;
  lastSeenAt: Timestamp;
}

export interface WorkerGroup {
  id: string;
  name: string;
  workers: WorkerId[];
  strategy: 'round-robin' | 'failover' | 'load-balanced' | 'priority';
}

export interface FailureBudget {
  workerId: WorkerId;
  windowMs: number;
  budget: number;
  currentFailures: number;
  currentRetries: number;
  recoveryTime: number;
  health: RuntimeHealthLevel;
}

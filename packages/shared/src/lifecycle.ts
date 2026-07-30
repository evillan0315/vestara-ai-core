// ─── Service Lifecycle ──────────────────────────────────────

export type ServiceStatus =
  | 'uninitialized'
  | 'initializing'
  | 'initialized'
  | 'starting'
  | 'running'
  | 'degraded'
  | 'stopping'
  | 'stopped'
  | 'disposed';

/**
 * Every runtime component in Vestara implements this interface.
 * From the Kernel to the simplest utility service.
 *
 * Architecture Traceability:
 *   Foundation: UNIVERSAL-INTERFACE.md → VestaraService
 *   Runtime:    LIFECYCLE-SPECIFICATION.md → Service Lifecycle
 */
export interface VestaraService {
  readonly id: string;
  readonly version: string;
  readonly status: ServiceStatus;

  initialize(config?: Record<string, unknown>): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<HealthStatus>;
  dispose(): Promise<void>;
}

// ─── Health ──────────────────────────────────────────────────

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  serviceId: string;
  version: string;
  uptime: number;
  lastHealthCheck: string;
  dependencies: HealthDependency[];
  message?: string;
}

export interface HealthDependency {
  id: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latency: number;
  lastChecked: string;
}

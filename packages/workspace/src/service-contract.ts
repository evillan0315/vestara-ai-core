/**
 * ServiceContract — Canonical lifecycle for all OS-level platform services.
 *
 * Every core service (Kernel, Workspace Manager, Agent Daemon, Plugin Runtime,
 * Cloud Controller) implements this interface. This formalizes the service
 * contracts described in the v2.0 OS Integration milestone.
 *
 * Architecture Traceability:
 *   PCS: PCS-016 — Vestara AI OS Integration
 */

export type ServiceStatus = 'stopped' | 'running' | 'degraded' | 'error';

export interface HealthCheckResult {
  status: ServiceStatus;
  message: string;
  uptime: number;
  lastCheck: string;
}

export interface ServiceContract {
  readonly id: string;
  readonly name: string;
  readonly version: string;

  start(): Promise<void>;
  stop(): Promise<void>;
  health(): Promise<HealthCheckResult>;
  status(): Promise<ServiceStatus>;
  register(): Promise<void>;
}

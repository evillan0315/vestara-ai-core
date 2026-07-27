/**
 * @vestara/health — Health Manager
 *
 * Aggregated health monitoring for all registered services.
 * Performs periodic health checks, tracks dependencies, and
 * reports overall platform health.
 *
 * Architecture Traceability:
 *   Runtime: VESTARA-KERNEL.md → Health Monitor
 *   Foundation: UNIVERSAL-INTERFACE.md → HealthStatus
 */

import type { Logger } from '@vestara/logger';
import type { ServiceRegistry } from '@vestara/service-registry';
import type { HealthDependency, HealthStatus } from '@vestara/shared';

export interface HealthManager {
  checkAll(): Promise<OverallHealth>;
  getServiceHealth(serviceId: string): Promise<HealthStatus | null>;
  getOverallHealth(): OverallHealth;
  startPeriodicChecks(intervalMs: number): void;
  stopPeriodicChecks(): void;
  addCustomCheck(name: string, check: () => Promise<HealthCheckResult>): void;
}

export interface OverallHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  healthyCount: number;
  degradedCount: number;
  unhealthyCount: number;
  totalServices: number;
  checks: HealthCheckSummary[];
  lastCheck: string;
}

export interface HealthCheckSummary {
  serviceId: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
  message?: string;
  dependencies: HealthDependency[];
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  latency: number;
}

export class DefaultHealthManager implements HealthManager {
  private registry: ServiceRegistry;
  private logger?: Logger;
  private timer?: ReturnType<typeof setInterval>;
  private customChecks: Map<string, () => Promise<HealthCheckResult>> = new Map();
  private lastOverall: OverallHealth = {
    status: 'healthy',
    healthyCount: 0,
    degradedCount: 0,
    unhealthyCount: 0,
    totalServices: 0,
    checks: [],
    lastCheck: new Date().toISOString(),
  };

  constructor(options: { registry: ServiceRegistry; logger?: Logger }) {
    this.registry = options.registry;
    this.logger = options.logger;
  }

  async checkAll(): Promise<OverallHealth> {
    const services = this.registry.listServices();
    const checks: HealthCheckSummary[] = [];

    for (const info of services) {
      const service = this.registry.get(info.id);
      if (!service) continue;

      const start = performance.now();
      try {
        const health = await service.health();
        checks.push({
          serviceId: info.id,
          status: health.status,
          latency: performance.now() - start,
          message: health.message,
          dependencies: health.dependencies,
        });
      } catch (error) {
        checks.push({
          serviceId: info.id,
          status: 'unhealthy',
          latency: performance.now() - start,
          message: error instanceof Error ? error.message : 'Health check failed',
          dependencies: [],
        });
      }
    }

    // Run custom checks
    for (const [name, check] of this.customChecks) {
      const start = performance.now();
      try {
        const result = await check();
        checks.push({
          serviceId: name,
          status: result.status,
          latency: result.latency,
          message: result.message,
          dependencies: [],
        });
      } catch (error) {
        checks.push({
          serviceId: name,
          status: 'unhealthy',
          latency: performance.now() - start,
          message: error instanceof Error ? error.message : 'Custom check failed',
          dependencies: [],
        });
      }
    }

    const healthyCount = checks.filter((c) => c.status === 'healthy').length;
    const degradedCount = checks.filter((c) => c.status === 'degraded').length;
    const unhealthyCount = checks.filter((c) => c.status === 'unhealthy').length;

    let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (unhealthyCount > 0) overall = 'unhealthy';
    else if (degradedCount > 0) overall = 'degraded';

    this.lastOverall = {
      status: overall,
      healthyCount,
      degradedCount,
      unhealthyCount,
      totalServices: checks.length,
      checks,
      lastCheck: new Date().toISOString(),
    };

    return this.lastOverall;
  }

  async getServiceHealth(serviceId: string): Promise<HealthStatus | null> {
    const service = this.registry.get(serviceId);
    if (!service) return null;

    try {
      return await service.health();
    } catch {
      return null;
    }
  }

  getOverallHealth(): OverallHealth {
    return { ...this.lastOverall };
  }

  startPeriodicChecks(intervalMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.checkAll().catch((error) => {
        this.logger?.error('Periodic health check failed', { error });
      });
    }, intervalMs);
  }

  stopPeriodicChecks(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  addCustomCheck(name: string, check: () => Promise<HealthCheckResult>): void {
    this.customChecks.set(name, check);
  }
}

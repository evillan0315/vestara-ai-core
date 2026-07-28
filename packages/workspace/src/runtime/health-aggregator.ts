import type { HealthStatus, RuntimeHealth, RuntimeType } from '@vestara/runtime';

export interface AggregatedHealth {
  status: HealthStatus;
  healthy: number;
  degraded: number;
  failed: number;
  total: number;
  runtimes: Record<string, RuntimeHealth>;
}

export class HealthAggregator {
  aggregate(runtimeHealth: Map<RuntimeType, { health: RuntimeHealth; critical: boolean }>): AggregatedHealth {
    const result: AggregatedHealth = {
      status: 'healthy',
      healthy: 0,
      degraded: 0,
      failed: 0,
      total: runtimeHealth.size,
      runtimes: {},
    };

    for (const [type, { health, critical }] of runtimeHealth) {
      result.runtimes[type] = health;

      if (health.status === 'healthy') {
        result.healthy++;
      } else if (health.status === 'degraded') {
        result.degraded++;
        if (critical && result.status === 'healthy') {
          result.status = 'degraded';
        }
        if (!critical && result.status === 'healthy') {
          result.status = 'degraded';
        }
      } else if (health.status === 'unhealthy') {
        result.failed++;
        if (critical) {
          result.status = 'unhealthy';
        } else if (result.status === 'healthy') {
          result.status = 'degraded';
        }
      }
    }

    return result;
  }
}

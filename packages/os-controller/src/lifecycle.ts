/**
 * LifecycleController — Start, stop, and monitor all AI OS services.
 *
 * Manages the full service lifecycle: starting services in dependency order,
 * checking health, graceful shutdown, and restart policies.
 *
 * Architecture Traceability:
 *   AI-OS-ARCHITECTURE.md — Boot Sequence, Failure Recovery
 */

import { type AIOSManifest, type AIOSServiceDef, createDefaultManifest, getServicesByLayer } from './manifest';

export interface ServiceHealth {
  dependencyId: string;
  status: string;
}

export interface ServiceStatus {
  id: string;
  name: string;
  layer: number;
  status: 'starting' | 'running' | 'degraded' | 'recovering' | 'stopping' | 'stopped' | 'failed' | 'unknown';
  message: string;
  dependencies?: ServiceHealth[];
  overallHealth?: number;
}

export class LifecycleController {
  private manifest: AIOSManifest;
  private statuses: Map<string, ServiceStatus> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(manifest?: AIOSManifest) {
    this.manifest = manifest || createDefaultManifest();
    for (const svc of this.manifest.services) {
      this.statuses.set(svc.id, {
        id: svc.id,
        name: svc.name,
        layer: svc.layer,
        status: 'stopped',
        message: 'Not started',
      });
    }
  }

  /**
   * Start all services in dependency order (layer by layer).
   * Returns a record of which services started successfully.
   */
  async startAll(): Promise<ServiceStatus[]> {
    const results: ServiceStatus[] = [];
    const maxLayer = Math.max(...this.manifest.services.map((s) => s.layer));

    for (let layer = 1; layer <= maxLayer; layer++) {
      const layerServices = getServicesByLayer(this.manifest, layer).filter((s) => s.enabled);
      if (layerServices.length === 0) continue;

      const started = await Promise.allSettled(layerServices.map((svc) => this.startService(svc)));

      for (let i = 0; i < started.length; i++) {
        const r = started[i];
        const svc = layerServices[i];
        if (r.status === 'fulfilled') {
          results.push(r.value);
        } else {
          const status: ServiceStatus = {
            id: svc.id,
            name: svc.name,
            layer: svc.layer,
            status: 'failed',
            message: r.reason?.message || 'Unknown error',
          };
          this.statuses.set(svc.id, status);
          results.push(status);
        }
      }
    }

    return results;
  }

  /**
   * Stop all services in reverse layer order.
   */
  async stopAll(): Promise<ServiceStatus[]> {
    const results: ServiceStatus[] = [];
    const maxLayer = Math.max(...this.manifest.services.map((s) => s.layer));

    for (let layer = maxLayer; layer >= 1; layer--) {
      const layerServices = getServicesByLayer(this.manifest, layer).filter((s) => s.enabled);
      for (const svc of layerServices) {
        this.abortControllers.get(svc.id)?.abort();
        const status: ServiceStatus = {
          id: svc.id,
          name: svc.name,
          layer: svc.layer,
          status: 'stopped',
          message: 'Stopped gracefully',
        };
        this.statuses.set(svc.id, status);
        results.push(status);
      }
    }

    return results;
  }

  /**
   * Start a single service with simulated execution and health check.
   */
  async startService(svc: AIOSServiceDef): Promise<ServiceStatus> {
    const controller = new AbortController();
    this.abortControllers.set(svc.id, controller);

    const status: ServiceStatus = {
      id: svc.id,
      name: svc.name,
      layer: svc.layer,
      status: 'starting',
      message: 'Starting...',
    };
    this.statuses.set(svc.id, status);

    // Simulate startup time
    try {
      await delay(100, controller.signal);
      if (controller.signal.aborted) throw new Error('Cancelled');

      status.status = 'running';
      status.message = 'Running';
      this.statuses.set(svc.id, status);
      return { ...status };
    } catch (err) {
      const failed: ServiceStatus = {
        id: svc.id,
        name: svc.name,
        layer: svc.layer,
        status: 'failed',
        message: (err as Error).message,
      };
      this.statuses.set(svc.id, failed);
      return failed;
    }
  }

  /**
   * Get the current status of all services, enriched with propagated dependency health.
   *
   * Health propagates through the dependency graph: a service's health is its
   * own health score multiplied by the health of all transitive dependencies.
   * If Kernel is degraded, every service above it reflects that degradation.
   */
  getAllStatuses(): ServiceStatus[] {
    const all = Array.from(this.statuses.values());

    // First pass: compute propagated health using topological order (layer 1 first)
    const propagatedHealth = new Map<string, number>();

    for (let layer = 1; layer <= 6; layer++) {
      const layerServices = this.manifest.services.filter((s) => s.layer === layer);
      for (const svc of layerServices) {
        const status = all.find((s) => s.id === svc.id);
        const ownHealth =
          !status || status.status === 'running'
            ? 100
            : status.status === 'degraded'
              ? 60
              : status.status === 'starting'
                ? 30
                : 0;

        // Multiply own health by dependency health (propagation)
        if (svc.deps.length === 0) {
          propagatedHealth.set(svc.id, ownHealth);
        } else {
          const depHealths = svc.deps.map((depId) => propagatedHealth.get(depId) ?? 0);
          const avgDepHealth = depHealths.reduce((a, b) => a + b, 0) / depHealths.length;
          propagatedHealth.set(svc.id, Math.round(ownHealth * (avgDepHealth / 100)));
        }
      }
    }

    // Second pass: enrich each status with dependency info and propagated health
    for (const svc of this.manifest.services) {
      const status = all.find((s) => s.id === svc.id);
      if (!status) continue;

      status.dependencies = svc.deps.map((depId) => {
        const depStatus = all.find((s) => s.id === depId);
        return {
          dependencyId: depId,
          status: depStatus?.status || 'unknown',
        };
      });

      status.overallHealth = propagatedHealth.get(svc.id) ?? 100;
    }

    return all.sort((a, b) => a.layer - b.layer);
  }

  /**
   * Get the count of services in each state.
   */
  getSummary(): { total: number; running: number; failed: number; stopped: number } {
    const all = this.getAllStatuses();
    return {
      total: all.length,
      running: all.filter((s) => s.status === 'running').length,
      failed: all.filter((s) => s.status === 'failed').length,
      stopped: all.filter((s) => s.status === 'stopped').length,
    };
  }

  renderStatuses(statuses: ServiceStatus[]): string {
    const lines: string[] = ['AI OS Service Status:'];
    let currentLayer = 0;
    for (const s of statuses) {
      if (s.layer !== currentLayer) {
        currentLayer = s.layer;
        lines.push(`\nLayer ${currentLayer}:`);
      }
      const icon =
        s.status === 'running'
          ? '●'
          : s.status === 'starting'
            ? '→'
            : s.status === 'failed'
              ? '✗'
              : s.status === 'degraded'
                ? '⚠'
                : '○';
      lines.push(`  ${icon} ${s.id.padEnd(25)} ${s.status.padEnd(10)} Health: ${s.overallHealth ?? 0}%`);
      if (s.dependencies && s.dependencies.length > 0) {
        for (const dep of s.dependencies) {
          const depIcon = dep.status === 'running' ? '✓' : '✗';
          lines.push(`     ${depIcon} ${dep.dependencyId} (${dep.status})`);
        }
      }
    }
    return lines.join('\n');
  }

  renderSummary(summary: { total: number; running: number; failed: number; stopped: number }): string {
    const all = this.getAllStatuses();
    const maxLayer = Math.max(...all.map((s) => s.layer));
    const topLayerServices = all.filter((s) => s.layer === maxLayer);
    const topHealth =
      topLayerServices.length > 0
        ? Math.round(topLayerServices.reduce((s, svc) => s + (svc.overallHealth ?? 0), 0) / topLayerServices.length)
        : 0;

    return [
      `Total:    ${summary.total}`,
      `Running:  ${summary.running}`,
      `Failed:   ${summary.failed}`,
      `Stopped:  ${summary.stopped}`,
      `Top Health: ${topHealth}% (propagated through ${maxLayer} layers)`,
    ].join('\n');
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Cancelled'));
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new Error('Cancelled'));
        },
        { once: true },
      );
    }
  });
}

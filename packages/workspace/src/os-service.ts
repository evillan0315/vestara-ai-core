import * as os from 'node:os';
import type { HealthCheckResult, ServiceContract } from './service-contract';
import {
  AgentDaemonService,
  CloudControllerService,
  KernelService,
  PluginRuntimeService,
  WorkspaceManagerService,
} from './services';
import type { SystemInfo } from './types';

const VESTARA_VERSION = '2.5.0';

export class OSSystemService {
  private processStart: number;
  private services: Map<string, ServiceContract>;

  constructor() {
    this.processStart = Date.now();
    this.services = new Map();

    const svcs: ServiceContract[] = [
      new KernelService(),
      new WorkspaceManagerService(),
      new AgentDaemonService(),
      new PluginRuntimeService(),
      new CloudControllerService(),
    ];

    for (const svc of svcs) {
      this.services.set(svc.id, svc);
      svc.register().catch(() => {});
    }
  }

  async startAll(): Promise<void> {
    for (const svc of this.services.values()) {
      await svc.start();
    }
  }

  async stopAll(): Promise<void> {
    for (const svc of this.services.values()) {
      await svc.stop();
    }
  }

  async getSystemInfo(): Promise<SystemInfo> {
    const healthResults: HealthCheckResult[] = [];
    for (const svc of this.services.values()) {
      healthResults.push(await svc.health());
    }

    return {
      version: VESTARA_VERSION,
      platform: `${os.type()} ${os.release()}`,
      hostname: os.hostname(),
      uptime: Math.floor((Date.now() - this.processStart) / 1000),
      memory: {
        total: Math.round(os.totalmem() / (1024 * 1024)),
        free: Math.round(os.freemem() / (1024 * 1024)),
      },
      workspaces: 0,
      services: this.services.size,
    };
  }

  async getServiceHealth(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];
    for (const svc of this.services.values()) {
      results.push(await svc.health());
    }
    return results;
  }

  async getServiceHealthById(id: string): Promise<HealthCheckResult | null> {
    const svc = this.services.get(id);
    return svc ? svc.health() : null;
  }

  renderHealth(health: HealthCheckResult[]): string {
    const lines: string[] = ['Service Health:'];
    for (const h of health) {
      const icon = h.status === 'running' ? '●' : h.status === 'degraded' ? '⚠' : h.status === 'error' ? '✗' : '○';
      lines.push(`  ${icon} ${h.message} (uptime: ${h.uptime}s)`);
    }
    return lines.join('\n');
  }

  renderInfo(info: SystemInfo): string {
    return [
      `Vestara AI OS ${info.version}`,
      `Platform: ${info.platform}`,
      `Hostname: ${info.hostname}`,
      `Uptime: ${info.uptime}s`,
      `Memory: ${info.memory.free}MB free / ${info.memory.total}MB total`,
      `Services: ${info.services}`,
      `Workspaces: ${info.workspaces}`,
    ].join('\n');
  }
}

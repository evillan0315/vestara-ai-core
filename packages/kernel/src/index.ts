/**
 * @vestara/kernel — Vestara Kernel
 *
 * The Kernel is the first thing that runs when Vestara starts and
 * the last thing that stops when it shuts down. It manages the boot
 * sequence, configuration, service lifecycle, health, and shutdown.
 *
 * The Kernel owns orchestration, never implementation.
 * It coordinates components that each satisfy the VestaraService contract.
 *
 * Architecture Traceability:
 *   Runtime: VESTARA-KERNEL.md
 *   Foundation: UNIVERSAL-INTERFACE.md → VestaraService
 *   Blueprint: Book 3 → AI Architecture / Book 4 → Platform Services
 */

import type { ConfigurationProvider } from '@vestara/configuration';
import type { EventBus } from '@vestara/event-bus';
import type { HealthManager } from '@vestara/health';
import type { Logger } from '@vestara/logger';
import type { MetricsCollector } from '@vestara/metrics';
import type { PermissionManager } from '@vestara/permissions';
import type { ProviderManager } from '@vestara/provider-runtime';
import type { Scheduler as JobScheduler } from '@vestara/scheduler';
import type { ServiceRegistry } from '@vestara/service-registry';
import type {
  BootError,
  BootReport,
  KernelStatus,
  ResourceDiagnosis,
  ServiceDiagnosis,
  SystemDiagnosis,
  VestaraService,
} from '@vestara/shared';
import type { Worker } from '@vestara/worker';
import type { JobManager } from './job-manager';
import type { RecoveryManager } from './recovery-manager';
import type { TaskScheduler } from './task-scheduler';
import type { WorkerManager } from './worker-manager';

export interface BootOptions {
  configPath?: string;
  logLevel?: string;
  services?: Array<{
    service: VestaraService;
    capabilities?: string[];
    dependencies?: string[];
  }>;
  providers?: Array<{
    manager: ProviderManager;
    providerId: string;
  }>;
  workers?: Worker[];
}

export interface VestaraKernel {
  readonly status: KernelStatus;
  readonly version: string;
  readonly uptime: number;
  readonly config: ConfigurationProvider;
  readonly registry: ServiceRegistry;
  readonly health: HealthManager;
  readonly metrics: MetricsCollector;
  readonly logger: Logger;
  readonly eventBus: EventBus;
  readonly providerManager: ProviderManager | null;
  readonly recovery: RecoveryManager;
  readonly taskScheduler: TaskScheduler;
  readonly jobScheduler: JobScheduler;
  readonly workerManager: WorkerManager;
  readonly jobManager: JobManager;
  readonly permissions: PermissionManager;

  boot(options?: BootOptions): Promise<BootReport>;
  shutdown(): Promise<void>;
  halt(): void;
  diagnose(): Promise<SystemDiagnosis>;
}

export class DefaultKernel implements VestaraKernel {
  private _status: KernelStatus = 'powered-off';
  private _startTime = 0;
  private _config!: ConfigurationProvider;
  private _logger!: Logger;
  private _metrics!: MetricsCollector;
  private _eventBus!: EventBus;
  private _registry!: ServiceRegistry;
  private _health!: HealthManager;
  private _permissions!: PermissionManager;
  private _recovery!: RecoveryManager;
  private _taskScheduler!: TaskScheduler;
  private _jobScheduler!: JobScheduler;
  private _workerManager!: WorkerManager;
  private _jobManager!: JobManager;
  private _providerManager: ProviderManager | null = null;

  readonly id = 'kernel';
  readonly version = '0.1.0';

  async initialize(_config?: Record<string, unknown>): Promise<void> {
    // Kernel initialization is handled by boot()
  }

  async start(): Promise<void> {
    // Kernel start is handled by boot()
  }

  async stop(): Promise<void> {
    await this.shutdown();
  }

  async dispose(): Promise<void> {
    await this.shutdown();
  }

  get status(): KernelStatus {
    return this._status;
  }

  get uptime(): number {
    return this._startTime > 0 ? Math.floor((Date.now() - this._startTime) / 1000) : 0;
  }

  get config(): ConfigurationProvider {
    if (!this._config) throw new Error('Kernel not booted: configuration not available');
    return this._config;
  }

  get logger(): Logger {
    if (!this._logger) throw new Error('Kernel not booted: logger not available');
    return this._logger;
  }

  get metrics(): MetricsCollector {
    if (!this._metrics) throw new Error('Kernel not booted: metrics not available');
    return this._metrics;
  }

  get eventBus(): EventBus {
    if (!this._eventBus) throw new Error('Kernel not booted: event bus not available');
    return this._eventBus;
  }

  get registry(): ServiceRegistry {
    if (!this._registry) throw new Error('Kernel not booted: registry not available');
    return this._registry;
  }

  get health(): HealthManager {
    if (!this._health) throw new Error('Kernel not booted: health not available');
    return this._health;
  }

  get providerManager(): ProviderManager | null {
    return this._providerManager;
  }

  get recovery(): RecoveryManager {
    if (!this._recovery) throw new Error('Kernel not booted: recovery manager not available');
    return this._recovery;
  }

  get taskScheduler(): TaskScheduler {
    if (!this._taskScheduler) throw new Error('Kernel not booted: task scheduler not available');
    return this._taskScheduler;
  }

  get jobScheduler(): JobScheduler {
    if (!this._jobScheduler) throw new Error('Kernel not booted: job scheduler not available');
    return this._jobScheduler;
  }

  get workerManager(): WorkerManager {
    if (!this._workerManager) throw new Error('Kernel not booted: worker manager not available');
    return this._workerManager;
  }

  get jobManager(): JobManager {
    if (!this._jobManager) throw new Error('Kernel not booted: job manager not available');
    return this._jobManager;
  }

  get permissions(): PermissionManager {
    if (!this._permissions) throw new Error('Kernel not booted: permissions not available');
    return this._permissions;
  }

  async boot(options: BootOptions = {}): Promise<BootReport> {
    this._status = 'booting';
    this._startTime = Date.now();
    const errors: BootError[] = [];

    try {
      // Step 1: Configuration
      const { ConfigurationManager, FileConfigSource } = await import('@vestara/configuration');
      this._config = new ConfigurationManager();
      if (options.configPath) {
        (this._config as any).addSource(new FileConfigSource(options.configPath));
      }
      await this._config.load();

      // Step 2: Logger
      const { StructuredLogger } = await import('@vestara/logger');
      this._logger = new StructuredLogger({
        level: (options.logLevel as any) ?? this._config.get('runtime.logLevel', 'info'),
        service: 'kernel',
      });
      this._logger.info('Configuration loaded', {
        keys: this._config.keys().length,
        version: this._config.getVersion(),
      });

      // Step 3: Metrics
      const { MetricsRegistry } = await import('@vestara/metrics');
      this._metrics = new MetricsRegistry({ logger: this._logger.child({ component: 'metrics' }) });
      this._metrics.gauge('vestara.runtime.uptime', 0);

      // Step 4: Event Bus
      const { InProcessEventBus } = await import('@vestara/event-bus');
      this._eventBus = new InProcessEventBus();

      // Step 5: Service Registry
      const { DefaultServiceRegistry } = await import('@vestara/service-registry');
      this._registry = new DefaultServiceRegistry({
        logger: this._logger.child({ component: 'registry' }),
        eventBus: this._eventBus,
      });
      this._registry.setDependencies('kernel', []);

      // Step 6: Health Manager
      const { DefaultHealthManager } = await import('@vestara/health');
      this._health = new DefaultHealthManager({
        registry: this._registry,
        logger: this._logger.child({ component: 'health' }),
      });

      // Step 7: Permission Manager
      const { InMemoryPermissionStore, createPermissionManager } = await import('@vestara/permissions');
      this._permissions = createPermissionManager(new InMemoryPermissionStore());

      // Step 8: Recovery Manager
      const { DefaultRecoveryManager } = await import('./recovery-manager.js');
      this._recovery = new DefaultRecoveryManager({
        registry: this._registry,
        eventBus: this._eventBus,
        logger: this._logger.child({ component: 'recovery' }),
      });

      // Step 9: Task Scheduler (cron-based periodic tasks)
      const { DefaultTaskScheduler } = await import('./task-scheduler.js');
      this._taskScheduler = new DefaultTaskScheduler({
        eventBus: this._eventBus,
        logger: this._logger.child({ component: 'task-scheduler' }),
      });

      // Step 10: Job Scheduler (@vestara/scheduler — job/worker orchestration)
      const { Scheduler } = await import('@vestara/scheduler');
      this._jobScheduler = new Scheduler();

      // Step 11: Worker Manager
      const { DefaultWorkerManager } = await import('./worker-manager.js');
      this._workerManager = new DefaultWorkerManager(this._jobScheduler);

      // Step 12: Job Manager
      const { DefaultJobManager } = await import('./job-manager.js');
      this._jobManager = new DefaultJobManager(this._jobScheduler);

      // Register kernel itself
      await this._registry.register(this as unknown as VestaraService, ['kernel', 'lifecycle']);

      // Step 13: Register workers (if configured)
      if (options.workers) {
        for (const worker of options.workers) {
          this._workerManager.register(worker);
          await this._registry.register(worker as unknown as VestaraService, worker.definition.capabilities);
          this._logger.info(`Worker registered: ${worker.id}`, { type: worker.workerType });
        }
      }

      // Step 14: Register user-provided services
      if (options.services) {
        for (const { service, capabilities, dependencies } of options.services) {
          await this._registry.register(service, capabilities);
          if (dependencies && dependencies.length > 0) {
            this._registry.setDependencies(service.id, dependencies);
          }
        }
      }

      // Step 15: Initialize all services (in dependency order)
      const graph = this._registry.getDependencyGraph();
      this._logger.info('Service dependency graph', {
        layers: graph.layers.length,
        services: graph.nodes.length,
      });

      for (const layer of graph.layers) {
        for (const serviceId of layer) {
          if (serviceId === 'kernel') continue;
          const service = this._registry.get(serviceId);
          if (!service) continue;

          try {
            await service.initialize();
            await service.start();
            this._logger.info(`Service started: ${serviceId}`, { version: service.version });
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this._logger.error(`Service failed to start: ${serviceId}`, {
              error: error instanceof Error ? error : undefined,
            });
            errors.push({
              component: serviceId,
              error: msg,
              severity: 'error',
              action: 'continue',
            });
          }
        }
      }

      // Step 11: Load providers (if configured)
      if (options.providers && options.providers.length > 0) {
        this._logger.info('Loading providers...', { count: options.providers.length });
        this._providerManager = options.providers[0].manager;
        for (const { manager, providerId } of options.providers) {
          try {
            await manager.load(providerId);
            this._logger.info(`Provider loaded: ${providerId}`);
          } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this._logger.error(`Provider failed to load: ${providerId}`, {
              error: error instanceof Error ? error : undefined,
            });
            errors.push({
              component: `provider:${providerId}`,
              error: msg,
              severity: 'error',
              action: 'continue',
            });
          }
        }
      }

      // Step 12: Start periodic health checks
      const healthInterval = this._config.get<number>('runtime.health.interval', 15000);
      this._health.startPeriodicChecks(healthInterval);

      // Step 10: Mark kernel as running
      this._status = 'running';
      this._metrics.gauge('vestara.runtime.status', 1);

      // Emit boot completed event
      await this._eventBus.emit({
        type: 'runtime:boot.completed',
        version: 1,
        source: 'kernel',
        payload: { bootDuration: Date.now() - this._startTime },
      });

      this._logger.info('Runtime boot completed', {
        duration: `${Date.now() - this._startTime}ms`,
        servicesStarted: graph.nodes.length,
        servicesFailed: errors.length,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown boot error';
      this._logger.error('Fatal boot error', { error: error instanceof Error ? error : undefined });
      errors.push({
        component: 'kernel',
        error: msg,
        severity: 'error',
        action: 'fail',
      });
      this._status = 'stopped';
    }

    return {
      bootDuration: Date.now() - this._startTime,
      servicesStarted: this._registry.listServices().length,
      servicesFailed: errors.length,
      configVersion: this._config?.getVersion() ?? 'unknown',
      errors,
    };
  }

  async shutdown(): Promise<void> {
    if (this._status === 'powered-off' || this._status === 'stopped') return;

    this._status = 'draining';
    this._logger.info('Runtime shutting down...');

    // Stop periodic health checks
    this._health.stopPeriodicChecks();

    // Pause scheduler
    this._taskScheduler?.pause();

    // Emit shutdown event
    try {
      await this._eventBus?.emit({
        type: 'runtime:shutdown.started',
        version: 1,
        source: 'kernel',
        payload: {},
      });
    } catch {
      // Event bus may be unavailable during shutdown
    }

    // Stop services in reverse dependency order
    const graph = this._registry.getDependencyGraph();
    const reversedLayers = [...graph.layers].reverse();

    for (const layer of reversedLayers) {
      for (const serviceId of layer) {
        if (serviceId === 'kernel') continue;
        const service = this._registry.get(serviceId);
        if (!service || service.status === 'stopped') continue;

        try {
          await service.stop();
          await service.dispose();
          this._logger.debug(`Service stopped: ${serviceId}`);
        } catch (error) {
          this._logger.error(`Error stopping service: ${serviceId}`, {
            error: error instanceof Error ? error : undefined,
          });
        }
      }
    }

    // Clean up kernel resources
    try {
      this._metrics?.gauge('vestara.runtime.status', 0);
    } catch {
      // Metrics may be unavailable
    }

    this._status = 'stopped';
    this._logger.info('Runtime shutdown complete');
  }

  halt(): void {
    this._status = 'powered-off';
    // Force exit — no graceful cleanup
    process.exit(1);
  }

  async diagnose(): Promise<SystemDiagnosis> {
    // Run fresh health checks before diagnosis
    try {
      await this._health?.checkAll();
    } catch {
      /* best effort */
    }
    const services = this._registry?.listServices() ?? [];
    const overallHealth = this._health?.getOverallHealth() ?? {
      status: 'unhealthy' as const,
      healthyCount: 0,
      degradedCount: 0,
      unhealthyCount: 0,
      totalServices: 0,
      checks: [],
      lastCheck: new Date().toISOString(),
    };

    const serviceDiagnoses: ServiceDiagnosis[] = services.map((info) => {
      // Kernel is always healthy if running — its status comes from self-diagnosis
      if (info.id === 'kernel') {
        const kernelHealth: ServiceDiagnosis = {
          id: info.id,
          version: info.version,
          status: info.status,
          health: this._status === 'running' ? 'healthy' : this._status === 'degraded' ? 'degraded' : 'unhealthy',
          uptime: info.uptime,
          latency: 0,
          capabilities: info.capabilities,
        };
        return kernelHealth;
      }
      const check = overallHealth.checks.find((c) => c.serviceId === info.id);
      return {
        id: info.id,
        version: info.version,
        status: info.status,
        health: (check?.status ?? 'unhealthy') as 'healthy' | 'degraded' | 'unhealthy',
        uptime: info.uptime,
        latency: check?.latency ?? 0,
        capabilities: info.capabilities,
      };
    });

    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    const scheduledTasks = this._taskScheduler?.getStatus() ?? [];

    const resources: ResourceDiagnosis = {
      memory: {
        heapUsed: Math.round((memUsage.heapUsed / 1024 / 1024) * 100) / 100,
        heapTotal: Math.round((memUsage.heapTotal / 1024 / 1024) * 100) / 100,
        external: Math.round((memUsage.external / 1024 / 1024) * 100) / 100,
        percentUsed: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 10000) / 100,
      },
      cpu: {
        user: Math.round(cpuUsage.user / 1000),
        system: Math.round(cpuUsage.system / 1000),
      },
    };

    return {
      status: this._status,
      uptime: this.uptime,
      version: this.version,
      kernel: {
        status: this._status,
        bootDuration: this._startTime > 0 ? Date.now() - this._startTime : 0,
        configVersion: this._config?.getVersion() ?? 'unknown',
      },
      services: serviceDiagnoses,
      health: {
        overall: overallHealth.status,
        healthyCount: overallHealth.healthyCount,
        degradedCount: overallHealth.degradedCount,
        unhealthyCount: overallHealth.unhealthyCount,
      },
      scheduler: {
        tasks: scheduledTasks.length,
        paused: false,
      },
      resources,
    };
  }
}

export type { JobManager } from './job-manager';
export { DefaultJobManager } from './job-manager';
export type { RecoveryAttempt, RecoveryManager, RecoveryPolicy } from './recovery-manager';
export { DefaultRecoveryManager } from './recovery-manager';
export type { ScheduledTask, TaskExecution, TaskPriority, TaskScheduler, TaskStatus } from './task-scheduler';
export { DefaultTaskScheduler } from './task-scheduler';
export type { WorkerManager } from './worker-manager';
export { DefaultWorkerManager } from './worker-manager';

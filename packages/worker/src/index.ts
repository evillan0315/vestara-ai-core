import type { Job, JobResult } from '@vestara/job';
import type { RuntimeConfig, RuntimeHooks } from '@vestara/runtime';
import { Runtime } from '@vestara/runtime';
import type { RuntimeType, Timestamp, WorkerStatus, WorkerType } from '@vestara/types';
import { matchCapability, parseCapability } from '@vestara/types';

export interface ResourceLimits {
  cpu?: number;
  memoryMb?: number;
  diskMb?: number;
  network?: 'low' | 'medium' | 'high';
}

export interface WorkerDefinition {
  workerType: WorkerType;
  capabilities: string[];
  labels?: Record<string, string>;
  maxConcurrency: number;
  resources?: ResourceLimits;
  supportedRuntimes?: RuntimeType[];
}

export interface WorkerRuntimeState {
  status: WorkerStatus;
  currentLoad: number;
  activeJobs: number;
  heartbeat: Timestamp;
  lastError: string | null;
}

export interface WorkerConfig {
  definition: WorkerDefinition;
  runtime: RuntimeConfig;
  hooks?: RuntimeHooks;
}

export abstract class Worker extends Runtime {
  readonly definition: WorkerDefinition;
  readonly workerType: WorkerType;

  private _activeJobs: Map<string, Job> = new Map();
  private _heartbeat: Timestamp;
  private _lastError: string | null = null;

  constructor(config: WorkerConfig, hooks?: RuntimeHooks) {
    super(config.runtime, hooks);
    this.definition = config.definition;
    this.workerType = config.definition.workerType;
    this._heartbeat = new Date().toISOString() as Timestamp;
  }

  get workerRuntime(): WorkerRuntimeState {
    return {
      status:
        this.health.status === 'healthy'
          ? 'available'
          : this.health.status === 'degraded'
            ? 'busy'
            : this.state === 'failed'
              ? 'unhealthy'
              : 'offline',
      currentLoad: this.definition.maxConcurrency > 0 ? this._activeJobs.size / this.definition.maxConcurrency : 0,
      activeJobs: this._activeJobs.size,
      heartbeat: this._heartbeat,
      lastError: this._lastError,
    };
  }

  touch(): void {
    this._heartbeat = new Date().toISOString() as Timestamp;
  }

  supports(capability: string): boolean {
    const parsedRequired = parseCapability(capability);
    if (!parsedRequired) {
      return this.definition.capabilities.includes(capability);
    }
    return this.definition.capabilities.some((own) => {
      const parsedOwn = parseCapability(own);
      if (!parsedOwn) return own === capability;
      const match = matchCapability(parsedRequired, parsedOwn);
      return match.matched;
    });
  }

  supportsJob(job: Job): boolean {
    if (this.availableCapacity() <= 0) return false;
    if (this.state !== 'running') return false;
    const required = job.capabilities;
    if (required.length === 0) return true;
    return required.every((c) => this.supports(c));
  }

  availableCapacity(): number {
    return this.definition.maxConcurrency - this._activeJobs.size;
  }

  async execute(job: Job): Promise<JobResult> {
    if (!this.supportsJob(job)) {
      throw new Error(`Worker ${this.id} cannot execute job ${job.id}: insufficient capability or capacity`);
    }
    this._activeJobs.set(job.id, job);
    this.touch();
    try {
      return await this.run(job);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._lastError = message;
      this.touch();
      throw err;
    } finally {
      this._activeJobs.delete(job.id);
      this.touch();
    }
  }

  protected abstract run(job: Job): Promise<JobResult>;
}

export type { SubprocessResult } from './process-runner';
export { runCommand } from './process-runner';
export { AIWorker } from './workers/ai-worker';
export type { CIWorkerOptions } from './workers/ci-worker';
export { CIWorker } from './workers/ci-worker';
export type { DockerWorkerOptions } from './workers/docker-worker';
export { DockerWorker } from './workers/docker-worker';
export { HumanWorker } from './workers/human-worker';
export type { MCPWorkerOptions } from './workers/mcp-worker';
export { MCPWorker } from './workers/mcp-worker';
export type {
  RemoteDispatchInput,
  RemoteDispatchResult,
  RemoteJobDispatcher,
  RemoteWorkerOptions,
} from './workers/remote-worker';
export { RemoteWorker } from './workers/remote-worker';

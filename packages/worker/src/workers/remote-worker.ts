import type { Job, JobResult } from '@vestara/job';
import type { WorkerConfig, WorkerDefinition } from '../index';
import { Worker } from '../index';

export interface RemoteDispatchInput {
  readonly jobId: string;
  readonly jobType: string;
  readonly capabilities: readonly string[];
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface RemoteDispatchResult {
  readonly ok: boolean;
  readonly summary?: string;
  readonly error?: string;
  readonly output?: Readonly<Record<string, unknown>>;
}

/** Abstraction over the transport used to dispatch jobs to a remote executor. */
export interface RemoteJobDispatcher {
  dispatch(input: RemoteDispatchInput): Promise<RemoteDispatchResult>;
}

export interface RemoteWorkerOptions {
  readonly dispatcher?: RemoteJobDispatcher;
  readonly timeoutMs?: number;
}

/**
 * Executes a job on a remote executor. When a `RemoteJobDispatcher` is
 * injected (e.g. the PCS-027 `RemoteWorkerDispatcher` at the composition
 * root), the job is dispatched through it; otherwise the worker performs an
 * HTTP POST to `definition.labels.remoteUrl`. Kept dependency-light so the
 * worker package does not couple to the orchestrator cluster.
 */
export class RemoteWorker extends Worker {
  private readonly dispatcher?: RemoteJobDispatcher;
  private readonly timeoutMs: number;

  constructor(
    config: Omit<WorkerConfig, 'definition'> & { definition: Omit<WorkerDefinition, 'workerType'> },
    options?: RemoteWorkerOptions,
  ) {
    super({
      ...config,
      definition: { ...config.definition, workerType: 'remote' },
    } as WorkerConfig);
    this.dispatcher = options?.dispatcher;
    this.timeoutMs = options?.timeoutMs ?? 30_000;
  }

  protected async run(job: Job): Promise<JobResult> {
    const input: RemoteDispatchInput = {
      jobId: job.id,
      jobType: job.type,
      capabilities: job.capabilities,
    };

    try {
      const result = this.dispatcher ? await this.dispatcher.dispatch(input) : await this.httpDispatch(input);

      if (result.ok) {
        return {
          status: 'success',
          summary: result.summary ?? `Remote job ${job.type} completed`,
          output: result.output ?? {},
        };
      }
      return {
        status: 'failure',
        summary: result.summary ?? `Remote job ${job.type} failed`,
        error: result.error,
      };
    } catch (error) {
      return {
        status: 'failure',
        summary: `Remote dispatch failed for ${job.type}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async httpDispatch(input: RemoteDispatchInput): Promise<RemoteDispatchResult> {
    const remoteUrl = this.definition.labels?.remoteUrl;
    if (!remoteUrl) {
      return { ok: false, error: 'Remote job requires definition.labels.remoteUrl or an injected dispatcher' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(remoteUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      if (!response.ok) {
        return { ok: false, error: `remote endpoint returned ${response.status}` };
      }
      const body = (await response.json()) as RemoteDispatchResult;
      return body;
    } finally {
      clearTimeout(timer);
    }
  }
}

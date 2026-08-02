/**
 * WorkerNodeRuntime — the executor side of a worker node (PCS-027 §7).
 *
 * Runs a pluggable WorkerExecutor and caches results by executionId so a
 * re-dispatched task (after a lease expiry) returns the cached result instead
 * of executing twice — the idempotency contract.
 */

import type { TaskDispatchResult, TaskReviewResult, TaskTestResult, WorkflowTask } from '../types';
import type { WorkerExecutor, WorkerRequest, WorkerResponse } from './types';

export interface WorkerNodeRuntimeOptions {
  readonly nodeId: string;
  readonly executor: WorkerExecutor;
}

export class WorkerNodeRuntime {
  private readonly nodeId: string;
  private readonly executor: WorkerExecutor;
  private readonly results = new Map<string, TaskDispatchResult | TaskReviewResult | TaskTestResult>();
  private readonly inFlight = new Map<string, Promise<WorkerResponse>>();

  constructor(options: WorkerNodeRuntimeOptions) {
    this.nodeId = options.nodeId;
    this.executor = options.executor;
  }

  get id(): string {
    return this.nodeId;
  }

  /** Handle a request; concurrent duplicates for the same executionId dedupe. */
  handleRequest(request: WorkerRequest): Promise<WorkerResponse> {
    const key = `${request.kind}:${request.executionId}`;
    const cached = this.results.get(key);
    if (cached) return Promise.resolve({ requestId: request.requestId, ok: true, result: cached });
    const running = this.inFlight.get(key);
    if (running) {
      return running.then((response) => ({ ...response, requestId: request.requestId }));
    }
    const promise = this.execute(request);
    this.inFlight.set(key, promise);
    promise.finally(() => this.inFlight.delete(key));
    return promise;
  }

  private async execute(request: WorkerRequest): Promise<WorkerResponse> {
    try {
      let result: TaskDispatchResult | TaskReviewResult | TaskTestResult;
      switch (request.kind) {
        case 'dispatch':
          result = await this.executor.dispatch(request.task, request.projectId);
          break;
        case 'review':
          result = (await this.executor.review?.(request.task, request.projectId, request.changesets ?? [])) ?? {
            decision: 'approved' as const,
          };
          break;
        case 'test':
          result = (await this.executor.test?.(request.task, request.projectId)) ?? { status: 'passed' as const };
          break;
      }
      this.results.set(`${request.kind}:${request.executionId}`, result);
      return { requestId: request.requestId, ok: true, result };
    } catch (error) {
      return { requestId: request.requestId, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

/** Convenience executor adapter for tests: a simple inline executor. */
export function inlineExecutor(options: {
  readonly dispatch?: (task: WorkflowTask, projectId: string) => Promise<TaskDispatchResult>;
  readonly review?: (task: WorkflowTask) => Promise<TaskReviewResult>;
  readonly test?: (task: WorkflowTask) => Promise<TaskTestResult>;
}): WorkerExecutor {
  return {
    dispatch: options.dispatch ?? (async () => ({ status: 'completed', agentId: 'remote' })),
    review: options.review ?? (async () => ({ decision: 'approved' })),
    test: options.test ?? (async () => ({ status: 'passed' })),
  };
}

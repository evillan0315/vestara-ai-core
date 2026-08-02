/**
 * RemoteWorkerDispatcher — a `TaskDispatcher` implemented over a transport
 * (PCS-027 §3). The orchestrator schedules tasks through it exactly as it would
 * an in-process dispatcher; only the transport endpoint changes.
 */

import type {
  OrchestratedProject,
  TaskDispatcher,
  TaskDispatchResult,
  TaskReviewResult,
  TaskTestResult,
  WorkflowTask,
} from '../types';
import type { WorkerRequest, WorkerRequestKind, WorkerResponse, WorkerTransport } from './types';

function requestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class RemoteWorkerDispatcher implements TaskDispatcher {
  private readonly transport: WorkerTransport;
  private readonly nodeId: string;

  constructor(transport: WorkerTransport, nodeId?: string) {
    this.transport = transport;
    this.nodeId = nodeId ?? transport.nodeId;
  }

  get node(): string {
    return this.nodeId;
  }

  async dispatch(task: WorkflowTask, project: OrchestratedProject): Promise<TaskDispatchResult> {
    const response = await this.send('dispatch', task, project.id);
    return response.result as TaskDispatchResult;
  }

  async review(
    task: WorkflowTask,
    project: OrchestratedProject,
    changesets: readonly Readonly<Record<string, unknown>>[],
  ): Promise<TaskReviewResult> {
    const response = await this.send('review', task, project.id, changesets);
    return response.result as TaskReviewResult;
  }

  async test(task: WorkflowTask, project: OrchestratedProject): Promise<TaskTestResult> {
    const response = await this.send('test', task, project.id);
    return response.result as TaskTestResult;
  }

  private async send(
    kind: WorkerRequestKind,
    task: WorkflowTask,
    projectId: string,
    changesets?: readonly Readonly<Record<string, unknown>>[],
  ): Promise<WorkerResponse & { ok: true }> {
    const request: WorkerRequest = {
      kind,
      requestId: requestId(),
      executionId: `exec-${task.id}`,
      task: { ...task },
      projectId,
      changesets: changesets?.map((changeset) => ({ ...changeset })),
    };
    const response = await this.transport.send(request);
    if (!response.ok) throw new Error(response.error);
    return response;
  }
}

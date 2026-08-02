/**
 * PCS-027 distributed worker contracts.
 *
 * A remote worker is a `TaskDispatcher` implemented over a transport. Nodes
 * register with capability announcements, emit heartbeats, and execute tasks
 * (and review/test) through a pluggable executor. Every request carries an
 * immutable `executionId` so a node can return cached results on re-dispatch
 * (idempotent failure recovery).
 */

import type { TaskDispatchResult, TaskReviewResult, TaskTestResult, WorkflowTask } from '../types';

export type WorkerNodeStatus = 'online' | 'offline' | 'draining' | 'unknown';

export interface WorkerNode {
  readonly id: string;
  readonly hostname: string;
  readonly status: WorkerNodeStatus;
  readonly executors: readonly string[];
  readonly capabilities: readonly string[];
  readonly load: number; // 0..1 (running / capacity)
  readonly lastHeartbeatAt: string;
  readonly registeredAt: string;
}

export interface WorkerHeartbeat {
  readonly nodeId: string;
  readonly at: string;
  readonly status: 'ok' | 'draining' | 'overloaded';
  readonly load: number;
}

export interface TaskLease {
  readonly leaseId: string;
  readonly executionId: string;
  readonly nodeId: string;
  readonly task: WorkflowTask;
  readonly expiresAt: string;
}

export type WorkerRequestKind = 'dispatch' | 'review' | 'test';

export interface WorkerRequest {
  readonly kind: WorkerRequestKind;
  readonly requestId: string;
  readonly executionId: string;
  readonly task: WorkflowTask;
  readonly projectId: string;
  readonly changesets?: readonly Readonly<Record<string, unknown>>[];
}

export type WorkerResponse =
  | {
      readonly requestId: string;
      readonly ok: true;
      readonly result: TaskDispatchResult | TaskReviewResult | TaskTestResult;
    }
  | { readonly requestId: string; readonly ok: false; readonly error: string };

/** The transport a RemoteWorkerDispatcher talks over (WebSocket in production). */
export interface WorkerTransport {
  readonly nodeId: string;
  send(request: WorkerRequest): Promise<WorkerResponse>;
}

/** The executor contract a worker node runs (mirrors the TaskDispatcher boundary). */
export interface WorkerExecutor {
  dispatch(task: WorkflowTask, projectId: string): Promise<TaskDispatchResult>;
  review?(
    task: WorkflowTask,
    projectId: string,
    changesets: readonly Readonly<Record<string, unknown>>[],
  ): Promise<TaskReviewResult>;
  test?(task: WorkflowTask, projectId: string): Promise<TaskTestResult>;
}

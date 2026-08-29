/**
 * In-memory transport pairing a RemoteWorkerDispatcher with a WorkerNodeRuntime
 * (PCS-027 tests). A production transport (WebSocket) routes the same
 * WorkerRequest/WorkerResponse messages to a node on another machine.
 */

import type { WorkerRequest, WorkerResponse, WorkerTransport } from './types';
import type { WorkerNodeRuntime } from './worker-node';

export class MemoryWorkerTransport implements WorkerTransport {
  readonly nodeId: string;

  constructor(private readonly node: WorkerNodeRuntime) {
    this.nodeId = node.id;
  }

  async send(request: WorkerRequest): Promise<WorkerResponse> {
    return this.node.handleRequest(request);
  }
}

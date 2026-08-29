/**
 * WorkerSocketClient — PCS-027 WebSocket transport (node side).
 *
 * Connects a WorkerNodeRuntime to the orchestrator's `/ws/worker` endpoint,
 * registers the node, emits heartbeats, and runs incoming WorkerRequests
 * through the runtime (which caches results by executionId).
 */

import type { WorkerNode, WorkerNodeRuntime, WorkerRequest, WorkerResponse } from '@vestara/workflow-orchestrator';
import { WebSocket } from 'ws';

export interface WorkerSocketClientOptions {
  readonly url: string;
  readonly node: Omit<WorkerNode, 'status' | 'load' | 'lastHeartbeatAt' | 'registeredAt'>;
  readonly runtime: WorkerNodeRuntime;
  readonly heartbeatMs?: number;
  readonly onStatus?: (status: 'connected' | 'disconnected' | 'error', detail?: string) => void;
}

export class WorkerSocketClient {
  private readonly url: string;
  private readonly node: Omit<WorkerNode, 'status' | 'load' | 'lastHeartbeatAt' | 'registeredAt'>;
  private readonly runtime: WorkerNodeRuntime;
  private readonly heartbeatMs: number;
  private readonly onStatus?: WorkerSocketClientOptions['onStatus'];
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setInterval>;

  constructor(options: WorkerSocketClientOptions) {
    this.url = options.url;
    this.node = options.node;
    this.runtime = options.runtime;
    this.heartbeatMs = options.heartbeatMs ?? 5_000;
    this.onStatus = options.onStatus;
  }

  get nodeId(): string {
    return this.node.id;
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.on('open', () => {
        this.onStatus?.('connected');
        this.send({
          op: 'register',
          node: {
            ...this.node,
            status: 'online',
            load: 0,
            lastHeartbeatAt: new Date().toISOString(),
            registeredAt: new Date().toISOString(),
          },
        });
        resolve();
      });
      socket.on('error', (error) => {
        this.onStatus?.('error', String(error));
        reject(error);
      });
      socket.on('close', () => {
        this.onStatus?.('disconnected');
        if (this.timer) clearInterval(this.timer);
      });
      socket.on('message', (raw) => {
        void this.onMessage(raw);
      });
    });
    this.timer = setInterval(
      () => this.send({ op: 'heartbeat', nodeId: this.node.id, load: this.runtime.load }),
      this.heartbeatMs,
    );
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.socket?.close();
  }

  private async onMessage(raw: unknown): Promise<void> {
    let message: { op?: string; request?: WorkerRequest };
    try {
      message = JSON.parse(String(raw)) as { op?: string; request?: WorkerRequest };
    } catch {
      return;
    }
    if (message.op === 'request' && message.request) {
      const response = await this.runtime.handleRequest(message.request);
      this.send({ op: 'response', response });
    }
  }

  private send(message: {
    op: string;
    nodeId?: string;
    node?: WorkerNode;
    load?: number;
    response?: WorkerResponse;
  }): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    }
  }
}

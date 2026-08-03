/**
 * WorkerSocketServer — PCS-027 WebSocket transport (server side).
 *
 * Accepts worker-node connections at `/ws/worker`, registers nodes, tracks
 * heartbeats, and routes WorkerRequests to the connected node, correlating
 * responses by requestId. Emits `worker.*` events for projection.
 */

import type {
  WorkerNode,
  WorkerRegistry,
  WorkerRequest,
  WorkerResponse,
  WorkerTransport,
} from '@vestara/workflow-orchestrator';
import { WebSocket, type WebSocketServer } from 'ws';

export interface WorkerEventSink {
  append(event: { readonly type: string; readonly nodeId: string; readonly detail?: string }): void;
}

interface NodeConnection {
  readonly socket: WebSocket;
  node: WorkerNode;
  readonly pending: Map<
    string,
    {
      readonly resolve: (response: WorkerResponse) => void;
      readonly reject: (error: Error) => void;
      readonly timer: ReturnType<typeof setTimeout>;
    }
  >;
}

interface WireMessage {
  readonly op: string;
  readonly nodeId?: string;
  readonly node?: WorkerNode;
  readonly load?: number;
  readonly status?: string;
  readonly request?: WorkerRequest;
  readonly response?: WorkerResponse;
}

export class WorkerSocketServer {
  private readonly connections = new Map<string, NodeConnection>();
  private readonly registry: WorkerRegistry;
  private readonly events: WorkerEventSink;
  private readonly requestTimeoutMs: number;

  constructor(registry: WorkerRegistry, events: WorkerEventSink, requestTimeoutMs = 15_000) {
    this.registry = registry;
    this.events = events;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  attach(wss: WebSocketServer): void {
    wss.on('connection', (socket) => {
      socket.on('message', (raw) => {
        void this.onMessage(socket, raw);
      });
      socket.on('close', () => this.onClose(socket));
      socket.on('error', () => this.onClose(socket));
    });
  }

  transportFor(nodeId: string): WorkerTransport {
    return { nodeId, send: (request) => this.sendRequest(nodeId, request) };
  }

  connectedNodeIds(): string[] {
    return [...this.connections.keys()];
  }

  private async onMessage(socket: WebSocket, raw: unknown): Promise<void> {
    let message: WireMessage;
    try {
      message = JSON.parse(String(raw)) as WireMessage;
    } catch {
      return;
    }
    switch (message.op) {
      case 'register': {
        if (!message.node?.id) return;
        const node = await this.registry.register(message.node);
        this.connections.set(node.id, { socket, node, pending: new Map() });
        this.events.append({ type: 'worker.registered', nodeId: node.id, detail: node.hostname });
        socket.send(JSON.stringify({ op: 'ack' }));
        break;
      }
      case 'heartbeat': {
        if (!message.nodeId) return;
        await this.registry.heartbeat({
          nodeId: message.nodeId,
          load: message.load ?? 0,
          status: message.status as 'ok' | 'draining' | 'overloaded',
        });
        this.events.append({
          type: 'worker.heartbeat',
          nodeId: message.nodeId,
          detail: String(message.load ?? 0),
        });
        break;
      }
      case 'response': {
        if (!message.response) return;
        const connection = this.connectionFor(socket);
        const pending = connection?.pending.get(message.response.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          connection?.pending.delete(message.response.requestId);
          pending.resolve(message.response);
        }
        break;
      }
      default:
        break;
    }
  }

  private onClose(socket: WebSocket): void {
    for (const [nodeId, connection] of this.connections) {
      if (connection.socket === socket) {
        this.connections.delete(nodeId);
        for (const { timer, reject } of connection.pending.values()) {
          clearTimeout(timer);
          reject(new Error(`Worker node ${nodeId} disconnected`));
        }
        void this.registry.markOffline(nodeId);
        this.events.append({ type: 'worker.offline', nodeId });
      }
    }
  }

  private connectionFor(socket: WebSocket): NodeConnection | undefined {
    return [...this.connections.values()].find((connection) => connection.socket === socket);
  }

  private sendRequest(nodeId: string, request: WorkerRequest): Promise<WorkerResponse> {
    const connection = this.connections.get(nodeId);
    if (!connection || connection.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`Worker node ${nodeId} is not connected`));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        connection.pending.delete(request.requestId);
        reject(new Error(`Worker request timed out: ${request.requestId}`));
      }, this.requestTimeoutMs);
      connection.pending.set(request.requestId, { resolve, reject, timer });
      connection.socket.send(JSON.stringify({ op: 'request', request }));
    });
  }
}

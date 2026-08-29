import * as http from 'node:http';
import type { SettingsWorkspaceCommand } from '@vestara/configuration';
import WebSocket from 'ws';

export interface WorkspaceRuntimeClientStatus {
  readonly status: string;
  readonly workspaceId: string;
  readonly runtimeVersion: string;
  readonly apiEndpoint: string;
}

export interface WorkspaceRuntimeClient {
  execute<TResult>(command: SettingsWorkspaceCommand): Promise<TResult>;
  getStatus(): Promise<WorkspaceRuntimeClientStatus>;
  subscribe(listener: (event: unknown) => void): Promise<() => void>;
}

export interface WorkspaceRuntimeClientOptions {
  readonly endpoint?: string;
  readonly socketPath?: string;
}

export class HttpWorkspaceRuntimeClient implements WorkspaceRuntimeClient {
  private readonly endpoint: URL;
  constructor(private readonly options: WorkspaceRuntimeClientOptions = {}) {
    this.endpoint = new URL(options.endpoint ?? process.env.VESTARA_API_URL ?? 'http://127.0.0.1:3001');
  }

  getStatus(): Promise<WorkspaceRuntimeClientStatus> {
    return this.request('/api/runtime/status', 'GET');
  }

  execute<TResult>(command: SettingsWorkspaceCommand): Promise<TResult> {
    if (command.type === 'runtime.health-check') return this.request('/api/runtime/health-check', 'POST', command);
    if (command.type === 'graph.rebuild') return this.request('/api/graph/rebuild', 'POST', command);
    if (command.type === 'routing.catalog.get') return this.request('/api/routing/catalog', 'GET');
    if (command.type === 'routing.selection.get') return this.request('/api/routing/selection', 'GET');
    if (command.type === 'routing.selection.update')
      return this.request('/api/routing/selection', 'PATCH', {
        ...command.payload,
        updatedByClientId: command.source,
      });
    if (command.type === 'routing.preview')
      return this.request('/api/routing/preview', 'POST', {
        ...command.payload,
        source: command.source,
      });
    if (command.type === 'routing.assignment.list') return this.request('/api/routing/assignments', 'GET');
    if (command.type === 'routing.assignment.create')
      return this.request('/api/routing/assignments', 'POST', {
        ...command.payload,
        requestedByClientId: command.source,
      });
    if (command.type === 'routing.assignment.status')
      return this.request(
        `/api/routing/assignments/${encodeURIComponent(String(command.payload.taskId))}/status`,
        'PATCH',
        {
          ...command.payload,
        },
      );
    if (command.type === 'routing.assignment.side-effect')
      return this.request(
        `/api/routing/assignments/${encodeURIComponent(String(command.payload.taskId))}/side-effects`,
        'POST',
        command.payload,
      );
    if (command.type === 'routing.assignment.reassign')
      return this.request(
        `/api/routing/assignments/${encodeURIComponent(String(command.payload.taskId))}/reassign`,
        'POST',
        { ...command.payload, requestedByClientId: command.source },
      );
    if (command.type === 'settings.reset') {
      const section = encodeURIComponent(String(command.payload.section ?? 'general'));
      return this.request(`/api/settings/overrides/${section}`, 'DELETE', command);
    }
    const section = command.payload.section;
    const overrides = command.payload.overrides;
    return this.request('/api/settings', 'PATCH', {
      section,
      overrides,
      source: command.source,
      expectedRevision: command.payload.expectedRevision,
    });
  }

  subscribe(listener: (event: unknown) => void): Promise<() => void> {
    const websocketEndpoint = new URL('/ws', this.endpoint);
    websocketEndpoint.protocol = websocketEndpoint.protocol === 'https:' ? 'wss:' : 'ws:';

    return new Promise((resolve, reject) => {
      const socket = new WebSocket(
        websocketEndpoint,
        this.options.socketPath ? { socketPath: this.options.socketPath } : undefined,
      );
      let settled = false;
      let active = true;

      socket.once('open', () => {
        settled = true;
        socket.send(JSON.stringify({ op: 'subscribe', channels: ['workspace'] }));
        resolve(() => {
          active = false;
          socket.close();
        });
      });
      socket.on('message', (data) => {
        if (!active) return;
        try {
          const message = JSON.parse(String(data)) as { op?: string; event?: unknown };
          if (message.op === 'event' && message.event !== undefined) listener(message.event);
        } catch {
          // Ignore malformed frames; a later valid event can still be delivered.
        }
      });
      socket.once('error', (error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      });
      socket.once('close', () => {
        active = false;
        if (!settled) {
          settled = true;
          reject(new Error('Runtime WebSocket closed before the subscription was established'));
        }
      });
    });
  }

  private request<TResult>(pathname: string, method: string, body?: unknown): Promise<TResult> {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const request = http.request(
        {
          protocol: this.endpoint.protocol,
          hostname: this.endpoint.hostname,
          port: this.endpoint.port,
          path: pathname,
          method,
          socketPath: this.options.socketPath,
          headers: {
            'Content-Type': 'application/json',
            'X-Vestara-Source': 'cli',
            ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            const parsed = raw
              ? (JSON.parse(raw) as TResult & { error?: string })
              : ({} as TResult & { error?: string });
            if ((response.statusCode ?? 500) >= 400)
              reject(new Error(parsed.error ?? `Runtime API ${response.statusCode}`));
            else resolve(parsed);
          });
        },
      );
      request.on('error', reject);
      if (payload) request.write(payload);
      request.end();
    });
  }
}

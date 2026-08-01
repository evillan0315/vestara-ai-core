import * as http from 'node:http';
import { createWorkspaceCommand } from '@vestara/configuration';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import { HttpWorkspaceRuntimeClient } from '../src/runtime-client.js';

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function endpoint(handler: (request: http.IncomingMessage, body: string) => unknown): Promise<string> {
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const result = handler(request, Buffer.concat(chunks).toString('utf8'));
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(result));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind');
  return `http://127.0.0.1:${address.port}`;
}

describe('HttpWorkspaceRuntimeClient', () => {
  it('reads status from the shared Workspace API', async () => {
    const url = await endpoint(() => ({
      status: 'running',
      workspaceId: 'workspace-test',
      runtimeVersion: '0.3.0',
      apiEndpoint: 'http://127.0.0.1',
    }));
    const status = await new HttpWorkspaceRuntimeClient({ endpoint: url }).getStatus();
    expect(status.workspaceId).toBe('workspace-test');
  });

  it('propagates CLI command identity and source headers', async () => {
    let observedSource = '';
    let observedCommandId = '';
    const url = await endpoint((request, body) => {
      observedSource = String(request.headers['x-vestara-source']);
      observedCommandId = (JSON.parse(body) as { commandId: string }).commandId;
      return { accepted: true };
    });
    const command = createWorkspaceCommand({
      workspaceId: 'workspace-test',
      source: 'cli',
      type: 'runtime.health-check',
    });
    await new HttpWorkspaceRuntimeClient({ endpoint: url }).execute(command);
    expect(observedSource).toBe('cli');
    expect(observedCommandId).toBe(command.commandId);
  });

  it('maps routing commands to the shared routing API', async () => {
    const observed: Array<{ method?: string; path?: string; body: unknown }> = [];
    const url = await endpoint((request, body) => {
      observed.push({ method: request.method, path: request.url, body: body ? JSON.parse(body) : undefined });
      return { accepted: true };
    });
    const client = new HttpWorkspaceRuntimeClient({ endpoint: url });

    await client.execute(
      createWorkspaceCommand({ workspaceId: 'workspace-test', source: 'cli', type: 'routing.catalog.get' }),
    );
    await client.execute(
      createWorkspaceCommand({
        workspaceId: 'workspace-test',
        source: 'cli',
        type: 'routing.assignment.reassign',
        payload: {
          taskId: 'TASK-1',
          expectedRevision: 3,
          agentId: 'developer-02',
          route: { providerId: 'provider-b', modelId: 'model-b' },
          reason: 'provider unavailable',
          approved: false,
        },
      }),
    );
    await client.execute(
      createWorkspaceCommand({
        workspaceId: 'workspace-test',
        source: 'cli',
        type: 'routing.selection.update',
        payload: { selection: { profileId: 'local', roles: {} }, expectedRevision: 2 },
      }),
    );
    await client.execute(
      createWorkspaceCommand({
        workspaceId: 'workspace-test',
        source: 'cli',
        type: 'routing.preview',
        payload: { role: 'developer', agentId: 'developer-01' },
      }),
    );

    expect(observed).toEqual([
      { method: 'GET', path: '/api/routing/catalog', body: undefined },
      {
        method: 'POST',
        path: '/api/routing/assignments/TASK-1/reassign',
        body: {
          taskId: 'TASK-1',
          expectedRevision: 3,
          agentId: 'developer-02',
          route: { providerId: 'provider-b', modelId: 'model-b' },
          reason: 'provider unavailable',
          approved: false,
          requestedByClientId: 'cli',
        },
      },
      {
        method: 'PATCH',
        path: '/api/routing/selection',
        body: {
          selection: { profileId: 'local', roles: {} },
          expectedRevision: 2,
          updatedByClientId: 'cli',
        },
      },
      {
        method: 'POST',
        path: '/api/routing/preview',
        body: { role: 'developer', agentId: 'developer-01', source: 'cli' },
      },
    ]);
  });

  it('subscribes to workspace events and closes on unsubscribe', async () => {
    const server = http.createServer();
    const sockets = new WebSocketServer({ server, path: '/ws' });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');

    const subscription = new Promise<{ op: string; channels: string[] }>((resolve) => {
      sockets.once('connection', (socket) => {
        socket.once('message', (data) => {
          resolve(JSON.parse(String(data)) as { op: string; channels: string[] });
          socket.send(JSON.stringify({ op: 'event', event: { id: 'event-1', type: 'system.heartbeat' } }));
        });
      });
    });
    let resolveEvent: (event: unknown) => void = () => undefined;
    const received = new Promise<unknown>((resolve) => {
      resolveEvent = resolve;
    });
    const unsubscribe = await new HttpWorkspaceRuntimeClient({
      endpoint: `http://127.0.0.1:${address.port}`,
    }).subscribe(resolveEvent);

    await expect(subscription).resolves.toEqual({ op: 'subscribe', channels: ['workspace'] });
    await expect(received).resolves.toEqual({ id: 'event-1', type: 'system.heartbeat' });
    unsubscribe();
    sockets.close();
  });
});

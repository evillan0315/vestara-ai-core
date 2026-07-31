import * as http from 'node:http';
import { createWorkspaceCommand } from '@vestara/configuration';
import { afterEach, describe, expect, it } from 'vitest';
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
});

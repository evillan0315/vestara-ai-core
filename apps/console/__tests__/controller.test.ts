import * as http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { ConsoleController, splitArguments } from '../src/controller.js';

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function endpoint(): Promise<string> {
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += String(chunk)));
    request.on('end', () => {
      const path = request.url;
      if (path === '/api/chat/stream') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.write(`data: ${JSON.stringify({ type: 'text', content: 'Hello ' })}\n\n`);
        response.write(`data: ${JSON.stringify({ type: 'text', content: 'engineer.' })}\n\n`);
        response.end(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
        return;
      }
      let result: unknown;
      if (path === '/api/runtime/status') {
        result = {
          status: 'running',
          workspaceId: 'workspace-test',
          runtimeVersion: '0.3.0',
          apiEndpoint: 'http://127.0.0.1',
        };
      } else if (path === '/api/routing/selection' && request.method === 'GET') {
        result = {
          revision: 4,
          updatedByClientId: 'workspace-ui',
          selection: { profileId: 'balanced', roles: { developer: { providerId: 'opencode', modelId: 'model-x' } } },
        };
      } else if (path === '/api/routing/preview') {
        result = {
          selected: { providerName: 'OpenCode', ref: { providerId: 'opencode', modelId: 'model-x' } },
          evidence: {
            selectedAgentId: 'developer-01',
            agentRole: 'developer',
            policyId: 'balanced',
            reasonCodes: ['best-compatible-candidate'],
            rejectedCandidates: [],
          },
        };
      } else result = { error: `Unhandled ${request.method} ${path}`, body };
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

async function events(controller: ConsoleController, command: string) {
  const result = [];
  for await (const event of controller.execute(command)) result.push(event);
  return result;
}

describe('ConsoleController', () => {
  it('parses quoted command arguments', () => {
    expect(splitArguments('routing profile "strict engineering"')).toEqual([
      'routing',
      'profile',
      'strict engineering',
    ]);
  });

  it('renders status and effective routing through the shared client', async () => {
    const controller = new ConsoleController({ endpoint: await endpoint() });
    expect(await events(controller, 'status')).toEqual([
      { type: 'status', content: 'Connecting to Workspace Runtime…' },
      {
        type: 'output',
        content: 'Workspace workspace-test\nRuntime running · v0.3.0\nAPI http://127.0.0.1',
      },
    ]);
    const routing = await events(controller, 'routing show');
    expect(routing.at(-1)).toMatchObject({ type: 'output' });
    expect((routing.at(-1) as { content: string }).content).toContain('developer      opencode/model-x');
  });

  it('produces a task-specific routing preflight', async () => {
    const controller = new ConsoleController({ endpoint: await endpoint() });
    const result = await events(controller, 'routing preview developer developer-01');
    expect((result.at(-1) as { content: string }).content).toContain('Execution routing');
    expect((result.at(-1) as { content: string }).content).toContain('OpenCode (opencode)');
  });

  it('streams plain-language conversation as incremental events', async () => {
    const controller = new ConsoleController({ endpoint: await endpoint() });
    expect(await events(controller, 'Explain this workspace')).toEqual([
      { type: 'status', content: 'Connecting to Workspace Runtime…' },
      { type: 'output-start' },
      { type: 'output-delta', content: 'Hello ' },
      { type: 'output-delta', content: 'engineer.' },
      { type: 'output-end' },
    ]);
  });

  it('requires confirmation before submitting a reassignment', async () => {
    const controller = new ConsoleController({ endpoint: await endpoint() });
    const result = await events(
      controller,
      'routing reassign TASK-1 2 developer-02 opencode model-y --reason "provider unavailable"',
    );
    expect(result.at(-1)).toEqual({
      type: 'confirmation',
      prompt: 'Reassign TASK-1 to developer-02 using opencode/model-y?',
      command: 'routing reassign TASK-1 2 developer-02 opencode model-y --reason "provider unavailable" --confirmed',
    });
  });

  it('handles local lifecycle commands without connecting', async () => {
    const controller = new ConsoleController({ endpoint: 'http://127.0.0.1:1' });
    expect(await events(controller, 'clear')).toEqual([{ type: 'clear' }]);
    expect(await events(controller, 'exit')).toEqual([{ type: 'exit' }]);
    expect((await events(controller, 'help'))[0]).toMatchObject({ type: 'output' });
  });
});

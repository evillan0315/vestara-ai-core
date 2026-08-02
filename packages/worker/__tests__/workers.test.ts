import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Job } from '@vestara/job';
import type { JobId, RuntimeConfig, WorkerId } from '@vestara/types';
import { CIWorker, DockerWorker, MCPWorker, RemoteWorker } from '@vestara/worker';
import { afterAll, describe, expect, it } from 'vitest';

const directories: string[] = [];
function temp(name: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vestara-worker-${name}-`));
  directories.push(dir);
  return dir;
}
afterAll(() => {
  for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function job(type: string, id = 'job-1'): Job {
  return new Job({
    id: id as JobId,
    owner: 'rt-1' as WorkerId,
    runtime: 'rt-1' as WorkerId,
    spec: { type: type as never, priority: 3 },
  });
}

function runtimeConfig(id: string): RuntimeConfig {
  return { id, type: 'service', displayName: id } as RuntimeConfig;
}

describe('CIWorker', () => {
  it('runs a command from labels.command and succeeds on exit 0', async () => {
    const worker = new CIWorker({
      runtime: runtimeConfig('ci-1'),
      definition: { workerType: 'ci', capabilities: ['ci:run'], maxConcurrency: 1, labels: { command: 'echo hi' } },
    });
    await worker.start();
    const result = await worker.execute(job('build'));
    expect(result.status).toBe('success');
    expect(result.output?.stdout).toContain('hi');
  });

  it('fails on a non-zero exit', async () => {
    const worker = new CIWorker({
      runtime: runtimeConfig('ci-2'),
      definition: {
        workerType: 'ci',
        capabilities: ['ci:run'],
        maxConcurrency: 1,
        labels: { command: 'sh -c "exit 3"' },
      },
    });
    await worker.start();
    const result = await worker.execute(job('build'));
    expect(result.status).toBe('failure');
    expect(result.output?.exitCode).toBe(3);
  });

  it('reports failure when no command is configured', async () => {
    const worker = new CIWorker({
      runtime: runtimeConfig('ci-3'),
      definition: { workerType: 'ci', capabilities: ['ci:run'], maxConcurrency: 1 },
    });
    await worker.start();
    const result = await worker.execute(job('custom-type'));
    expect(result.status).toBe('failure');
  });
});

describe('DockerWorker', () => {
  it('invokes the docker CLI with the configured image', async () => {
    const script = path.join(temp('docker'), 'fake-docker');
    fs.writeFileSync(script, '#!/bin/sh\necho "fake docker run"\nexit 0\n');
    fs.chmodSync(script, 0o755);
    const worker = new DockerWorker(
      {
        runtime: runtimeConfig('docker-1'),
        definition: {
          workerType: 'docker',
          capabilities: ['docker:run'],
          maxConcurrency: 1,
          labels: { image: 'busybox' },
        },
      },
      { dockerBinary: script },
    );
    await worker.start();
    const result = await worker.execute(job('deploy'));
    expect(result.status).toBe('success');
    expect(result.output?.stdout).toContain('fake docker run');
  });

  it('fails when the image is missing', async () => {
    const worker = new DockerWorker({
      runtime: runtimeConfig('docker-2'),
      definition: { workerType: 'docker', capabilities: ['docker:run'], maxConcurrency: 1 },
    });
    await worker.start();
    const result = await worker.execute(job('deploy'));
    expect(result.status).toBe('failure');
  });
});

describe('MCPWorker', () => {
  it('performs an initialize handshake and calls a tool over stdio', async () => {
    const serverScript = path.join(temp('mcp'), 'mcp-server.js');
    fs.writeFileSync(
      serverScript,
      [
        "const readline = require('node:readline');",
        'const rl = readline.createInterface({ input: process.stdin });',
        "rl.on('line', (line) => {",
        '  const msg = JSON.parse(line);',
        "  if (msg.method === 'initialize') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { capabilities: {} } }) + '\\n');",
        "  else if (msg.method === 'tools/call') process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: 'done' } }) + '\\n');",
        '});',
      ].join('\n'),
    );
    const worker = new MCPWorker({
      runtime: runtimeConfig('mcp-1'),
      definition: {
        workerType: 'mcp',
        capabilities: ['mcp:call'],
        maxConcurrency: 1,
        labels: { server: `node ${serverScript}`, tool: 'execute' },
      },
    });
    await worker.start();
    const result = await worker.execute(job('analyze'));
    expect(result.status).toBe('success');
    expect(result.output?.content).toBe('done');
  });

  it('fails when no server is configured', async () => {
    const worker = new MCPWorker({
      runtime: runtimeConfig('mcp-2'),
      definition: { workerType: 'mcp', capabilities: ['mcp:call'], maxConcurrency: 1 },
    });
    await worker.start();
    const result = await worker.execute(job('analyze'));
    expect(result.status).toBe('failure');
  });
});

describe('RemoteWorker', () => {
  it('delegates to an injected dispatcher', async () => {
    const dispatched: string[] = [];
    const worker = new RemoteWorker(
      {
        runtime: runtimeConfig('remote-1'),
        definition: { workerType: 'remote', capabilities: ['remote:run'], maxConcurrency: 1 },
      },
      {
        dispatcher: {
          dispatch: async (input) => {
            dispatched.push(input.jobId);
            return { ok: true, summary: `ran ${input.jobType}`, output: { note: 'remote ok' } };
          },
        },
      },
    );
    await worker.start();
    const result = await worker.execute(job('build', 'job-remote'));
    expect(result.status).toBe('success');
    expect(dispatched).toContain('job-remote');
    expect(result.output?.note).toBe('remote ok');
  });

  it('fails when the dispatcher reports failure', async () => {
    const worker = new RemoteWorker(
      {
        runtime: runtimeConfig('remote-2'),
        definition: { workerType: 'remote', capabilities: ['remote:run'], maxConcurrency: 1 },
      },
      {
        dispatcher: { dispatch: async () => ({ ok: false, error: 'node offline' }) },
      },
    );
    await worker.start();
    const result = await worker.execute(job('build'));
    expect(result.status).toBe('failure');
    expect(result.error).toBe('node offline');
  });

  it('fails with a clear message when neither dispatcher nor remoteUrl exists', async () => {
    const worker = new RemoteWorker({
      runtime: runtimeConfig('remote-3'),
      definition: { workerType: 'remote', capabilities: ['remote:run'], maxConcurrency: 1 },
    });
    await worker.start();
    const result = await worker.execute(job('build'));
    expect(result.status).toBe('failure');
    expect(result.error).toContain('remoteUrl');
  });
});

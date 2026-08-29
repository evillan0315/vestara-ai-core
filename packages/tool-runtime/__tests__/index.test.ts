import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { FilesystemRuntime } from '@vestara/filesystem-runtime';
import type { AgentEnvironment, AgentEnvironmentId, PolicyEvaluationInput, ToolCallId } from '@vestara/types';
import { afterEach, describe, expect, it } from 'vitest';
import { FilesystemReadTool, FilesystemWriteTool, type ToolPolicyEvaluator, ToolRuntime } from '../src/index.js';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function setup() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-tool-'));
  directories.push(workspaceRoot);
  const environment: AgentEnvironment = {
    id: 'environment-local' as AgentEnvironmentId,
    kind: 'local',
    workspaceRoot,
    networkPolicy: 'deny',
    filesystemPolicy: 'workspace-write',
    processPolicy: 'restricted',
  };
  return { workspaceRoot, environment, filesystem: new FilesystemRuntime({ rootDir: workspaceRoot }) };
}

function request(environment: AgentEnvironment, toolName: string, input: unknown) {
  return {
    callId: 'call-1' as ToolCallId,
    toolName,
    input,
    agentId: 'developer-01',
    taskId: 'TASK-1',
    environment,
  };
}

describe('ToolRuntime', () => {
  it('validates and executes filesystem reads within the existing sandbox', async () => {
    const { workspaceRoot, environment, filesystem } = setup();
    fs.writeFileSync(path.join(workspaceRoot, 'README.md'), 'Harness');
    const runtime = new ToolRuntime();
    runtime.register(new FilesystemReadTool(filesystem));
    expect(runtime.definitions()[0]?.inputSchema).toMatchObject({
      required: ['path'],
      additionalProperties: false,
    });

    const result = await runtime.invoke(
      request(environment, 'filesystem.read', { path: 'README.md' }),
      new AbortController().signal,
    );
    expect(result).toMatchObject({ status: 'completed', output: { content: 'Harness' } });
    expect('evidence' in result ? result.evidence[0]?.kind : undefined).toBe('file');
    await expect(
      runtime.invoke(request(environment, 'filesystem.read', { path: '../secret' }), new AbortController().signal),
    ).resolves.toMatchObject({ status: 'failed' });
  });

  it('requires configured approval before a write and captures evidence', async () => {
    const { workspaceRoot, environment, filesystem } = setup();
    const policy: ToolPolicyEvaluator = {
      async evaluate(input: PolicyEvaluationInput) {
        return {
          decision: input.toolName === 'filesystem.write' ? 'require-approval' : 'allow',
          reason: 'Writes require review',
        };
      },
    };
    const runtime = new ToolRuntime(policy);
    runtime.register(new FilesystemWriteTool(filesystem));
    const call = request(environment, 'filesystem.write', { path: 'result.txt', content: 'verified' });

    expect(await runtime.invoke(call, new AbortController().signal)).toMatchObject({
      status: 'approval-required',
      reason: 'Writes require review',
    });
    expect(fs.existsSync(path.join(workspaceRoot, 'result.txt'))).toBe(false);

    const approved = await runtime.invoke(call, new AbortController().signal, true);
    expect(approved).toMatchObject({ status: 'completed', output: { path: 'result.txt' } });
    expect(fs.readFileSync(path.join(workspaceRoot, 'result.txt'), 'utf8')).toBe('verified');
  });

  it('rejects malformed input before invoking a provider', async () => {
    const { environment, filesystem } = setup();
    const runtime = new ToolRuntime();
    runtime.register(new FilesystemReadTool(filesystem));
    await expect(
      runtime.invoke(request(environment, 'filesystem.read', { path: 42 }), new AbortController().signal),
    ).rejects.toThrow('path');
  });
});

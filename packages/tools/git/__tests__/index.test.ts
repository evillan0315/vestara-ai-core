import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ToolRuntime } from '@vestara/tool-runtime';
import type { AgentEnvironment, AgentEnvironmentId, ToolCallId } from '@vestara/types';
import { afterEach, describe, expect, it } from 'vitest';
import { GitAddTool, GitCommitTool, GitDiffTool, GitLogTool, GitStatusTool } from '../src/index.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function setup() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vestara-git-'));
  roots.push(workspaceRoot);
  execFileSync('git', ['init'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.email', 'test@vestara.local'], { cwd: workspaceRoot });
  execFileSync('git', ['config', 'user.name', 'Vestara Test'], { cwd: workspaceRoot });
  fs.writeFileSync(path.join(workspaceRoot, 'README.md'), 'initial\n');
  execFileSync('git', ['add', 'README.md'], { cwd: workspaceRoot });
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: workspaceRoot });
  const environment: AgentEnvironment = {
    id: 'git-environment' as AgentEnvironmentId,
    kind: 'local',
    workspaceRoot,
    networkPolicy: 'deny',
    filesystemPolicy: 'workspace-write',
    processPolicy: 'restricted',
  };
  const runtime = new ToolRuntime();
  runtime.register(new GitStatusTool());
  runtime.register(new GitDiffTool());
  runtime.register(new GitLogTool());
  runtime.register(new GitAddTool());
  runtime.register(new GitCommitTool());
  return { workspaceRoot, environment, runtime };
}

function request(environment: AgentEnvironment, toolName: string, input: unknown) {
  return {
    callId: `${toolName}-call` as ToolCallId,
    toolName,
    input,
    agentId: 'developer',
    taskId: 'git-task',
    environment,
  };
}

describe('governed Git tools', () => {
  it('runs status, diff and log without approval', async () => {
    const { workspaceRoot, environment, runtime } = setup();
    fs.appendFileSync(path.join(workspaceRoot, 'README.md'), 'changed\n');
    await expect(
      runtime.invoke(request(environment, 'git.status', {}), new AbortController().signal),
    ).resolves.toMatchObject({
      status: 'completed',
    });
    const diff = await runtime.invoke(request(environment, 'git.diff', {}), new AbortController().signal);
    expect('output' in diff ? (diff.output as any).stdout : '').toContain('changed');
    await expect(
      runtime.invoke(request(environment, 'git.log', { maxCount: 1 }), new AbortController().signal),
    ).resolves.toMatchObject({
      status: 'completed',
    });
  });

  it('requires approval for staging and committing explicit paths', async () => {
    const { workspaceRoot, environment, runtime } = setup();
    fs.appendFileSync(path.join(workspaceRoot, 'README.md'), 'approved\n');
    const add = request(environment, 'git.add', { paths: ['README.md'] });
    expect(await runtime.invoke(add, new AbortController().signal)).toMatchObject({ status: 'approval-required' });
    expect(await runtime.invoke(add, new AbortController().signal, true)).toMatchObject({ status: 'completed' });
    const commit = request(environment, 'git.commit', { message: 'test: approved change', paths: ['README.md'] });
    expect(await runtime.invoke(commit, new AbortController().signal)).toMatchObject({ status: 'approval-required' });
    expect(await runtime.invoke(commit, new AbortController().signal, true)).toMatchObject({ status: 'completed' });
    expect(execFileSync('git', ['log', '-1', '--format=%s'], { cwd: workspaceRoot, encoding: 'utf8' }).trim()).toBe(
      'test: approved change',
    );
  });

  it('rejects pathspec flags and traversal before execution', async () => {
    const { environment, runtime } = setup();
    await expect(
      runtime.invoke(request(environment, 'git.add', { paths: ['--all'] }), new AbortController().signal, true),
    ).rejects.toThrow('Unsafe Git path');
    await expect(
      runtime.invoke(request(environment, 'git.diff', { paths: ['../outside'] }), new AbortController().signal),
    ).rejects.toThrow('Unsafe Git path');
  });
});

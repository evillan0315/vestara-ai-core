import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as path from 'node:path';
import { parseUnifiedDiff } from '@vestara/diff-engine';
import { envelopes, projectTask } from '@vestara/tui-projections';
import type { TaskFileChange } from '@vestara/tui-protocol';
import type { TaskThreadId } from '@vestara/types';
import type { WorkspaceContext } from '../workspace-context';
import { json } from './types';

export async function handleTuiRoute(
  method: string,
  p: string,
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
  url: URL,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/tui/threads') {
    json(res, 200, {
      schemaVersion: 1,
      threads: ctx.agentThreadStore.listThreads().map((thread) => {
        const turn = ctx.agentThreadStore.listTurns(thread.id).at(-1);
        return {
          id: thread.id,
          taskId: thread.taskId,
          title: thread.title,
          status: thread.status,
          phase: turn?.state ?? 'idle',
          environmentId: thread.environmentId,
          attentionRequired: turn?.state === 'blocked' || turn?.state === 'awaiting-approval',
        };
      }),
    });
    return true;
  }
  const match = p.match(/^\/api\/tui\/threads\/([^/]+)\/(snapshot|events)$/);
  if (method !== 'GET' || !match) return false;
  const threadId = decodeURIComponent(match[1]) as TaskThreadId;
  const thread = ctx.agentThreadStore.getThread(threadId);
  if (!thread) {
    json(res, 404, { error: 'Thread not found' });
    return true;
  }
  const truth = ctx.engineeringEvents.query({
    threadId,
    afterSequence: match[2] === 'events' ? Number(url.searchParams.get('after') ?? 0) : 0,
    limit: 10000,
  });
  if (match[2] === 'events') {
    json(res, 200, { schemaVersion: 1, events: envelopes(truth) });
    return true;
  }
  const workspace = threadWorkspace(ctx, thread.metadata.worktreeLeaseId);
  const changes = gitChanges(workspace.root, thread.taskId, workspace.agentId);
  const snapshot = projectTask({
    replay: ctx.agentThreadStore.replay(threadId),
    events: truth,
    changes,
    branch: workspace.branch,
  });
  json(res, 200, { snapshot });
  return true;
}

function threadWorkspace(
  ctx: WorkspaceContext,
  leaseValue: unknown,
): { root: string; branch?: string; agentId?: string } {
  const lease = typeof leaseValue === 'string' ? ctx.worktreeRuntime.get(leaseValue) : undefined;
  return lease
    ? { root: lease.worktreePath, branch: lease.branchName, agentId: lease.agentId }
    : { root: ctx.repoPath };
}
function gitChanges(root: string, taskId: string, agentId?: string): readonly TaskFileChange[] {
  try {
    const patch = execFileSync('git', ['diff', '--no-ext-diff', '--no-color', 'HEAD', '--'], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
    const parsed = [...parseUnifiedDiff({ patch, taskId, agentId })];
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
    for (const file of untracked) {
      const target = path.resolve(root, file);
      if (!target.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(target)) continue;
      const content = fs.readFileSync(target, 'utf8');
      parsed.push({
        taskId,
        agentId,
        path: file,
        operation: 'create',
        additions: content.split('\n').length,
        deletions: 0,
        hunks: [],
        verificationIds: [],
        observedAt: new Date().toISOString(),
        preExisting: false,
      });
    }
    return parsed;
  } catch {
    return [];
  }
}

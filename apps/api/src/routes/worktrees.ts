import type * as http from 'node:http';
import { requireRole } from '../auth';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

export async function handleWorktreeRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/worktrees') {
    json(res, 200, {
      leases: ctx.worktreeRuntime
        .list()
        .map((lease) => ({ ...lease, inspection: ctx.worktreeRuntime.inspect(lease.id) })),
    });
    return true;
  }
  if (method === 'POST' && p === '/api/worktrees') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>;
    if (typeof body.taskId !== 'string' || typeof body.agentId !== 'string') {
      json(res, 400, { error: 'taskId and agentId are required' });
      return true;
    }
    const lease = ctx.worktreeRuntime.acquire({
      taskId: body.taskId,
      agentId: body.agentId,
      repositoryRoot: ctx.repoPath,
      baseRevision: typeof body.baseRevision === 'string' ? body.baseRevision : undefined,
      branchName: typeof body.branchName === 'string' ? body.branchName : undefined,
    });
    json(res, 201, { lease, inspection: ctx.worktreeRuntime.inspect(lease.id) });
    return true;
  }
  const leaseMatch = p.match(/^\/api\/worktrees\/([^/]+)$/);
  if (method === 'GET' && leaseMatch) {
    try {
      json(res, 200, ctx.worktreeRuntime.inspect(decodeURIComponent(leaseMatch[1])));
    } catch (error) {
      json(res, 404, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }
  const claimMatch = p.match(/^\/api\/worktrees\/([^/]+)\/files$/);
  if (method === 'POST' && claimMatch) {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const body = JSON.parse((await readBody(req)) || '{}') as { files?: unknown };
    if (!Array.isArray(body.files) || !body.files.every((file) => typeof file === 'string')) {
      json(res, 400, { error: 'files must be an array of repository-relative paths' });
      return true;
    }
    ctx.worktreeRuntime.claimFiles(decodeURIComponent(claimMatch[1]), body.files as string[]);
    json(res, 200, { claimed: body.files });
    return true;
  }
  const releaseMatch = p.match(/^\/api\/worktrees\/([^/]+)\/release$/);
  if (method === 'POST' && releaseMatch) {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const body = JSON.parse((await readBody(req)) || '{}') as { force?: unknown };
    const lease = ctx.worktreeRuntime.release(decodeURIComponent(releaseMatch[1]), { force: body.force === true });
    json(res, 200, { lease });
    return true;
  }
  return false;
}

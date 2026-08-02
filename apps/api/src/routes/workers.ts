/**
 * Workers routes — PCS-027 distributed worker cluster.
 *
 * Lists registered nodes + leases and dispatches a task through the cluster's
 * scheduler (capability + least-load) to a connected worker node.
 */

import type * as http from 'node:http';
import { requireRole } from '../auth';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

function taskFromBody(body: Record<string, unknown>): import('@vestara/workflow-orchestrator').WorkflowTask | null {
  const summary = typeof body.summary === 'string' && body.summary.trim() ? body.summary.trim() : null;
  if (!summary) return null;
  const files = Array.isArray(body.files) ? body.files.map(String) : [];
  const capabilities = Array.isArray(body.requiredCapabilities) ? body.requiredCapabilities.map(String) : [];
  return {
    id: typeof body.id === 'string' ? body.id : `remote-${Date.now()}`,
    planId: typeof body.planId === 'string' ? body.planId : '',
    summary,
    description: typeof body.description === 'string' ? body.description : '',
    files,
    dependencies: Array.isArray(body.dependencies) ? body.dependencies.map(String) : [],
    status: 'pending',
    effort: 'medium',
    requiredCapabilities: capabilities,
    revisionCount: 0,
    attemptCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function handleWorkersRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (!ctx.workerRegistry) return false;

  if (method === 'GET' && p === '/api/workers/nodes') {
    json(res, 200, { nodes: await ctx.workerRegistry.list(), online: (await ctx.workerRegistry.listOnline()).length });
    return true;
  }

  if (method === 'GET' && p === '/api/workers/leases') {
    json(res, 200, { leases: (await ctx.workerStore?.listActiveLeases()) ?? [] });
    return true;
  }

  if (method === 'POST' && p === '/api/workers/dispatch') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const body = JSON.parse((await readBody(req)) || '{}') as Record<string, unknown>;
    const task = taskFromBody(body);
    if (!task) {
      json(res, 400, { error: 'task.summary is required' });
      return true;
    }
    if (!ctx.workerCluster) {
      json(res, 503, { error: 'worker cluster not configured' });
      return true;
    }
    try {
      const project = {
        id: task.planId || task.id,
        name: task.summary,
        goal: task.summary,
        repoPath: '',
        phase: 'executing',
        workspaceId: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as import('@vestara/workflow-orchestrator').OrchestratedProject;
      const result = await ctx.workerCluster.dispatch(task, project);
      json(res, 200, { result });
    } catch (error) {
      json(res, 409, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  return false;
}

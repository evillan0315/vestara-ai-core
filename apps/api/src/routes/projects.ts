import type * as http from 'node:http';
import { AuditAction, logAudit } from '../audit-log';
import { requireRole } from '../auth';
import type { WorkspaceContext } from '../workspace-context';
import { actorOf, getActor, json, readBody } from './types';

export async function handleProjectsRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/projects') {
    if (!ctx.projects) {
      json(res, 200, { projects: [] });
      return true;
    }
    const projects = await ctx.projects.listProjects();
    const withStats = await Promise.all(
      projects.map(async (p) => ({ ...p, stats: await ctx.projects!.getProjectStats(p.id) })),
    );
    json(res, 200, { projects: withStats });
    return true;
  }

  if (method === 'GET' && p === '/api/sprints') {
    try {
      const allSprints = ctx.projects ? await ctx.projects.listSprints() : [];
      json(res, 200, { sprints: allSprints, active: allSprints.filter((s: any) => s.status === 'active') });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  const projDetail = p.match(/^\/api\/projects\/([^/]+)$/);
  if (method === 'GET' && projDetail) {
    const id = decodeURIComponent(projDetail[1]);
    const project = await ctx.projects?.getProject(id);
    if (!project) {
      json(res, 404, { error: 'project not found' });
      return true;
    }
    json(res, 200, {
      project,
      tasks: await ctx.projects!.listTasks(id),
      sprints: await ctx.projects!.listSprints(id),
      stats: await ctx.projects!.getProjectStats(id),
    });
    return true;
  }

  if (method === 'POST' && p === '/api/projects') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const actor = getActor(req, ctx);
    const project = await ctx.projects?.createProject(body.name || 'New Project', body.description);
    logAudit(ctx.audit, req, actor.id, actor.name, AuditAction.PROJECT_CREATE, 'project', project?.id, project?.name);
    json(res, 201, { project });
    return true;
  }

  if (method === 'POST' && p.match(/^\/api\/projects\/([^/]+)\/tasks$/)) {
    const projectId = decodeURIComponent(p.match(/^\/api\/projects\/([^/]+)\/tasks$/)![1]);
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    json(res, 201, { task: await ctx.projects?.createTask(projectId, body.title || 'New Task', body) });
    return true;
  }

  const taskDetail = p.match(/^\/api\/tasks\/([^/]+)$/);
  if (method === 'PATCH' && taskDetail) {
    const id = decodeURIComponent(taskDetail[1]);
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    if (body.status) await ctx.projects?.updateTaskStatus(id, body.status);
    json(res, 200, { updated: true });
    return true;
  }

  if (method === 'DELETE' && projDetail) {
    const id = decodeURIComponent(projDetail[1]);
    await ctx.projects?.updateProject(id, { status: 'cancelled' });
    json(res, 200, { deleted: true });
    return true;
  }

  return false;
}

import type * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

const featureRequests: Array<{
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  votes: number;
  createdAt: string;
  updatedAt: string;
  tags: string[];
}> = [];
let reqIdCounter = 0;

export { featureRequests };

export async function handleFeatureRequestsRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/requests') {
    json(res, 200, { requests: featureRequests });
    return true;
  }

  if (method === 'POST' && p === '/api/requests') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    if (!body.title) {
      json(res, 400, { error: 'Title required' });
      return true;
    }
    const now = new Date().toISOString();
    const request = {
      id: `req-${++reqIdCounter}`,
      title: body.title,
      description: body.description || '',
      category: body.category || 'feature',
      priority: body.priority || 'medium',
      status: 'submitted',
      votes: 0,
      createdAt: now,
      updatedAt: now,
      tags: body.tags || [],
    };
    featureRequests.push(request);
    if (ctx.milestones)
      ctx.milestones.addMilestone({
        version: `FR-${reqIdCounter}`,
        name: body.title,
        description: body.description || `Feature request: ${body.title}`,
        status: 'pending',
      });
    json(res, 201, request);
    return true;
  }

  const reqMatch = p.match(/^\/api\/requests\/([^/]+)$/);
  if (method === 'PUT' && reqMatch) {
    const id = decodeURIComponent(reqMatch[1]);
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const idx = featureRequests.findIndex((r) => r.id === id);
    if (idx === -1) {
      json(res, 404, { error: 'Not found' });
      return true;
    }
    featureRequests[idx] = { ...featureRequests[idx], ...body, id, updatedAt: new Date().toISOString() };
    if (ctx.milestones && body.status && body.status !== featureRequests[idx].status) {
      const msStatus =
        body.status === 'completed'
          ? ('completed' as const)
          : body.status === 'planned' || body.status === 'in_progress'
            ? ('in_progress' as const)
            : ('pending' as const);
      ctx.milestones.updateMilestone(`FR-${id.replace('req-', '')}`, { status: msStatus });
    }
    json(res, 200, featureRequests[idx]);
    return true;
  }

  if (method === 'DELETE' && reqMatch) {
    const id = decodeURIComponent(reqMatch[1]);
    const idx = featureRequests.findIndex((r) => r.id === id);
    if (idx === -1) {
      json(res, 404, { error: 'Not found' });
      return true;
    }
    featureRequests.splice(idx, 1);
    json(res, 200, { success: true });
    return true;
  }

  return false;
}

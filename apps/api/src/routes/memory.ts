import type * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

export async function handleMemoryRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
  url: URL,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/artifacts') {
    const fingerprintId = ctx.runtime.getSession().fingerprint.id;
    const [plans, changeSets, collab] = await Promise.all([
      ctx.plans.list(fingerprintId),
      ctx.changeSets.listByWorkspace(fingerprintId),
      ctx.collaboration.listByWorkspace(fingerprintId),
    ]);
    json(res, 200, {
      chain: ['explanation', 'plan', 'changeset', 'verification', 'approval'],
      plans,
      changeSets,
      collaboration: collab,
    });
    return true;
  }

  if (method === 'GET' && p === '/api/approvals') {
    const fingerprintId = ctx.runtime.getSession().fingerprint.id;
    const records = await ctx.collaboration.listByWorkspace(fingerprintId);
    json(res, 200, {
      records,
      pending: records.filter((r) => r.status === 'submitted' || r.status === 'reviewing' || r.status === 'draft'),
    });
    return true;
  }

  if (method === 'GET' && p === '/api/memory') {
    const q = url.searchParams.get('q') ?? '';
    if (q) {
      const nodes = await ctx.knowledgeGraph.searchNodes(q, 20);
      json(res, 200, {
        results: await Promise.all(
          nodes.map(async (node) => ({ node, relations: await ctx.knowledgeGraph.getRelations(node.id) })),
        ),
      });
    } else {
      const [nodes, relations, stats] = await Promise.all([
        ctx.knowledgeGraph.getAllNodes(),
        ctx.knowledgeGraph.getAllRelations(),
        ctx.knowledgeGraph.getStats(),
      ]);
      json(res, 200, { nodes, relations, stats });
    }
    return true;
  }

  if (method === 'POST' && p === '/api/memory/index') {
    const report = await ctx.memory.index(ctx.runtime.getSession());
    json(res, 200, { nodes: report.nodes, relations: report.relations, duration: report.duration });
    return true;
  }

  return false;
}

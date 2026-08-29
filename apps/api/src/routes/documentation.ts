import type * as http from 'node:http';
import type { DocumentationImpactRequest, DocumentationVerificationProfile } from '@vestara/documentation';
import type { WorkspaceContext } from '../workspace-context';
import { actorOf, json, readBody } from './types';

async function bodyOf(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  if (!raw) return {};
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON object required');
  return value as Record<string, unknown>;
}

function strings(value: unknown, name: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    throw new Error(`${name} must be a string array`);
  return value;
}

export async function handleDocumentationRoute(
  method: string,
  pathname: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (!pathname.startsWith('/api/documentation')) return false;
  const suffix = pathname.slice('/api/documentation'.length) || '/';
  try {
    if (method === 'GET' && suffix === '/status') {
      json(res, 200, ctx.documentation.getStatus());
      return true;
    }
    if (method === 'POST' && suffix === '/scan') {
      json(res, 200, await ctx.documentation.scan());
      return true;
    }
    if (method === 'GET' && suffix === '/findings') {
      json(res, 200, { findings: ctx.documentation.getFindings() });
      return true;
    }
    if (method === 'POST' && suffix === '/impact') {
      const body = await bodyOf(req);
      const request: DocumentationImpactRequest = {
        workspaceId: ctx.repoPath,
        executionId: typeof body.executionId === 'string' ? body.executionId : undefined,
        changedPaths: strings(body.changedPaths, 'changedPaths'),
        changedEntityIds: strings(body.changedEntityIds, 'changedEntityIds'),
        graphDiffRef: typeof body.graphDiffRef === 'string' ? body.graphDiffRef : undefined,
      };
      json(res, 200, await ctx.documentation.analyzeImpact(request));
      return true;
    }
    if (method === 'POST' && suffix === '/plans') {
      const body = await bodyOf(req);
      json(res, 201, await ctx.documentation.createPlan('manual', strings(body.findingIds, 'findingIds')));
      return true;
    }
    if (method === 'GET' && suffix === '/plans') {
      json(res, 200, { plans: ctx.documentation.listPlans() });
      return true;
    }
    if (method === 'GET' && suffix === '/proposals') {
      json(res, 200, { proposals: ctx.documentation.listProposals() });
      return true;
    }
    if (method === 'GET' && suffix === '/reports') {
      json(res, 200, { reports: ctx.documentation.listReports() });
      return true;
    }
    if (method === 'GET' && suffix === '/standards') {
      json(res, 200, { standards: ctx.documentation.listStandards() });
      return true;
    }
    if (method === 'POST' && suffix === '/verify') {
      const body = await bodyOf(req);
      const profile = String(body.profile ?? 'standard');
      if (!['fast', 'standard', 'strict'].includes(profile))
        throw new Error('profile must be fast, standard, or strict');
      json(res, 200, await ctx.documentation.verify(profile as DocumentationVerificationProfile));
      return true;
    }
    const planRun = suffix.match(/^\/plans\/([^/]+)\/run$/);
    if (method === 'POST' && planRun) {
      const body = await bodyOf(req);
      json(res, 200, {
        proposals: await ctx.documentation.runPlan(decodeURIComponent(planRun[1]), body.dryRun !== false),
      });
      return true;
    }
    const plan = suffix.match(/^\/plans\/([^/]+)$/);
    if (method === 'GET' && plan) {
      const item = ctx.documentation.getPlan(decodeURIComponent(plan[1]));
      json(res, item ? 200 : 404, item ?? { error: 'plan not found' });
      return true;
    }
    const actionMatch = suffix.match(/^\/proposals\/([^/]+)\/(approve|reject|apply)$/);
    if (method === 'POST' && actionMatch) {
      const id = decodeURIComponent(actionMatch[1]);
      const action = actionMatch[2];
      const result =
        action === 'apply'
          ? await ctx.documentation.applyProposal(id, actorOf(req))
          : await ctx.documentation.decideProposal(id, action === 'approve' ? 'approve' : 'reject', actorOf(req));
      json(res, 200, result);
      return true;
    }
    const proposal = suffix.match(/^\/proposals\/([^/]+)$/);
    if (method === 'GET' && proposal) {
      const item = ctx.documentation.getProposal(decodeURIComponent(proposal[1]));
      json(res, item ? 200 : 404, item ?? { error: 'proposal not found' });
      return true;
    }
  } catch (error) {
    json(res, 400, { error: error instanceof Error ? error.message : String(error) });
    return true;
  }
  return false;
}

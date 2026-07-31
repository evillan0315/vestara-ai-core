import type * as http from 'node:http';
import { AuditAction, logAudit } from '../audit-log';
import { requireRole } from '../auth';
import type { WorkspaceContext } from '../workspace-context';
import { actorOf, getActor, json, readBody } from './types';

export async function handlePlansRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/plans') {
    json(res, 200, { plans: await ctx.plans.list(ctx.runtime.getSession().fingerprint.id) });
    return true;
  }

  if (method === 'POST' && p === '/api/plans') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const goal = body.goal?.trim();
    if (!goal) {
      json(res, 400, { error: 'goal is required' });
      return true;
    }
    const actor = getActor(req, ctx);
    const result = await ctx.planningService.createPlan(goal, ctx.runtime.getSession());
    logAudit(
      ctx.audit,
      req,
      actor.id,
      actor.name,
      AuditAction.PLAN_CREATE,
      'plan',
      result.plan.id,
      `Goal: ${goal.slice(0, 200)}`,
    );
    json(res, 201, result);
    return true;
  }

  const planIdMatch = p.match(/^\/api\/plans\/([^/]+)$/);
  if (method === 'PUT' && planIdMatch) {
    const planId = decodeURIComponent(planIdMatch[1]);
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const plan = await ctx.plans.get(planId);
    if (!plan) {
      json(res, 404, { error: 'plan not found' });
      return true;
    }
    if (body.title !== undefined) plan.title = body.title;
    if (body.goal !== undefined) plan.goal = body.goal;
    if (body.status !== undefined) plan.status = body.status;
    plan.updatedAt = new Date().toISOString();
    await ctx.plans.save(plan);
    logAudit(
      ctx.audit,
      req,
      getActor(req, ctx).id,
      getActor(req, ctx).name,
      AuditAction.PLAN_UPDATE,
      'plan',
      planId,
      plan.title,
    );
    json(res, 200, { plan });
    return true;
  }

  if (method === 'DELETE' && planIdMatch) {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const planId = decodeURIComponent(planIdMatch[1]);
    const plan = await ctx.plans.get(planId);
    if (!plan) {
      json(res, 404, { error: 'plan not found' });
      return true;
    }
    await ctx.plans.delete(planId);
    logAudit(
      ctx.audit,
      req,
      getActor(req, ctx).id,
      getActor(req, ctx).name,
      AuditAction.PLAN_DELETE,
      'plan',
      planId,
      plan.title,
    );
    json(res, 200, { deleted: true });
    return true;
  }

  const planApproveMatch = p.match(/^\/api\/plans\/([^/]+)\/approve$/);
  if (method === 'POST' && planApproveMatch) {
    const planId = decodeURIComponent(planApproveMatch[1]);
    const plan = await ctx.planningService.updatePlanStatus(planId, 'approved');
    if (!plan) {
      json(res, 404, { error: 'plan not found' });
      return true;
    }
    json(res, 200, { plan });
    return true;
  }

  const planRecMatch = p.match(/^\/api\/plans\/([^/]+)\/recommendations\/?$/);
  if (method === 'GET' && planRecMatch) {
    const planId = decodeURIComponent(planRecMatch[1]);
    json(res, 200, {
      recommendations: await ctx.suggestionService.planRecommendations(planId, ctx.runtime.getSession()),
    });
    return true;
  }

  if (method === 'POST' && p === '/api/implement') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const planId = body.planId?.trim();
    if (!planId) {
      json(res, 400, { error: 'planId is required' });
      return true;
    }
    const result = await ctx.implementationService.implement(planId, ctx.runtime.getSession());
    logAudit(
      ctx.audit,
      req,
      getActor(req, ctx).id,
      getActor(req, ctx).name,
      AuditAction.IMPLEMENT_START,
      'plan',
      planId,
      `ChangeSet: ${result.changeSet.id}`,
    );
    json(res, 201, result);
    return true;
  }

  if (method === 'GET' && p === '/api/changesets') {
    json(res, 200, { changeSets: await ctx.changeSets.listByWorkspace(ctx.runtime.getSession().fingerprint.id) });
    return true;
  }

  const csMatch = p.match(/^\/api\/changesets\/([^/]+)$/);
  if (method === 'GET' && csMatch) {
    const id = decodeURIComponent(csMatch[1]);
    const cs = await ctx.changeSets.get(id);
    if (!cs) {
      json(res, 404, { error: 'change set not found' });
      return true;
    }
    json(res, 200, { changeSet: cs });
    return true;
  }

  if (method === 'POST' && p === '/api/implement/apply') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const csId = body.changeSetId?.trim();
    if (!csId) {
      json(res, 400, { error: 'changeSetId is required' });
      return true;
    }
    const cs = await ctx.implementationService.apply(csId, ctx.runtime.getSession());
    logAudit(
      ctx.audit,
      req,
      getActor(req, ctx).id,
      getActor(req, ctx).name,
      AuditAction.IMPLEMENT_APPLY,
      'changeset',
      csId,
      cs.title,
    );
    json(res, 200, { changeSet: cs });
    return true;
  }

  if (method === 'POST' && p === '/api/verify') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const changeSetId = body.changeSetId?.trim();
    if (!changeSetId) {
      json(res, 400, { error: 'changeSetId is required' });
      return true;
    }
    json(res, 200, await ctx.verificationService.verify(changeSetId, ctx.runtime.getSession()));
    return true;
  }

  if (method === 'GET' && p === '/api/verifications') {
    json(res, 200, { verifications: await ctx.verifications.listByWorkspace(ctx.runtime.getSession().fingerprint.id) });
    return true;
  }

  if (method === 'POST' && p === '/api/collab/submit') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    if (!body.changeSetId || !body.planId) {
      json(res, 400, { error: 'changeSetId and planId are required' });
      return true;
    }
    json(res, 201, {
      record: await ctx.collaborationService.submit(body.changeSetId, body.planId, ctx.runtime.getSession()),
    });
    return true;
  }

  if (method === 'POST' && p === '/api/collab/approve') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    if (!body.recordId) {
      json(res, 400, { error: 'recordId is required' });
      return true;
    }
    json(res, 200, { record: await ctx.collaborationService.approve(body.recordId, actorOf(req)) });
    return true;
  }

  if (method === 'POST' && p === '/api/collab/reject') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    if (!body.recordId) {
      json(res, 400, { error: 'recordId is required' });
      return true;
    }
    json(res, 200, {
      record: await ctx.collaborationService.reject(
        body.recordId,
        actorOf(req),
        body.reason?.trim() ?? 'Rejected via dashboard',
      ),
    });
    return true;
  }

  return false;
}

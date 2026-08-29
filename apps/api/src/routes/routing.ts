import type * as http from 'node:http';
import {
  type EngineeringAgentRole,
  type EngineeringCapability,
  type EngineeringRoutingSelection,
  getRoutingProfile,
  NoCompatibleRoutingCandidateError,
  type ProviderModelRef,
  ROUTING_PROFILES,
  RoutingAssignmentConflictError,
  type RoutingAssignmentStatus,
  RoutingConflictError,
  type RoutingProfileId,
} from '@vestara/provider-runtime';
import { requireRole } from '../auth';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

const roles: readonly EngineeringAgentRole[] = [
  'planner',
  'architect',
  'developer',
  'reviewer',
  'verifier',
  'documentation',
];

function isRole(value: unknown): value is EngineeringAgentRole {
  return typeof value === 'string' && roles.includes(value as EngineeringAgentRole);
}

function isModelRef(value: unknown): value is ProviderModelRef {
  if (!value || typeof value !== 'object') return false;
  const ref = value as Partial<ProviderModelRef>;
  return typeof ref.providerId === 'string' && typeof ref.modelId === 'string';
}

function isSelection(value: unknown): value is EngineeringRoutingSelection {
  if (!value || typeof value !== 'object') return false;
  const selection = value as Partial<EngineeringRoutingSelection>;
  if (typeof selection.profileId !== 'string' || !selection.roles || typeof selection.roles !== 'object') return false;
  return Object.entries(selection.roles).every(([role, ref]) => isRole(role) && isModelRef(ref));
}

const assignmentStatuses: readonly RoutingAssignmentStatus[] = ['assigned', 'running', 'paused', 'completed', 'failed'];

function isAssignmentStatus(value: unknown): value is RoutingAssignmentStatus {
  return typeof value === 'string' && assignmentStatuses.includes(value as RoutingAssignmentStatus);
}

function availableCandidate(ctx: WorkspaceContext, ref: ProviderModelRef) {
  return ctx.providerManager.routing.catalog
    .list(ctx.providerManager.routing.health)
    .find(
      (candidate) =>
        candidate.ref.providerId === ref.providerId &&
        candidate.ref.modelId === ref.modelId &&
        candidate.availability.available,
    );
}

export async function handleRoutingRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/routing/catalog') {
    json(res, 200, {
      profiles: ROUTING_PROFILES,
      candidates: ctx.providerManager.routing.catalog.list(ctx.providerManager.routing.health),
    });
    return true;
  }

  if (method === 'GET' && p === '/api/routing/selection') {
    json(res, 200, ctx.routingStore.get());
    return true;
  }

  if ((method === 'PATCH' || method === 'PUT') && p === '/api/routing/selection') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const body = JSON.parse((await readBody(req)) || '{}') as {
      selection?: unknown;
      expectedRevision?: unknown;
      updatedByClientId?: unknown;
    };
    if (!isSelection(body.selection) || !Number.isInteger(body.expectedRevision)) {
      json(res, 400, { error: 'selection and integer expectedRevision are required' });
      return true;
    }
    try {
      const updated = ctx.routingStore.update(
        body.selection,
        body.expectedRevision as number,
        typeof body.updatedByClientId === 'string' ? body.updatedByClientId : 'workspace-ui',
      );
      await ctx.kernel.eventBus.emit({
        type: 'routing.selection-overridden',
        source: 'routing-api',
        payload: { revision: updated.revision, updatedByClientId: updated.updatedByClientId },
      });
      json(res, 200, updated);
    } catch (error) {
      if (error instanceof RoutingConflictError) {
        json(res, 409, {
          error: error.message,
          expectedRevision: error.expectedRevision,
          current: error.current,
        });
      } else {
        json(res, 400, { error: error instanceof Error ? error.message : 'Unable to update routing' });
      }
    }
    return true;
  }

  if (method === 'POST' && p === '/api/routing/preview') {
    const body = JSON.parse((await readBody(req)) || '{}') as {
      role?: unknown;
      agentId?: unknown;
      taskId?: unknown;
      profileId?: unknown;
      requiredCapabilities?: unknown;
      implementationProviderId?: unknown;
      source?: unknown;
    };
    if (!isRole(body.role) || typeof body.agentId !== 'string') {
      json(res, 400, { error: 'role and agentId are required' });
      return true;
    }
    try {
      const selection = ctx.routingStore.get().selection;
      const profileId = (typeof body.profileId === 'string' ? body.profileId : selection.profileId) as RoutingProfileId;
      const profile = getRoutingProfile(profileId);
      const selectedRef = selection.roles[body.role];
      const rolePolicy =
        profile.policy.roles?.[body.role] ??
        (body.role === 'verifier' || body.role === 'reviewer'
          ? profile.policy.verification
          : profile.policy.implementation);
      const policy = {
        ...profile.policy,
        roles: { ...profile.policy.roles, [body.role]: { ...rolePolicy, preferred: selectedRef } },
      };
      const exclude =
        policy.constraints.requireIndependentVerifier &&
        body.role === 'verifier' &&
        typeof body.implementationProviderId === 'string'
          ? ctx.providerManager.routing.catalog
              .list(ctx.providerManager.routing.health)
              .filter((candidate) => candidate.ref.providerId === body.implementationProviderId)
              .map((candidate) => candidate.ref)
          : undefined;
      const resolution = await ctx.providerManager.routing.resolve({
        taskId: typeof body.taskId === 'string' ? body.taskId : undefined,
        role: body.role,
        agentId: body.agentId,
        requiredCapabilities: Array.isArray(body.requiredCapabilities)
          ? (body.requiredCapabilities.filter(
              (value): value is EngineeringCapability => typeof value === 'string',
            ) as EngineeringCapability[])
          : undefined,
        policy,
        source: body.source === 'console' ? 'console' : body.source === 'workspace-ui' ? 'workspace-ui' : 'automatic',
        exclude,
      });
      json(res, 200, resolution);
    } catch (error) {
      if (error instanceof NoCompatibleRoutingCandidateError) {
        json(res, 422, { error: error.message, rejectedCandidates: error.rejectedCandidates });
      } else {
        json(res, 400, { error: error instanceof Error ? error.message : 'Unable to resolve routing' });
      }
    }
    return true;
  }

  if (method === 'GET' && p === '/api/routing/assignments') {
    json(res, 200, { assignments: ctx.routingAssignments.list() });
    return true;
  }

  if (method === 'POST' && p === '/api/routing/assignments') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const body = JSON.parse((await readBody(req)) || '{}') as {
      taskId?: unknown;
      role?: unknown;
      agentId?: unknown;
      route?: unknown;
      requestedByClientId?: unknown;
    };
    if (
      typeof body.taskId !== 'string' ||
      !isRole(body.role) ||
      typeof body.agentId !== 'string' ||
      !isModelRef(body.route)
    ) {
      json(res, 400, { error: 'taskId, role, agentId, and provider-scoped route are required' });
      return true;
    }
    if (!availableCandidate(ctx, body.route)) {
      json(res, 422, { error: 'Selected provider/model is unavailable' });
      return true;
    }
    try {
      const assignment = ctx.routingAssignments.assign({
        taskId: body.taskId,
        role: body.role,
        agentId: body.agentId,
        route: body.route,
        assignedByClientId: typeof body.requestedByClientId === 'string' ? body.requestedByClientId : 'workspace-ui',
      });
      await ctx.kernel.eventBus.emit({
        type: 'routing.assignment-changed',
        source: 'routing-api',
        payload: { taskId: assignment.taskId, revision: assignment.revision, operation: 'assigned' },
      });
      json(res, 201, assignment);
    } catch (error) {
      json(res, 409, { error: error instanceof Error ? error.message : 'Unable to assign task' });
    }
    return true;
  }

  const assignmentStatusMatch = p.match(/^\/api\/routing\/assignments\/([^/]+)\/status$/);
  if (method === 'PATCH' && assignmentStatusMatch) {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const taskId = decodeURIComponent(assignmentStatusMatch[1]);
    const body = JSON.parse((await readBody(req)) || '{}') as { status?: unknown; expectedRevision?: unknown };
    if (!isAssignmentStatus(body.status) || !Number.isInteger(body.expectedRevision)) {
      json(res, 400, { error: 'status and integer expectedRevision are required' });
      return true;
    }
    try {
      const assignment = ctx.routingAssignments.updateStatus(taskId, body.status, body.expectedRevision as number);
      json(res, 200, assignment);
    } catch (error) {
      routingAssignmentError(res, error);
    }
    return true;
  }

  const sideEffectMatch = p.match(/^\/api\/routing\/assignments\/([^/]+)\/side-effects$/);
  if (method === 'POST' && sideEffectMatch) {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const taskId = decodeURIComponent(sideEffectMatch[1]);
    const body = JSON.parse((await readBody(req)) || '{}') as { expectedRevision?: unknown };
    if (!Number.isInteger(body.expectedRevision)) {
      json(res, 400, { error: 'integer expectedRevision is required' });
      return true;
    }
    try {
      const assignment = ctx.routingAssignments.recordSideEffect(taskId, body.expectedRevision as number);
      json(res, 200, assignment);
    } catch (error) {
      routingAssignmentError(res, error);
    }
    return true;
  }

  const reassignMatch = p.match(/^\/api\/routing\/assignments\/([^/]+)\/reassign$/);
  if (method === 'POST' && reassignMatch) {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const taskId = decodeURIComponent(reassignMatch[1]);
    const body = JSON.parse((await readBody(req)) || '{}') as {
      expectedRevision?: unknown;
      agentId?: unknown;
      route?: unknown;
      requestedByClientId?: unknown;
      reason?: unknown;
      approved?: unknown;
    };
    if (
      !Number.isInteger(body.expectedRevision) ||
      typeof body.agentId !== 'string' ||
      !isModelRef(body.route) ||
      typeof body.reason !== 'string'
    ) {
      json(res, 400, { error: 'expectedRevision, agentId, route, and reason are required' });
      return true;
    }
    if (!availableCandidate(ctx, body.route)) {
      json(res, 422, { error: 'Selected provider/model is unavailable' });
      return true;
    }
    try {
      const result = ctx.routingAssignments.reassign({
        taskId,
        expectedRevision: body.expectedRevision as number,
        agentId: body.agentId,
        route: body.route,
        requestedByClientId: typeof body.requestedByClientId === 'string' ? body.requestedByClientId : 'workspace-ui',
        reason: body.reason,
        approved: body.approved === true,
      });
      await ctx.kernel.eventBus.emit({
        type: result.status === 'approval-required' ? 'routing.execution-paused' : 'routing.assignment-changed',
        source: 'routing-api',
        payload: {
          taskId,
          revision: result.assignment.revision,
          status: result.status,
          reasonCodes: result.reasonCodes,
        },
      });
      json(res, result.status === 'approval-required' ? 202 : 200, result);
    } catch (error) {
      routingAssignmentError(res, error);
    }
    return true;
  }

  return false;
}

function routingAssignmentError(res: http.ServerResponse, error: unknown): void {
  if (error instanceof RoutingAssignmentConflictError) {
    json(res, 409, { error: error.message, expectedRevision: error.expectedRevision, current: error.current });
  } else {
    json(res, 400, { error: error instanceof Error ? error.message : 'Routing assignment operation failed' });
  }
}

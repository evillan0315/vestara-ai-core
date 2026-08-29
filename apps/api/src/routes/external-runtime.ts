/**
 * External runtime routes — read-oriented observation of external coding-agent
 * runtimes (OpenCode, Claude Code, OpenAI Codex).
 */

import type * as http from 'node:http';
import type { ExternalRuntimeService } from '../external-runtime/service';
import type { WorkspaceContext } from '../workspace-context';
import { json } from './types';

const services = new WeakMap<WorkspaceContext, ExternalRuntimeService>();

export function registerExternalRuntimeService(ctx: WorkspaceContext, service: ExternalRuntimeService): void {
  services.set(ctx, service);
}

export function externalRuntimeService(ctx: WorkspaceContext): ExternalRuntimeService | null {
  return services.get(ctx) ?? null;
}

export async function handleExternalRuntimeRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  const url = new URL(req.url || '', 'http://127.0.0.1');
  const service = externalRuntimeService(ctx);
  if (!service) return false;

  if (method === 'GET' && p === '/api/agents/workforce') {
    json(res, 200, await service.workforce());
    return true;
  }

  if (method === 'GET' && p === '/api/external-runtime/runtimes') {
    json(res, 200, { runtimes: service.listInstances() });
    return true;
  }

  if (method === 'POST' && p === '/api/external-runtime/discover') {
    json(res, 200, { runtimes: await service.discoverNow() });
    return true;
  }

  if (method === 'GET' && p === '/api/external-runtime/sessions') {
    const status = url.searchParams.get('status') ?? undefined;
    const sessions = await service.listSessions({
      status: status as 'idle' | 'running' | 'completed' | 'failed' | 'aborted' | 'compacted' | 'unknown',
      limit: Number(url.searchParams.get('limit') ?? 100),
    });
    json(res, 200, { sessions });
    return true;
  }

  const sessionMatch = p.match(/^\/api\/external-runtime\/sessions\/([^/]+)(\/[^/]+)?$/);
  if (method === 'GET' && sessionMatch) {
    const sessionId = decodeURIComponent(sessionMatch[1]);
    const sub = sessionMatch[2]?.replace(/^\//, '');
    switch (sub) {
      case 'timeline':
        json(res, 200, await service.sessionTimeline(sessionId));
        return true;
      case 'runtime-snapshot':
        json(res, 200, { snapshot: await service.sessionRuntimeSnapshot(sessionId) });
        return true;
      case undefined: {
        const session = await service.getSession(sessionId);
        if (!session) {
          json(res, 404, { error: 'session not found' });
          return true;
        }
        json(res, 200, { session });
        return true;
      }
      default:
        json(res, 404, { error: 'unknown session subresource' });
        return true;
    }
  }

  const instanceMatch = p.match(/^\/api\/external-runtime\/runtimes\/([^/]+)(\/[^/]+)?$/);
  if (method === 'GET' && instanceMatch) {
    const instanceId = decodeURIComponent(instanceMatch[1]);
    const sub = instanceMatch[2]?.replace(/^\//, '');
    switch (sub) {
      case undefined: {
        const instance = service.registry.getInstance(instanceId);
        if (!instance) {
          json(res, 404, { error: 'runtime not found' });
          return true;
        }
        json(res, 200, { instance });
        return true;
      }
      case 'health':
        json(res, 200, { health: await service.health(instanceId) });
        return true;
      case 'configuration':
        json(res, 200, { configuration: await service.configuration(instanceId) });
        return true;
      case 'capabilities':
        json(res, 200, { capabilities: await service.capabilities(instanceId) });
        return true;
      case 'drift':
        json(res, 200, { drift: await service.configurationDrift(instanceId) });
        return true;
      case 'agents':
      case 'skills':
      case 'instructions':
      case 'commands':
      case 'plugins':
      case 'mcp':
      case 'providers':
      case 'models': {
        const items = await service.intelligence(instanceId, sub as never);
        json(res, 200, { [sub]: items });
        return true;
      }
      case 'permissions':
        json(res, 200, { permissions: await service.derivedPermissions(instanceId) });
        return true;
      default:
        json(res, 404, { error: 'unknown runtime subresource' });
        return true;
    }
  }

  return false;
}

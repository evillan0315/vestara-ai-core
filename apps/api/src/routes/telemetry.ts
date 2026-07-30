import * as http from 'node:http';
import type { WorkspaceContext } from '../workspace-context';
import { json } from './types';

export async function handleTelemetryRoute(method: string, p: string, req: http.IncomingMessage, res: http.ServerResponse, ctx: WorkspaceContext): Promise<boolean> {
  if (method === 'GET' && p === '/api/telemetry') {
    const snap = ctx.telemetry.snapshot();
    json(res, 200, snap);
    return true;
  }

  if (method === 'GET' && p === '/api/telemetry/agents') {
    json(res, 200, { agents: ctx.telemetry.getAllAgents() });
    return true;
  }

  if (method === 'GET' && p === '/api/telemetry/events') {
    const limit = req.url ? Number(new URL(req.url, 'http://127.0.0.1').searchParams.get('limit') ?? 50) : 50;
    json(res, 200, { events: ctx.telemetry.getEvents(limit), total: ctx.telemetry.getEventCount() });
    return true;
  }

  return false;
}

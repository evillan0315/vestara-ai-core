import * as fs from 'node:fs';
import type * as http from 'node:http';
import * as path from 'node:path';
import { requireRole } from '../auth';
import type { WorkspaceContext } from '../workspace-context';
import { getActor, json, readBody } from './types';

export interface MorningBriefing {
  id: string;
  executedAt: string;
  createdAt: string;
  summary: string;
  details: {
    repoHealth: string;
    workspaceStatus: string;
    activity: string;
    fullContent?: string;
  };
  actor?: { id: string; name: string };
}

function briefingsDir(ctx: WorkspaceContext): string {
  return path.join(ctx.workspaceDir, 'morning-briefings');
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function listBriefings(ctx: WorkspaceContext): MorningBriefing[] {
  const dir = briefingsDir(ctx);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const briefings: MorningBriefing[] = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      briefings.push(JSON.parse(raw) as MorningBriefing);
    } catch {}
  }
  briefings.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
  return briefings;
}

function writeBriefing(ctx: WorkspaceContext, briefing: MorningBriefing) {
  const dir = briefingsDir(ctx);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, `${briefing.id}.json`), JSON.stringify(briefing, null, 2), 'utf8');
}

export async function handleMorningBriefingsRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/morning-briefings/latest') {
    const all = listBriefings(ctx);
    json(res, 200, { briefing: all[0] ?? null });
    return true;
  }

  if (method === 'GET' && p === '/api/morning-briefings') {
    const all = listBriefings(ctx);
    const limitParam = new URL(req.url ?? '', 'http://localhost').searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 100) : 20;
    json(res, 200, { briefings: all.slice(0, limit), total: all.length });
    return true;
  }

  if (method === 'GET' && p.startsWith('/api/morning-briefings/')) {
    const m = p.match(/^\/api\/morning-briefings\/([^/]+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (id === 'latest') return false;
      const all = listBriefings(ctx);
      const found = all.find((b) => b.id === id);
      if (!found) {
        json(res, 404, { error: 'Briefing not found' });
        return true;
      }
      json(res, 200, { briefing: found });
      return true;
    }
  }

  if (method === 'POST' && p === '/api/morning-briefings') {
    if (!requireRole(req, ctx, 'editor', res)) return true;
    const actor = getActor(req, ctx);
    try {
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      const now = new Date().toISOString();
      const executedAt = body.executedAt || now;
      const briefing: MorningBriefing = {
        id: body.id || `briefing-${Date.now()}`,
        executedAt,
        createdAt: now,
        summary: body.summary || 'Morning briefing — vestara-ai-core',
        details: {
          repoHealth: body.details?.repoHealth || body.repoHealth || '',
          workspaceStatus: body.details?.workspaceStatus || body.workspaceStatus || '',
          activity: body.details?.activity || body.activity || '',
          fullContent: body.details?.fullContent || body.fullContent || body.content || '',
        },
        actor: { id: actor.id, name: actor.name },
      };
      writeBriefing(ctx, briefing);

      // Also publish to ActivityRoom as system event so it appears in M11C stream as provenance
      try {
        const { getActivityRoom } = await import('../activity-room.js');
        const room = getActivityRoom();
        // Append via activity-room store directly is gated, so publish via ctx.publish which fans to WS
        ctx.publish({
          id: briefing.id,
          timestamp: briefing.executedAt,
          category: 'system',
          type: 'morning-briefing',
          actor: { id: 'system', name: 'Morning Briefing', type: 'system' },
          resource: { type: 'briefing', id: briefing.id, name: 'Morning Briefing' },
          message: briefing.summary,
          metadata: { briefingId: briefing.id, executedAt: briefing.executedAt },
        } as any);
        // Best-effort store to M11 activity as well (if room available)
        try {
          if ((room as any)?.store?.append) {
            // Append a lightweight activity record for M11A projection (non-blocking)
            room.store
              .append?.({
                kind: 'system-event',
                workflowId: 'morning-briefing',
                actor: { type: 'system', id: 'morning-briefing', displayName: 'Morning Briefing' },
                content: briefing.summary,
                timestamp: briefing.executedAt,
              } as any)
              .catch(() => {});
          }
        } catch {}
      } catch {}

      json(res, 201, { briefing });
    } catch (err: any) {
      json(res, 500, { error: err.message });
    }
    return true;
  }

  return false;
}

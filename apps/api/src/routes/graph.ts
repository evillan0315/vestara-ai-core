/**
 * Engineering Graph routes — the canonical navigation/traceability layer.
 *
 *   GET  /api/graph/stats
 *   GET  /api/graph/entities?kind=&q=&limit=
 *   GET  /api/graph/entity/:id
 *   GET  /api/graph/relationships?entity=&direction=&type=&limit=
 *   GET  /api/graph/backlinks?entity=&limit=
 *   GET  /api/graph/search?q=&kind=&limit=
 *   GET  /api/graph/explore?center=&depth=
 *   GET  /api/graph/dependencies?entity=&depth=
 *   GET  /api/graph/dependents?entity=&depth=
 *   GET  /api/graph/trace?entity=
 *   GET  /api/graph/timeline?entity=
 *   GET  /api/graph/insights
 *   GET  /api/graph/health
 *   POST /api/graph/analyze
 */

import type * as http from 'node:http';
import { createWorkspaceCommand, isSettingsWorkspaceCommand } from '@vestara/configuration';
import { isValidEntityId } from '@vestara/engineering-graph';
import { EngineeringGraphService } from '../graph/service';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

const services = new WeakMap<WorkspaceContext, EngineeringGraphService>();

export function serviceFor(ctx: WorkspaceContext): EngineeringGraphService {
  let service = services.get(ctx);
  if (!service) {
    service = new EngineeringGraphService(ctx);
    services.set(ctx, service);
  }
  return service;
}

export async function handleGraphRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  const url = new URL(req.url || '', 'http://127.0.0.1');
  const svc = serviceFor(ctx);

  if (method === 'GET' && p === '/api/graph/stats') {
    json(res, 200, { stats: await svc.stats() });
    return true;
  }

  if (method === 'GET' && p === '/api/graph/entities') {
    json(
      res,
      200,
      await svc.entities({
        kind: url.searchParams.get('kind') ?? 'any',
        q: url.searchParams.get('q') ?? undefined,
        limit: Number(url.searchParams.get('limit') ?? 200),
      }),
    );
    return true;
  }

  const entityMatch = p.match(/^\/api\/graph\/entity\/(.+)$/);
  if (method === 'GET' && entityMatch) {
    const id = decodeURIComponent(entityMatch[1]);
    const entity = await svc.entity(id);
    if (!entity) {
      json(res, 404, { error: 'entity not found' });
      return true;
    }
    const [relationships, backlinks] = await Promise.all([svc.relationships(id, {}), svc.backlinks(id)]);
    json(res, 200, { entity, relationships, backlinks });
    return true;
  }

  if (method === 'GET' && p === '/api/graph/relationships') {
    const id = url.searchParams.get('entity') ?? '';
    if (!isValidEntityId(id)) {
      json(res, 400, { error: 'entity is required' });
      return true;
    }
    json(res, 200, {
      relationships: await svc.relationships(id, {
        direction: (url.searchParams.get('direction') as 'out' | 'in' | 'both') ?? 'both',
        type: url.searchParams.get('type') ?? undefined,
        limit: Number(url.searchParams.get('limit') ?? 100),
      }),
    });
    return true;
  }

  if (method === 'GET' && p === '/api/graph/backlinks') {
    const id = url.searchParams.get('entity') ?? '';
    if (!isValidEntityId(id)) {
      json(res, 400, { error: 'entity is required' });
      return true;
    }
    json(res, 200, { backlinks: await svc.backlinks(id, Number(url.searchParams.get('limit') ?? 100)) });
    return true;
  }

  if (method === 'GET' && p === '/api/graph/search') {
    const q = url.searchParams.get('q') ?? '';
    if (!q.trim()) {
      json(res, 200, { results: [] });
      return true;
    }
    json(res, 200, {
      results: await svc.search(
        q,
        url.searchParams.get('kind') ?? undefined,
        Number(url.searchParams.get('limit') ?? 50),
      ),
    });
    return true;
  }

  if (method === 'GET' && p === '/api/graph/explore') {
    const center = url.searchParams.get('center') ?? '';
    if (!center) {
      json(res, 400, { error: 'center is required' });
      return true;
    }
    json(res, 200, await svc.explore(center, Number(url.searchParams.get('depth') ?? 2)));
    return true;
  }

  if (method === 'GET' && p === '/api/graph/dependencies') {
    const id = url.searchParams.get('entity') ?? '';
    if (!id) {
      json(res, 400, { error: 'entity is required' });
      return true;
    }
    json(res, 200, { dependencies: await svc.dependencies(id, Number(url.searchParams.get('depth') ?? 6)) });
    return true;
  }

  if (method === 'GET' && p === '/api/graph/dependents') {
    const id = url.searchParams.get('entity') ?? '';
    if (!id) {
      json(res, 400, { error: 'entity is required' });
      return true;
    }
    json(res, 200, { dependents: await svc.dependents(id, Number(url.searchParams.get('depth') ?? 6)) });
    return true;
  }

  if (method === 'GET' && p === '/api/graph/trace') {
    const id = url.searchParams.get('entity') ?? '';
    if (!id) {
      json(res, 400, { error: 'entity is required' });
      return true;
    }
    const trace = await svc.trace(id);
    if (!trace) {
      json(res, 404, { error: 'entity not found' });
      return true;
    }
    json(res, 200, trace);
    return true;
  }

  if (method === 'GET' && p === '/api/graph/timeline') {
    const id = url.searchParams.get('entity') ?? '';
    if (!id) {
      json(res, 400, { error: 'entity is required' });
      return true;
    }
    json(res, 200, { timeline: await svc.timelineFor(id) });
    return true;
  }

  if (method === 'GET' && p === '/api/graph/insights') {
    json(res, 200, { insights: await svc.insights() });
    return true;
  }

  if (method === 'GET' && p === '/api/graph/health') {
    json(res, 200, { health: await svc.health() });
    return true;
  }

  if (method === 'GET' && p === '/api/graph/events') {
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 200), 1000);
    const after = url.searchParams.get('after') ? Number(url.searchParams.get('after')) : undefined;
    json(res, 200, { events: await svc.events(limit, after) });
    return true;
  }

  if (method === 'GET' && p === '/api/graph/history') {
    const id = url.searchParams.get('entity') ?? '';
    if (!id) {
      json(res, 400, { error: 'entity is required' });
      return true;
    }
    json(res, 200, { history: await svc.history(id) });
    return true;
  }

  if (method === 'GET' && p === '/api/graph/at') {
    const time = url.searchParams.get('time');
    if (!time) {
      json(res, 400, { error: 'time is required' });
      return true;
    }
    const parsed = new Date(time);
    if (Number.isNaN(parsed.getTime())) {
      json(res, 400, { error: 'invalid time' });
      return true;
    }
    json(res, 200, await svc.stateAt(parsed));
    return true;
  }

  if (method === 'GET' && p === '/api/graph/diff') {
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (!from || !to) {
      json(res, 400, { error: 'from and to are required' });
      return true;
    }
    json(res, 200, await svc.stateDiff(from, to));
    return true;
  }

  if (method === 'GET' && p === '/api/graph/replay') {
    const id = url.searchParams.get('entity') ?? undefined;
    json(res, 200, { events: await svc.replay(id) });
    return true;
  }

  if (method === 'GET' && p === '/api/graph/store') {
    const info = await svc.storeInfo();
    const events = await svc.events(1);
    json(res, 200, {
      persistence: 'memory',
      warning: 'Engineering history is session-only and will be lost when the API runtime stops.',
      eventCount: info.events,
      latestSequence: events[0]?.seq ?? 0,
      oldestRetainedAt: (await svc.replay())[0]?.at ?? null,
      checkpointCount: info.checkpoints.length,
      checkpoints: info.checkpoints,
      checkpointInterval: 2000,
      checkpointRetention: 10,
      eventSchemaVersion: 1,
      workspaceStoreIdentity: ctx.runtime.getSession().fingerprint.id,
    });
    return true;
  }

  if (method === 'POST' && p === '/api/graph/store/integrity') {
    json(res, 200, await svc.verifyStoreIntegrity());
    return true;
  }

  if (method === 'POST' && p === '/api/graph/store/checkpoint') {
    json(res, 200, { checkpoint: await svc.createCheckpoint() });
    return true;
  }

  if (method === 'POST' && p === '/api/graph/rebuild') {
    const raw = await readBody(req);
    const supplied = raw ? (JSON.parse(raw) as unknown) : null;
    const command =
      isSettingsWorkspaceCommand(supplied) &&
      supplied.type === 'graph.rebuild' &&
      supplied.workspaceId === ctx.runtime.getSession().fingerprint.id &&
      supplied.source === (req.headers['x-vestara-source'] === 'cli' ? 'cli' : 'workspace-ui')
        ? supplied
        : createWorkspaceCommand({
            workspaceId: ctx.runtime.getSession().fingerprint.id,
            source: req.headers['x-vestara-source'] === 'cli' ? 'cli' : 'workspace-ui',
            type: 'graph.rebuild',
          });
    ctx.publish({
      id: `evt-${command.commandId}-requested`,
      timestamp: new Date().toISOString(),
      category: 'system',
      type: 'command-requested',
      actor: { id: command.source, name: command.source, type: 'user' },
      resource: { type: 'command', id: command.commandId, name: command.type },
      message: `${command.source} requested engineering graph rebuild`,
      metadata: {
        commandId: command.commandId,
        correlationId: command.correlationId,
        workspaceId: command.workspaceId,
        source: command.source,
      },
    });
    await svc.recordCommand(command, 'requested', `${command.source} requested engineering graph rebuild`);
    const result = await svc.refresh();
    ctx.publish({
      id: `evt-${command.commandId}-completed`,
      timestamp: new Date().toISOString(),
      category: 'system',
      type: 'execution-completed',
      actor: { id: 'runtime', name: 'Workspace Runtime', type: 'system' },
      resource: { type: 'command', id: command.commandId, name: command.type },
      message: 'Engineering graph rebuild completed',
      metadata: {
        commandId: command.commandId,
        correlationId: command.correlationId,
        workspaceId: command.workspaceId,
        source: command.source,
        result,
      },
    });
    await svc.recordCommand(command, 'completed', 'Engineering graph rebuild completed', result);
    json(res, 200, { command, result });
    return true;
  }

  if (method === 'POST' && p === '/api/graph/query') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    try {
      json(res, 200, await svc.queryGraph(body));
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : 'Graph query failed' });
    }
    return true;
  }

  if (method === 'POST' && p === '/api/graph/analyze') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const provider = ctx.kernel.providerManager?.getProvider('opencode') ?? null;
    if (!provider) {
      json(res, 503, { error: 'AI provider not available' });
      return true;
    }
    const question = (body.question ?? 'Explain how everything in this engineering graph is connected.').trim();
    const entityId = body.entity;
    const context: string[] = [];

    const stats = await svc.stats();
    context.push(
      `Graph: ${stats.nodes} entities, ${stats.edges} relationships. Kinds: ${JSON.stringify(stats.kinds)}.`,
    );
    const insights = await svc.insights();
    context.push(`Insights: ${JSON.stringify(insights.slice(0, 8))}`);

    if (entityId) {
      const entity = await svc.entity(entityId);
      if (entity) {
        const [rels, backlinks, timeline] = await Promise.all([
          svc.relationships(entityId, { limit: 40 }),
          svc.backlinks(entityId, 20),
          svc.timelineFor(entityId),
        ]);
        context.push(
          `Entity ${entity.id} (${entity.kind}, status ${entity.status ?? '?'}): ${entity.label}`,
          `Outgoing: ${JSON.stringify(rels.slice(0, 20).map((r) => `${r.fromLabel} ${r.type} ${r.toLabel}`))}`,
          `Backlinks: ${JSON.stringify(backlinks.slice(0, 10).map((r) => `${r.fromLabel} ${r.type}`))}`,
          `Timeline: ${JSON.stringify(timeline.slice(0, 10).map((t) => `${t.timestamp} ${t.actor} ${t.message}`))}`,
        );
      }
    }

    const systemPrompt = [
      'You are Vestara, an engineering graph analyst.',
      'Answer using only the provided graph context. Do not invent entities.',
      'Use short markdown. Mention concrete entity ids when relevant.',
    ].join('\n');

    try {
      const result = await provider.complete({
        model: body.model || 'nemotron-3-ultra-free',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Engineering graph context:\n"""\n${context.join('\n').slice(0, 14000)}\n"""\n\nQuestion: ${question}`,
          },
        ],
        temperature: 0.3,
        maxTokens: 2048,
      });
      json(res, 200, { answer: result.content || 'No response.' });
    } catch (error) {
      json(res, 500, { error: error instanceof Error ? error.message : 'Graph analysis failed' });
    }
    return true;
  }

  return false;
}

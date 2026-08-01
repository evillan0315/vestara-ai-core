/**
 * HTTP + WebSocket gateway for the Workspace UI.
 * Routes are delegated to src/routes/*.ts files.
 */

import * as http from 'node:http';
import type { WorkspaceEvent, WsClientMessage, WsServerMessage } from '@vestara/events';
import { WebSocket, WebSocketServer } from 'ws';
import { handleActivityRoute } from './routes/activity';
import { handleAgentsRoute } from './routes/agents';
import { handleAuthRoute } from './routes/auth';
import { handleChatRoute } from './routes/chat';
import { handleDiagnosticsRoute } from './routes/diagnostics';
import { handleDocsRoute } from './routes/docs';
import { handleDocumentationRoute } from './routes/documentation';
import { handleExecutionRoute } from './routes/execution';
import { featureRequests, handleFeatureRequestsRoute } from './routes/feature-requests';
import { handleGraphRoute } from './routes/graph';
import { handleHostRoute } from './routes/host';
import { CORS, json } from './routes/index';
import { handleMemoryRoute } from './routes/memory';
import { handleMilestonesRoute } from './routes/milestones';
import { handleMiscRoute } from './routes/misc';
import { handleNotificationsRoute } from './routes/notifications';
import { handlePlansRoute } from './routes/plans';
import { handleProjectsRoute } from './routes/projects';
import { handleRoutingRoute } from './routes/routing';
import { handleSchedulesRoute } from './routes/schedules';
import { handleSessionsRoute } from './routes/sessions';
import { handleTeamsRoute } from './routes/teams';
import { handleTelemetryRoute } from './routes/telemetry';
import { handleWorkspaceRoute } from './routes/workspace';
import type { WorkspaceContext } from './workspace-context';

export type ApiServer = http.Server & { broadcast: (event: WorkspaceEvent) => void };

export function createServer(ctx: WorkspaceContext, port: number, activityService?: any): ApiServer {
  const clients = new Set<WebSocket>();

  if (ctx.orchestrator) {
    ctx.orchestrator.setOnComplete((exSession) => {
      if (exSession.status === 'completed' && exSession.goal) {
        const goalTitle = exSession.goal.split(':')[0].trim();
        const req = featureRequests.find(
          (r: any) => r.title === goalTitle || `${r.title}: ${r.description || r.title}` === exSession.goal,
        );
        if (req && req.status !== 'completed') {
          req.status = 'completed';
          req.updatedAt = new Date().toISOString();
          if (ctx.milestones)
            ctx.milestones.updateMilestone(`FR-${req.id.replace('req-', '')}`, { status: 'completed' });
        }
      }
    });
  }

  if (activityService?.onEvent) {
    activityService.onEvent((domainEvent: WorkspaceEvent) => {
      const raw = JSON.stringify({ op: 'event', event: domainEvent } as WsServerMessage);
      for (const ws of clients) {
        if (ws.readyState === WebSocket.OPEN)
          try {
            ws.send(raw);
          } catch {}
      }
    });
  }

  interface LegacyEvent {
    id: string;
    type: string;
    actor: { id: string; name: string; type: 'user' | 'agent' | 'system' };
    sessionId?: string;
    artifactId?: string;
    message?: string;
    timestamp: string;
    payload?: unknown;
  }

  const broadcast = (legacy: LegacyEvent): void => {
    const event: WorkspaceEvent = {
      id: legacy.id,
      timestamp: legacy.timestamp,
      category: (legacy.type?.split('.')[0] as any) ?? 'system',
      type: legacy.type as any,
      actor: legacy.actor,
      resource: {
        type: legacy.artifactId ? 'artifact' : legacy.sessionId ? 'session' : 'system',
        id: legacy.artifactId ?? legacy.sessionId ?? 'unknown',
        name: legacy.message ?? legacy.type,
      },
      message: legacy.message ?? legacy.type,
      metadata: (legacy.payload as Record<string, unknown>) ?? {},
    };
    const raw = JSON.stringify({ op: 'event', event } as WsServerMessage);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN)
        try {
          ws.send(raw);
        } catch {}
    }
    activityService?.emitDirect(event).catch(() => {});
  };

  const server = http.createServer(async (req, res) => {
    res.on('error', () => {});
    if (!req.url || !req.method) {
      json(res, 400, { error: 'bad request' });
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, CORS);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const p = url.pathname;
    const method = req.method.toUpperCase();

    try {
      if (method === 'GET' && p === '/api/health') {
        json(res, 200, {
          status: 'ok',
          repoPath: ctx.repoPath,
          workspaceDir: ctx.workspaceDir,
          workspaceStatus: ctx.runtime.currentStatus,
          time: new Date().toISOString(),
        });
        return;
      }
      if (await handleMiscRoute(method, p, req, res, ctx, port, url)) return;
      if (await handleDiagnosticsRoute(method, p, req, res, ctx)) return;
      if (await handleExecutionRoute(method, p, req, res, ctx)) return;
      if (await handleGraphRoute(method, p, req, res, ctx)) return;
      if (await handleHostRoute(method, p, req, res, ctx)) return;
      if (await handleDocsRoute(method, p, req, res, ctx)) return;
      if (await handleDocumentationRoute(method, p, req, res, ctx)) return;
      if (await handleAuthRoute(method, p, req, res, ctx, port)) return;
      if (await handleWorkspaceRoute(method, p, req, res, ctx)) return;
      if (await handleRoutingRoute(method, p, req, res, ctx)) return;
      if (await handleSessionsRoute(method, p, req, res, ctx, port)) return;
      if (await handleAgentsRoute(method, p, req, res, ctx)) return;
      if (await handleTeamsRoute(method, p, req, res, ctx)) return;
      if (await handleSchedulesRoute(method, p, req, res, ctx)) return;
      if (await handleMilestonesRoute(method, p, req, res, ctx, port)) return;
      if (await handleFeatureRequestsRoute(method, p, req, res, ctx)) return;
      if (await handlePlansRoute(method, p, req, res, ctx)) return;
      if (await handleProjectsRoute(method, p, req, res, ctx)) return;
      if (await handleChatRoute(method, p, req, res, ctx)) return;
      if (await handleActivityRoute(method, p, req, res, ctx)) return;
      if (await handleNotificationsRoute(method, p, req, res, ctx)) return;
      if (await handleMemoryRoute(method, p, req, res, ctx, url)) return;
      if (await handleTelemetryRoute(method, p, req, res, ctx)) return;

      json(res, 404, { error: 'not found' });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : 'internal error' });
    }
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    clients.add(ws);
    wsSend(ws, {
      op: 'event',
      event: {
        id: `evt-hello-${Date.now()}`,
        type: 'system.heartbeat',
        actor: { id: 'system', name: 'System', type: 'system' },
        timestamp: new Date().toISOString(),
        message: 'connected',
        payload: { clients: clients.size },
      },
    });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(String(data)) as WsClientMessage;
        if (msg.op === 'ping') {
          wsSend(ws, { op: 'pong' });
          return;
        }
        if (msg.op === 'subscribe') {
          wsSend(ws, { op: 'subscribed', channels: msg.channels ?? ['workspace'] });
          return;
        }
        if ((msg as any).op === 'repl') {
          handleReplCommand(ctx, ws, (msg as any).command || '');
          return;
        }
      } catch {
        wsSend(ws, { op: 'error', error: 'invalid message' });
      }
    });
    ws.on('close', () => clients.delete(ws));
  });

  server.on('connection', (socket) => {
    socket.on('error', (err: any) => {
      if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
      console.error('[server] socket error:', err.message);
    });
  });

  const api = server as ApiServer;
  api.broadcast = broadcast;
  return api;
}

function wsSend(ws: WebSocket, data: unknown): void {
  try {
    ws.send(JSON.stringify(data));
  } catch {
    /* client disconnected */
  }
}

function replSend(ws: WebSocket, text: string): void {
  wsSend(ws, { op: 'output', text });
}

async function handleReplCommand(ctx: WorkspaceContext, ws: WebSocket, raw: string): Promise<void> {
  const trimmed = raw.trim();
  if (!trimmed) {
    replSend(ws, '\n');
    return;
  }
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const args = parts.slice(1);
  const rest = args.join(' ');
  const session = ctx.runtime.getSession();
  const profile = session.profile;

  try {
    switch (cmd) {
      case 'help': {
        const cmds = [
          ['explain <target>', 'Explain architecture or module'],
          ['plan <goal>', 'Create a plan from a goal'],
          ['plan list', 'List all plans'],
          ['plan delete all', 'Delete all plans'],
          ['plan approve <id>', 'Approve a draft plan'],
          ['implement <plan-id>', 'Generate a change set from a plan'],
          ['implement apply', 'Apply the latest change set'],
          ['verify <cs-id>', 'Verify a change set'],
          ['collab list', 'List collaboration records'],
          ['agent list', 'List available agents'],
          ['agent run <id> <task>', 'Run an agent'],
          ['memory search <q>', 'Search knowledge graph'],
          ['memory stats', 'Show knowledge graph stats'],
          ['suggest', 'Get AI-powered suggestions'],
          ['suggest clear', 'Dismiss current suggestions'],
          ['status', 'Show workspace status'],
          ['clear', 'Clear terminal'],
          ['help', 'Show this message'],
        ];
        const maxLen = Math.max(...cmds.map((c) => c[0].length));
        replSend(
          ws,
          ['Available commands:', '', ...cmds.map(([cmd, desc]) => `  ${cmd.padEnd(maxLen + 4)}${desc}`)].join('\n'),
        );
        break;
      }
      case 'clear':
        wsSend(ws, { op: 'clear' });
        break;
      case 'status':
        replSend(
          ws,
          [
            `Workspace: ${profile.name}`,
            `Language:  ${profile.language}`,
            `Manager:   ${profile.packageManager}`,
            `Files:     ${profile.fileCount}`,
            `Packages:  ${profile.packageCount}`,
            `Deps:      ${profile.dependencyCount}`,
            `Monorepo:  ${profile.isMonorepo}`,
            `Session:   ${session.fingerprint.id}`,
            `Indexed:   ${session.isIndexReady}`,
          ].join('\n'),
        );
        break;
      case 'explain': {
        if (!rest) {
          replSend(ws, 'Usage: explain <target>');
          break;
        }
        const result = await ctx.explainService.explain(rest, session);
        replSend(ws, result.content);
        break;
      }
      case 'plan': {
        const sub = args[0];
        if (sub === 'list') {
          const plans = await ctx.plans.list(session.fingerprint.id);
          if (plans.length === 0) {
            replSend(ws, 'No plans.');
            break;
          }
          replSend(ws, plans.map((p: any) => `  ${p.id}  ${p.status.padEnd(12)} ${p.title}`).join('\n'));
        } else if (sub === 'delete' && args[1] === 'all') {
          replSend(ws, `Deleted ${await ctx.planningService.deleteAllPlans(session.fingerprint.id)} plan(s).`);
        } else if (sub === 'approve') {
          const id = args[1];
          if (!id) {
            replSend(ws, 'Usage: plan approve <id>');
            break;
          }
          const plan = await ctx.planningService.updatePlanStatus(id, 'approved', session);
          replSend(ws, plan ? `Plan ${id} approved.` : `Plan "${id}" not found.`);
        } else {
          const result = await ctx.planningService.createPlan(rest, session);
          replSend(
            ws,
            `Plan ${result.plan.id} created (${result.source}): ${result.plan.title}\n  ${result.plan.tasks?.length || 0} task(s) · ${result.plan.status}`,
          );
        }
        break;
      }
      case 'implement': {
        if (args[0] === 'apply') {
          const css = await ctx.changeSets.listByWorkspace(session.fingerprint.id);
          const latest = css.filter((c: any) => c.status === 'draft').reverse()[0];
          if (!latest) {
            replSend(ws, 'No draft change sets to apply.');
            break;
          }
          await ctx.implementationService.apply(latest.id, session);
          replSend(ws, `Change Set ${latest.id} applied.`);
        } else if (args[0]) {
          const result = await ctx.implementationService.implement(args[0], session);
          replSend(
            ws,
            `Change Set ${result.changeSet.id} created (${result.source}): ${result.changeSet.files.length} file(s)`,
          );
        } else {
          replSend(ws, 'Usage: implement <plan-id> or implement apply');
        }
        break;
      }
      case 'verify': {
        if (!args[0]) {
          replSend(ws, 'Usage: verify <cs-id>');
          break;
        }
        const r = (await ctx.verificationService.verify(args[0], session)).report;
        replSend(
          ws,
          [
            `Verification ${r.id}: ${r.status}`,
            `  ${r.summary.passed}/${r.summary.total} checks passed`,
            ...r.checks.map((c: any) => `  ${c.status === 'passed' ? '✓' : '✗'} ${c.type} (${c.durationMs}ms)`),
          ].join('\n'),
        );
        break;
      }
      case 'collab': {
        if (args[0] === 'list') {
          const items = await ctx.collaboration.listByWorkspace(session.fingerprint.id);
          if (items.length === 0) {
            replSend(ws, 'No collaboration records.');
            break;
          }
          replSend(ws, items.map((c: any) => `  ${c.id}  ${c.status.padEnd(12)} ${c.title.slice(0, 50)}`).join('\n'));
        } else {
          replSend(ws, 'Usage: collab list');
        }
        break;
      }
      case 'agent': {
        if (args[0] === 'list') {
          replSend(
            ws,
            (await ctx.agents.listAgents())
              .map((a: any) => `  ${a.id}  ${a.status.padEnd(10)} ${a.name} (${a.capabilities.length} capabilities)`)
              .join('\n'),
          );
        } else if (args[0] === 'run') {
          if (!args[1] || !args.slice(2).join(' ')) {
            replSend(ws, 'Usage: agent run <id> <task>');
            break;
          }
          const result = await ctx.agentRuntime.run(args[1], args.slice(2).join(' '), session);
          replSend(ws, `Agent ${args[1]} run: ${result.execution.id} (${result.execution.status})`);
        } else {
          replSend(ws, 'Usage: agent list | agent run <id> <task>');
        }
        break;
      }
      case 'memory': {
        if (args[0] === 'stats') {
          const stats = await ctx.knowledgeGraph.getStats();
          replSend(ws, `Nodes: ${stats.nodes}  Relations: ${stats.relations}`);
        } else if (args[0] === 'search') {
          const query = args.slice(1).join(' ');
          if (!query) {
            replSend(ws, 'Usage: memory search <query>');
            break;
          }
          const results = await ctx.knowledgeGraph.searchNodes(query);
          replSend(ws, results.length ? results.map((r: any) => `  ${r.name} (${r.type})`).join('\n') : 'No results.');
        } else {
          replSend(ws, 'Usage: memory search <query> | memory stats');
        }
        break;
      }
      case 'suggest': {
        if (args[0] === 'clear' || args[0] === 'delete') {
          replSend(ws, 'Suggestions are ephemeral — new ones will be generated next time you run suggest.');
          break;
        }
        const suggestions = await ctx.suggestionService.generate(session);
        if (suggestions.length === 0) {
          replSend(ws, 'No suggestions.');
          break;
        }
        replSend(
          ws,
          suggestions
            .map(
              (s: any, i: number) =>
                `  ${i + 1}. [${s.priority}] ${s.title}${s.description ? `\n     ${s.description}` : ''}`,
            )
            .join('\n'),
        );
        break;
      }
      default:
        replSend(ws, `Unknown command: ${cmd}. Type 'help' for available commands.`);
    }
  } catch (err: any) {
    replSend(ws, `Error: ${err.message}`);
  }
  wsSend(ws, { op: 'prompt' });
}

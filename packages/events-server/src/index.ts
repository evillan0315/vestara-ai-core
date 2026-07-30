/**
 * @vestara/events-server — Lightweight HTTP + WebSocket bridge for the Workspace UI.
 *
 * Exposes workspace runtime state via REST endpoints and streams
 * live domain events to connected clients through SSE/WebSocket.
 *
 * Architecture Traceability:
 *   PCS: PCS-010 — Workspace UI
 *   PCS: PCS-020 — Real-Time Activity Stream
 */

import * as http from 'node:http';

let sessions: any = null;
let activityService: any = null;
let wsClients: Array<{ send: (msg: string) => void }> = [];

export function startServer(port = 3001): http.Server {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = req.url || '/';
    const route = url.split('?')[0];

    try {
      switch (route) {
        case '/api/sessions':
          handleListSessions(res);
          break;
        case '/api/workspace':
          handleWorkspace(res);
          break;
        case '/api/health':
          handleHealth(res);
          break;
        case '/api/agents':
          handleAgents(res);
          break;
        case '/api/events':
          upgradeToEventStream(req, res);
          break;
        case '/api/activity':
          handleActivity(res, url);
          break;
        case '/api/suggestions':
          handleSuggestions(res);
          break;
        case '/api/workflow':
          handleWorkflow(res);
          break;
        case '/api/patterns':
          handlePatterns(res);
          break;
        case '/api/artifacts':
          handleArtifacts(res);
          break;
        default:
          if (route.startsWith('/api/sessions/')) {
            const id = route.split('/')[3];
            handleSessionDetail(res, id);
          } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
          }
      }
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  });

  server.listen(port, () => {
    console.log(`[events-server] Listening on http://127.0.0.1:${port}`);
  });

  return server;
}

export function registerSession(ws: any): void {
  sessions = ws;
}

export function registerActivityService(svc: any): void {
  activityService = svc;
  if (svc?.onEvent) {
    svc.onEvent((event: any) => {
      emitToClients({
        op: 'event',
        event,
      });
    });
  }
}

export function subscribeToEventBus(eventBus: any): () => void {
  if (!eventBus?.subscribe) return () => {};

  const eventTypes = [
    'workspace:*',
    'plan:*',
    'changeset:*',
    'verification:*',
    'agent:*',
    'session:*',
    'collaboration:*',
    'memory:*',
    'conversation:*',
    'user:*',
  ];

  const unsubscribers = eventTypes.map((pattern) => {
    try {
      return eventBus.subscribe(pattern, async (event: any) => {
        const type = event.type || pattern;
        const payload = event.payload || {};
        emitToClients({
          op: 'event',
          event: {
            id: event.id || `evt-${Date.now()}`,
            timestamp: event.timestamp || new Date().toISOString(),
            type,
            actor: event.actor?.type || 'system',
            message: payload.message || type,
            payload,
          },
        });
      });
    } catch {
      return () => {};
    }
  });

  return () => unsubscribers.forEach((u) => u());
}

function emitToClients(msg: Record<string, unknown>): void {
  const text = JSON.stringify(msg);
  for (const client of wsClients) {
    try {
      client.send(text);
    } catch {}
  }
}

// ── Handlers ──────────────────────────────────────────

function handleListSessions(res: http.ServerResponse): void {
  if (!sessions) {
    res.end(JSON.stringify({ sessions: [] }));
    return;
  }
  res.end(
    JSON.stringify({
      sessions: [
        {
          id: 'SES-1',
          title: sessions.fingerprint?.name || 'Active Workspace',
          status: 'active',
          repository: sessions.fingerprint?.name || 'unknown',
          fileCount: sessions.profile?.fileCount || 0,
          packageCount: sessions.profile?.packageCount || 0,
          healthScore: sessions.profile?.healthScore?.overall || null,
        },
      ],
    }),
  );
}

function handleWorkspace(res: http.ServerResponse): void {
  if (!sessions) {
    res.end(JSON.stringify({ workspace: null }));
    return;
  }
  res.end(
    JSON.stringify({
      workspace: {
        name: sessions.fingerprint?.name || 'unknown',
        language: sessions.profile?.language || 'unknown',
        framework: sessions.profile?.framework || null,
        packageManager: sessions.profile?.packageManager || null,
        fileCount: sessions.profile?.fileCount || 0,
        packageCount: sessions.profile?.packageCount || 0,
        dependencyCount: sessions.profile?.dependencyCount || 0,
        isMonorepo: sessions.profile?.isMonorepo || false,
        healthScore: sessions.profile?.healthScore?.overall || null,
        entryPoints: (sessions.profile?.entryPoints || []).slice(0, 10).map((e: any) => e.path),
      },
    }),
  );
}

function handleHealth(res: http.ServerResponse): void {
  res.end(
    JSON.stringify({
      status: 'ok',
      version: '4.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage().heapUsed,
    }),
  );
}

function handleAgents(res: http.ServerResponse): void {
  res.end(
    JSON.stringify({
      agents: [
        {
          name: 'Architect',
          role: 'architect',
          status: 'idle',
          capabilities: ['architecture-analysis', 'design-review', 'dependency-analysis'],
        },
        {
          name: 'Developer',
          role: 'developer',
          status: 'idle',
          capabilities: ['code-generation', 'refactoring', 'bug-fixing'],
        },
        {
          name: 'Verifier',
          role: 'verifier',
          status: 'idle',
          capabilities: ['testing', 'diagnostics', 'quality-analysis'],
        },
        {
          name: 'Documenter',
          role: 'documenter',
          status: 'idle',
          capabilities: ['documentation', 'summarization', 'knowledge-management'],
        },
      ],
    }),
  );
}

function handleActivity(res: http.ServerResponse, url: string): void {
  const qs = new URL(url, 'http://127.0.0.1').searchParams;
  const options: Record<string, any> = {};
  if (qs.get('category')) options.category = qs.get('category');
  if (qs.get('type')) options.type = qs.get('type');
  if (qs.get('limit')) options.limit = parseInt(qs.get('limit')!, 10);
  if (qs.get('before')) options.before = qs.get('before');

  if (activityService?.query) {
    activityService
      .query(options)
      .then((events: any[]) => {
        res.end(JSON.stringify({ events, total: events.length }));
      })
      .catch((err: any) => {
        res.writeHead(500);
        res.end(JSON.stringify({ error: err.message }));
      });
  } else {
    res.end(JSON.stringify({ events: [], total: 0 }));
  }
}

function upgradeToEventStream(req: http.IncomingMessage, res: http.ServerResponse): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const client = { send: (msg: string) => res.write(`data: ${msg}\n\n`) };
  wsClients.push(client);

  client.send(
    JSON.stringify({
      op: 'event',
      event: {
        id: 'connected',
        timestamp: new Date().toISOString(),
        type: 'system.ready',
        actor: { id: 'system', name: 'System', type: 'system' },
        resource: { type: 'system', id: 'events-server', name: 'Events Server' },
        message: 'Connected to Vestara events',
        metadata: {},
      },
    }),
  );

  req.on('close', () => {
    wsClients = wsClients.filter((c) => c !== client);
  });
}

function handleSuggestions(res: http.ServerResponse): void {
  if (!sessions) {
    res.end(JSON.stringify({ suggestions: [] }));
    return;
  }
  const profile = sessions.profile;
  if (!profile) {
    res.end(JSON.stringify({ suggestions: [] }));
    return;
  }
  const suggestions: Array<{ priority: string; title: string }> = [];
  const health = profile.healthScore;
  if (health) {
    if (health.categories.testCoverage < 5) suggestions.push({ priority: 'high', title: 'Low test coverage' });
    if (health.categories.documentation < 5) suggestions.push({ priority: 'medium', title: 'Documentation gaps' });
  }
  const highRisks = (profile.risks || []).filter((r: any) => r.severity === 'high');
  for (const r of highRisks.slice(0, 3)) {
    suggestions.push({ priority: 'high', title: `${r.category}: ${r.detail}` });
  }
  res.end(JSON.stringify({ suggestions }));
}

function handleWorkflow(res: http.ServerResponse): void {
  if (!sessions) {
    res.end(JSON.stringify({ workflow: null }));
    return;
  }
  const health = sessions.profile?.healthScore;
  const healthOk = health ? health.overall >= 5 : false;
  const nextStep = healthOk
    ? {
        label: 'Create a Plan',
        command: 'plan <goal>',
        reason: 'Repository is healthy. Define what you want to build.',
      }
    : {
        label: 'Review Risks',
        command: 'risks',
        reason: `Health is ${health?.overall.toFixed(1) || '?'}/10. Review risks first.`,
      };
  res.end(JSON.stringify({ workflow: { currentStep: nextStep, confidence: healthOk ? 0.88 : 0.92 } }));
}

function handleArtifacts(res: http.ServerResponse): void {
  if (!sessions) {
    res.end(JSON.stringify({ chain: [], plans: [], changeSets: [], collaboration: [] }));
    return;
  }
  const profile = sessions.profile;
  const items: Array<{ type: string; name: string; status: string }> = [];
  if (profile?.entryPoints) {
    items.push({ type: 'repository', name: profile.name || 'unknown', status: 'analyzed' });
  }
  items.push({ type: 'plan', name: 'Plans (0)', status: 'none' });
  items.push({ type: 'changeset', name: 'Change Sets (0)', status: 'none' });
  if (profile?.healthScore) {
    items.push({ type: 'health', name: `Health: ${profile.healthScore.overall.toFixed(1)}/10`, status: 'active' });
  }
  res.end(JSON.stringify({ chain: items }));
}

function handlePatterns(res: http.ServerResponse): void {
  res.end(
    JSON.stringify({
      patterns: [],
      message: 'Patterns available after completing work. Use "memory record" in the CLI.',
    }),
  );
}

function handleSessionDetail(res: http.ServerResponse, id: string): void {
  if (!sessions) {
    res.end(JSON.stringify({ session: null }));
    return;
  }
  res.end(
    JSON.stringify({
      session: {
        id,
        title: sessions.fingerprint?.name || 'Active Workspace',
        repository: sessions.fingerprint?.name || 'unknown',
        language: sessions.profile?.language || 'unknown',
        status: 'active',
        healthScore: sessions.profile?.healthScore?.overall || null,
        entryPoints: (sessions.profile?.entryPoints || []).slice(0, 10).map((e: any) => e.path),
        risks: (sessions.profile?.risks || []).slice(0, 10),
        packages: (sessions.profile?.packages || []).slice(0, 20).map((p: any) => p.name),
      },
    }),
  );
}

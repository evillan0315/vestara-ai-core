/**
 * HTTP + WebSocket gateway for the Workspace UI.
 *
 * Request lifecycle: assign request context → log start → dispatch by path
 * prefix → log completion/failure → record metrics. All uncaught route
 * errors pass through a single error boundary. WebSocket connections are
 * logged, heartbeat-protected, and size-limited.
 */

import * as fs from 'node:fs';
import * as http from 'node:http';
import type { Socket } from 'node:net';
import * as path from 'node:path';
import type { ActivityService } from '@vestara/activity-log';
import type { WorkspaceEvent, WorkspaceEventType, WsServerMessage } from '@vestara/events';
import { categorizeEvent } from '@vestara/events';
import { type RawData, WebSocket, WebSocketServer } from 'ws';
import { getActivityRoom } from './activity-room';
import { ApiError, httpMetrics, logger, requestContext, sendJson, sendNoContent } from './http';
import { normalizeError } from './http/api-error';
import { sendError } from './http/response';
import { createDispatcher, type RouteGroup } from './http/router';
import { handleActivityRoute } from './routes/activity';
import { handleActivityRoomRoute } from './routes/activity-room';
import { handleM11AActivityRoomRoute } from './routes/activity-room-m11a';
import { handleAgentHarnessRoute } from './routes/agent-harness';
import { handleAgentsRoute } from './routes/agents';
import { handleAuthRoute } from './routes/auth';
import { handleConversationsRoute } from './routes/conversations';
import { handleDiagnosticsRoute } from './routes/diagnostics';
import { handleDocsRoute } from './routes/docs';
import { handleDocumentationRoute } from './routes/documentation';
import { handleEvidenceRoute } from './routes/evidence';
import { handleExecutionRoute } from './routes/execution';
import { handleExternalRuntimeRoute, registerExternalRuntimeService } from './routes/external-runtime';
import { featureRequests, handleFeatureRequestsRoute } from './routes/feature-requests';
import { handleGraphRoute } from './routes/graph';
import { handleHostRoute } from './routes/host';
import { handleMarketplaceRoute } from './routes/marketplace';
import { handleMemoryRoute } from './routes/memory';
import { handleMilestonesRoute } from './routes/milestones';
import { handleMiscRoute } from './routes/misc';
import { handleNotificationsRoute } from './routes/notifications';
import { handleOpenCodeRoute } from './routes/opencode';
import { handleOrchestrationRoute } from './routes/orchestration';
import { handleOrdersRoute } from './routes/orders';
import { handlePlansRoute } from './routes/plans';
import { handleProjectsRoute } from './routes/projects';
import { handleProvidersRoute } from './routes/providers';
import { handleQualificationRoute } from './routes/qualification';
import { handleRoutingRoute } from './routes/routing';
import { handleSchedulesRoute } from './routes/schedules';
import { handleSessionsRoute } from './routes/sessions';
import { handleThemeBuilderRoute } from './routes/settings-theme-builder';
import { handleTeamsRoute } from './routes/teams';
import { handleTelemetryRoute } from './routes/telemetry';
import { handleTuiRoute } from './routes/tui';
import { handleVerifierRoute } from './routes/verifier';
import { handleWorkersRoute } from './routes/workers';
import { handleWorkflowRoute } from './routes/workflow';
import { handleWorkspaceRoute } from './routes/workspace';
import { handleWorktreeRoute } from './routes/worktrees';
import type { WorkspaceContext } from './workspace-context';

/** Default overall HTTP request deadline (overridden by streaming routes). */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
/** Grace period during graceful shutdown. */
export const SHUTDOWN_GRACE_MS = 10_000;

// Long-running/streaming endpoints opt out of the short normal deadline.
// Note: `/api/changesets` are frequently-large bodies; leave default. Only
// explicitly streaming routes lengthen the deadline.
const STREAMING_PREFIXES = [
  '/api/conversations/',
  '/api/chat/',
  '/api/agent-threads/',
  '/api/orchestration/stream',
  '/api/diagnostics/analyze',
];

export interface ApiServerOptions {
  requestTimeoutMs?: number;
  shutdownGraceMs?: number;
}

export type ApiServer = http.Server & {
  broadcast: (event: WorkspaceEvent) => void;
  readiness: () => boolean;
  shutdown: (signal?: string) => Promise<void>;
};

interface AsmError extends Error {
  code?: string;
}

// ─── Route registry ─────────────────────────────────────────────
// Prefixes preserve the original sequential dispatch order so overlapping
// handlers resolve identically. Adapters supply the exact trailing args each
// handler signature expects.

interface RouteDef {
  prefixes: string[];
  handler: RouteGroup['handler'];
}

export type { RouteDef };

function memAdapter(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
  _port: number,
  url: URL,
): Promise<boolean> {
  return handleMemoryRoute(method, p, req, res, ctx, url);
}

function tuiAdapter(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
  _port: number,
  url: URL,
): Promise<boolean> {
  return handleTuiRoute(method, p, req, res, ctx, url);
}

export const ROUTE_DEFS: RouteDef[] = [
  {
    prefixes: [
      '/api/analyze-feature',
      '/api/analyze-workspace',
      '/api/explain',
      '/api/health',
      '/api/models',
      '/api/repl',
      '/api/routes',
      '/api/stt',
      '/api/suggestions',
    ],
    handler: handleMiscRoute,
  },
  { prefixes: ['/api/diagnostics'], handler: handleDiagnosticsRoute },
  { prefixes: ['/api/execution'], handler: handleExecutionRoute },
  { prefixes: ['/api/agents/workforce', '/api/external-runtime'], handler: handleExternalRuntimeRoute },
  { prefixes: ['/api/graph'], handler: handleGraphRoute },
  { prefixes: ['/api/boot', '/api/host'], handler: handleHostRoute },
  { prefixes: ['/api/docs'], handler: handleDocsRoute },
  { prefixes: ['/api/documentation'], handler: handleDocumentationRoute },
  { prefixes: ['/api/auth', '/api/admin'], handler: handleAuthRoute },
  {
    prefixes: [
      '/api/cli',
      '/api/runtime',
      '/api/settings',
      '/api/understanding',
      '/api/workspace-ui',
      '/api/workspace',
    ],
    handler: handleWorkspaceRoute,
  },
  { prefixes: ['/api/providers'], handler: handleProvidersRoute },
  { prefixes: ['/api/settings/theme-builder'], handler: handleThemeBuilderRoute },
  { prefixes: ['/api/worktrees'], handler: handleWorktreeRoute },
  { prefixes: ['/api/workflows'], handler: handleWorkflowRoute },
  { prefixes: ['/api/qualification'], handler: handleQualificationRoute },
  { prefixes: ['/api/orchestration'], handler: handleOrchestrationRoute },
  { prefixes: ['/api/evidence'], handler: handleEvidenceRoute },
  { prefixes: ['/api/verifier'], handler: handleVerifierRoute },
  { prefixes: ['/api/workers'], handler: handleWorkersRoute },
  { prefixes: ['/api/routing'], handler: handleRoutingRoute },
  { prefixes: ['/api/sessions', '/api/background'], handler: handleSessionsRoute },
  { prefixes: ['/api/agents', '/api/capabilities'], handler: handleAgentsRoute },
  { prefixes: ['/api/teams'], handler: handleTeamsRoute },
  { prefixes: ['/api/schedules'], handler: handleSchedulesRoute },
  { prefixes: ['/api/milestones'], handler: handleMilestonesRoute },
  { prefixes: ['/api/requests'], handler: handleFeatureRequestsRoute },
  {
    prefixes: ['/api/changesets', '/api/collab', '/api/implement', '/api/plans', '/api/verifications', '/api/verify'],
    handler: handlePlansRoute,
  },
  { prefixes: ['/api/projects', '/api/sprints'], handler: handleProjectsRoute },
  { prefixes: ['/api/orders'], handler: handleOrdersRoute },
  { prefixes: ['/api/conversations'], handler: handleConversationsRoute },
  { prefixes: ['/api/activity-log', '/api/activity'], handler: handleActivityRoute },
  { prefixes: ['/api/activity-room', '/api/visual-config'], handler: handleActivityRoomRoute },
  { prefixes: ['/api/activity-room/v1'], handler: handleM11AActivityRoomRoute },
  { prefixes: ['/api/agent-threads'], handler: handleAgentHarnessRoute },
  { prefixes: ['/api/notifications'], handler: handleNotificationsRoute },
  { prefixes: ['/api/approvals', '/api/artifacts', '/api/memory'], handler: memAdapter },
  { prefixes: ['/api/marketplace'], handler: handleMarketplaceRoute },
  { prefixes: ['/api/opencode'], handler: handleOpenCodeRoute },
  { prefixes: ['/api/telemetry'], handler: handleTelemetryRoute },
  { prefixes: ['/api/tui'], handler: tuiAdapter },
];

function buildGroups(): RouteGroup[] {
  return ROUTE_DEFS.flatMap((def) => def.prefixes.map((prefix) => ({ prefix, handler: def.handler })));
}

/**
 * Serve the built Workspace UI (apps/workspace/dist) for non-API GET requests.
 * The compiled API lives at `apps/api/dist/index.js`, so the UI build is two
 * levels up under `apps/workspace/dist`. Requests that do not map to a real
 * asset fall back to index.html (SPA client-side routing).
 */
const UI_DIST = path.resolve(__dirname, '..', '..', '..', 'apps', 'workspace', 'dist');

const UI_CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

function serveWorkspaceUi(res: http.ServerResponse, pathname: string): boolean {
  const decoded = decodeURIComponent(pathname);
  const rel = decoded === '/' || decoded === '' ? '/index.html' : decoded;
  const filePath = path.normalize(path.join(UI_DIST, rel));
  const isSafe = filePath === UI_DIST || filePath.startsWith(`${UI_DIST}${path.sep}`);
  const isFile = isSafe && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  const target = isFile ? filePath : path.join(UI_DIST, 'index.html');
  if (!fs.existsSync(target)) return false;
  const ext = path.extname(target).toLowerCase();
  res.writeHead(200, { 'content-type': UI_CONTENT_TYPES[ext] ?? 'application/octet-stream' });
  fs.createReadStream(target).pipe(res);
  return true;
}

export function createServer(
  ctx: WorkspaceContext,
  port: number,
  activityService?: ActivityService,
  options: ApiServerOptions = {},
): ApiServer {
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const shutdownGraceMs = options.shutdownGraceMs ?? SHUTDOWN_GRACE_MS;
  const clients = new Set<WebSocket>();
  const aliveClients = new Set<WebSocket>();
  const activeSockets = new Set<Socket>();
  const dispatcher = createDispatcher(buildGroups());
  let ready = true;

  if (ctx.orchestrator) {
    ctx.orchestrator.setOnComplete((exSession) => {
      if (exSession.status === 'completed' && exSession.goal) {
        const goalTitle = exSession.goal.split(':')[0].trim();
        const req = featureRequests.find(
          (r) => r.title === goalTitle || `${r.title}: ${r.description || r.title}` === exSession.goal,
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

  function broadcastRaw(raw: string): number {
    let sent = 0;
    for (const ws of clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (ws.bufferedAmount > 256 * 1024) {
        logger.debug({ event: 'ws.broadcast.backpressure', connectionId: connectionIdOf(ws) });
        continue;
      }
      try {
        ws.send(raw);
        sent += 1;
      } catch (err) {
        logger.warn({ event: 'ws.broadcast.failed', error: String(err), connectionId: connectionIdOf(ws) });
      }
    }
    return sent;
  }

  if (activityService?.onEvent) {
    activityService.onEvent((domainEvent: WorkspaceEvent) => {
      try {
        const raw = JSON.stringify({ op: 'event', event: domainEvent } as WsServerMessage);
        broadcastRaw(raw);
      } catch (err) {
        logger.warn({ event: 'ws.broadcast.serialize.failed', error: String(err) });
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
      category: categorizeEvent(legacy.type),
      type: legacy.type as WorkspaceEventType,
      actor: legacy.actor,
      resource: {
        type: legacy.artifactId ? 'artifact' : legacy.sessionId ? 'session' : 'system',
        id: legacy.artifactId ?? legacy.sessionId ?? 'unknown',
        name: legacy.message ?? legacy.type,
      },
      message: legacy.message ?? legacy.type,
      metadata: (legacy.payload as Record<string, unknown>) ?? {},
    };
    try {
      const raw = JSON.stringify({ op: 'event', event } as WsServerMessage);
      broadcastRaw(raw);
    } catch (err) {
      logger.warn({ event: 'ws.broadcast.serialize.failed', error: String(err) });
    }
    activityService?.emitDirect(event).catch(() => {});
  };

  const server = http.createServer(async (req, res) => {
    if (ctx.externalRuntimeService) registerExternalRuntimeService(ctx, ctx.externalRuntimeService);
    if (!req.url || !req.method) {
      sendError(res, ApiError.badRequest('Malformed request.'));
      return;
    }

    // Parse the URL exactly once; reuse the parsed object for routing.
    let url: URL;
    try {
      url = new URL(req.url, `http://127.0.0.1:${port}`);
    } catch {
      sendError(res, ApiError.badRequest('Malformed request URL.'));
      return;
    }
    const pathname = url.pathname;
    const method = req.method.toUpperCase();

    const context = requestContext.derive(req, pathname);
    await requestContext.run(context, async () => {
      httpMetrics.begin();
      const startedAt = context.startedAt;
      logger.info({
        event: 'http.request.started',
        method,
        path: pathname,
        remoteAddress: context.remoteAddress,
        userAgent: context.userAgent,
      });

      const controller = new AbortController();
      context.signal = controller.signal;
      const isStreaming = STREAMING_PREFIXES.some((prefix) => pathname.startsWith(prefix));
      const deadline = isStreaming ? undefined : requestTimeoutMs;

      let finished = false;
      let timeout: NodeJS.Timeout | undefined;

      const complete = (statusCode: number, responseBytes: number, err?: unknown): void => {
        if (finished) return;
        finished = true;
        const durationMs = performance.now() - startedAt;
        httpMetrics.end(statusCode, durationMs);
        if (timeout) clearTimeout(timeout);
        // Expected client errors (4xx) complete normally; only server faults
        // (5xx or unexpected thrown exceptions) are logged as failures so
        // route-level input validations do not pollute error logs.
        if (statusCode >= 500) {
          const apiError = normalizeError(err);
          logger.error({
            event: 'http.request.failed',
            method,
            path: pathname,
            statusCode,
            durationMs: round(durationMs),
            error: {
              name: apiError.name,
              code: apiError.code,
              message: apiError.expose ? apiError.message : 'An internal error occurred.',
              stack: apiError.stack,
            },
          });
        } else {
          logger.info({
            event: 'http.request.completed',
            method,
            path: pathname,
            statusCode,
            durationMs: round(durationMs),
            responseBytes,
          });
        }
      };

      let responseBytes = 0;
      res.on('finish', () => {
        const len = res.getHeader('content-length');
        if (typeof len === 'string') responseBytes = Number(len) || 0;
      });

      if (deadline) {
        timeout = setTimeout(() => {
          if (finished) return;
          controller.abort();
          // Only answer when the socket is still writable and nothing sent yet.
          if (!res.writableEnded && res.writable) {
            const err = ApiError.requestTimeout();
            sendError(res, err);
            complete(err.statusCode, responseBytes, err);
          } else {
            complete(
              408,
              responseBytes,
              new ApiError({ code: 'DEADLINE_EXCEEDED', message: 'Request deadline exceeded.', statusCode: 408 }),
            );
          }
        }, deadline);
        timeout.unref?.();
      }

      try {
        res.on('close', () => {
          if (!finished && !res.writableEnded) controller.abort();
        });
        res.on('error', () => {});

        // Built-in fast-path endpoints handled before route dispatch. These
        // still flow through the shared lifecycle (logging + metrics above).
        if (method === 'OPTIONS') {
          sendNoContent(res);
          complete(204, 0);
          return;
        }
        if (method === 'GET' && pathname === '/api/health/live') {
          sendJson(res, 200, { status: 'ok' }, { cacheControl: 'no-cache' });
          complete(200, responseBytes);
          return;
        }
        if (method === 'GET' && pathname === '/api/health/ready') {
          try {
            const outcome = await readReady(ctx);
            sendJson(res, outcome.status, outcome.body, { cacheControl: 'no-cache' });
            complete(outcome.status, responseBytes);
          } catch (err) {
            sendJson(res, 503, { status: 'degraded', ready: false }, { cacheControl: 'no-cache' });
            complete(503, responseBytes, err);
          }
          return;
        }
        if (method === 'GET' && pathname === '/api/telemetry/http') {
          sendJson(res, 200, httpMetrics.snapshot());
          complete(200, responseBytes);
          return;
        }

        // Serve the built Workspace UI for non-API GET requests (SPA fallback).
        if (method === 'GET' && !pathname.startsWith('/api') && !pathname.startsWith('/ws')) {
          if (serveWorkspaceUi(res, pathname)) {
            complete(res.statusCode ?? 200, responseBytes);
            return;
          }
        }

        try {
          await dispatcher.dispatch(method, pathname, req, res, ctx, port, url);
        } catch (err) {
          // The dispatcher already handles 404s; any other error here is a
          // route-level throw (validation, body parse, internal). If the
          // response is still pending, send the standardized envelope.
          if (!res.writableEnded) {
            const apiError = sendError(res, err);
            complete(apiError.statusCode, responseBytes, apiError.statusCode >= 500 ? err : undefined);
          } else {
            complete(500, responseBytes, err);
          }
          return;
        }

        // If a handler already wrote the response, we must not double-answer.
        if (res.writableEnded) {
          complete(res.statusCode ?? 200, responseBytes);
          return;
        }
        // Dispatcher's default sends 404 when nothing claimed the request.
        complete(res.statusCode ?? 200, responseBytes);
      } catch (err) {
        // Centralized error boundary for unexpected throws outside dispatch.
        if (!res.writableEnded && res.writable) {
          const apiError = sendError(res, err);
          complete(apiError.statusCode, responseBytes, apiError.statusCode >= 500 ? err : undefined);
        } else {
          httpMetrics.recordError();
          complete(500, responseBytes, err);
        }
      }
    });
  });

  // ─── Server hardening ─────────────────────────────────────────
  // Conservative, low-resource local-first values:
  //  keepAliveTimeout 5000  → reclaim idle keep-alive sockets promptly
  //  headersTimeout   10000 → bound slow-header attacks
  //  requestTimeout   30000 → bound a single request on the socket
  //  maxRequestsPerSocket 0 → disable (many app endpoints stream/detect)
  //  timeout          0     → keep-alive sockets persist; relies on the above
  server.keepAliveTimeout = 5000;
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  server.maxRequestsPerSocket = 0;
  server.timeout = 0;

  server.on('connection', (socket) => {
    activeSockets.add(socket);
    socket.on('close', () => activeSockets.delete(socket));
    socket.on('error', (err: AsmError) => {
      const code = err.code ?? '';
      if (code === 'EPIPE' || code === 'ECONNRESET' || code === 'ERR_STREAM_PREMATURE_CLOSE') {
        logger.debug({ event: 'http.socket.drop', code, remoteAddress: socket.remoteAddress });
        return;
      }
      logger.error({ event: 'http.socket.error', code, message: err.message, remoteAddress: socket.remoteAddress });
    });
  });

  server.on('clientError', (err: AsmError, socket: Socket) => {
    const headerOverflow = err.code === 'HPE_HEADER_OVERFLOW';
    const statusCode = headerOverflow ? 431 : 400;
    const statusText = headerOverflow ? 'Request Header Fields Too Large' : 'Bad Request';
    const code = headerOverflow ? 'HEADER_TOO_LARGE' : 'BAD_REQUEST';
    const data = Buffer.from(JSON.stringify({ error: { code, message: 'Malformed HTTP request.', requestId: '' } }));
    if (socket.writable) {
      socket.write(
        `HTTP/1.1 ${statusCode} ${statusText}\r\nContent-Type: application/json\r\nContent-Length: ${data.length}\r\nConnection: close\r\n\r\n`,
      );
      socket.write(data);
    }
    logger.warn({ event: 'http.clientError', code: err.code, message: err.message });
    socket.destroy();
  });

  server.on('error', (err: AsmError) => {
    logger.error({ event: 'http.server.error', code: err.code, message: err.message, stack: err.stack });
  });

  // ─── WebSocket ─────────────────────────────────────────────────
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1 * 1024 * 1024 });
  let workerWss: WebSocketServer | undefined;
  if (ctx.workerSocketServer) {
    workerWss = new WebSocketServer({ noServer: true });
    ctx.workerSocketServer.attach(workerWss);
  }
  const activityWss = new WebSocketServer({ noServer: true, maxPayload: 1 * 1024 * 1024 });

  server.on('upgrade', (req, socket, head) => {
    let pathname = '/';
    try {
      pathname = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname === '/ws/worker' && workerWss) {
      workerWss.handleUpgrade(req, socket, head, (ws) => workerWss?.emit('connection', ws, req));
      return;
    }
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
      return;
    }
    if (pathname === '/ws/activity') {
      activityWss.handleUpgrade(req, socket, head, (ws) => activityWss.emit('connection', ws, req));
      return;
    }
    socket.destroy();
  });

  wss.on('connection', (ws, req) => {
    const connectAt = Date.now();
    const connectionId = connectionIdOf(ws);
    clients.add(ws);
    aliveClients.add(ws);
    logger.info({
      event: 'ws.connected',
      connectionId,
      remoteAddress: req.socket.remoteAddress,
    });

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

    ws.on('message', (data: RawData) => {
      let msg: WsClientCommand;
      try {
        msg = parseClientMessage(data);
      } catch (err) {
        wsSend(ws, { op: 'error', error: 'invalid message' });
        logger.warn({ event: 'ws.malformed', connectionId, error: String(err) });
        return;
      }
      if (msg.op === 'ping') {
        wsSend(ws, { op: 'pong' });
        return;
      }
      if (msg.op === 'subscribe') {
        wsSend(ws, { op: 'subscribed', channels: msg.channels ?? ['workspace'] });
        return;
      }
      if (msg.op === 'repl') {
        void handleReplCommand(ctx, ws, msg.command);
        return;
      }
    });

    ws.on('error', (err: AsmError) => {
      logger.error({ event: 'ws.error', connectionId, code: err.code, message: err.message });
    });

    ws.on('close', (code: number, reason: Buffer) => {
      clients.delete(ws);
      aliveClients.delete(ws);
      logger.info({
        event: 'ws.disconnected',
        connectionId,
        disconnectCode: code,
        reason: reason.toString().slice(0, 200),
        durationMs: Date.now() - connectAt,
      });
    });
  });

  // ─── Activity Room stream (/ws/activity) ─────────────────────────
  // Recovery is history-first: the client subscribes with its last seen
  // sequence, missed records are replayed from the persisted store, and live
  // delivery resumes from the same boundary through the broadcast hub.
  activityWss.on('connection', (ws) => {
    const activityRoom = getActivityRoom();
    let attachedId: string | undefined;
    ws.on('message', (data: RawData) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString('utf8'));
      } catch {
        wsSend(ws, { op: 'error', error: 'invalid message' });
        return;
      }
      if (parsed === null || typeof parsed !== 'object') return;
      const message = parsed as Record<string, unknown>;
      if (message.op === 'activity-subscribe') {
        const afterSequence =
          typeof message.afterSequence === 'number' && Number.isFinite(message.afterSequence)
            ? Math.max(0, Math.floor(message.afterSequence))
            : 0;
        attachedId = `activity-${connectionIdOf(ws)}`;
        // Attach the hub at the true latest sequence FIRST so records appended
        // while we replay history are delivered live (never held as a gap). The
        // replay below backfills everything up to that frontier through the same
        // `activity.appended` envelope, so clients see a gap-free stream.
        void (async () => {
          let frontier = afterSequence;
          try {
            frontier = await activityRoom.store.lastSequence();
          } catch {
            /* fall back to the subscriber checkpoint */
          }
          if (ws.readyState === WebSocket.OPEN) {
            activityRoom.hub.attach(attachedId, { send: (streamMessage) => wsSend(ws, streamMessage) }, frontier);
          }
          // Replay missed history up to the frontier, paging past the 1000-record
          // window. The previous single `limit: 1000` query truncated replay and
          // left the hub checkpoint below the real frontier, so every live event
          // was treated as an out-of-order gap and silently dropped.
          let cursor = afterSequence;
          for (;;) {
            const page = await activityRoom.store.list({ afterSequence: cursor, limit: 1000 });
            if (page.records.length === 0) break;
            if (ws.readyState !== WebSocket.OPEN) return;
            for (const record of page.records) {
              wsSend(ws, { type: 'activity.appended', sequence: record.sequence, activity: record });
            }
            const next = page.nextSequence;
            if (next === undefined) break;
            cursor = next;
          }
        })();
        return;
      }
      if (message.op === 'activity-unsubscribe') {
        if (attachedId !== undefined) activityRoom.hub.detach(attachedId);
        attachedId = undefined;
      }
    });
    ws.on('close', () => {
      if (attachedId !== undefined) activityRoom.hub.detach(attachedId);
      attachedId = undefined;
    });
    ws.on('error', () => {});
  });

  // Heartbeat: terminate stale clients that never respond to pings.
  const heartbeat = setInterval(() => {
    for (const ws of clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (!aliveClients.has(ws)) {
        ws.terminate();
        clients.delete(ws);
        logger.info({ event: 'ws.stale.terminated', connectionId: connectionIdOf(ws) });
        continue;
      }
      aliveClients.delete(ws);
      try {
        ws.ping();
      } catch {
        /* will be swept next tick */
      }
    }
  }, 30_000);
  heartbeat.unref?.();

  wss.on('connection', (ws) => {
    ws.on('pong', () => {
      aliveClients.add(ws);
    });
  });

  const api = server as ApiServer;

  const shutdown = async (signal?: string): Promise<void> => {
    logger.info({ event: 'server.shutdown.start', signal });
    ready = false;
    // Stop accepting new connections.
    server.close();

    // Close WebSocket clients with a shutdown code.
    for (const ws of clients) {
      try {
        ws.close(1001, 'server shutting down');
      } catch {
        /* ignore */
      }
    }
    clearInterval(heartbeat);

    const forceTimer = setTimeout(() => {
      for (const socket of activeSockets) {
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
      }
    }, shutdownGraceMs);
    forceTimer.unref?.();

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    try {
      await ctx.close();
    } catch (err) {
      logger.error({ event: 'server.shutdown.ctxCloseError', error: String(err) });
    }
    clearTimeout(forceTimer);
    logger.info({ event: 'server.shutdown.complete', signal });
  };

  server.on('close', () => {
    clearInterval(heartbeat);
  });

  api.broadcast = broadcast;
  api.readiness = () => ready;
  api.shutdown = shutdown;
  return api;
}

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Discriminated union of WebSocket commands accepted from clients. The
 * legacy REPL op is preserved for backward compatibility.
 */
type WsClientCommand =
  | { op: 'ping' }
  | { op: 'subscribe' | 'unsubscribe'; channels?: string[] }
  | { op: 'repl'; command: string };

let wsIdCounter = 0;
function connectionIdOf(ws: WebSocket): string {
  // Attach a stable id on first access.
  const anyWs = ws as WebSocket & { __veConnId?: string };
  if (!anyWs.__veConnId) anyWs.__veConnId = `ws_${Date.now().toString(36)}_${(wsIdCounter++).toString(36)}`;
  return anyWs.__veConnId;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

interface ReadyOutcome {
  status: number;
  body: Record<string, unknown>;
}

async function readReady(ctx: WorkspaceContext): Promise<ReadyOutcome> {
  const status = ctx.runtime.currentStatus;
  const ok = status === 'ready' || status === 'idle';
  return {
    status: ok ? 200 : 503,
    body: { status: ok ? 'ok' : 'degraded', ready: ok, workspaceStatus: status },
  };
}

/**
 * Parse a client WebSocket message into a discriminated union.
 * Throws on any malformed payload.
 */
function parseClientMessage(data: RawData): WsClientCommand {
  const text = data.toString('utf8');
  const parsed: unknown = JSON.parse(text);
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('expected object message');
  }
  const record = parsed as Record<string, unknown>;
  const op = record.op;
  if (typeof op !== 'string') throw new Error('missing op');
  switch (op) {
    case 'ping':
      return { op: 'ping' };
    case 'subscribe':
    case 'unsubscribe':
      return { op, channels: Array.isArray(record.channels) ? record.channels.map(String) : undefined };
    case 'repl': {
      const command = typeof record.command === 'string' ? record.command : '';
      return { op: 'repl', command };
    }
    default:
      throw new Error(`unknown op: ${op}`);
  }
}

function wsSend(ws: WebSocket, data: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  let raw: string;
  try {
    raw = JSON.stringify(data);
  } catch {
    return;
  }
  try {
    ws.send(raw);
  } catch {
    logger.debug({ event: 'ws.send.failed', connectionId: connectionIdOf(ws) });
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
          replSend(ws, plans.map((p) => `  ${p.id}  ${p.status.padEnd(12)} ${p.title}`).join('\n'));
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
          const latest = css.filter((c) => c.status === 'draft').reverse()[0];
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
            ...r.checks.map((c) => `  ${c.status === 'passed' ? '✓' : '✗'} ${c.type} (${c.durationMs}ms)`),
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
          replSend(ws, items.map((c) => `  ${c.id}  ${c.status.padEnd(12)} ${c.changeSetId.slice(0, 50)}`).join('\n'));
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
              .map((a) => `  ${a.id}  ${a.status.padEnd(10)} ${a.name} (${a.capabilities.length} capabilities)`)
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
          replSend(ws, results.length ? results.map((r) => `  ${r.name} (${r.type})`).join('\n') : 'No results.');
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
              (s, i: number) =>
                `  ${i + 1}. [${s.priority}] ${s.title}${s.description ? `\n     ${s.description}` : ''}`,
            )
            .join('\n'),
        );
        break;
      }
      default:
        replSend(ws, `Unknown command: ${cmd}. Type 'help' for available commands.`);
    }
  } catch (err: unknown) {
    const error = normalizeError(err);
    replSend(ws, `Error: ${error.message}`);
  }
  wsSend(ws, { op: 'prompt' });
}

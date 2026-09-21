// Codex integration routes — HTTP facade over Codex App Server WebSocket JSON-RPC.
//
// The browser and other Vestara clients talk to /api/codex/*. Credentials and
// upstream transport details stay server-side, matching the OpenCode API shape.

import type * as http from 'node:http';
import {
  CodexAppServerClient,
  type CodexAppServerNotification,
  CodexConfigError,
  type CodexRuntimeConfig,
  type CodexThread,
  type CodexTurnInputPart,
  resolveCodexRuntimeConfig,
} from '@vestara/codex-runtime';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

export interface CachedCodexClient {
  readonly client: CodexAppServerClient;
  readonly config: CodexRuntimeConfig;
  readonly detachNotifications: () => void;
  readonly sessionId: string;
  readonly connectedClients: Set<string>;
  readonly threads: Map<string, CodexThread>;
  readonly createdAt: string;
  ready: Promise<void>;
  lastSeenAt: string;
  lastEventAt?: string;
  turnsStarted: number;
}

interface BufferedCodexEvent {
  readonly sequence: number;
  readonly receivedAt: string;
  readonly event: CodexAppServerNotification;
}

let cachedClient: CachedCodexClient | undefined;
let codexEventSequence = 0;
const codexEventsByThread = new Map<string, BufferedCodexEvent[]>();
const codexSessions = new Map<string, CachedCodexClient>();
const CODEX_EVENT_BUFFER_LIMIT = 500;
const DEFAULT_CODEX_SESSION_ID = 'local';

export async function handleCodexRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  _ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'GET' && p === '/api/codex/health') {
    const started = Date.now();
    const config = resolveRouteConfig(req);
    const client = new CodexAppServerClient({ config });
    try {
      const healthy = await client.healthCheck();
      json(res, healthy ? 200 : 503, {
        integration: 'codex',
        status: healthy ? 'healthy' : 'unhealthy',
        reachable: healthy,
        upstream: { transport: 'websocket', url: config.appServerUrl },
        checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
      });
    } catch (error) {
      sendCodexError(res, error);
    }
    return true;
  }

  if (method === 'GET' && p === '/api/codex/status') {
    const started = Date.now();
    const config = resolveRouteConfig(req);
    let session = cachedClient?.config.appServerUrl === config.appServerUrl ? cachedClient : undefined;
    let reachable = false;
    let statusError: string | undefined;
    try {
      session = await getCodexClient(req);
      reachable = true;
      await refreshDiscoveredThreads(session);
    } catch (error) {
      reachable = false;
      statusError = error instanceof Error ? error.message : String(error);
    }
    json(res, 200, {
      integration: 'codex',
      status: reachable ? 'healthy' : 'unreachable',
      reachable,
      upstream: { transport: 'websocket', url: config.appServerUrl },
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      sessions: Array.from(codexSessions.values()).map(codexSessionSummary),
      activeSessionId: session?.sessionId ?? null,
      connectedClients: Array.from(codexSessions.values()).reduce(
        (sum, candidate) => sum + codexConnectedClientCount(candidate),
        0,
      ),
      ...(statusError ? { error: statusError } : {}),
    });
    return true;
  }

  if (method === 'POST' && p === '/api/codex/threads') {
    try {
      const body = parseJson(await readBody(req));
      const session = await getCodexClient(req, body?.appServerUrl, body?.sessionId);
      const params = objectOrEmpty(body?.params);
      const codex = await session.client.startThread(params);
      rememberThread(session, codex.thread);
      json(res, 201, { thread: codex.thread, codex, upstream: { url: session.config.appServerUrl } });
    } catch (error) {
      sendCodexError(res, error);
    }
    return true;
  }

  const threadReadMatch = p.match(/^\/api\/codex\/threads\/([^/]+)$/);
  if (method === 'GET' && threadReadMatch) {
    const threadId = decodeURIComponent(threadReadMatch[1]);
    try {
      const session = await getCodexClient(req);
      const includeTurns = queryBoolean(req, 'includeTurns') ?? true;
      const codex = await session.client.readThread({ threadId, includeTurns });
      rememberThread(session, codex.thread);
      json(res, 200, { thread: codex.thread, codex, upstream: { url: session.config.appServerUrl } });
    } catch (error) {
      sendCodexError(res, error);
    }
    return true;
  }

  const turnMatch = p.match(/^\/api\/codex\/threads\/([^/]+)\/turns$/);
  if (method === 'POST' && turnMatch) {
    const threadId = decodeURIComponent(turnMatch[1]);
    try {
      const body = parseJson(await readBody(req));
      const session = await getCodexClient(req, body?.appServerUrl, body?.sessionId);
      const input = parseTurnInput(body);
      const codex = await session.client.startTurn({ threadId, input });
      session.turnsStarted += 1;
      json(res, 202, { threadId, turn: codex.turn, codex, upstream: { url: session.config.appServerUrl } });
    } catch (error) {
      sendCodexError(res, error);
    }
    return true;
  }

  if (method === 'GET' && turnMatch) {
    const threadId = decodeURIComponent(turnMatch[1]);
    try {
      const session = await getCodexClient(req);
      const query = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams;
      const codex = await session.client.listThreadTurns({
        threadId,
        cursor: query.get('cursor') ?? undefined,
        limit: parsePositiveInteger(query.get('limit')) ?? undefined,
        sortDirection: query.get('sortDirection') === 'asc' ? 'asc' : 'desc',
        itemsView: parseItemsView(query.get('itemsView')) ?? 'summary',
      });
      json(res, 200, { threadId, turns: codex.data, codex, upstream: { url: session.config.appServerUrl } });
    } catch (error) {
      sendCodexError(res, error);
    }
    return true;
  }

  const turnReadMatch = p.match(/^\/api\/codex\/threads\/([^/]+)\/turns\/([^/]+)$/);
  if (method === 'GET' && turnReadMatch) {
    const threadId = decodeURIComponent(turnReadMatch[1]);
    const turnId = decodeURIComponent(turnReadMatch[2]);
    try {
      const session = await getCodexClient(req);
      const query = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams;
      const turns = await session.client.listThreadTurns({
        threadId,
        limit: parsePositiveInteger(query.get('limit')) ?? 100,
        sortDirection: 'desc',
        itemsView: parseItemsView(query.get('itemsView')) ?? 'summary',
      });
      const turn = turns.data.find((candidate) => candidate.id === turnId);
      const items = await session.client.listThreadItems({
        threadId,
        turnId,
        limit: parsePositiveInteger(query.get('itemLimit')) ?? 100,
        sortDirection: query.get('itemSortDirection') === 'asc' ? 'asc' : 'desc',
        itemsView: parseItemsView(query.get('itemsView')) ?? 'full',
      });
      json(res, 200, {
        threadId,
        turnId,
        turn,
        items: items.data,
        codex: { turns, items },
        upstream: { url: session.config.appServerUrl },
      });
    } catch (error) {
      sendCodexError(res, error);
    }
    return true;
  }

  const eventMatch = p.match(/^\/api\/codex\/threads\/([^/]+)\/events$/);
  if (method === 'GET' && eventMatch) {
    const threadId = decodeURIComponent(eventMatch[1]);
    try {
      const afterSequence = parsePositiveInteger(new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get('after'));
      const events = (codexEventsByThread.get(threadId) ?? []).filter((event) =>
        afterSequence === undefined ? true : event.sequence > afterSequence,
      );
      json(res, 200, {
        threadId,
        events,
        nextAfter: events.at(-1)?.sequence ?? afterSequence ?? 0,
        buffered: events.length,
      });
    } catch (error) {
      sendCodexError(res, error);
    }
    return true;
  }

  if (method === 'POST' && p === '/api/codex/disconnect') {
    const body = parseJson(await readBody(req).catch(() => ''));
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : undefined;
    await closeCachedCodexClient(sessionId);
    json(res, 200, { disconnected: true, sessionId: sessionId ?? null });
    return true;
  }

  return false;
}

export async function getCodexClient(
  req: http.IncomingMessage,
  appServerUrl?: unknown,
  requestedSessionId?: unknown,
): Promise<CachedCodexClient> {
  const config = resolveRouteConfig(req, typeof appServerUrl === 'string' ? appServerUrl : undefined);
  const sessionId = normalizeSessionId(requestedSessionId) ?? DEFAULT_CODEX_SESSION_ID;
  const existingById = codexSessions.get(sessionId);
  if (existingById?.config.appServerUrl === config.appServerUrl) {
    existingById.lastSeenAt = new Date().toISOString();
    cachedClient = existingById;
    await existingById.ready;
    return existingById;
  }
  if (cachedClient?.config.appServerUrl === config.appServerUrl && cachedClient.sessionId === sessionId) {
    cachedClient.lastSeenAt = new Date().toISOString();
    await cachedClient.ready;
    return cachedClient;
  }
  const client = new CodexAppServerClient({ config });
  const createdAt = new Date().toISOString();
  const detachNotifications = client.onNotification((notification) => recordCodexNotification(notification, sessionId));
  const next: CachedCodexClient = {
    client,
    config,
    sessionId,
    connectedClients: new Set(),
    threads: new Map(),
    createdAt,
    lastSeenAt: createdAt,
    detachNotifications,
    ready: client.initialize({ name: 'vestara-api', version: 'dev' }).then(() => undefined),
    turnsStarted: 0,
  };
  cachedClient = next;
  codexSessions.set(sessionId, next);
  try {
    await next.ready;
    return next;
  } catch (error) {
    if (cachedClient === next) cachedClient = undefined;
    codexSessions.delete(sessionId);
    detachNotifications();
    await client.close().catch(() => undefined);
    throw error;
  }
}

export function attachCodexClient(session: CachedCodexClient, clientId: string): () => void {
  session.connectedClients.add(clientId);
  session.lastSeenAt = new Date().toISOString();
  return () => {
    session.connectedClients.delete(clientId);
    session.lastSeenAt = new Date().toISOString();
  };
}

export function rememberThread(session: CachedCodexClient, thread: CodexThread | undefined): void {
  if (!thread?.id) return;
  session.threads.set(thread.id, thread);
  session.lastSeenAt = new Date().toISOString();
}

async function refreshDiscoveredThreads(session: CachedCodexClient): Promise<void> {
  const threads = await session.client.listThreads({ limit: 50, sortDirection: 'desc' });
  for (const thread of threads.data) rememberThread(session, thread);
}

export function codexRuntimeSnapshot(appServerUrl?: string): Record<string, unknown> {
  const config = resolveCodexRuntimeConfig({
    appServerUrl: appServerUrl ?? process.env.CODEX_APP_SERVER_URL ?? undefined,
  });
  const matching = Array.from(codexSessions.values()).filter(
    (session) => session.config.appServerUrl === config.appServerUrl,
  );
  return {
    integration: 'codex',
    upstream: { transport: 'websocket', url: config.appServerUrl },
    sessions: matching.map(codexSessionSummary),
    connectedClients: matching.reduce((sum, session) => sum + session.connectedClients.size, 0),
  };
}

export async function closeCachedCodexClient(sessionId?: string): Promise<void> {
  const targets = sessionId
    ? [codexSessions.get(sessionId)].filter((session): session is CachedCodexClient => Boolean(session))
    : Array.from(codexSessions.values());
  for (const current of targets) {
    if (cachedClient === current) cachedClient = undefined;
    codexSessions.delete(current.sessionId);
    current.detachNotifications();
    await current.client.close().catch(() => undefined);
  }
}

function resolveRouteConfig(req: http.IncomingMessage, appServerUrl?: string): CodexRuntimeConfig {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  return resolveCodexRuntimeConfig({
    appServerUrl: appServerUrl ?? url.searchParams.get('appServerUrl') ?? process.env.CODEX_APP_SERVER_URL ?? undefined,
  });
}

function queryBoolean(req: http.IncomingMessage, key: string): boolean | undefined {
  const value = new URL(req.url ?? '/', 'http://127.0.0.1').searchParams.get(key);
  if (value === null) return undefined;
  return value === '1' || value === 'true' || value === 'yes';
}

function parsePositiveInteger(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseItemsView(value: string | null): 'notLoaded' | 'summary' | 'full' | undefined {
  return value === 'notLoaded' || value === 'summary' || value === 'full' ? value : undefined;
}

function recordCodexNotification(event: CodexAppServerNotification, sessionId?: string): void {
  const threadId = threadIdOf(event);
  const session = sessionId ? codexSessions.get(sessionId) : undefined;
  if (session) {
    session.lastEventAt = new Date().toISOString();
    session.lastSeenAt = session.lastEventAt;
  }
  if (!threadId) return;
  const buffered: BufferedCodexEvent = {
    sequence: ++codexEventSequence,
    receivedAt: new Date().toISOString(),
    event,
  };
  const events = codexEventsByThread.get(threadId) ?? [];
  events.push(buffered);
  while (events.length > CODEX_EVENT_BUFFER_LIMIT) events.shift();
  codexEventsByThread.set(threadId, events);
}

function normalizeSessionId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 120) : undefined;
}

function codexSessionSummary(session: CachedCodexClient): Record<string, unknown> {
  const threads = Array.from(session.threads.values()).map((thread) => ({
    id: thread.id,
    sessionId: thread.sessionId,
    cwd: thread.cwd,
    modelProvider: thread.modelProvider,
    preview: typeof thread.preview === 'string' ? thread.preview : undefined,
    source: typeof thread.source === 'string' ? thread.source : undefined,
    status: thread.status,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    bufferedEvents: codexEventsByThread.get(thread.id)?.length ?? 0,
  }));
  return {
    id: session.sessionId,
    appServerUrl: session.config.appServerUrl,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    lastEventAt: session.lastEventAt,
    connectedClients: codexConnectedClientCount(session),
    apiClients: session.connectedClients.size,
    appServerClientConnected: session.client.isConnected,
    threadCount: threads.length,
    turnsStarted: session.turnsStarted,
    threads,
  };
}

function codexConnectedClientCount(session: CachedCodexClient): number {
  return session.connectedClients.size + (session.client.isConnected ? 1 : 0);
}

function threadIdOf(event: CodexAppServerNotification): string | undefined {
  const params = event.params;
  if (params === null || typeof params !== 'object') return undefined;
  const record = params as Record<string, unknown>;
  if (typeof record.threadId === 'string') return record.threadId;
  const thread = record.thread;
  if (thread !== null && typeof thread === 'object') {
    const id = (thread as Record<string, unknown>).id;
    if (typeof id === 'string') return id;
  }
  return undefined;
}

function parseTurnInput(body: Record<string, unknown> | null): readonly CodexTurnInputPart[] {
  if (Array.isArray(body?.input)) {
    return body.input.map((part) => {
      if (part === null || typeof part !== 'object') {
        throw new CodexConfigError('input parts must be objects');
      }
      const record = part as Record<string, unknown>;
      if (record.type !== 'text' || typeof record.text !== 'string' || !record.text.trim()) {
        throw new CodexConfigError('only non-empty text input parts are supported');
      }
      return { type: 'text', text: record.text };
    });
  }
  if (typeof body?.text === 'string' && body.text.trim()) {
    return [{ type: 'text', text: body.text }];
  }
  throw new CodexConfigError('text or input is required');
}

function parseJson(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return null;
  const parsed = JSON.parse(raw) as unknown;
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function sendCodexError(res: http.ServerResponse, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const status = error instanceof CodexConfigError ? 400 : 503;
  json(res, status, {
    error: {
      code: error instanceof CodexConfigError ? 'CODEX_INVALID_CONFIGURATION' : 'CODEX_UPSTREAM_UNAVAILABLE',
      message,
    },
  });
}

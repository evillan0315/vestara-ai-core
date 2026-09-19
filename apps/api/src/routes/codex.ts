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
  type CodexTurnInputPart,
  resolveCodexRuntimeConfig,
} from '@vestara/codex-runtime';
import type { WorkspaceContext } from '../workspace-context';
import { json, readBody } from './types';

interface CachedCodexClient {
  readonly client: CodexAppServerClient;
  readonly config: CodexRuntimeConfig;
  readonly detachNotifications: () => void;
  ready: Promise<void>;
}

interface BufferedCodexEvent {
  readonly sequence: number;
  readonly receivedAt: string;
  readonly event: CodexAppServerNotification;
}

let cachedClient: CachedCodexClient | undefined;
let codexEventSequence = 0;
const codexEventsByThread = new Map<string, BufferedCodexEvent[]>();
const CODEX_EVENT_BUFFER_LIMIT = 500;

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

  if (method === 'POST' && p === '/api/codex/threads') {
    try {
      const body = parseJson(await readBody(req));
      const session = await getCodexClient(req, body?.appServerUrl);
      const params = objectOrEmpty(body?.params);
      const codex = await session.client.startThread(params);
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
      const session = await getCodexClient(req, body?.appServerUrl);
      const input = parseTurnInput(body);
      const codex = await session.client.startTurn({ threadId, input });
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
    await closeCachedCodexClient();
    json(res, 200, { disconnected: true });
    return true;
  }

  return false;
}

async function getCodexClient(req: http.IncomingMessage, appServerUrl?: unknown): Promise<CachedCodexClient> {
  const config = resolveRouteConfig(req, typeof appServerUrl === 'string' ? appServerUrl : undefined);
  if (cachedClient?.config.appServerUrl === config.appServerUrl) {
    await cachedClient.ready;
    return cachedClient;
  }
  await closeCachedCodexClient();
  const client = new CodexAppServerClient({ config });
  const detachNotifications = client.onNotification(recordCodexNotification);
  const next: CachedCodexClient = {
    client,
    config,
    detachNotifications,
    ready: client.initialize({ name: 'vestara-api', version: 'dev' }).then(() => undefined),
  };
  cachedClient = next;
  try {
    await next.ready;
    return next;
  } catch (error) {
    if (cachedClient === next) cachedClient = undefined;
    detachNotifications();
    await client.close().catch(() => undefined);
    throw error;
  }
}

async function closeCachedCodexClient(): Promise<void> {
  const current = cachedClient;
  cachedClient = undefined;
  current?.detachNotifications();
  await current?.client.close().catch(() => undefined);
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

function recordCodexNotification(event: CodexAppServerNotification): void {
  const threadId = threadIdOf(event);
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

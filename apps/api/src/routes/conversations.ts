import type * as http from 'node:http';
import type { TurnSurfaceContext } from '@vestara/shared';
import { type ConversationChunk, TUI_PROTOCOL_VERSION } from '@vestara/tui-protocol';
import type { WorkspaceContext } from '../workspace-context';
import { CORS, json, readBody } from './types';

const ACTOR = 'workspace-ui';

/**
 * GA-CONTEXT-002: bound/validate the browser-supplied surface context.
 * Trusted client navigation state — bounded strings only, never instructions,
 * never repository/execution authority. Malformed values degrade to undefined
 * (backward compatible: callers without surface context keep working).
 */
function normalizeSurfaceContext(value: unknown): TurnSurfaceContext | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const workspace = raw.workspace as Record<string, unknown> | undefined;
  const surface = raw.surface as Record<string, unknown> | undefined;
  if (!workspace || !surface) return undefined;
  const str = (v: unknown, max: number): string | undefined =>
    typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined;
  const nullableStr = (v: unknown, max: number): string | null => (typeof v === 'string' ? v.slice(0, max) : null);
  const ws = { id: str(workspace.id, 200), name: str(workspace.name, 200) };
  const sf = {
    routeId: nullableStr(surface.routeId, 200),
    path: str(surface.path, 500),
    title: nullableStr(surface.title, 200),
    section: nullableStr(surface.section, 200),
  };
  if (!ws.id || !ws.name || !sf.path) return undefined;
  const selectedRaw = raw.selected as Record<string, unknown> | undefined;
  const selectedKind = selectedRaw ? str(selectedRaw.kind, 200) : undefined;
  const selectedId = selectedRaw ? str(selectedRaw.id, 200) : undefined;
  const selectedLabel = selectedRaw ? str(selectedRaw.label, 500) : undefined;
  return {
    workspace: { id: ws.id, name: ws.name },
    surface: { routeId: sf.routeId, path: sf.path, title: sf.title, section: sf.section },
    ...(selectedKind && selectedId
      ? { selected: { kind: selectedKind, id: selectedId, ...(selectedLabel ? { label: selectedLabel } : {}) } }
      : {}),
  };
}

/**
 * Conversations REST resource. Persisted via `ctx.conversationService` (the
 * SQLite-backed engine), with the same tool-aware generation the chat route
 * uses. `/api/chat/*` remains as a thin alias for compatibility.
 */
export async function handleConversationsRoute(
  method: string,
  p: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: WorkspaceContext,
): Promise<boolean> {
  if (method === 'POST' && p === '/api/conversations') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const conversation = await ctx.conversationService.createConversation(
      typeof body.userId === 'string' ? body.userId : 'local',
    );
    json(res, 201, { conversation });
    return true;
  }

  if (method === 'GET' && p === '/api/conversations') {
    const userId = (req.headers?.['x-vestara-actor'] as string) || ACTOR;
    const conversations = await ctx.conversationService.listConversations(userId);
    json(res, 200, { conversations });
    return true;
  }

  const match = p.match(/^\/api\/conversations\/([^/]+)(?:\/(messages|stream))?$/);
  if (!match) return false;
  const conversationId = decodeURIComponent(match[1] as string);
  const action = match[2];

  if (method === 'GET' && !action) {
    const conversation = await ctx.conversationService.getConversation(conversationId);
    if (!conversation) {
      json(res, 404, { error: 'Conversation not found' });
      return true;
    }
    json(res, 200, { conversation });
    return true;
  }

  if (method === 'DELETE' && !action) {
    await ctx.conversationService.deleteConversation(conversationId);
    json(res, 200, { ok: true });
    return true;
  }

  if (method === 'POST' && action === 'messages') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const message = body.message?.trim();
    if (!message) {
      json(res, 400, { error: 'message is required' });
      return true;
    }
    try {
      const result = await ctx.conversationService.sendMessage(conversationId, message, {
        model: typeof body.model === 'string' && body.model ? body.model : undefined,
      });
      json(res, 200, { message: result.message, response: result.response, latency: result.latency });
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : 'Send failed' });
    }
    return true;
  }

  if (method === 'POST' && action === 'stream') {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const message = body.message?.trim();
    if (!message) {
      json(res, 400, { error: 'message is required' });
      return true;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...CORS,
    });
    let sequence = 0;
    const emit = (event: ConversationChunk['event']) => {
      res.write(
        `data: ${JSON.stringify({
          schemaVersion: TUI_PROTOCOL_VERSION,
          conversationId,
          messageId: `msg-${Date.now()}`,
          sequence: sequence++,
          timestamp: new Date().toISOString(),
          event,
        } satisfies ConversationChunk)}\n\n`,
      );
    };
    try {
      const surfaceContext = normalizeSurfaceContext(body.surfaceContext);
      for await (const chunk of ctx.conversationService.sendMessageStream(conversationId, message, {
        model: typeof body.model === 'string' && body.model ? body.model : undefined,
        surfaceContext,
      })) {
        if (chunk.type === 'text' && chunk.content) {
          emit({ type: 'delta', content: chunk.content });
        } else if (chunk.type === 'tool_call') {
          // GA-UX-PREMIUM M3: tool start rides the existing `tool` event with
          // the structured execution detail (additive — legacy clients ignore
          // the extra field and keep using name/content).
          emit({
            type: 'tool',
            content: chunk.content ?? '',
            name: chunk.name,
            ...(chunk.detail ? { execution: chunk.detail } : {}),
          });
        } else if (chunk.type === 'tool_result') {
          emit({
            type: 'tool_result',
            content: chunk.content ?? '',
            name: chunk.name,
            ...(chunk.detail ? { execution: chunk.detail } : {}),
          });
        } else if (chunk.type === 'status') {
          // GA-UX-PREMIUM M3: operational status + optional execution detail
          // (permission/task/edit projections ride the status channel).
          emit({
            type: 'status',
            content: chunk.content ?? '',
            ...(chunk.detail ? { execution: chunk.detail } : {}),
          });
        } else if (chunk.type === 'error') {
          emit({ type: 'error', content: chunk.content ?? 'Stream failed' });
        } else if (chunk.type === 'complete') {
          emit({ type: 'done' });
        }
      }
    } catch (error) {
      emit({ type: 'error', content: error instanceof Error ? error.message : 'Stream failed' });
    } finally {
      res.end();
    }
    return true;
  }

  return false;
}

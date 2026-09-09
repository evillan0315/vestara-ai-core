import type * as http from 'node:http';
import type { TurnSurfaceContext } from '@vestara/shared';
import { type ConversationChunk, TUI_PROTOCOL_VERSION } from '@vestara/tui-protocol';
import type { WorkspaceContext } from '../workspace-context';
import { CORS, json, readBody } from './types';

const ACTOR = 'workspace-ui';

/**
 * GA-RUNTIME-001 G: resolve the browser-REQUESTED provider/model into the
 * authoritative execution binding. The server validates provider existence,
 * model existence and provider/model compatibility against the canonical
 * OpenCode runtime discovery. Unresolvable requests throw a deterministic
 * `AssistantBindingError` (never silently fall back while displaying the
 * requested model).
 */
async function resolveExecutionBinding(
  ctx: WorkspaceContext,
  body: Record<string, unknown>,
): Promise<{ provider: string; model: string } | undefined> {
  const provider = typeof body.provider === 'string' && body.provider ? body.provider : undefined;
  const model = typeof body.model === 'string' && body.model ? body.model : undefined;
  if (!provider && !model) return undefined;
  const binding = await ctx.assistantBindingResolver.resolve({ providerId: provider, modelId: model });
  return { provider: binding.providerID, model: binding.modelID };
}

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
    const userId = typeof body.userId === 'string' ? body.userId : 'local';
    const runtimeSessionId =
      typeof body.runtimeSessionId === 'string' && body.runtimeSessionId ? body.runtimeSessionId : undefined;

    // GA-SESSION-003: when a runtimeSessionId is provided, verify the session
    // exists and its directory matches the authoritative repository root before
    // binding it to the new conversation. Fail closed on any mismatch.
    if (runtimeSessionId) {
      try {
        const session = await ctx.opencodeRuntime.getSession(runtimeSessionId, {
          workspaceId: ctx.runtime.getSession?.().fingerprint?.id ?? 'workspace',
          directory: ctx.repoPath,
          correlationId: `conv-resume-${Date.now()}`,
        });
        if (!session.directory) {
          json(res, 400, { error: 'Session directory unverifiable' });
          return true;
        }
        const { resolve } = await import('node:path');
        const normalizedSessionDir = resolve(session.directory);
        const normalizedRepoDir = resolve(ctx.repoPath);
        if (normalizedSessionDir !== normalizedRepoDir) {
          json(res, 400, { error: 'Session directory does not match repository' });
          return true;
        }
      } catch {
        json(res, 400, { error: 'Session not found' });
        return true;
      }
    }

    const conversation = await ctx.conversationService.createConversation(userId, { runtimeSessionId });

    // GA-SESSION-003: pre-adopt the verified session into the registry so the
    // first sendMessageStream → acquire() finds the binding and skips the
    // redundant liveness probe (which can race with OpenCode state changes).
    if (runtimeSessionId && conversation.id) {
      ctx.assistantConversationSessions.set(conversation.id, {
        sessionId: runtimeSessionId,
        repositoryDir: ctx.repoPath,
        createdAt: new Date().toISOString(),
      });
    }

    json(res, 201, { conversation });
    return true;
  }

  if (method === 'GET' && p === '/api/conversations') {
    const userId = (req.headers?.['x-vestara-actor'] as string) || ACTOR;
    const conversations = await ctx.conversationService.listConversations(userId);
    json(res, 200, { conversations });
    return true;
  }

  // GA-RUNTIME-001 B: interactive permission/question decisions must be
  // matched BEFORE the messages/stream guard — their paths
  // (/permissions/:id, /questions/:id) do not match that guard and would
  // otherwise return false (404) so the browser Allow button never resolves.
  const earlyPermissionMatch = p.match(/^\/api\/conversations\/([^/]+)\/permissions\/([^/]+)$/);
  if (earlyPermissionMatch && method === 'POST') {
    const earlyConversationId = decodeURIComponent(earlyPermissionMatch[1] as string);
    const permissionId = decodeURIComponent(earlyPermissionMatch[2] as string);
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const decision = body.decision;
    if (decision !== 'allow-once' && decision !== 'allow-session' && decision !== 'deny') {
      json(res, 400, { error: 'decision must be allow-once, allow-session, or deny' });
      return true;
    }
    const resolved = ctx.assistantInteractionBroker.decidePermission(
      earlyConversationId,
      permissionId,
      decision === 'deny'
        ? { decision: 'reject', reason: typeof body.reason === 'string' ? body.reason : 'Denied by user' }
        : { decision: 'approve', scope: decision === 'allow-session' ? 'session' : 'once' },
    );
    if (!resolved) {
      json(res, 404, { error: 'No pending permission request for this id' });
      return true;
    }
    json(res, 200, { ok: true, permissionId });
    return true;
  }
  const earlyQuestionMatch = p.match(/^\/api\/conversations\/([^/]+)\/questions\/([^/]+)$/);
  if (earlyQuestionMatch && method === 'POST') {
    const earlyConversationId = decodeURIComponent(earlyQuestionMatch[1] as string);
    const requestId = decodeURIComponent(earlyQuestionMatch[2] as string);
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const answers = body.answers;
    if (!Array.isArray(answers) || answers.length === 0) {
      json(res, 400, { error: 'answers must be a non-empty array of option selections' });
      return true;
    }
    const sanitized = answers
      .map((answer) =>
        Array.isArray(answer) ? answer.map((label) => String(label).slice(0, 200)).filter(Boolean) : [],
      )
      .filter((answer: string[]) => answer.length > 0);
    if (sanitized.length === 0) {
      json(res, 400, { error: 'answers must contain at least one selection' });
      return true;
    }
    const resolved = ctx.assistantInteractionBroker.decideQuestion(earlyConversationId, requestId, {
      answers: sanitized,
    });
    if (!resolved) {
      json(res, 404, { error: 'No pending question for this id' });
      return true;
    }
    json(res, 200, { ok: true, requestId });
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
    let binding: { provider: string; model: string } | undefined;
    try {
      binding = await resolveExecutionBinding(ctx, body);
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : 'Invalid provider/model' });
      return true;
    }
    try {
      const result = await ctx.conversationService.sendMessage(conversationId, message, {
        model: binding?.model ?? (typeof body.model === 'string' && body.model ? body.model : undefined),
        provider: binding?.provider,
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
    // GA-RUNTIME-001 G: validate the requested provider/model BEFORE the SSE
    // stream starts — deterministic 400, never a silent default execution.
    let binding: { provider: string; model: string } | undefined;
    try {
      binding = await resolveExecutionBinding(ctx, body);
    } catch (error) {
      json(res, 400, { error: error instanceof Error ? error.message : 'Invalid provider/model' });
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
    // GA-RUNTIME-001 L: closing the Vestara SSE response alone is NOT
    // cancellation — this signal drives the adapter's authoritative
    // OpenCode interrupt (abortSession) so the reused session settles.
    const abort = new AbortController();
    const onClose = () => abort.abort();
    res.on('close', onClose);
    try {
      const surfaceContext = normalizeSurfaceContext(body.surfaceContext);
      for await (const chunk of ctx.conversationService.sendMessageStream(conversationId, message, {
        model: binding?.model ?? (typeof body.model === 'string' && body.model ? body.model : undefined),
        provider: binding?.provider,
        surfaceContext,
        signal: abort.signal,
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
      res.removeListener('close', onClose);
      res.end();
    }
    return true;
  }

  return false;
}

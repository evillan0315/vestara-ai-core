import type * as http from 'node:http';
import type { GAExecutionConfig, TurnSurfaceContext } from '@vestara/shared';
import { type ConversationChunk, TUI_PROTOCOL_VERSION } from '@vestara/tui-protocol';
import type { WorkspaceContext } from '../workspace-context';
import { CORS, json, readBody } from './types';

const ACTOR = 'workspace-ui';

// ─── Explicit Stop (user-initiated cancellation) ────────────
// In-flight turn AbortControllers keyed by conversationId. The stream
// handler registers its controller here; POST /cancel fires ONLY the
// matching controller. HTTP/SSE disconnect NEVER touches this map —
// detach stays detach. Firing the signal is the existing GA-DETACH-001
// authority: the adapter classifies signal-abort as 'cancelled' and
// aborts the OpenCode session in its finally block. No second authority.
const inflightTurnControllers = new Map<string, AbortController>();

/** Register the in-flight turn controller (test-visible). */
export function registerTurnController(conversationId: string, controller: AbortController): void {
  inflightTurnControllers.set(conversationId, controller);
}

/** Release the controller when the turn settles (test-visible). */
export function releaseTurnController(conversationId: string, controller: AbortController): void {
  if (inflightTurnControllers.get(conversationId) === controller) {
    inflightTurnControllers.delete(conversationId);
  }
}

/**
 * Whether a Vestara execution is actively running for this conversation.
 * Authoritative server truth for reload/reattach discovery: the in-flight
 * turn controller exists from stream-start until turn settle (complete,
 * failed, timeout, or explicit cancel). Browser reload never clears it —
 * only turn settlement or POST /cancel does. UI must query this (via
 * GET /active) after reload and reattach/poll rather than starting a
 * second turn.
 */
export function isTurnActive(conversationId: string): boolean {
  return inflightTurnControllers.has(conversationId);
}

/**
 * Fire ONLY the matching turn's signal. Returns true when a controller
 * was signalled. Repeated calls are safe (AbortController.abort is a
 * no-op after the first fire); unknown ids return false.
 */
export function cancelTurn(conversationId: string): boolean {
  const controller = inflightTurnControllers.get(conversationId);
  if (!controller) return false;
  controller.abort();
  return true;
}

// ─── GA-EXEC-001: Execution Config Validation ──────────────────

/** Bounds for GA execution config values (Vestara-owned limits). */
const EXEC_CFG_BOUNDS = {
  turnTimeoutMs: { min: 10_000, max: 60 * 60_000 }, // 10s–60min
  maxToolCalls: { min: 0, max: 200 }, // 0 = unlimited (adapter: maxToolCalls>0 check)
} as const;

/**
 * Parse and validate the browser-supplied execution config. Returns undefined
 * when absent or invalid (fail-safe: use adapter defaults). Never throws —
 * invalid values are silently ignored.
 */
function parseExecutionConfig(raw: unknown): GAExecutionConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const fields: Record<string, number> = {};
  if (obj.turnTimeoutMs !== undefined) {
    const n = Number(obj.turnTimeoutMs);
    if (Number.isFinite(n) && n >= EXEC_CFG_BOUNDS.turnTimeoutMs.min && n <= EXEC_CFG_BOUNDS.turnTimeoutMs.max) {
      fields.turnTimeoutMs = n;
    }
  }
  if (obj.maxToolCalls !== undefined) {
    const n = Number(obj.maxToolCalls);
    if (Number.isFinite(n) && n >= EXEC_CFG_BOUNDS.maxToolCalls.min && n <= EXEC_CFG_BOUNDS.maxToolCalls.max) {
      fields.maxToolCalls = Math.floor(n);
    }
  }
  return Object.keys(fields).length > 0 ? (fields as GAExecutionConfig) : undefined;
}

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
    const userId = typeof body.userId === 'string' ? body.userId : ACTOR;
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
    const url = new URL(req.url ?? '', 'http://127.0.0.1');
    // VES-PERF-001C: bounded summary page. Message bodies are never returned.
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '25'), 100);
    const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0);
    const page = await ctx.conversationService.listConversationsPage(userId, { limit, offset });
    json(res, 200, {
      conversations: page.conversations,
      pagination: { total: page.total, offset: page.offset, limit: page.limit, hasMore: page.hasMore },
    });
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

  // Explicit Stop: cancel ONLY the matching in-flight turn. Disconnect,
  // navigation, and SSE close never reach this endpoint — they only set
  // clientDisconnected in the stream handler. Unknown/stale ids are NOT
  // errors (Stop is idempotent; the turn may already have settled).
  const cancelMatch = p.match(/^\/api\/conversations\/([^/]+)\/cancel$/);
  if (cancelMatch && method === 'POST') {
    const cancelId = decodeURIComponent(cancelMatch[1] as string);
    const cancelled = cancelTurn(cancelId);
    json(
      res,
      200,
      cancelled
        ? { cancelled: true, conversationId: cancelId }
        : { cancelled: false, reason: 'no_inflight_turn', conversationId: cancelId },
    );
    return true;
  }

  // Reattach discovery: authoritative active-execution truth for a
  // reloaded UI. Returns whether a Vestara turn is in-flight for this
  // conversation plus the persisted OpenCode runtime/session identity
  // (conversation.runtimeSessionId) so the client can reattach/poll the
  // SAME execution instead of starting a second one. Never creates work.
  const activeMatch = p.match(/^\/api\/conversations\/([^/]+)\/active$/);
  if (activeMatch && method === 'GET') {
    const activeId = decodeURIComponent(activeMatch[1] as string);
    const conversation = await ctx.conversationService.getConversation(activeId, { limit: 0, offset: 0 });
    if (!conversation) {
      json(res, 404, { error: 'Conversation not found' });
      return true;
    }
    json(res, 200, {
      conversationId: activeId,
      active: isTurnActive(activeId),
      ...(conversation.runtimeSessionId ? { runtimeSessionId: conversation.runtimeSessionId } : {}),
    });
    return true;
  }

  const match = p.match(/^\/api\/conversations\/([^/]+)(?:\/(messages|stream))?$/);
  if (!match) return false;
  const conversationId = decodeURIComponent(match[1] as string);
  const action = match[2];

  if (method === 'GET' && !action) {
    const url = new URL(req.url ?? '', 'http://127.0.0.1');
    const limit = Math.min(Number(url.searchParams.get('limit') ?? '50'), 100);
    const offset = Math.max(Number(url.searchParams.get('offset') ?? '0'), 0);
    // VES-PERF-001B: newest-window-first by default; `order=asc` selects the oldest window.
    const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc';

    const conversation = await ctx.conversationService.getConversation(conversationId, {
      limit,
      offset,
      order,
    });
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
    // Reattach ≠ create: while a turn is in-flight for this conversation,
    // a second POST /stream must NOT start a duplicate execution (a reloaded
    // UI reattaching would otherwise manufacture a second OpenCode session).
    // The reloaded client must query GET /active and poll instead.
    if (isTurnActive(conversationId)) {
      json(res, 409, { error: 'conversation-busy', conversationId });
      return true;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...CORS,
    });
    let sequence = 0;
    let clientDisconnected = false;

    // GA-DETACH-001: Detect client disconnect. When the client disconnects,
    // we stop sending events but do NOT abort the execution. The OpenCode
    // session continues server-side for later reattachment.
    const onClientDisconnect = () => {
      clientDisconnected = true;
    };
    res.on('close', onClientDisconnect);

    const emit = (event: ConversationChunk['event']): boolean => {
      if (clientDisconnected) return false;
      try {
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
        return true;
      } catch {
        // Response is closed — client disconnected
        clientDisconnected = true;
        return false;
      }
    };
    // GA-DETACH-001: Client disconnect does NOT abort the execution.
    // The OpenCode session continues server-side. Only explicit cancellation
    // (Stop button → POST /cancel) terminates the execution. The adapter's
    // finally block uses TurnTermination to decide whether to abort.
    //
    // We use a AbortController that is NEVER triggered by client disconnect.
    // It can only be triggered by explicit cancellation via the cancel endpoint.
    const abort = new AbortController();
    registerTurnController(conversationId, abort);
    // DO NOT link res.on('close') to abort.abort() — that would detach=cancel.
    // The signal is passed to sendMessageStream but only fires on explicit cancel.
    try {
      const surfaceContext = normalizeSurfaceContext(body.surfaceContext);
      const executionConfig = parseExecutionConfig(body.executionConfig);
      for await (const chunk of ctx.conversationService.sendMessageStream(conversationId, message, {
        model: binding?.model ?? (typeof body.model === 'string' && body.model ? body.model : undefined),
        provider: binding?.provider,
        surfaceContext,
        signal: abort.signal,
        executionConfig,
      })) {
        // GA-DETACH-001: If the client disconnected, DRAIN the execution to
        // natural completion instead of breaking. Breaking the for-await
        // calls generator.return() on sendMessageStream → the adapter
        // finally → abortSession, which made reload == cancel. Draining
        // keeps UI lifetime ≠ execution lifetime: the turn persists its
        // full assistant message truthfully while the closed transport
        // simply stops receiving events. Reattach polls GET /active +
        // GET conversation; it never opens a second stream (409 above).
        if (clientDisconnected) continue;

        if (chunk.type === 'text' && chunk.content) {
          if (!emit({ type: 'delta', content: chunk.content })) continue;
        } else if (chunk.type === 'tool_call') {
          if (
            !emit({
              type: 'tool',
              content: chunk.content ?? '',
              name: chunk.name,
              ...(chunk.detail ? { execution: chunk.detail } : {}),
            })
          )
            continue;
        } else if (chunk.type === 'tool_result') {
          if (
            !emit({
              type: 'tool_result',
              content: chunk.content ?? '',
              name: chunk.name,
              ...(chunk.detail ? { execution: chunk.detail } : {}),
            })
          )
            continue;
        } else if (chunk.type === 'status') {
          if (
            !emit({
              type: 'status',
              content: chunk.content ?? '',
              ...(chunk.detail ? { execution: chunk.detail } : {}),
            })
          )
            continue;
        } else if (chunk.type === 'error') {
          emit({ type: 'error', content: chunk.content ?? 'Stream failed' });
        } else if (chunk.type === 'complete') {
          emit({ type: 'done' });
        }
      }
    } catch (error) {
      emit({ type: 'error', content: error instanceof Error ? error.message : 'Stream failed' });
    } finally {
      releaseTurnController(conversationId, abort);
      res.removeListener('close', onClientDisconnect);
      res.end();
    }
    return true;
  }

  return false;
}

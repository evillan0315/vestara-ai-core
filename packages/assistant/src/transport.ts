/**
 * Framework-free client for the Vestara assistant conversation API.
 * Contracts: apps/api/src/routes/auth.ts (login/me) and
 * apps/api/src/routes/conversations.ts (create/messages/stream).
 * Transport failures reject — callers fall back to fixtures (offline-first).
 *
 * Ported from apps/workspace-ui-v2/src/lib/assistant-api.ts with two
 * forward-compatible extensions for the stage-2 store:
 * - `streamAssistantMessage` accepts an `executionConfig` (per-turn
 *   tool-call budget / timeout, GA-EXEC-001) and an `onEvent` hook that
 *   receives every non-delta frame (tool/tool_result/status/permission/
 *   question) instead of dropping them.
 * - `getConversation` returns messages with `toolObservations` so the
 *   store can rehydrate the durable tool timeline after reselect/reload.
 *
 * No `import.meta` here (this package compiles to CJS): the app passes its
 * own base URL (v1 same-origin proxy `''`, v2 `VITE_API_URL`).
 */

import { parseStreamFrames } from './sse.js';

export class AssistantApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AssistantApiError';
    this.status = status;
  }
}

interface ErrorBody {
  error?: string;
}

type FetchFn = typeof fetch;

async function readError(res: Response, fallback: string): Promise<AssistantApiError> {
  let message = fallback;
  try {
    const data = (await res.json()) as ErrorBody;
    if (data?.error) message = data.error;
  } catch {
    // Non-JSON error body — keep the fallback.
  }
  return new AssistantApiError(res.status, message);
}

async function postJson<T>(fetchFn: FetchFn, base: string, path: string, body: unknown, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(`${base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AssistantApiError(0, 'Assistant API unreachable');
  }
  if (!res.ok) throw await readError(res, `Request failed (${res.status})`);
  return (await res.json()) as T;
}

async function getJson<T>(fetchFn: FetchFn, base: string, path: string, token: string): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(`${base}${path}`, {
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    throw new AssistantApiError(0, 'Assistant API unreachable');
  }
  if (!res.ok) throw await readError(res, `Request failed (${res.status})`);
  return (await res.json()) as T;
}

export interface AssistantSession {
  token: string;
  username: string;
}

/** POST /api/auth/login — public; the API auto-registers unknown usernames. */
export async function loginAssistant(fetchFn: FetchFn, base: string, username: string): Promise<AssistantSession> {
  const data = await postJson<{ user?: { token?: string; username?: string } }>(fetchFn, base, '/api/auth/login', {
    username,
  });
  if (!data?.user?.token) throw new AssistantApiError(500, 'Login returned no token');
  return { token: data.user.token, username: data.user.username ?? username };
}

export interface PasswordLoginResult {
  session?: AssistantSession;
  /** True when the password verified but TOTP MFA is required to finish. */
  mfaRequired: boolean;
  username: string;
}

/** POST /api/auth/password — password login; may challenge for MFA. */
export async function loginWithPassword(
  fetchFn: FetchFn,
  base: string,
  username: string,
  password: string,
): Promise<PasswordLoginResult> {
  const data = await postJson<{
    user?: { token?: string; username?: string };
    mfaRequired?: boolean;
    username?: string;
    error?: string;
  }>(fetchFn, base, '/api/auth/password', { username, password });
  if (data?.mfaRequired) return { mfaRequired: true, username: data.username ?? username };
  if (!data?.user?.token) throw new AssistantApiError(500, 'Login returned no token');
  return {
    session: { token: data.user.token, username: data.user.username ?? username },
    mfaRequired: false,
    username: data.user.username ?? username,
  };
}

/** POST /api/auth/mfa/verify — finish an MFA-challenged login. */
export async function verifyMfaCode(
  fetchFn: FetchFn,
  base: string,
  username: string,
  code: string,
): Promise<AssistantSession> {
  const data = await postJson<{ user?: { token?: string; username?: string } }>(fetchFn, base, '/api/auth/mfa/verify', {
    username,
    code,
  });
  if (!data?.user?.token) throw new AssistantApiError(500, 'MFA verification returned no token');
  return { token: data.user.token, username: data.user.username ?? username };
}

/**
 * GET /api/auth/me — true when the token is accepted.
 * Returns false on 401; rethrows transport failures (status 0) so callers
 * can distinguish offline from signed-out.
 */
export async function validateAssistantToken(fetchFn: FetchFn, base: string, token: string): Promise<boolean> {
  try {
    await getJson(fetchFn, base, '/api/auth/me', token);
    return true;
  } catch (e) {
    if (e instanceof AssistantApiError && e.status === 0) throw e;
    return false;
  }
}

export interface AssistantIdentity {
  name: string;
  role: string;
  username: string;
}

/**
 * GET /api/auth/me — session identity for the login shell (display name,
 * role). Rejects on 401/offline so callers fall back to fixture metadata.
 */
export async function fetchAssistantIdentity(
  fetchFn: FetchFn,
  base: string,
  token: string,
): Promise<AssistantIdentity> {
  const data = await getJson<{
    user?: { name?: string; role?: string };
    currentUser?: { username?: string; role?: string };
  }>(fetchFn, base, '/api/auth/me', token);
  const username = data?.currentUser?.username ?? data?.user?.name ?? '';
  if (!username) throw new AssistantApiError(500, 'Session identity returned no user');
  return {
    name: username,
    username,
    role: data?.currentUser?.role ?? data?.user?.role ?? 'user',
  };
}

/** POST /api/conversations — returns the conversation id. */
export async function createAssistantConversation(fetchFn: FetchFn, base: string, token: string): Promise<string> {
  const data = await postJson<{ conversation?: { id?: string } }>(fetchFn, base, '/api/conversations', {}, token);
  if (!data?.conversation?.id) throw new AssistantApiError(500, 'Conversation creation returned no id');
  return data.conversation.id;
}

/** Persisted tool evidence for timeline rehydration (GA-CTX-001). */
export interface ToolObservation {
  readonly toolCallId: string;
  readonly operationId?: string;
  readonly toolName: string;
  readonly status: string;
  readonly content: string;
}

export interface ConversationMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly role: string;
  readonly content: string;
  readonly createdAt: string;
  readonly toolObservations?: readonly ToolObservation[];
}

/**
 * GET /api/conversations/:id — newest-window read for rehydration.
 * Query mirrors the v2 usage (`limit`/`order`); the server may also return
 * `_pagination` which is ignored here (paging belongs to the store).
 */
export async function getConversation(
  fetchFn: FetchFn,
  base: string,
  token: string,
  conversationId: string,
  limit = 50,
): Promise<ConversationMessage[]> {
  const data = await getJson<{ conversation?: { messages?: ConversationMessage[] } }>(
    fetchFn,
    base,
    `/api/conversations/${encodeURIComponent(conversationId)}?limit=${limit}&order=desc`,
    token,
  );
  return data?.conversation?.messages ?? [];
}

/**
 * POST /api/conversations/:id/stream — token-by-token SSE turns.
 *
 * Discipline (per routes/conversations.ts comments):
 * - 409 `conversation-busy` → never duplicate; caller must use a fresh
 *   conversation (or the GET /active reattach path).
 * - Aborting `signal` stops local reading only; the server keeps running
 *   (GA-DETACH-001) — call cancelAssistantTurn to actually stop it.
 */
export type StreamEnd = 'done' | 'busy' | 'aborted' | 'error';

export interface StreamResult {
  ended: StreamEnd;
  text: string;
  error?: string;
}

/** Per-turn execution budget (GA-EXEC-001). `maxToolCalls: 0` = unlimited. */
export interface ExecutionConfig {
  maxToolCalls?: number;
  turnTimeoutMs?: number;
}

export interface StreamHandlers {
  signal: AbortSignal;
  onDelta: (text: string) => void;
  /**
   * Every non-delta frame (tool/tool_result/status/permission/question/
   * error/done, verbatim with `execution` detail). Absent in the v2 fork —
   * this is what lets the stage-2 store build timelines and ASK surfaces.
   */
  onEvent?: (type: string, content: string, frame: { name?: string; execution?: unknown }) => void;
}

export async function streamAssistantMessage(
  fetchFn: FetchFn,
  base: string,
  token: string,
  conversationId: string,
  message: string,
  handlers: StreamHandlers,
  executionConfig?: ExecutionConfig,
): Promise<StreamResult> {
  let res: Response;
  try {
    res = await fetchFn(`${base}/api/conversations/${encodeURIComponent(conversationId)}/stream`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        message,
        ...(executionConfig?.maxToolCalls !== undefined ? { executionConfig } : {}),
      }),
      signal: handlers.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return { ended: 'aborted', text: '' };
    throw new AssistantApiError(0, 'Assistant API unreachable');
  }
  if (res.status === 409) return { ended: 'busy', text: '' };
  if (!res.ok) throw await readError(res, `Request failed (${res.status})`);
  if (!res.body) throw new AssistantApiError(500, 'No stream body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseStreamFrames(buffer);
      buffer = parsed.rest;
      for (const frame of parsed.frames) {
        const ev = frame.event;
        if (!ev || typeof ev.type !== 'string') continue;
        if (ev.type === 'delta' && ev.content) {
          text += ev.content;
          handlers.onDelta(ev.content);
        } else if (ev.type === 'done') {
          handlers.onEvent?.('done', '', {});
          return { ended: 'done', text };
        } else if (ev.type === 'error') {
          const error = ev.content || 'Stream failed';
          handlers.onEvent?.('error', error, { execution: ev.execution });
          return { ended: 'error', text, error };
        } else {
          handlers.onEvent?.(ev.type, ev.content ?? '', { name: ev.name, execution: ev.execution });
        }
      }
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return { ended: 'aborted', text };
    throw e;
  } finally {
    reader.releaseLock();
  }
  return { ended: 'done', text };
}

/**
 * POST /api/conversations/:id/cancel — idempotent explicit Stop.
 * Unknown/stale ids are NOT errors; transport failure resolves false.
 */
export async function cancelAssistantTurn(
  fetchFn: FetchFn,
  base: string,
  token: string,
  conversationId: string,
): Promise<boolean> {
  try {
    const res = await fetchFn(`${base}/api/conversations/${encodeURIComponent(conversationId)}/cancel`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { cancelled?: boolean };
    return data?.cancelled === true;
  } catch {
    return false;
  }
}

/** GET /api/conversations/:id/active — true while a turn is in-flight. */
export async function isAssistantTurnActive(
  fetchFn: FetchFn,
  base: string,
  token: string,
  conversationId: string,
): Promise<boolean> {
  const data = await getJson<{ active?: boolean }>(
    fetchFn,
    base,
    `/api/conversations/${encodeURIComponent(conversationId)}/active`,
    token,
  );
  return data?.active === true;
}

/** Latest assistant text in the conversation (newest-first read). */
export async function getLatestAssistantText(
  fetchFn: FetchFn,
  base: string,
  token: string,
  conversationId: string,
): Promise<string | null> {
  const data = await getJson<{ conversation?: { messages?: { role?: string; content?: string }[] } }>(
    fetchFn,
    base,
    `/api/conversations/${encodeURIComponent(conversationId)}?limit=50&order=desc`,
    token,
  );
  const found = data?.conversation?.messages?.find((m) => m?.role === 'assistant' && m.content?.trim());
  return found?.content?.trim() ?? null;
}

/**
 * POST /api/conversations/:id/permissions/:permissionId — answer an ASK
 * gate. UI vocabulary (`allow-once | allow-session | deny`) maps to OpenCode
 * wire (`once | always | reject`) server-side; the broker records the
 * decision in the unified audit trail.
 */
export type AssistantPermissionDecision = 'allow-once' | 'allow-session' | 'deny';

export async function respondToPermission(
  fetchFn: FetchFn,
  base: string,
  token: string,
  conversationId: string,
  permissionId: string,
  decision: AssistantPermissionDecision,
): Promise<boolean> {
  try {
    const res = await fetchFn(`${base}/api/conversations/${encodeURIComponent(conversationId)}/permissions/${encodeURIComponent(permissionId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ decision }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * POST /api/conversations/:id/questions/:requestId — answer a runtime
 * question with bounded option selections. Unknown/stale ids resolve false.
 */
export async function answerQuestion(
  fetchFn: FetchFn,
  base: string,
  token: string,
  conversationId: string,
  requestId: string,
  answers: string[][],
): Promise<boolean> {
  try {
    const res = await fetchFn(`${base}/api/conversations/${encodeURIComponent(conversationId)}/questions/${encodeURIComponent(requestId)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ answers }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Assistant reply over the simple messages call (fallback when SSE fails). */
export interface AssistantReply {
  text: string;
  latencyMs?: number;
}

export async function sendAssistantMessage(
  fetchFn: FetchFn,
  base: string,
  token: string,
  conversationId: string,
  message: string,
): Promise<AssistantReply> {
  const data = await postJson<{ response?: { content?: string }; latency?: number }>(
    fetchFn,
    base,
    `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
    { message },
    token,
  );
  const text = data?.response?.content?.trim();
  if (!text) throw new AssistantApiError(500, 'Empty assistant response');
  return { text, latencyMs: typeof data?.latency === 'number' ? data.latency : undefined };
}

/** Bound client: base URL + fetch implementation fixed once per app. */
export interface AssistantTransport {
  loginAssistant: (username: string) => Promise<AssistantSession>;
  loginWithPassword: (username: string, password: string) => Promise<PasswordLoginResult>;
  verifyMfaCode: (username: string, code: string) => Promise<AssistantSession>;
  validateAssistantToken: (token: string) => Promise<boolean>;
  fetchAssistantIdentity: (token: string) => Promise<AssistantIdentity>;
  createAssistantConversation: (token: string) => Promise<string>;
  getConversation: (token: string, conversationId: string, limit?: number) => Promise<ConversationMessage[]>;
  streamAssistantMessage: (
    token: string,
    conversationId: string,
    message: string,
    handlers: StreamHandlers,
    executionConfig?: ExecutionConfig,
  ) => Promise<StreamResult>;
  cancelAssistantTurn: (token: string, conversationId: string) => Promise<boolean>;
  respondToPermission: (
    token: string,
    conversationId: string,
    permissionId: string,
    decision: AssistantPermissionDecision,
  ) => Promise<boolean>;
  answerQuestion: (
    token: string,
    conversationId: string,
    requestId: string,
    answers: string[][],
  ) => Promise<boolean>;
  isAssistantTurnActive: (token: string, conversationId: string) => Promise<boolean>;
  getLatestAssistantText: (token: string, conversationId: string) => Promise<string | null>;
  sendAssistantMessage: (token: string, conversationId: string, message: string) => Promise<AssistantReply>;
}

/**
 * Create a bound transport. `baseUrl`: v1 same-origin proxy passes `''`,
 * v2 passes its `VITE_API_URL`. `fetchFn` defaults to global fetch and is
 * injectable for tests.
 */
export function createAssistantTransport(options?: { baseUrl?: string; fetchFn?: FetchFn }): AssistantTransport {
  const base = (options?.baseUrl ?? '').replace(/\/+$/, '');
  const fetchFn = options?.fetchFn ?? fetch;
  return {
    loginAssistant: (username) => loginAssistant(fetchFn, base, username),
    loginWithPassword: (username, password) => loginWithPassword(fetchFn, base, username, password),
    verifyMfaCode: (username, code) => verifyMfaCode(fetchFn, base, username, code),
    validateAssistantToken: (token) => validateAssistantToken(fetchFn, base, token),
    fetchAssistantIdentity: (token) => fetchAssistantIdentity(fetchFn, base, token),
    createAssistantConversation: (token) => createAssistantConversation(fetchFn, base, token),
    getConversation: (token, conversationId, limit) => getConversation(fetchFn, base, token, conversationId, limit),
    streamAssistantMessage: (token, conversationId, message, handlers, executionConfig) =>
      streamAssistantMessage(fetchFn, base, token, conversationId, message, handlers, executionConfig),
    cancelAssistantTurn: (token, conversationId) => cancelAssistantTurn(fetchFn, base, token, conversationId),
    respondToPermission: (token, conversationId, permissionId, decision) =>
      respondToPermission(fetchFn, base, token, conversationId, permissionId, decision),
    answerQuestion: (token, conversationId, requestId, answers) =>
      answerQuestion(fetchFn, base, token, conversationId, requestId, answers),
    isAssistantTurnActive: (token, conversationId) => isAssistantTurnActive(fetchFn, base, token, conversationId),
    getLatestAssistantText: (token, conversationId) => getLatestAssistantText(fetchFn, base, token, conversationId),
    sendAssistantMessage: (token, conversationId, message) =>
      sendAssistantMessage(fetchFn, base, token, conversationId, message),
  };
}

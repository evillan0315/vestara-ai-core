// Typed client for the Vestara assistant conversation API.
// Contracts: apps/api/src/routes/auth.ts (login/me) and
// apps/api/src/routes/conversations.ts (create/messages).
// Transport failures reject — callers fall back to fixtures (offline-first).

/** API origin: proxied same-origin in dev, configurable for preview/prod. */
export function apiBaseUrl(): string {
  const configured =
    typeof import.meta !== 'undefined'
      ? ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL ?? '')
      : '';
  return configured.replace(/\/+$/, '');
}

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

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, {
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

async function getJson<T>(path: string, token: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, {
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
export async function loginAssistant(username: string): Promise<AssistantSession> {
  const data = await postJson<{ user?: { token?: string; username?: string } }>('/api/auth/login', { username });
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
export async function loginWithPassword(username: string, password: string): Promise<PasswordLoginResult> {
  const data = await postJson<{
    user?: { token?: string; username?: string };
    mfaRequired?: boolean;
    username?: string;
    error?: string;
  }>('/api/auth/password', { username, password });
  if (data?.mfaRequired) return { mfaRequired: true, username: data.username ?? username };
  if (!data?.user?.token) throw new AssistantApiError(500, 'Login returned no token');
  return {
    session: { token: data.user.token, username: data.user.username ?? username },
    mfaRequired: false,
    username: data.user.username ?? username,
  };
}

/** POST /api/auth/mfa/verify — finish an MFA-challenged login. */
export async function verifyMfaCode(username: string, code: string): Promise<AssistantSession> {
  const data = await postJson<{ user?: { token?: string; username?: string } }>('/api/auth/mfa/verify', {
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
export async function validateAssistantToken(token: string): Promise<boolean> {
  try {
    await getJson('/api/auth/me', token);
    return true;
  } catch (e) {
    if (e instanceof AssistantApiError && e.status === 0) throw e;
    return false;
  }
}

/** POST /api/conversations — returns the conversation id. */
export async function createAssistantConversation(token: string): Promise<string> {
  const data = await postJson<{ conversation?: { id?: string } }>('/api/conversations', {}, token);
  if (!data?.conversation?.id) throw new AssistantApiError(500, 'Conversation creation returned no id');
  return data.conversation.id;
}

/**
 * POST /api/conversations/:id/stream — token-by-token SSE turns.
 * Frame: `data: {schemaVersion, conversationId, messageId, sequence,
 * timestamp, event}\n\n` with event delta/tool(_result)/status/error/done.
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

export interface StreamHandlers {
  signal: AbortSignal;
  onDelta: (text: string) => void;
}

interface StreamFrame {
  event?: { type?: string; content?: string };
}

function parseStreamFrames(buffer: string): { frames: StreamFrame[]; rest: string } {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';
  const frames: StreamFrame[] = [];
  for (const part of parts) {
    const line = part
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('data:'));
    if (!line) continue;
    try {
      frames.push(JSON.parse(line.slice(5).trim()) as StreamFrame);
    } catch {
      // Malformed frame — skip, keep the turn alive.
    }
  }
  return { frames, rest };
}

export async function streamAssistantMessage(
  token: string,
  conversationId: string,
  message: string,
  handlers: StreamHandlers,
): Promise<StreamResult> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/api/conversations/${encodeURIComponent(conversationId)}/stream`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message }),
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
          return { ended: 'done', text };
        } else if (ev.type === 'error') {
          return { ended: 'error', text, error: ev.content || 'Stream failed' };
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
export async function cancelAssistantTurn(token: string, conversationId: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/conversations/${encodeURIComponent(conversationId)}/cancel`, {
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
export async function isAssistantTurnActive(token: string, conversationId: string): Promise<boolean> {
  const data = await getJson<{ active?: boolean }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/active`,
    token,
  );
  return data?.active === true;
}

/** Latest assistant text in the conversation (newest-first read). */
export async function getLatestAssistantText(token: string, conversationId: string): Promise<string | null> {
  const data = await getJson<{ conversation?: { messages?: { role?: string; content?: string }[] } }>(
    `/api/conversations/${encodeURIComponent(conversationId)}?limit=50&order=desc`,
    token,
  );
  const found = data?.conversation?.messages?.find((m) => m?.role === 'assistant' && m.content?.trim());
  return found?.content?.trim() ?? null;
}

/** Assistant reply over the simple messages call (fallback when SSE fails). */
export interface AssistantReply {
  text: string;
  latencyMs?: number;
}

export async function sendAssistantMessage(
  token: string,
  conversationId: string,
  message: string,
): Promise<AssistantReply> {
  const data = await postJson<{ response?: { content?: string }; latency?: number }>(
    `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
    { message },
    token,
  );
  const text = data?.response?.content?.trim();
  if (!text) throw new AssistantApiError(500, 'Empty assistant response');
  return { text, latencyMs: typeof data?.latency === 'number' ? data.latency : undefined };
}

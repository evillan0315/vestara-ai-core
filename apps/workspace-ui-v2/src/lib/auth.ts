// Assistant API session — Bearer token persisted in localStorage only.
// Tokens never enter source, fixtures, or the bundle. Mirrors the
// production pattern in apps/workspace/src/lib/auth.tsx (separate key so
// the standalone shell never cross-talks with the workspace session).

const TOKEN_KEY = 'vestara-assistant-token';

export function readAssistantToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

export function storeAssistantToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAssistantToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

const THREAD_KEY = 'vestara-assistant-thread';

/** Persisted conversation id for session affinity across turns + reloads. */
export function readAssistantThread(): string | null {
  return localStorage.getItem(THREAD_KEY);
}

export function storeAssistantThread(conversationId: string): void {
  localStorage.setItem(THREAD_KEY, conversationId);
}

export function clearAssistantThread(): void {
  localStorage.removeItem(THREAD_KEY);
}

/** fetch wrapper attaching the persisted assistant Bearer token. */
export function assistantFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = readAssistantToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/**
 * v2 assistant transport binding — thin layer over `@vestara/assistant`.
 *
 * The SSE parser, turn store, and fixtures live in the shared package; this
 * module only injects v2's base URL (`VITE_API_URL`, same-origin proxied in
 * dev) and preserves the token-first signatures the v2 callers already use
 * (`FloatingAssistant`, `VoiceStreaming`, `LoginScreen`). No protocol logic
 * lives here — that fork now belongs to the package.
 */

import {
  AssistantApiError,
  createAssistantTransport,
  type AssistantIdentity,
  type AssistantPermissionDecision,
  type AssistantReply,
  type AssistantSession,
  type ExecutionConfig,
  type PasswordLoginResult,
  type StreamEnd,
  type StreamHandlers,
  type StreamResult,
} from '@vestara/assistant';

export { AssistantApiError };
export type {
  AssistantIdentity,
  AssistantPermissionDecision,
  AssistantReply,
  AssistantSession,
  ExecutionConfig,
  PasswordLoginResult,
  StreamEnd,
  StreamHandlers,
  StreamResult,
};

/** API origin: proxied same-origin in dev, configurable for preview/prod. */
export function apiBaseUrl(): string {
  const configured =
    typeof import.meta !== 'undefined'
      ? ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_URL ?? '')
      : '';
  return configured.replace(/\/+$/, '');
}

function transport() {
  return createAssistantTransport({ baseUrl: apiBaseUrl() });
}

/** POST /api/auth/login — public; the API auto-registers unknown usernames. */
export function loginAssistant(username: string): Promise<AssistantSession> {
  return transport().loginAssistant(username);
}

/** POST /api/auth/password — password login; may challenge for MFA. */
export function loginWithPassword(username: string, password: string): Promise<PasswordLoginResult> {
  return transport().loginWithPassword(username, password);
}

/** POST /api/auth/mfa/verify — finish an MFA-challenged login. */
export function verifyMfaCode(username: string, code: string): Promise<AssistantSession> {
  return transport().verifyMfaCode(username, code);
}

/**
 * GET /api/auth/me — true when the token is accepted.
 * Returns false on 401; rethrows transport failures (status 0) so callers
 * can distinguish offline from signed-out.
 */
export function validateAssistantToken(token: string): Promise<boolean> {
  return transport().validateAssistantToken(token);
}

/**
 * GET /api/auth/me — session identity for the login shell (display name,
 * role). Rejects on 401/offline so callers fall back to fixture metadata.
 */
export function fetchAssistantIdentity(token: string): Promise<AssistantIdentity> {
  return transport().fetchAssistantIdentity(token);
}

/** POST /api/conversations — returns the conversation id. */
export function createAssistantConversation(token: string): Promise<string> {
  return transport().createAssistantConversation(token);
}

/**
 * POST /api/conversations/:id/stream — token-by-token SSE turns.
 * Frame: `data: {schemaVersion, conversationId, messageId, sequence,
 * timestamp, event}` with event delta/tool(_result)/status/error/done.
 *
 * Discipline (per routes/conversations.ts comments):
 * - 409 `conversation-busy` → never duplicate; caller must use a fresh
 *   conversation (or the GET /active reattach path).
 * - Aborting `signal` stops local reading only; the server keeps running
 *   (GA-DETACH-001) — call cancelAssistantTurn to actually stop it.
 * - `handlers.onEvent` receives every non-delta frame (tool/tool_result/
 *   status/permission/question) for the package turn store; `executionConfig`
 *   carries the per-turn budget (GA-EXEC-001).
 */
export function streamAssistantMessage(
  token: string,
  conversationId: string,
  message: string,
  handlers: StreamHandlers,
  executionConfig?: ExecutionConfig,
): Promise<StreamResult> {
  return transport().streamAssistantMessage(token, conversationId, message, handlers, executionConfig);
}

/**
 * POST /api/conversations/:id/cancel — idempotent explicit Stop.
 * Unknown/stale ids are NOT errors; transport failure resolves false.
 */
export function cancelAssistantTurn(token: string, conversationId: string): Promise<boolean> {
  return transport().cancelAssistantTurn(token, conversationId);
}

/**
 * POST /api/conversations/:id/permissions/:permissionId — answer an ASK
 * gate (`allow-once | allow-session | deny`). Unknown/stale ids resolve
 * false; transport failure resolves false.
 */
export function respondToPermission(
  token: string,
  conversationId: string,
  permissionId: string,
  decision: AssistantPermissionDecision,
): Promise<boolean> {
  return transport().respondToPermission(token, conversationId, permissionId, decision);
}

/**
 * POST /api/conversations/:id/questions/:requestId — answer a runtime
 * question with bounded option selections. Unknown/stale ids resolve false.
 */
export function answerQuestion(
  token: string,
  conversationId: string,
  requestId: string,
  answers: string[][],
): Promise<boolean> {
  return transport().answerQuestion(token, conversationId, requestId, answers);
}

/** GET /api/conversations/:id/active — true while a turn is in-flight. */
export function isAssistantTurnActive(token: string, conversationId: string): Promise<boolean> {
  return transport().isAssistantTurnActive(token, conversationId);
}

/** Latest assistant text in the conversation (newest-first read). */
export function getLatestAssistantText(token: string, conversationId: string): Promise<string | null> {
  return transport().getLatestAssistantText(token, conversationId);
}

/**
 * GET /api/conversations/:id — newest-window read with `toolObservations`
 * for timeline rehydration after reselect/reload.
 */
export function getConversation(token: string, conversationId: string, limit = 50) {
  return transport().getConversation(token, conversationId, limit);
}

/** Assistant reply over the simple messages call (fallback when SSE fails). */
export function sendAssistantMessage(
  token: string,
  conversationId: string,
  message: string,
): Promise<AssistantReply> {
  return transport().sendAssistantMessage(token, conversationId, message);
}

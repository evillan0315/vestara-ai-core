/**
 * AR-TOOL-ASK-003A4B — Durable Presentation Authority.
 *
 * Authoritative browser presentation for runtime `question.asked`
 * interactions: exact durable resolution → atomic present →
 * `{ interactionId, version, claimToken, questions }`.
 *
 * Activity/SSE remains a notification/render hint. It never grants answer
 * authority: answer controls become actionable ONLY after this operation
 * returns a presented credential. Every failure is fail-closed (throws, no
 * credential, no state change except the TTL-expiry commit owned by the
 * store).
 *
 * 4B boundary (frozen):
 * - pending → presented and presented → presented (token rotation) ONLY.
 *   Never presented → claimed. Claim is 003A4C.
 * - No OpenCode reply/reject, no delivery lease, no M9 write, no SSE emit,
 *   no logging of the claim token.
 * - Identity is verified BEFORE mutation: a wrong conversationId or a wrong
 *   session/request pair never rotates the token.
 */

import {
  type RuntimeQuestion,
  RuntimeQuestionTransitionError,
  requireExactIdentity,
} from './runtime-interaction-contract';
import type { RuntimeQuestionInteractionStore } from './runtime-interaction-store';

/** Input for authoritative presentation. Identities are exact, never inferred. */
export interface PresentRuntimeQuestionInput {
  readonly interactionId: string;
  readonly conversationId: string;
  /** Optional cross-checks: when supplied they must match byte-for-byte. */
  readonly openCodeSessionId?: string;
  readonly openCodeRequestId?: string;
  /** Injection point for now (tests). Defaults to Date.now(). */
  readonly nowMs?: number;
}

/**
 * The canonical decision authority handed to the browser. This is the ONLY
 * surface that carries the single-use claim token. 4C submits
 * `{ interactionId, version, claimToken, answers }` plus actor identity only
 * through the existing authoritative actor mechanism (not invented here).
 */
export interface BrowserRuntimeQuestionPresentation {
  readonly interactionId: string;
  readonly conversationId: string;
  readonly openCodeSessionId: string;
  readonly openCodeRequestId: string;
  readonly status: 'presented';
  readonly version: number;
  readonly claimToken: string;
  readonly questions: readonly RuntimeQuestion[];
  readonly presentedAt?: string;
  readonly expiresAt: string;
}

/**
 * Resolve the EXACT persisted interaction and atomically present it.
 * Throws (fail closed) when the interaction is missing, when any supplied
 * identity mismatches, or when the row is not presentable
 * (claimed/answered/rejected/expired/orphaned/delivery-unknown).
 * Never claims: the returned row is always `presented` with no answers.
 */
export function presentRuntimeQuestionForBrowser(
  store: RuntimeQuestionInteractionStore,
  input: PresentRuntimeQuestionInput,
): BrowserRuntimeQuestionPresentation {
  if (typeof input.interactionId !== 'string' || input.interactionId.length === 0) {
    throw new RuntimeQuestionTransitionError('(unknown)', 'pending', 'presentation requires the exact interaction id');
  }
  const interactionId = input.interactionId;
  const conversationId = requireExactIdentity('conversationId', input.conversationId);
  const nowMs = input.nowMs;

  const existing = store.get(interactionId);
  if (existing === undefined) {
    throw new RuntimeQuestionTransitionError(interactionId, 'pending', 'unknown interaction id; fail closed');
  }
  if (existing.conversationId !== conversationId) {
    throw new RuntimeQuestionTransitionError(
      interactionId,
      existing.status,
      'conversation identity mismatch; refusing to present',
    );
  }
  if (input.openCodeSessionId !== undefined && input.openCodeSessionId !== existing.openCodeSessionId) {
    throw new RuntimeQuestionTransitionError(
      interactionId,
      existing.status,
      'OpenCode session identity mismatch; refusing to present',
    );
  }
  if (input.openCodeRequestId !== undefined && input.openCodeRequestId !== existing.openCodeRequestId) {
    throw new RuntimeQuestionTransitionError(
      interactionId,
      existing.status,
      'OpenCode request identity mismatch; refusing to present',
    );
  }

  const presented = store.present(interactionId, nowMs);
  if (presented.status !== 'presented' || presented.claimToken === null) {
    throw new RuntimeQuestionTransitionError(
      interactionId,
      presented.status,
      'presentation did not yield an answerable credential; fail closed',
    );
  }
  if (presented.answers !== undefined) {
    throw new RuntimeQuestionTransitionError(
      interactionId,
      presented.status,
      'presentation must never carry answers; fail closed',
    );
  }
  return {
    interactionId: presented.interactionId,
    conversationId: presented.conversationId,
    openCodeSessionId: presented.openCodeSessionId,
    openCodeRequestId: presented.openCodeRequestId,
    status: 'presented',
    version: presented.version,
    claimToken: presented.claimToken,
    questions: presented.questions,
    ...(presented.presentedAt === undefined ? {} : { presentedAt: presented.presentedAt }),
    expiresAt: presented.expiresAt,
  };
}

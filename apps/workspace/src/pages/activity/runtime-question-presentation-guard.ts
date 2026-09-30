/**
 * AR-TOOL-ASK-003A4B — Browser presentation resolution guard.
 *
 * Required model:
 *   Activity/SSE hint → exact durable resolution → presentation operation →
 *   `{ interactionId, version, claimToken, questions }` → controls enabled.
 *
 * Activity/SSE data may tell the UI that a question EXISTS, but it must not
 * itself grant authority to answer. Answer controls become actionable ONLY
 * when an authoritative presentation credential is held. Failure to
 * resolve/present fails closed: the question may remain visible, but no
 * actionable answer control is exposed.
 *
 * Pure and logic-only: no rendering, no styling, no network. The caller
 * performs the POST `/api/activity-room/v1/interactions/:id/present` built
 * by {@link buildPresentRequest} and gates controls with
 * {@link isAnswerControlsEnabled}.
 */

export interface RuntimeQuestionHint {
  readonly conversationId: string;
  readonly interactionId?: string;
  readonly openCodeSessionId?: string;
  readonly openCodeRequestId?: string;
}

export interface AuthoritativeRuntimeQuestionPresentation {
  readonly interactionId: string;
  readonly conversationId: string;
  readonly openCodeSessionId: string;
  readonly openCodeRequestId: string;
  readonly status: 'presented';
  readonly version: number;
  readonly claimToken: string;
  readonly questions: readonly unknown[];
}

/**
 * Answer controls are enabled ONLY with a complete presented credential:
 * exact interaction id, integer version ≥ 1, and a non-empty single-use
 * claim token. Everything else (hint-only, pending without presentation,
 * terminal states) stays non-actionable.
 */
export function isAnswerControlsEnabled(
  presentation: AuthoritativeRuntimeQuestionPresentation | null | undefined,
): boolean {
  if (!presentation) return false;
  if (presentation.status !== 'presented') return false;
  if (typeof presentation.interactionId !== 'string' || presentation.interactionId.length === 0) return false;
  if (!Number.isInteger(presentation.version) || presentation.version < 1) return false;
  if (typeof presentation.claimToken !== 'string' || presentation.claimToken.length === 0) return false;
  return true;
}

/**
 * Build the explicit presentation mutation for a hint. Uses exact
 * identities only — never infers from question text, timestamps, Activity
 * ordering, proximity, tool names, or broker waiter state. Returns null
 * when the hint lacks the minimum exact identity (fail closed: no request).
 */
export function buildPresentRequest(hint: RuntimeQuestionHint): {
  readonly method: 'POST';
  readonly path: string;
  readonly body: Record<string, string>;
} | null {
  const interactionId = hint.interactionId;
  if (typeof interactionId !== 'string' || interactionId.length === 0) return null;
  if (typeof hint.conversationId !== 'string' || hint.conversationId.length === 0) return null;
  const body: Record<string, string> = { conversationId: hint.conversationId };
  if (typeof hint.openCodeSessionId === 'string' && hint.openCodeSessionId.length > 0) {
    body.openCodeSessionId = hint.openCodeSessionId;
  }
  if (typeof hint.openCodeRequestId === 'string' && hint.openCodeRequestId.length > 0) {
    body.openCodeRequestId = hint.openCodeRequestId;
  }
  return {
    method: 'POST',
    path: `/api/activity-room/v1/interactions/${encodeURIComponent(interactionId)}/present`,
    body,
  };
}

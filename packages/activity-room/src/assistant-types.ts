/**
 * AR-006: Assistant Turn Result
 *
 * Canonical result contract for one Assistant turn execution.
 * Carries enough identity/correlation for UI integration without
 * exposing provider-specific response objects.
 *
 * Ownership: @vestara/activity-room (Assistant domain contract)
 */

/** Status of an Assistant turn execution. */
export type AssistantTurnStatus = 'completed' | 'failed';

/**
 * Canonical result for one Assistant turn.
 * Carries conversation, message, agent, and correlation identity.
 */
export interface AssistantTurnResult {
  /** Conversation grouping identifier. */
  readonly conversationId: string;

  /** Activity Room record ID for the human message. */
  readonly humanMessageId: string;

  /** Activity Room record ID for the Assistant response (undefined on failure). */
  readonly assistantMessageId?: string;

  /** Agent identity that performed the turn. */
  readonly agentId: string;

  /** Execution correlation identifier. */
  readonly correlationId: string;

  /** Turn completion status. */
  readonly status: AssistantTurnStatus;

  /** Assistant response content (undefined on failure). */
  readonly content?: string;

  /** Failure description (undefined on success). */
  readonly failure?: string;

  /** ISO 8601 timestamp of turn completion. */
  readonly completedAt: string;
}

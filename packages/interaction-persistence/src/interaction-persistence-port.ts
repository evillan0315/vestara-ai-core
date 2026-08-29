/**
 * AR-REC-C2 D1: Interaction Persistence Port
 *
 * Interface for persisting interaction facts and response facts.
 * Concrete implementation: SqliteInteractionStore.
 *
 * Invariants:
 *   - interactions are immutable presentation facts
 *   - responses are immutable response facts
 *   - at most one response per interaction (enforced by DB constraint)
 *   - lifecycle is derived, not persisted
 */

import type { ChoiceId, InteractionId, InteractionResponse, StructuredInteraction } from '@vestara/types';

/**
 * Persistent state of an interaction fact plus its publication marker.
 */
export interface PersistedInteraction {
  readonly interaction: StructuredInteraction;
  /** Null = needs publication; timestamp = confirmed delivered. */
  readonly publishedAt: string | null;
}

/**
 * Persistent state of a response fact plus its publication marker.
 */
export interface PersistedResponse {
  readonly response: InteractionResponse;
  /** Null = needs publication; timestamp = confirmed delivered. */
  readonly publishedAt: string | null;
}

/**
 * Publication ledger entry for pending recovery.
 */
export interface PendingPublication {
  readonly eventId: string;
  readonly interactionId: InteractionId;
}

/**
 * Persistence port for interaction facts.
 */
export interface InteractionPersistencePort {
  /** Persist an immutable StructuredInteraction. Fails if interactionId already exists. */
  put(interaction: StructuredInteraction): Promise<void>;

  /** Retrieve a StructuredInteraction by InteractionId. Returns undefined if absent. */
  get(interactionId: InteractionId): Promise<PersistedInteraction | undefined>;

  /** Check if an interaction exists. */
  has(interactionId: InteractionId): Promise<boolean>;

  /** Record at most one InteractionResponse for an interaction.
   *  Returns the recorded response on success.
   *  Throws if: interaction not found, response already recorded, choiceId invalid. */
  recordResponse(interactionId: InteractionId, response: InteractionResponse): Promise<InteractionResponse>;

  /** Retrieve the response for an interaction, if any. */
  getResponse(interactionId: InteractionId): Promise<PersistedResponse | undefined>;

  /** Check if a response exists for an interaction. */
  hasResponse(interactionId: InteractionId): Promise<boolean>;

  /** Mark a publication as delivered. */
  markPublished(eventId: string): Promise<void>;

  /** Retrieve pending publications (published_at IS NULL), bounded batch. */
  getPendingPublications(limit: number): Promise<readonly PendingPublication[]>;
}

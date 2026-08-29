/**
 * AR-REC-C2 D1: Interaction Publication Port
 *
 * Application-owned publication boundary. The InteractionService calls
 * these methods after committed persistence. The concrete implementation
 * bridges to the EventBus.
 *
 * Invariants:
 *   - Persistence adapter MUST NOT directly publish EventBus events
 *   - M9 MUST NOT publish interaction facts
 *   - Publication is after-commit, not two-phase
 */

import type { InteractionId } from '@vestara/types';

/**
 * Publication payload for interaction:presented events.
 */
export interface InteractionPresentedPayload {
  readonly eventId: string;
  readonly interactionId: InteractionId;
  readonly conversationId?: string;
  readonly presentingParticipantId: string;
  readonly presentingParticipantName: string;
  readonly createdAt: string;
  readonly content: string;
  readonly choices: readonly { readonly choiceId: string; readonly label: string; readonly description?: string }[];
}

/**
 * Publication payload for interaction:responded events.
 */
export interface InteractionRespondedPayload {
  readonly eventId: string;
  readonly interactionId: InteractionId;
  readonly responseId: string;
  readonly selectedChoiceId: string;
  readonly respondingParticipantId: string;
  readonly respondingParticipantName: string;
  readonly respondedAt: string;
  readonly correlationId?: string;
}

/**
 * Publication port for interaction facts.
 * Called by InteractionService after committed persistence.
 */
export interface InteractionPublicationPort {
  /** Publish an interaction:presented fact. Called after commit. */
  onInteractionPresented(payload: InteractionPresentedPayload): Promise<void>;

  /** Publish an interaction:responded fact. Called after commit. */
  onInteractionResponded(payload: InteractionRespondedPayload): Promise<void>;
}

/**
 * AR-REC-C2 I1-5: Interaction Publication Adapter
 *
 * Bridges InteractionPublicationPort to the EventBus.
 * Application-owned publication through the frozen publication boundary.
 *
 * Invariants:
 *   - Persistence adapter MUST NOT directly publish EventBus events
 *   - M9 MUST NOT publish interaction facts
 *   - Publication is after-commit, not two-phase
 *   - Deterministic event identities
 */

import type { EventBus } from '@vestara/event-bus';
import type {
  InteractionPresentedPayload,
  InteractionPublicationPort,
  InteractionRespondedPayload,
} from './interaction-publication-port';

export class InteractionEventBusAdapter implements InteractionPublicationPort {
  constructor(private readonly eventBus: EventBus) {}

  async onInteractionPresented(payload: InteractionPresentedPayload): Promise<void> {
    await this.eventBus.emit({
      type: 'interaction:presented',
      source: 'interaction-app',
      payload: {
        eventId: payload.eventId,
        interactionId: payload.interactionId,
        conversationId: payload.conversationId,
        presentingParticipantId: payload.presentingParticipantId,
        presentingParticipantName: payload.presentingParticipantName,
        createdAt: payload.createdAt,
        content: payload.content,
        choices: payload.choices,
      },
    });
  }

  async onInteractionResponded(payload: InteractionRespondedPayload): Promise<void> {
    await this.eventBus.emit({
      type: 'interaction:responded',
      source: 'interaction-app',
      payload: {
        eventId: payload.eventId,
        interactionId: payload.interactionId,
        responseId: payload.responseId,
        selectedChoiceId: payload.selectedChoiceId,
        respondingParticipantId: payload.respondingParticipantId,
        respondingParticipantName: payload.respondingParticipantName,
        respondedAt: payload.respondedAt,
        correlationId: payload.correlationId,
      },
    });
  }
}

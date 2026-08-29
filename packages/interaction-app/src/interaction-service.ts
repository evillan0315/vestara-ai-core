/**
 * AR-REC-C2 I1-3/I1-4/I1-5: InteractionService
 *
 * Producer-neutral application boundary for structured interactions.
 * Lives in @vestara/interaction-app, NOT in @vestara/api.
 *
 * Responsibilities:
 *   - validateInteraction() structural validation
 *   - Persist immutable StructuredInteraction
 *   - Retrieve by InteractionId
 *   - validateResponseForInteraction() structural validation
 *   - Record at most one InteractionResponse
 *   - Publish interaction facts after committed persistence
 *
 * Does NOT own:
 *   - ChoiceId → handler/operation mapping
 *   - Domain execution/routing
 *   - Governance/authorization
 *   - Workflow/orchestration dispatch
 *   - Agent wake-up
 *   - Generic metadata/payload/context
 *   - Market/agent/workflow-specific logic
 */

import type { InteractionPersistencePort, InteractionPublicationPort } from '@vestara/interaction-persistence';
import type { InteractionId, InteractionResponse, StructuredInteraction } from '@vestara/types';
import { validateInteraction, validateResponseForInteraction } from '@vestara/types';

export interface InteractionServiceOptions {
  readonly persistence: InteractionPersistencePort;
  readonly publication: InteractionPublicationPort;
}

export class InteractionService {
  private readonly persistence: InteractionPersistencePort;
  private readonly publication: InteractionPublicationPort;

  constructor(options: InteractionServiceOptions) {
    this.persistence = options.persistence;
    this.publication = options.publication;
  }

  /**
   * I1-3: Persist an interaction and create a pending publication marker.
   * Both happen in the same transaction via the persistence adapter.
   */
  async present(interaction: StructuredInteraction): Promise<void> {
    // Validate structural invariants
    const errors = validateInteraction(interaction);
    if (errors.length > 0) {
      throw new Error(`Interaction validation failed: ${errors.map((e) => e.message).join(', ')}`);
    }

    // Persist interaction + publication marker (atomic via persistence adapter)
    await this.persistence.put(interaction);

    // Publish after committed persistence
    const eventId = `interaction:presented:${interaction.interactionId}`;
    await this.publication.onInteractionPresented({
      eventId,
      interactionId: interaction.interactionId,
      conversationId: interaction.conversationId,
      presentingParticipantId: interaction.presentingParticipantId,
      presentingParticipantName: interaction.presentingParticipantName,
      createdAt: interaction.createdAt,
      content: interaction.content,
      choices: interaction.choices,
    });

    // Mark publication as delivered
    await this.persistence.markPublished(eventId);
  }

  /**
   * I1-4: Record a response to an interaction.
   * Atomic: resolve interaction → validate choice → insert response → create publication marker.
   * The database uniqueness constraint is the concurrency authority.
   */
  async recordResponse(interactionId: InteractionId, response: InteractionResponse): Promise<InteractionResponse> {
    // Resolve interaction
    const persisted = await this.persistence.get(interactionId);
    if (!persisted) {
      throw new Error(`Interaction not found: ${interactionId}`);
    }

    // Validate response structural invariants
    const errors = validateResponseForInteraction(response, persisted.interaction);
    if (errors.length > 0) {
      throw new Error(`Response validation failed: ${errors.map((e) => e.message).join(', ')}`);
    }

    // Record response + publication marker (atomic via persistence adapter)
    // UNIQUE constraint enforces at most one response per interaction
    const recorded = await this.persistence.recordResponse(interactionId, response);

    // Publish after committed persistence
    const eventId = `interaction:responded:${interactionId}`;
    await this.publication.onInteractionResponded({
      eventId,
      interactionId,
      responseId: recorded.responseId,
      selectedChoiceId: recorded.selectedChoiceId,
      respondingParticipantId: recorded.respondingParticipantId,
      respondingParticipantName: recorded.respondingParticipantName,
      respondedAt: recorded.respondedAt,
      correlationId: recorded.correlationId,
    });

    // Mark publication as delivered
    await this.persistence.markPublished(eventId);

    return recorded;
  }

  /**
   * Retrieve an interaction by ID.
   */
  async getInteraction(interactionId: InteractionId) {
    return this.persistence.get(interactionId);
  }

  /**
   * Retrieve the response for an interaction, if any.
   */
  async getResponse(interactionId: InteractionId) {
    return this.persistence.getResponse(interactionId);
  }

  /**
   * Check if a response exists for an interaction.
   */
  async hasResponse(interactionId: InteractionId): Promise<boolean> {
    return this.persistence.hasResponse(interactionId);
  }

  /**
   * I1-6: Retrieve pending publications for recovery.
   */
  async getPendingPublications(limit: number = 100) {
    return this.persistence.getPendingPublications(limit);
  }

  /**
   * I1-6: Mark a publication as delivered after successful recovery.
   */
  async markPublished(eventId: string): Promise<void> {
    return this.persistence.markPublished(eventId);
  }
}

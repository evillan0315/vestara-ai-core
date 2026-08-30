/**
 * AR-REC-C2 I1-3/I1-4/I1-5 / CORRECTION: InteractionService
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
 *   - C2: Verify projection delivery before acknowledging publication
 *
 * Does NOT own:
 *   - ChoiceId → handler/operation mapping
 *   - Domain execution/routing
 *   - Governance/authorization
 *   - Workflow/orchestration dispatch
 *   - Agent wake-up
 *   - Generic metadata/payload/context
 *   - Market/agent/workflow-specific logic
 *
 * C2 ownership boundary:
 *   - InteractionService coordinates: persist → emit → verify → acknowledge
 *   - The adapter (InteractionEventBusAdapter) is a thin EventBus passthrough
 *   - Delivery verification uses PublicationDeliveryVerifier (port)
 *   - M9IngestionBridge does NOT call back to the adapter
 *   - No reverse dependency from projection to application
 */

import type {
  InteractionPersistencePort,
  InteractionPublicationPort,
  PublicationDeliveryVerifier,
} from '@vestara/interaction-persistence';
import type { InteractionId, InteractionResponse, StructuredInteraction } from '@vestara/types';
import { validateInteraction, validateResponseForInteraction } from '@vestara/types';
import { ResponseConflictError } from './response-conflict-error';

export interface InteractionServiceOptions {
  readonly persistence: InteractionPersistencePort;
  readonly publication: InteractionPublicationPort;
  /**
   * C2 correction: Verifies that a semantic event was delivered to the projection.
   * After emit, InteractionService checks this before marking published.
   * If absent, the legacy behavior applies (markPublished immediately after emit).
   */
  readonly deliveryVerifier?: PublicationDeliveryVerifier;
}

export class InteractionService {
  private readonly persistence: InteractionPersistencePort;
  private readonly publication: InteractionPublicationPort;
  private readonly deliveryVerifier?: PublicationDeliveryVerifier;

  constructor(options: InteractionServiceOptions) {
    this.persistence = options.persistence;
    this.publication = options.publication;
    this.deliveryVerifier = options.deliveryVerifier;
  }

  /**
   * I1-3: Persist an interaction and create a pending publication marker.
   * Both happen in the same transaction via the persistence adapter.
   *
   * C2 correction: After emit, verify projection delivery before marking published.
   * If deliveryVerifier is provided and verification fails, the publication
   * remains pending and a delivery error is thrown.
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

    // C2: Verify delivery before acknowledging publication
    await this.verifyAndAcknowledge(eventId);
  }

  /**
   * I1-4 / I2-C1: Record a response to an interaction.
   *
   * Atomic: resolve interaction → validate choice → insert response → create publication marker.
   * The database uniqueness constraint is the concurrency authority.
   *
   * C1 correction: Classify duplicate responses:
   *   - Same interaction + same choice → idempotent return of existing authoritative response
   *   - Same interaction + different choice → ResponseConflictError
   *
   * C2 correction: After emit, verify projection delivery before marking published.
   *
   * Algorithmic shape:
   *   1. Validate immutable interaction/choice
   *   2. Attempt authoritative response transaction (UNIQUE constraint)
   *   3. On success → publish/verify/acknowledge normally
   *   4. On uniqueness conflict → retrieve existing response → compare selectedChoiceId
   *      - Same → return existing (idempotent, no publication)
   *      - Different → throw ResponseConflictError
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

    // Attempt authoritative response transaction
    // UNIQUE constraint enforces at most one response per interaction
    let recorded: InteractionResponse;
    try {
      recorded = await this.persistence.recordResponse(interactionId, response);
    } catch (insertErr) {
      // Uniqueness conflict — classify: idempotent (same choice) vs conflict (different choice)
      const existing = await this.persistence.getResponse(interactionId);
      if (!existing) {
        // Response does not exist despite UNIQUE failure — propagate unexpected error
        throw insertErr;
      }
      if (existing.response.selectedChoiceId === response.selectedChoiceId) {
        // Same choice — idempotent return of existing authoritative response.
        // Do NOT re-emit, do NOT create new publication entry, do NOT modify existing response.
        // The original publication owns pending/recovery if it was not yet delivered.
        return existing.response;
      }
      // Different choice — semantic conflict
      throw new ResponseConflictError(interactionId, response.selectedChoiceId, existing.response.selectedChoiceId);
    }

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

    // C2: Verify delivery before acknowledging publication
    await this.verifyAndAcknowledge(eventId);

    return recorded;
  }

  /**
   * C2 correction: Verify projection delivery and acknowledge publication.
   *
   * If a deliveryVerifier is provided:
   *   - Check if the projection has the event (getByEventId)
   *   - If present: mark published
   *   - If absent: throw (publication remains pending for recovery)
   *
   * If no deliveryVerifier is provided (legacy/backward-compatible):
   *   - Mark published immediately (assumes delivery succeeded)
   */
  private async verifyAndAcknowledge(eventId: string): Promise<void> {
    if (this.deliveryVerifier) {
      const delivered = await this.deliveryVerifier.wasDelivered(eventId);
      if (!delivered) {
        throw new Error(`Projection delivery failed for ${eventId}`);
      }
    }
    await this.persistence.markPublished(eventId);
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

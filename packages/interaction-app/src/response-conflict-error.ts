/**
 * AR-REC-C2 I2-C1: Response Conflict Error
 *
 * Typed application-level error for conflicting response submissions.
 * Distinguishes from idempotent (same-choice) retries and structural validation errors.
 *
 * Ownership:
 *   - Lives in @vestara/interaction-app (application boundary)
 *   - NOT in @vestara/interaction-persistence (persistence uses raw UNIQUE constraint)
 *   - NOT in @vestara/types (frozen B contract has no error types)
 *   - NOT in HTTP layer (no status codes; HTTP adapter maps to 409)
 *
 * Invariants:
 *   - Thrown when a response already exists for an interaction with a DIFFERENT choiceId
 *   - NOT thrown for same-choice retries (those return existing response idempotently)
 *   - NOT thrown for structural validation errors (use validateResponseForInteraction)
 *   - NOT thrown for missing interactions (use "not found" errors)
 *   - Does NOT expose SQLite, UNIQUE constraint, sql.js, or database implementation details
 */

import type { ChoiceId, InteractionId } from '@vestara/types';

/**
 * Error thrown when a conflicting response is submitted to an interaction
 * that already has an authoritative response with a different choice.
 *
 * The caller should NOT retry with a different choice — the interaction
 * has already been authoritatively answered.
 */
export class ResponseConflictError extends Error {
  public readonly interactionId: InteractionId;
  public readonly attemptedChoiceId: ChoiceId;
  public readonly existingChoiceId: ChoiceId;

  constructor(interactionId: InteractionId, attemptedChoiceId: ChoiceId, existingChoiceId: ChoiceId) {
    super(
      `Response conflict: interaction ${interactionId} already has an authoritative response ` +
        `with choice ${existingChoiceId}; attempted choice ${attemptedChoiceId} conflicts`,
    );
    this.name = 'ResponseConflictError';
    this.interactionId = interactionId;
    this.attemptedChoiceId = attemptedChoiceId;
    this.existingChoiceId = existingChoiceId;
  }
}

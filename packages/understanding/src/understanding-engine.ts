/**
 * @vestara/understanding — UnderstandingEngine
 *
 * The interface for producing understanding from observation.
 *
 * Implementations may be deterministic-only or may layer
 * AI enrichment on top — but the core contract is that
 * WorkspaceUnderstanding MUST be producible without AI.
 *
 * The lifecycle:
 *   1. observe(session) → WorkspaceObservation
 *   2. understand(observation) → WorkspaceUnderstanding
 *   3. plan(request, understanding, constraints) → PlanningContext
 */

import type { WorkspaceObservation } from './observation';
import type { WorkspaceUnderstanding } from './understanding';
import type { PlanningConstraints, PlanningContext, UserRequest } from './planning-context';

export interface UnderstandingEngine {
  /**
   * Gather all available signals from the workspace.
   * Synchronous, deterministic, no AI.
   */
  observe(): Promise<WorkspaceObservation>;

  /**
   * Derive a semantic understanding from raw observation.
   * Deterministic — no AI inference in the structural fields.
   */
  understand(observation: WorkspaceObservation): Promise<WorkspaceUnderstanding>;

  /**
   * Produce a planning context for a specific user request.
   * Selects from understanding; does not invent.
   */
  plan(
    request: UserRequest,
    understanding: WorkspaceUnderstanding,
    constraints?: PlanningConstraints,
  ): Promise<PlanningContext>;
}

/**
 * AR-REC-C2: Interaction Application Package
 *
 * Producer-neutral interaction application boundary.
 * Consumed by apps/api and future producers (agent harness, workflow, marketplace).
 * NOT consumed by @vestara/activity-projection.
 */

export type { InteractionServiceOptions } from './interaction-service';
export { InteractionService } from './interaction-service';
export { ResponseConflictError } from './response-conflict-error';

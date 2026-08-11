/**
 * @vestara/opportunity-registry — evidence-driven engineering discovery.
 *
 * Preserves out-of-scope engineering observations as evidence-backed
 * opportunities. Observation does not imply authorization: the registry never
 * executes work; only approved workflows may implement an opportunity.
 */

export { deriveOpportunityConfidence } from './confidence';
export { opportunityKeyFor } from './key';
export type {
  Opportunity,
  OpportunityCategory,
  OpportunityConfidence,
  OpportunityHistoryAction,
  OpportunityHistoryEntry,
  OpportunityObservation,
  OpportunityOrigin,
  OpportunityStatus,
} from './opportunity-types';
export { RECOMMENDED_OPPORTUNITY_CATEGORIES } from './opportunity-types';
export {
  MemoryOpportunityRegistryStore,
  OpportunityError,
  type OpportunityListQuery,
  OpportunityRegistry,
  type OpportunityRegistryStore,
} from './registry';

/**
 * @vestara/ci-reviewer — CI-OBS-001D stateless Reviewer kernel.
 *
 * Pure decision function implementing the 001D-001 decision contract:
 *   review(observation, evidence, priors) -> ReviewerDecision
 *
 * No network, clock, LLM, persistence, or ambient state. Evidence by
 * reference only. Closed 001B vocabulary. Records cause no mutation.
 */

export type { ReviewInputs, ValidationContext } from './review';
export { review, validateReviewerDecision } from './review';
export type {
  HypothesisProposal,
  PriorRecord,
  PromotionDecision,
  PromotionVerdict,
  ReviewerDecision,
  ScopeKeys,
  VerificationState,
} from './types';
export { PROMOTION_VERDICTS } from './types';

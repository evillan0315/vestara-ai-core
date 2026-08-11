/**
 * Opportunity Registry — confidence derivation.
 *
 * Confidence grows through independent observations. Repeated statements by the
 * same agent do not raise confidence: only the set of distinct observers and the
 * breadth of distinct evidence count.
 */

import type { OpportunityConfidence, OpportunityObservation } from './opportunity-types';

export function deriveOpportunityConfidence(observations: readonly OpportunityObservation[]): OpportunityConfidence {
  const observers = new Set(observations.map((observation) => observation.origin.agentId));
  const evidence = new Set(observations.flatMap((observation) => observation.evidenceRefs));
  const independentObservers = observers.size;
  const evidenceCount = evidence.size;

  // Independence contribution is capped so a single agent's repetition never
  // pushes the score; evidence breadth contributes only marginally.
  const score = Math.min(1, 0.1 + 0.25 * Math.min(2, independentObservers) + 0.1 * Math.min(2, evidenceCount));
  const level = score >= 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low';

  const reasons: string[] = [`${independentObservers} independent observer(s)`];
  if (evidenceCount > 0) reasons.push(`${evidenceCount} distinct evidence reference(s)`);
  if (independentObservers === 1 && observations.length > 1) {
    reasons.push('repeated statements by one agent do not raise confidence');
  }
  return { score, level, independentObservers, evidenceCount, reasons };
}

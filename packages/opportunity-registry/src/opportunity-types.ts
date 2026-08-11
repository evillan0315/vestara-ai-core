/**
 * Opportunity Registry — domain contracts.
 *
 * A factual observation (evidence-backed) may become an opportunity. An
 * opportunity is a preserved engineering candidate for future work; it never
 * authorizes implementation. Categories are extensible by design.
 */

/** Recommended categories; the registry accepts any string so the taxonomy stays extensible. */
export const RECOMMENDED_OPPORTUNITY_CATEGORIES = [
  'architecture',
  'performance',
  'security',
  'technical-debt',
  'documentation',
  'developer-experience',
  'workflow',
  'verification',
  'testing',
  'cost-optimization',
  'user-experience',
  'reliability',
] as const;

export type OpportunityCategory = string;

export type OpportunityStatus =
  | 'proposed'
  | 'under-review'
  | 'accepted'
  | 'planned'
  | 'scheduled'
  | 'implemented'
  | 'rejected'
  | 'archived';

/** Where an observation came from inside a governed workflow. */
export interface OpportunityOrigin {
  readonly workflowId: string;
  readonly taskId?: string;
  readonly agentId: string;
  readonly role: string;
  readonly observedAt: string;
}

/**
 * A single evidence-backed observation. `opportunityKey` is a stable grouping
 * signature (category + normalized subject) so independent observations of the
 * same discovery merge into one opportunity.
 */
export interface OpportunityObservation {
  readonly id: string;
  readonly opportunityKey: string;
  readonly title: string;
  readonly description: string;
  readonly category: OpportunityCategory;
  readonly origin: OpportunityOrigin;
  readonly evidenceRefs: readonly string[];
  readonly affectedRepositories: readonly string[];
  readonly affectedPackages: readonly string[];
  readonly affectedFiles: readonly string[];
  readonly suggestedActions: readonly string[];
  readonly estimatedImpact?: string;
  readonly estimatedEffort?: string;
}

export interface OpportunityConfidence {
  readonly score: number; // 0..1
  readonly level: 'low' | 'medium' | 'high';
  /** Distinct observing agents — repeated same-agent statements never raise this. */
  readonly independentObservers: number;
  readonly evidenceCount: number;
  readonly reasons: readonly string[];
}

export type OpportunityHistoryAction = 'created' | 'observation-recorded' | 'status-changed' | 'confidence-recomputed';

export interface OpportunityHistoryEntry {
  readonly at: string;
  readonly action: OpportunityHistoryAction;
  readonly detail: string;
}

export interface Opportunity {
  readonly id: string;
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly category: OpportunityCategory;
  readonly status: OpportunityStatus;
  readonly observations: readonly OpportunityObservation[];
  /** Distinct observing agents, in first-seen order. */
  readonly independentObservers: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly affectedRepositories: readonly string[];
  readonly affectedPackages: readonly string[];
  readonly affectedFiles: readonly string[];
  readonly suggestedActions: readonly string[];
  readonly estimatedImpact?: string;
  readonly estimatedEffort?: string;
  readonly confidence: OpportunityConfidence;
  readonly history: readonly OpportunityHistoryEntry[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * WFO-E2E-002B structured agent outputs.
 *
 * Real Planner/Reviewer responses must return structured schemas, not
 * unrestricted prose. Validation failure → one constrained retry with feedback,
 * then indeterminate. A blocking review finding prevents approval regardless of
 * prose elsewhere in the response.
 */

export interface AgentGeneratedPlanStep {
  readonly id: string;
  readonly description: string;
  readonly assignedRole: string;
  readonly dependencies: readonly string[];
  readonly expectedArtifacts: readonly string[];
  readonly verificationRequirements: readonly string[];
}

export interface AgentGeneratedPlan {
  readonly summary: string;
  readonly assumptions: readonly string[];
  readonly steps: readonly AgentGeneratedPlanStep[];
  readonly affectedPaths: readonly string[];
  readonly outOfScope: readonly string[];
  readonly requiredApprovals: readonly string[];
  readonly risks: readonly string[];
  readonly completionCriteria: readonly string[];
}

export type PlanReviewConclusion = 'approved' | 'changes-requested' | 'rejected' | 'indeterminate';

export type ReviewFindingSeverity = 'info' | 'warning' | 'blocking';

export type ReviewFindingCategory =
  | 'scope'
  | 'architecture'
  | 'verification'
  | 'security'
  | 'approval'
  | 'dependency'
  | 'completeness';

export interface ReviewFinding {
  readonly id: string;
  readonly severity: ReviewFindingSeverity;
  readonly category: ReviewFindingCategory;
  readonly message: string;
  readonly evidenceRefs: readonly string[];
  readonly affectedPlanStepIds: readonly string[];
}

export interface PlanReviewResult {
  readonly conclusion: PlanReviewConclusion;
  readonly findings: readonly ReviewFinding[];
  readonly evidenceRefs: readonly string[];
}

/** A blocking finding prevents approval regardless of persuasive prose. */
export function hasBlockingFindings(review: PlanReviewResult): boolean {
  return review.findings.some((finding) => finding.severity === 'blocking');
}

/** Minimal structural validation for an AgentGeneratedPlan. */
export function validateAgentGeneratedPlan(value: unknown): { valid: boolean; errors: string[] } {
  if (typeof value !== 'object' || value === null) return { valid: false, errors: ['plan is not an object'] };
  const plan = value as Partial<AgentGeneratedPlan>;
  const errors: string[] = [];
  if (typeof plan.summary !== 'string' || plan.summary.length === 0) errors.push('summary is required');
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) errors.push('steps must be a non-empty array');
  for (const [index, step] of (plan.steps ?? []).entries()) {
    if (!step || typeof step.description !== 'string' || step.description.length === 0) {
      errors.push(`step ${index} requires a description`);
    }
  }
  if (!Array.isArray(plan.outOfScope)) errors.push('outOfScope must be an array');
  if (!Array.isArray(plan.affectedPaths)) errors.push('affectedPaths must be an array');
  if (!Array.isArray(plan.completionCriteria)) errors.push('completionCriteria must be an array');
  return { valid: errors.length === 0, errors };
}

/** Minimal structural validation for a PlanReviewResult. */
export function validatePlanReviewResult(value: unknown): { valid: boolean; errors: string[] } {
  if (typeof value !== 'object' || value === null) return { valid: false, errors: ['review is not an object'] };
  const review = value as Partial<PlanReviewResult>;
  const errors: string[] = [];
  if (!['approved', 'changes-requested', 'rejected', 'indeterminate'].includes(review.conclusion ?? '')) {
    errors.push('conclusion must be one of approved/changes-requested/rejected/indeterminate');
  }
  if (!Array.isArray(review.findings)) errors.push('findings must be an array');
  for (const [index, finding] of (review.findings ?? []).entries()) {
    if (!finding || typeof finding.message !== 'string' || finding.message.length === 0) {
      errors.push(`finding ${index} requires a message`);
    }
    if (finding && !['info', 'warning', 'blocking'].includes(finding.severity ?? '')) {
      errors.push(`finding ${index} severity must be info/warning/blocking`);
    }
  }
  return { valid: errors.length === 0, errors };
}

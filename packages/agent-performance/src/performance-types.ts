/**
 * APE-001 — performance contracts.
 *
 * The evaluation dimensions are typed so collectors (workflow, telemetry,
 * repository, verification) have an explicit contract to fill. Every metric is
 * derived from evidence by a collector; nothing here is agent-assigned.
 */

/** Roles are evaluated independently — never a single universal "best model". */
export type AgentRole = 'architect' | 'planner' | 'engineer' | 'reviewer' | 'verifier' | 'documentation';

export type PerformanceDimension = 'compliance' | 'effectiveness' | 'conversation' | 'economic' | 'opportunity';

/** Workflow Compliance — scope adherence, policy, discipline, unauthorized actions, artifacts. */
export interface WorkflowComplianceMetrics {
  readonly scopeAdherence: number; // 0..1
  readonly policyCompliance: number; // 0..1
  readonly workflowDiscipline: number; // 0..1
  readonly unauthorizedActionAttempts: number;
  readonly requiredArtifactsCompleted: number;
  readonly requiredArtifactsTotal: number;
}

/** Engineering Effectiveness — verification outcome, regressions, reviews, human corrections. */
export interface EngineeringEffectivenessMetrics {
  readonly verificationOutcome: 'pass' | 'fail' | 'indeterminate' | 'not-run';
  readonly regressionsIntroduced: number;
  readonly reviewFindings: number;
  readonly acceptedArtifacts: number;
  readonly rejectedArtifacts: number;
  readonly humanCorrections: number;
}

/** Conversation Efficiency — reasoning/execution turns, material progress (WFO integration). */
export interface ConversationEfficiencyMetrics {
  readonly reasoningTurns: number;
  readonly executionTurns: number;
  readonly materialProgressRatio: number; // 0..1
  readonly noProgressRatio: number; // 0..1
  readonly turnsPerArtifact: number; // finite when artifacts exist, else Infinity
}

/** Economic Efficiency — estimated cloud cost and cost per verified outcome. */
export interface EconomicEfficiencyMetrics {
  readonly estimatedCost: number;
  readonly costPerCompletedWorkflow?: number;
  readonly costPerVerifiedArtifact?: number;
  readonly costPerMaterialImprovement?: number;
  readonly unnecessaryReasoningCost?: number;
}

/** Opportunity Discovery — long-term engineering knowledge without scope violation. */
export interface OpportunityDiscoveryMetrics {
  readonly opportunitiesDiscovered: number;
  readonly opportunitiesAccepted: number;
  readonly duplicateDiscoveries: number;
  readonly independentObservations: number;
}

/** The five evaluation dimensions of one agent run. */
export interface AgentPerformanceResults {
  readonly compliance: WorkflowComplianceMetrics;
  readonly effectiveness: EngineeringEffectivenessMetrics;
  readonly conversation: ConversationEfficiencyMetrics;
  readonly economic: EconomicEfficiencyMetrics;
  readonly opportunity: OpportunityDiscoveryMetrics;
}

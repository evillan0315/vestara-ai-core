/**
 * @vestara/agent-performance — APE-001 Agent Performance & Behavioral
 * Evaluation Framework.
 *
 * Contracts, immutable evidence snapshots, and an ADR-012 comparator that
 * measure engineering capability under governance — per role, per workflow
 * scope, per budget. Routing remains a separate policy decision.
 */

export type {
  AgentPerformanceComparison,
  MetricDirection,
  PerformanceChanges,
  PerformanceDimensionResult,
  PerformanceMetricComparison,
} from './comparator';
export {
  AgentPerformanceComparator,
  compareAgentPerformance,
  evaluatePerformanceComparability,
  performanceComparisonHash,
} from './comparator';
export type { PerformanceEvidence } from './performance-evidence';
export { derivePerformanceEvidence } from './performance-evidence';
export type {
  AgentPerformanceExecution,
  AgentPerformanceIdentity,
  AgentPerformanceSnapshot,
  PerformanceSnapshotInput,
} from './performance-snapshot';
export {
  AGENT_PERFORMANCE_EVIDENCE_TYPE,
  APE_SCHEMA_VERSION,
  performanceSnapshot,
} from './performance-snapshot';
export type {
  AgentPerformanceResults,
  AgentRole,
  ConversationEfficiencyMetrics,
  EconomicEfficiencyMetrics,
  EngineeringEffectivenessMetrics,
  OpportunityDiscoveryMetrics,
  PerformanceDimension,
  WorkflowComplianceMetrics,
} from './performance-types';

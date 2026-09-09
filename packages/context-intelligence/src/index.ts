/**
 * @vestara/context-intelligence — Context Intelligence Core
 *
 * Hybrid retrieval, ranking, budgeting, and minimum sufficient context assembly.
 * Passive data assembly system — does not own conversation, routing, execution, or governance.
 *
 * Architecture Traceability:
 *   CTX-1/2/3/4/5/6/7/8/9/10: Context Intelligence
 *   ENG-0/1/2/3/4/5/6: Engineering Autonomy
 *   EFF-0/1/2/3/4/5/6: Efficiency & Knowledge
 *   GA-ACCEPT-001: M11C Incident Replay
 *
 * Invariants:
 *   INV-CTX-1: Context relevance does not confer authority
 *   INV-CTX-2: Context has no cache
 *   INV-CTX-3: Context does not trigger refresh
 *   INV-REC-1: Recovery proceeds without root-cause completion
 *   INV-IK-1: Unverified hypotheses never become facts
 */

export { ContextIntelligenceEngine } from './engine';
export type {
  AssembledContext,
  AssembledContextMetadata,
  ChangeAwareQuery,
  ChangeAwareResult,
  ChangeFileContext,
  CertificationCheck,
  CertificationCheckType,
  CertificationResult,
  CertificationStatus,
  CompressionSummary,
  ContextAssemblerConfig,
  ContextBudget,
  ContextBudgetClass,
  ContextEfficiency,
  ContextFreshness,
  ContextProvenance,
  ContextQuery,
  ContextRankingConfig,
  ContextResult,
  ContextRetrievalResult,
  ContextSourceAdapter,
  ContextSourceType,
  CorrectionChange,
  CorrectionProposal,
  CorrectionProposalStatus,
  CorrectionTarget,
  DegradationTrend,
  DeveloperPreflightQuery,
  DeveloperPreflightResult,
  EscalationAuthority,
  EscalationRequest,
  EscalationStatus,
  HealthPrediction,
  HealthRecommendation,
  HealthRecommendationType,
  HistoricalIncidentQuery,
  HistoricalIncidentResult,
  IncidentKnowledge,
  IncidentKnowledgeConfidence,
  IncidentKnowledgeStatus,
  Investigation,
  InvestigationCost,
  InvestigationEfficiency,
  InvestigationEvidence,
  InvestigationFinding,
  InvestigationOutcome,
  InvestigationStatus,
  M11CIncidentReplay,
  MinimumSufficientConfig,
  PredictiveHealthModel,
  RecoveryAction,
  RecoveryStatus,
  RecoveryStep,
  RecoveryStrategy,
  ResourceBudget,
  ResourceUsage,
  ReplayPhase,
  SelfMaintenanceCertification,
  TimeAnalytics,
  TokenAnalytics,
  TrendDataPoint,
  VerificationCheck,
  VerificationCheckType,
  VerificationEvidence,
  VerificationResult,
  VerificationRun,
} from './types';
export {
  DEFAULT_ASSEMBLER_CONFIG,
  DEFAULT_CONTEXT_BUDGET,
  DEFAULT_MINIMUM_SUFFICIENT,
  DEFAULT_RANKING_CONFIG,
  DEFAULT_RESOURCE_BUDGET,
} from './types';

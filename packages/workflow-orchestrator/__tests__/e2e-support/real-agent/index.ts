/**
 * WFO-E2E-002 real-agent track contracts.
 */

export type {
  TrialInvocationRequest,
  TrialInvocationResult,
  TrialModelProvider,
} from './adapter';
export { OpenCodeRuntimeTrialProvider, UnavailableTrialProvider } from './adapter';
export type { RunControlResult, RunControlState, RunControlStatus } from './controls';
export { evaluateRunControls } from './controls';
export type { AgentInvocationEvidence, RecordInvocationInput } from './invocation';
export { hashText, recordInvocation, redactTranscript } from './invocation';
export type {
  PlanArtifact,
  PlanTrialContext,
  PlanTrialResult,
  PlanTrialRunnerOptions,
  PlanTrialRunOptions,
  TrialConclusion,
  TrialInvocationRecord,
} from './planning-trial';
export { PlanTrialRunner } from './planning-trial';
export type { RealAgentE2EProfile, RealAgentE2EProfileOverrides, RealAgentProviderId, RealAgentRole } from './profile';
export {
  REAL_AGENT_FRAMEWORK_DEFAULTS,
  REAL_AGENT_PROFILE_PRESETS,
  type RealAgentProfilePresetId,
  resolveRealAgentProfile,
} from './profile';
export type {
  AgentGeneratedPlan,
  AgentGeneratedPlanStep,
  PlanReviewConclusion,
  PlanReviewResult,
  ReviewFinding,
  ReviewFindingCategory,
  ReviewFindingSeverity,
  ToolCallEvidence,
} from './schemas';
export { hasBlockingFindings, validateAgentGeneratedPlan, validatePlanReviewResult } from './schemas';

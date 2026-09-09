/**
 * Canonical routing vocabulary.
 *
 * These types express provider/model selection and routing decisions
 * without encoding OpenCode-specific routing internals.
 */

import type { ProviderModelRef } from './provider-model.js';
import type { ProviderAvailability, RoutingConstraints } from './provider-state.js';

/**
 * Routing capability vocabulary.
 *
 * These describe what an execution substrate can technically perform.
 * This is NOT the same as AgentCapability (which describes agent qualifications).
 */
export const ROUTING_CAPABILITIES = [
  'conversation',
  'planning',
  'implementation',
  'code-review',
  'verification',
  'filesystem-read',
  'filesystem-write',
  'command-execution',
  'browser-use',
  'structured-output',
  'streaming',
  'session-resume',
  'mcp-client',
  'image-understanding',
] as const;

export type RoutingCapability = (typeof ROUTING_CAPABILITIES)[number];

/** Runtime type guard for RoutingCapability. */
export function isRoutingCapability(value: string): value is RoutingCapability {
  return (ROUTING_CAPABILITIES as readonly string[]).includes(value);
}

/** Per-role routing preferences. */
export interface RoleRoutingPolicy {
  readonly preferred?: ProviderModelRef;
  readonly requiredCapabilities: readonly RoutingCapability[];
  readonly allowedProviderIds?: readonly string[];
  readonly deniedProviderIds?: readonly string[];
}

export type RoutingMode = 'manual' | 'automatic' | 'local-first' | 'balanced' | 'quality-first' | 'cost-aware';

export type FallbackStage = 'before-execution' | 'before-first-output' | 'mid-turn' | 'mid-execution' | 'verification';

export interface FallbackPolicy {
  readonly enabled: boolean;
  readonly permittedStages: readonly FallbackStage[];
  readonly requireApprovalAfterSideEffects: boolean;
  readonly cooldownMs: number;
}

export interface EngineeringRoutingPolicy {
  readonly id: string;
  readonly mode: RoutingMode;
  readonly implementation: RoleRoutingPolicy;
  readonly verification: RoleRoutingPolicy;
  readonly fallback: FallbackPolicy;
  readonly constraints: RoutingConstraints;
}

export interface EngineeringRoutingSelection {
  readonly profileId: string;
  readonly roles: Partial<Record<string, ProviderModelRef>>;
}

export interface VersionedRoutingSelection {
  readonly revision: number;
  readonly updatedAt: string;
  readonly updatedByClientId: string;
  readonly selection: EngineeringRoutingSelection;
}

export type RoutingAssignmentStatus = 'assigned' | 'running' | 'paused' | 'completed' | 'failed';

export interface RoutingAssignment {
  readonly taskId: string;
  readonly revision: number;
  readonly agentId: string;
  readonly route: ProviderModelRef;
  readonly status: RoutingAssignmentStatus;
  readonly sideEffectsRecorded: boolean;
  readonly assignedAt: string;
  readonly assignedByClientId: string;
  readonly updatedAt: string;
  readonly previousAssignment?: Pick<RoutingAssignment, 'agentId' | 'route'>;
}

export interface RoutingCandidate {
  readonly ref: ProviderModelRef;
  readonly providerName: string;
  readonly locality: 'local' | 'cloud';
  readonly capabilities: readonly RoutingCapability[];
  readonly availability: ProviderAvailability;
  readonly estimatedCost: number;
  readonly contextWindow: number;
}

export interface RejectedCandidate {
  readonly ref: ProviderModelRef;
  readonly reasonCodes: readonly string[];
}

export interface RoutingDecisionEvidence {
  readonly decisionId: string;
  readonly taskId?: string;
  readonly agentId: string;
  readonly selectedProviderId: string;
  readonly selectedModelId: string;
  readonly selectedModelRevision?: string;
  readonly reasonCodes: readonly string[];
  readonly rejectedCandidates: readonly RejectedCandidate[];
  readonly policyId: string;
  readonly source: string;
  readonly decidedAt: string;
}

export interface RoutingRequest {
  readonly taskId?: string;
  readonly agentId: string;
  readonly requiredCapabilities?: readonly RoutingCapability[];
  readonly policy: EngineeringRoutingPolicy;
  readonly source: RoutingDecisionEvidence['source'];
  readonly exclude?: readonly ProviderModelRef[];
}

export interface RoutingResolution {
  readonly selected: RoutingCandidate;
  readonly evidence: RoutingDecisionEvidence;
}

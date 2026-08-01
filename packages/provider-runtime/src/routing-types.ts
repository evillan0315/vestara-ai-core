export const ENGINEERING_CAPABILITIES = [
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

export type EngineeringCapability = (typeof ENGINEERING_CAPABILITIES)[number];

export type EngineeringAgentRole = 'planner' | 'architect' | 'developer' | 'reviewer' | 'verifier' | 'documentation';

export interface ProviderModelRef {
  readonly providerId: string;
  readonly modelId: string;
  readonly modelRevision?: string;
}

export type ProviderOperationalState =
  | 'healthy'
  | 'degraded'
  | 'unavailable'
  | 'cooling-down'
  | 'disabled'
  | 'authentication-required'
  | 'rate-limited';

export interface ProviderAvailability {
  readonly installed: boolean;
  readonly authenticated: boolean;
  readonly reachable: boolean;
  readonly available: boolean;
  readonly allowed: boolean;
  readonly busy: boolean;
  readonly state: ProviderOperationalState;
  readonly latencyMs?: number;
  readonly lastSuccessfulRequest?: string;
  readonly rateLimitResetAt?: string;
}

export interface RoutingConstraints {
  readonly locality: 'local-only' | 'prefer-local' | 'allow-cloud';
  readonly dataPolicy: 'no-source-upload' | 'metadata-only' | 'source-allowed';
  readonly costPolicy: 'free-only' | 'budgeted' | 'unrestricted';
  readonly maximumEstimatedCost?: number;
  readonly maximumLatencyMs?: number;
  readonly requireIndependentVerifier: boolean;
}

export interface RoleRoutingPolicy {
  readonly preferred?: ProviderModelRef;
  readonly requiredCapabilities: readonly EngineeringCapability[];
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
  readonly roles?: Partial<Record<EngineeringAgentRole, RoleRoutingPolicy>>;
  readonly fallback: FallbackPolicy;
  readonly constraints: RoutingConstraints;
}

export interface EngineeringRoutingSelection {
  readonly profileId: string;
  readonly roles: Partial<Record<EngineeringAgentRole, ProviderModelRef>>;
}

export interface VersionedRoutingSelection {
  readonly revision: number;
  readonly updatedAt: string;
  readonly updatedByClientId: string;
  readonly selection: EngineeringRoutingSelection;
}

export interface EngineeringProviderRegistration {
  readonly providerId: string;
  readonly displayName: string;
  readonly locality: 'local' | 'cloud';
  readonly capabilities: readonly EngineeringCapability[];
  readonly dataPolicies: readonly RoutingConstraints['dataPolicy'][];
  readonly modelRevisions?: Readonly<Record<string, string>>;
}

export interface RoutingCandidate {
  readonly ref: ProviderModelRef;
  readonly providerName: string;
  readonly locality: EngineeringProviderRegistration['locality'];
  readonly capabilities: readonly EngineeringCapability[];
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
  readonly agentRole: EngineeringAgentRole;
  readonly selectedAgentId: string;
  readonly selectedProviderId: string;
  readonly selectedModelId: string;
  readonly selectedModelRevision?: string;
  readonly reasonCodes: readonly string[];
  readonly rejectedCandidates: readonly RejectedCandidate[];
  readonly policyId: string;
  readonly source: 'workspace-ui' | 'console' | 'automatic';
  readonly decidedAt: string;
}

export interface RoutingRequest {
  readonly taskId?: string;
  readonly role: EngineeringAgentRole;
  readonly agentId: string;
  readonly requiredCapabilities?: readonly EngineeringCapability[];
  readonly policy: EngineeringRoutingPolicy;
  readonly source: RoutingDecisionEvidence['source'];
  readonly exclude?: readonly ProviderModelRef[];
}

export interface RoutingResolution {
  readonly selected: RoutingCandidate;
  readonly evidence: RoutingDecisionEvidence;
}

export type RoutingAssignmentStatus = 'assigned' | 'running' | 'paused' | 'completed' | 'failed';

export interface RoutingAssignment {
  readonly taskId: string;
  readonly revision: number;
  readonly role: EngineeringAgentRole;
  readonly agentId: string;
  readonly route: ProviderModelRef;
  readonly status: RoutingAssignmentStatus;
  readonly sideEffectsRecorded: boolean;
  readonly assignedAt: string;
  readonly assignedByClientId: string;
  readonly updatedAt: string;
  readonly previousAssignment?: Pick<RoutingAssignment, 'agentId' | 'route'>;
}

export interface RoutingReassignmentRequest {
  readonly taskId: string;
  readonly expectedRevision: number;
  readonly agentId: string;
  readonly route: ProviderModelRef;
  readonly requestedByClientId: string;
  readonly reason: string;
  readonly approved: boolean;
}

export interface RoutingReassignmentResult {
  readonly status: 'reassigned' | 'approval-required';
  readonly assignment: RoutingAssignment;
  readonly reasonCodes: readonly string[];
}

export class RoutingAssignmentConflictError extends Error {
  constructor(
    readonly expectedRevision: number,
    readonly current: RoutingAssignment,
  ) {
    super(`Routing assignment revision conflict: expected ${expectedRevision}, current ${current.revision}`);
    this.name = 'RoutingAssignmentConflictError';
  }
}

export class RoutingConflictError extends Error {
  constructor(
    readonly expectedRevision: number,
    readonly current: VersionedRoutingSelection,
  ) {
    super(`Routing revision conflict: expected ${expectedRevision}, current ${current.revision}`);
    this.name = 'RoutingConflictError';
  }
}

export class NoCompatibleRoutingCandidateError extends Error {
  constructor(readonly rejectedCandidates: readonly RejectedCandidate[]) {
    super('No compatible provider/model candidate satisfies the routing policy');
    this.name = 'NoCompatibleRoutingCandidateError';
  }
}

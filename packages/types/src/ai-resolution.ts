/**
 * ARX-015 M4: AI Resolution & Execution Binding
 *
 * Defines the immutable binding model:
 *   AI invocation request → requirements/context → AiResolutionService →
 *   immutable ResolvedAiBinding → AiInvocationGuard → actual provider/model
 *   invocation → canonical event/evidence lineage
 *
 * Architecture:
 *   - ResolvedAiBinding belongs to an individual AI invocation/assignment,
 *     not globally to an execution.
 *   - Once an invocation is authorized, its binding must not mutate.
 *   - The provider/model passed to the provider runtime must equal the
 *     authoritative ResolvedAiBinding.
 *   - AI invocation without valid binding → DENY.
 *   - Provider/model mismatch → DENY.
 *   - Policy denial → DENY.
 *   - Budget exhaustion → DENY.
 */

import type { ExecutionMode } from './execution-policy';
import type { BindingId, ExecutionId, RequestId, TraceId, WorkflowRunId } from './ids';

// ─── Provider/Model Reference ────────────────────────────────

/** Immutable reference to a specific provider and model. */
export interface ProviderModelBinding {
  readonly providerId: string;
  readonly modelId: string;
  readonly modelRevision?: string;
}

// ─── Resolution Request ──────────────────────────────────────

/** Input to the AI resolution service. */
export interface AiResolutionRequest {
  /** The execution context for this resolution. */
  readonly executionId?: ExecutionId;
  readonly workflowRunId?: WorkflowRunId;
  readonly traceId?: TraceId;
  readonly requestId?: RequestId;

  /** Task context. */
  readonly taskId?: string;
  readonly agentAssignmentId?: string;

  /** Required capabilities for this invocation. */
  readonly requiredCapabilities?: readonly string[];

  /** Execution mode constraints from M3. */
  readonly executionMode?: ExecutionMode;

  /** Explicit provider/model preference (caller-specified, subject to routing). */
  readonly preferredProviderId?: string;
  readonly preferredModelId?: string;

  /**
   * Already-resolved provider/model (from routing service).
   * When set, these take precedence over preferredProviderId/preferredModelId.
   * The routingReason is set from the provided reason.
   */
  readonly resolvedProviderId?: string;
  readonly resolvedModelId?: string;
  readonly resolvedRoutingReason?: AiResolutionFacts['routingReason'];

  /** Requirements that guided the resolution. */
  readonly requirements?: AiResolutionRequirements;
}

/** Describes what the AI invocation needs. */
export interface AiResolutionRequirements {
  /** Why this invocation is needed. */
  readonly purpose: string;
  /** Whether streaming is required. */
  readonly streaming?: boolean;
  /** Whether structured output is required. */
  readonly structuredOutput?: boolean;
  /** Maximum token budget hint. */
  readonly maxTokens?: number;
  /** Required model capabilities. */
  readonly requiredModelCapabilities?: readonly string[];
}

// ─── Resolution Facts ────────────────────────────────────────

/** Immutable record of why a binding was selected. */
export interface AiResolutionFacts {
  /** What was requested. */
  readonly requestedCapabilities: readonly string[];
  readonly requestedProviderId?: string;
  readonly requestedModelId?: string;

  /** What was selected. */
  readonly selectedProviderId: string;
  readonly selectedModelId: string;
  readonly selectedModelRevision?: string;

  /** Why this resolution was chosen. */
  readonly routingReason:
    | 'explicit-preference'
    | 'capability-match'
    | 'policy-constraint'
    | 'fallback'
    | 'default'
    | 'task-override'
    | 'role-routing';

  /** Fallback relationship when applicable. */
  readonly fallbackFrom?: {
    readonly providerId: string;
    readonly modelId: string;
    readonly reason: string;
  };

  /** Policy constraints relevant to selection. */
  readonly policyConstraints?: {
    readonly executionMode?: ExecutionMode;
    readonly maxToolRisk?: string;
    readonly requiresApproval?: boolean;
    readonly budgetExhausted?: boolean;
  };

  /** When this resolution was computed. */
  readonly resolvedAt: string;
}

// ─── Resolved Binding ────────────────────────────────────────

/**
 * Immutable AI resolution binding at invocation/assignment scope.
 *
 * Once created, this binding must not mutate. A fallback or retry requiring
 * another provider/model must create a new binding with lineage to the
 * previous attempt.
 */
export interface ResolvedAiBinding {
  /** Unique identifier for this binding. */
  readonly bindingId: BindingId;

  /** Canonical lineage from M1/M2. */
  readonly executionId?: ExecutionId;
  readonly workflowRunId?: WorkflowRunId;
  readonly traceId?: TraceId;
  readonly requestId?: RequestId;
  readonly taskId?: string;
  readonly agentAssignmentId?: string;

  /** The authoritative provider/model for this invocation. */
  readonly providerModel: ProviderModelBinding;

  /** Immutable resolution facts. */
  readonly resolutionFacts: AiResolutionFacts;

  /** Whether this binding requires explicit approval before invocation. */
  readonly requiresApproval: boolean;

  /** The execution mode under which this binding was resolved. */
  readonly executionMode: ExecutionMode;

  /** When this binding was created. */
  readonly createdAt: string;
}

// ─── Invocation Guard ────────────────────────────────────────

/** Request to invoke an AI model, guarded by a binding. */
export interface AiInvocationRequest {
  /** The binding authorizing this invocation. */
  readonly binding: ResolvedAiBinding;

  /** The provider/model that will actually be invoked. */
  readonly providerId: string;
  readonly modelId: string;

  /** The messages to send. */
  readonly messages: readonly {
    readonly role: 'system' | 'user' | 'assistant' | 'tool';
    readonly content: string;
  }[];

  /** Optional: the tool definitions. */
  readonly tools?: readonly unknown[];

  /** Optional: request structured output. */
  readonly structuredOutput?: boolean;
}

/** Result of a guarded AI invocation. */
export interface AiInvocationResult {
  /** Whether the invocation was allowed. */
  readonly allowed: boolean;

  /** The binding used for this invocation. */
  readonly bindingId: BindingId;

  /** The provider/model actually invoked (must match binding). */
  readonly invokedProviderId: string;
  readonly invokedModelId: string;

  /** Denial reason when not allowed. */
  readonly denialReason?: AiDenialReason;

  /** Whether approval is still pending. */
  readonly approvalPending?: boolean;
}

/** Reasons an AI invocation can be denied. */
export type AiDenialReason =
  | 'missing-binding'
  | 'provider-mismatch'
  | 'model-mismatch'
  | 'policy-denial'
  | 'budget-exhausted'
  | 'approval-required'
  | 'binding-expired'
  | 'execution-mode-denied';

// ─── Binding Lineage ─────────────────────────────────────────

/** Canonical lineage extracted from a binding for event emission. */
export interface AiBindingLineage {
  readonly bindingId: BindingId;
  readonly executionId?: ExecutionId;
  readonly workflowRunId?: WorkflowRunId;
  readonly traceId?: TraceId;
  readonly requestId?: RequestId;
  readonly taskId?: string;
  readonly agentAssignmentId?: string;
}

// ─── Event Payloads ──────────────────────────────────────────

/** Event emitted when an AI binding is resolved. */
export interface AiBindingResolvedPayload {
  readonly bindingId: string;
  readonly executionId?: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly executionMode: ExecutionMode;
  readonly routingReason: AiResolutionFacts['routingReason'];
  readonly requiresApproval: boolean;
}

/** Event emitted when an AI invocation is guarded/evaluated. */
export interface AiInvocationGuardedPayload {
  readonly bindingId: string;
  readonly executionId?: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly allowed: boolean;
  readonly denialReason?: AiDenialReason;
}

/** Event emitted when an AI invocation completes. */
export interface AiInvocationCompletedPayload {
  readonly bindingId: string;
  readonly executionId?: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly success: boolean;
  readonly error?: string;
  readonly usage?: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
}

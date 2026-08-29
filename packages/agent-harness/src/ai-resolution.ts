/**
 * ARX-015 M4: AI Resolution Service
 *
 * Resolves an immutable AiBinding from an invocation request.
 *
 * Architecture:
 *   AI invocation request → requirements/context → AiResolutionService →
 *   immutable ResolvedAiBinding
 *
 * Resolution precedence:
 *   1. Explicit caller preference (preferredProviderId/preferredModelId)
 *   2. Task-level override
 *   3. Capability-based selection
 *   4. Default provider/model
 *
 * Effective policy may become stricter, never silently weaker.
 * Resolution is deterministic for identical constraints.
 */

import type {
  AiResolutionFacts,
  AiResolutionRequest,
  AiResolutionRequirements,
  BindingId,
  ResolvedAiBinding,
} from '@vestara/types';

// ─── Default provider/model ──────────────────────────────────

const DEFAULT_PROVIDER_ID = 'opencode';
const DEFAULT_MODEL_ID = 'mimo-v2.5-free';

// ─── Binding ID generation ───────────────────────────────────

let bindingCounter = 0;

function generateBindingId(): BindingId {
  return `binding-${Date.now()}-${++bindingCounter}` as BindingId;
}

// ─── Resolution Logic ────────────────────────────────────────

/**
 * Resolve an AI binding from an invocation request.
 *
 * This function is pure/deterministic for identical inputs:
 *   - Same requirements + same executionMode + same preferredProvider/Model
 *     → same provider/model selection
 *   - BindingId is unique per invocation (timestamped)
 *
 * Resolution may become stricter via execution mode or task constraints,
 * but never silently weaker.
 *
 * @param request - The resolution request
 * @returns An immutable ResolvedAiBinding
 */
export function resolveAiBinding(request: AiResolutionRequest): ResolvedAiBinding {
  const executionMode = request.executionMode ?? 'governed';
  const requirements = request.requirements;

  // 1. Resolve provider/model
  const { providerId, modelId, modelRevision, routingReason } = selectProviderModel(request, requirements);

  // 2. Build resolution facts
  const resolutionFacts: AiResolutionFacts = {
    requestedCapabilities: requirements?.requiredModelCapabilities ?? [],
    requestedProviderId: request.preferredProviderId,
    requestedModelId: request.preferredModelId,
    selectedProviderId: providerId,
    selectedModelId: modelId,
    selectedModelRevision: modelRevision,
    routingReason,
    policyConstraints: {
      executionMode,
    },
    resolvedAt: new Date().toISOString(),
  };

  // 3. Determine approval requirement based on execution mode
  const requiresApproval = executionMode === 'hermetic';

  // 4. Create immutable binding
  return {
    bindingId: generateBindingId(),
    executionId: request.executionId,
    workflowRunId: request.workflowRunId,
    traceId: request.traceId,
    requestId: request.requestId,
    taskId: request.taskId,
    agentAssignmentId: request.agentAssignmentId,
    providerModel: {
      providerId,
      modelId,
      modelRevision,
    },
    resolutionFacts,
    requiresApproval,
    executionMode,
    createdAt: new Date().toISOString(),
  };
}

// ─── Provider/Model Selection ────────────────────────────────

/**
 * Select provider/model from the resolution request.
 *
 * Selection order:
 *   1. Already-resolved values (from AiInvocationService routing)
 *   2. Explicit caller preference (highest priority)
 *   3. Task-level override
 *   4. Default (lowest priority)
 *
 * This is deterministic for identical inputs.
 */
function selectProviderModel(
  request: AiResolutionRequest,
  _requirements?: AiResolutionRequirements,
): {
  providerId: string;
  modelId: string;
  modelRevision?: string;
  routingReason: AiResolutionFacts['routingReason'];
} {
  // 1. Already-resolved values (from AiInvocationService routing)
  if (request.resolvedProviderId && request.resolvedModelId) {
    return {
      providerId: request.resolvedProviderId,
      modelId: request.resolvedModelId,
      routingReason: request.resolvedRoutingReason ?? 'default',
    };
  }

  // 2. Explicit caller preference
  if (request.preferredProviderId && request.preferredModelId) {
    return {
      providerId: request.preferredProviderId,
      modelId: request.preferredModelId,
      routingReason: 'explicit-preference',
    };
  }

  // 3. Task-level override (if only one is specified, use default for the other)
  if (request.preferredProviderId) {
    return {
      providerId: request.preferredProviderId,
      modelId: request.preferredModelId ?? DEFAULT_MODEL_ID,
      routingReason: 'task-override',
    };
  }

  if (request.preferredModelId) {
    return {
      providerId: request.preferredProviderId ?? DEFAULT_PROVIDER_ID,
      modelId: request.preferredModelId,
      routingReason: 'task-override',
    };
  }

  // 4. Default
  return {
    providerId: DEFAULT_PROVIDER_ID,
    modelId: DEFAULT_MODEL_ID,
    routingReason: 'default',
  };
}

// ─── Lineage Extraction ──────────────────────────────────────

/**
 * Extract canonical lineage from a binding for event emission.
 *
 * This is a pure projection — the binding is immutable, so lineage
 * is always consistent.
 */
export function extractBindingLineage(binding: ResolvedAiBinding) {
  return {
    bindingId: binding.bindingId,
    executionId: binding.executionId,
    workflowRunId: binding.workflowRunId,
    traceId: binding.traceId,
    requestId: binding.requestId,
    taskId: binding.taskId,
    agentAssignmentId: binding.agentAssignmentId,
  };
}

// ─── Binding Immutability Check ──────────────────────────────

/**
 * Verify that a binding has not been mutated since creation.
 *
 * Returns true if the binding is valid (provider/model match the
 * resolution facts).
 */
export function verifyBindingIntegrity(binding: ResolvedAiBinding): boolean {
  return (
    binding.providerModel.providerId === binding.resolutionFacts.selectedProviderId &&
    binding.providerModel.modelId === binding.resolutionFacts.selectedModelId
  );
}

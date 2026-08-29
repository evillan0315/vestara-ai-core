import type { EventBus } from '@vestara/event-bus';
import type { AIModel, AIProvider } from '@vestara/shared';
import { ProviderHealthTracker } from './provider-health-tracker.js';
import type {
  EngineeringCapability,
  EngineeringProviderRegistration,
  FallbackStage,
  ProviderModelRef,
  RejectedCandidate,
  RoutingCandidate,
  RoutingRequest,
  RoutingResolution,
} from './routing-types.js';
import { NoCompatibleRoutingCandidateError } from './routing-types.js';

const capabilityAliases: Readonly<Record<string, EngineeringCapability>> = {
  chat: 'conversation',
  streaming: 'streaming',
  'function-calling': 'structured-output',
  vision: 'image-understanding',
};

function sameRef(left: ProviderModelRef, right: ProviderModelRef): boolean {
  return left.providerId === right.providerId && left.modelId === right.modelId;
}

export class EngineeringProviderCatalog {
  private readonly providers = new Map<
    string,
    { provider: AIProvider; registration: EngineeringProviderRegistration }
  >();

  register(provider: AIProvider, registration?: Partial<EngineeringProviderRegistration>): void {
    const capabilities = new Set<EngineeringCapability>(registration?.capabilities ?? []);
    for (const feature of provider.capabilities.features) {
      const normalized = capabilityAliases[feature];
      if (normalized) capabilities.add(normalized);
    }
    for (const model of provider.models) {
      if (model.capabilities.chat) capabilities.add('conversation');
      if (model.capabilities.streaming) capabilities.add('streaming');
      if (model.capabilities.functionCalling) capabilities.add('structured-output');
      if (model.capabilities.vision) capabilities.add('image-understanding');
    }

    this.providers.set(provider.id, {
      provider,
      registration: {
        providerId: provider.id,
        displayName: registration?.displayName ?? provider.name,
        locality: registration?.locality ?? 'cloud',
        capabilities: [...capabilities],
        dataPolicies: registration?.dataPolicies ?? ['source-allowed'],
        modelRevisions: registration?.modelRevisions,
      },
    });
  }

  unregister(providerId: string): void {
    this.providers.delete(providerId);
  }

  list(health: ProviderHealthTracker): RoutingCandidate[] {
    const candidates: RoutingCandidate[] = [];
    for (const { provider, registration } of this.providers.values()) {
      for (const model of provider.models) candidates.push(this.toCandidate(provider, model, registration, health));
    }
    return candidates;
  }

  registration(providerId: string): EngineeringProviderRegistration | undefined {
    return this.providers.get(providerId)?.registration;
  }

  private toCandidate(
    provider: AIProvider,
    model: AIModel,
    registration: EngineeringProviderRegistration,
    health: ProviderHealthTracker,
  ): RoutingCandidate {
    const availability = health.availability(provider.id);
    const providerAvailable = provider.status === 'available' || provider.status === 'degraded';
    const modelAvailable = model.status === 'available' || model.status === 'degraded';
    return {
      ref: {
        providerId: provider.id,
        modelId: model.id,
        modelRevision: registration.modelRevisions?.[model.id],
      },
      providerName: registration.displayName,
      locality: registration.locality,
      capabilities: registration.capabilities,
      availability: {
        ...availability,
        available: availability.available && providerAvailable && modelAvailable,
      },
      estimatedCost: (model.pricing?.inputPerMillionTokens ?? 0) + (model.pricing?.outputPerMillionTokens ?? 0),
      contextWindow: model.contextWindow,
    };
  }
}

export class EngineeringRoutingRuntime {
  readonly health: ProviderHealthTracker;

  constructor(
    readonly catalog: EngineeringProviderCatalog,
    options: { health?: ProviderHealthTracker; eventBus?: EventBus } = {},
  ) {
    this.health = options.health ?? new ProviderHealthTracker();
    this.eventBus = options.eventBus;
  }

  private eventBus?: EventBus;

  attachEventBus(eventBus: EventBus): void {
    this.eventBus = eventBus;
  }

  async resolve(request: RoutingRequest): Promise<RoutingResolution> {
    await this.emit('routing.selection-requested', {
      taskId: request.taskId,
      role: request.role,
      policyId: request.policy.id,
      source: request.source,
    });

    const rolePolicy =
      request.policy.roles?.[request.role] ??
      (request.role === 'verifier' || request.role === 'reviewer'
        ? request.policy.verification
        : request.policy.implementation);
    const required = new Set([...rolePolicy.requiredCapabilities, ...(request.requiredCapabilities ?? [])]);
    const rejected: RejectedCandidate[] = [];
    const compatible: RoutingCandidate[] = [];

    for (const candidate of this.catalog.list(this.health)) {
      const reasons: string[] = [];
      const registration = this.catalog.registration(candidate.ref.providerId);
      if (!candidate.availability.available) reasons.push(`provider-${candidate.availability.state}`);
      if (!candidate.availability.allowed) reasons.push('provider-disallowed');
      if (candidate.availability.busy) reasons.push('provider-busy');
      if (rolePolicy.allowedProviderIds && !rolePolicy.allowedProviderIds.includes(candidate.ref.providerId))
        reasons.push('provider-not-allowed-for-role');
      if (rolePolicy.deniedProviderIds?.includes(candidate.ref.providerId)) reasons.push('provider-denied-for-role');
      if (request.exclude?.some((ref) => sameRef(ref, candidate.ref))) reasons.push('candidate-excluded');
      for (const capability of required) {
        if (!candidate.capabilities.includes(capability)) reasons.push(`missing-capability:${capability}`);
      }
      if (request.policy.constraints.locality === 'local-only' && candidate.locality !== 'local')
        reasons.push('cloud-provider-disallowed');
      if (!registration?.dataPolicies.includes(request.policy.constraints.dataPolicy))
        reasons.push('data-policy-incompatible');
      if (request.policy.constraints.costPolicy === 'free-only' && candidate.estimatedCost > 0)
        reasons.push('paid-model');
      if (
        request.policy.constraints.maximumEstimatedCost !== undefined &&
        candidate.estimatedCost > request.policy.constraints.maximumEstimatedCost
      )
        reasons.push('cost-limit-exceeded');
      if (
        request.policy.constraints.maximumLatencyMs !== undefined &&
        (candidate.availability.latencyMs ?? Number.POSITIVE_INFINITY) > request.policy.constraints.maximumLatencyMs
      )
        reasons.push('latency-limit-exceeded');

      if (reasons.length > 0) rejected.push({ ref: candidate.ref, reasonCodes: reasons });
      else compatible.push(candidate);
    }

    await this.emit('routing.candidates-evaluated', {
      taskId: request.taskId,
      compatibleCount: compatible.length,
      rejectedCount: rejected.length,
    });
    if (compatible.length === 0) throw new NoCompatibleRoutingCandidateError(rejected);

    const selected = this.rank(compatible, rolePolicy.preferred, request.policy.mode)[0];
    const reasonCodes =
      rolePolicy.preferred && sameRef(rolePolicy.preferred, selected.ref)
        ? ['preferred-candidate', `mode:${request.policy.mode}`]
        : ['best-compatible-candidate', `mode:${request.policy.mode}`];
    const evidence = {
      decisionId: `routing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      taskId: request.taskId,
      agentRole: request.role,
      selectedAgentId: request.agentId,
      selectedProviderId: selected.ref.providerId,
      selectedModelId: selected.ref.modelId,
      selectedModelRevision: selected.ref.modelRevision,
      reasonCodes,
      rejectedCandidates: rejected,
      policyId: request.policy.id,
      source: request.source,
      decidedAt: new Date().toISOString(),
    } as const;
    await this.emit('routing.selection-resolved', { ...evidence });
    return { selected, evidence };
  }

  canFallback(stage: FallbackStage, sideEffectsRecorded: boolean, request: RoutingRequest): boolean {
    const policy = request.policy.fallback;
    if (!policy.enabled || !policy.permittedStages.includes(stage)) return false;
    if (sideEffectsRecorded && policy.requireApprovalAfterSideEffects) return false;
    return true;
  }

  private rank(
    candidates: RoutingCandidate[],
    preferred: ProviderModelRef | undefined,
    mode: RoutingRequest['policy']['mode'],
  ) {
    return [...candidates].sort((left, right) => {
      if (preferred) {
        const leftPreferred = sameRef(left.ref, preferred);
        const rightPreferred = sameRef(right.ref, preferred);
        if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;
      }
      if (mode === 'local-first' && left.locality !== right.locality) return left.locality === 'local' ? -1 : 1;
      if (mode === 'cost-aware' && left.estimatedCost !== right.estimatedCost)
        return left.estimatedCost - right.estimatedCost;
      if (mode === 'quality-first' && left.contextWindow !== right.contextWindow)
        return right.contextWindow - left.contextWindow;
      return (
        (left.availability.latencyMs ?? Number.POSITIVE_INFINITY) -
        (right.availability.latencyMs ?? Number.POSITIVE_INFINITY)
      );
    });
  }

  private async emit(type: string, payload: Record<string, unknown>): Promise<void> {
    await this.eventBus?.emit({ type, source: 'engineering-routing', payload });
  }
}

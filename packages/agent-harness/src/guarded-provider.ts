/**
 * ARX-015 M4B: GuardedAIProvider — Defense-in-Depth Adapter
 *
 * Two modes:
 *
 * 1. ASSERT MODE (canonical production path):
 *    Receives an already-authorized ResolvedAiBinding from AiInvocationService
 *    and asserts provider/model equality before forwarding to the inner provider.
 *    No independent resolution occurs.
 *
 * 2. RESOLVE MODE (legacy/test callers):
 *    Resolves its own binding via resolveAiBinding(). Used only by legacy or
 *    test callers that do not go through AiInvocationService.
 *
 * Architecture:
 *   one aiRequestId → one authoritative binding decision (AiInvocationService)
 *   → optional adapter assertion (GuardedAIProvider) → provider invocation
 *
 * In the canonical production path:
 *   AiInvocationService → ResolvedAiBinding → GuardedAIProvider (assert) → provider
 *
 * GuardedAIProvider must not independently resolve a different provider/model
 * after AiInvocationService has already created an authoritative binding.
 */

import type {
  AIModel,
  AIProvider,
  CompletionRequest,
  CompletionResponse,
  ProviderCapabilities,
  ProviderHealthStatus,
  ProviderStatus,
  StreamChunk,
} from '@vestara/shared';
import type {
  AiInvocationRequest,
  AiResolutionFacts,
  AiResolutionRequest,
  ExecutionId,
  ExecutionMode,
  RequestId,
  ResolvedAiBinding,
  TraceId,
  WorkflowRunId,
} from '@vestara/types';
import { guardAiInvocation } from './ai-invocation-guard.js';
import { resolveAiBinding } from './ai-resolution.js';

// ─── Configuration ───────────────────────────────────────────

/** Context extracted from a CompletionRequest for binding resolution. */
export interface GuardedProviderContext {
  readonly executionId?: ExecutionId;
  readonly workflowRunId?: WorkflowRunId;
  readonly traceId?: TraceId;
  readonly requestId?: RequestId;
  readonly taskId?: string;
  readonly agentAssignmentId?: string;
  readonly executionMode?: ExecutionMode;
  readonly preferredProviderId?: string;
  readonly preferredModelId?: string;
}

/** Configuration for assert mode (canonical production path). */
export interface GuardedProviderAssertConfig {
  /** The already-authorized binding from AiInvocationService. */
  readonly binding: ResolvedAiBinding;
  /** Optional: emit canonical M4 events. */
  readonly eventEmitter?: (event: GuardedProviderEvent) => void;
}

/** Configuration for resolve mode (legacy/test callers). */
export interface GuardedProviderResolveConfig {
  /** The underlying provider to forward to after guard passes. */
  readonly inner: AIProvider;
  /** Extract resolution context from each CompletionRequest. */
  readonly resolveContext: (request: CompletionRequest) => GuardedProviderContext;
  /** Optional: emit canonical M4 events. */
  readonly eventEmitter?: (event: GuardedProviderEvent) => void;
}

// ─── Events ──────────────────────────────────────────────────

/** Events emitted by GuardedAIProvider. */
export type GuardedProviderEvent =
  | {
      readonly type: 'binding.asserted';
      readonly bindingId: string;
      readonly executionId?: string;
      readonly providerId: string;
      readonly modelId: string;
    }
  | {
      readonly type: 'invocation.guarded';
      readonly bindingId: string;
      readonly executionId?: string;
      readonly allowed: boolean;
      readonly denialReason?: string;
    }
  | {
      readonly type: 'invocation.denied';
      readonly bindingId: string;
      readonly executionId?: string;
      readonly denialReason: string;
    }
  | {
      readonly type: 'invocation.completed';
      readonly bindingId: string;
      readonly executionId?: string;
      readonly providerId: string;
      readonly modelId: string;
      readonly success: boolean;
      readonly error?: string;
    };

// ─── GuardedAIProvider ───────────────────────────────────────

/**
 * Defense-in-depth adapter that asserts binding equality.
 *
 * In assert mode (canonical), receives an already-authorized binding
 * and verifies provider/model match before forwarding.
 *
 * In resolve mode (legacy), resolves its own binding — used only by
 * callers that do not go through AiInvocationService.
 */
export class GuardedAIProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  private readonly _inner: AIProvider;
  private readonly _binding: ResolvedAiBinding | null;
  private readonly _resolveContext: ((request: CompletionRequest) => GuardedProviderContext) | null;
  private readonly _eventEmitter?: (event: GuardedProviderEvent) => void;
  private readonly _bindingHistory: ResolvedAiBinding[] = [];

  /** Assert mode: defense-in-depth with pre-authorized binding. */
  constructor(config: GuardedProviderAssertConfig & { inner: AIProvider });
  /** Resolve mode: legacy/test — resolves own binding. */
  constructor(config: GuardedProviderResolveConfig);
  constructor(config: (GuardedProviderAssertConfig | GuardedProviderResolveConfig) & { inner: AIProvider }) {
    this._inner = config.inner;
    this._eventEmitter = config.eventEmitter;
    this.id = config.inner.id;
    this.name = config.inner.name;
    this.version = config.inner.version;

    if ('binding' in config) {
      // Assert mode
      this._binding = config.binding;
      this._resolveContext = null;
    } else {
      // Resolve mode
      this._binding = null;
      this._resolveContext = config.resolveContext;
    }
  }

  get status(): ProviderStatus {
    return this._inner.status;
  }

  get models(): AIModel[] {
    return this._inner.models;
  }

  get capabilities(): ProviderCapabilities {
    return this._inner.capabilities;
  }

  /** Get the full binding history (immutable). */
  get bindingHistory(): readonly ResolvedAiBinding[] {
    return this._bindingHistory;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    return this._inner.initialize(config);
  }

  /**
   * The guarded complete() — asserts binding or resolves then asserts.
   */
  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    let binding: ResolvedAiBinding;

    if (this._binding) {
      // ASSERT MODE: use pre-authorized binding (canonical production path)
      binding = this._binding;
    } else {
      // RESOLVE MODE: resolve own binding (legacy/test)
      const context = this._resolveContext!(request);
      binding = resolveAiBinding({
        executionId: context.executionId,
        workflowRunId: context.workflowRunId,
        traceId: context.traceId,
        requestId: context.requestId,
        taskId: context.taskId,
        agentAssignmentId: context.agentAssignmentId,
        executionMode: context.executionMode,
        preferredProviderId: context.preferredProviderId ?? this._inner.id,
        preferredModelId: context.preferredModelId ?? request.model,
      });
    }

    // Record binding in history (immutable append)
    this._bindingHistory.push(binding);

    // Emit binding.asserted event (not binding.resolved — resolution happened elsewhere)
    this._emit({
      type: 'binding.asserted',
      bindingId: binding.bindingId,
      executionId: binding.executionId,
      providerId: binding.providerModel.providerId,
      modelId: binding.providerModel.modelId,
    });

    // Guard invocation — verify provider/model match
    const guardRequest: AiInvocationRequest = {
      binding,
      providerId: this._inner.id,
      modelId: request.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
    };

    const guardResult = guardAiInvocation(guardRequest);

    // Emit invocation.guarded event
    this._emit({
      type: 'invocation.guarded',
      bindingId: binding.bindingId,
      executionId: binding.executionId,
      allowed: guardResult.allowed,
      denialReason: guardResult.denialReason,
    });

    // If guard denied → fail closed
    if (!guardResult.allowed) {
      this._emit({
        type: 'invocation.denied',
        bindingId: binding.bindingId,
        executionId: binding.executionId,
        denialReason: guardResult.denialReason ?? 'unknown',
      });
      throw new AiInvocationDeniedError(guardResult.denialReason ?? 'unknown', binding.bindingId, binding.executionId);
    }

    // Forward to inner provider
    try {
      const response = await this._inner.complete(request);

      // Verify response provider matches binding
      if (response.provider !== binding.providerModel.providerId) {
        this._emit({
          type: 'invocation.denied',
          bindingId: binding.bindingId,
          executionId: binding.executionId,
          denialReason: 'provider-mismatch',
        });
        throw new AiInvocationDeniedError(
          'provider-mismatch',
          binding.bindingId,
          binding.executionId,
          `Response provider '${response.provider}' does not match binding '${binding.providerModel.providerId}'`,
        );
      }

      this._emit({
        type: 'invocation.completed',
        bindingId: binding.bindingId,
        executionId: binding.executionId,
        providerId: response.provider,
        modelId: response.model,
        success: true,
      });

      return response;
    } catch (error) {
      this._emit({
        type: 'invocation.completed',
        bindingId: binding.bindingId,
        executionId: binding.executionId,
        providerId: binding.providerModel.providerId,
        modelId: binding.providerModel.modelId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async *stream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    // Stream uses the same guard path via complete()
    // For now, delegate to inner provider after guard check
    let binding: ResolvedAiBinding;

    if (this._binding) {
      binding = this._binding;
    } else {
      const context = this._resolveContext!(request);
      binding = resolveAiBinding({
        executionId: context.executionId,
        workflowRunId: context.workflowRunId,
        traceId: context.traceId,
        requestId: context.requestId,
        taskId: context.taskId,
        agentAssignmentId: context.agentAssignmentId,
        executionMode: context.executionMode,
        preferredProviderId: context.preferredProviderId ?? this._inner.id,
        preferredModelId: context.preferredModelId ?? request.model,
      });
    }

    this._bindingHistory.push(binding);

    const guardResult = guardAiInvocation({
      binding,
      providerId: this._inner.id,
      modelId: request.model,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
    });

    if (!guardResult.allowed) {
      throw new AiInvocationDeniedError(guardResult.denialReason ?? 'unknown', binding.bindingId, binding.executionId);
    }

    yield* this._inner.stream(request);
  }

  async healthCheck(): Promise<ProviderHealthStatus> {
    return this._inner.healthCheck();
  }

  async listModels(): Promise<AIModel[]> {
    return this._inner.listModels();
  }

  private _emit(event: GuardedProviderEvent): void {
    this._eventEmitter?.(event);
  }
}

// ─── Errors ──────────────────────────────────────────────────

/** Error thrown when an AI invocation is denied by the guard. */
export class AiInvocationDeniedError extends Error {
  constructor(
    readonly denialReason: string,
    readonly bindingId: string,
    readonly executionId?: string,
    detail?: string,
  ) {
    super(
      `AI invocation denied: ${denialReason}` +
        ` [binding: ${bindingId}]` +
        (executionId ? ` [execution: ${executionId}]` : '') +
        (detail ? ` — ${detail}` : ''),
    );
    this.name = 'AiInvocationDeniedError';
  }
}

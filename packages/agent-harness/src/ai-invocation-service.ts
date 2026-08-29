/**
 * ARX-015 M4B: AiInvocationService — Authoritative Control-Plane
 *
 * The single authority for AI invocation resolution and guard enforcement.
 *
 * Architecture:
 *   Caller → AiInvocationService → ResolvedAiBinding → Guard → provider adapter
 *
 * Resolution precedence (explicitly defined):
 *   1. Explicit caller preference (preferredProviderId/preferredModelId)
 *   2. Agent stored configuration (provider/model from AgentStorage)
 *   3. Routing store per-role selection
 *   4. Default provider/model
 *   5. M3 policy constraints (can restrict, never weaken)
 *
 * The service does NOT directly depend on DefaultProviderManager, routingStore,
 * or AgentStorage. Those are wired in at the composition root via configuration.
 *
 * Two execution mechanisms remain beneath:
 *   - OpenCodeRuntimeProvider (stateful session execution)
 *   - OpenCodeProvider (stateless HTTP completion)
 *
 * The service constructs the final CompletionRequest from the binding,
 * not from the original caller's model string.
 */

import type { CompletionRequest, CompletionResponse } from '@vestara/shared';
import type {
  AiInvocationRequest,
  AiResolutionFacts,
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

/** Agent configuration from the agent registry/storage. */
export interface AgentRoutingConfig {
  readonly providerId?: string;
  readonly modelId?: string;
  readonly runtimeAgent?: string;
}

/** Per-role routing configuration from the routing store. */
export interface RoleRoutingConfig {
  readonly providerId?: string;
  readonly modelId?: string;
}

/** Default provider/model when no other resolution matches. */
export interface DefaultRoutingConfig {
  readonly providerId: string;
  readonly modelId: string;
}

/** Configuration for AiInvocationService. */
export interface AiInvocationServiceConfig {
  /**
   * Resolve agent-specific provider/model configuration.
   * Input: agentId or role name.
   * Output: agent's stored provider/model, or undefined if not found.
   */
  readonly resolveAgentConfig?: (agentId: string) => Promise<AgentRoutingConfig | undefined>;

  /**
   * Resolve per-role routing configuration from the routing store.
   * Input: normalized role name (e.g. 'planner', 'developer', 'reviewer').
   * Output: role's provider/model selection, or undefined if not configured.
   */
  readonly resolveRoleConfig?: (role: string) => Promise<RoleRoutingConfig | undefined>;

  /**
   * Default provider/model when no other resolution matches.
   * This is the ultimate fallback.
   */
  readonly defaultConfig: DefaultRoutingConfig;

  /** Emit canonical M4 events. */
  readonly eventEmitter?: (event: AiInvocationServiceEvent) => void;
}

// ─── Events ──────────────────────────────────────────────────

/** Events emitted by AiInvocationService. */
export type AiInvocationServiceEvent =
  | {
      readonly type: 'invocation.resolved';
      readonly bindingId: string;
      readonly executionId?: string;
      readonly providerId: string;
      readonly modelId: string;
      readonly routingReason: AiResolutionFacts['routingReason'];
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

// ─── Invocation Request ──────────────────────────────────────

/** Request to invoke an AI model through the authoritative service. */
export interface AiServiceInvocationRequest {
  /** Execution context for lineage. */
  readonly executionId?: ExecutionId;
  readonly workflowRunId?: WorkflowRunId;
  readonly traceId?: TraceId;
  readonly requestId?: RequestId;
  readonly taskId?: string;
  readonly agentAssignmentId?: string;

  /** Agent/role for routing resolution. */
  readonly agentId?: string;
  readonly role?: string;

  /** Caller preferences (subject to policy/routing, not authoritative). */
  readonly preferredProviderId?: string;
  readonly preferredModelId?: string;

  /** Execution mode constraints from M3. */
  readonly executionMode?: ExecutionMode;

  /** The actual completion request to forward after guard passes. */
  readonly completionRequest: CompletionRequest;
}

/** Result of an invocation through the authoritative service. */
export interface AiServiceInvocationResult {
  /** The resolved binding. */
  readonly binding: ResolvedAiBinding;

  /** The authorized completion request (model field constructed from binding). */
  readonly authorizedRequest: CompletionRequest;

  /** Whether the invocation was allowed. */
  readonly allowed: boolean;

  /** Denial reason when not allowed. */
  readonly denialReason?: string;

  /** The completion response (only when allowed and forwarded). */
  readonly response?: CompletionResponse;
}

// ─── AiInvocationService ─────────────────────────────────────

/**
 * Authoritative AI invocation control-plane.
 *
 * Resolves bindings from multiple sources, guards invocations,
 * and constructs authorized CompletionRequests.
 *
 * No production provider call may bypass this service.
 */
export class AiInvocationService {
  private readonly _config: AiInvocationServiceConfig;
  private readonly _bindingHistory: ResolvedAiBinding[] = [];

  constructor(config: AiInvocationServiceConfig) {
    this._config = config;
  }

  /** Get the full binding history (immutable). */
  get bindingHistory(): readonly ResolvedAiBinding[] {
    return this._bindingHistory;
  }

  /**
   * Resolve a binding and authorize an invocation.
   *
   * This is the single entry point for all AI invocations.
   * It does NOT call provider.complete() — it returns the authorized
   * request for the caller to execute.
   *
   * Resolution precedence:
   *   1. Explicit caller preference
   *   2. Agent stored configuration
   *   3. Routing store per-role selection
   *   4. Default provider/model
   *   5. M3 policy constraints (restrict only, never weaken)
   */
  async resolve(request: AiServiceInvocationRequest): Promise<AiServiceInvocationResult> {
    // 1. Resolve routing from multiple sources
    const resolved = await this.resolveRouting(request);

    // 2. Create binding via resolution service
    const binding = resolveAiBinding({
      executionId: request.executionId,
      workflowRunId: request.workflowRunId,
      traceId: request.traceId,
      requestId: request.requestId,
      taskId: request.taskId,
      agentAssignmentId: request.agentAssignmentId,
      executionMode: request.executionMode,
      resolvedProviderId: resolved.providerId,
      resolvedModelId: resolved.modelId,
      resolvedRoutingReason: resolved.routingReason,
    });

    // Record binding in history (immutable append)
    this._bindingHistory.push(binding);

    // 3. Emit binding.resolved event
    this._emit({
      type: 'invocation.resolved',
      bindingId: binding.bindingId,
      executionId: request.executionId,
      providerId: binding.providerModel.providerId,
      modelId: binding.providerModel.modelId,
      routingReason: binding.resolutionFacts.routingReason,
    });

    // 4. Guard invocation — verify provider/model match
    const guardRequest: AiInvocationRequest = {
      binding,
      providerId: binding.providerModel.providerId,
      modelId: binding.providerModel.modelId,
      messages: request.completionRequest.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    const guardResult = guardAiInvocation(guardRequest);

    // 5. Emit invocation.guarded event
    this._emit({
      type: 'invocation.guarded',
      bindingId: binding.bindingId,
      executionId: request.executionId,
      allowed: guardResult.allowed,
      denialReason: guardResult.denialReason,
    });

    // 6. If guard denied → fail closed
    if (!guardResult.allowed) {
      this._emit({
        type: 'invocation.denied',
        bindingId: binding.bindingId,
        executionId: request.executionId,
        denialReason: guardResult.denialReason ?? 'unknown',
      });

      return {
        binding,
        authorizedRequest: request.completionRequest,
        allowed: false,
        denialReason: guardResult.denialReason,
      };
    }

    // 7. Construct authorized CompletionRequest from binding
    const authorizedRequest: CompletionRequest = {
      ...request.completionRequest,
      // The model field is constructed from the binding, NOT from the caller
      model: binding.providerModel.modelId,
    };

    return {
      binding,
      authorizedRequest,
      allowed: true,
    };
  }

  /**
   * Emit a completion event after the provider call.
   * Caller invokes this after provider.complete() succeeds or fails.
   */
  complete(binding: ResolvedAiBinding, success: boolean, error?: string): void {
    this._emit({
      type: 'invocation.completed',
      bindingId: binding.bindingId,
      executionId: binding.executionId,
      providerId: binding.providerModel.providerId,
      modelId: binding.providerModel.modelId,
      success,
      error,
    });
  }

  // ─── Routing Resolution ────────────────────────────────────

  /**
   * Resolve routing from multiple sources in precedence order:
   *   1. Explicit caller preference
   *   2. Agent stored configuration
   *   3. Routing store per-role selection
   *   4. Default provider/model
   */
  private async resolveRouting(
    request: AiServiceInvocationRequest,
  ): Promise<{ providerId: string; modelId: string; routingReason: AiResolutionFacts['routingReason'] }> {
    // 1. Explicit caller preference (highest priority)
    if (request.preferredProviderId && request.preferredModelId) {
      return {
        providerId: request.preferredProviderId,
        modelId: request.preferredModelId,
        routingReason: 'explicit-preference',
      };
    }

    // 2. Agent stored configuration
    if (request.agentId && this._config.resolveAgentConfig) {
      const agentConfig = await this._config.resolveAgentConfig(request.agentId);
      if (agentConfig?.modelId) {
        return {
          providerId: agentConfig.providerId ?? this._config.defaultConfig.providerId,
          modelId: agentConfig.modelId,
          routingReason: 'task-override',
        };
      }
    }

    // 3. Routing store per-role selection
    if (request.role && this._config.resolveRoleConfig) {
      const roleConfig = await this._config.resolveRoleConfig(request.role);
      if (roleConfig?.modelId) {
        return {
          providerId: roleConfig.providerId ?? this._config.defaultConfig.providerId,
          modelId: roleConfig.modelId,
          routingReason: 'role-routing',
        };
      }
    }

    // 4. Partial preference (only provider or only model specified)
    if (request.preferredProviderId) {
      return {
        providerId: request.preferredProviderId,
        modelId: request.preferredModelId ?? this._config.defaultConfig.modelId,
        routingReason: 'task-override',
      };
    }

    if (request.preferredModelId) {
      return {
        providerId: request.preferredProviderId ?? this._config.defaultConfig.providerId,
        modelId: request.preferredModelId,
        routingReason: 'task-override',
      };
    }

    // 5. Default (lowest priority)
    return {
      providerId: this._config.defaultConfig.providerId,
      modelId: this._config.defaultConfig.modelId,
      routingReason: 'default',
    };
  }

  private _emit(event: AiInvocationServiceEvent): void {
    this._config.eventEmitter?.(event);
  }
}

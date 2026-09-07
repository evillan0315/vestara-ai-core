/**
 * GA-RUNTIME-001 — Assistant Execution Binding Resolver
 *
 * Server-authoritative provider/model resolution for the Global Assistant.
 * The browser's ProviderModelSelector value is a REQUESTED binding, never
 * authority: the server validates provider existence, model existence and
 * provider/model compatibility against the canonical OpenCode runtime provider
 * discovery before any execution happens.
 *
 *   ProviderModelSelector (browser)
 *        ↓ requested provider/model
 *   server validation/resolution  ← this resolver
 *        ↓
 *   Execution Binding { providerID, modelID }
 *        ↓
 *   OpenCode turn (prompt_async model field)
 *
 * If the requested binding cannot be resolved, a deterministic
 * `AssistantBindingError` is thrown (never silent fallback to a previous or
 * default model while displaying the requested one).
 *
 * Discovery results are cached briefly (matching the runtime provider surface
 * the UI is offered), so validation is cheap and consistent per turn.
 */

import type { OpenCodeHttpClient } from '@vestara/opencode-runtime';

export interface AssistantExecutionBinding {
  readonly providerID: string;
  readonly modelID: string;
}

export type AssistantBindingErrorCode = 'provider-not-found' | 'model-not-found' | 'runtime-unavailable';

export class AssistantBindingError extends Error {
  readonly code: AssistantBindingErrorCode;
  readonly providerId?: string;
  readonly modelId?: string;

  constructor(code: AssistantBindingErrorCode, message: string, details?: { providerId?: string; modelId?: string }) {
    super(message);
    this.name = 'AssistantBindingError';
    this.code = code;
    this.providerId = details?.providerId;
    this.modelId = details?.modelId;
  }
}

export interface AssistantBindingRequest {
  readonly providerId?: string;
  readonly modelId?: string;
}

export interface AssistantBindingResolver {
  /**
   * Resolve a requested provider/model to an execution binding.
   * With no request (or an incomplete request) the configured fallback
   * binding is returned. Throws `AssistantBindingError` when a requested
   * binding cannot be resolved deterministically.
   */
  resolve(request?: AssistantBindingRequest): Promise<AssistantExecutionBinding>;
}

const DISCOVERY_CACHE_MS = 30_000;

/**
 * Build the canonical resolver over the local OpenCode runtime client.
 *
 * @param client   the shared OpenCodeHttpClient (127.0.0.1:4096).
 * @param fallback the agent-assistant default binding used when the caller
 *                 requests no provider/model (e.g. activity-room / CLI turns).
 */
export function createAssistantBindingResolver(
  client: OpenCodeHttpClient,
  fallback: AssistantExecutionBinding | undefined,
): AssistantBindingResolver {
  let cache: { providers: ReadonlyArray<{ id: string; models?: readonly string[] }>; at: number } | undefined;

  async function discover(): Promise<ReadonlyArray<{ id: string; models?: readonly string[] }>> {
    if (cache && Date.now() - cache.at < DISCOVERY_CACHE_MS) return cache.providers;
    let providers: ReadonlyArray<{ id: string; models?: readonly string[] }>;
    try {
      providers = await client.listProviders();
    } catch (error) {
      throw new AssistantBindingError(
        'runtime-unavailable',
        `Cannot validate the requested provider/model — the OpenCode runtime is unavailable (${error instanceof Error ? error.message : 'unknown'})`,
      );
    }
    cache = { providers, at: Date.now() };
    return providers;
  }

  return {
    async resolve(request?: AssistantBindingRequest): Promise<AssistantExecutionBinding> {
      const providerId = request?.providerId?.trim();
      const modelId = request?.modelId?.trim();

      // No explicit request → the configured default binding governs.
      if (!providerId || !modelId) {
        if (fallback) return fallback;
        throw new AssistantBindingError(
          'provider-not-found',
          'No provider/model was requested and no default Assistant binding is configured',
        );
      }

      const providers = await discover();
      const provider = providers.find((candidate) => candidate.id === providerId);
      if (!provider) {
        throw new AssistantBindingError('provider-not-found', `Provider not found: ${providerId}`, { providerId });
      }
      const known = provider.models?.includes(modelId);
      if (!known) {
        throw new AssistantBindingError('model-not-found', `Model not found for provider ${providerId}: ${modelId}`, {
          providerId,
          modelId,
        });
      }
      return { providerID: provider.id, modelID: modelId };
    },
  };
}

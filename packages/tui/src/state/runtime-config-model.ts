import type { RoutingSelection } from '../types.js';

export interface RuntimeConfigViewModel {
  readonly providers: readonly { providerId: string; providerName: string }[];
  readonly modelsByProvider: Readonly<Record<string, readonly { modelId: string; available: boolean }[]>>;
  readonly configuredProviders: Readonly<Record<string, boolean>>;
}

export function buildRuntimeConfigViewModel(routing: RoutingSelection | undefined): RuntimeConfigViewModel {
  const providers = new Map<string, string>();
  const modelsByProvider = new Map<string, { modelId: string; available: boolean }[]>();
  for (const candidate of routing?.candidates ?? []) {
    const providerId = candidate.ref.providerId;
    if (!providers.has(providerId)) providers.set(providerId, candidate.providerName);
    const models = modelsByProvider.get(providerId) ?? [];
    models.push({ modelId: candidate.ref.modelId, available: candidate.availability.available });
    modelsByProvider.set(providerId, models);
  }
  const configuredProviders = Object.fromEntries(
    Object.entries(routing?.providers ?? {}).map(([providerId, credential]) => [providerId, credential.configured]),
  );
  return {
    providers: [...providers.entries()].map(([providerId, providerName]) => ({ providerId, providerName })),
    modelsByProvider: Object.fromEntries(modelsByProvider),
    configuredProviders,
  };
}

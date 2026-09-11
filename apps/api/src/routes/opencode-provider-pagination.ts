// VES-PERF-001A — Bounded model discovery.
//
// Pure pagination/search projection for GET /api/opencode/config/providers.
// Extracted from the route handler so the bounding behavior is unit-testable
// without constructing an OpenCode HTTP client.
//
// Invariant: transport must be bounded. The caller decides `limit`; this helper
// never returns more than `limit` models per response.

export interface ConfiguredModel {
  readonly id: string;
  readonly name: string;
  readonly family?: string;
  readonly status?: string;
  readonly capabilities?: unknown;
  readonly cost?: unknown;
  readonly limit?: unknown;
  readonly api?: unknown;
  readonly variants?: unknown;
}

export interface ConfiguredProvider {
  readonly id: string;
  readonly name: string;
  readonly source?: string;
  readonly models: Record<string, ConfiguredModel>;
}

export interface SafeProvider {
  readonly id: string;
  readonly name: string;
  readonly source?: string;
  readonly models: ConfiguredModel[];
  readonly totalModels: number;
}

export interface ProviderPage {
  readonly providers: SafeProvider[];
  readonly pagination: {
    readonly total: number;
    readonly offset: number;
    readonly limit: number;
    readonly hasMore: boolean;
  };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Normalize (strip secrets), filter, and bound a configured-provider payload.
 * Models are flattened across providers for pagination, then regrouped so the
 * response preserves the provider → models shape.
 */
export function paginateConfiguredProviders(
  providers: readonly ConfiguredProvider[],
  options?: { limit?: number; offset?: number; search?: string },
): ProviderPage {
  const limit = Math.min(Math.max(Math.floor(options?.limit ?? DEFAULT_LIMIT), 0), MAX_LIMIT);
  const offset = Math.max(Math.floor(options?.offset ?? 0), 0);
  const search = options?.search?.toLowerCase() ?? '';

  // Normalize: only allow-listed fields cross the boundary (no API keys).
  const normalized: SafeProvider[] = providers.map((prov) => {
    const all = Object.values(prov.models).map<ConfiguredModel>((m) => ({
      id: m.id,
      name: m.name,
      family: m.family,
      status: m.status,
      capabilities: m.capabilities,
      cost: m.cost,
      limit: m.limit,
      api: m.api,
      variants: m.variants,
    }));
    const matched = search
      ? all.filter(
          (m) =>
            m.id.toLowerCase().includes(search) ||
            m.name.toLowerCase().includes(search) ||
            m.family?.toLowerCase().includes(search),
        )
      : all;
    return { id: prov.id, name: prov.name, source: prov.source, models: matched, totalModels: all.length };
  });

  // Paginate across the flattened, search-scoped model set.
  const flat = normalized.flatMap((prov) => prov.models.map((m) => ({ providerId: prov.id, model: m })));
  const total = flat.length;
  const page = flat.slice(offset, offset + limit);

  const byProvider = new Map<string, ConfiguredModel[]>();
  for (const entry of page) {
    const list = byProvider.get(entry.providerId) ?? [];
    list.push(entry.model);
    byProvider.set(entry.providerId, list);
  }

  const resultProviders = normalized
    .filter((prov) => byProvider.has(prov.id))
    .map((prov) => ({ ...prov, models: byProvider.get(prov.id) ?? [] }));

  return {
    providers: resultProviders,
    pagination: { total, offset, limit, hasMore: offset + limit < total },
  };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Managed provider shape from GET /api/providers.
 * Matches the existing API response contract.
 */
interface ManagedModel {
  id: string;
  name: string;
  enabled: boolean;
  contextWindow: number;
  maxOutput: number;
  capabilities: Record<string, boolean>;
  pricing?: { inputPerMillionTokens: number; outputPerMillionTokens: number };
}

interface ManagedProvider {
  id: string;
  name: string;
  enabled: boolean;
  status: string;
  credential?: { configured: boolean; source?: string };
  models: ManagedModel[];
}

interface ProvidersResponse {
  source?: string;
  providers: ManagedProvider[];
}

export interface ProviderModelPickerProps {
  providerId: string;
  modelId: string;
  onChange: (providerId: string, modelId: string) => void;
  disabled?: boolean;
}

/**
 * Searchable provider/model selection popover.
 *
 * Sources from GET /api/providers — no hardcoded catalog.
 * Dynamically discovers new providers/models without frontend changes.
 */
export function ProviderModelPicker({ providerId, modelId, onChange, disabled }: ProviderModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<ManagedProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [focusIndex, setFocusIndex] = useState(-1);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastFetchRef = useRef(0);

  // Fetch providers
  const fetchProviders = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchRef.current < 30_000 && providers.length > 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/providers');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ProvidersResponse = await res.json();
      setProviders(data.providers ?? []);
      lastFetchRef.current = now;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, [providers.length]);

  // Fetch on open
  useEffect(() => {
    if (open) {
      void fetchProviders();
      setTimeout(() => searchRef.current?.focus(), 0);
    } else {
      setSearch('');
      setFocusIndex(-1);
    }
  }, [open, fetchProviders]);

  // Flatten and filter models
  const flatModels = useMemo(() => {
    const result: Array<{ provider: ManagedProvider; model: ManagedModel }> = [];
    const q = search.toLowerCase();
    for (const p of providers) {
      if (!p.enabled) continue;
      for (const m of p.models) {
        if (!m.enabled) continue;
        const matchesSearch =
          !q ||
          p.id.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q);
        if (matchesSearch) {
          result.push({ provider: p, model: m });
        }
      }
    }
    return result;
  }, [providers, search]);

  // Group by provider
  const grouped = useMemo(() => {
    const groups: Array<{ provider: ManagedProvider; models: ManagedModel[] }> = [];
    const map = new Map<string, { provider: ManagedProvider; models: ManagedModel[] }>();
    for (const { provider, model } of flatModels) {
      let g = map.get(provider.id);
      if (!g) {
        g = { provider, models: [] };
        map.set(provider.id, g);
        groups.push(g);
      }
      g.models.push(model);
    }
    return groups;
  }, [flatModels]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex((prev) => Math.min(prev + 1, flatModels.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && focusIndex >= 0 && focusIndex < flatModels.length) {
        e.preventDefault();
        const { provider, model } = flatModels[focusIndex];
        onChange(provider.id, model.id);
        setOpen(false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        setFocusIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setFocusIndex(flatModels.length - 1);
      }
    },
    [flatModels, focusIndex, onChange],
  );

  // Scroll focused item into view
  useEffect(() => {
    if (focusIndex >= 0) {
      const el = listRef.current?.querySelector(`[data-model-index="${focusIndex}"]`);
      el?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusIndex]);

  // Find current display label
  const currentLabel = useMemo(() => {
    for (const p of providers) {
      if (p.id === providerId) {
        for (const m of p.models) {
          if (m.id === modelId) return `${p.name} / ${m.name}`;
        }
        return p.name;
      }
    }
    return modelId || 'Select model';
  }, [providers, providerId, modelId]);

  // Find current availability
  const currentAvailability = useMemo(() => {
    for (const p of providers) {
      if (p.id === providerId) {
        return {
          configured: p.credential?.configured ?? false,
          status: p.status,
        };
      }
    }
    return null;
  }, [providers, providerId]);

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="w-full flex items-center justify-between gap-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-(--vestara-text-2) outline-none focus:border-(--vestara-accent-border-active) transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="truncate">{currentLabel}</span>
        <svg className="w-3 h-3 shrink-0 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Availability indicator */}
      {currentAvailability && !currentAvailability.configured && (
        <div className="text-[9px] text-amber-400 mt-0.5">API key required</div>
      )}

      {/* Popover */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-zinc-900 border border-(--vestara-accent-border) rounded-lg shadow-lg overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b border-(--vestara-accent-border)">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setFocusIndex(-1);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search providers and models..."
              className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded px-2 py-1 text-xs text-(--vestara-text-2) placeholder:text-(--vestara-text-dim) outline-none focus:border-(--vestara-accent-border-active)"
            />
          </div>

          {/* Model list */}
          <div ref={listRef} className="max-h-64 overflow-y-auto">
            {loading && (
              <div className="px-3 py-4 text-center text-[10px] text-(--vestara-text-dim)">
                Loading providers...
              </div>
            )}

            {error && (
              <div className="px-3 py-4 text-center">
                <p className="text-[10px] text-red-400 mb-2">{error}</p>
                <button
                  type="button"
                  onClick={() => void fetchProviders()}
                  className="text-[10px] text-(--vestara-accent-text) hover:underline cursor-pointer"
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && flatModels.length === 0 && (
              <div className="px-3 py-4 text-center text-[10px] text-(--vestara-text-dim)">
                {search ? 'No matching models' : 'No providers available'}
              </div>
            )}

            {!loading &&
              !error &&
              grouped.map((group) => (
                <div key={group.provider.id}>
                  {/* Provider header */}
                  <div className="px-3 py-1.5 bg-(--vestara-accent-bg) border-b border-(--vestara-accent-border)">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-(--vestara-text-2)">
                        {group.provider.name || group.provider.id}
                      </span>
                      <span
                        className={`text-[8px] px-1 py-0.5 rounded ${
                          group.provider.status === 'available'
                            ? 'bg-green-400/10 text-green-400'
                            : group.provider.status === 'degraded'
                              ? 'bg-amber-400/10 text-amber-400'
                              : 'bg-red-400/10 text-red-400'
                        }`}
                      >
                        {group.provider.status}
                      </span>
                      <span className="text-[8px] text-(--vestara-text-dim)">
                        {group.models.length} model{group.models.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Model rows */}
                  {group.models.map((model) => {
                    const globalIndex = flatModels.findIndex(
                      (f) => f.provider.id === group.provider.id && f.model.id === model.id,
                    );
                    const isSelected = providerId === group.provider.id && modelId === model.id;
                    const isFocused = globalIndex === focusIndex;

                    return (
                      <button
                        key={model.id}
                        type="button"
                        data-model-index={globalIndex}
                        onClick={() => {
                          onChange(group.provider.id, model.id);
                          setOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-amber-400/10 text-amber-400'
                            : isFocused
                              ? 'bg-(--vestara-accent-bg) text-(--vestara-text-2)'
                              : 'text-(--vestara-text-2) hover:bg-(--vestara-accent-bg)'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium truncate">{model.name}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[8px] text-(--vestara-text-dim)">
                              {(model.contextWindow / 1000).toFixed(0)}k ctx
                            </span>
                            {model.capabilities?.functionCalling && (
                              <span className="text-[8px] text-(--vestara-text-dim)">fn</span>
                            )}
                            {model.capabilities?.vision && (
                              <span className="text-[8px] text-(--vestara-text-dim)">vis</span>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <svg className="w-3 h-3 shrink-0 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Backdrop to close on outside click */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </div>
  );
}

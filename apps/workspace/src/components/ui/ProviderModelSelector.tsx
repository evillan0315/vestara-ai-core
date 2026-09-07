/**
 * ProviderModelSelector — shared searchable provider/model selection component.
 *
 * GA-UI-008 D/E/F: Reusable across Global Assistant, Agent Control, Workflow
 * configuration, and any model-backed surface.
 *
 * Sources from GET /api/providers — no hardcoded catalog.
 * Provider → model relationship: selecting a provider filters models.
 * Search is case-insensitive with keyboard navigation.
 *
 * @see apps/workspace/src/components/ui/agents/ProviderModelPicker.tsx (legacy)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── Types (matches GET /api/providers response contract) ────────────────────

export interface SelectorModel {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly contextWindow: number;
  readonly maxOutput: number;
  readonly capabilities: Record<string, boolean>;
  readonly pricing?: { readonly inputPerMillionTokens: number; readonly outputPerMillionTokens: number };
}

export interface SelectorProvider {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly status: string;
  readonly credential?: { readonly configured: boolean; readonly source?: string };
  readonly models: SelectorModel[];
}

interface ProvidersResponse {
  readonly source?: string;
  readonly providers: SelectorProvider[];
}

// ── Component Props ────────────────────────────────────────────────────────

export interface ProviderModelSelectorValue {
  readonly providerId: string;
  readonly modelId: string;
}

export interface ProviderModelSelectorProps {
  /** Current selected provider/model. */
  value: ProviderModelSelectorValue;
  /** Called when user selects a provider or model. */
  onChange: (value: ProviderModelSelectorValue) => void;
  /** Disabled state. */
  disabled?: boolean;
  /** Compact mode: inline trigger (for composer bar). Default: false (popover trigger button). */
  compact?: boolean;
  /** Additional CSS class for the trigger element. */
  className?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const FETCH_CACHE_MS = 30_000;

// ── Component ──────────────────────────────────────────────────────────────

export function ProviderModelSelector({
  value,
  onChange,
  disabled = false,
  compact = false,
  className,
}: ProviderModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<SelectorProvider[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [focusIndex, setFocusIndex] = useState(-1);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastFetchRef = useRef(0);

  // ── Fetch providers ──
  const fetchProviders = useCallback(async () => {
    const now = Date.now();
    if (now - lastFetchRef.current < FETCH_CACHE_MS && providers.length > 0) return;
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

  // ── Provider → model filtering (F) ──
  // When provider changes, filter models to that provider.
  // If current model is unavailable, selection becomes unresolved.
  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === value.providerId) ?? null,
    [providers, value.providerId],
  );

  const availableModels = useMemo(() => {
    if (!selectedProvider) return [];
    return selectedProvider.models.filter((m) => m.enabled);
  }, [selectedProvider]);

  const isModelAvailable = useMemo(
    () => availableModels.some((m) => m.id === value.modelId),
    [availableModels, value.modelId],
  );

  // ── Search + autocomplete (E) ──
  const flatModels = useMemo(() => {
    const result: Array<{ provider: SelectorProvider; model: SelectorModel }> = [];
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
    const groups: Array<{ provider: SelectorProvider; models: SelectorModel[] }> = [];
    const map = new Map<string, { provider: SelectorProvider; models: SelectorModel[] }>();
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

  // ── Keyboard navigation (E) ──
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
        onChange({ providerId: provider.id, modelId: model.id });
        setOpen(false);
        triggerRef.current?.focus();
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

  // ── Display label ──
  const currentLabel = useMemo(() => {
    if (selectedProvider) {
      const model = availableModels.find((m) => m.id === value.modelId);
      if (model) return `${selectedProvider.name} / ${model.name}`;
      return selectedProvider.name;
    }
    return value.modelId || 'Select model';
  }, [selectedProvider, availableModels, value.modelId]);

  // ── Handle provider change (F: filter models, clear invalid) ──
  const handleProviderChange = useCallback(
    (providerId: string) => {
      const provider = providers.find((p) => p.id === providerId);
      if (!provider) return;
      // Check if current model is available under new provider
      const modelAvailable = provider.models.some((m) => m.id === value.modelId && m.enabled);
      if (modelAvailable) {
        // Keep current model — it's valid under new provider
        onChange({ providerId, modelId: value.modelId });
      } else {
        // Model unavailable — clear selection (user must select valid model)
        onChange({ providerId, modelId: '' });
      }
    },
    [providers, value.modelId, onChange],
  );

  // ── Render ──
  return (
    <div className={`relative ${compact ? 'w-full' : ''} ${className ?? ''}`}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="provider-model-selector-trigger"
        className={
          compact
            ? 'w-full flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
            : 'w-full flex items-center justify-between gap-2 bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded-lg px-2.5 py-1.5 text-xs text-(--vestara-text-2) outline-none focus:border-(--vestara-accent-border-active) transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
        }
      >
        <span className="truncate">{currentLabel}</span>
        {!compact && (
          <svg
            className={`w-3 h-3 shrink-0 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {/* Unavailable model indicator */}
      {!isModelAvailable && value.modelId && !open && (
        <div className="text-[9px] text-amber-400 mt-0.5">Model unavailable</div>
      )}

      {/* Popover — opens upward to avoid panel clipping */}
      {open && (
        <div className="absolute left-0 right-0 bottom-full mb-1 z-[100] bg-zinc-900 border border-(--vestara-accent-border) rounded-lg shadow-lg overflow-hidden">
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
              role="combobox"
              aria-autocomplete="list"
              aria-controls="provider-model-list"
              aria-activedescendant={focusIndex >= 0 ? `provider-model-option-${focusIndex}` : undefined}
              data-testid="provider-model-search"
              className="w-full bg-(--vestara-accent-bg) border border-(--vestara-accent-border) rounded px-2 py-1 text-xs text-(--vestara-text-2) placeholder:text-(--vestara-text-dim) outline-none focus:border-(--vestara-accent-border-active)"
            />
          </div>

          {/* Model list */}
          <div ref={listRef} id="provider-model-list" role="listbox" className="max-h-96 overflow-y-auto">
            {loading && (
              <div className="px-3 py-4 text-center text-[10px] text-(--vestara-text-dim)">Loading providers...</div>
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
                <div key={group.provider.id} role="group" aria-label={group.provider.name || group.provider.id}>
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
                    const isSelected = value.providerId === group.provider.id && value.modelId === model.id;
                    const isFocused = globalIndex === focusIndex;

                    return (
                      <button
                        key={model.id}
                        type="button"
                        id={`provider-model-option-${globalIndex}`}
                        data-model-index={globalIndex}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onChange({ providerId: group.provider.id, modelId: model.id });
                          setOpen(false);
                          triggerRef.current?.focus();
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
      {open && <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />}
    </div>
  );
}

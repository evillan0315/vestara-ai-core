/**
 * ProviderModelSelector — shared searchable provider/model selection component.
 *
 * GA-PROVIDER-001: Consumes /api/opencode/config/providers for the effective
 * configured provider/model working set from OpenCode.
 *
 * Sources from GET /api/opencode/config/providers — no hardcoded catalog.
 * Provider → model relationship: selecting a provider filters models.
 * Search is case-insensitive with keyboard navigation.
 *
 * @see apps/workspace/src/components/ui/agents/ProviderModelPicker.tsx (legacy)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── Types (matches GET /api/opencode/config/providers response contract) ────

export interface SelectorModel {
  readonly id: string;
  readonly name: string;
  readonly family?: string;
  readonly status?: string;
  readonly capabilities?: {
    readonly temperature?: boolean;
    readonly reasoning?: boolean;
    readonly attachment?: boolean;
    readonly toolcall?: boolean;
    readonly input?: { readonly text?: boolean; readonly image?: boolean };
    readonly output?: { readonly text?: boolean };
  };
  readonly cost?: {
    readonly input?: number;
    readonly output?: number;
    readonly cache?: { readonly read?: number; readonly write?: number };
  };
  readonly limit?: {
    readonly context?: number;
    readonly input?: number;
    readonly output?: number;
  };
}

export interface SelectorProvider {
  readonly id: string;
  readonly name: string;
  readonly source?: string;
  readonly models: SelectorModel[];
}

interface ConfigProvidersResponse {
  readonly providers: SelectorProvider[];
  readonly default: Record<string, string>;
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

/** Cache duration for provider/model data (ms). */
const FETCH_CACHE_MS = 30_000;

/** Debounce delay for search queries (ms). */
const SEARCH_DEBOUNCE_MS = 200;

// ── Cache ──────────────────────────────────────────────────────────────────

const providerCache = new Map<string, { data: ConfigProvidersResponse; timestamp: number }>();

function getCached(key: string): ConfigProvidersResponse | null {
  const entry = providerCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > FETCH_CACHE_MS) {
    providerCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: ConfigProvidersResponse): void {
  providerCache.set(key, { data, timestamp: Date.now() });
}

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
  const [defaults, setDefaults] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [focusIndex, setFocusIndex] = useState(-1);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch configured providers from OpenCode ──
  const fetchProviders = useCallback(async () => {
    const cacheKey = 'config-providers';
    const cached = getCached(cacheKey);
    if (cached) {
      setProviders(cached.providers);
      setDefaults(cached.default);
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/opencode/config/providers', { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ConfigProvidersResponse = await res.json();
      setProviders(data.providers);
      setDefaults(data.default);
      setCache(cacheKey, data);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on open
  useEffect(() => {
    if (open) {
      void fetchProviders();
      setTimeout(() => searchRef.current?.focus(), 0);
    } else {
      setSearch('');
      setFocusIndex(-1);
      abortControllerRef.current?.abort();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    }
  }, [open, fetchProviders]);

  // Fetch on mount so availability check works before first dropdown open
  useEffect(() => {
    void fetchProviders();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  // ── Provider → model scoping ──
  const selectedProvider = useMemo(
    () => providers.find((p) => p.id === value.providerId) ?? null,
    [providers, value.providerId],
  );

  const availableModels = useMemo(() => {
    if (!selectedProvider) return [];
    return selectedProvider.models.filter((m) => m.status !== 'disabled');
  }, [selectedProvider]);

  const isModelAvailable = useMemo(
    () => availableModels.some((m) => m.id === value.modelId),
    [availableModels, value.modelId],
  );

  // ── Search (client-side, scoped to selected provider) ──
  const filteredModels = useMemo(() => {
    if (!search.trim()) return availableModels;
    const q = search.toLowerCase();
    return availableModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.family?.toLowerCase().includes(q),
    );
  }, [availableModels, search]);

  // ── Keyboard navigation ──
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusIndex((prev) => Math.min(prev + 1, filteredModels.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && focusIndex >= 0 && focusIndex < filteredModels.length) {
        e.preventDefault();
        const model = filteredModels[focusIndex];
        onChange({ providerId: value.providerId, modelId: model.id });
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
        setFocusIndex(filteredModels.length - 1);
      }
    },
    [filteredModels, focusIndex, onChange, value.providerId],
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

  // ── Handle provider change ──
  const handleProviderChange = useCallback(
    (providerId: string) => {
      const provider = providers.find((p) => p.id === providerId);
      if (!provider) return;
      // Check if current model is available under new provider
      const modelAvailable = provider.models.some((m) => m.id === value.modelId && m.status !== 'disabled');
      if (modelAvailable) {
        onChange({ providerId, modelId: value.modelId });
      } else {
        // Use default model for this provider, or first available
        const defaultModel = defaults[providerId];
        const firstModel = provider.models.find((m) => m.status !== 'disabled');
        onChange({ providerId, modelId: defaultModel ?? firstModel?.id ?? '' });
      }
    },
    [providers, value.modelId, onChange, defaults],
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
          {/* Provider tabs */}
          <div className="flex border-b border-(--vestara-accent-border) overflow-x-auto">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleProviderChange(p.id)}
                className={`px-3 py-1.5 text-[10px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  value.providerId === p.id
                    ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/5'
                    : 'text-(--vestara-text-dim) hover:text-(--vestara-text-2)'
                }`}
              >
                {p.name}
                <span className="ml-1 opacity-50">{p.models.length}</span>
              </button>
            ))}
          </div>

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
              placeholder="Search models..."
              role="combobox"
              aria-autocomplete="list"
              aria-controls="provider-model-list"
              aria-activedescendant={focusIndex >= 0 ? `model-option-${focusIndex}` : undefined}
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

            {!loading && !error && filteredModels.length === 0 && (
              <div className="px-3 py-4 text-center text-[10px] text-(--vestara-text-dim)">
                {search ? 'No matching models' : 'No models available'}
              </div>
            )}

            {!loading &&
              !error &&
              filteredModels.map((model) => {
                const globalIndex = filteredModels.indexOf(model);
                const isSelected = value.providerId === selectedProvider?.id && value.modelId === model.id;
                const isFocused = globalIndex === focusIndex;

                return (
                  <button
                    key={model.id}
                    type="button"
                    id={`model-option-${globalIndex}`}
                    data-model-index={globalIndex}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange({ providerId: value.providerId, modelId: model.id });
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
                        {model.limit?.context && (
                          <span className="text-[8px] text-(--vestara-text-dim)">
                            {(model.limit.context / 1000).toFixed(0)}k ctx
                          </span>
                        )}
                        {model.capabilities?.toolcall && (
                          <span className="text-[8px] text-(--vestara-text-dim)">fn</span>
                        )}
                        {model.capabilities?.input?.image && (
                          <span className="text-[8px] text-(--vestara-text-dim)">vis</span>
                        )}
                        {model.capabilities?.reasoning && (
                          <span className="text-[8px] text-(--vestara-text-dim)">reason</span>
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
        </div>
      )}

      {/* Backdrop to close on outside click */}
      {open && <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} />}
    </div>
  );
}

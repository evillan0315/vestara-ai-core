/**
 * Marketplace Premium Gallery (v7.14) — Capabilities.
 *
 * Premium capability cards with left accent, hover glow, and a glass
 * detail panel.
 */

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button } from '@vestara/ui';
import type { CapabilityCatalogEntry, CapabilityCatalog } from '../../lib/catalog.js';
import { catalogClient } from '../../lib/catalog.js';
import {
  AssetGridSkeleton,
  InsightBanner,
  MarketplaceEmptyState,
  MarketplacePage,
  MarketplaceSection,
  MarketplaceStatPill,
  MarketplaceToolbar,
} from './MarketplaceLayout-components.js';

// ─── State Config ───────────────────────────────────────────

const STATE_ACCENT: Record<string, string> = {
  active: '#34d399',
  parked: '#71717a',
  experimental: '#fbbf24',
  unknown: '#52525b',
};

const STATE_CONFIG: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  active: { dot: 'bg-emerald-400', bg: 'bg-emerald-400/10', text: 'text-emerald-300', label: 'Active' },
  parked: { dot: 'bg-zinc-500', bg: 'bg-zinc-500/10', text: 'text-zinc-400', label: 'Parked' },
  experimental: { dot: 'bg-amber-400', bg: 'bg-amber-400/10', text: 'text-amber-300', label: 'Experimental' },
  unknown: { dot: 'bg-zinc-600', bg: 'bg-zinc-600/10', text: 'text-zinc-500', label: 'Unknown' },
};

const HEALTH_CONFIG: Record<string, { text: string; icon: string }> = {
  verified: { text: 'text-emerald-400', icon: '✓' },
  pass: { text: 'text-emerald-300', icon: '✓' },
  fail: { text: 'text-red-400', icon: '✕' },
  degraded: { text: 'text-amber-400', icon: '⚠' },
  unknown: { text: 'text-zinc-500', icon: '?' },
};

const CATEGORY_ICONS: Record<string, string> = {
  core: '⬡',
  assistant: '✦',
  'activity-room': '◎',
  diagnostics: '◈',
  execution: '⟐',
  provider: '◇',
  tools: '⬢',
  evidence: '▣',
  memory: '◐',
  integration: '◆',
  ui: '○',
  os: '◉',
  marketplace: '△',
  other: '·',
};

// ─── Capability Card ────────────────────────────────────────

function CapabilityCard({
  cap,
  onSelect,
  isSelected,
  index = 0,
}: {
  cap: CapabilityCatalogEntry;
  onSelect: (cap: CapabilityCatalogEntry) => void;
  isSelected: boolean;
  index?: number;
}) {
  const state = STATE_CONFIG[cap.parkingState] ?? STATE_CONFIG.unknown;
  const health = HEALTH_CONFIG[cap.health] ?? HEALTH_CONFIG.unknown;
  const icon = CATEGORY_ICONS[cap.category] ?? '·';
  const accent = STATE_ACCENT[cap.parkingState] ?? 'var(--vestara-accent)';

  return (
    <button
      type="button"
      onClick={() => onSelect(cap)}
      className="mpg-card mpg-enter block w-full p-4 text-left"
      style={{
        animationDelay: `${Math.min(index, 12) * 30}ms`,
        borderColor: isSelected ? 'var(--vestara-accent-border-hover)' : undefined,
        boxShadow: isSelected ? '0 0 24px var(--vestara-surface-glow-hover)' : undefined,
      }}
    >
      <span className="mpg-card-accent" style={{ background: accent }} aria-hidden="true" />
      <div className="relative z-[2]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-lg">{icon}</span>
              <span className="truncate font-medium text-zinc-100">{cap.name}</span>
            </div>
            <div className="mt-0.5 font-mono text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">{cap.id}</div>
          </div>
          <span
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${state.bg} ${state.text}`}
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${state.dot}`} />
            {state.label}
          </span>
        </div>
        {cap.description && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[var(--vestara-text-muted,var(--color-zinc-400))]">
            {cap.description}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge variant="default" size="md">{cap.category}</Badge>
          <Badge variant="default" size="md">{cap.activation}</Badge>
          <span className={`inline-flex items-center gap-1 rounded-full border border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] px-2 py-0.5 text-xs ${health.text}`}>
            {health.icon} {cap.health}
          </span>
          {cap.packages.length > 0 && (
            <Badge variant="default" size="md">
              {cap.packages.length} pkg{cap.packages.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Capability Detail Panel ────────────────────────────────

function CapabilityDetail({
  cap,
  onClose,
}: {
  cap: CapabilityCatalogEntry;
  onClose: () => void;
}) {
  const state = STATE_CONFIG[cap.parkingState] ?? STATE_CONFIG.unknown;
  const health = HEALTH_CONFIG[cap.health] ?? HEALTH_CONFIG.unknown;
  const icon = CATEGORY_ICONS[cap.category] ?? '·';

  return (
    <div className="mpg-card mpg-hairline-top space-y-4 p-5 backdrop-blur-xl">
      <div className="relative z-[2] space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">{icon}</span>
              <h2 className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-lg font-semibold text-transparent">
                {cap.name}
              </h2>
            </div>
            <div className="mt-1 font-mono text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">{cap.id}</div>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose} aria-label="Close details">
            ✕
          </Button>
        </div>

        {cap.description && <p className="text-sm leading-relaxed text-zinc-300">{cap.description}</p>}

        <div className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${state.bg} ${state.text}`}>
          <span className={`inline-block h-2 w-2 rounded-full ${state.dot}`} />
          {state.label}
          {cap.parkingState === 'parked' && (
            <span className="ml-1 text-[var(--vestara-text-muted,var(--color-zinc-400))]">
              (preserved, not active in current profile)
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-xs font-medium text-[var(--vestara-text-muted,var(--color-zinc-400))]">Category</span>
            <div className="mt-1 text-zinc-200">{cap.category}</div>
          </div>
          <div>
            <span className="text-xs font-medium text-[var(--vestara-text-muted,var(--color-zinc-400))]">Requirement</span>
            <div className="mt-1 text-zinc-200">{cap.requirement}</div>
          </div>
          <div>
            <span className="text-xs font-medium text-[var(--vestara-text-muted,var(--color-zinc-400))]">Activation</span>
            <div className="mt-1 text-zinc-200">{cap.activation}</div>
          </div>
          <div>
            <span className="text-xs font-medium text-[var(--vestara-text-muted,var(--color-zinc-400))]">Health</span>
            <div className={`mt-1 ${health.text}`}>{health.icon} {cap.health}</div>
          </div>
        </div>

        {cap.packages.length > 0 && (
          <div>
            <span className="text-xs font-medium text-[var(--vestara-text-muted,var(--color-zinc-400))]">Packages</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {cap.packages.map((pkg) => (
                <Badge key={pkg} variant="default" size="md">{pkg}</Badge>
              ))}
            </div>
          </div>
        )}

        {cap.dependencies.length > 0 && (
          <div>
            <span className="text-xs font-medium text-[var(--vestara-text-muted,var(--color-zinc-400))]">Dependencies</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {cap.dependencies.map((dep) => (
                <Badge key={dep} variant="default" size="md">{dep}</Badge>
              ))}
            </div>
          </div>
        )}

        {cap.documentation && cap.documentation.length > 0 && (
          <div>
            <span className="text-xs font-medium text-[var(--vestara-text-muted,var(--color-zinc-400))]">Documentation</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {cap.documentation.map((doc) => (
                <Badge key={doc} variant="default" size="md">{doc}</Badge>
              ))}
            </div>
          </div>
        )}

        {cap.evidence && cap.evidence.length > 0 && (
          <div>
            <span className="text-xs font-medium text-[var(--vestara-text-muted,var(--color-zinc-400))]">Evidence</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {cap.evidence.map((ev) => (
                <Badge key={ev} variant="default" size="md">{ev}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────

type FilterState = 'all' | 'active' | 'parked';

export default function Capabilities() {
  const [catalog, setCatalog] = useState<CapabilityCatalog | null>(null);
  const [filter, setFilter] = useState<FilterState>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CapabilityCatalogEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await catalogClient.catalog();
      setCatalog(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load capability catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = catalog?.capabilities.filter((cap) => {
    if (filter === 'active' && cap.parkingState !== 'active') return false;
    if (filter === 'parked' && cap.parkingState !== 'parked') return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        cap.name.toLowerCase().includes(q) ||
        cap.id.toLowerCase().includes(q) ||
        cap.description.toLowerCase().includes(q) ||
        cap.category.toLowerCase().includes(q)
      );
    }
    return true;
  }) ?? [];

  return (
    <MarketplacePage
      title="Capabilities"
      description="Inspect Vestara's capability inventory — what's active, parked, and available."
      stats={
        catalog ? (
          <div className="flex flex-wrap gap-3">
            <MarketplaceStatPill label="Total" value={catalog.summary.total} />
            <MarketplaceStatPill label="Active" value={catalog.summary.active} color="text-emerald-400" />
            <MarketplaceStatPill label="Parked" value={catalog.summary.parked} color="text-zinc-400" />
            {catalog.summary.experimental > 0 && (
              <MarketplaceStatPill label="Experimental" value={catalog.summary.experimental} color="text-amber-400" />
            )}
          </div>
        ) : undefined
      }
      toolbar={
        <MarketplaceToolbar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search capabilities…"
          filters={[
            { id: 'all', label: 'All', active: filter === 'all' },
            { id: 'active', label: 'Active', active: filter === 'active' },
            { id: 'parked', label: 'Parked', active: filter === 'parked' },
          ]}
          onFilterChange={(f) => { setFilter(f as FilterState); setSelected(null); }}
          actions={
            <Button variant="secondary" size="md" onClick={() => void load()}>
              Refresh
            </Button>
          }
        />
      }
    >
      {error && <InsightBanner severity="error" description={error} />}
      {loading && <AssetGridSkeleton count={6} />}

      {!loading && !error && (
        <div className="flex gap-4">
          <div className={`${selected ? 'w-1/2' : 'w-full'} space-y-3 transition-all`}>
            {filtered.length === 0 ? (
              <MarketplaceEmptyState message="No capabilities found." />
            ) : (
              <MarketplaceSection title={search || filter !== 'all' ? 'Filtered' : 'All Capabilities'}>
                <div className="space-y-3">
                  {filtered.map((cap, i) => (
                    <CapabilityCard
                      key={cap.id}
                      cap={cap}
                      onSelect={setSelected}
                      isSelected={selected?.id === cap.id}
                      index={i}
                    />
                  ))}
                </div>
              </MarketplaceSection>
            )}
          </div>

          {selected && (
            <div className="w-1/2">
              <CapabilityDetail cap={selected} onClose={() => setSelected(null)} />
            </div>
          )}
        </div>
      )}
    </MarketplacePage>
  );
}

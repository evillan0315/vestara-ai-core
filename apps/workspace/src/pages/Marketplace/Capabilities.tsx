/**
 * Marketplace — Capabilities.
 *
 * Capability inventory restructured around grouped, filterable browsing:
 * stats strip → filter sidebar + main column (toolbar, collapsible
 * category groups, capability rows) → slide-over detail drawer.
 *
 * Data is the live capability catalog only (search/status/category are
 * client-side filters over it). Only filters backed by catalog fields
 * are offered — nothing is fabricated.
 *
 * Tokens: only var(--vestara-*) Tailwind bindings + mpg-* grammar.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button } from '@vestara/ui';
import type { CapabilityCatalog, CapabilityCatalogEntry } from '../../lib/catalog.js';
import { catalogClient } from '../../lib/catalog.js';
import {
  AssetGridSkeleton,
  InsightBanner,
  MarketplaceEmptyState,
  MarketplacePage,
} from '@vestara/marketplace-ui';

// ─── State Config (token-bound) ─────────────────────────────────

const STATE_ACCENT: Record<string, string> = {
  active: 'var(--vestara-status-success)',
  parked: 'var(--vestara-status-warning)',
  experimental: 'var(--vestara-status-info)',
  unknown: 'var(--vestara-status-unknown)',
};

const STATE_CONFIG: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  active: { dot: 'bg-[var(--vestara-status-success)]', bg: 'bg-[var(--vestara-status-success-bg)]', text: 'text-[var(--vestara-status-success)]', label: 'Active' },
  parked: { dot: 'bg-[var(--vestara-status-warning)]', bg: 'bg-[var(--vestara-status-warning-bg)]', text: 'text-[var(--vestara-status-warning)]', label: 'Parked' },
  experimental: { dot: 'bg-[var(--vestara-status-info)]', bg: 'bg-[var(--vestara-status-info-bg)]', text: 'text-[var(--vestara-status-info)]', label: 'Experimental' },
  unknown: { dot: 'bg-[var(--vestara-status-unknown)]', bg: 'bg-[var(--vestara-status-unknown)]/10', text: 'text-[var(--vestara-text-muted)]', label: 'Unknown' },
};

const HEALTH_CONFIG: Record<string, { text: string; icon: string }> = {
  verified: { text: 'text-[var(--vestara-status-success)]', icon: '✓' },
  pass: { text: 'text-[var(--vestara-status-success)]', icon: '✓' },
  fail: { text: 'text-[var(--vestara-status-error)]', icon: '✕' },
  degraded: { text: 'text-[var(--vestara-status-warning)]', icon: '⚠' },
  unknown: { text: 'text-[var(--vestara-text-muted)]', icon: '?' },
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

type SortId = 'Name' | 'Status' | 'Category';
type ViewId = 'List' | 'Grid';

// ─── Status Dot ─────────────────────────────────────────────────

function StatusDot({ state }: { state: string }) {
  const accent = STATE_ACCENT[state] ?? 'var(--vestara-accent)';
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ background: accent, boxShadow: `0 0 6px ${accent}` }}
      aria-hidden="true"
    />
  );
}

// ─── Capability Row ─────────────────────────────────────────────

function CapabilityRow({
  cap,
  selected,
  onSelect,
  index = 0,
}: {
  cap: CapabilityCatalogEntry;
  selected: boolean;
  onSelect: (cap: CapabilityCatalogEntry) => void;
  index?: number;
}) {
  const state = STATE_CONFIG[cap.parkingState] ?? STATE_CONFIG.unknown;
  const health = HEALTH_CONFIG[cap.health] ?? HEALTH_CONFIG.unknown;
  const icon = CATEGORY_ICONS[cap.category] ?? CATEGORY_ICONS.other ?? '·';
  const accent = STATE_ACCENT[cap.parkingState] ?? 'var(--vestara-accent)';

  return (
    <div
      onClick={() => onSelect(cap)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(cap);
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`View ${cap.name} details`}
      className={`mpg-card mpg-enter group relative flex cursor-pointer items-center gap-3 px-3 py-3 ${selected ? 'mpg-cap-row-selected' : ''}`}
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
    >
      <span className="mpg-card-accent" style={{ background: accent }} aria-hidden="true" />
      <StatusDot state={cap.parkingState} />
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] font-mono text-[length:var(--vestara-font-size-sm)] text-[var(--vestara-text-secondary)]">
        {icon}
      </div>
      <div className="relative z-[2] min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[length:var(--vestara-font-size-sm)] font-medium tracking-tight text-[var(--vestara-text-primary)]">
            {cap.name}
          </span>
          <span className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
            /{cap.id}
          </span>
          {cap.packages.length > 0 && (
            <span className="rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-1 py-0 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
              {cap.packages.length} pkg{cap.packages.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {cap.description && (
          <p className="mt-0.5 truncate font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
            {cap.description}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-1.5 py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] uppercase tracking-wide text-[var(--vestara-text-muted)]">
            {cap.category}
          </span>
          <span className="rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-1.5 py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
            {cap.activation}
          </span>
          <span className={`inline-flex items-center gap-1 rounded border border-[var(--vestara-border-subtle)] px-1.5 py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] ${health.text}`}>
            {health.icon} {cap.health}
          </span>
        </div>
      </div>
      <div className="relative z-[2] hidden shrink-0 items-center gap-1 md:flex">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] font-medium ${state.bg} ${state.text}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${state.dot}`} />
          {state.label}
        </span>
        <span className={`ml-1 transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <Button
            variant="secondary"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(cap);
            }}
            aria-label={`View ${cap.name} details`}
          >
            View
          </Button>
        </span>
      </div>
      <div className="relative z-[2] ml-auto flex shrink-0 flex-col items-end gap-1 md:hidden">
        <span className={`rounded border px-1.5 py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] ${state.bg} ${state.text}`}>
          {state.label}
        </span>
      </div>
    </div>
  );
}

// ─── Detail Drawer ──────────────────────────────────────────────

function CapabilityDrawer({ cap, onClose }: { cap: CapabilityCatalogEntry; onClose: () => void }) {
  const state = STATE_CONFIG[cap.parkingState] ?? STATE_CONFIG.unknown;
  const health = HEALTH_CONFIG[cap.health] ?? HEALTH_CONFIG.unknown;
  const icon = CATEGORY_ICONS[cap.category] ?? CATEGORY_ICONS.other ?? '·';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const close = useCallback(() => {
    setVisible(false);
    window.setTimeout(onClose, 200);
  }, [onClose]);

  return (
    <>
      <button
        type="button"
        aria-label="Close capability details"
        onClick={close}
        className={`mpg-cap-backdrop ${visible ? 'mpg-cap-backdrop-visible' : ''}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${cap.name} details`}
        className={`mpg-cap-drawer ${visible ? 'mpg-cap-drawer-visible' : ''}`}
      >
        <div className="shrink-0 border-b border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] font-mono text-[length:var(--vestara-font-size-lg)] text-[var(--vestara-text-primary)]">
                {icon}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[length:var(--vestara-font-size-base)] font-semibold text-[var(--vestara-text-primary)]">
                    {cap.name}
                  </h3>
                  <StatusDot state={cap.parkingState} />
                  <span className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                    {state.label}
                  </span>
                </div>
                <div className="mt-1 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                  /{cap.id}
                </div>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={close} aria-label="Close details">
              ✕
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          {cap.description && (
            <section>
              <h4 className="mb-2 text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
                Description
              </h4>
              <p className="text-[length:var(--vestara-font-size-sm)] leading-relaxed text-[var(--vestara-text-secondary)]">
                {cap.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant="default" size="md">{cap.category}</Badge>
                <Badge variant="default" size="md">{cap.activation}</Badge>
                <span className={`inline-flex items-center gap-1 rounded-full border border-[var(--vestara-border-subtle)] px-2 py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] ${health.text}`}>
                  {health.icon} {cap.health}
                </span>
              </div>
              <div className="mt-3">
                <Link
                  to={`/marketplace/discover?capability=${encodeURIComponent(cap.id)}`}
                  className="mpg-link"
                  title={`Find Marketplace assets matching ${cap.name}`}
                >
                  Find in Marketplace →
                </Link>
              </div>
            </section>
          )}

          <section className="grid grid-cols-2 gap-3 text-[length:var(--vestara-font-size-sm)]">
            <div>
              <span className="text-[length:var(--vestara-font-size-xs)] font-medium text-[var(--vestara-text-muted)]">Category</span>
              <div className="mt-1 text-[var(--vestara-text-primary)]">{cap.category}</div>
            </div>
            <div>
              <span className="text-[length:var(--vestara-font-size-xs)] font-medium text-[var(--vestara-text-muted)]">Requirement</span>
              <div className="mt-1 text-[var(--vestara-text-primary)]">{cap.requirement}</div>
            </div>
            <div>
              <span className="text-[length:var(--vestara-font-size-xs)] font-medium text-[var(--vestara-text-muted)]">Activation</span>
              <div className="mt-1 text-[var(--vestara-text-primary)]">{cap.activation}</div>
            </div>
            <div>
              <span className="text-[length:var(--vestara-font-size-xs)] font-medium text-[var(--vestara-text-muted)]">Health</span>
              <div className={`mt-1 ${health.text}`}>{health.icon} {cap.health}</div>
            </div>
          </section>

          {cap.packages.length > 0 && (
            <section>
              <h4 className="mb-2 text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
                Packages ({cap.packages.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {cap.packages.map((pkg) => (
                  <Link
                    key={pkg}
                    to={`/marketplace/discover?q=${encodeURIComponent(pkg)}`}
                    title={`Search Marketplace for ${pkg}`}
                  >
                    <Badge variant="default" size="md">{pkg}</Badge>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <h4 className="mb-2 text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
              Dependencies ({cap.dependencies.length})
            </h4>
            {cap.dependencies.length === 0 ? (
              <p className="font-mono text-[length:var(--vestara-font-size-xs)] italic text-[var(--vestara-text-muted)]">
                No dependencies — root capability
              </p>
            ) : (
              <ul className="space-y-1.5">
                {cap.dependencies.map((dep) => (
                  <li
                    key={dep}
                    className="rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-2.5 py-2 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)]"
                  >
                    {dep}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {cap.documentation && cap.documentation.length > 0 && (
            <section>
              <h4 className="mb-2 text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
                Documentation
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {cap.documentation.map((doc) => (
                  <Badge key={doc} variant="default" size="md">{doc}</Badge>
                ))}
              </div>
            </section>
          )}

          {cap.evidence && cap.evidence.length > 0 && (
            <section>
              <h4 className="mb-2 text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
                Evidence
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {cap.evidence.map((ev) => (
                  <Badge key={ev} variant="default" size="md">{ev}</Badge>
                ))}
              </div>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────────────

export default function Capabilities() {
  const [catalog, setCatalog] = useState<CapabilityCatalog | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState<ViewId>('List');
  const [sort, setSort] = useState<SortId>('Name');
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

  // V toggles List/Grid, R refreshes — ignored while typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (event.key === 'v' || event.key === 'V') setView((v) => (v === 'List' ? 'Grid' : 'List'));
      if (event.key === 'r' || event.key === 'R') void load();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [load]);

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  const statusOptions = useMemo(() => {
    const present = new Set((catalog?.capabilities ?? []).map((cap) => cap.parkingState));
    return (['active', 'parked', 'experimental', 'unknown'] as const).filter((s) => present.has(s));
  }, [catalog]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cap of catalog?.capabilities ?? []) counts.set(cap.category, (counts.get(cap.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalog]);

  const filtered = useMemo(() => {
    const list = (catalog?.capabilities ?? []).filter((cap) => {
      if (status !== 'all' && cap.parkingState !== status) return false;
      if (categories.size > 0 && !categories.has(cap.category)) return false;
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
    });
    return [...list].sort((a, b) => {
      if (sort === 'Status') return a.parkingState.localeCompare(b.parkingState) || a.name.localeCompare(b.name);
      if (sort === 'Category') return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [catalog, search, status, categories, sort]);

  const groups = useMemo(() => {
    const map = new Map<string, CapabilityCatalogEntry[]>();
    for (const cap of filtered) {
      const list = map.get(cap.category) ?? [];
      list.push(cap);
      map.set(cap.category, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const toggleSet = useCallback((setter: (next: Set<string>) => void, current: Set<string>, value: string) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatus('all');
    setCategories(new Set());
  }, []);

  const openDetail = useCallback((cap: CapabilityCatalogEntry) => {
    setSelectedId(cap.id);
    setDrawerOpen(true);
  }, []);

  const closeDetail = useCallback(() => setDrawerOpen(false), []);

  const selected = useMemo(
    () => (catalog?.capabilities ?? []).find((cap) => cap.id === selectedId) ?? null,
    [catalog, selectedId],
  );

  const summary = catalog?.summary;

  return (
    <MarketplacePage
      title="Capabilities"
      description="Inspect Vestara's capability inventory — what's active, parked, and available."
      hideHeader
    >
      {error && <InsightBanner severity="error" description={error} />}

      {summary && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3" aria-label="Capability summary">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[length:var(--vestara-font-size-lg)] font-semibold leading-none text-[var(--vestara-text-primary)]">
              {summary.total}
            </span>
            <span className="text-[length:var(--vestara-font-size-xs)] uppercase tracking-widest text-[var(--vestara-text-muted)]">
              Total
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[length:var(--vestara-font-size-lg)] font-semibold leading-none text-[var(--vestara-status-success)]">
              {summary.active}
            </span>
            <span className="text-[length:var(--vestara-font-size-xs)] uppercase tracking-widest text-[var(--vestara-text-muted)]">
              Active
            </span>
            <StatusDot state="active" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[length:var(--vestara-font-size-lg)] font-semibold leading-none text-[var(--vestara-status-warning)]">
              {summary.parked}
            </span>
            <span className="text-[length:var(--vestara-font-size-xs)] uppercase tracking-widest text-[var(--vestara-text-muted)]">
              Parked
            </span>
            <StatusDot state="parked" />
          </div>
          <div className="hidden h-4 w-px bg-[var(--vestara-border-subtle)] sm:block" aria-hidden="true" />
          <div className="flex items-center gap-4 font-mono text-[length:var(--vestara-font-size-xs)]">
            {summary.experimental > 0 && (
              <span className="text-[var(--vestara-text-muted)]">
                <span className="font-medium text-[var(--vestara-status-info)]">{summary.experimental}</span> Experimental
              </span>
            )}
            <span className="text-[var(--vestara-text-muted)]">
              <span className="font-medium text-[var(--vestara-text-secondary)]">{filtered.length}</span> filtered • {groups.length} groups
            </span>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-col gap-4 lg:flex-row">
        <aside
          className="w-full shrink-0 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:w-[280px] lg:self-start lg:overflow-y-auto"
          aria-label="Capability filters"
        >
          <div className="space-y-6 p-4">
            <div>
              <label
                className="mb-2 block text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]"
                htmlFor="capability-search"
              >
                Search
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--vestara-text-muted)]" aria-hidden="true">
                  ⌕
                </span>
                <input
                  id="capability-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="name, id, description…"
                  className="w-full rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] py-2 pl-8 pr-8 font-mono text-[length:var(--vestara-font-size-sm)] text-[var(--vestara-text-primary)] placeholder:text-[var(--vestara-text-disabled)] focus:border-[var(--vestara-marketplace-primary-border)] focus:outline-none"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-secondary)]"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
                  Status
                </span>
                <button
                  type="button"
                  onClick={() => setStatus('all')}
                  className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-secondary)]"
                >
                  reset
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {['all', ...statusOptions].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setStatus(option)}
                    aria-pressed={status === option}
                    className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-left font-mono text-[length:var(--vestara-font-size-xs)] transition ${
                      status === option
                        ? 'border-[var(--vestara-marketplace-primary-border)] bg-[var(--vestara-marketplace-primary-bg)] text-[var(--vestara-text-primary)]'
                        : 'border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-secondary)]'
                    }`}
                  >
                    {option !== 'all' && <StatusDot state={option} />}
                    {option === 'all' ? 'All' : (STATE_CONFIG[option]?.label ?? option)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-2 block text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
                Category
              </span>
              <ul className="space-y-1">
                {categoryCounts.map(([category, count]) => {
                  const checked = categories.has(category);
                  return (
                    <li key={category}>
                      <label
                        className={`flex cursor-pointer items-center justify-between rounded px-2 py-1 text-[length:var(--vestara-font-size-xs)] transition ${
                          checked
                            ? 'bg-[var(--vestara-marketplace-primary-bg)] text-[var(--vestara-text-primary)]'
                            : 'text-[var(--vestara-text-muted)] hover:bg-[var(--vestara-accent-bg)] hover:text-[var(--vestara-text-secondary)]'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSet(setCategories, categories, category)}
                            className="h-3 w-3 rounded border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] accent-[var(--vestara-marketplace-primary)]"
                          />
                          {category}
                        </span>
                        <span className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-disabled)]">
                          {count}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="border-t border-[var(--vestara-border-subtle)] pt-3">
              <button
                type="button"
                onClick={clearFilters}
                className="w-full rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] py-2 font-mono text-[length:var(--vestara-font-size-xs)] uppercase tracking-widest text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-primary)]"
              >
                Clear filters
              </button>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--vestara-border-subtle)] px-1 py-2.5">
            <div className="flex items-center gap-3 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
              <span>
                Showing <span className="font-medium text-[var(--vestara-text-primary)]">{filtered.length}</span> / {catalog?.capabilities.length ?? 0}
              </span>
              <span className="hidden h-3 w-px bg-[var(--vestara-border-subtle)] sm:inline-block" aria-hidden="true" />
              <span className="hidden sm:inline">
                {groups.length} groups • {view} view
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="flex items-center overflow-hidden rounded-[var(--vestara-radius)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)]"
                role="group"
                aria-label="Change view"
              >
                {(['List', 'Grid'] as ViewId[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setView(option)}
                    aria-pressed={view === option}
                    className={`border-r border-[var(--vestara-border-subtle)] px-2.5 py-1 font-mono text-[length:var(--vestara-font-size-xs)] font-medium transition last:border-0 ${
                      view === option
                        ? 'bg-[var(--vestara-marketplace-primary-bg)] text-[var(--vestara-marketplace-primary)]'
                        : 'text-[var(--vestara-text-muted)] hover:text-[var(--vestara-text-secondary)]'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <label className="hidden items-center gap-1.5 sm:flex">
                <span className="text-[length:var(--vestara-font-size-xs)] uppercase tracking-widest text-[var(--vestara-text-disabled)]">
                  Sort
                </span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortId)}
                  aria-label="Sort capabilities"
                  className="rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-2 py-1 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)] focus:outline-none"
                >
                  {(['Name', 'Status', 'Category'] as SortId[]).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading} aria-label="Refresh capabilities">
                <span className={loading ? 'animate-spin' : ''} aria-hidden="true">↻</span> Refresh
              </Button>
            </div>
          </div>

          <div className="space-y-8 py-4">
            {loading && <AssetGridSkeleton count={6} />}
            {!loading && filtered.length === 0 && (
              <MarketplaceEmptyState message="No capabilities match the current filters. Try clearing search or adjusting status/category." />
            )}
            {!loading &&
              groups.map(([group, members]) => {
                const isCollapsed = collapsed.has(group);
                const activeCount = members.filter((cap) => cap.parkingState === 'active').length;
                return (
                  <section key={group} aria-label={`${group} capabilities`}>
                    <button
                      type="button"
                      onClick={() => toggleSet(setCollapsed, collapsed, group)}
                      aria-expanded={!isCollapsed}
                      className="group flex w-full items-center justify-between py-2"
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className="flex h-5 w-5 items-center justify-center rounded border text-[length:var(--vestara-font-size-xs)] transition"
                          style={
                            isCollapsed
                              ? { borderColor: 'var(--vestara-border-subtle)', color: 'var(--vestara-text-muted)' }
                              : {
                                  borderColor: 'var(--vestara-marketplace-primary-border)',
                                  color: 'var(--vestara-marketplace-primary)',
                                  background: 'var(--vestara-marketplace-primary-bg)',
                                }
                          }
                          aria-hidden="true"
                        >
                          {isCollapsed ? '›' : '⌄'}
                        </span>
                        <span className="text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-secondary)]">
                          {group}
                        </span>
                        <span className="rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-1.5 py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                          {members.length}
                        </span>
                        <span className="hidden items-center gap-1.5 md:flex">
                          {activeCount > 0 && <StatusDot state="active" />}
                          <span className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-disabled)]">
                            {activeCount} active
                          </span>
                        </span>
                      </span>
                      <span className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-disabled)] group-hover:text-[var(--vestara-text-muted)]">
                        {isCollapsed ? 'expand' : 'collapse'}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div className={`mt-3 ${view === 'Grid' ? 'grid grid-cols-1 gap-2.5 md:grid-cols-2' : 'space-y-2'}`}>
                        {members.map((cap, i) => (
                          <CapabilityRow
                            key={cap.id}
                            cap={cap}
                            selected={selectedId === cap.id}
                            onSelect={openDetail}
                            index={i}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
          </div>

          <div className="flex flex-wrap gap-4 border-t border-[var(--vestara-border-subtle)] px-1 py-4 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-disabled)]">
            <span>V toggle view • R refresh</span>
            <span className="ml-auto">vestara capability inventory • deterministic</span>
          </div>
        </div>
      </div>

      {drawerOpen && selected && <CapabilityDrawer cap={selected} onClose={closeDetail} />}
      {selected && !drawerOpen && (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="fixed bottom-4 right-4 z-30 flex items-center gap-1.5 rounded-full bg-[var(--vestara-marketplace-primary)] px-3 py-2 font-mono text-[length:var(--vestara-font-size-xs)] font-medium text-[var(--vestara-on-accent)] lg:hidden"
          aria-label={`Reopen ${selected.name} details`}
        >
          {selected.name}
        </button>
      )}
    </MarketplacePage>
  );
}

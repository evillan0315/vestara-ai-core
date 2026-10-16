/**
 * Marketplace — UI Components.
 *
 * Component library browser restructured around grouped, filterable
 * browsing (matching the Capabilities tab): stats strip → filter sidebar +
 * main column (toolbar, collapsible group sections, component rows) →
 * slide-over detail drawer with the live preview. The shared UI / tokens /
 * primitives packages surface as a final collapsible section.
 *
 * Data: the @vestara/ui-components catalog is the source of truth for the
 * gallery (search/group/category are client-side filters over it); the
 * shared packages are live registry assets with UI_COMPONENT_FIXTURES as
 * the fallback reference examples. Tokens: only var(--vestara-*) via
 * marketplace.css + the shared mpg-* gallery grammar.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button } from '@vestara/ui';
import type { MarketplaceAsset } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import {
  AssetCard,
  AssetGridSkeleton,
  assetMatchesCategory,
  displayForLiveAsset,
  InsightBanner,
  MarketplaceEmptyState,
  MarketplacePage,
  MarketplaceStatPill,
  UI_COMPONENT_FIXTURES,
  type DiscoverDisplayMeta,
  type NavigateHandler,
} from '@vestara/marketplace-ui';
import {
  type UiComponentEntry,
  type UiComponentGroup,
  UI_COMPONENT_CATALOG,
  UI_COMPONENT_COUNT,
  UI_COMPONENT_GROUPS,
} from '@vestara/ui-components';
import { COMPONENT_PREVIEWS } from './components/ComponentPreviews.js';

const UI_FIXTURE_ASSETS: MarketplaceAsset[] = UI_COMPONENT_FIXTURES.map((fixture) => fixture.asset as MarketplaceAsset);

/** Synthetic group key for the shared-packages section. */
const PACKAGES_GROUP = '__packages';

type SortId = 'Name' | 'Category' | 'Group';
type ViewId = 'List' | 'Grid';

// ─── Category Config (token-bound) ──────────────────────────────

const CATEGORY_ACCENT: Record<UiComponentEntry['category'], string> = {
  code: 'var(--vestara-marketplace-module)',
  docs: 'var(--vestara-marketplace-provider)',
  config: 'var(--vestara-marketplace-standards)',
  data: 'var(--vestara-marketplace-skill)',
  ui: 'var(--vestara-marketplace-theme)',
};

const CATEGORY_ICONS: Record<string, string> = {
  code: '</>',
  docs: '▤',
  config: '⚙',
  data: '▦',
  ui: '◧',
};

const CATEGORY_ORDER: UiComponentEntry['category'][] = ['ui', 'code', 'docs', 'config', 'data'];

// ─── Component Row ──────────────────────────────────────────────

function ComponentRow({
  entry,
  groupLabel,
  selected,
  onSelect,
  index = 0,
}: {
  entry: UiComponentEntry;
  groupLabel: string;
  selected: boolean;
  onSelect: (entry: UiComponentEntry) => void;
  index?: number;
}) {
  const accent = CATEGORY_ACCENT[entry.category] ?? 'var(--vestara-accent)';
  const icon = CATEGORY_ICONS[entry.category] ?? '◇';

  return (
    <div
      onClick={() => onSelect(entry)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(entry);
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Preview ${entry.name}`}
      className={`mpg-card mpg-enter group relative flex cursor-pointer items-center gap-3 px-3 py-3 ${selected ? 'mpg-cap-row-selected' : ''}`}
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
    >
      <span className="mpg-card-accent" style={{ background: accent }} aria-hidden="true" />
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] font-mono text-[length:var(--vestara-font-size-sm)] text-[var(--vestara-text-secondary)]">
        {icon}
      </div>
      <div className="relative z-[2] min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[length:var(--vestara-font-size-sm)] font-medium tracking-tight text-[var(--vestara-text-primary)]">
            {entry.name}
          </span>
          <span className="font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
            /{entry.id}
          </span>
        </div>
        <p className="mt-0.5 truncate font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
          {entry.description}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-1.5 py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] uppercase tracking-wide text-[var(--vestara-text-muted)]">
            {entry.category}
          </span>
          <span className="rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-1.5 py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
            {groupLabel}
          </span>
        </div>
      </div>
      <div className="relative z-[2] hidden shrink-0 items-center gap-1 md:flex">
        <span className={`transition-opacity ${selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <Button
            variant="secondary"
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onSelect(entry);
            }}
            aria-label={`Preview ${entry.name}`}
          >
            Preview
          </Button>
        </span>
      </div>
    </div>
  );
}

// ─── Detail Drawer ──────────────────────────────────────────────

function ComponentDrawer({ entry, onClose }: { entry: UiComponentEntry; onClose: () => void }) {
  const icon = CATEGORY_ICONS[entry.category] ?? '◇';
  const group = UI_COMPONENT_GROUPS.find((g) => g.id === entry.group);
  const Preview = COMPONENT_PREVIEWS[entry.id];
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
        aria-label="Close component preview"
        onClick={close}
        className={`mpg-cap-backdrop ${visible ? 'mpg-cap-backdrop-visible' : ''}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${entry.name} details`}
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
                    {entry.name}
                  </h3>
                  <Badge variant="default" size="md">
                    {entry.category}
                  </Badge>
                </div>
                <div className="mt-1 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                  /{entry.id}
                </div>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={close} aria-label="Close details">
              ✕
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          <section>
            <h4 className="mb-2 text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
              Description
            </h4>
            <p className="text-[length:var(--vestara-font-size-sm)] leading-relaxed text-[var(--vestara-text-secondary)]">
              {entry.description}
            </p>
          </section>

          <section className="grid grid-cols-2 gap-3 text-[length:var(--vestara-font-size-sm)]">
            <div>
              <span className="text-[length:var(--vestara-font-size-xs)] font-medium text-[var(--vestara-text-muted)]">
                Group
              </span>
              <div className="mt-1 text-[var(--vestara-text-primary)]">{group?.label ?? entry.group}</div>
            </div>
            <div>
              <span className="text-[length:var(--vestara-font-size-xs)] font-medium text-[var(--vestara-text-muted)]">
                Category
              </span>
              <div className="mt-1 text-[var(--vestara-text-primary)]">{entry.category}</div>
            </div>
            <div>
              <span className="text-[length:var(--vestara-font-size-xs)] font-medium text-[var(--vestara-text-muted)]">
                Export
              </span>
              <div className="mt-1 font-mono text-[var(--vestara-text-primary)]">{entry.id}</div>
            </div>
            <div>
              <span className="text-[length:var(--vestara-font-size-xs)] font-medium text-[var(--vestara-text-muted)]">
                Package
              </span>
              <div className="mt-1 font-mono text-[var(--vestara-text-primary)]">@vestara/ui-components</div>
            </div>
          </section>

          {group?.description && (
            <section>
              <h4 className="mb-2 text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
                {group.label}
              </h4>
              <p className="text-[length:var(--vestara-font-size-sm)] leading-relaxed text-[var(--vestara-text-secondary)]">
                {group.description}
              </p>
            </section>
          )}

          <section>
            <h4 className="mb-2 text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
              Live preview
            </h4>
            <div className="rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] p-4">
              <div className="min-w-0">{Preview ? <Preview /> : null}</div>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────────────

export default function Components() {
  const navigate = useNavigate();
  const handleNavigate: NavigateHandler = useCallback(
    (to, event) => {
      event.preventDefault();
      navigate(to);
    },
    [navigate],
  );

  const [assets, setAssets] = useState<MarketplaceAsset[]>([]);
  const [usingFixtures, setUsingFixtures] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [groups, setGroups] = useState<Set<UiComponentGroup>>(new Set());
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState<ViewId>('List');
  const [sort, setSort] = useState<SortId>('Group');

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const live = await marketplaceClient.listAssets();
      const uiAssets = live.filter((asset) => assetMatchesCategory(asset, 'ui-components'));
      if (uiAssets.length === 0) {
        setAssets(UI_FIXTURE_ASSETS);
        setUsingFixtures(true);
      } else {
        setAssets(uiAssets);
        setUsingFixtures(false);
      }
    } catch (caught) {
      setAssets(UI_FIXTURE_ASSETS);
      setUsingFixtures(true);
      setError(caught instanceof Error ? caught.message : 'Unable to load UI component packages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  // V toggles List/Grid, R refreshes — ignored while typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (event.key === 'v' || event.key === 'V') setView((v) => (v === 'List' ? 'Grid' : 'List'));
      if (event.key === 'r' || event.key === 'R') void loadAssets();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loadAssets]);

  // Lock background scroll while the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of UI_COMPONENT_CATALOG) counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    return CATEGORY_ORDER.filter((category) => counts.has(category)).map(
      (category) => [category, counts.get(category) ?? 0] as const,
    );
  }, []);

  const filtered = useMemo(() => {
    const list = UI_COMPONENT_CATALOG.filter((entry) => {
      if (groups.size > 0 && !groups.has(entry.group)) return false;
      if (categories.size > 0 && !categories.has(entry.category)) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          entry.name.toLowerCase().includes(q) ||
          entry.id.toLowerCase().includes(q) ||
          entry.description.toLowerCase().includes(q) ||
          entry.category.toLowerCase().includes(q) ||
          entry.group.toLowerCase().includes(q)
        );
      }
      return true;
    });
    return [...list].sort((a, b) => {
      if (sort === 'Category') return a.category.localeCompare(b.category) || a.name.localeCompare(b.name);
      if (sort === 'Group') return a.group.localeCompare(b.group) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [search, groups, categories, sort]);

  const grouped = useMemo(() => {
    const map = new Map<UiComponentGroup, UiComponentEntry[]>();
    for (const entry of filtered) {
      const list = map.get(entry.group) ?? [];
      list.push(entry);
      map.set(entry.group, list);
    }
    return UI_COMPONENT_GROUPS.filter((group) => map.has(group.id)).map(
      (group) => [group, map.get(group.id) ?? []] as const,
    );
  }, [filtered]);

  const displayByPackage = useMemo(() => {
    const map = new Map<string, DiscoverDisplayMeta>();
    for (const fixture of UI_COMPONENT_FIXTURES) map.set(fixture.asset.packageName, fixture.display);
    for (const asset of assets) {
      if (!map.has(asset.packageName)) map.set(asset.packageName, displayForLiveAsset(asset));
    }
    return map;
  }, [assets]);

  const toggleSet = useCallback(<T,>(setter: (next: Set<T>) => void, current: Set<T>, value: T) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch('');
    setGroups(new Set());
    setCategories(new Set());
  }, []);

  const openDetail = useCallback((entry: UiComponentEntry) => {
    setSelectedId(entry.id);
    setDrawerOpen(true);
  }, []);

  const closeDetail = useCallback(() => setDrawerOpen(false), []);

  const selected = useMemo(
    () => UI_COMPONENT_CATALOG.find((entry) => entry.id === selectedId) ?? null,
    [selectedId],
  );

  const groupLabelFor = useCallback(
    (id: UiComponentGroup) => UI_COMPONENT_GROUPS.find((group) => group.id === id)?.label ?? id,
    [],
  );

  const packagesCollapsed = collapsed.has(PACKAGES_GROUP);

  return (
    <MarketplacePage
      title="UI Components"
      description="The Vestara OS component library and the shared UI, tokens, and primitives packages it is built on."
      hideHeader
    >
      {error && <InsightBanner severity="error" description={error} />}

      <div className="flex flex-wrap items-center gap-2" aria-label="UI component summary">
        <MarketplaceStatPill label="Components" value={UI_COMPONENT_COUNT} />
        <MarketplaceStatPill label="Packages" value={assets.length} />
        <MarketplaceStatPill label="Groups" value={UI_COMPONENT_GROUPS.length} />
        <MarketplaceStatPill label="Showing" value={filtered.length} />
        {usingFixtures && !loading && <MarketplaceStatPill label="Reference examples" value="●" />}
      </div>

      <div className="flex min-h-0 flex-col gap-4 lg:flex-row">
        <aside
          className="w-full shrink-0 rounded-[var(--vestara-radius-lg)] border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:w-[280px] lg:self-start lg:overflow-y-auto"
          aria-label="UI component filters"
        >
          <div className="space-y-6 p-4">
            <div>
              <label
                className="mb-2 block text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]"
                htmlFor="component-search"
              >
                Search
              </label>
              <div className="relative">
                <span
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--vestara-text-muted)]"
                  aria-hidden="true"
                >
                  ⌕
                </span>
                <input
                  id="component-search"
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
              <span className="mb-2 block text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-muted)]">
                Group
              </span>
              <ul className="space-y-1">
                {UI_COMPONENT_GROUPS.map((group) => {
                  const checked = groups.has(group.id);
                  const count = UI_COMPONENT_CATALOG.filter((entry) => entry.group === group.id).length;
                  return (
                    <li key={group.id}>
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
                            onChange={() => toggleSet(setGroups, groups, group.id)}
                            className="h-3 w-3 rounded border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] accent-[var(--vestara-marketplace-primary)]"
                          />
                          {group.label}
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
                Showing <span className="font-medium text-[var(--vestara-text-primary)]">{filtered.length}</span> /{' '}
                {UI_COMPONENT_COUNT}
              </span>
              <span className="hidden h-3 w-px bg-[var(--vestara-border-subtle)] sm:inline-block" aria-hidden="true" />
              <span className="hidden sm:inline">
                {grouped.length} groups • {view} view
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
                  aria-label="Sort components"
                  className="rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-canvas)] px-2 py-1 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-secondary)] focus:outline-none"
                >
                  {(['Group', 'Name', 'Category'] as SortId[]).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadAssets()}
                disabled={loading}
                aria-label="Refresh UI components"
              >
                <span className={loading ? 'animate-spin' : ''} aria-hidden="true">↻</span> Refresh
              </Button>
            </div>
          </div>

          <div className="space-y-8 py-4">
            {loading && <AssetGridSkeleton count={6} />}
            {!loading && filtered.length === 0 && (
              <MarketplaceEmptyState message="No components match the current filters. Try clearing search or adjusting group/category." />
            )}

            {!loading &&
              grouped.map(([group, members]) => {
                const isCollapsed = collapsed.has(group.id);
                return (
                  <section key={group.id} aria-label={`${group.label} components`}>
                    <button
                      type="button"
                      onClick={() => toggleSet(setCollapsed, collapsed, group.id)}
                      aria-expanded={!isCollapsed}
                      className="group flex w-full items-center justify-between py-2"
                    >
                      <span className="flex items-center gap-3">
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded border text-[length:var(--vestara-font-size-xs)] transition ${
                            isCollapsed
                              ? 'border-[var(--vestara-border-subtle)] text-[var(--vestara-text-muted)]'
                              : 'border-[var(--vestara-marketplace-primary-border)] bg-[var(--vestara-marketplace-primary-bg)] text-[var(--vestara-marketplace-primary)]'
                          }`}
                          aria-hidden="true"
                        >
                          {isCollapsed ? '›' : '⌄'}
                        </span>
                        <span className="text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-secondary)]">
                          {group.label}
                        </span>
                        <span className="rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-1.5 py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                          {members.length}
                        </span>
                      </span>
                      <span className="hidden font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-disabled)] group-hover:text-[var(--vestara-text-muted)] sm:inline">
                        {isCollapsed ? 'expand' : 'collapse'}
                      </span>
                    </button>
                    {!isCollapsed && (
                      <div
                        className={
                          view === 'Grid'
                            ? 'mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2'
                            : 'mt-3 space-y-2'
                        }
                      >
                        {members.map((entry, i) => (
                          <ComponentRow
                            key={entry.id}
                            entry={entry}
                            groupLabel={groupLabelFor(entry.group)}
                            selected={selectedId === entry.id}
                            onSelect={openDetail}
                            index={i}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}

            {!loading && assets.length > 0 && (
              <section aria-label="Shared UI packages">
                <button
                  type="button"
                  onClick={() => toggleSet(setCollapsed, collapsed, PACKAGES_GROUP)}
                  aria-expanded={!packagesCollapsed}
                  className="group flex w-full items-center justify-between py-2"
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded border text-[length:var(--vestara-font-size-xs)] transition ${
                        packagesCollapsed
                          ? 'border-[var(--vestara-border-subtle)] text-[var(--vestara-text-muted)]'
                          : 'border-[var(--vestara-marketplace-primary-border)] bg-[var(--vestara-marketplace-primary-bg)] text-[var(--vestara-marketplace-primary)]'
                      }`}
                      aria-hidden="true"
                    >
                      {packagesCollapsed ? '›' : '⌄'}
                    </span>
                    <span className="text-[length:var(--vestara-font-size-xs)] font-semibold uppercase tracking-widest text-[var(--vestara-text-secondary)]">
                      Shared UI, Tokens &amp; Primitives
                    </span>
                    <span className="rounded border border-[var(--vestara-border-subtle)] bg-[var(--vestara-surface-panel)] px-1.5 py-0.5 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">
                      {assets.length}
                    </span>
                  </span>
                  <span className="hidden font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-disabled)] group-hover:text-[var(--vestara-text-muted)] sm:inline">
                    {packagesCollapsed ? 'expand' : 'collapse'}
                  </span>
                </button>
                {!packagesCollapsed && (
                  <div className="mpg-all-grid mt-3">
                    {assets.map((asset, i) => {
                      const display = displayByPackage.get(asset.packageName);
                      return (
                        <AssetCard
                          key={asset.id}
                          to={`/marketplace/assets/${encodeURIComponent(asset.publisherId)}/${encodeURIComponent(asset.packageName)}`}
                          onNavigate={handleNavigate}
                          displayName={asset.displayName}
                          packageName={asset.packageName}
                          publisherId={asset.publisherId}
                          type={asset.type}
                          summary={asset.summary}
                          tags={asset.tags}
                          latestVersion={asset.latestVersion}
                          verified={asset.verification.checksumVerified}
                          index={i}
                          rating={display?.rating}
                          reviews={display?.reviews}
                          installs={display?.installs}
                          glyph={display?.glyph}
                          accentOverride={display?.accent}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>

          <div className="flex flex-wrap gap-4 border-t border-[var(--vestara-border-subtle)] px-1 py-4 font-mono text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-disabled)]">
            <span>V toggle view • R refresh</span>
            <span className="ml-auto">vestara component library • deterministic</span>
          </div>
        </div>
      </div>

      {drawerOpen && selected && <ComponentDrawer entry={selected} onClose={closeDetail} />}
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

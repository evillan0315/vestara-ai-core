/**
 * Marketplace Premium Gallery — Categories.
 *
 * Restructured: the Categories tab shares Discover's canonical taxonomy
 * (`DISCOVER_CATEGORY_FILTERS`) instead of filtering by raw `asset.type`.
 * Category cards carry live counts computed with the same matcher Discover
 * uses, the selection syncs to `?category=<filterId>` so Discover's
 * "View All" links deep-link here, and the asset grid reuses AssetCard
 * display enrichment + sort/search like Discover.
 *
 * Data: live registry first; `DISCOVER_FIXTURES` are fallback design
 * examples used only when the registry returns no assets — never presented
 * as live data. Tokens: only var(--vestara-*) via marketplace.css + the
 * shared mpg-* gallery grammar (no inline visual literals).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { MarketplaceAsset } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import {
  assetMatchesCategory,
  DISCOVER_CATEGORY_FILTERS,
  DISCOVER_FIXTURES,
  displayForLiveAsset,
  type DiscoverDisplayMeta,
} from '@vestara/marketplace-ui';
import {
  AssetCard,
  AssetGridSkeleton,
  MarketplaceEmptyState,
  MarketplaceFilterRow,
  MarketplacePage,
  MarketplaceSection,
  MarketplaceStatPill,
  typeAccent,
  type MarketplaceSortId,
  type NavigateHandler,
} from '@vestara/marketplace-ui';

/** Text glyph per canonical package type (no custom illustrations). */
const CATEGORY_GLYPHS: Record<string, string> = {
  all: '⬣',
  'ui-components': '◧',
  'agent-pack': '❖',
  module: '◈',
  plugin: '</>',
  provider: '◇',
  integration: '➤',
  theme: '▤',
  'verification-pack': '☑',
  'standards-pack': '◉',
  tui: '◧',
};

export default function Categories() {
  const navigate = useNavigate();
  const handleNavigate: NavigateHandler = useCallback(
    (to, event) => {
      event.preventDefault();
      navigate(to);
    },
    [navigate],
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<MarketplaceSortId>('relevant');
  const [assets, setAssets] = useState<MarketplaceAsset[]>([]);
  const [usingFixtures, setUsingFixtures] = useState(false);
  const [loading, setLoading] = useState(true);

  const requested = searchParams.get('category') ?? 'all';
  const selected = DISCOVER_CATEGORY_FILTERS.some((f) => f.id === requested) ? requested : 'all';

  const selectCategory = useCallback(
    (filterId: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (filterId === 'all') next.delete('category');
        else next.set('category', filterId);
        return next;
      });
    },
    [setSearchParams],
  );

  useEffect(() => {
    marketplaceClient
      .listAssets()
      .then((assetList) => {
        if (assetList.length === 0) {
          setAssets(DISCOVER_FIXTURES.map((f) => f.asset));
          setUsingFixtures(true);
        } else {
          setAssets(assetList);
          setUsingFixtures(false);
        }
      })
      .catch(() => {
        setAssets(DISCOVER_FIXTURES.map((f) => f.asset));
        setUsingFixtures(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const displayByPackage = useMemo(() => {
    const map = new Map<string, DiscoverDisplayMeta>();
    for (const fixture of DISCOVER_FIXTURES) map.set(fixture.asset.packageName, fixture.display);
    for (const asset of assets) {
      if (!map.has(asset.packageName)) map.set(asset.packageName, displayForLiveAsset(asset));
    }
    return map;
  }, [assets]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const filter of DISCOVER_CATEGORY_FILTERS) {
      if (filter.id === 'all') map.set('all', assets.length);
      else map.set(filter.id, assets.filter((asset) => assetMatchesCategory(asset, filter.id)).length);
    }
    return map;
  }, [assets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (!assetMatchesCategory(asset, selected)) return false;
      if (!q) return true;
      return (
        `${asset.displayName} ${asset.packageName} ${asset.publisherId} ${asset.summary} ${asset.tags.join(' ')}`
          .toLowerCase()
          .includes(q)
      );
    });
  }, [assets, selected, query]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    switch (sort) {
      case 'name':
        return copy.sort((a, b) => a.displayName.localeCompare(b.displayName));
      case 'newest':
        return copy.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      case 'popular':
        return copy.sort(
          (a, b) => (displayByPackage.get(b.packageName)?.reviews ?? 0) - (displayByPackage.get(a.packageName)?.reviews ?? 0),
        );
      case 'relevant':
      default:
        return copy;
    }
  }, [filtered, sort, displayByPackage]);

  const filters = useMemo(
    () => DISCOVER_CATEGORY_FILTERS.map((f) => ({ id: f.id, label: f.label, active: selected === f.id })),
    [selected],
  );
  const activeLabel = DISCOVER_CATEGORY_FILTERS.find((f) => f.id === selected)?.label ?? 'All';

  return (
    <MarketplacePage
      title="Categories"
      description="Browse assets by curated category — the same taxonomy Discover filters by."
      stats={
        <div className="flex flex-wrap gap-2">
          <MarketplaceStatPill label="Categories" value={DISCOVER_CATEGORY_FILTERS.length - 1} />
          <MarketplaceStatPill label="Assets" value={assets.length} />
          <MarketplaceStatPill label="Showing" value={sorted.length} />
          {usingFixtures && !loading && <MarketplaceStatPill label="Reference examples" value="●" />}
        </div>
      }
    >
      {/* Category overview cards — curated taxonomy with live counts. */}
      <MarketplaceSection title="All Categories">
        <div className="mpg-cat-grid" role="listbox" aria-label="Marketplace categories">
          {DISCOVER_CATEGORY_FILTERS.filter((f) => f.id !== 'all').map((filter) => {
            const count = counts.get(filter.id) ?? 0;
            const active = selected === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => selectCategory(active ? 'all' : filter.id)}
                className={`mpg-cat-card ${active ? 'mpg-cat-card-active' : ''}`}
              >
                <span
                  className="mpg-category-tile mpg-cat-tile"
                  style={{ background: typeAccent(filter.id) }}
                  aria-hidden="true"
                >
                  {CATEGORY_GLYPHS[filter.id] ?? '⬣'}
                </span>
                <span className="mpg-cat-name">{filter.label}</span>
                <span className="mpg-cat-count">
                  {count} item{count === 1 ? '' : 's'}
                </span>
              </button>
            );
          })}
        </div>
      </MarketplaceSection>

      {/* Filter + sort toolbar (same FilterRow contract as Discover). */}
      <MarketplaceFilterRow filters={filters} onFilterChange={selectCategory} sort={sort} onSortChange={setSort} />
      {/* Native category select preserves the single-combobox filter contract (a11y/tests). */}
      <label className="sr-only" htmlFor="categories-type-filter">
        Filter by category
      </label>
      <select
        id="categories-type-filter"
        aria-label="Filter by category"
        value={selected}
        onChange={(event) => selectCategory(event.target.value)}
        className="mpg-native-select sr-only"
      >
        {DISCOVER_CATEGORY_FILTERS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
      <div className="mpg-hero-search mpg-cat-search">
        <span aria-hidden="true">⌕</span>
        <label className="sr-only" htmlFor="categories-search">
          Search within {activeLabel}
        </label>
        <input
          id="categories-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search within ${activeLabel}…`}
        />
      </div>

      <section aria-live="polite">
        {loading ? (
          <AssetGridSkeleton count={6} />
        ) : sorted.length === 0 ? (
          <MarketplaceEmptyState message="No assets in this category. Try a different search or category." />
        ) : (
          <MarketplaceSection
            title={selected === 'all' ? 'All Assets' : activeLabel}
            action={
              <span className="mpg-cat-count">
                {sorted.length} asset{sorted.length === 1 ? '' : 's'}
                {usingFixtures ? ' · reference examples' : ''}
              </span>
            }
          >
            <div className="mpg-all-grid">
              {sorted.map((asset, i) => {
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
          </MarketplaceSection>
        )}
      </section>
    </MarketplacePage>
  );
}

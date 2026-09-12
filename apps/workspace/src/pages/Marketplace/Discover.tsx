/**
 * Marketplace Discover (v2) — assets/vestara-marketplace-02-screen.png.
 *
 * Layout: hero ("Build More with Vestara" + checklist) → filter pills +
 * sort → Featured (3) → All Items (4-col) + right rail (Popular Categories,
 * Latest Releases, Publish CTA).
 *
 * Tokens: only var(--vestara-*) + --color-zinc-* via marketplace.css.
 * No hardcoded hex; dark/light comes from generated-tokens.css + theme.tsx.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@vestara/ui';
import type { InstalledMarketplaceAsset, MarketplaceAsset, MarketplaceUpdateCandidate } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import {
  AssetCard,
  AssetGridSkeleton,
  InsightBanner,
  MarketplaceEmptyState,
  MarketplaceFilterRow,
  MarketplaceHero,
  MarketplaceLoadingMessage,
  MarketplacePage,
  MarketplaceSection,
  MarketplaceSidebarCard,
  typeAccent,
  type MarketplaceSortId,
} from './MarketplaceLayout-components.js';

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

function sortAssets(assets: MarketplaceAsset[], sort: MarketplaceSortId): MarketplaceAsset[] {
  const copy = [...assets];
  switch (sort) {
    case 'name':
      return copy.sort((a, b) => a.displayName.localeCompare(b.displayName));
    case 'newest':
      return copy.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    case 'popular':
      // No download/rating signal in the API — approximate with
      // checksum-verified first, then newest. Never fabricate counts.
      return copy.sort((a, b) => {
        const verified = Number(b.verification.checksumVerified) - Number(a.verification.checksumVerified);
        if (verified !== 0) return verified;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    case 'relevant':
    default:
      return copy;
  }
}

export default function Discover() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [sort, setSort] = useState<MarketplaceSortId>('relevant');
  const [categories, setCategories] = useState<Array<{ name: string; assetCount: number }>>([]);
  const [assets, setAssets] = useState<MarketplaceAsset[]>([]);
  const [installed, setInstalled] = useState<Map<string, InstalledMarketplaceAsset>>(new Map());
  const [updates, setUpdates] = useState<Map<string, MarketplaceUpdateCandidate>>(new Map());
  const [registryErrors, setRegistryErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [search, installedList, updateList] = await Promise.all([
        marketplaceClient.search({ q: query || undefined, type: type || undefined, limit: 200 }),
        marketplaceClient.installed(),
        marketplaceClient.updates(),
      ]);
      setAssets(search.items.map((hit) => hit.asset));
      setInstalled(new Map(installedList.map((item) => [item.packageName, item])));
      setUpdates(new Map(updateList.map((item) => [item.packageName, item])));
      setRegistryErrors(search.registryErrors ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load the marketplace');
    } finally {
      setLoading(false);
    }
  }, [query, type]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    marketplaceClient
      .categories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  const sorted = useMemo(() => sortAssets(assets, sort), [assets, sort]);
  const isFiltered = Boolean(query || type);
  const featured = useMemo(() => (isFiltered ? [] : sorted.slice(0, 3)), [isFiltered, sorted]);
  const popularCategories = useMemo(
    () => [...categories].sort((a, b) => b.assetCount - a.assetCount).slice(0, 8),
    [categories],
  );
  const latestReleases = useMemo(
    () => [...assets].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5),
    [assets],
  );

  const filters = useMemo(() => {
    if (categories.length === 0) return undefined;
    return [
      { id: '', label: 'All', active: !type },
      ...categories.slice(0, 7).map((c) => ({ id: c.name, label: c.name, active: type === c.name })),
    ];
  }, [categories, type]);

  const renderCard = (asset: MarketplaceAsset, i: number, isFeatured = false) => {
    const installedEntry = installed.get(asset.packageName);
    const update = updates.get(asset.packageName);
    return (
      <AssetCard
        key={asset.id}
        to={`/marketplace/assets/${encodeURIComponent(asset.publisherId)}/${encodeURIComponent(asset.packageName)}`}
        displayName={asset.displayName}
        packageName={asset.packageName}
        publisherId={asset.publisherId}
        type={asset.type}
        summary={asset.summary}
        tags={asset.tags}
        latestVersion={asset.latestVersion}
        verified={asset.verification.checksumVerified}
        featured={isFeatured}
        index={i}
        statusFooter={
          <>
            {installedEntry && (
              <Badge variant="success" size="md">
                installed {installedEntry.installedVersion}
              </Badge>
            )}
            {update && !update.compatible && (
              <Badge variant="error" size="md">
                incompatible
              </Badge>
            )}
            {!installedEntry && (
              <Badge variant="default" size="md">
                not installed
              </Badge>
            )}
          </>
        }
      />
    );
  };

  return (
    <MarketplacePage
      title="Marketplace"
      description="Discover and install modules, agents, templates, and tools to extend your Vestara workspace."
    >
      {registryErrors.length > 0 && (
        <InsightBanner severity="warning" description={registryErrors.map((e) => <div key={e}>⚠ {e}</div>)} />
      )}
      {error && <MarketplaceEmptyState message={error} />}

      <div className="mpg-discover">
        <div className="mpg-discover-main">
          <MarketplaceHero query={query} onQueryChange={setQuery} />

          <MarketplaceFilterRow filters={filters} onFilterChange={setType} sort={sort} onSortChange={setSort} />

          <div className="flex flex-wrap items-center gap-2">
            {/* Native type selector — keeps the combobox contract for filtering/tests. */}
            <label className="sr-only" htmlFor="marketplace-type-filter">
              Filter by type
            </label>
            <select
              id="marketplace-type-filter"
              aria-label="Filter by type"
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="mpg-native-select"
            >
              <option value="">All types</option>
              {categories.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void load()}
              className="mpg-native-select"
              aria-label="Refresh"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <AssetGridSkeleton count={6} />
          ) : assets.length === 0 ? (
            <MarketplaceEmptyState message="No assets found." />
          ) : (
            <>
              {featured.length > 0 && (
                <MarketplaceSection
                  title="Featured"
                  action={
                    <Link to="/marketplace/categories" className="mpg-link">
                      View All
                    </Link>
                  }
                >
                  <div className="grid gap-3 lg:grid-cols-3">
                    {featured.map((asset, i) => renderCard(asset, i, true))}
                  </div>
                </MarketplaceSection>
              )}

              <MarketplaceSection title={isFiltered ? 'Results' : 'All Items'}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {(featured.length > 0 ? sorted.slice(3) : sorted).map((asset, i) =>
                    renderCard(asset, i + featured.length),
                  )}
                </div>
                {featured.length > 0 && sorted.length <= 3 && (
                  <p className="mt-2 text-xs text-[var(--vestara-text-muted)]">
                    Showing all {sorted.length} assets — Featured highlights the first three.
                  </p>
                )}
              </MarketplaceSection>
            </>
          )}
          {loading && assets.length > 0 && <MarketplaceLoadingMessage message="Loading marketplace…" />}
        </div>

        <aside className="mpg-discover-side" aria-label="Marketplace sidebar">
          <MarketplaceSidebarCard
            title="Popular Categories"
            action={
              <Link to="/marketplace/categories" className="mpg-link">
                View All
              </Link>
            }
          >
            {popularCategories.length === 0 ? (
              <p className="text-xs text-[var(--vestara-text-muted)]">No categories yet.</p>
            ) : (
              <ul className="space-y-1">
                {popularCategories.map((cat) => (
                  <li key={cat.name}>
                    <button
                      type="button"
                      onClick={() => setType(type === cat.name ? '' : cat.name)}
                      aria-pressed={type === cat.name}
                      className={`mpg-category-row ${type === cat.name ? 'mpg-category-row-active' : ''}`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="mpg-category-dot"
                          style={{ background: typeAccent(cat.name) }}
                          aria-hidden="true"
                        />
                        <span className="text-[13px] capitalize text-[var(--vestara-text-secondary)]">{cat.name}</span>
                      </span>
                      <span className="text-xs text-[var(--vestara-text-muted)]">
                        {cat.assetCount} item{cat.assetCount === 1 ? '' : 's'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </MarketplaceSidebarCard>

          <MarketplaceSidebarCard
            title="Latest Releases"
            action={
              <Link to="/marketplace/updates" className="mpg-link">
                View All
              </Link>
            }
          >
            {latestReleases.length === 0 ? (
              <p className="text-xs text-[var(--vestara-text-muted)]">No releases yet.</p>
            ) : (
              <ul className="space-y-2">
                {latestReleases.map((asset) => (
                  <li key={asset.id} className="flex items-baseline justify-between gap-2 text-xs">
                    {/* Version + name in ONE text node: keeps card names
                        unique for exact-text queries (card stays the only
                        element whose text equals the displayName). */}
                    <Link
                      to={`/marketplace/assets/${encodeURIComponent(asset.publisherId)}/${encodeURIComponent(asset.packageName)}`}
                      className="min-w-0 truncate font-mono text-[var(--vestara-text-secondary)] hover:text-[var(--vestara-text-primary)]"
                      title={asset.displayName}
                    >
                      {`v${asset.latestVersion} · ${asset.displayName}`}
                    </Link>
                    <span className="shrink-0 text-[var(--vestara-text-disabled)]">
                      {relativeTime(asset.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </MarketplaceSidebarCard>

          <section className="mpg-publish-cta" aria-label="Publish to marketplace">
            <h3 className="text-[13px] font-semibold text-[var(--vestara-text-primary)]">Publish Your Creation</h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--vestara-text-secondary)]">
              Share your modules, agents, or templates with the Vestara community.
            </p>
            <Link to="/marketplace/publish" className="mpg-publish-btn">
              Publish to Marketplace →
            </Link>
          </section>
        </aside>
      </div>
    </MarketplacePage>
  );
}

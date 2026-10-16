/**
 * Marketplace Discover — marketplace-discover-modules-grid.png reference.
 *
 * Layout: page heading → tabs (MarketplaceLayout) → hero row
 * (Build More 3/4 + benefits 1/4) → 2-column body: main
 * (filter toolbar + sort → Featured → All Items) + right sidebar
 * (Popular Categories, Latest Releases, Publish CTA).
 *
 * Data: live registry first; the 11 reference cards and sidebar rows in
 * `@vestara/marketplace-ui` fixtures are fallback design examples used only
 * when the registry returns no assets/categories — never presented as live data.
 *
 * Tokens: only var(--vestara-*) + --color-zinc-* via marketplace.css.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '@vestara/ui';
import type { InstalledMarketplaceAsset, MarketplaceAsset, MarketplaceUpdateCandidate } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import {
  ALL_ITEMS_FIXTURES,
  assetMatchesCategory,
  DISCOVER_CATEGORY_FILTERS,
  DISCOVER_FIXTURES,
  FEATURED_FIXTURES,
  LATEST_RELEASES_FIXTURE,
  normalizePackageType,
  POPULAR_CATEGORIES_FIXTURE,
  displayForLiveAsset,
  type DiscoverDisplayMeta,
} from '@vestara/marketplace-ui';
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
  type NavigateHandler,
} from '@vestara/marketplace-ui';

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

function filterIdForCategoryName(name: string): string {
  const lower = name.toLowerCase();
  const normalized = normalizePackageType(lower);
  const direct = DISCOVER_CATEGORY_FILTERS.find(
    (f) => f.id === normalized || f.label.toLowerCase() === lower || f.match.includes(normalized),
  );
  return direct ? direct.id : 'all';
}

type InstallState = 'installing' | 'installed' | 'error';

export default function Discover() {
  const navigate = useNavigate();
  const handleNavigate: NavigateHandler = useCallback(
    (to, event) => {
      event.preventDefault();
      navigate(to);
    },
    [navigate],
  );
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<MarketplaceSortId>('relevant');
  const [categories, setCategories] = useState<Array<{ name: string; assetCount: number }>>([]);
  const [assets, setAssets] = useState<MarketplaceAsset[]>([]);
  const [usingFixtures, setUsingFixtures] = useState(false);
  const [installed, setInstalled] = useState<Map<string, InstalledMarketplaceAsset>>(new Map());
  const [updates, setUpdates] = useState<Map<string, MarketplaceUpdateCandidate>>(new Map());
  const [installStates, setInstallStates] = useState<Record<string, InstallState>>({});
  const [notice, setNotice] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);
  const [registryErrors, setRegistryErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [search, installedList, updateList] = await Promise.all([
        marketplaceClient.search({ q: query || undefined, limit: 200 }),
        marketplaceClient.installed(),
        marketplaceClient.updates(),
      ]);
      const live = search.items.map((hit) => hit.asset);
      if (live.length === 0) {
        setAssets(DISCOVER_FIXTURES.map((f) => f.asset));
        setUsingFixtures(true);
      } else {
        setAssets(live);
        setUsingFixtures(false);
      }
      setInstalled(new Map(installedList.map((item) => [item.packageName, item])));
      setUpdates(new Map(updateList.map((item) => [item.packageName, item])));
      setRegistryErrors(search.registryErrors ?? []);
    } catch (caught) {
      setAssets(DISCOVER_FIXTURES.map((f) => f.asset));
      setUsingFixtures(true);
      setError(caught instanceof Error ? caught.message : 'Unable to load the marketplace');
    } finally {
      setLoading(false);
    }
  }, [query]);

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

  const displayByPackage = useMemo(() => {
    const map = new Map<string, DiscoverDisplayMeta>();
    for (const fixture of DISCOVER_FIXTURES) map.set(fixture.asset.packageName, fixture.display);
    for (const asset of assets) {
      if (!map.has(asset.packageName)) map.set(asset.packageName, displayForLiveAsset(asset));
    }
    return map;
  }, [assets]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (!assetMatchesCategory(asset, category)) return false;
      if (!q) return true;
      return (
        `${asset.displayName} ${asset.packageName} ${asset.publisherId} ${asset.summary} ${asset.tags.join(' ')}`
          .toLowerCase()
          .includes(q)
      );
    });
  }, [assets, category, query]);

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

  const isDefaultView = category === 'all' && query.trim() === '' && sort === 'relevant';
  const featured = useMemo(() => {
    if (!isDefaultView || sorted.length === 0) return [];
    if (usingFixtures) return FEATURED_FIXTURES.map((f) => f.asset);
    return sorted.slice(0, 3);
  }, [isDefaultView, sorted, usingFixtures]);
  const featuredIds = useMemo(() => new Set(featured.map((a) => a.id)), [featured]);
  const gridAssets = useMemo(() => {
    if (usingFixtures && isDefaultView) return ALL_ITEMS_FIXTURES.map((f) => f.asset);
    return sorted.filter((a) => !featuredIds.has(a.id));
  }, [usingFixtures, isDefaultView, sorted, featuredIds]);

  const popularCategories = useMemo(
    () => [...categories].sort((a, b) => b.assetCount - a.assetCount).slice(0, 8),
    [categories],
  );
  const latestReleases = useMemo(
    () => [...assets].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 5),
    [assets],
  );

  const filters = useMemo(
    () => DISCOVER_CATEGORY_FILTERS.map((f) => ({ id: f.id, label: f.label, active: category === f.id })),
    [category],
  );

  const handleInstall = useCallback(
    async (asset: MarketplaceAsset) => {
      const key = asset.packageName;
      setInstallStates((prev) => ({ ...prev, [key]: 'installing' }));
      setNotice(null);
      try {
        const operation = await marketplaceClient.install({
          reference: `${asset.publisherId}/${asset.packageName}`,
          approved: true,
        });
        if (operation.status === 'failed') throw new Error(operation.error?.message ?? 'Install failed');
        setInstallStates((prev) => ({ ...prev, [key]: 'installed' }));
        setNotice({ severity: 'success', text: `Install started for ${asset.displayName}.` });
        marketplaceClient.installed().then((list) => setInstalled(new Map(list.map((i) => [i.packageName, i])))).catch(() => {});
      } catch (caught) {
        setInstallStates((prev) => ({ ...prev, [key]: 'error' }));
        setNotice({ severity: 'error', text: caught instanceof Error ? caught.message : `Install failed for ${asset.displayName}` });
      }
    },
    [],
  );

  const renderCard = (asset: MarketplaceAsset, i: number, isFeatured = false) => {
    const installedEntry = installed.get(asset.packageName);
    const update = updates.get(asset.packageName);
    const display = displayByPackage.get(asset.packageName);
    const installState: InstallState | 'idle' = installedEntry
      ? 'installed'
      : ((installStates[asset.packageName] ?? 'idle') as InstallState | 'idle');
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
        featured={isFeatured}
        index={i}
        rating={display?.rating}
        reviews={display?.reviews}
        installs={display?.installs}
        glyph={display?.glyph}
        accentOverride={display?.accent}
        onInstall={installedEntry ? undefined : () => void handleInstall(asset)}
        installState={installState === 'idle' ? 'idle' : installState}
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
          </>
        }
      />
    );
  };

  return (
    <MarketplacePage
      title="Marketplace"
      description="Discover and install modules, agents, templates, and tools to extend your Vestara workspace."
      hideHeader
    >
      {registryErrors.length > 0 && (
        <InsightBanner severity="warning" description={registryErrors.map((e) => <div key={e}>⚠ {e}</div>)} />
      )}
      {notice && <InsightBanner severity={notice.severity} description={notice.text} />}
      {error && usingFixtures && assets.length > 0 ? (
        <InsightBanner severity="warning" description={`Live registry unavailable (${error}) — showing reference examples.`} />
      ) : (
        error && <MarketplaceEmptyState message={error} />
      )}

      <div className="mpg-discover">
        <MarketplaceHero query={query} onQueryChange={setQuery} />

        <div className="mpg-discover-body">
          <div className="mpg-discover-main">
            <MarketplaceFilterRow filters={filters} onFilterChange={setCategory} sort={sort} onSortChange={setSort} />
            {/* Native type selector preserves the single-combobox filter contract (a11y/tests). */}
            <label className="sr-only" htmlFor="marketplace-type-filter">
              Filter by type
            </label>
            <select
              id="marketplace-type-filter"
              aria-label="Filter by type"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="mpg-native-select sr-only"
            >
              <option value="all">All types</option>
              {DISCOVER_CATEGORY_FILTERS.filter((f) => f.id !== 'all').map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>

            {loading ? (
              <AssetGridSkeleton count={8} />
            ) : sorted.length === 0 ? (
              <MarketplaceEmptyState message="No assets found. Try a different search or category." />
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
                    <div className="mpg-featured-grid">
                      {featured.map((asset, i) => renderCard(asset, i, true))}
                    </div>
                  </MarketplaceSection>
                )}

                <MarketplaceSection title={isDefaultView ? 'All Items' : 'Results'}>
                  <div className="mpg-all-grid">
                    {gridAssets.map((asset, i) => renderCard(asset, i + featured.length))}
                  </div>
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
                <ul className="mpg-sidebar-category-list">
                  {POPULAR_CATEGORIES_FIXTURE.map((cat) => (
                    <li key={cat.name} aria-label={`${cat.name}, ${cat.items} items`}>
                      <span className="mpg-category-row">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="mpg-category-tile" style={{ background: cat.accent }} aria-hidden="true">
                            {cat.glyph}
                          </span>
                          <span className="mpg-category-name">{cat.name}</span>
                        </span>
                        <span className="mpg-category-count">{cat.items} items</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="mpg-sidebar-category-list">
                  {popularCategories.map((cat) => (
                    <li key={cat.name}>
                      <button
                        type="button"
                        onClick={() => setCategory(filterIdForCategoryName(cat.name))}
                        aria-pressed={category === filterIdForCategoryName(cat.name)}
                        className={`mpg-category-row ${category === filterIdForCategoryName(cat.name) ? 'mpg-category-row-active' : ''}`}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="mpg-category-tile" style={{ background: typeAccent(cat.name) }} aria-hidden="true">
                            ⌘
                          </span>
                          <span className="mpg-category-name capitalize">{cat.name}</span>
                        </span>
                        <span className="mpg-category-count">
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
              {usingFixtures && latestReleases.length > 0 && assets.length > 0 ? (
                <ul className="mpg-release-list">
                  {LATEST_RELEASES_FIXTURE.map((release) => (
                    <li key={`${release.version}-${release.name}`}>
                      <span className="mpg-release-badge">{release.version}</span>
                      <span className="mpg-release-name" title={release.name}>
                        {release.name}
                      </span>
                      <span className="mpg-release-time">
                        {release.daysAgo === 7 ? '1 week ago' : release.daysAgo >= 14 ? '2 weeks ago' : `${release.daysAgo} days ago`}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : latestReleases.length === 0 ? (
                <p className="text-[length:var(--vestara-font-size-xs)] text-[var(--vestara-text-muted)]">No releases yet.</p>
              ) : (
                <ul className="mpg-release-list">
                  {latestReleases.map((asset) => (
                    <li key={asset.id}>
                      <span className="mpg-release-badge">v{asset.latestVersion}</span>
                      <Link
                        to={`/marketplace/assets/${encodeURIComponent(asset.publisherId)}/${encodeURIComponent(asset.packageName)}`}
                        className="mpg-release-name hover:text-[var(--vestara-text-primary)]"
                        title={asset.displayName}
                      >
                        {asset.displayName}
                      </Link>
                      <span className="mpg-release-time">{relativeTime(asset.updatedAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </MarketplaceSidebarCard>

            <section className="mpg-publish-cta" aria-label="Publish to marketplace">
              <div className="flex items-center gap-2">
                <span className="mpg-publish-icon" aria-hidden="true">
                  ◈
                </span>
                <h3 className="text-[length:var(--vestara-font-size-xs)] font-semibold text-[var(--vestara-text-primary)]">Publish Your Creation</h3>
              </div>
              <p className="mt-1.5 text-[length:var(--vestara-font-size-xs)] leading-relaxed text-[var(--vestara-text-secondary)]">
                Share your modules, agents, or templates with the Vestara community.
              </p>
              <Link to="/marketplace/publish" className="mpg-publish-btn">
                Publish to Marketplace →
              </Link>
            </section>
          </aside>
        </div>
      </div>
    </MarketplacePage>
  );
}

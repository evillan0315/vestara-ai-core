/**
 * VES-DESIGN-004A: Marketplace Discover — Premium Landing Surface
 *
 * Migrated to reusable Marketplace composition.
 * Uses MarketplacePage, MarketplaceStatPill, MarketplaceToolbar,
 * MarketplaceSection, MarketplaceEmptyState, MarketplaceLoadingState,
 * MarketplaceErrorState.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { InstalledMarketplaceAsset, MarketplaceAsset, MarketplaceUpdateCandidate } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import {
  MarketplaceEmptyState,
  MarketplaceErrorState,
  MarketplaceLoadingState,
  MarketplacePage,
  MarketplaceSection,
  MarketplaceStatPill,
  MarketplaceToolbar,
} from './MarketplaceLayout-components.js';

// ─── Asset Card ─────────────────────────────────────────────

function AssetCard({
  asset,
  installed,
  update,
}: {
  asset: MarketplaceAsset;
  installed?: InstalledMarketplaceAsset;
  update?: MarketplaceUpdateCandidate;
}) {
  return (
    <Link
      to={`/marketplace/assets/${encodeURIComponent(asset.publisherId)}/${encodeURIComponent(asset.packageName)}`}
      className="block rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-4 transition-all hover:border-sky-600 hover:shadow-lg hover:shadow-sky-900/20"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-zinc-100">{asset.displayName}</span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] px-2 py-0.5 text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
              {asset.type}
            </span>
          </div>
          <div className="mt-0.5 truncate text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
            {asset.packageName}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`text-sm ${asset.verification.checksumVerified ? 'text-emerald-400' : 'text-zinc-600'}`}
            title={asset.verification.checksumVerified ? 'Checksum verified' : 'Not verified'}
          >
            {asset.verification.checksumVerified ? '✓' : '○'}
          </span>
          <span className="text-xs text-zinc-400">{asset.latestVersion}</span>
        </div>
      </div>
      {asset.summary && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[var(--vestara-text-muted,var(--color-zinc-400))]">
          {asset.summary}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {installed && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
              installed.updateStatus === 'update-available'
                ? 'text-amber-300 border-amber-700'
                : 'text-emerald-300 border-emerald-800'
            }`}
          >
            installed {installed.installedVersion}
          </span>
        )}
        {update && !update.compatible && (
          <span className="inline-flex items-center gap-1 rounded-full border border-red-800 px-2 py-0.5 text-xs text-red-300">
            incompatible
          </span>
        )}
        {!installed && (
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] px-2 py-0.5 text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
            available
          </span>
        )}
      </div>
    </Link>
  );
}

// ─── Category Card ──────────────────────────────────────────

function CategoryCard({ name, count }: { name: string; count: number }) {
  return (
    <div className="rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] px-4 py-3 transition-all hover:border-sky-600 cursor-default">
      <div className="font-medium text-sm text-zinc-200">{name}</div>
      <div className="text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
        {count} asset{count !== 1 ? 's' : ''}
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────

export default function Discover() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
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

  const installedCount = installed.size;
  const updateCount = [...updates.values()].filter((u) => u.updateAvailable).length;

  return (
    <MarketplacePage
      title="Discover"
      description="Find, install, and manage engineering assets for your Vestara environment."
      stats={
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MarketplaceStatPill label="Assets" value={assets.length} />
          <MarketplaceStatPill label="Installed" value={installedCount} color="text-emerald-400" />
          {updateCount > 0 && <MarketplaceStatPill label="Updates" value={updateCount} color="text-amber-400" />}
          <MarketplaceStatPill label="Categories" value={categories.length} />
        </div>
      }
      toolbar={
        <MarketplaceToolbar
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder="Search assets by name, publisher, or capability…"
          filters={
            categories.length > 0
              ? [{ id: '', label: 'All types', active: !type }, ...categories.slice(0, 5).map((c) => ({ id: c.name, label: c.name, active: type === c.name }))]
              : undefined
          }
          onFilterChange={setType}
          actions={
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-md border border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] px-3 py-2 text-sm hover:border-[var(--vestara-accent-border)]"
            >
              Refresh
            </button>
          }
        />
      }
    >
      {/* Errors */}
      {registryErrors.length > 0 && (
        <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
          {registryErrors.map((e) => (
            <div key={e}>⚠ {e}</div>
          ))}
        </div>
      )}
      {error && <MarketplaceErrorState message={error} />}

      {/* Content */}
      {loading ? (
        <MarketplaceLoadingState message="Loading marketplace…" />
      ) : assets.length === 0 ? (
        <MarketplaceEmptyState message="No assets found." />
      ) : (
        <>
          {/* Categories section */}
          {categories.length > 0 && !query && !type && (
            <MarketplaceSection title="Categories">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {categories.slice(0, 8).map((cat) => (
                  <CategoryCard key={cat.name} name={cat.name} count={cat.assetCount} />
                ))}
              </div>
            </MarketplaceSection>
          )}

          {/* Assets grid */}
          <MarketplaceSection title={query || type ? 'Results' : 'All Assets'}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {assets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  installed={installed.get(asset.packageName)}
                  update={updates.get(asset.packageName)}
                />
              ))}
            </div>
          </MarketplaceSection>
        </>
      )}
    </MarketplacePage>
  );
}

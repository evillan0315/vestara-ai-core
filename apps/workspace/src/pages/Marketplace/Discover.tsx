import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { InstalledMarketplaceAsset, MarketplaceAsset, MarketplaceUpdateCandidate } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import { button, chip, input, muted, panel } from './styles.js';

const VERIFIED = '✓';
const NOT_VERIFIED = '○';

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
      className={`${panel} block p-4 transition hover:border-sky-700`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{asset.displayName}</span>
            <span className={`${chip} ${muted}`}>{asset.type}</span>
          </div>
          <div className={`truncate text-xs ${muted}`}>{asset.packageName}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span
            className={`text-sm ${asset.verification.checksumVerified ? 'text-emerald-400' : 'text-zinc-600'}`}
            title={asset.verification.checksumVerified ? 'Checksum verified' : 'Not verified'}
          >
            {VERIFIED}
          </span>
          <span className="text-xs text-zinc-300">{asset.latestVersion}</span>
        </div>
      </div>
      <p className={`mt-2 line-clamp-2 text-sm ${muted}`}>{asset.summary}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {installed && (
          <span
            className={`${chip} ${installed.updateStatus === 'update-available' ? 'text-amber-300' : 'text-emerald-300'}`}
          >
            installed {installed.installedVersion}
          </span>
        )}
        {update && !update.compatible && <span className={`${chip} text-red-300`}>incompatible update</span>}
        {!installed && <span className={`${chip} ${muted}`}>not installed</span>}
      </div>
    </Link>
  );
}

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search assets by name, publisher, or capability…"
          className={`${input} max-w-md`}
        />
        <select value={type} onChange={(event) => setType(event.target.value)} className={input + ' max-w-56'}>
          <option value="">All types</option>
          {categories.map((category) => (
            <option key={category.name} value={category.name}>
              {category.name} ({category.assetCount})
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void load()} className={button}>
          Refresh
        </button>
      </div>
      {registryErrors.length > 0 && (
        <div className="text-sm text-amber-300">
          {registryErrors.map((registryError) => (
            <div key={registryError}>⚠ {registryError}</div>
          ))}
        </div>
      )}
      {error && <div className="text-sm text-red-300">{error}</div>}
      {loading ? (
        <div className={`${panel} p-8 text-center text-sm ${muted}`}>Loading marketplace…</div>
      ) : assets.length === 0 ? (
        <div className={`${panel} p-8 text-center text-sm ${muted}`}>No assets found.</div>
      ) : (
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
      )}
    </div>
  );
}

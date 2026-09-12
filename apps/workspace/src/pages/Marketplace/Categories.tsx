/**
 * Marketplace Premium Gallery (v7.14) — Categories.
 *
 * Premium sidebar + asset grid with shared AssetCard, left accents,
 * and staggered entrance.
 */

import { useEffect, useState } from 'react';
import type { MarketplaceAsset } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import {
  AssetCard,
  AssetGridSkeleton,
  MarketplaceEmptyState,
  MarketplacePage,
  MarketplaceSection,
} from './MarketplaceLayout-components.js';

export default function Categories() {
  const [categories, setCategories] = useState<Array<{ name: string; assetCount: number }>>([]);
  const [assets, setAssets] = useState<MarketplaceAsset[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([marketplaceClient.categories(), marketplaceClient.listAssets()])
      .then(([categoryList, assetList]) => {
        setCategories(categoryList);
        setAssets(assetList);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = selected ? assets.filter((asset) => asset.type === selected) : assets;

  return (
    <MarketplacePage
      title="Categories"
      description="Browse assets by category to discover what's available."
    >
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="mpg-card mpg-hairline-top h-fit p-3">
          <div className="relative z-[2]">
            <div className="px-2 pb-2 text-sm font-semibold text-zinc-200">Categories</div>
            {categories.length === 0 && !loading && (
              <div className="px-2 text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                No categories yet.
              </div>
            )}
            {categories.map((category) => (
              <button
                type="button"
                key={category.name}
                onClick={() => setSelected(category.name === selected ? '' : category.name)}
                className={`flex w-full items-center justify-between rounded-full px-3 py-1.5 text-left text-sm transition-all ${
                  category.name === selected
                    ? 'text-white shadow-[0_0_16px_var(--vestara-surface-glow-hover)]'
                    : 'hover:bg-zinc-800 text-[var(--vestara-text-muted,var(--color-zinc-400))]'
                }`}
                style={
                  category.name === selected
                    ? {
                        background: 'color-mix(in srgb, var(--vestara-accent) 22%, transparent)',
                        border: '1px solid var(--vestara-accent-border-hover)',
                      }
                    : undefined
                }
              >
                <span>{category.name}</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] px-2 py-0.5 text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                  {category.assetCount}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section>
          {selected && (
            <div className="mb-3 text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">
              {selected} — {visible.length} asset(s)
            </div>
          )}
          {loading ? (
            <AssetGridSkeleton count={6} />
          ) : visible.length === 0 ? (
            <MarketplaceEmptyState message="No assets in this category." />
          ) : (
            <MarketplaceSection title={selected || 'All Assets'}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visible.map((asset, i) => (
                  <AssetCard
                    key={asset.id}
                    to={`/marketplace/assets/${encodeURIComponent(asset.publisherId)}/${encodeURIComponent(asset.packageName)}`}
                    displayName={asset.displayName}
                    packageName={asset.packageName}
                    type={asset.type}
                    summary={asset.summary}
                    latestVersion={asset.latestVersion}
                    verified={asset.verification.checksumVerified}
                    index={i}
                  />
                ))}
              </div>
            </MarketplaceSection>
          )}
        </section>
      </div>
    </MarketplacePage>
  );
}

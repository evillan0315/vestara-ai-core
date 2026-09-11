/**
 * VES-DESIGN-004A: Categories — Discovery Surface
 *
 * Migrated to reusable Marketplace composition.
 * Preserves sidebar category list + filtered asset grid.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MarketplaceAsset } from '../../lib/marketplace.js';
import { marketplaceClient } from '../../lib/marketplace.js';
import {
  MarketplaceEmptyState,
  MarketplacePage,
  MarketplaceSection,
} from './MarketplaceLayout-components.js';

export default function Categories() {
  const [categories, setCategories] = useState<Array<{ name: string; assetCount: number }>>([]);
  const [assets, setAssets] = useState<MarketplaceAsset[]>([]);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    Promise.all([marketplaceClient.categories(), marketplaceClient.listAssets()])
      .then(([categoryList, assetList]) => {
        setCategories(categoryList);
        setAssets(assetList);
      })
      .catch(() => {});
  }, []);

  const visible = selected ? assets.filter((asset) => asset.type === selected) : assets;

  return (
    <MarketplacePage
      title="Categories"
      description="Browse assets by category to discover what's available."
    >
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Sidebar */}
        <aside className="h-fit rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-3">
          <div className="px-2 pb-2 text-sm font-semibold text-zinc-200">Categories</div>
          {categories.length === 0 && (
            <div className="px-2 text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">
              No categories yet.
            </div>
          )}
          {categories.map((category) => (
            <button
              type="button"
              key={category.name}
              onClick={() => setSelected(category.name === selected ? '' : category.name)}
              className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                category.name === selected
                  ? 'bg-sky-900/40 text-sky-300'
                  : 'hover:bg-zinc-800 text-[var(--vestara-text-muted,var(--color-zinc-400))]'
              }`}
            >
              <span>{category.name}</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] px-2 py-0.5 text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                {category.assetCount}
              </span>
            </button>
          ))}
        </aside>

        {/* Content */}
        <section>
          {selected && (
            <div className="mb-3 text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">
              {selected} — {visible.length} asset(s)
            </div>
          )}
          {visible.length === 0 ? (
            <MarketplaceEmptyState message="No assets in this category." />
          ) : (
            <MarketplaceSection title={selected || 'All Assets'}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visible.map((asset) => (
                  <Link
                    key={asset.id}
                    to={`/marketplace/assets/${encodeURIComponent(asset.publisherId)}/${encodeURIComponent(asset.packageName)}`}
                    className="block rounded-xl border border-[var(--vestara-color-border-subtle,var(--color-zinc-800))] bg-[var(--vestara-color-surface,var(--color-zinc-900))] p-4 transition-all hover:border-sky-600 hover:shadow-md hover:shadow-sky-900/10"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-zinc-100">{asset.displayName}</span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--vestara-color-border-subtle,var(--color-zinc-700))] px-2 py-0.5 text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                        {asset.type}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                      {asset.summary}
                    </p>
                    <div className="mt-2 text-xs text-[var(--vestara-text-muted,var(--color-zinc-400))]">
                      v{asset.latestVersion}
                    </div>
                  </Link>
                ))}
              </div>
            </MarketplaceSection>
          )}
        </section>
      </div>
    </MarketplacePage>
  );
}
